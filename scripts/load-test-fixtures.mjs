import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Temporal } from "@js-temporal/polyfill";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const LOAD_FIXTURE_VERSION = "1";
export const LOAD_SESSION_SCHEMA_VERSION = "1.0.0";
export const LOAD_WORKLOAD_CLASSIFICATIONS = Object.freeze([
  "read",
  "mutation",
]);
export const RUN_ID_PATTERN = /^\d{8}t\d{6}z-[a-f0-9]{12}$/;
export const LOAD_COHORTS = Object.freeze([
  "empty",
  "typical_daily",
  "review_heavy",
  "export_heavy",
  "heavy_schedule",
]);
export const NON_HEAVY_COHORTS = Object.freeze(LOAD_COHORTS.slice(0, 4));
export const MUTATION_COHORTS = Object.freeze([
  "typical_daily",
  "review_heavy",
  "export_heavy",
]);
export const DEFAULT_COHORT_WEIGHTS = Object.freeze({
  empty: 10,
  typical_daily: 60,
  review_heavy: 20,
  export_heavy: 10,
});
export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_ACCOUNT_COUNT = 1;
export const DEFAULT_AUTH_CONCURRENCY = 4;
export const MAX_AUTH_CONCURRENCY = 8;
export const MAX_ACCOUNT_COUNT = 250;
export const MAX_CONTENTION_PAIRS = 8;

const MUTATION_GROWTH_LIMITS = Object.freeze({
  behaviorGrowth: 1,
  scheduleGrowth: 8,
  slotGrowth: 16,
  occurrenceGrowth: 128,
  statusEventGrowth: 2048,
  definitionEventGrowth: 128,
  reminderGrowth: 256,
});

const ENV_FILE = ".env.local";
const DEFAULT_CATEGORY_NAMES = Object.freeze([
  "Medical",
  "Grooming",
  "Fitness",
  "Food / Drink",
  "Home",
  "Measurements",
  "Admin",
  "Other",
]);
const EMAIL_DOMAIN = "@example.invalid";
const EMAIL_PREFIX = "cadence-load-";
const METADATA_FILE = "metadata.json";
const SESSION_FILE = "sessions.json";
const TABLE_SPECS = Object.freeze([
  ["profiles", "id", "id"],
  ["categories", "user_id", "id"],
  ["behaviors", "user_id", "id"],
  ["behavior_definition_events", "user_id", "id"],
  ["behavior_schedules", "user_id", "id"],
  ["behavior_schedule_slots", "user_id", "id"],
  ["occurrences", "user_id", "id"],
  ["reminder_deliveries", "user_id", "id"],
  ["push_subscriptions", "user_id", "id"],
  ["occurrence_status_events", "user_id", "id"],
  ["occurrence_sync_state", "user_id", "user_id"],
  ["behaviorlog_import_runs", "user_id", "id"],
  ["behaviorlog_import_record_mappings", "user_id", "id"],
  ["imported_notes", "user_id", "id"],
  ["imported_interventions", "user_id", "id"],
]);
const COHORT_BEHAVIOR_COUNTS = Object.freeze({
  empty: { active: 0, archived: 0, historyDays: 0, futureDays: 30 },
  typical_daily: {
    active: 10,
    archived: 2,
    historyDays: 30,
    futureDays: 30,
  },
  review_heavy: {
    active: 8,
    archived: 1,
    historyDays: 90,
    futureDays: 30,
  },
  export_heavy: {
    active: 5,
    archived: 2,
    historyDays: 365,
    futureDays: 30,
  },
  heavy_schedule: {
    active: 36,
    archived: 4,
    historyDays: 30,
    futureDays: 30,
  },
});

export class LoadFixtureError extends Error {
  constructor(message) {
    super(message);
    this.name = "LoadFixtureError";
  }
}

export function normalizeFixtureMode(value = "read") {
  const mode = normalizeString(value) ?? "read";
  if (!LOAD_WORKLOAD_CLASSIFICATIONS.includes(mode)) {
    throw new LoadFixtureError(
      "Fixture mode must be exactly read or mutation.",
    );
  }
  return mode;
}

export function validateLoadRunId(value) {
  const runId = normalizeString(value);

  if (!runId || !RUN_ID_PATTERN.test(runId)) {
    throw new LoadFixtureError(
      "CADENCE_LOAD_RUN_ID must use YYYYMMDDtHHMMSSz followed by 12 lowercase hexadecimal characters.",
    );
  }

  try {
    Temporal.PlainDateTime.from(
      {
        year: Number(runId.slice(0, 4)),
        month: Number(runId.slice(4, 6)),
        day: Number(runId.slice(6, 8)),
        hour: Number(runId.slice(9, 11)),
        minute: Number(runId.slice(11, 13)),
        second: Number(runId.slice(13, 15)),
      },
      { overflow: "reject" },
    );
  } catch {
    throw new LoadFixtureError(
      "CADENCE_LOAD_RUN_ID contains an invalid UTC calendar timestamp.",
    );
  }

  return runId;
}

export function validateLocalUrl(value, label) {
  const normalized = normalizeString(value);
  let parsed;

  try {
    parsed = normalized ? new URL(normalized) : null;
  } catch {
    parsed = null;
  }

  if (
    !parsed ||
    parsed.protocol !== "http:" ||
    !isLoopbackHostname(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search ||
    parsed.pathname !== "/"
  ) {
    throw new LoadFixtureError(`${label} must be loopback HTTP.`);
  }

  return parsed.toString().replace(/\/$/, "");
}

export function readLocalSupabaseConfig(
  env = process.env,
  envFilePath = ENV_FILE,
  { requireServiceRole = true } = {},
) {
  const fileEnv = readEnvFile(envFilePath);
  const merged = { ...fileEnv, ...env };
  const target = normalizeString(merged.CADENCE_LOAD_TARGET);

  if (target !== "local") {
    throw new LoadFixtureError(
      "CADENCE_LOAD_TARGET must be exactly local for the load lifecycle.",
    );
  }

  const url = validateLocalUrl(
    merged.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const baseUrl = validateLocalUrl(
    merged.CADENCE_LOAD_BASE_URL ?? "http://127.0.0.1:3000",
    "CADENCE_LOAD_BASE_URL",
  );
  const publishableKey =
    normalizeString(merged.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeString(merged.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = normalizeString(merged.SUPABASE_SERVICE_ROLE_KEY);
  const missing = [];

  if (!publishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (requireServiceRole && !serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new LoadFixtureError(
      `Missing local load fixture config: ${missing.join(", ")}.`,
    );
  }

  return {
    target,
    url,
    baseUrl,
    publishableKey,
    serviceRoleKey,
  };
}

export function buildLoadEmail(runIdInput, cohort, ordinal) {
  const runId = validateLoadRunId(runIdInput);
  validateCohort(cohort);
  validatePositiveInteger(ordinal, "account ordinal", 1, MAX_ACCOUNT_COUNT);

  return `${EMAIL_PREFIX}${runId}-${cohort}-${String(ordinal).padStart(
    4,
    "0",
  )}${EMAIL_DOMAIN}`;
}

export function buildLoadEmailPattern(runIdInput) {
  const runId = validateLoadRunId(runIdInput);
  return new RegExp(
    `^${escapeRegExp(EMAIL_PREFIX)}${escapeRegExp(
      runId,
    )}-(${LOAD_COHORTS.join("|")})-([0-9]{4})${escapeRegExp(EMAIL_DOMAIN)}$`,
  );
}

export function buildAccountAllocation({
  accountCount = DEFAULT_ACCOUNT_COUNT,
  heavyCount = 0,
  cohort,
  fixtureMode = "read",
} = {}) {
  const workloadClassification = normalizeFixtureMode(fixtureMode);
  validatePositiveInteger(
    accountCount,
    "accountCount",
    1,
    MAX_ACCOUNT_COUNT,
  );
  validateInteger(heavyCount, "heavyCount", 0, accountCount);

  if (cohort) {
    validateCohort(cohort);
    if (workloadClassification === "mutation" && cohort === "empty") {
      throw new LoadFixtureError(
        "Mutation fixtures cannot allocate the read-only empty cohort.",
      );
    }
    if (heavyCount > 0) {
      throw new LoadFixtureError(
        "heavyCount cannot be combined with a single-cohort allocation.",
      );
    }
    return Array.from({ length: accountCount }, () => cohort);
  }

  const nonHeavyCount = accountCount - heavyCount;
  const allocation =
    workloadClassification === "mutation"
      ? smoothInterleave(
          allocateMutationCounts(nonHeavyCount),
          MUTATION_COHORTS,
        )
      : smoothInterleave(
          allocateNonHeavyCounts(nonHeavyCount),
          NON_HEAVY_COHORTS,
        );

  allocation.push(
    ...Array.from({ length: heavyCount }, () => "heavy_schedule"),
  );

  return allocation;
}

export function buildAccountPlan({
  runId: runIdInput,
  accountCount = DEFAULT_ACCOUNT_COUNT,
  heavyCount = 0,
  cohort,
  passwords,
  fixtureMode = "read",
}) {
  const runId = validateLoadRunId(runIdInput);
  const allocation = buildAccountAllocation({
    accountCount,
    heavyCount,
    cohort,
    fixtureMode,
  });

  const accounts = allocation.map((accountCohort, index) => {
    const ordinal = index + 1;
    return {
      ordinal,
      cohort: accountCohort,
      email: buildLoadEmail(runId, accountCohort, ordinal),
      password:
        passwords?.[index] ?? buildRandomPassword(runId, ordinal),
      user_id: null,
      cookies: {},
      selectors: null,
      owner_marker: buildOwnerMarker(runId, ordinal),
      forbidden_marker: null,
      seeded: false,
    };
  });

  for (let index = 0; index < accounts.length; index += 1) {
    const adjacent = accounts[(index + 1) % accounts.length];
    accounts[index].forbidden_marker =
      accounts.length === 1
        ? buildOwnerMarker(runId, accounts[index].ordinal + MAX_ACCOUNT_COUNT)
        : adjacent.owner_marker;
  }

  return accounts;
}

function allocateMutationCounts(count) {
  if (count === 0) {
    return Object.fromEntries(MUTATION_COHORTS.map((name) => [name, 0]));
  }
  const weights = {
    typical_daily: 70,
    review_heavy: 20,
    export_heavy: 10,
  };
  const raw = Object.fromEntries(
    MUTATION_COHORTS.map((name) => [name, (count * weights[name]) / 100]),
  );
  const result = Object.fromEntries(
    MUTATION_COHORTS.map((name) => [name, Math.floor(raw[name])]),
  );

  for (const cohort of MUTATION_COHORTS) {
    if (count >= MUTATION_COHORTS.length && result[cohort] === 0) {
      result[cohort] = 1;
    }
  }

  let assigned = Object.values(result).reduce((sum, value) => sum + value, 0);
  while (assigned > count) {
    const candidate = [...MUTATION_COHORTS]
      .reverse()
      .find((name) => result[name] > 1);
    if (!candidate) break;
    result[candidate] -= 1;
    assigned -= 1;
  }
  const remainderOrder = [...MUTATION_COHORTS].sort(
    (left, right) =>
      raw[right] -
        Math.floor(raw[right]) -
        (raw[left] - Math.floor(raw[left])) ||
      MUTATION_COHORTS.indexOf(left) - MUTATION_COHORTS.indexOf(right),
  );
  for (let index = 0; assigned < count; index += 1, assigned += 1) {
    result[remainderOrder[index % remainderOrder.length]] += 1;
  }
  return result;
}

export function classifyRunUser(user, runIdInput) {
  const runId = validateLoadRunId(runIdInput);
  const email = normalizeString(user?.email)?.toLowerCase();
  const metadata = user?.app_metadata ?? {};
  const emailMatch = email ? buildLoadEmailPattern(runId).exec(email) : null;
  const metadataOrdinal = Number(metadata.cadence_load_ordinal);
  const metadataMatches =
    String(metadata.cadence_load_fixture_version ?? "") ===
      LOAD_FIXTURE_VERSION &&
    metadata.cadence_load_run_id === runId &&
    LOAD_COHORTS.includes(metadata.cadence_load_cohort) &&
    Number.isInteger(metadataOrdinal) &&
    metadataOrdinal >= 1 &&
    metadataOrdinal <= MAX_ACCOUNT_COUNT;
  const markersAgree =
    Boolean(emailMatch) &&
    metadataMatches &&
    emailMatch[1] === metadata.cadence_load_cohort &&
    Number(emailMatch[2]) === metadataOrdinal;

  if (markersAgree) return "exact";
  if (emailMatch || metadataMatches) return "suspicious";
  return "unrelated";
}

export function evaluateLoadRunOperatorIsolation({
  expectedUserIds,
  authUserIds,
  profileUserIds,
  occurrenceSyncUserIds,
  reminderDeliveryUserIds,
}) {
  const failures = [];
  const fields = {
    expectedUserIds,
    authUserIds,
    profileUserIds,
    occurrenceSyncUserIds,
    reminderDeliveryUserIds,
  };
  for (const [name, values] of Object.entries(fields)) {
    if (
      !Array.isArray(values) ||
      values.some((value) => typeof value !== "string" || value.length === 0)
    ) {
      failures.push(`${name} is not a valid owner list`);
    }
  }
  if (failures.length > 0) {
    return {
      passed: false,
      failures,
      summary: {
        expected_accounts: 0,
        auth_accounts: 0,
        profile_accounts: 0,
        occurrence_sync_owners: 0,
        reminder_delivery_owners: 0,
      },
    };
  }

  const expected = new Set(expectedUserIds);
  const auth = new Set(authUserIds);
  const profiles = new Set(profileUserIds);
  const syncOwners = new Set(occurrenceSyncUserIds);
  const reminderOwners = new Set(reminderDeliveryUserIds);
  if (expected.size === 0 || expected.size !== expectedUserIds.length) {
    failures.push("the run account plan is empty or contains duplicates");
  }
  if (
    auth.size !== expected.size ||
    [...auth].some((value) => !expected.has(value))
  ) {
    failures.push("local Auth is not isolated to the exact prepared run");
  }
  if (
    profiles.size !== expected.size ||
    [...profiles].some((value) => !expected.has(value))
  ) {
    failures.push("local profiles are not isolated to the exact prepared run");
  }
  if (
    syncOwners.size !== expected.size ||
    [...syncOwners].some((value) => !expected.has(value))
  ) {
    failures.push(
      "occurrence-sync owners are not isolated to the exact prepared run",
    );
  }
  if ([...reminderOwners].some((value) => !expected.has(value))) {
    failures.push(
      "reminder-delivery owners are not isolated to the exact prepared run",
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    summary: {
      expected_accounts: expected.size,
      auth_accounts: auth.size,
      profile_accounts: profiles.size,
      occurrence_sync_owners: syncOwners.size,
      reminder_delivery_owners: reminderOwners.size,
    },
  };
}

export function buildCohortSummary(accounts) {
  const cohorts = Object.fromEntries(LOAD_COHORTS.map((name) => [name, 0]));

  for (const account of accounts) {
    validateCohort(account.cohort);
    cohorts[account.cohort] += 1;
  }

  return cohorts;
}

export function resolvePrivateRunPaths(runIdInput, runDirectory) {
  const runId = validateLoadRunId(runIdInput);
  const root = path.resolve(runDirectory ?? path.join(tmpdir(), "cadence-load"));
  const repositoryRoot = path.resolve(process.cwd());

  if (root === path.parse(root).root || isPathInside(root, repositoryRoot)) {
    throw new LoadFixtureError(
      "Private load session material must be outside tracked source.",
    );
  }

  const directory =
    path.basename(root) === runId ? root : path.join(root, runId);

  if (path.basename(directory) !== runId) {
    throw new LoadFixtureError("Private load run directory is not exact.");
  }

  return {
    directory,
    metadataPath: path.join(directory, METADATA_FILE),
    sessionPath: path.join(directory, SESSION_FILE),
  };
}

export function resolveAuthPacing({
  accountCount,
  concurrency = DEFAULT_AUTH_CONCURRENCY,
  minimumIntervalMs,
}) {
  validatePositiveInteger(
    accountCount,
    "accountCount",
    1,
    MAX_ACCOUNT_COUNT,
  );
  validatePositiveInteger(
    concurrency,
    "authConcurrency",
    1,
    MAX_AUTH_CONCURRENCY,
  );

  const interval =
    minimumIntervalMs === undefined
      ? accountCount > 30
        ? 10_500
        : 0
      : Number(minimumIntervalMs);

  if (!Number.isInteger(interval) || interval < 0 || interval > 60_000) {
    throw new LoadFixtureError(
      "auth minimum interval must be an integer from 0 to 60000 milliseconds.",
    );
  }

  return {
    concurrency: interval > 0 ? 1 : concurrency,
    minimumIntervalMs: interval,
    maxAttempts: 8,
  };
}

function allocateNonHeavyCounts(count) {
  if (count === 0) {
    return Object.fromEntries(NON_HEAVY_COHORTS.map((name) => [name, 0]));
  }
  if (count === 1) {
    return {
      empty: 0,
      typical_daily: 1,
      review_heavy: 0,
      export_heavy: 0,
    };
  }
  if (count === 2) {
    return {
      empty: 0,
      typical_daily: 1,
      review_heavy: 1,
      export_heavy: 0,
    };
  }
  if (count === 3) {
    return {
      empty: 1,
      typical_daily: 1,
      review_heavy: 1,
      export_heavy: 0,
    };
  }
  if (count < 10) {
    const result = {
      empty: 1,
      typical_daily: 1,
      review_heavy: 1,
      export_heavy: 1,
    };
    let remaining = count - 4;
    const fillOrder = [
      "typical_daily",
      "review_heavy",
      "typical_daily",
      "empty",
      "typical_daily",
      "export_heavy",
    ];
    for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
      result[fillOrder[index % fillOrder.length]] += 1;
    }
    return result;
  }

  const raw = Object.fromEntries(
    NON_HEAVY_COHORTS.map((name) => [
      name,
      (count * DEFAULT_COHORT_WEIGHTS[name]) / 100,
    ]),
  );
  const result = Object.fromEntries(
    NON_HEAVY_COHORTS.map((name) => [name, Math.floor(raw[name])]),
  );
  let remaining =
    count -
    Object.values(result).reduce((total, value) => total + value, 0);

  const remainderOrder = [...NON_HEAVY_COHORTS].sort((left, right) => {
    const difference =
      raw[right] - Math.floor(raw[right]) - (raw[left] - Math.floor(raw[left]));
    return difference || NON_HEAVY_COHORTS.indexOf(left) - NON_HEAVY_COHORTS.indexOf(right);
  });

  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    result[remainderOrder[index % remainderOrder.length]] += 1;
  }

  return result;
}

function smoothInterleave(counts, order) {
  const total = Object.values(counts).reduce(
    (sum, value) => sum + value,
    0,
  );
  const current = Object.fromEntries(order.map((name) => [name, 0]));
  const remaining = { ...counts };
  const result = [];

  for (let index = 0; index < total; index += 1) {
    for (const name of order) current[name] += counts[name];

    const selected = [...order]
      .filter((name) => remaining[name] > 0)
      .sort(
        (left, right) =>
          current[right] - current[left] ||
          order.indexOf(left) - order.indexOf(right),
      )[0];

    result.push(selected);
    remaining[selected] -= 1;
    current[selected] -= total;
  }

  return result;
}

function buildRandomPassword(runId, ordinal) {
  const entropy = randomBytes(18).toString("base64url");
  return `Cad-${runId.slice(-12)}-${ordinal}-aA1!-${entropy}`;
}

function validateCohort(value) {
  if (!LOAD_COHORTS.includes(value)) {
    throw new LoadFixtureError(
      `Fixture cohort must be one of ${LOAD_COHORTS.join(", ")}.`,
    );
  }
}

function validatePositiveInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(Number(value))) {
    throw new LoadFixtureError(`${label} must be an integer.`);
  }
  const numeric = Number(value);
  if (numeric < minimum || numeric > maximum) {
    throw new LoadFixtureError(
      `${label} must be between ${minimum} and ${maximum}.`,
    );
  }
}

function validateInteger(value, label, minimum, maximum) {
  validatePositiveInteger(value, label, minimum, maximum);
}

function normalizeString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isLoopbackHostname(hostname) {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0) return [line, ""];
        return [
          line.slice(0, separator),
          line.slice(separator + 1).replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

function buildOwnerMarker(runId, ordinal) {
  return `cadence-owner-${createHash("sha256")
    .update(`${runId}:${ordinal}:synthetic-owner`)
    .digest("hex")
    .slice(0, 20)}`;
}

export function buildFixturePlan({
  runId: runIdInput,
  account,
  categoryId,
  anchorLocalDate,
  timezone = DEFAULT_TIMEZONE,
  fixtureMode = "read",
}) {
  const runId = validateLoadRunId(runIdInput);
  const workloadClassification = normalizeFixtureMode(fixtureMode);
  validateCohort(account?.cohort);
  assertUuid(account?.user_id, "fixture user");
  assertUuid(categoryId, "fixture category");
  const anchor = parsePlainDate(anchorLocalDate, "anchorLocalDate");
  const cohortConfig = COHORT_BEHAVIOR_COUNTS[account.cohort];
  const historyStart = anchor.subtract({
    days: Math.max(0, cohortConfig.historyDays - 1),
  });
  const futureEnd = anchor.add({ days: cohortConfig.futureDays });
  const createdAt = localDateTimeToInstant(
    historyStart,
    "00:00",
    timezone,
  ).toString();
  const behaviors = [];
  const schedules = [];
  const slots = [];
  const occurrences = [];
  const statusEvents = [];
  const definitionEvents = [];
  const reminders = [];
  let occurrenceIndex = 0;

  const behaviorSpecs = buildBehaviorSpecs(account.cohort, cohortConfig);
  for (let behaviorIndex = 0; behaviorIndex < behaviorSpecs.length; behaviorIndex += 1) {
    const spec = behaviorSpecs[behaviorIndex];
    const behaviorId = deterministicUuid(
      `${runId}:${account.ordinal}:behavior:${behaviorIndex}`,
    );
    const scheduleId = deterministicUuid(
      `${runId}:${account.ordinal}:schedule:${behaviorIndex}`,
    );
    const baseTitle = `${account.owner_marker} Synthetic behavior ${String(
      behaviorIndex + 1,
    ).padStart(2, "0")}`;
    const hasDefinitionHistory =
      (account.cohort === "review_heavy" && behaviorIndex < 3) ||
      (account.cohort === "export_heavy" && behaviorIndex < 2);
    const finalTitle = hasDefinitionHistory
      ? `${baseTitle} revised`
      : baseTitle;
    const description =
      account.cohort === "export_heavy" && behaviorIndex % 2 === 0
        ? "Bounded synthetic export fixture."
        : null;
    const archivedAt = spec.active
      ? null
      : localDateTimeToInstant(
          anchor.subtract({ days: 5 }),
          "23:59",
          timezone,
        ).toString();

    const mutationReminderBehavior =
      workloadClassification === "mutation" &&
      spec.active &&
      behaviorIndex === 2;

    behaviors.push({
      id: behaviorId,
      user_id: account.user_id,
      category_id: categoryId,
      title: finalTitle,
      description,
      recurrence_rule: spec.recurrenceRule,
      scheduled_time: spec.slotSpecs[0].start_time,
      timezone,
      browser_reminder_enabled: !mutationReminderBehavior,
      email_reminder_enabled: mutationReminderBehavior,
      reminder_offset_minutes: mutationReminderBehavior ? 1_440 : 0,
      active: spec.active,
      archived_at: archivedAt,
      created_at: createdAt,
      updated_at: hasDefinitionHistory
        ? localDateTimeToInstant(
            anchor.subtract({ days: 14 }),
            "12:00",
            timezone,
          ).toString()
        : createdAt,
    });

    schedules.push({
      id: scheduleId,
      user_id: account.user_id,
      behavior_id: behaviorId,
      recurrence_rule: spec.recurrenceRule,
      sort_order: 0,
      created_at: createdAt,
      updated_at: createdAt,
    });

    const behaviorSlots = spec.slotSpecs.map((slotSpec, slotIndex) => {
      const slot = {
        id: deterministicUuid(
          `${runId}:${account.ordinal}:slot:${behaviorIndex}:${slotIndex}`,
        ),
        user_id: account.user_id,
        behavior_id: behaviorId,
        behavior_schedule_id: scheduleId,
        kind: slotSpec.kind,
        preset: slotSpec.preset,
        start_time: slotSpec.start_time,
        end_time: slotSpec.end_time,
        sort_order: slotIndex,
        created_at: createdAt,
        updated_at: createdAt,
      };
      slots.push(slot);
      return slot;
    });

    const definitionPlan = buildDefinitionEvents({
      runId,
      account,
      behaviorId,
      behaviorIndex,
      baseTitle,
      finalTitle,
      description,
      createdAt,
      anchor,
      timezone,
      hasDefinitionHistory,
    });
    definitionEvents.push(...definitionPlan);

    const occurrenceEnd = spec.active
      ? futureEnd
      : anchor.subtract({ days: 5 });

    for (
      let localDate = historyStart;
      Temporal.PlainDate.compare(localDate, occurrenceEnd) <= 0;
      localDate = localDate.add({ days: 1 })
    ) {
      if (!matchesRecurrence(localDate, historyStart, spec.recurrenceRule)) {
        continue;
      }

      for (const slot of behaviorSlots) {
        const scheduledFor = localDateTimeToInstant(
          localDate,
          slot.start_time,
          timezone,
        );
        const occurrenceId = deterministicUuid(
          `${runId}:${account.ordinal}:occurrence:${behaviorIndex}:${slot.id}:${localDate}`,
        );
        const statusPlan = buildStatusPlan({
          account,
          occurrenceId,
          behaviorId,
          localDate,
          scheduledFor,
          occurrenceIndex,
          timezone,
          runId,
          anchor,
          currentStatusSeed: behaviorIndex + slot.sort_order,
        });
        const note =
          Temporal.PlainDate.compare(localDate, anchor) <= 0 &&
          occurrenceIndex % noteIntervalForCohort(account.cohort) === 0
            ? `${account.owner_marker} Synthetic fixture note.`
            : null;

        occurrences.push({
          id: occurrenceId,
          user_id: account.user_id,
          behavior_id: behaviorId,
          behavior_schedule_slot_id: slot.id,
          scheduled_for: scheduledFor.toString(),
          local_date: localDate.toString(),
          status: statusPlan.status,
          completed_at: statusPlan.completedAt,
          status_marked_at: statusPlan.statusMarkedAt,
          note,
          schedule_kind: slot.kind,
          schedule_preset: slot.preset,
          schedule_start_time: slot.start_time,
          schedule_end_time: slot.end_time,
          created_at: createdAt,
          updated_at:
            statusPlan.statusMarkedAt ??
            createdAt,
        });
        statusEvents.push(...statusPlan.events);

        if (
          account.cohort === "export_heavy" &&
          statusPlan.status !== "unresolved" &&
          occurrenceIndex % 23 === 0
        ) {
          reminders.push(
            buildTerminalReminder({
              runId,
              account,
              occurrenceId,
              occurrenceIndex,
              scheduledFor,
            }),
          );
        }

        occurrenceIndex += 1;
      }
    }
  }

  const mutationSelectors =
    workloadClassification === "mutation"
      ? extendMutationFixturePlan({
          runId,
          account,
          categoryId,
          timezone,
          anchor,
          futureEnd,
          behaviors,
          schedules,
          slots,
          occurrences,
          statusEvents,
          reminders,
        })
      : {};
  const selectedOccurrence = [...occurrences]
    .filter(
      (occurrence) =>
        Temporal.PlainDate.compare(
          Temporal.PlainDate.from(occurrence.local_date),
          anchor,
        ) <= 0,
    )
    .sort(
      (left, right) =>
        right.local_date.localeCompare(left.local_date) ||
        left.id.localeCompare(right.id),
    )[0];
  const activeBehaviorCount = behaviors.filter((behavior) => behavior.active)
    .length;
  const syncState = {
    user_id: account.user_id,
    timezone,
    last_synced_local_date: anchor.toString(),
    synced_through_local_date: futureEnd.toString(),
    last_successful_sync_at: localDateTimeToInstant(
      anchor,
      "00:00",
      timezone,
    ).toString(),
    stale: false,
    stale_reason: null,
    last_sync_behavior_count: activeBehaviorCount,
    last_sync_created_count: occurrences.filter((occurrence) => {
      const date = Temporal.PlainDate.from(occurrence.local_date);
      return Temporal.PlainDate.compare(date, anchor) >= 0;
    }).length,
    last_sync_updated_count: 0,
    last_sync_deleted_count: 0,
  };
  const expectedFutureKeys = occurrences
    .filter((occurrence) => {
      const localDate = Temporal.PlainDate.from(occurrence.local_date);
      return (
        Temporal.PlainDate.compare(localDate, anchor) >= 0 &&
        Temporal.PlainDate.compare(localDate, futureEnd) <= 0
      );
    })
    .map((occurrence) => occurrenceKey(occurrence))
    .sort();

  return {
    behaviors,
    schedules,
    slots,
    occurrences,
    statusEvents,
    definitionEvents,
    reminders,
    syncState,
    selectors: selectedOccurrence
      ? {
          behavior_id: selectedOccurrence.behavior_id,
          local_date: selectedOccurrence.local_date,
          owner_marker: account.owner_marker,
          forbidden_marker: account.forbidden_marker,
          ...mutationSelectors,
        }
      : {
          owner_marker: account.owner_marker,
          forbidden_marker: account.forbidden_marker,
          ...mutationSelectors,
        },
    expected: {
      futureOccurrenceKeys: expectedFutureKeys,
      baselineDigests:
        workloadClassification === "mutation"
          ? buildMutationBaselineDigests({
              behaviors,
              schedules,
              slots,
              occurrences,
              statusEvents,
              definitionEvents,
              reminders,
            })
          : undefined,
      mutationLimits:
        workloadClassification === "mutation"
          ? { ...MUTATION_GROWTH_LIMITS }
          : undefined,
      counts: {
        behaviors: behaviors.length,
        activeBehaviors: activeBehaviorCount,
        archivedBehaviors: behaviors.length - activeBehaviorCount,
        schedules: schedules.length,
        slots: slots.length,
        occurrences: occurrences.length,
        statusEvents: statusEvents.length,
        definitionEvents: definitionEvents.length,
        reminders: reminders.length,
      },
    },
  };
}

function extendMutationFixturePlan({
  runId,
  account,
  categoryId,
  timezone,
  anchor,
  futureEnd,
  behaviors,
  schedules,
  slots,
  occurrences,
  statusEvents,
  reminders,
}) {
  const commonSelectors = {
    profile_timezone: timezone,
    horizon_start_local_date: anchor.toString(),
    horizon_end_local_date: futureEnd.toString(),
    category_id: categoryId,
  };
  if (behaviors.length === 0) return commonSelectors;

  const maintainer = behaviors[0];
  const scheduleOnly = behaviors[1];
  const reminderBehavior = behaviors[2];
  const freshHorizonBehavior = behaviors[3];
  const archived = behaviors.find((behavior) => !behavior.active);
  if (
    !maintainer ||
    !scheduleOnly ||
    !reminderBehavior ||
    !freshHorizonBehavior ||
    !freshHorizonBehavior.active ||
    !archived
  ) {
    throw new LoadFixtureError(
      "Mutation fixtures require active maintainer, schedule, reminder, fresh-horizon, and archived behaviors.",
    );
  }

  const maintainerSchedule = requireFixtureSchedule(
    schedules,
    maintainer.id,
  );
  const maintainerSlot = requireFixtureSlot(slots, maintainerSchedule.id);
  const scheduleOnlySchedule = requireFixtureSchedule(
    schedules,
    scheduleOnly.id,
  );
  const scheduleOnlySlot = requireFixtureSlot(
    slots,
    scheduleOnlySchedule.id,
  );
  const reminderOccurrences = occurrences.filter(
    (occurrence) => occurrence.behavior_id === reminderBehavior.id,
  );
  const mutationOccurrence = [...reminderOccurrences]
    .filter(
      (occurrence) =>
        occurrence.status === "unresolved" &&
        Temporal.PlainDate.compare(
          Temporal.PlainDate.from(occurrence.local_date),
          anchor.add({ days: 2 }),
        ) >= 0,
    )
    .sort(compareOccurrencesAscending)[0];
  const operatorReminderOccurrence = [...reminderOccurrences]
    .filter(
      (occurrence) =>
        occurrence.id !== mutationOccurrence?.id &&
        occurrence.status === "unresolved" &&
        occurrence.local_date <= anchor.toString(),
    )
    .sort(compareOccurrencesDescending)[0];
  const duePastClearOccurrence = [...reminderOccurrences]
    .filter(
      (occurrence) =>
        occurrence.id !== mutationOccurrence?.id &&
        occurrence.id !== operatorReminderOccurrence?.id &&
        occurrence.status === "unresolved" &&
        occurrence.local_date < anchor.toString() &&
        Temporal.PlainDate.compare(
          Temporal.PlainDate.from(occurrence.local_date),
          anchor.subtract({ days: 89 }),
        ) >= 0,
    )
    .sort(compareOccurrencesDescending)[0];
  const futureReminderOccurrence = [...reminderOccurrences]
    .filter(
      (occurrence) =>
        occurrence.id !== mutationOccurrence?.id &&
        occurrence.status === "unresolved" &&
        Temporal.PlainDate.compare(
          Temporal.PlainDate.from(occurrence.local_date),
          anchor.add({ days: 3 }),
        ) >= 0,
    )
    .sort(compareOccurrencesAscending)[0];
  const reviewOccurrence = [...occurrences]
    .filter(
      (occurrence) =>
        occurrence.behavior_id === scheduleOnly.id &&
        occurrence.status === "unresolved" &&
        occurrence.local_date <= anchor.toString(),
    )
    .sort(compareOccurrencesDescending)[0];
  const contentionOccurrence = [...occurrences]
    .filter(
      (occurrence) =>
        occurrence.behavior_id === freshHorizonBehavior.id &&
        occurrence.status === "unresolved" &&
        occurrence.local_date < anchor.toString(),
    )
    .sort(compareOccurrencesDescending)[0];
  const pastPreservationOccurrence = [...occurrences]
    .filter((occurrence) => occurrence.local_date < anchor.toString())
    .sort(compareOccurrencesAscending)[0];

  if (
    !mutationOccurrence ||
    !operatorReminderOccurrence ||
    !duePastClearOccurrence ||
    !futureReminderOccurrence ||
    !reviewOccurrence ||
    !contentionOccurrence ||
    !pastPreservationOccurrence
  ) {
    throw new LoadFixtureError(
      "Mutation fixture selectors could not resolve their deterministic rows.",
    );
  }

  const resolvedAt = localDateTimeToInstant(
    anchor,
    "00:00",
    timezone,
  ).toString();
  for (const occurrence of [futureReminderOccurrence]) {
    occurrence.status = "completed";
    occurrence.completed_at = resolvedAt;
    occurrence.status_marked_at = resolvedAt;
    occurrence.updated_at = resolvedAt;
    statusEvents.push({
      id: deterministicUuid(
        `${runId}:${account.ordinal}:mutation-status:${occurrence.id}`,
      ),
      user_id: account.user_id,
      occurrence_id: occurrence.id,
      behavior_id: occurrence.behavior_id,
      previous_status: "unresolved",
      status: "completed",
      status_semantics: "explicit_user_mark",
      recorded_at: resolvedAt,
      effective_at: resolvedAt,
      local_date: occurrence.local_date,
      timezone,
      source_capture_method: "manual_tap",
      source_confidence: "high",
      revises_event_id: null,
      reason_code: null,
      created_at: resolvedAt,
      updated_at: resolvedAt,
    });
  }

  const behaviorById = new Map(
    behaviors.map((behavior) => [behavior.id, behavior]),
  );
  for (const occurrence of occurrences.filter(
    (row) =>
      row.id === mutationOccurrence.id ||
      row.id === operatorReminderOccurrence.id ||
      row.id === duePastClearOccurrence.id ||
      row.local_date >= anchor.toString(),
  )) {
    const behavior = behaviorById.get(occurrence.behavior_id);
    if (!behavior?.active) continue;
    const channels = [
      ...(behavior.browser_reminder_enabled ? ["browser_push"] : []),
      ...(behavior.email_reminder_enabled ? ["email"] : []),
    ];
    for (const channel of channels) {
      reminders.push(
        buildMutationReminder({
          runId,
          account,
          occurrence,
          channel,
          reminderOffsetMinutes: behavior.reminder_offset_minutes,
          status:
            occurrence.status === "unresolved" ? "pending" : "cancelled",
        }),
      );
    }
  }
  const dueReminder = reminders.find(
    (delivery) =>
      delivery.occurrence_id === operatorReminderOccurrence.id &&
      delivery.channel === "email",
  );
  const cancellationReminder = reminders.find(
    (delivery) =>
      delivery.occurrence_id === mutationOccurrence.id &&
      delivery.channel === "email",
  );
  const duePastClearReminder = reminders.find(
    (delivery) =>
      delivery.occurrence_id === duePastClearOccurrence.id &&
      delivery.channel === "email",
  );
  const futureReminder = reminders.find(
    (delivery) =>
      delivery.occurrence_id === futureReminderOccurrence.id &&
      delivery.channel === "email",
  );
  if (
    !dueReminder ||
    !duePastClearReminder ||
    !cancellationReminder ||
    !futureReminder
  ) {
    throw new LoadFixtureError(
      "Mutation fixture reminder selectors could not resolve their deterministic rows.",
    );
  }

  return {
    ...commonSelectors,
    mutation_occurrence_id: mutationOccurrence.id,
    mutation_occurrence_status: mutationOccurrence.status,
    mutation_occurrence_local_date: mutationOccurrence.local_date,
    review_behavior_id: reviewOccurrence.behavior_id,
    review_local_date: reviewOccurrence.local_date,
    review_occurrence_id: reviewOccurrence.id,
    review_occurrence_status: reviewOccurrence.status,
    maintainer_behavior_id: maintainer.id,
    maintainer_behavior_title: maintainer.title,
    maintainer_schedule_id: maintainerSchedule.id,
    maintainer_slot_id: maintainerSlot.id,
    maintainer_start_time: canonicalTime(maintainerSlot.start_time),
    schedule_only_behavior_id: scheduleOnly.id,
    schedule_only_behavior_title: scheduleOnly.title,
    schedule_only_schedule_id: scheduleOnlySchedule.id,
    schedule_only_slot_id: scheduleOnlySlot.id,
    schedule_only_start_time: canonicalTime(scheduleOnlySlot.start_time),
    archived_behavior_id: archived.id,
    archived_behavior_title: archived.title,
    stale_horizon_behavior_id: scheduleOnly.id,
    fresh_horizon_behavior_id: freshHorizonBehavior.id,
    past_preservation_occurrence_id: pastPreservationOccurrence.id,
    resolved_preservation_occurrence_id: futureReminderOccurrence.id,
    cancellation_reminder_occurrence_id: mutationOccurrence.id,
    cancellation_reminder_delivery_id: cancellationReminder.id,
    due_reminder_occurrence_id: operatorReminderOccurrence.id,
    due_reminder_delivery_id: dueReminder.id,
    due_past_clear_behavior_id: duePastClearOccurrence.behavior_id,
    due_past_clear_local_date: duePastClearOccurrence.local_date,
    due_past_clear_occurrence_id: duePastClearOccurrence.id,
    due_past_clear_delivery_id: duePastClearReminder.id,
    future_reminder_occurrence_id: futureReminderOccurrence.id,
    future_reminder_delivery_id: futureReminder.id,
    contention_behavior_id: contentionOccurrence.behavior_id,
    contention_local_date: contentionOccurrence.local_date,
    contention_occurrence_id: contentionOccurrence.id,
    contention_occurrence_status: contentionOccurrence.status,
    contention_pair_id: buildContentionPairId(runId, account.ordinal),
  };
}

function requireFixtureSchedule(schedules, behaviorId) {
  const schedule = [...schedules]
    .filter((row) => row.behavior_id === behaviorId)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.id.localeCompare(right.id),
    )[0];
  if (!schedule) {
    throw new LoadFixtureError(
      "Mutation fixture behavior is missing its schedule.",
    );
  }
  return schedule;
}

function requireFixtureSlot(slots, scheduleId) {
  const slot = [...slots]
    .filter((row) => row.behavior_schedule_id === scheduleId)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.id.localeCompare(right.id),
    )[0];
  if (!slot) {
    throw new LoadFixtureError(
      "Mutation fixture schedule is missing its slot.",
    );
  }
  return slot;
}

function compareOccurrencesAscending(left, right) {
  return (
    left.local_date.localeCompare(right.local_date) ||
    canonicalInstant(left.scheduled_for).localeCompare(
      canonicalInstant(right.scheduled_for),
    ) ||
    left.id.localeCompare(right.id)
  );
}

function compareOccurrencesDescending(left, right) {
  return compareOccurrencesAscending(right, left);
}

function buildMutationReminder({
  runId,
  account,
  occurrence,
  channel,
  reminderOffsetMinutes,
  status,
}) {
  const scheduledSendAt = Temporal.Instant.from(
    occurrence.scheduled_for,
  ).subtract({ minutes: reminderOffsetMinutes });
  return {
    id: deterministicUuid(
      `${runId}:${account.ordinal}:mutation-reminder:${channel}:${occurrence.id}:${scheduledSendAt}`,
    ),
    user_id: account.user_id,
    occurrence_id: occurrence.id,
    channel,
    scheduled_send_at: scheduledSendAt.toString(),
    sent_at: null,
    status,
    error: null,
    processing_started_at: null,
    created_at: scheduledSendAt.subtract({ hours: 1 }).toString(),
    updated_at: scheduledSendAt.subtract({ minutes: 30 }).toString(),
  };
}

function buildContentionPairId(runId, ordinal) {
  return `contention-${createHash("sha256")
    .update(`${runId}:${ordinal}:contention-pair`)
    .digest("hex")
    .slice(0, 12)}`;
}

function buildMutationBaselineDigests(fixture) {
  return Object.fromEntries(
    [
      ["behaviors", fixture.behaviors],
      ["schedules", fixture.schedules],
      ["slots", fixture.slots],
      ["occurrences", fixture.occurrences],
      ["statusEvents", fixture.statusEvents],
      ["definitionEvents", fixture.definitionEvents],
      ["reminders", fixture.reminders],
    ].map(([name, rows]) => [
      name,
      createHash("sha256").update(canonicalJson(rows)).digest("hex"),
    ]),
  );
}

function buildBehaviorSpecs(cohort, config) {
  const total = config.active + config.archived;
  return Array.from({ length: total }, (_, index) => ({
    active: index < config.active,
    recurrenceRule: recurrenceForBehavior(cohort, index),
    slotSpecs: slotsForBehavior(cohort, index),
  }));
}

function recurrenceForBehavior(cohort, index) {
  if (cohort === "heavy_schedule") {
    if (index < 4) return { frequency: "daily", interval: index < 2 ? 1 : 2 };
    if (index < 18) {
      return {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [weekdayForIndex(index)],
      };
    }
    if (index < 30) {
      return {
        frequency: "weekly",
        interval: 2,
        daysOfWeek: [
          weekdayForIndex(index),
          weekdayForIndex(index + 2),
        ],
      };
    }
    if (index < 36) {
      return { frequency: "interval_days", intervalDays: 7 };
    }
    return { frequency: "monthly", interval: 1, dayOfMonth: 31 };
  }

  const variants = [
    { frequency: "daily", interval: 1 },
    { frequency: "daily", interval: 1 },
    { frequency: "daily", interval: 1 },
    {
      frequency: "weekly",
      interval: 2,
      daysOfWeek: ["tuesday", "friday"],
    },
    { frequency: "monthly", interval: 1, dayOfMonth: 31 },
    { frequency: "daily", interval: 3 },
    {
      frequency: "weekly",
      interval: 1,
      daysOfWeek: ["thursday"],
    },
    { frequency: "interval_days", intervalDays: 5 },
    { frequency: "monthly", interval: 1, dayOfMonth: 15 },
    {
      frequency: "weekly",
      interval: 1,
      daysOfWeek: ["saturday", "sunday"],
    },
  ];

  if (cohort === "export_heavy") {
    const exportVariants = [
      { frequency: "daily", interval: 1 },
      { frequency: "interval_days", intervalDays: 3 },
      {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: ["monday", "thursday"],
      },
      {
        frequency: "weekly",
        interval: 2,
        daysOfWeek: ["wednesday"],
      },
      { frequency: "monthly", interval: 1, dayOfMonth: 31 },
      { frequency: "interval_days", intervalDays: 4 },
      {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: ["sunday"],
      },
    ];
    return exportVariants[index % exportVariants.length];
  }

  return variants[index % variants.length];
}

function slotsForBehavior(cohort, index) {
  const exactTimes = ["07:30", "09:00", "12:30", "18:00", "21:00"];
  const rangeSlots = [
    {
      kind: "range",
      preset: "morning",
      start_time: "06:00",
      end_time: "12:00",
    },
    {
      kind: "range",
      preset: "evening",
      start_time: "18:00",
      end_time: "00:00",
    },
  ];

  if (cohort === "heavy_schedule") {
    const primary =
      index % 4 === 0
        ? rangeSlots[(index / 4) % rangeSlots.length]
        : {
            kind: "exact",
            preset: null,
            start_time: exactTimes[index % exactTimes.length],
            end_time: null,
          };
    if (index % 3 !== 0) return [primary];

    const secondStart = primary.start_time === "18:00" ? "21:30" : "16:30";
    return [
      primary,
      {
        kind: "exact",
        preset: null,
        start_time: secondStart,
        end_time: null,
      },
    ];
  }

  if (index === 2 || index === 6) return [rangeSlots[index === 2 ? 0 : 1]];
  if (cohort === "review_heavy" && index === 3) {
    return [
      {
        kind: "exact",
        preset: null,
        start_time: "08:00",
        end_time: null,
      },
      {
        kind: "exact",
        preset: null,
        start_time: "20:00",
        end_time: null,
      },
    ];
  }

  return [
    {
      kind: "exact",
      preset: null,
      start_time: exactTimes[index % exactTimes.length],
      end_time: null,
    },
  ];
}

function buildDefinitionEvents({
  runId,
  account,
  behaviorId,
  behaviorIndex,
  baseTitle,
  finalTitle,
  description,
  createdAt,
  anchor,
  timezone,
  hasDefinitionHistory,
}) {
  const baselineId = deterministicUuid(
    `${runId}:${account.ordinal}:definition:${behaviorIndex}:0`,
  );
  const events = [
    {
      id: baselineId,
      user_id: account.user_id,
      behavior_id: behaviorId,
      previous_title: null,
      next_title: baseTitle,
      previous_description: null,
      next_description: description,
      changed_fields:
        description === null ? ["title"] : ["title", "description"],
      recorded_at: createdAt,
      source: "manual",
      reason: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  if (hasDefinitionHistory) {
    const revisedAt = localDateTimeToInstant(
      anchor.subtract({ days: 14 }),
      "12:00",
      timezone,
    ).toString();
    events.push({
      id: deterministicUuid(
        `${runId}:${account.ordinal}:definition:${behaviorIndex}:1`,
      ),
      user_id: account.user_id,
      behavior_id: behaviorId,
      previous_title: baseTitle,
      next_title: finalTitle,
      previous_description: description,
      next_description: description,
      changed_fields: ["title"],
      recorded_at: revisedAt,
      source: "manual",
      reason: "synthetic_fixture_revision",
      created_at: revisedAt,
      updated_at: revisedAt,
    });
  }

  return events;
}

function buildStatusPlan({
  account,
  occurrenceId,
  behaviorId,
  localDate,
  scheduledFor,
  occurrenceIndex,
  timezone,
  runId,
  anchor,
  currentStatusSeed,
}) {
  const relation = Temporal.PlainDate.compare(localDate, anchor);
  let finalStatus = "unresolved";

  if (relation === 0) {
    finalStatus = ["completed", "not_completed", "unresolved"][
      currentStatusSeed % 3
    ];
  } else if (relation < 0) {
    finalStatus =
      occurrenceIndex % 9 === 0
        ? "unresolved"
        : occurrenceIndex % 4 === 0
          ? "not_completed"
          : "completed";
  }

  if (finalStatus === "unresolved") {
    return {
      status: finalStatus,
      completedAt: null,
      statusMarkedAt: null,
      events: [],
    };
  }

  const shouldCorrect =
    account.cohort === "review_heavy" && occurrenceIndex % 11 === 0;
  const firstStatus = shouldCorrect
    ? finalStatus === "completed"
      ? "not_completed"
      : "completed"
    : finalStatus;
  const firstRecordedAt = scheduledFor.add({ minutes: 20 }).toString();
  const firstId = deterministicUuid(
    `${runId}:${account.ordinal}:status:${occurrenceId}:0`,
  );
  const events = [
    {
      id: firstId,
      user_id: account.user_id,
      occurrence_id: occurrenceId,
      behavior_id: behaviorId,
      previous_status: "unresolved",
      status: firstStatus,
      status_semantics: "explicit_user_mark",
      recorded_at: firstRecordedAt,
      effective_at: firstRecordedAt,
      local_date: localDate.toString(),
      timezone,
      source_capture_method: "manual_tap",
      source_confidence: "high",
      revises_event_id: null,
      reason_code: null,
      created_at: firstRecordedAt,
      updated_at: firstRecordedAt,
    },
  ];
  let finalRecordedAt = firstRecordedAt;

  if (shouldCorrect) {
    finalRecordedAt = scheduledFor.add({ minutes: 35 }).toString();
    events.push({
      id: deterministicUuid(
        `${runId}:${account.ordinal}:status:${occurrenceId}:1`,
      ),
      user_id: account.user_id,
      occurrence_id: occurrenceId,
      behavior_id: behaviorId,
      previous_status: firstStatus,
      status: finalStatus,
      status_semantics: "explicit_user_correction",
      recorded_at: finalRecordedAt,
      effective_at: finalRecordedAt,
      local_date: localDate.toString(),
      timezone,
      source_capture_method: "manual_tap",
      source_confidence: "high",
      revises_event_id: firstId,
      reason_code: "synthetic_fixture_correction",
      created_at: finalRecordedAt,
      updated_at: finalRecordedAt,
    });
  }

  return {
    status: finalStatus,
    completedAt: finalStatus === "completed" ? finalRecordedAt : null,
    statusMarkedAt: finalRecordedAt,
    events,
  };
}

function buildTerminalReminder({
  runId,
  account,
  occurrenceId,
  occurrenceIndex,
  scheduledFor,
}) {
  const statuses = ["sent", "failed", "cancelled"];
  const status = statuses[occurrenceIndex % statuses.length];
  const scheduledSendAt = scheduledFor.subtract({ hours: 1 }).toString();

  return {
    id: deterministicUuid(
      `${runId}:${account.ordinal}:reminder:${occurrenceId}`,
    ),
    user_id: account.user_id,
    occurrence_id: occurrenceId,
    channel: "email",
    scheduled_send_at: scheduledSendAt,
    sent_at:
      status === "sent"
        ? scheduledFor.subtract({ minutes: 59 }).toString()
        : null,
    status,
    error: status === "failed" ? "synthetic_fixture_failure" : null,
    processing_started_at: null,
    created_at: scheduledFor.subtract({ hours: 2 }).toString(),
    updated_at: scheduledFor.subtract({ minutes: 58 }).toString(),
  };
}

function noteIntervalForCohort(cohort) {
  if (cohort === "export_heavy") return 13;
  if (cohort === "review_heavy") return 19;
  return 23;
}

function matchesRecurrence(localDate, anchorDate, rule) {
  if (rule.frequency === "daily") {
    return daysBetween(anchorDate, localDate) % rule.interval === 0;
  }
  if (rule.frequency === "interval_days") {
    return daysBetween(anchorDate, localDate) % rule.intervalDays === 0;
  }
  if (rule.frequency === "weekly") {
    const weekday = weekdayName(localDate.dayOfWeek);
    const weeks =
      daysBetween(startOfIsoWeek(anchorDate), startOfIsoWeek(localDate)) / 7;
    return (
      rule.daysOfWeek.includes(weekday) &&
      weeks >= 0 &&
      weeks % rule.interval === 0
    );
  }
  if (rule.frequency === "monthly") {
    const months =
      (localDate.year - anchorDate.year) * 12 +
      localDate.month -
      anchorDate.month;
    return (
      months >= 0 &&
      months % rule.interval === 0 &&
      localDate.day === Math.min(rule.dayOfMonth, localDate.daysInMonth)
    );
  }
  throw new LoadFixtureError("Fixture recurrence rule is unsupported.");
}

function weekdayForIndex(index) {
  return weekdayName((index % 7) + 1);
}

function weekdayName(dayOfWeek) {
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ][dayOfWeek - 1];
}

function daysBetween(start, end) {
  return start.until(end, { largestUnit: "days" }).days;
}

function startOfIsoWeek(date) {
  return date.subtract({ days: date.dayOfWeek - 1 });
}

function localDateTimeToInstant(localDate, time, timezone) {
  return localDate
    .toPlainDateTime(Temporal.PlainTime.from(time))
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant();
}

function parsePlainDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    throw new LoadFixtureError(`${label} must use YYYY-MM-DD.`);
  }
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    throw new LoadFixtureError(`${label} is not a valid calendar date.`);
  }
}

function deterministicUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${(
    (Number.parseInt(hex[16], 16) & 0x3) |
    0x8
  ).toString(16)}${hex.slice(17)}`;
  return [
    versioned.slice(0, 8),
    versioned.slice(8, 12),
    versioned.slice(12, 16),
    versioned.slice(16, 20),
    versioned.slice(20, 32),
  ].join("-");
}

function assertUuid(value, label) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new LoadFixtureError(`${label} must be a UUID.`);
  }
}

function occurrenceKey(occurrence) {
  return [
    occurrence.behavior_id,
    canonicalInstant(occurrence.scheduled_for),
    occurrence.schedule_kind,
    canonicalTime(occurrence.schedule_start_time),
    occurrence.schedule_end_time
      ? canonicalTime(occurrence.schedule_end_time)
      : "",
  ].join("|");
}

function canonicalInstant(value) {
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    throw new LoadFixtureError(
      "Occurrence integrity key contains an invalid instant.",
    );
  }
}

function canonicalTime(value) {
  try {
    return Temporal.PlainTime.from(value).toString({
      smallestUnit: "minute",
    });
  } catch {
    throw new LoadFixtureError(
      "Occurrence integrity key contains an invalid local time.",
    );
  }
}

export async function provisionLoadRun(options) {
  assertNotAborted(options?.signal);
  const context = await prepareLifecycleContext(options);
  const { admin, config, metadata, paths, pacing } = context;
  const listedUsers = await listAllAuthUsers(admin);
  const classified = classifyListedUsers(listedUsers, metadata.run_id);

  if (classified.suspicious.length > 0) {
    throw new LoadFixtureError(
      "Provisioning refused because a synthetic identity matched only one exact run marker.",
    );
  }

  if (context.createdMetadata && classified.exact.length > 0) {
    throw new LoadFixtureError(
      "Provisioning found exact run users without prior private metadata; run exact cleanup recovery first.",
    );
  }

  const exactByEmail = new Map(
    classified.exact.map((user) => [user.email.toLowerCase(), user]),
  );
  let createdUsers = 0;
  let reusedUsers = 0;

  for (const account of metadata.accounts) {
    assertNotAborted(options?.signal);
    let user = exactByEmail.get(account.email.toLowerCase());

    if (user) {
      assertUserMatchesAccount(user, account, metadata.run_id);
      reusedUsers += 1;
    } else {
      user = await withAuthRetry(
        () => createLoadUser(admin, metadata.run_id, account),
        pacing,
      );
      createdUsers += 1;
    }

    account.user_id = user.id;
    await writePrivateJson(paths.metadataPath, metadata);
  }

  const seedResult = await seedLoadRun({
    ...options,
    config,
    metadata,
    paths,
  });

  return {
    sessionPath: paths.sessionPath,
    summary: {
      runId: metadata.run_id,
      requestedAccounts: metadata.accounts.length,
      createdUsers,
      reusedUsers,
      seededAccounts: seedResult.summary.seededAccounts,
      workloadClassification: context.fixtureMode,
      cohorts: buildCohortSummary(metadata.accounts),
    },
  };
}

export async function seedLoadRun(options) {
  assertNotAborted(options?.signal);
  const context =
    options?.metadata && options?.paths && options?.config
      ? {
          config: normalizeInjectedConfig(
            options.config,
            options.baseUrl ?? options.config.baseUrl,
            false,
          ),
          metadata: options.metadata,
          paths: options.paths,
          fixtureMode: validateInjectedFixtureMode(
            options.metadata,
            options.fixtureMode,
          ),
          pacing: resolveAuthPacing({
            accountCount: estimatedAuthenticationCount(
              options.metadata.accounts.length,
              validateInjectedFixtureMode(
                options.metadata,
                options.fixtureMode,
              ),
            ),
            concurrency:
              options.authConcurrency ?? DEFAULT_AUTH_CONCURRENCY,
            minimumIntervalMs: options.authMinIntervalMs,
          }),
        }
      : await loadExistingLifecycleContext(options, {
          requireServiceRole: false,
        });
  const { config, metadata, paths, pacing, fixtureMode } = context;
  const contentionOrdinals = new Set(
    fixtureMode === "mutation"
      ? metadata.accounts
          .filter((account) => account.cohort !== "empty")
          .slice(0, MAX_CONTENTION_PAIRS)
          .map((account) => account.ordinal)
      : [],
  );
  const seededResults = await mapWithConcurrency(
    metadata.accounts,
    pacing.concurrency,
    async (account) => {
      assertNotAborted(options?.signal);
      assertUuid(account.user_id, "provisioned fixture user");
      const { client, cookies } = await withAuthRetry(
        () => signInOrdinaryAccount(config, account),
        pacing,
      );
      let contentionCookies;
      if (contentionOrdinals.has(account.ordinal)) {
        if (pacing.minimumIntervalMs > 0) {
          await delay(pacing.minimumIntervalMs);
        }
        const secondarySession = await withAuthRetry(
          () => signInOrdinaryAccount(config, account),
          pacing,
        );
        contentionCookies = secondarySession.cookies;
        assertDistinctCookieJars(cookies, contentionCookies);
      }
      const onboarding = await waitForOnboardingRows(client, account.user_id);
      await updateFixtureProfileTimezone(
        client,
        account.user_id,
        metadata.timezone,
      );
      const fixture = buildFixturePlan({
        runId: metadata.run_id,
        account,
        categoryId: onboarding.otherCategoryId,
        anchorLocalDate: metadata.anchor_local_date,
        timezone: metadata.timezone,
        fixtureMode,
      });
      const fixtureDigest = fixturePlanDigest(fixture);

      if (
        account.fixture_digest &&
        account.fixture_digest !== fixtureDigest
      ) {
        throw new LoadFixtureError(
          "Existing fixture metadata does not match the current deterministic plan.",
        );
      }

      await seedFixtureThroughRls(client, fixture);
      if (pacing.minimumIntervalMs > 0) {
        await delay(pacing.minimumIntervalMs);
      }
      return {
        account,
        cookies,
        contentionCookies,
        selectors: fixture.selectors,
        fixtureDigest,
        expected: fixture.expected,
      };
    },
  );

  for (const result of seededResults) {
    result.account.cookies = result.cookies;
    if (result.contentionCookies) {
      result.account.contention_cookies = result.contentionCookies;
      result.account.contention_pair_id = buildContentionPairId(
        metadata.run_id,
        result.account.ordinal,
      );
    } else {
      delete result.account.contention_cookies;
      delete result.account.contention_pair_id;
    }
    result.account.selectors = result.selectors;
    result.account.fixture_digest = result.fixtureDigest;
    result.account.expected = result.expected;
    result.account.seeded = true;
  }
  await writePrivateJson(paths.metadataPath, metadata);

  const sessionArtifact = buildSessionArtifact(metadata, config.baseUrl);
  await writePrivateJson(paths.sessionPath, sessionArtifact);

  return {
    sessionPath: paths.sessionPath,
    summary: {
      runId: metadata.run_id,
      seededAccounts: seededResults.length,
      workloadClassification: fixtureMode,
      contentionPairs: seededResults.filter(
        (result) => Boolean(result.contentionCookies),
      ).length,
      cohorts: buildCohortSummary(metadata.accounts),
    },
  };
}

export async function refreshLoadRunSessions(options = {}) {
  assertNotAborted(options.signal);
  const context = await loadExistingLifecycleContext(options);
  const { config, metadata, paths, pacing } = context;
  const cohortFilter = normalizeString(options.cohortFilter);
  const renewalStrategy =
    normalizeString(options.renewalStrategy) ?? "refresh_token";
  if (
    renewalStrategy !== "refresh_token" &&
    renewalStrategy !== "password_sign_in"
  ) {
    throw new LoadFixtureError(
      "Session renewal strategy must be refresh_token or password_sign_in.",
    );
  }
  const includeContentionSessions =
    options.includeContentionSessions === undefined
      ? true
      : options.includeContentionSessions;
  if (typeof includeContentionSessions !== "boolean") {
    throw new LoadFixtureError(
      "includeContentionSessions must be a boolean.",
    );
  }
  if (cohortFilter && cohortFilter !== "heavy_schedule") {
    throw new LoadFixtureError(
      "Session refresh supports only the default or heavy-schedule identity pool.",
    );
  }

  const eligibleAccounts = metadata.accounts.filter((account) =>
    cohortFilter === "heavy_schedule"
      ? account.cohort === "heavy_schedule"
      : account.cohort !== "heavy_schedule",
  );
  const activeCount = readIntegerOption(
    options.activeCount,
    eligibleAccounts.length,
    "activeCount",
    1,
    eligibleAccounts.length,
  );
  const accountOffset = readIntegerOption(
    options.accountOffset,
    0,
    "accountOffset",
    0,
    eligibleAccounts.length - activeCount,
  );
  const selectedAccounts = eligibleAccounts.slice(
    accountOffset,
    accountOffset + activeCount,
  );
  const refreshPacing = {
    ...pacing,
    minimumIntervalMs:
      renewalStrategy === "password_sign_in"
        ? pacing.minimumIntervalMs
        : 0,
  };
  const renewalStrategies = {
    refresh: 0,
    password_sign_in: 0,
    password_sign_in_fallback: 0,
  };

  for (const account of selectedAccounts) {
    assertNotAborted(options.signal);
    const primarySession = await renewOrdinarySession(
      config,
      account,
      account.cookies,
      refreshPacing,
      renewalStrategy,
    );
    account.cookies = primarySession.cookies;
    renewalStrategies[primarySession.strategy] += 1;
    if (includeContentionSessions && account.contention_cookies) {
      const secondarySession = await renewOrdinarySession(
        config,
        account,
        account.contention_cookies,
        refreshPacing,
        renewalStrategy,
      );
      account.contention_cookies = secondarySession.cookies;
      renewalStrategies[secondarySession.strategy] += 1;
      assertDistinctCookieJars(
        account.cookies,
        account.contention_cookies,
      );
    }
    if (
      renewalStrategy === "password_sign_in" &&
      pacing.minimumIntervalMs > 0
    ) {
      await delay(pacing.minimumIntervalMs);
    }
    await writePrivateJson(paths.metadataPath, metadata);
    await writePrivateJson(
      paths.sessionPath,
      buildSessionArtifact(metadata, config.baseUrl),
    );
  }

  return {
    sessionPath: paths.sessionPath,
    summary: {
      runId: metadata.run_id,
      refreshedAccounts: selectedAccounts.length,
      accountOffset,
      cohortFilter: cohortFilter ?? null,
      workloadClassification: context.fixtureMode,
      renewalStrategy,
      contentionSessionsRenewed:
        includeContentionSessions
          ? Object.values(renewalStrategies).reduce(
              (total, count) => total + count,
              0,
            ) - selectedAccounts.length
          : 0,
      renewalStrategies,
    },
  };
}

export async function markLoadRunOccurrenceSyncStale(options = {}) {
  assertNotAborted(options.signal);
  const context = await loadExistingLifecycleContext(options);
  const { config, metadata } = context;
  if (context.fixtureMode !== "mutation") {
    throw new LoadFixtureError(
      "Occurrence-sync operator preparation requires mutation fixtures.",
    );
  }
  const eligibleAccounts = metadata.accounts.filter(
    (account) => account.cohort !== "heavy_schedule",
  );
  const activeCount = readIntegerOption(
    options.activeCount,
    1,
    "activeCount",
    1,
    eligibleAccounts.length,
  );
  const accountOffset = readIntegerOption(
    options.accountOffset,
    0,
    "accountOffset",
    0,
    eligibleAccounts.length - activeCount,
  );
  const selectedAccounts = eligibleAccounts.slice(
    accountOffset,
    accountOffset + activeCount,
  );
  const preparedStates = [];

  for (const account of selectedAccounts) {
    assertNotAborted(options.signal);
    assertUuid(account.user_id, "operator-preparation fixture user");
    const client = createOrdinaryClientFromCookies(
      config,
      account.cookies,
    );
    const { data, error } = await client
      .from("occurrence_sync_state")
      .update({
        stale: true,
        stale_reason: "manual_repair",
      })
      .eq("user_id", account.user_id)
      .select(
        "user_id, stale, stale_reason, last_successful_sync_at, last_synced_local_date, synced_through_local_date",
      );
    if (
      error ||
      data?.length !== 1 ||
      data[0]?.user_id !== account.user_id ||
      data[0]?.stale !== true ||
      data[0]?.stale_reason !== "manual_repair"
    ) {
      throw new LoadFixtureError(
        "Ordinary-RLS occurrence-sync operator preparation failed.",
      );
    }
    preparedStates.push(data[0]);
  }

  return {
    summary: {
      runId: metadata.run_id,
      preparedAccounts: selectedAccounts.length,
      workloadClassification: context.fixtureMode,
      interface: "ordinary_rls_occurrence_sync_state",
    },
    privateEvidence: {
      runId: metadata.run_id,
      preparedStates,
    },
  };
}

export async function assertLoadRunOperatorIsolation(options = {}) {
  assertNotAborted(options.signal);
  const context = await loadExistingLifecycleContext(options);
  const { config, metadata } = context;
  if (context.fixtureMode !== "mutation") {
    throw new LoadFixtureError(
      "Protected operator isolation requires mutation fixtures.",
    );
  }

  const admin = createAdminClient(config);
  const listedUsers = await listAllAuthUsers(admin);
  const expectedUserIds = metadata.accounts.map((account) => account.user_id);
  const profiles = await fetchAllColumnValues(admin, "profiles", "id");
  const syncOwners = await fetchAllColumnValues(
    admin,
    "occurrence_sync_state",
    "user_id",
  );
  const reminderOwners = await fetchAllColumnValues(
    admin,
    "reminder_deliveries",
    "user_id",
    "id",
  );
  const evaluation = evaluateLoadRunOperatorIsolation({
    expectedUserIds,
    authUserIds: listedUsers.map((user) => user.id),
    profileUserIds: profiles,
    occurrenceSyncUserIds: syncOwners,
    reminderDeliveryUserIds: reminderOwners,
  });
  if (evaluation.passed) {
    const accountById = new Map(
      metadata.accounts.map((account) => [account.user_id, account]),
    );
    for (const user of listedUsers) {
      const account = accountById.get(user.id);
      if (!account || classifyRunUser(user, metadata.run_id) !== "exact") {
        throw new LoadFixtureError(
          "Protected operator isolation found a non-run local Auth account.",
        );
      }
      assertUserMatchesAccount(user, account, metadata.run_id);
    }
  } else {
    throw new LoadFixtureError(
      `Protected operator isolation failed: ${evaluation.failures.join("; ")}.`,
    );
  }

  return {
    summary: {
      runId: metadata.run_id,
      checks: 1,
      ...evaluation.summary,
    },
  };
}

export async function verifyPreparedLoadRunOccurrenceSyncFresh(
  options = {},
) {
  assertNotAborted(options.signal);
  const context = await loadExistingLifecycleContext(options);
  const { config, metadata } = context;
  const privateEvidence = options.privateEvidence;
  const operatorResult = options.operatorResult;
  const preparedStates = privateEvidence?.preparedStates;
  if (
    context.fixtureMode !== "mutation" ||
    privateEvidence?.runId !== metadata.run_id ||
    !Array.isArray(preparedStates) ||
    preparedStates.length === 0 ||
    !Number.isInteger(operatorResult?.synced) ||
    operatorResult.synced < preparedStates.length
  ) {
    throw new LoadFixtureError(
      "Occurrence-sync causal repair evidence is incomplete.",
    );
  }

  const runUserIds = new Set(
    metadata.accounts.map((account) => account.user_id),
  );
  const preparedUserIds = preparedStates.map((row) => row.user_id);
  if (
    new Set(preparedUserIds).size !== preparedUserIds.length ||
    preparedStates.some(
      (row) =>
        !runUserIds.has(row.user_id) ||
        row.stale !== true ||
        row.stale_reason !== "manual_repair" ||
        !isValidInstant(row.last_successful_sync_at),
    )
  ) {
    throw new LoadFixtureError(
      "Occurrence-sync causal repair preparation was not exact and stale.",
    );
  }

  const admin = createAdminClient(config);
  const { data, error } = await admin
    .from("occurrence_sync_state")
    .select(
      "user_id, stale, stale_reason, last_successful_sync_at, last_synced_local_date, synced_through_local_date",
    )
    .in("user_id", preparedUserIds);
  if (error || data?.length !== preparedStates.length) {
    throw new LoadFixtureError(
      "Occurrence-sync causal repair verification could not read every prepared account.",
    );
  }
  const afterByUser = new Map(data.map((row) => [row.user_id, row]));
  const expectedThrough = Temporal.PlainDate.from(
    metadata.anchor_local_date,
  )
    .add({ days: 30 })
    .toString();
  for (const before of preparedStates) {
    const after = afterByUser.get(before.user_id);
    if (
      !after ||
      after.stale !== false ||
      after.stale_reason !== null ||
      !isValidInstant(after.last_successful_sync_at) ||
      Temporal.Instant.compare(
        Temporal.Instant.from(after.last_successful_sync_at),
        Temporal.Instant.from(before.last_successful_sync_at),
      ) <= 0 ||
      typeof after.last_synced_local_date !== "string" ||
      after.last_synced_local_date > metadata.anchor_local_date ||
      typeof after.synced_through_local_date !== "string" ||
      after.synced_through_local_date < expectedThrough
    ) {
      throw new LoadFixtureError(
        "The exact prepared occurrence-sync account did not transition from stale to fresh.",
      );
    }
  }

  return {
    summary: {
      runId: metadata.run_id,
      preparedAccounts: preparedStates.length,
      verifiedFreshAccounts: preparedStates.length,
      aggregateSyncedAccounts: operatorResult.synced,
    },
  };
}

export async function captureLoadRunTimezoneOccurrenceSnapshot(
  options = {},
) {
  assertNotAborted(options.signal);
  const context = await loadExistingLifecycleContext(options);
  const { config, metadata } = context;
  if (context.fixtureMode !== "mutation") {
    throw new LoadFixtureError(
      "Changed-timezone preservation requires mutation fixtures.",
    );
  }
  const userIds = metadata.accounts.map((account) => account.user_id);
  const admin = createAdminClient(config);
  const occurrences = await fetchAllOwnedRows(
    admin,
    "occurrences",
    "user_id",
    "id",
    userIds,
  );
  const capturedOccurrences = occurrences.filter(
    (row) =>
      row.local_date < metadata.anchor_local_date ||
      row.status !== "unresolved",
  );
  if (
    capturedOccurrences.length === 0 ||
    !capturedOccurrences.some(
      (row) => row.local_date < metadata.anchor_local_date,
    ) ||
    !capturedOccurrences.some((row) => row.status !== "unresolved")
  ) {
    throw new LoadFixtureError(
      "Changed-timezone preservation requires both past and resolved occurrences.",
    );
  }

  return {
    summary: {
      runId: metadata.run_id,
      capturedOccurrences: capturedOccurrences.length,
    },
    privateEvidence: {
      runId: metadata.run_id,
      capturedOccurrences: capturedOccurrences.map((row) => ({
        id: row.id,
        fingerprint: occurrencePreservationFingerprint(row),
      })),
    },
  };
}

export async function verifyLoadRunTimezoneOccurrenceSnapshot(
  options = {},
) {
  assertNotAborted(options.signal);
  const context = await loadExistingLifecycleContext(options);
  const { config, metadata } = context;
  const privateEvidence = options.privateEvidence;
  if (
    context.fixtureMode !== "mutation" ||
    privateEvidence?.runId !== metadata.run_id ||
    !Array.isArray(privateEvidence?.capturedOccurrences)
  ) {
    throw new LoadFixtureError(
      "Changed-timezone preservation evidence is incomplete.",
    );
  }
  const userIds = metadata.accounts.map((account) => account.user_id);
  const admin = createAdminClient(config);
  const currentOccurrences = await fetchAllOwnedRows(
    admin,
    "occurrences",
    "user_id",
    "id",
    userIds,
  );
  const evaluation = evaluateTimezoneOccurrencePreservationSnapshot({
    capturedOccurrences: privateEvidence.capturedOccurrences,
    currentOccurrences,
  });
  if (!evaluation.passed) {
    throw new LoadFixtureError(
      `Changed-timezone occurrence preservation failed: ${evaluation.failures.join("; ")}.`,
    );
  }
  return {
    summary: {
      runId: metadata.run_id,
      ...evaluation.summary,
    },
  };
}

async function prepareLifecycleContext(options = {}) {
  const runId = validateLoadRunId(
    options.runId ?? process.env.CADENCE_LOAD_RUN_ID,
  );
  const accountCount = readIntegerOption(
    options.accountCount ?? process.env.CADENCE_LOAD_ACCOUNT_COUNT,
    DEFAULT_ACCOUNT_COUNT,
    "accountCount",
    1,
    MAX_ACCOUNT_COUNT,
  );
  const heavyCount = readIntegerOption(
    options.heavyCount ?? process.env.CADENCE_LOAD_HEAVY_COUNT,
    0,
    "heavyCount",
    0,
    accountCount,
  );
  const cohort =
    normalizeString(options.cohort ?? process.env.CADENCE_LOAD_COHORT) ??
    undefined;
  if (cohort) validateCohort(cohort);
  const fixtureMode = resolveRequestedFixtureMode(
    options.fixtureMode,
    process.env.CADENCE_LOAD_MUTATION_FIXTURES,
  );
  const config = normalizeInjectedConfig(
    options.config ?? readLocalSupabaseConfig(),
    options.baseUrl,
  );
  const paths = resolvePrivateRunPaths(
    runId,
    options.runDirectory ?? process.env.CADENCE_LOAD_RUN_DIRECTORY,
  );
  const pacing = resolveAuthPacing({
    accountCount: estimatedAuthenticationCount(
      accountCount,
      fixtureMode,
    ),
    concurrency: readIntegerOption(
      options.authConcurrency ?? process.env.CADENCE_LOAD_AUTH_CONCURRENCY,
      DEFAULT_AUTH_CONCURRENCY,
      "authConcurrency",
      1,
      MAX_AUTH_CONCURRENCY,
    ),
    minimumIntervalMs:
      options.authMinIntervalMs ??
      readOptionalInteger(
        process.env.CADENCE_LOAD_AUTH_MIN_INTERVAL_MS,
        "authMinIntervalMs",
        0,
        60_000,
      ),
  });
  await ensurePrivateDirectory(paths.directory);

  let metadata;
  let createdMetadata = false;

  if (existsSync(paths.metadataPath)) {
    metadata = await readPrivateJson(paths.metadataPath);
    validateMetadata(metadata, {
      runId,
      accountCount,
      heavyCount,
      cohort,
      baseUrl: config.baseUrl,
      supabaseUrl: config.url,
      fixtureMode,
    });
  } else {
    metadata = {
      schema_version: LOAD_SESSION_SCHEMA_VERSION,
      fixture_version: LOAD_FIXTURE_VERSION,
      target_classification: "local",
      workload_classification: fixtureMode,
      run_id: runId,
      base_url: config.baseUrl,
      supabase_url: config.url,
      timezone: options.timezone ?? DEFAULT_TIMEZONE,
      anchor_local_date:
        options.anchorLocalDate ??
        Temporal.Now.plainDateISO(options.timezone ?? DEFAULT_TIMEZONE).toString(),
      requested_account_count: accountCount,
      heavy_count: heavyCount,
      requested_cohort: cohort ?? null,
      accounts: buildAccountPlan({
        runId,
        accountCount,
        heavyCount,
        cohort,
        fixtureMode,
      }),
    };
    parsePlainDate(metadata.anchor_local_date, "anchorLocalDate");
    await writePrivateJson(paths.metadataPath, metadata);
    createdMetadata = true;
  }

  const admin = createAdminClient(config);
  return {
    admin,
    config,
    metadata,
    paths,
    pacing,
    fixtureMode,
    createdMetadata,
  };
}

async function loadExistingLifecycleContext(
  options = {},
  { requireServiceRole = true } = {},
) {
  const runId = validateLoadRunId(
    options.runId ?? process.env.CADENCE_LOAD_RUN_ID,
  );
  const config = normalizeInjectedConfig(
    options.config ??
      readLocalSupabaseConfig(process.env, ENV_FILE, {
        requireServiceRole,
      }),
    options.baseUrl,
    requireServiceRole,
  );
  const paths = resolvePrivateRunPaths(
    runId,
    options.runDirectory ?? process.env.CADENCE_LOAD_RUN_DIRECTORY,
  );

  if (!existsSync(paths.metadataPath)) {
    throw new LoadFixtureError(
      "Private load metadata is required for this lifecycle step.",
    );
  }

  const metadata = await readPrivateJson(paths.metadataPath);
  const fixtureMode = resolveRequestedFixtureMode(
    options.fixtureMode,
    process.env.CADENCE_LOAD_MUTATION_FIXTURES,
  );
  validateMetadata(metadata, {
    runId,
    accountCount: metadata.requested_account_count,
    heavyCount: metadata.heavy_count,
    cohort: metadata.requested_cohort ?? undefined,
    baseUrl: config.baseUrl,
    supabaseUrl: config.url,
    fixtureMode,
  });

  return {
    config,
    metadata,
    paths,
    fixtureMode,
    pacing: resolveAuthPacing({
      accountCount: estimatedAuthenticationCount(
        metadata.accounts.length,
        fixtureMode,
      ),
      concurrency: readIntegerOption(
        options.authConcurrency ?? process.env.CADENCE_LOAD_AUTH_CONCURRENCY,
        DEFAULT_AUTH_CONCURRENCY,
        "authConcurrency",
        1,
        MAX_AUTH_CONCURRENCY,
      ),
      minimumIntervalMs:
        options.authMinIntervalMs ??
        readOptionalInteger(
          process.env.CADENCE_LOAD_AUTH_MIN_INTERVAL_MS,
          "authMinIntervalMs",
          0,
          60_000,
        ),
    }),
  };
}

function normalizeInjectedConfig(
  config,
  baseUrlOverride,
  requireServiceRole = true,
) {
  if (config?.target !== "local") {
    throw new LoadFixtureError("Injected load config must target local.");
  }
  const url = validateLocalUrl(config.url, "Supabase URL");
  const baseUrl = validateLocalUrl(
    baseUrlOverride ?? config.baseUrl,
    "application base URL",
  );
  const publishableKey = normalizeString(config.publishableKey);
  const serviceRoleKey = normalizeString(config.serviceRoleKey);
  if (!publishableKey || (requireServiceRole && !serviceRoleKey)) {
    throw new LoadFixtureError(
      "Injected local load config is missing required keys.",
    );
  }
  return {
    target: "local",
    url,
    baseUrl,
    publishableKey,
    serviceRoleKey,
  };
}

function resolveRequestedFixtureMode(fixtureMode, mutationFlag) {
  if (fixtureMode !== undefined && fixtureMode !== null) {
    return normalizeFixtureMode(fixtureMode);
  }
  const flag = normalizeString(mutationFlag);
  if (flag === undefined || flag === "0") return "read";
  if (flag === "1") return "mutation";
  throw new LoadFixtureError(
    "CADENCE_LOAD_MUTATION_FIXTURES must be exactly 0 or 1.",
  );
}

function estimatedAuthenticationCount(accountCount, fixtureMode) {
  return Math.min(
    MAX_ACCOUNT_COUNT,
    accountCount +
      (normalizeFixtureMode(fixtureMode) === "mutation"
        ? Math.min(MAX_CONTENTION_PAIRS, accountCount)
        : 0),
  );
}

function validateInjectedFixtureMode(metadata, requestedMode) {
  const persistedMode = normalizeFixtureMode(
    metadata?.workload_classification ?? "read",
  );
  const fixtureMode =
    requestedMode === undefined
      ? persistedMode
      : normalizeFixtureMode(requestedMode);
  if (fixtureMode !== persistedMode) {
    throw new LoadFixtureError(
      "Injected fixture mode does not match private run metadata.",
    );
  }
  return fixtureMode;
}

function validateMetadata(
  metadata,
  {
    runId,
    accountCount,
    heavyCount,
    cohort,
    baseUrl,
    supabaseUrl,
    fixtureMode,
  },
) {
  const persistedFixtureMode = normalizeFixtureMode(
    metadata?.workload_classification ?? "read",
  );
  if (
    metadata?.schema_version !== LOAD_SESSION_SCHEMA_VERSION ||
    metadata?.fixture_version !== LOAD_FIXTURE_VERSION ||
    metadata?.target_classification !== "local" ||
    metadata?.run_id !== runId ||
    metadata?.base_url !== baseUrl ||
    metadata?.supabase_url !== supabaseUrl ||
    persistedFixtureMode !== normalizeFixtureMode(fixtureMode) ||
    metadata?.requested_account_count !== accountCount ||
    metadata?.heavy_count !== heavyCount ||
    (metadata?.requested_cohort ?? undefined) !== cohort ||
    !Array.isArray(metadata?.accounts) ||
    metadata.accounts.length !== accountCount
  ) {
    throw new LoadFixtureError(
      "Existing private metadata does not match the requested exact load run.",
    );
  }

  parsePlainDate(metadata.anchor_local_date, "metadata anchor date");
  const expectedPlan = buildAccountAllocation({
    accountCount,
    heavyCount,
    cohort,
    fixtureMode: persistedFixtureMode,
  });
  for (let index = 0; index < metadata.accounts.length; index += 1) {
    const account = metadata.accounts[index];
    if (
      account.ordinal !== index + 1 ||
      account.cohort !== expectedPlan[index] ||
      account.email !== buildLoadEmail(runId, account.cohort, account.ordinal) ||
      !normalizeString(account.password) ||
      !normalizeString(account.owner_marker) ||
      !normalizeString(account.forbidden_marker)
    ) {
      throw new LoadFixtureError(
        "Existing private account metadata is malformed.",
      );
    }
  }
}

export function buildSessionArtifact(metadata, baseUrl) {
  const runId = validateLoadRunId(metadata?.run_id);
  const localBaseUrl = validateLocalUrl(baseUrl, "session base URL");
  const workloadClassification = normalizeFixtureMode(
    metadata.workload_classification ?? "read",
  );
  const identities = metadata.accounts.map((account) => {
    if (!account.seeded || !account.selectors) {
      throw new LoadFixtureError(
        "Cannot write a session artifact before every identity is seeded.",
      );
    }
    if (
      !account.cookies ||
      Object.keys(account.cookies).length === 0 ||
      !Object.entries(account.cookies).every(
        ([name, value]) =>
          normalizeString(name) && typeof value === "string" && value.length > 0,
      )
    ) {
      throw new LoadFixtureError(
        "A seeded identity is missing ordinary session cookies.",
      );
    }

    return {
      cohort: account.cohort,
      cookies: account.cookies,
      selectors: account.selectors,
    };
  });
  const cookieFingerprints = identities.map((identity) =>
    createHash("sha256")
      .update(JSON.stringify(sortedObject(identity.cookies)))
      .digest("hex"),
  );

  if (new Set(cookieFingerprints).size !== identities.length) {
    throw new LoadFixtureError(
      "Session artifact identities must not share a cookie jar.",
    );
  }

  const contentionSessions =
    workloadClassification === "mutation"
      ? metadata.accounts
          .filter(
            (account) =>
              account.contention_pair_id &&
              account.contention_cookies,
          )
          .map((account) => {
            assertDistinctCookieJars(
              account.cookies,
              account.contention_cookies,
            );
            const occurrenceId =
              account.selectors?.contention_occurrence_id;
            const behaviorId =
              account.selectors?.contention_behavior_id;
            const localDate =
              account.selectors?.contention_local_date;
            const expectedStatus =
              account.selectors?.contention_occurrence_status;
            if (
              !normalizeString(account.contention_pair_id) ||
              account.contention_pair_id !==
                buildContentionPairId(runId, account.ordinal) ||
              !/^[0-9a-f-]{36}$/i.test(behaviorId ?? "") ||
              !/^\d{4}-\d{2}-\d{2}$/.test(localDate ?? "") ||
              !/^[0-9a-f-]{36}$/i.test(occurrenceId ?? "") ||
              !["unresolved", "completed", "not_completed"].includes(
                expectedStatus,
              )
            ) {
              throw new LoadFixtureError(
                "A mutation contention session is missing its exact run-owned selectors.",
              );
            }
            return {
              pair_id: account.contention_pair_id,
              cohort: account.cohort,
              primary_cookies: account.cookies,
              secondary_cookies: account.contention_cookies,
              selectors: {
                behavior_id: behaviorId,
                local_date: localDate,
                occurrence_id: occurrenceId,
                expected_status: expectedStatus,
                owner_marker: account.owner_marker,
                forbidden_marker: account.forbidden_marker,
              },
            };
          })
      : [];
  const expectedContentionPairs =
    workloadClassification === "mutation"
      ? Math.min(
          MAX_CONTENTION_PAIRS,
          metadata.accounts.filter(
            (account) => account.cohort !== "empty",
          ).length,
        )
      : 0;
  const secondaryFingerprints = contentionSessions.map((session) =>
    cookieJarFingerprint(session.secondary_cookies),
  );
  if (
    new Set(contentionSessions.map((session) => session.pair_id)).size !==
      contentionSessions.length ||
    contentionSessions.length !== expectedContentionPairs ||
    new Set(secondaryFingerprints).size !== secondaryFingerprints.length ||
    secondaryFingerprints.some((fingerprint) =>
      cookieFingerprints.includes(fingerprint),
    )
  ) {
    throw new LoadFixtureError(
      "Mutation contention sessions must have unique pair ids and secondary cookie jars.",
    );
  }

  return {
    schema_version: LOAD_SESSION_SCHEMA_VERSION,
    target_classification: "local",
    workload_classification: workloadClassification,
    run_id: runId,
    base_url: localBaseUrl,
    anchor_local_date: metadata.anchor_local_date,
    identities,
    ...(workloadClassification === "mutation"
      ? { contention_sessions: contentionSessions }
      : {}),
  };
}

function cookieJarFingerprint(cookies) {
  return createHash("sha256")
    .update(JSON.stringify(sortedObject(cookies)))
    .digest("hex");
}

function assertDistinctCookieJars(primaryCookies, secondaryCookies) {
  if (
    !isValidCookieJar(primaryCookies) ||
    !isValidCookieJar(secondaryCookies) ||
    cookieJarFingerprint(primaryCookies) ===
      cookieJarFingerprint(secondaryCookies)
  ) {
    throw new LoadFixtureError(
      "Mutation contention requires two distinct ordinary cookie jars.",
    );
  }
}

function isValidCookieJar(cookies) {
  return (
    cookies &&
    Object.keys(cookies).length > 0 &&
    Object.entries(cookies).every(
      ([name, value]) =>
        Boolean(normalizeString(name)) &&
        typeof value === "string" &&
        value.length > 0,
    )
  );
}

async function seedFixtureThroughRls(client, fixture) {
  await upsertRows(client, "behaviors", fixture.behaviors, "id");
  await upsertRows(client, "behavior_schedules", fixture.schedules, "id");
  await upsertRows(client, "behavior_schedule_slots", fixture.slots, "id");
  await upsertRows(client, "occurrences", fixture.occurrences, "id");
  await insertAppendOnlyRowsIdempotently(
    client,
    "behavior_definition_events",
    fixture.definitionEvents,
  );
  await insertAppendOnlyRowsIdempotently(
    client,
    "occurrence_status_events",
    fixture.statusEvents,
  );
  await upsertRows(client, "reminder_deliveries", fixture.reminders, "id");
  await upsertRows(
    client,
    "occurrence_sync_state",
    [fixture.syncState],
    "user_id",
  );
}

async function upsertRows(client, table, rows, conflictColumn) {
  for (const chunk of chunkRows(rows, 250)) {
    const { error } = await client
      .from(table)
      .upsert(chunk, { onConflict: conflictColumn });
    if (error) {
      throw new LoadFixtureError(
        `Ordinary-RLS fixture write failed for ${table}.`,
      );
    }
  }
}

export async function insertAppendOnlyRowsIdempotently(
  client,
  table,
  rows,
) {
  for (const chunk of chunkRows(rows, 250)) {
    const { error } = await client
      .from(table)
      .upsert(chunk, {
        onConflict: "id",
        ignoreDuplicates: true,
      });
    if (error) {
      throw new LoadFixtureError(
        `Ordinary-RLS append-only fixture write failed for ${table}.`,
      );
    }
  }
}

async function waitForOnboardingRows(client, userId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [profileResult, categoryResult] = await Promise.all([
      client.from("profiles").select("id").eq("id", userId).maybeSingle(),
      client
        .from("categories")
        .select("id, name")
        .eq("user_id", userId)
        .order("sort_order"),
    ]);

    if (
      !profileResult.error &&
      profileResult.data &&
      !categoryResult.error &&
      categoryResult.data?.length === DEFAULT_CATEGORY_NAMES.length
    ) {
      const names = categoryResult.data.map((row) => row.name);
      const other = categoryResult.data.find((row) => row.name === "Other");
      if (
        other &&
        DEFAULT_CATEGORY_NAMES.every((name) => names.includes(name))
      ) {
        return { otherCategoryId: other.id };
      }
    }

    await delay(250);
  }

  throw new LoadFixtureError(
    "Timed out waiting for the disposable account onboarding rows.",
  );
}

async function updateFixtureProfileTimezone(client, userId, timezone) {
  const { data, error } = await client
    .from("profiles")
    .update({ timezone })
    .eq("id", userId)
    .select("id");
  if (error || data?.length !== 1) {
    throw new LoadFixtureError(
      "Ordinary-RLS fixture profile update failed.",
    );
  }
}

async function signInOrdinaryAccount(config, account) {
  const cookieJar = new Map();
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return [...cookieJar].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          if (cookie.value) cookieJar.set(cookie.name, cookie.value);
          else cookieJar.delete(cookie.name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });

  if (error) {
    const retryable = isAuthRateLimitError(error);
    const failure = new LoadFixtureError(
      retryable
        ? "Local Auth rate limit delayed fixture session preparation."
        : "Unable to prepare an ordinary fixture session.",
    );
    failure.retryable = retryable;
    throw failure;
  }

  return {
    client,
    cookies: Object.fromEntries(cookieJar),
  };
}

async function createLoadUser(admin, runId, account) {
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    app_metadata: {
      cadence_load_fixture_version: LOAD_FIXTURE_VERSION,
      cadence_load_run_id: runId,
      cadence_load_cohort: account.cohort,
      cadence_load_ordinal: account.ordinal,
    },
    user_metadata: {
      name: "Cadence synthetic load fixture",
    },
  });

  if (error || !data.user) {
    const retryable = isAuthRateLimitError(error);
    const failure = new LoadFixtureError(
      retryable
        ? "Local Auth rate limit delayed fixture provisioning."
        : "Unable to create a disposable load identity.",
    );
    failure.retryable = retryable;
    throw failure;
  }

  return data.user;
}

async function withAuthRetry(operation, pacing) {
  for (let attempt = 1; attempt <= pacing.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!error?.retryable || attempt === pacing.maxAttempts) throw error;
      await delay(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
    }
  }
  throw new LoadFixtureError("Local Auth retry budget was exhausted.");
}

function isAuthRateLimitError(error) {
  const text = `${error?.code ?? ""} ${error?.status ?? ""} ${
    error?.message ?? ""
  }`.toLowerCase();
  return (
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("too many requests")
  );
}

function createAdminClient(config) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function listAllAuthUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      throw new LoadFixtureError(
        "Unable to enumerate local Auth users for exact run reconciliation.",
      );
    }
    const pageUsers = data.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) break;
  }
  return users;
}

async function fetchAllColumnValues(
  client,
  table,
  column,
  orderColumn = column,
) {
  const values = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client
      .from(table)
      .select(column)
      .order(orderColumn)
      .range(start, start + 999);
    if (error) {
      throw new LoadFixtureError(
        `Unable to enumerate ${table} for protected operator isolation.`,
      );
    }
    values.push(
      ...(data ?? []).map((row) => row[column]).filter(Boolean),
    );
    if ((data?.length ?? 0) < 1000) break;
  }
  return values;
}

function classifyListedUsers(users, runId) {
  const result = { exact: [], suspicious: [], unrelated: [] };
  for (const user of users) {
    result[classifyRunUser(user, runId)].push(user);
  }
  return result;
}

function assertUserMatchesAccount(user, account, runId) {
  if (
    user.email?.toLowerCase() !== account.email.toLowerCase() ||
    user.app_metadata?.cadence_load_run_id !== runId ||
    user.app_metadata?.cadence_load_cohort !== account.cohort ||
    Number(user.app_metadata?.cadence_load_ordinal) !== account.ordinal
  ) {
    throw new LoadFixtureError(
      "An exact run identity did not match its private account plan.",
    );
  }
}

function fixturePlanDigest(fixture) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        behaviors: fixture.behaviors,
        schedules: fixture.schedules,
        slots: fixture.slots,
        occurrences: fixture.occurrences,
        statusEvents: fixture.statusEvents,
        definitionEvents: fixture.definitionEvents,
        reminders: fixture.reminders,
        syncState: fixture.syncState,
      }),
    )
    .digest("hex");
}

async function ensurePrivateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertPrivateDirectory(directory);
  await chmod(directory, 0o700);
}

async function assertPrivateDirectory(directory) {
  const directoryStat = await lstat(directory);
  if (
    directoryStat.isSymbolicLink() ||
    !directoryStat.isDirectory()
  ) {
    throw new LoadFixtureError(
      "Private load run directory must not traverse symbolic links.",
    );
  }
}

async function readPrivateJson(filePath) {
  const fileLinkStat = await lstat(filePath);
  const fileStat = await stat(filePath);
  if (fileLinkStat.isSymbolicLink() || (fileStat.mode & 0o077) !== 0) {
    throw new LoadFixtureError(
      "Private load metadata must use owner-only permissions.",
    );
  }
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new LoadFixtureError("Private load metadata is invalid.");
  }
}

async function writePrivateJson(filePath, value) {
  const directory = path.dirname(filePath);
  await ensurePrivateDirectory(directory);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new LoadFixtureError(
      "Unable to write owner-only private load metadata.",
    );
  }
}

function sortedObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function readIntegerOption(value, fallback, label, minimum, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  validatePositiveInteger(numeric, label, minimum, maximum);
  return numeric;
}

function readOptionalInteger(value, label, minimum, maximum) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  validatePositiveInteger(numeric, label, minimum, maximum);
  return numeric;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertNotAborted(signal) {
  if (signal?.aborted) {
    throw new LoadFixtureError(
      "The local load lifecycle was interrupted before its next operation.",
    );
  }
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}

export async function verifyLoadRunIntegrity(options = {}) {
  const context = await loadExistingLifecycleContext(options);
  const { config, metadata } = context;
  const admin = createAdminClient(config);
  const userIds = metadata.accounts.map((account) => account.user_id);
  if (!userIds.every((id) => typeof id === "string")) {
    throw new LoadFixtureError(
      "Integrity verification requires every provisioned user id.",
    );
  }

  const snapshot = await readOwnedSnapshot(admin, userIds);
  const evaluation = evaluateFixtureIntegrity(snapshot, metadata);
  if (evaluation.totalViolations > 0) {
    const detail = Object.entries(evaluation.violations)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, count]) => `${name}=${count}`)
      .join(", ");
    throw new LoadFixtureError(
      `Load fixture integrity failed with ${evaluation.totalViolations} aggregate violation(s): ${detail}.`,
    );
  }

  await verifyOrdinaryRlsBoundaries(config, metadata);
  await verifyExportOwnership(config, metadata, snapshot);

  return {
    summary: {
      runId: metadata.run_id,
      checkedAccounts: metadata.accounts.length,
      totalRows: evaluation.totalRows,
      violations: 0,
      workloadClassification: normalizeFixtureMode(
        metadata.workload_classification ?? "read",
      ),
      integrityChecks: evaluation.checks,
      rowCounts: evaluation.metrics.rowCounts,
      reminderStatuses: evaluation.metrics.reminderStatuses,
      operatorReminderStatuses:
        evaluation.metrics.operatorReminderStatuses,
      cancellationReminderStatuses:
        evaluation.metrics.cancellationReminderStatuses,
      activePushSubscriptions:
        evaluation.metrics.activePushSubscriptions,
      databaseConnectionCount:
        evaluation.metrics.databaseConnectionCount,
      mutationDeltas: evaluation.metrics.mutationDeltas,
      statusTransitionEvidence:
        evaluation.metrics.statusTransitionEvidence,
      duePastReminderNonReactivation:
        evaluation.metrics.duePastReminderNonReactivation,
      cohorts: buildCohortSummary(metadata.accounts),
    },
  };
}

export function evaluateFixtureIntegrity(snapshot, metadata) {
  const violations = {};
  const add = (name, count = 1) => {
    if (count > 0) violations[name] = (violations[name] ?? 0) + count;
  };
  const userIds = new Set(metadata.accounts.map((account) => account.user_id));
  const workloadClassification = normalizeFixtureMode(
    metadata.workload_classification ?? "read",
  );
  const mutationMode = workloadClassification === "mutation";
  const integrityNow = metadata.integrity_now
    ? Temporal.Instant.from(metadata.integrity_now)
    : Temporal.Now.instant();
  const profiles = snapshot.profiles ?? [];
  const categories = snapshot.categories ?? [];
  const behaviors = snapshot.behaviors ?? [];
  const schedules = snapshot.behavior_schedules ?? [];
  const slots = snapshot.behavior_schedule_slots ?? [];
  const occurrences = snapshot.occurrences ?? [];
  const statusEvents = snapshot.occurrence_status_events ?? [];
  const definitionEvents = snapshot.behavior_definition_events ?? [];
  const reminders = snapshot.reminder_deliveries ?? [];
  const syncStates = snapshot.occurrence_sync_state ?? [];
  const behaviorById = new Map(behaviors.map((row) => [row.id, row]));
  const scheduleById = new Map(schedules.map((row) => [row.id, row]));
  const slotById = new Map(slots.map((row) => [row.id, row]));
  const occurrenceById = new Map(occurrences.map((row) => [row.id, row]));
  const statusEventById = new Map(statusEvents.map((row) => [row.id, row]));

  for (const account of metadata.accounts) {
    const accountProfiles = profiles.filter(
      (profile) => profile.id === account.user_id,
    );
    const accountCategories = categories.filter(
      (category) => category.user_id === account.user_id,
    );
    const accountBehaviors = behaviors.filter(
      (behavior) => behavior.user_id === account.user_id,
    );
    const accountSchedules = schedules.filter(
      (schedule) => schedule.user_id === account.user_id,
    );
    const accountSlots = slots.filter(
      (slot) => slot.user_id === account.user_id,
    );
    const accountOccurrences = occurrences.filter(
      (occurrence) => occurrence.user_id === account.user_id,
    );
    const accountStatusEvents = statusEvents.filter(
      (event) => event.user_id === account.user_id,
    );
    const accountDefinitionEvents = definitionEvents.filter(
      (event) => event.user_id === account.user_id,
    );
    const accountReminders = reminders.filter(
      (delivery) => delivery.user_id === account.user_id,
    );
    const accountSync = syncStates.filter(
      (state) => state.user_id === account.user_id,
    );
    const expected = account.expected?.counts;
    const profileTimezone =
      accountProfiles.length === 1
        ? normalizeString(accountProfiles[0].timezone)
        : undefined;
    const otherCategory = accountCategories.find(
      (category) => category.name === "Other",
    );
    const baselinePlan =
      mutationMode && otherCategory
        ? buildFixturePlan({
            runId: metadata.run_id,
            account,
            categoryId: otherCategory.id,
            anchorLocalDate: metadata.anchor_local_date,
            timezone: metadata.timezone,
            fixtureMode: "mutation",
          })
        : null;

    add("profile_count", Math.abs(accountProfiles.length - 1));
    add(
      "profile_timezone",
      Number(
        accountProfiles.length === 1 &&
          (mutationMode
            ? !isValidTimezone(profileTimezone)
            : profileTimezone !== metadata.timezone),
      ),
    );
    add(
      "default_category_count",
      Math.abs(accountCategories.length - DEFAULT_CATEGORY_NAMES.length),
    );
    const categoryNames = new Set(accountCategories.map((row) => row.name));
    add(
      "default_category_names",
      DEFAULT_CATEGORY_NAMES.filter((name) => !categoryNames.has(name)).length,
    );

    if (expected && !mutationMode) {
      add(
        "behavior_count",
        Math.abs(accountBehaviors.length - expected.behaviors),
      );
      add(
        "schedule_count",
        Math.abs(accountSchedules.length - expected.schedules),
      );
      add("slot_count", Math.abs(accountSlots.length - expected.slots));
      add(
        "occurrence_count",
        Math.abs(accountOccurrences.length - expected.occurrences),
      );
      add(
        "status_event_count",
        Math.abs(accountStatusEvents.length - expected.statusEvents),
      );
      add(
        "definition_event_count",
        Math.abs(
          accountDefinitionEvents.length - expected.definitionEvents,
        ),
      );
      add(
        "reminder_count",
        Math.abs(accountReminders.length - expected.reminders),
      );
    } else if (expected && mutationMode) {
      const limits = {
        ...MUTATION_GROWTH_LIMITS,
        ...(account.expected?.mutationLimits ?? {}),
      };
      add(
        "behavior_count_below_baseline",
        Math.max(0, expected.behaviors - accountBehaviors.length),
      );
      add(
        "behavior_growth_limit",
        Math.max(
          0,
          accountBehaviors.length -
            expected.behaviors -
            limits.behaviorGrowth,
        ),
      );
      add(
        "schedule_growth_limit",
        Math.max(
          0,
          accountSchedules.length -
            expected.schedules -
            limits.scheduleGrowth,
        ),
      );
      add(
        "slot_growth_limit",
        Math.max(
          0,
          accountSlots.length - expected.slots - limits.slotGrowth,
        ),
      );
      add(
        "occurrence_growth_limit",
        Math.max(
          0,
          accountOccurrences.length -
            expected.occurrences -
            limits.occurrenceGrowth,
        ),
      );
      add(
        "status_event_count_below_baseline",
        Math.max(0, expected.statusEvents - accountStatusEvents.length),
      );
      add(
        "status_event_growth_limit",
        Math.max(
          0,
          accountStatusEvents.length -
            expected.statusEvents -
            limits.statusEventGrowth,
        ),
      );
      add(
        "definition_event_count_below_baseline",
        Math.max(
          0,
          expected.definitionEvents - accountDefinitionEvents.length,
        ),
      );
      add(
        "definition_event_growth_limit",
        Math.max(
          0,
          accountDefinitionEvents.length -
            expected.definitionEvents -
            limits.definitionEventGrowth,
        ),
      );
      add(
        "reminder_growth_limit",
        Math.max(
          0,
          accountReminders.length -
            expected.reminders -
            limits.reminderGrowth,
        ),
      );
    } else {
      add("missing_expected_metadata");
    }

    add("sync_state_count", Math.abs(accountSync.length - 1));
    if (accountSync.length === 1) {
      const sync = accountSync[0];
      const expectedThrough = parsePlainDate(
        metadata.anchor_local_date,
        "anchor",
      ).add({ days: 30 });
      add(
        "false_fresh_horizon",
        Number(
          sync.stale !== false ||
            sync.stale_reason !== null ||
            sync.timezone !==
              (mutationMode ? profileTimezone : metadata.timezone) ||
            !sync.last_successful_sync_at ||
            (sync.last_successful_sync_at &&
              Temporal.Instant.compare(
                Temporal.Instant.from(sync.last_successful_sync_at),
                integrityNow,
              ) > 0) ||
            !sync.last_synced_local_date ||
            !sync.synced_through_local_date ||
            Temporal.PlainDate.compare(
              Temporal.PlainDate.from(sync.last_synced_local_date),
              Temporal.PlainDate.from(metadata.anchor_local_date),
            ) > 0 ||
            Temporal.PlainDate.compare(
              Temporal.PlainDate.from(sync.synced_through_local_date),
              expectedThrough,
            ) < 0 ||
            (mutationMode &&
              accountBehaviors
                .filter((behavior) => behavior.active)
                .some(
                  (behavior) => behavior.timezone !== profileTimezone,
                )),
        ),
      );
    }

    if (mutationMode) {
      add(
        "false_fresh_occurrence_set",
        evaluateMutationHorizonCoverage({
          behaviors: accountBehaviors,
          schedules: accountSchedules,
          slots: accountSlots,
          occurrences: accountOccurrences,
          anchorLocalDate: metadata.anchor_local_date,
          throughLocalDate: parsePlainDate(
            metadata.anchor_local_date,
            "anchor",
          )
            .add({ days: 30 })
            .toString(),
        }),
      );
      if (baselinePlan) {
        addBaselineAppendOnlyViolations(
          add,
          accountStatusEvents,
          baselinePlan.statusEvents,
          "status",
        );
        addBaselineAppendOnlyViolations(
          add,
          accountDefinitionEvents,
          baselinePlan.definitionEvents,
          "definition",
        );
        addBaselineOccurrencePreservationViolations(
          add,
          accountOccurrences,
          baselinePlan.occurrences,
          metadata.anchor_local_date,
        );
        addBaselineReminderPreservationViolations(
          add,
          accountReminders,
          baselinePlan.reminders,
          baselinePlan.occurrences,
          metadata.anchor_local_date,
        );
        const scheduleOnlyBehaviorId =
          baselinePlan.selectors.schedule_only_behavior_id;
        const baselineScheduleOnlyCount =
          baselinePlan.definitionEvents.filter(
            (event) => event.behavior_id === scheduleOnlyBehaviorId,
          ).length;
        add(
          "schedule_only_definition_event",
          Math.abs(
            accountDefinitionEvents.filter(
              (event) =>
                event.behavior_id === scheduleOnlyBehaviorId,
            ).length - baselineScheduleOnlyCount,
          ),
        );
      } else {
        add("mutation_baseline_missing");
      }
    } else {
      const actualFutureKeys = accountOccurrences
        .filter((occurrence) => {
          const date = Temporal.PlainDate.from(occurrence.local_date);
          const anchor = Temporal.PlainDate.from(metadata.anchor_local_date);
          return (
            Temporal.PlainDate.compare(date, anchor) >= 0 &&
            Temporal.PlainDate.compare(date, anchor.add({ days: 30 })) <= 0
          );
        })
        .map(occurrenceKey)
        .sort();
      const expectedFutureKeys =
        account.expected?.futureOccurrenceKeys?.slice().sort() ?? [];
      add(
        "false_fresh_occurrence_set",
        symmetricDifferenceCount(actualFutureKeys, expectedFutureKeys),
      );

      const expectedReminderIds = new Set(
        buildExpectedReminderIds(account, metadata, accountCategories),
      );
      add(
        "unexpected_reminder",
        accountReminders.filter(
          (row) =>
            !expectedReminderIds.has(row.id) ||
            row.status === "pending" ||
            row.processing_started_at !== null,
        ).length,
      );
      add(
        "unexpected_provider_enablement",
        accountBehaviors.filter(
          (row) => row.email_reminder_enabled !== false,
        ).length,
      );
    }

  }

  for (const row of [
    ...categories,
    ...behaviors,
    ...schedules,
    ...slots,
    ...occurrences,
    ...statusEvents,
    ...definitionEvents,
    ...reminders,
    ...syncStates,
  ]) {
    add("unknown_owner", Number(!userIds.has(row.user_id)));
  }
  for (const profile of profiles) {
    add("unknown_profile_owner", Number(!userIds.has(profile.id)));
  }

  for (const behavior of behaviors) {
    if (mutationMode) {
      const account = metadata.accounts.find(
        (candidate) => candidate.user_id === behavior.user_id,
      );
      add(
        "synthetic_behavior_marker",
        Number(
          !account ||
            typeof behavior.title !== "string" ||
            !behavior.title.includes(account.owner_marker),
        ),
      );
    }
    if (behavior.category_id) {
      const category = categories.find(
        (row) => row.id === behavior.category_id,
      );
      add(
        "behavior_category_owner",
        Number(!category || category.user_id !== behavior.user_id),
      );
    }
    add(
      "behavior_schedule_missing",
      Number(
        !schedules.some(
          (schedule) =>
            schedule.user_id === behavior.user_id &&
            schedule.behavior_id === behavior.id,
        ),
      ),
    );
    const primarySchedule = schedules
      .filter(
        (schedule) =>
          schedule.user_id === behavior.user_id &&
          schedule.behavior_id === behavior.id,
      )
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.id.localeCompare(right.id),
      )[0];
    const primarySlot = slots
      .filter(
        (slot) =>
          slot.user_id === behavior.user_id &&
          slot.behavior_schedule_id === primarySchedule?.id,
      )
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.start_time.localeCompare(right.start_time),
      )[0];
    add(
      "behavior_compatibility_snapshot",
      Number(
        !primarySchedule ||
          !primarySlot ||
          canonicalJson(primarySchedule.recurrence_rule) !==
            canonicalJson(behavior.recurrence_rule) ||
          canonicalTime(primarySlot.start_time) !==
            canonicalTime(behavior.scheduled_time),
      ),
    );
  }

  for (const schedule of schedules) {
    const behavior = behaviorById.get(schedule.behavior_id);
    add(
      "schedule_behavior_owner",
      Number(!behavior || behavior.user_id !== schedule.user_id),
    );
    add(
      "schedule_slot_missing",
      Number(
        !slots.some(
          (slot) =>
            slot.user_id === schedule.user_id &&
            slot.behavior_schedule_id === schedule.id,
        ),
      ),
    );
  }

  for (const slot of slots) {
    const behavior = behaviorById.get(slot.behavior_id);
    const schedule = scheduleById.get(slot.behavior_schedule_id);
    add(
      "slot_owner_relationship",
      Number(
        !behavior ||
          !schedule ||
          behavior.user_id !== slot.user_id ||
          schedule.user_id !== slot.user_id ||
          schedule.behavior_id !== slot.behavior_id,
      ),
    );
    add(
      "slot_shape",
      Number(
        (slot.kind === "exact" &&
          (slot.preset !== null || slot.end_time !== null)) ||
          (slot.kind === "range" && slot.end_time === null) ||
          !["exact", "range"].includes(slot.kind),
      ),
    );
  }

  for (const occurrence of occurrences) {
    const behavior = behaviorById.get(occurrence.behavior_id);
    const slot = slotById.get(occurrence.behavior_schedule_slot_id);
    add(
      "occurrence_owner_relationship",
      Number(
        !behavior ||
          !slot ||
          behavior.user_id !== occurrence.user_id ||
          slot.user_id !== occurrence.user_id ||
          slot.behavior_id !== occurrence.behavior_id,
      ),
    );
    add(
      "occurrence_snapshot_status",
      Number(
        (occurrence.status === "unresolved" &&
          (occurrence.completed_at !== null ||
            occurrence.status_marked_at !== null)) ||
          (occurrence.status === "completed" &&
            (!occurrence.completed_at || !occurrence.status_marked_at)) ||
          (occurrence.status === "not_completed" &&
            (occurrence.completed_at !== null ||
              !occurrence.status_marked_at)) ||
          !["unresolved", "completed", "not_completed"].includes(
            occurrence.status,
          ),
      ),
    );
  }

  add(
    "duplicate_occurrence",
    duplicateCount(
      occurrences.map((row) => `${row.behavior_id}|${row.scheduled_for}`),
    ),
  );
  add(
    "duplicate_occurrence_semantic",
    duplicateCount(occurrences.map(occurrenceKey)),
  );
  add(
    "duplicate_reminder",
    duplicateCount(
      reminders.map(reminderSemanticKey),
    ),
  );

  const statusGroups = groupBy(statusEvents, (event) => event.occurrence_id);
  for (const [occurrenceId, events] of statusGroups) {
    const occurrence = occurrenceById.get(occurrenceId);
    add(
      "status_event_owner",
      Number(
        !occurrence ||
          events.some(
            (event) =>
              event.user_id !== occurrence.user_id ||
              event.behavior_id !== occurrence.behavior_id ||
              event.local_date !== occurrence.local_date,
          ),
      ),
    );
    const chain = resolveStatusEventChain(events);
    add("status_event_chain_shape", chain.violations);
    for (let index = 0; index < chain.ordered.length; index += 1) {
      const event = chain.ordered[index];
      const prior = chain.ordered[index - 1];
      add(
        "status_event_vocabulary",
        Number(
          !["unresolved", "completed", "not_completed"].includes(
            event.previous_status,
          ) ||
            !["unresolved", "completed", "not_completed"].includes(
              event.status,
            ) ||
            event.previous_status === event.status,
        ),
      );
      if (index === 0) {
        add(
          "status_event_initial_chain",
          Number(
            event.previous_status !== "unresolved" ||
              event.revises_event_id !== null ||
              event.status_semantics !== "explicit_user_mark",
          ),
        );
      } else {
        add(
          "status_event_correction_chain",
          Number(
            event.previous_status !== prior.status ||
              event.revises_event_id !== prior.id ||
              event.status_semantics !== "explicit_user_correction" ||
              statusEventById.get(event.revises_event_id)?.occurrence_id !==
                event.occurrence_id ||
              Temporal.Instant.compare(
                Temporal.Instant.from(event.recorded_at),
                Temporal.Instant.from(prior.recorded_at),
              ) < 0,
          ),
        );
      }
      add(
        "status_event_timestamp_semantics",
        Number(
          (event.status === "unresolved" &&
            event.effective_at !== null) ||
            (event.status !== "unresolved" &&
              (!event.effective_at ||
                canonicalInstant(event.effective_at) !==
                  canonicalInstant(event.recorded_at))),
        ),
      );
    }
    const latest = chain.ordered.at(-1);
    add(
      "status_event_latest_snapshot",
      Number(
        !occurrence ||
          !latest ||
          latest.status !== occurrence.status ||
          (occurrence.status === "unresolved"
            ? occurrence.status_marked_at !== null
            : canonicalInstant(latest.recorded_at) !==
              canonicalInstant(occurrence.status_marked_at)),
      ),
    );
  }
  add(
    "resolved_without_status_event",
    occurrences.filter(
      (occurrence) =>
        occurrence.status !== "unresolved" &&
        !statusGroups.has(occurrence.id),
    ).length,
  );

  const definitionGroups = groupBy(
    definitionEvents,
    (event) => event.behavior_id,
  );
  for (const behavior of behaviors) {
    const events = definitionGroups.get(behavior.id) ?? [];
    const chain = resolveDefinitionEventChain(events);
    const ordered = chain.ordered;
    add("definition_baseline_missing", Number(events.length === 0));
    add("definition_chain_shape", chain.violations);
    if (events.length === 0) continue;
    if (ordered.length === 0) continue;
    for (let index = 0; index < ordered.length; index += 1) {
      const event = ordered[index];
      const prior = ordered[index - 1];
      add(
        "definition_owner",
        Number(event.user_id !== behavior.user_id),
      );
      const changedFields = Array.isArray(event.changed_fields)
        ? event.changed_fields
        : [];
      add(
        "definition_changed_fields",
        Number(
          !["title", "description"].every(
            (field) =>
              changedFields.includes(field) ===
              (field === "title"
                ? event.previous_title !== event.next_title
                : event.previous_description !== event.next_description),
          ) ||
            changedFields.length === 0 ||
            changedFields.some(
              (field) => !["title", "description"].includes(field),
            ),
        ),
      );
      if (index === 0) {
        add(
          "definition_initial_chain",
          Number(
            event.previous_title !== null ||
              event.previous_description !== null,
          ),
        );
      } else {
        add(
          "definition_revision_chain",
          Number(
            event.previous_title !== prior.next_title ||
              event.previous_description !== prior.next_description ||
              Temporal.Instant.compare(
                Temporal.Instant.from(event.recorded_at),
                Temporal.Instant.from(prior.recorded_at),
              ) < 0,
          ),
        );
      }
      add(
        "definition_append_only_timestamps",
        Number(!definitionEventHasValidAppendOnlyTimestamps(event)),
      );
    }
    const latest = ordered.at(-1);
    add(
      "definition_latest_snapshot",
      Number(
        latest.next_title !== behavior.title ||
          latest.next_description !== behavior.description,
      ),
    );
  }
  for (const event of definitionEvents) {
    const behavior = behaviorById.get(event.behavior_id);
    add(
      "definition_orphan",
      Number(!behavior || behavior.user_id !== event.user_id),
    );
  }

  for (const reminder of reminders) {
    const occurrence = occurrenceById.get(reminder.occurrence_id);
    add(
      "reminder_owner_relationship",
      Number(!occurrence || occurrence.user_id !== reminder.user_id),
    );
    const behavior = occurrence
      ? behaviorById.get(occurrence.behavior_id)
      : undefined;
    const expectedIdentity =
      occurrence && behavior
        ? reminderMatchesCurrentBehavior(reminder, occurrence, behavior)
        : false;
    const scheduledInFuture =
      isValidInstant(reminder.scheduled_send_at) &&
      Temporal.Instant.compare(
        Temporal.Instant.from(reminder.scheduled_send_at),
        integrityNow,
      ) > 0;
    add(
      "reminder_shape",
      Number(
        !["browser_push", "email"].includes(reminder.channel) ||
          !["pending", "sent", "failed", "cancelled"].includes(
            reminder.status,
          ) ||
          (reminder.status === "sent"
            ? !reminder.sent_at
            : reminder.sent_at !== null) ||
          (reminder.status === "failed"
            ? !normalizeString(reminder.error)
            : reminder.error !== null),
      ),
    );
    add(
      "stuck_processing_claim",
      Number(
        reminder.status === "pending" &&
          reminder.processing_started_at !== null,
      ),
    );
    add(
      "resolved_pending_reminder",
      Number(
        occurrence?.status !== "unresolved" &&
          reminder.status === "pending",
      ),
    );
    add(
      "unexpected_pending_reminder",
      Number(
        occurrence?.status === "unresolved" &&
          reminder.status === "pending" &&
          !expectedIdentity,
      ),
    );
    add(
      "future_eligible_reminder_not_reactivated",
      Number(
        occurrence?.status === "unresolved" &&
          behavior?.active === true &&
          expectedIdentity &&
          scheduledInFuture &&
          reminder.status === "cancelled",
      ),
    );
  }
  if (mutationMode) {
    for (const account of metadata.accounts) {
      const occurrenceId =
        account.selectors?.due_past_clear_occurrence_id;
      const deliveryId =
        account.selectors?.due_past_clear_delivery_id;
      const operatorOccurrenceId =
        account.selectors?.due_reminder_occurrence_id;
      const occurrence = occurrenceById.get(occurrenceId);
      const delivery = reminders.find(
        (candidate) => candidate.id === deliveryId,
      );
      add(
        "due_past_clear_fixture_missing",
        Number(!occurrence || !delivery),
      );
      add(
        "due_past_clear_selector_overlap",
        Number(
          typeof occurrenceId !== "string" ||
            occurrenceId === operatorOccurrenceId,
        ),
      );
      if (!occurrence || !delivery) continue;
      add(
        "due_past_clear_owner",
        Number(
          occurrence.user_id !== account.user_id ||
            delivery.user_id !== account.user_id ||
            delivery.occurrence_id !== occurrence.id,
        ),
      );
      add(
        "due_past_clear_not_past",
        Number(
          occurrence.local_date >= metadata.anchor_local_date ||
            !isValidInstant(delivery.scheduled_send_at) ||
            (isValidInstant(delivery.scheduled_send_at) &&
              Temporal.Instant.compare(
                Temporal.Instant.from(delivery.scheduled_send_at),
                integrityNow,
              ) > 0),
        ),
      );
      add(
        "due_past_clear_reminder_reactivated",
        Number(
          statusEvents.some(
            (event) =>
              event.occurrence_id === occurrence.id &&
              event.status === "unresolved",
          ) && delivery.status !== "cancelled",
        ),
      );
    }
  }
  if (mutationMode) {
    const reminderIdentities = new Set(reminders.map(reminderSemanticKey));
    for (const occurrence of occurrences) {
      if (occurrence.status !== "unresolved") continue;
      const behavior = behaviorById.get(occurrence.behavior_id);
      if (!behavior?.active) continue;
      for (const channel of [
        ...(behavior.browser_reminder_enabled ? ["browser_push"] : []),
        ...(behavior.email_reminder_enabled ? ["email"] : []),
      ]) {
        const scheduledSendAt = Temporal.Instant.from(
          occurrence.scheduled_for,
        ).subtract({ minutes: behavior.reminder_offset_minutes });
        if (Temporal.Instant.compare(scheduledSendAt, integrityNow) <= 0) {
          continue;
        }
        add(
          "missing_future_reminder",
          Number(
            !reminderIdentities.has(
              reminderSemanticKey({
                occurrence_id: occurrence.id,
                channel,
                scheduled_send_at: scheduledSendAt.toString(),
              }),
            ),
          ),
        );
      }
    }
  }

  const forbiddenTables = [
    "push_subscriptions",
    "behaviorlog_import_runs",
    "behaviorlog_import_record_mappings",
    "imported_notes",
    "imported_interventions",
  ];
  for (const table of forbiddenTables) {
    add(`unexpected_${table}`, snapshot[table]?.length ?? 0);
  }
  add(
    "unexpected_active_push_subscription",
    (snapshot.push_subscriptions ?? []).filter((row) => row.active !== false)
      .length,
  );

  const totalViolations = Object.values(violations).reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalRows = Object.values(snapshot).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
  const checks = buildIntegrityChecks(violations);
  const metrics = buildIntegrityMetrics(snapshot, metadata);

  return {
    violations,
    totalViolations,
    totalRows,
    checks,
    metrics,
  };
}

function isValidTimezone(value) {
  if (!normalizeString(value)) return false;
  try {
    Temporal.Instant.from("2020-01-01T00:00:00Z").toZonedDateTimeISO(value);
    return true;
  } catch {
    return false;
  }
}

function isValidInstant(value) {
  try {
    Temporal.Instant.from(value);
    return true;
  } catch {
    return false;
  }
}

function evaluateMutationHorizonCoverage({
  behaviors,
  schedules,
  slots,
  occurrences,
  anchorLocalDate,
  throughLocalDate,
}) {
  const start = parsePlainDate(anchorLocalDate, "horizon start");
  const end = parsePlainDate(throughLocalDate, "horizon end");
  const schedulesByBehavior = groupBy(
    schedules,
    (schedule) => schedule.behavior_id,
  );
  const slotsBySchedule = groupBy(
    slots,
    (slot) => slot.behavior_schedule_id,
  );
  const desired = new Set();
  let malformedGraphs = 0;

  for (const behavior of behaviors) {
    if (!behavior.active) continue;
    const timezone = normalizeString(behavior.timezone);
    if (!isValidTimezone(timezone) || !isValidInstant(behavior.created_at)) {
      malformedGraphs += 1;
      continue;
    }
    const behaviorAnchor = Temporal.Instant.from(behavior.created_at)
      .toZonedDateTimeISO(timezone)
      .toPlainDate();
    const behaviorSchedules = schedulesByBehavior.get(behavior.id) ?? [];
    if (behaviorSchedules.length === 0) {
      malformedGraphs += 1;
      continue;
    }

    for (const schedule of behaviorSchedules) {
      const scheduleSlots = slotsBySchedule.get(schedule.id) ?? [];
      if (scheduleSlots.length === 0) {
        malformedGraphs += 1;
        continue;
      }
      for (
        let localDate = start;
        Temporal.PlainDate.compare(localDate, end) <= 0;
        localDate = localDate.add({ days: 1 })
      ) {
        if (
          Temporal.PlainDate.compare(localDate, behaviorAnchor) < 0
        ) {
          continue;
        }
        let matches = false;
        try {
          matches = matchesRecurrence(
            localDate,
            behaviorAnchor,
            schedule.recurrence_rule,
          );
        } catch {
          malformedGraphs += 1;
          break;
        }
        if (!matches) continue;
        for (const slot of scheduleSlots) {
          try {
            desired.add(
              occurrenceKey({
                behavior_id: behavior.id,
                scheduled_for: localDateTimeToInstant(
                  localDate,
                  slot.start_time,
                  timezone,
                ).toString(),
                schedule_kind: slot.kind,
                schedule_preset: slot.preset,
                schedule_start_time: slot.start_time,
                schedule_end_time: slot.end_time,
              }),
            );
          } catch {
            malformedGraphs += 1;
          }
        }
      }
    }
  }

  const actualInWindow = occurrences.filter((occurrence) => {
    const date = Temporal.PlainDate.from(occurrence.local_date);
    return (
      Temporal.PlainDate.compare(date, start) >= 0 &&
      Temporal.PlainDate.compare(date, end) <= 0
    );
  });
  const actualKeys = new Set(actualInWindow.map(occurrenceKey));
  const missing = [...desired].filter((key) => !actualKeys.has(key)).length;
  const unexpectedUnresolved = actualInWindow.filter(
    (occurrence) =>
      occurrence.status === "unresolved" &&
      !desired.has(occurrenceKey(occurrence)),
  ).length;

  return malformedGraphs + missing + unexpectedUnresolved;
}

function addBaselineAppendOnlyViolations(
  add,
  actualRows,
  baselineRows,
  kind,
) {
  const actualById = new Map(actualRows.map((row) => [row.id, row]));
  for (const baseline of baselineRows) {
    const actual = actualById.get(baseline.id);
    if (!actual) {
      add(`baseline_${kind}_event_missing`);
      continue;
    }
    add(
      `baseline_${kind}_event_changed`,
      Number(
        appendOnlyEventFingerprint(kind, actual) !==
          appendOnlyEventFingerprint(kind, baseline),
      ),
    );
  }
}

function appendOnlyEventFingerprint(kind, row) {
  if (kind === "status") {
    return canonicalJson({
      id: row.id,
      user_id: row.user_id,
      occurrence_id: row.occurrence_id,
      behavior_id: row.behavior_id,
      previous_status: row.previous_status,
      status: row.status,
      status_semantics: row.status_semantics,
      recorded_at: canonicalInstant(row.recorded_at),
      effective_at: row.effective_at
        ? canonicalInstant(row.effective_at)
        : null,
      local_date: row.local_date,
      timezone: row.timezone,
      source_capture_method: row.source_capture_method,
      source_confidence: row.source_confidence,
      revises_event_id: row.revises_event_id,
      reason_code: row.reason_code,
    });
  }
  return canonicalJson({
    id: row.id,
    user_id: row.user_id,
    behavior_id: row.behavior_id,
    previous_title: row.previous_title,
    next_title: row.next_title,
    previous_description: row.previous_description,
    next_description: row.next_description,
    changed_fields: row.changed_fields,
    recorded_at: canonicalInstant(row.recorded_at),
    source: row.source,
    reason: row.reason,
  });
}

function addBaselineOccurrencePreservationViolations(
  add,
  actualRows,
  baselineRows,
  anchorLocalDate,
) {
  const actualById = new Map(actualRows.map((row) => [row.id, row]));
  for (const baseline of baselineRows.filter(
    (row) =>
      row.local_date < anchorLocalDate || row.status !== "unresolved",
  )) {
    const actual = actualById.get(baseline.id);
    if (!actual) {
      add("preserved_occurrence_missing");
      continue;
    }
    add(
      "preserved_occurrence_schedule_changed",
      Number(
        occurrencePreservationFingerprint(actual) !==
          occurrencePreservationFingerprint(baseline),
      ),
    );
  }
}

function occurrencePreservationFingerprint(row) {
  return canonicalJson({
    id: row.id,
    user_id: row.user_id,
    behavior_id: row.behavior_id,
    scheduled_for: canonicalInstant(row.scheduled_for),
    local_date: row.local_date,
    schedule_kind: row.schedule_kind,
    schedule_preset: row.schedule_preset,
    schedule_start_time: canonicalTime(row.schedule_start_time),
    schedule_end_time: row.schedule_end_time
      ? canonicalTime(row.schedule_end_time)
      : null,
  });
}

function addBaselineReminderPreservationViolations(
  add,
  actualRows,
  baselineRows,
  baselineOccurrences,
  anchorLocalDate,
) {
  const preservedOccurrenceIds = new Set(
    baselineOccurrences
      .filter(
        (row) =>
          row.local_date < anchorLocalDate ||
          row.status !== "unresolved",
      )
      .map((row) => row.id),
  );
  const actualById = new Map(actualRows.map((row) => [row.id, row]));

  for (const baseline of baselineRows.filter((row) =>
    preservedOccurrenceIds.has(row.occurrence_id),
  )) {
    const actual = actualById.get(baseline.id);
    if (!actual) {
      add("preserved_reminder_missing");
      continue;
    }
    add(
      "preserved_reminder_identity_changed",
      Number(
        reminderPreservationFingerprint(actual) !==
          reminderPreservationFingerprint(baseline),
      ),
    );
  }
}

function reminderPreservationFingerprint(row) {
  return canonicalJson({
    id: row.id,
    user_id: row.user_id,
    occurrence_id: row.occurrence_id,
    channel: row.channel,
    scheduled_send_at: canonicalInstant(row.scheduled_send_at),
  });
}

export function evaluateTimezoneOccurrencePreservationSnapshot({
  capturedOccurrences,
  currentOccurrences,
}) {
  if (
    !Array.isArray(capturedOccurrences) ||
    !Array.isArray(currentOccurrences)
  ) {
    return {
      passed: false,
      failures: ["timezone occurrence snapshots are missing"],
      summary: {
        captured_occurrences: 0,
        verified_occurrences: 0,
        violations: 1,
      },
    };
  }
  const currentById = new Map(
    currentOccurrences.map((row) => [row.id, row]),
  );
  let missingOccurrences = 0;
  let changedOccurrences = 0;
  for (const captured of capturedOccurrences) {
    const current = currentById.get(captured.id);
    if (!current) {
      missingOccurrences += 1;
      continue;
    }
    if (
      occurrencePreservationFingerprint(current) !==
      (captured.fingerprint ??
        occurrencePreservationFingerprint(captured))
    ) {
      changedOccurrences += 1;
    }
  }
  const capturedIds = new Set(
    capturedOccurrences.map((row) => row.id),
  );
  const duplicateCaptured =
    capturedOccurrences.length - capturedIds.size;
  const failures = [];
  if (capturedOccurrences.length === 0) {
    failures.push("the pre-timezone preservation snapshot is empty");
  }
  if (duplicateCaptured > 0) {
    failures.push(
      "the pre-timezone preservation snapshot contains duplicate occurrences",
    );
  }
  if (missingOccurrences > 0) {
    failures.push("one or more pre-timezone occurrences are missing");
  }
  if (changedOccurrences > 0) {
    failures.push("one or more pre-timezone occurrences changed");
  }
  return {
    passed: failures.length === 0,
    failures,
    summary: {
      captured_occurrences: capturedOccurrences.length,
      verified_occurrences:
        capturedOccurrences.length -
        missingOccurrences -
        changedOccurrences,
      violations:
        duplicateCaptured +
        missingOccurrences +
        changedOccurrences,
    },
  };
}

function resolveStatusEventChain(events) {
  const roots = events.filter((event) => event.revises_event_id === null);
  const childrenByPriorId = groupBy(
    events.filter((event) => event.revises_event_id !== null),
    (event) => event.revises_event_id,
  );
  let violations = Math.abs(roots.length - 1);
  violations += [...childrenByPriorId.values()].filter(
    (children) => children.length !== 1,
  ).length;
  const ordered = [];
  const seen = new Set();
  let current = roots[0];
  while (current && !seen.has(current.id)) {
    ordered.push(current);
    seen.add(current.id);
    const children = childrenByPriorId.get(current.id) ?? [];
    current = children.length === 1 ? children[0] : undefined;
  }
  if (current) violations += 1;
  violations += events.length - seen.size;
  return { ordered, violations };
}

export function definitionEventHasValidAppendOnlyTimestamps(
  event,
  maximumClockSkewMilliseconds = 5_000,
) {
  if (
    !Number.isInteger(maximumClockSkewMilliseconds) ||
    maximumClockSkewMilliseconds < 0 ||
    maximumClockSkewMilliseconds > 60_000
  ) {
    throw new LoadFixtureError(
      "Definition-event clock-skew allowance is invalid.",
    );
  }
  const createdAt = Temporal.Instant.from(event.created_at);
  const updatedAt = Temporal.Instant.from(event.updated_at);
  const recordedAt = Temporal.Instant.from(event.recorded_at);
  return (
    Temporal.Instant.compare(createdAt, updatedAt) === 0 &&
    Math.abs(
      recordedAt.epochMilliseconds - createdAt.epochMilliseconds,
    ) <=
      maximumClockSkewMilliseconds
  );
}

function resolveDefinitionEventChain(events) {
  const roots = events.filter(
    (event) =>
      event.previous_title === null &&
      event.previous_description === null,
  );
  let violations = Math.abs(roots.length - 1);
  const ordered = [];
  const seen = new Set();
  let current = [...roots].sort(compareRecordedRows)[0];

  while (current && !seen.has(current.id)) {
    ordered.push(current);
    seen.add(current.id);
    const candidates = events
      .filter(
        (event) =>
          !seen.has(event.id) &&
          event.previous_title === current.next_title &&
          event.previous_description === current.next_description,
      )
      .sort(compareRecordedRows);
    if (candidates.length > 1) violations += candidates.length - 1;
    current = candidates[0];
  }
  if (current) violations += 1;
  violations += events.length - seen.size;
  return { ordered, violations };
}

function reminderMatchesCurrentBehavior(reminder, occurrence, behavior) {
  if (
    occurrence.status !== "unresolved" ||
    !behavior.active ||
    (reminder.channel === "email" &&
      behavior.email_reminder_enabled !== true) ||
    (reminder.channel === "browser_push" &&
      behavior.browser_reminder_enabled !== true)
  ) {
    return false;
  }
  if (
    !Number.isInteger(behavior.reminder_offset_minutes) ||
    behavior.reminder_offset_minutes < 0
  ) {
    return false;
  }
  try {
    return (
      canonicalInstant(reminder.scheduled_send_at) ===
      Temporal.Instant.from(occurrence.scheduled_for)
        .subtract({ minutes: behavior.reminder_offset_minutes })
        .toString()
    );
  } catch {
    return false;
  }
}

function reminderSemanticKey(reminder) {
  return [
    reminder.occurrence_id,
    reminder.channel,
    canonicalInstant(reminder.scheduled_send_at),
  ].join("|");
}

function buildIntegrityChecks(violations) {
  const sum = (...names) =>
    Object.entries(violations)
      .filter(([name]) =>
        names.some((candidate) =>
          candidate instanceof RegExp
            ? candidate.test(name)
            : name === candidate,
        ),
      )
      .reduce((total, [, count]) => total + count, 0);
  return {
    crossOwnerRows: sum(
      "unknown_owner",
      "unknown_profile_owner",
      /_owner$/,
      /_owner_relationship$/,
    ),
    duplicateOccurrences: sum(
      "duplicate_occurrence",
      "duplicate_occurrence_semantic",
    ),
    duplicateDeliveries: sum("duplicate_reminder"),
    invalidStatusChains: sum(
      /^status_event_/,
      /^baseline_status_event_/,
      "resolved_without_status_event",
    ),
    invalidDefinitionChains: sum(
      /^definition_/,
      /^baseline_definition_event_/,
    ),
    scheduleOnlyDefinitionEvents: sum(
      "schedule_only_definition_event",
    ),
    invalidReminderStates: sum(
      "reminder_shape",
      "resolved_pending_reminder",
      "unexpected_pending_reminder",
      "future_eligible_reminder_not_reactivated",
      "missing_future_reminder",
      "stuck_processing_claim",
      "unexpected_reminder",
      "unexpected_provider_enablement",
      "due_past_clear_fixture_missing",
      "due_past_clear_selector_overlap",
      "due_past_clear_not_past",
      "due_past_clear_reminder_reactivated",
    ),
    orphanRows: sum(
      /_orphan$/,
      /_missing$/,
      /_owner_relationship$/,
      "schedule_behavior_owner",
      "slot_owner_relationship",
      "behavior_category_owner",
    ),
    falseFreshHorizons: sum(/^false_fresh_/),
    preservationFailures: sum(
      /^preserved_occurrence_/,
      /^preserved_reminder_/,
    ),
    stuckProcessingClaims: sum("stuck_processing_claim"),
    forbiddenRows: sum(
      /^unexpected_push_subscriptions$/,
      /^unexpected_behaviorlog_import_/,
      /^unexpected_imported_/,
      "unexpected_active_push_subscription",
    ),
    boundedGrowth: sum(
      /_growth_limit$/,
      /_count_below_baseline$/,
      "behavior_count_below_baseline",
      "mutation_baseline_missing",
    ),
  };
}

function buildIntegrityMetrics(snapshot, metadata) {
  const rowCounts = Object.fromEntries(
    TABLE_SPECS.map(([table]) => [
      table,
      snapshot[table]?.length ?? 0,
    ]),
  );
  const reminders = snapshot.reminder_deliveries ?? [];
  const operatorReminderIds = new Set(
    metadata.accounts
      .map(
        (account) =>
          account.selectors?.due_reminder_delivery_id,
      )
      .filter((value) => typeof value === "string"),
  );
  const cancellationReminderIds = new Set(
    metadata.accounts
      .map(
        (account) =>
          account.selectors?.cancellation_reminder_delivery_id,
      )
      .filter((value) => typeof value === "string"),
  );
  const duePastClearOccurrenceIds = new Set(
    metadata.accounts
      .map(
        (account) =>
          account.selectors?.due_past_clear_occurrence_id,
      )
      .filter((value) => typeof value === "string"),
  );
  const duePastClearDeliveryIds = new Set(
    metadata.accounts
      .map(
        (account) =>
          account.selectors?.due_past_clear_delivery_id,
      )
      .filter((value) => typeof value === "string"),
  );
  const duePastClearOccurrences = (
    snapshot.occurrences ?? []
  ).filter((row) => duePastClearOccurrenceIds.has(row.id));
  const duePastClearDeliveries = reminders.filter((row) =>
    duePastClearDeliveryIds.has(row.id),
  );
  const duePastClearEvents = (
    snapshot.occurrence_status_events ?? []
  ).filter(
    (row) =>
      duePastClearOccurrenceIds.has(row.occurrence_id) &&
      row.status === "unresolved" &&
      (row.previous_status === "completed" ||
        row.previous_status === "not_completed"),
  );
  const exercisedDuePastOccurrenceIds = new Set(
    duePastClearEvents.map((row) => row.occurrence_id),
  );
  const baselineCounts = metadata.accounts.reduce(
    (totals, account) => {
      const counts = account.expected?.counts ?? {};
      for (const key of Object.keys(totals)) {
        totals[key] += counts[key] ?? 0;
      }
      return totals;
    },
    {
      behaviors: 0,
      schedules: 0,
      slots: 0,
      occurrences: 0,
      statusEvents: 0,
      definitionEvents: 0,
      reminders: 0,
    },
  );
  return {
    rowCounts,
    reminderStatuses: {
      pending: reminders.filter((row) => row.status === "pending").length,
      processing: reminders.filter(
        (row) =>
          row.status === "pending" &&
          row.processing_started_at !== null,
      ).length,
      sent: reminders.filter((row) => row.status === "sent").length,
      failed: reminders.filter((row) => row.status === "failed").length,
      cancelled: reminders.filter((row) => row.status === "cancelled").length,
    },
    operatorReminderStatuses: countReminderStatuses(
      reminders.filter((row) => operatorReminderIds.has(row.id)),
    ),
    cancellationReminderStatuses: countReminderStatuses(
      reminders.filter((row) => cancellationReminderIds.has(row.id)),
    ),
    duePastReminderNonReactivation: {
      tracked_occurrences: duePastClearOccurrences.length,
      tracked_deliveries: duePastClearDeliveries.length,
      exercised_occurrences: exercisedDuePastOccurrenceIds.size,
      clear_events: duePastClearEvents.length,
      unresolved_occurrences: duePastClearOccurrences.filter(
        (row) => row.status === "unresolved",
      ).length,
      cancelled_deliveries: duePastClearDeliveries.filter(
        (row) => row.status === "cancelled",
      ).length,
      reactivated_deliveries: duePastClearDeliveries.filter(
        (row) =>
          exercisedDuePastOccurrenceIds.has(row.occurrence_id) &&
          row.status !== "cancelled",
      ).length,
    },
    activePushSubscriptions: (snapshot.push_subscriptions ?? []).filter(
      (row) => row.active !== false,
    ).length,
    databaseConnectionCount: null,
    statusTransitionEvidence: buildStatusTransitionEvidence(
      snapshot,
      baselineCounts.statusEvents,
    ),
    mutationDeltas: {
      behaviors: (snapshot.behaviors?.length ?? 0) - baselineCounts.behaviors,
      schedules:
        (snapshot.behavior_schedules?.length ?? 0) -
        baselineCounts.schedules,
      slots:
        (snapshot.behavior_schedule_slots?.length ?? 0) -
        baselineCounts.slots,
      occurrences:
        (snapshot.occurrences?.length ?? 0) -
        baselineCounts.occurrences,
      statusEvents:
        (snapshot.occurrence_status_events?.length ?? 0) -
        baselineCounts.statusEvents,
      definitionEvents:
        (snapshot.behavior_definition_events?.length ?? 0) -
        baselineCounts.definitionEvents,
      reminders:
        (snapshot.reminder_deliveries?.length ?? 0) -
        baselineCounts.reminders,
    },
  };
}

function buildStatusTransitionEvidence(
  snapshot,
  baselineStatusEventCount,
) {
  const occurrences = snapshot.occurrences ?? [];
  const statusEvents = snapshot.occurrence_status_events ?? [];
  const occurrenceById = new Map(
    occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const statusGroups = groupBy(
    statusEvents,
    (event) => event.occurrence_id,
  );
  let snapshotCorrelatedOccurrenceCount = 0;

  for (const [occurrenceId, events] of statusGroups) {
    const occurrence = occurrenceById.get(occurrenceId);
    const chain = resolveStatusEventChain(events);
    const latest = chain.ordered.at(-1);
    if (
      !occurrence ||
      !latest ||
      chain.violations !== 0 ||
      events.some(
        (event) =>
          event.user_id !== occurrence.user_id ||
          event.behavior_id !== occurrence.behavior_id ||
          event.local_date !== occurrence.local_date,
      ) ||
      latest.status !== occurrence.status ||
      (occurrence.status === "unresolved"
        ? occurrence.status_marked_at !== null
        : canonicalInstant(latest.recorded_at) !==
          canonicalInstant(occurrence.status_marked_at))
    ) {
      continue;
    }
    snapshotCorrelatedOccurrenceCount += 1;
  }

  return {
    baselineEventCount: baselineStatusEventCount,
    totalEventCount: statusEvents.length,
    appendedEventCount:
      statusEvents.length - baselineStatusEventCount,
    eventBackedOccurrenceCount: statusGroups.size,
    snapshotCorrelatedOccurrenceCount,
  };
}

function countReminderStatuses(reminders) {
  return {
    pending: reminders.filter((row) => row.status === "pending").length,
    processing: reminders.filter(
      (row) =>
        row.status === "pending" &&
        row.processing_started_at !== null,
    ).length,
    sent: reminders.filter((row) => row.status === "sent").length,
    failed: reminders.filter((row) => row.status === "failed").length,
    cancelled: reminders.filter((row) => row.status === "cancelled").length,
  };
}

async function readOwnedSnapshot(admin, userIds) {
  const snapshot = {};
  for (const [table, ownerColumn, orderColumn] of TABLE_SPECS) {
    snapshot[table] = await fetchAllOwnedRows(
      admin,
      table,
      ownerColumn,
      orderColumn,
      userIds,
    );
  }
  return snapshot;
}

async function fetchAllOwnedRows(
  client,
  table,
  ownerColumn,
  orderColumn,
  userIds,
) {
  const rows = [];
  for (const ownerChunk of chunkRows(userIds, 40)) {
    for (let start = 0; ; start += 1000) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .in(ownerColumn, ownerChunk)
        .order(orderColumn)
        .range(start, start + 999);
      if (error) {
        throw new LoadFixtureError(
          `Integrity snapshot failed for ${table}.`,
        );
      }
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  return rows;
}

async function verifyOrdinaryRlsBoundaries(config, metadata) {
  for (let index = 0; index < metadata.accounts.length; index += 1) {
    const account = metadata.accounts[index];
    const adjacent =
      metadata.accounts[(index + 1) % metadata.accounts.length];
    for (const cookies of [
      account.cookies,
      ...(account.contention_cookies
        ? [account.contention_cookies]
        : []),
    ]) {
      const client = createOrdinaryClientFromCookies(config, cookies);
      const [profiles, behaviors, occurrences, crossProfile] =
        await Promise.all([
          client.from("profiles").select("id"),
          client.from("behaviors").select("user_id").limit(1000),
          client.from("occurrences").select("user_id").limit(1000),
          client
            .from("profiles")
            .select("id")
            .eq("id", adjacent.user_id),
        ]);

      if (
        profiles.error ||
        behaviors.error ||
        occurrences.error ||
        crossProfile.error ||
        profiles.data?.length !== 1 ||
        profiles.data[0]?.id !== account.user_id ||
        behaviors.data?.some((row) => row.user_id !== account.user_id) ||
        occurrences.data?.some((row) => row.user_id !== account.user_id) ||
        (metadata.accounts.length > 1 &&
          crossProfile.data?.length !== 0)
      ) {
        throw new LoadFixtureError(
          "Ordinary-session cross-account RLS verification failed.",
        );
      }
    }
  }
}

async function verifyExportOwnership(config, metadata, snapshot) {
  const idsByUser = new Map();
  for (const account of metadata.accounts) {
    idsByUser.set(account.user_id, {
      categories: new Set(
        snapshot.categories
          .filter((row) => row.user_id === account.user_id)
          .map((row) => row.id),
      ),
      behaviors: new Set(
        snapshot.behaviors
          .filter((row) => row.user_id === account.user_id)
          .map((row) => row.id),
      ),
      occurrences: new Set(
        snapshot.occurrences
          .filter((row) => row.user_id === account.user_id)
          .map((row) => row.id),
      ),
      status_events: new Set(
        snapshot.occurrence_status_events
          .filter((row) => row.user_id === account.user_id)
          .map((row) => row.id),
      ),
      behavior_definition_events: new Set(
        snapshot.behavior_definition_events
          .filter((row) => row.user_id === account.user_id)
          .map((row) => row.id),
      ),
    });
  }

  const accountsToCheck = metadata.accounts.filter(
    (account) =>
      account.cohort === "export_heavy" ||
      (account.cohort !== "empty" &&
        !metadata.accounts.some(
          (candidate) => candidate.cohort === "export_heavy",
        )),
  );

  for (const account of accountsToCheck) {
    const response = await fetch(
      `${config.baseUrl}/api/export/json?range=all&include_archived=1&include_notes=1`,
      {
        headers: {
          cookie: Object.entries(account.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
        },
        redirect: "follow",
      },
    );
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json") ||
      !response.headers.get("content-disposition")?.includes("attachment")
    ) {
      throw new LoadFixtureError(
        `Synthetic export ownership request failed (status=${response.status}, json=${Boolean(
          response.headers
            .get("content-type")
            ?.includes("application/json"),
        )}, attachment=${Boolean(
          response.headers
            .get("content-disposition")
            ?.includes("attachment"),
        )}).`,
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new LoadFixtureError(
        "Synthetic export ownership response was invalid.",
      );
    }
    const allowed = idsByUser.get(account.user_id);
    const entityLists = [
      ["categories", payload.categories],
      ["behaviors", payload.behaviors],
      ["occurrences", payload.occurrences],
      ["status_events", payload.status_events],
      ["behavior_definition_events", payload.behavior_definition_events],
    ];
    for (const [key, rows] of entityLists) {
      if (
        !Array.isArray(rows) ||
        rows.some((row) => !allowed[key].has(row.id))
      ) {
        throw new LoadFixtureError(
          "Synthetic export contained a cross-account identifier.",
        );
      }
    }
    const serialized = JSON.stringify(payload);
    if (
      !serialized.includes(account.owner_marker) ||
      serialized.includes(account.forbidden_marker)
    ) {
      throw new LoadFixtureError(
        "Synthetic export ownership marker verification failed.",
      );
    }
  }
}

function createOrdinaryClientFromCookies(config, cookies) {
  return createOrdinarySessionContext(config, cookies).client;
}

function createOrdinarySessionContext(config, cookies) {
  const jar = new Map(Object.entries(cookies ?? {}));
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return [...jar].map(([name, value]) => ({ name, value }));
      },
      setAll(values) {
        for (const value of values) {
          if (value.value) jar.set(value.name, value.value);
          else jar.delete(value.name);
        }
      },
    },
  });
  return { client, jar };
}

async function renewOrdinarySession(
  config,
  account,
  cookies,
  pacing,
  strategy,
) {
  if (strategy === "password_sign_in") {
    const signedIn = await withAuthRetry(
      () => signInOrdinaryAccount(config, account),
      pacing,
    );
    return {
      cookies: signedIn.cookies,
      strategy: "password_sign_in",
    };
  }
  try {
    return {
      cookies: await withAuthRetry(
        () => refreshOrdinarySession(config, cookies),
        pacing,
      ),
      strategy: "refresh",
    };
  } catch (error) {
    if (!shouldFallbackToPasswordSignIn(error)) {
      throw error;
    }
  }

  const signedIn = await withAuthRetry(
    () => signInOrdinaryAccount(config, account),
    pacing,
  );
  return {
    cookies: signedIn.cookies,
    strategy: "password_sign_in_fallback",
  };
}

export function shouldFallbackToPasswordSignIn(error) {
  return (
    error instanceof LoadFixtureError &&
    error.retryable !== true
  );
}

async function refreshOrdinarySession(config, cookies) {
  const { client, jar } = createOrdinarySessionContext(config, cookies);
  const { data, error } = await client.auth.refreshSession();
  if (error || !data.user || !data.session || jar.size === 0) {
    const retryable = isAuthRateLimitError(error);
    const failure = new LoadFixtureError(
      retryable
        ? "Local Auth rate limit delayed fixture session refresh."
        : "Unable to refresh an ordinary fixture session.",
    );
    failure.retryable = retryable;
    throw failure;
  }
  return Object.fromEntries(jar);
}

function buildExpectedReminderIds(account, metadata, categories) {
  if (!account.user_id || categories.length === 0) return [];
  const other = categories.find(
    (row) => row.user_id === account.user_id && row.name === "Other",
  );
  if (!other) return [];
  return buildFixturePlan({
    runId: metadata.run_id,
    account,
    categoryId: other.id,
    anchorLocalDate: metadata.anchor_local_date,
    timezone: metadata.timezone,
  }).reminders.map((row) => row.id);
}

function duplicateCount(values) {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values) {
    if (seen.has(value)) duplicates += 1;
    seen.add(value);
  }
  return duplicates;
}

function symmetricDifferenceCount(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    [...leftSet].filter((value) => !rightSet.has(value)).length +
    [...rightSet].filter((value) => !leftSet.has(value)).length
  );
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

function compareRecordedRows(left, right) {
  return (
    Temporal.Instant.compare(left.recorded_at, right.recorded_at) ||
    Temporal.Instant.compare(left.created_at, right.created_at) ||
    left.id.localeCompare(right.id)
  );
}

export async function cleanupLoadRun(options = {}) {
  const runId = validateLoadRunId(
    options.runId ?? process.env.CADENCE_LOAD_RUN_ID,
  );
  const dryRun = Boolean(options.dryRun);
  const confirmRunId =
    options.confirmRunId ?? process.env.CADENCE_LOAD_CONFIRM_RUN_ID;

  validateCleanupConfirmation({ runId, confirmRunId, dryRun });

  const config = normalizeInjectedConfig(
    options.config ?? readLocalSupabaseConfig(),
    options.baseUrl,
  );
  const paths = resolvePrivateRunPaths(
    runId,
    options.runDirectory ?? process.env.CADENCE_LOAD_RUN_DIRECTORY,
  );
  if (existsSync(paths.directory)) {
    await assertPrivateDirectory(paths.directory);
  }
  const metadata = existsSync(paths.metadataPath)
    ? await readPrivateJson(paths.metadataPath)
    : null;
  if (metadata) {
    validateMetadata(metadata, {
      runId,
      accountCount: metadata.requested_account_count,
      heavyCount: metadata.heavy_count,
      cohort: metadata.requested_cohort ?? undefined,
      baseUrl: config.baseUrl,
      supabaseUrl: config.url,
      fixtureMode: metadata.workload_classification ?? "read",
    });
  }

  const admin = createAdminClient(config);
  const initialUsers = await listAllAuthUsers(admin);
  const classified = classifyListedUsers(initialUsers, runId);
  if (classified.suspicious.length > 0) {
    throw new LoadFixtureError(
      "Cleanup refused because a synthetic identity matched only one exact run marker.",
    );
  }
  if (metadata) {
    const expectedEmails = new Set(
      metadata.accounts.map((account) => account.email.toLowerCase()),
    );
    if (
      classified.exact.some(
        (user) => !expectedEmails.has(user.email?.toLowerCase()),
      )
    ) {
      throw new LoadFixtureError(
        "Cleanup refused an exact run identity outside private metadata.",
      );
    }
  }

  if (dryRun) {
    return {
      summary: {
        runId,
        dryRun: true,
        matchedUsers: classified.exact.length,
        deletedUsers: 0,
      },
    };
  }

  if (metadata) {
    for (const account of metadata.accounts) {
      if (!account.cookies || Object.keys(account.cookies).length === 0) continue;
      try {
        await createOrdinaryClientFromCookies(
          config,
          account.cookies,
        ).auth.signOut({ scope: "global" });
      } catch {
        // Hard deletion and cascade remain the authoritative local cleanup.
      }
    }
  }

  const capturedUserIds = classified.exact.map((user) => user.id);
  let deletedUsers = 0;
  for (const user of classified.exact) {
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    if (error) {
      throw new LoadFixtureError(
        "Exact synthetic Auth cleanup failed; private recovery metadata was preserved.",
      );
    }
    deletedUsers += 1;
  }

  const remaining = classifyListedUsers(await listAllAuthUsers(admin), runId);
  if (remaining.exact.length > 0 || remaining.suspicious.length > 0) {
    throw new LoadFixtureError(
      "Exact synthetic Auth cleanup could not be verified.",
    );
  }
  await verifyCapturedOwnersGone(admin, capturedUserIds);

  if (existsSync(paths.directory)) {
    await rm(paths.directory, { recursive: true, force: false });
  }

  return {
    summary: {
      runId,
      dryRun: false,
      matchedUsers: classified.exact.length,
      deletedUsers,
      residualProductRows: 0,
    },
  };
}

export function validateCleanupConfirmation({
  runId: runIdInput,
  confirmRunId,
  dryRun,
}) {
  const runId = validateLoadRunId(runIdInput);
  if (!dryRun && confirmRunId !== runId) {
    throw new LoadFixtureError(
      "Destructive cleanup requires --confirm-run-id equal to the exact run id.",
    );
  }
  if (confirmRunId !== undefined && confirmRunId !== runId) {
    throw new LoadFixtureError(
      "Cleanup confirmation does not match the exact run id.",
    );
  }
  return { runId, dryRun: Boolean(dryRun) };
}

async function verifyCapturedOwnersGone(admin, userIds) {
  if (userIds.length === 0) return;
  for (const [table, ownerColumn] of TABLE_SPECS) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(ownerColumn, userIds);
    if (error || count !== 0) {
      throw new LoadFixtureError(
        `Cleanup verification found residual rows in ${table}.`,
      );
    }
  }
}

export function parseLoadFixtureArgs(argv, env = process.env) {
  const options = {
    runId: env.CADENCE_LOAD_RUN_ID,
    accountCount: env.CADENCE_LOAD_ACCOUNT_COUNT,
    heavyCount: env.CADENCE_LOAD_HEAVY_COUNT,
    cohort: env.CADENCE_LOAD_COHORT,
    baseUrl: env.CADENCE_LOAD_BASE_URL,
    runDirectory: env.CADENCE_LOAD_RUN_DIRECTORY,
    anchorLocalDate: env.CADENCE_LOAD_ANCHOR_LOCAL_DATE,
    authConcurrency: env.CADENCE_LOAD_AUTH_CONCURRENCY,
    authMinIntervalMs: env.CADENCE_LOAD_AUTH_MIN_INTERVAL_MS,
    confirmRunId: env.CADENCE_LOAD_CONFIRM_RUN_ID,
    fixtureMode: resolveRequestedFixtureMode(
      undefined,
      env.CADENCE_LOAD_MUTATION_FIXTURES,
    ),
    dryRun: false,
  };
  const valueOptions = new Map([
    ["--run-id", "runId"],
    ["--accounts", "accountCount"],
    ["--heavy-count", "heavyCount"],
    ["--cohort", "cohort"],
    ["--base-url", "baseUrl"],
    ["--run-directory", "runDirectory"],
    ["--anchor-date", "anchorLocalDate"],
    ["--auth-concurrency", "authConcurrency"],
    ["--auth-min-interval-ms", "authMinIntervalMs"],
    ["--confirm-run-id", "confirmRunId"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--mutation") {
      options.fixtureMode = "mutation";
      continue;
    }
    const key = valueOptions.get(token);
    const value = argv[index + 1];
    if (!key || value === undefined || value.startsWith("--")) {
      throw new LoadFixtureError(
        "Unknown or incomplete load fixture argument.",
      );
    }
    options[key] = value;
    index += 1;
  }

  if (options.accountCount !== undefined) {
    options.accountCount = Number(options.accountCount);
  }
  if (options.heavyCount !== undefined) {
    options.heavyCount = Number(options.heavyCount);
  }
  if (options.authConcurrency !== undefined) {
    options.authConcurrency = Number(options.authConcurrency);
  }
  if (options.authMinIntervalMs !== undefined) {
    options.authMinIntervalMs = Number(options.authMinIntervalMs);
  }

  return options;
}

export function summarizeLifecycleResult(label, summary) {
  const parts = [
    `${label} complete.`,
    `Run ${summary.runId}.`,
  ];
  if (summary.requestedAccounts !== undefined) {
    parts.push(`Requested ${summary.requestedAccounts} accounts.`);
  }
  if (summary.createdUsers !== undefined) {
    parts.push(`Created ${summary.createdUsers} users.`);
  }
  if (summary.reusedUsers !== undefined) {
    parts.push(`Reused ${summary.reusedUsers} users.`);
  }
  if (summary.seededAccounts !== undefined) {
    parts.push(`Seeded ${summary.seededAccounts} accounts.`);
  }
  if (summary.checkedAccounts !== undefined) {
    parts.push(`Checked ${summary.checkedAccounts} accounts.`);
  }
  if (summary.totalRows !== undefined) {
    parts.push(`Checked ${summary.totalRows} product rows.`);
  }
  if (summary.workloadClassification !== undefined) {
    parts.push(`Workload ${summary.workloadClassification}.`);
  }
  if (summary.contentionPairs !== undefined) {
    parts.push(`Prepared ${summary.contentionPairs} contention pairs.`);
  }
  if (summary.integrityChecks) {
    const checkCount = Object.keys(summary.integrityChecks).length;
    const nonzero = Object.values(summary.integrityChecks).filter(
      (value) => value !== 0,
    ).length;
    parts.push(
      `Aggregate integrity gates ${checkCount - nonzero}/${checkCount} clear.`,
    );
  }
  if (summary.matchedUsers !== undefined) {
    parts.push(`Matched ${summary.matchedUsers} exact users.`);
  }
  if (summary.deletedUsers !== undefined) {
    parts.push(`Deleted ${summary.deletedUsers} users.`);
  }
  if (summary.dryRun) {
    parts.push("Dry run only.");
  }
  if (summary.cohorts) {
    parts.push(
      `Cohorts ${LOAD_COHORTS.map(
        (cohort) => `${cohort}=${summary.cohorts[cohort] ?? 0}`,
      ).join(", ")}.`,
    );
  }
  return parts.join(" ");
}
