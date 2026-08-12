import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ENV_FILE = ".env.local";
const PASSWORD_PREFIX = "CadenceRlsSmoke";
const DEFAULT_CATEGORY_NAME = "Other";
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

export function readSmokeConfig(env = process.env, envFilePath = ENV_FILE) {
  const fileEnv = readEnvFile(envFilePath);
  const mergedEnv = { ...fileEnv, ...env };
  const url = normalizeEnvValue(mergedEnv.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey =
    normalizeEnvValue(mergedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvValue(mergedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = normalizeEnvValue(mergedEnv.SUPABASE_SERVICE_ROLE_KEY);
  const missing = [];

  if (!url) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!publishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing Supabase RLS smoke config: ${missing.join(", ")}.`);
  }

  return {
    url,
    publishableKey,
    serviceRoleKey,
  };
}

export function parseLocalSmokeConfig(output) {
  const values = {};

  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());

    if (match) {
      values[match[1]] = parseEnvironmentValue(match[2].trim());
    }
  }

  const url = normalizeEnvValue(values.API_URL);
  const publishableKey =
    normalizeEnvValue(values.PUBLISHABLE_KEY) ??
    normalizeEnvValue(values.ANON_KEY);
  const serviceRoleKey = normalizeEnvValue(values.SERVICE_ROLE_KEY);

  if (!url || !isLoopbackUrl(url)) {
    throw new Error("Local Supabase status did not return a loopback API URL.");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("Local Supabase status omitted required runtime keys.");
  }

  return { url, publishableKey, serviceRoleKey };
}

export function readLocalSmokeConfig() {
  const result = spawnSync(
    "npm",
    ["run", "--silent", "supabase", "--", "status", "-o", "env"],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.error || result.status !== 0) {
    throw new Error("Unable to read the project-local Supabase status.");
  }

  return parseLocalSmokeConfig(result.stdout);
}

export function buildSmokeUserEmail(runId, slot) {
  return `cadence-rls-smoke-${runId}-${slot}@example.invalid`;
}

export function buildSmokePassword(runId) {
  return `${PASSWORD_PREFIX}-${runId}-aA1!`;
}

export function summarizeSmokeResult(result) {
  return [
    `RLS smoke passed for run ${result.runId}.`,
    `Created ${result.createdUsers} temporary users.`,
    `Verified ${result.checkedAssertions} ownership checks.`,
    "Cleaned up temporary users.",
  ].join(" ");
}

async function main() {
  const config = process.argv.includes("--local")
    ? readLocalSmokeConfig()
    : readSmokeConfig();
  const runId = randomUUID().slice(0, 8);
  const password = buildSmokePassword(runId);
  const admin = createSupabase(config.url, config.serviceRoleKey);
  const users = [];

  try {
    users.push(
      await createTemporaryUser(admin, buildSmokeUserEmail(runId, "a"), password),
      await createTemporaryUser(admin, buildSmokeUserEmail(runId, "b"), password),
    );

    const userA = users[0];
    const userB = users[1];
    const clientA = await signInTemporaryUser(config, userA.email, password);
    const clientB = await signInTemporaryUser(config, userB.email, password);
    const assertions = [];

    await waitForOnboardingRows(clientA, userA.id);
    await waitForOnboardingRows(clientB, userB.id);

    const categoryA = await getCategory(clientA, userA.id);
    const categoryB = await getCategory(clientB, userB.id);
    const behaviorA = await createSmokeBehavior(clientA, {
      userId: userA.id,
      categoryId: categoryA.id,
      title: `RLS smoke A ${runId}`,
    });
    const behaviorB = await createSmokeBehavior(clientB, {
      userId: userB.id,
      categoryId: categoryB.id,
      title: `RLS smoke B ${runId}`,
    });
    const occurrenceA = await createSmokeOccurrence(clientA, {
      userId: userA.id,
      behaviorId: behaviorA.id,
      localDate: "2000-01-01",
      scheduledFor: "2000-01-01T14:00:00Z",
    });
    const occurrenceB = await createSmokeOccurrence(clientB, {
      userId: userB.id,
      behaviorId: behaviorB.id,
      localDate: "2000-01-02",
      scheduledFor: "2000-01-02T15:00:00Z",
    });
    const timeSessionA = await createSmokeTimeSession(clientA, {
      userId: userA.id,
      behaviorId: behaviorA.id,
      occurrenceId: occurrenceA.id,
      startedAt: "2000-01-01T14:00:00Z",
      stoppedAt: "2000-01-01T14:05:00Z",
    });
    const timeSessionB = await createSmokeTimeSession(clientB, {
      userId: userB.id,
      behaviorId: behaviorB.id,
      occurrenceId: occurrenceB.id,
      startedAt: "2000-01-02T15:00:00Z",
      stoppedAt: "2000-01-02T15:05:00Z",
    });
    await archiveSmokeBehavior(clientB, behaviorB.id);

    assertions.push(await assertProfileIsolation(clientA, userB.id));
    assertions.push(await assertCategoryIsolation(clientA, userB.id));
    assertions.push(await assertBehaviorIsolation(clientA, behaviorB.id));
    assertions.push(await assertBehaviorInsertCheck(clientA, userB.id));
    assertions.push(await assertBehaviorUpdateIsolation(clientA, behaviorB.id));
    assertions.push(await assertOwnBehaviorVisible(clientA, behaviorA.id));
    assertions.push(
      ...(await assertTimeSessionRpcIsolation({
        clientA,
        clientB,
        occurrenceA,
        occurrenceB,
        timeSessionA,
        timeSessionB,
      })),
    );
    assertions.push(
      ...(await assertAnonymousTimeSessionRpcDenial(config)),
    );

    console.log(
      summarizeSmokeResult({
        runId,
        createdUsers: users.length,
        checkedAssertions: assertions.length,
      }),
    );
  } finally {
    await Promise.allSettled(
      users.map((user) => admin.auth.admin.deleteUser(user.id)),
    );
  }
}

async function createTemporaryUser(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: "Cadence RLS Smoke",
    },
  });

  if (error || !data.user) {
    throw new Error(`Unable to create temporary smoke user: ${error?.message}`);
  }

  return {
    id: data.user.id,
    email,
  };
}

async function signInTemporaryUser(config, email, password) {
  const client = createSupabase(config.url, config.publishableKey);
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Unable to sign in temporary smoke user: ${error.message}`);
  }

  return client;
}

async function waitForOnboardingRows(client, userId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: profile } = await client
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    const { data: categories } = await client
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (profile && categories && categories.length > 0) {
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for profile/default categories.");
}

async function getCategory(client, userId) {
  const { data, error } = await client
    .from("categories")
    .select("id, name")
    .eq("user_id", userId)
    .eq("name", DEFAULT_CATEGORY_NAME)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Unable to read smoke category: ${error?.message}`);
  }

  return data;
}

async function createSmokeBehavior(client, input) {
  const { data, error } = await client
    .from("behaviors")
    .insert({
      user_id: input.userId,
      category_id: input.categoryId,
      title: input.title,
      description: null,
      recurrence_rule: {
        frequency: "daily",
        interval: 1,
      },
      scheduled_time: "09:00",
      timezone: "America/New_York",
      browser_reminder_enabled: true,
      email_reminder_enabled: false,
      reminder_offset_minutes: 0,
      active: true,
      archived_at: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Unable to create smoke behavior: ${error?.message}`);
  }

  return data;
}

async function createSmokeOccurrence(client, input) {
  const { data, error } = await client
    .from("occurrences")
    .insert({
      user_id: input.userId,
      behavior_id: input.behaviorId,
      behavior_schedule_slot_id: null,
      scheduled_for: input.scheduledFor,
      local_date: input.localDate,
      schedule_kind: "exact",
      schedule_preset: null,
      schedule_start_time: "09:00:00",
      schedule_end_time: null,
      status: "unresolved",
      completed_at: null,
      status_marked_at: null,
      note: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Unable to create smoke occurrence: ${error?.message}`);
  }

  return data;
}

async function createSmokeTimeSession(client, input) {
  const { data, error } = await client
    .from("occurrence_time_sessions")
    .insert({
      user_id: input.userId,
      occurrence_id: input.occurrenceId,
      behavior_id: input.behaviorId,
      started_at: input.startedAt,
      stopped_at: input.stoppedAt,
    })
    .select("id, started_at")
    .single();

  if (error || !data) {
    throw new Error(`Unable to create smoke time session: ${error?.message}`);
  }

  return data;
}

async function archiveSmokeBehavior(client, behaviorId) {
  const { error } = await client
    .from("behaviors")
    .update({
      active: false,
      archived_at: "2000-01-02T18:00:00Z",
    })
    .eq("id", behaviorId);

  if (error) {
    throw new Error(`Unable to archive smoke behavior: ${error.message}`);
  }
}

async function assertTimeSessionRpcIsolation(input) {
  const assertions = [];

  const ordinaryRead = await input.clientA
    .from("occurrence_time_sessions")
    .select("id")
    .in("occurrence_id", [input.occurrenceA.id, input.occurrenceB.id]);
  assertSuccessfulSessionRows(
    ordinaryRead,
    [input.timeSessionA.id],
    "ordinary time-session owner read",
  );
  assertions.push("time_session_table_mixed_owner");

  await assertIdRpcRows(
    input.clientA,
    [input.occurrenceA.id],
    [input.timeSessionA.id],
    "own arbitrary-ID read",
  );
  assertions.push("time_session_id_own");

  await assertIdRpcRows(
    input.clientA,
    [input.occurrenceB.id],
    [],
    "foreign arbitrary-ID read",
  );
  assertions.push("time_session_id_foreign");

  await assertIdRpcRows(
    input.clientA,
    [input.occurrenceA.id, input.occurrenceB.id],
    [input.timeSessionA.id],
    "mixed arbitrary-ID read",
  );
  assertions.push("time_session_id_mixed");

  await assertIdRpcRows(
    input.clientA,
    [input.occurrenceA.id, input.occurrenceA.id],
    [input.timeSessionA.id],
    "duplicate arbitrary-ID read",
  );
  assertions.push("time_session_id_duplicate");

  await assertIdRpcRows(input.clientA, [], [], "empty arbitrary-ID read");
  await assertIdRpcRows(input.clientA, null, [], "null arbitrary-ID read");
  assertions.push("time_session_id_empty_and_null");

  const overLimit = await input.clientA.rpc(
    "list_my_occurrence_time_sessions",
    {
      occurrence_ids: Array.from({ length: 2_001 }, () => randomUUID()),
    },
  );
  assertRpcRejected(overLimit, "over-limit arbitrary-ID read", "maximum of 2000");
  assertions.push("time_session_id_over_limit");

  await assertHistoryRpcRows(
    input.clientA,
    historyArgs({ start: "2000-01-01", end: "2000-01-01" }),
    [input.timeSessionA.id],
    "own history read",
  );
  assertions.push("time_session_history_own");

  await assertHistoryRpcRows(
    input.clientB,
    historyArgs({
      start: "2000-01-02",
      end: "2000-01-02",
      includeArchived: true,
    }),
    [input.timeSessionB.id],
    "archived owner history read",
  );
  assertions.push("time_session_history_archived_own");

  await assertHistoryRpcRows(
    input.clientB,
    historyArgs({
      start: "2000-01-02",
      end: "2000-01-02",
      includeArchived: false,
    }),
    [],
    "archived owner history exclusion",
  );
  assertions.push("time_session_history_archived_excluded");

  await assertHistoryRpcRows(
    input.clientA,
    historyArgs({
      start: "2000-01-01",
      end: "2000-01-01",
      throughStartedAt: "2000-01-01T13:59:59Z",
    }),
    [],
    "history high-water exclusion",
  );
  assertions.push("time_session_history_high_water");

  await assertHistoryRpcRows(
    input.clientA,
    historyArgs({
      start: "2000-01-02",
      end: "2000-01-02",
      includeArchived: true,
    }),
    [],
    "foreign history read",
  );
  assertions.push("time_session_history_foreign");

  for (const includeArchived of [false, true]) {
    await assertHistoryRpcRows(
      input.clientA,
      historyArgs({
        start: "2000-01-01",
        end: "2000-01-02",
        includeArchived,
      }),
      [input.timeSessionA.id],
      "mixed history read",
    );
  }
  assertions.push("time_session_history_mixed_archive");

  await assertHistoryRpcRows(
    input.clientA,
    historyArgs({
      start: "2000-01-01",
      end: "2000-01-02",
      includeArchived: true,
      cursorStartedAt: input.timeSessionB.started_at,
      cursorSessionId: input.timeSessionB.id,
    }),
    [],
    "foreign-cursor history read",
  );
  assertions.push("time_session_history_foreign_cursor");

  const invalidHistoryCalls = [
    input.clientA.rpc(
      "list_my_occurrence_time_session_history",
      historyArgs({ start: "2000-01-02", end: "2000-01-01" }),
    ),
    input.clientA.rpc("list_my_occurrence_time_session_history", {
      ...historyArgs({ start: "2000-01-01", end: "2000-01-02" }),
      cursor_started_at: input.timeSessionA.started_at,
      cursor_session_id: null,
    }),
    input.clientA.rpc("list_my_occurrence_time_session_history", {
      ...historyArgs({ start: "2000-01-01", end: "2000-01-02" }),
      page_size: 0,
    }),
    input.clientA.rpc("list_my_occurrence_time_session_history", {
      ...historyArgs({ start: "2000-01-01", end: "2000-01-02" }),
      page_size: 1_001,
    }),
  ];

  for (const [index, call] of invalidHistoryCalls.entries()) {
    assertRpcRejected(
      await call,
      `invalid history read ${index + 1}`,
    );
  }
  assertions.push("time_session_history_invalid_inputs");

  return assertions;
}

async function assertAnonymousTimeSessionRpcDenial(config) {
  const anonymous = createSupabase(config.url, config.publishableKey);
  const idRead = await anonymous.rpc("list_my_occurrence_time_sessions", {
    occurrence_ids: [],
  });
  const historyRead = await anonymous.rpc(
    "list_my_occurrence_time_session_history",
    historyArgs({ start: "2000-01-01", end: "2000-01-02" }),
  );

  assertRpcRejected(idRead, "anonymous arbitrary-ID read");
  assertRpcRejected(historyRead, "anonymous history read");

  return ["time_session_id_anon_denied", "time_session_history_anon_denied"];
}

async function assertIdRpcRows(client, occurrenceIds, expectedIds, action) {
  const response = await client.rpc("list_my_occurrence_time_sessions", {
    occurrence_ids: occurrenceIds,
  });
  assertSuccessfulSessionRows(response, expectedIds, action);
}

async function assertHistoryRpcRows(client, args, expectedIds, action) {
  const response = await client.rpc(
    "list_my_occurrence_time_session_history",
    args,
  );
  assertSuccessfulSessionRows(response, expectedIds, action);
}

function historyArgs(input) {
  return {
    range_start_local_date: input.start,
    range_end_local_date: input.end,
    include_archived: input.includeArchived ?? false,
    through_started_at: input.throughStartedAt ?? "2000-01-03T00:00:00Z",
    cursor_started_at: input.cursorStartedAt ?? null,
    cursor_session_id: input.cursorSessionId ?? null,
    page_size: 1_000,
  };
}

export function assertSuccessfulSessionRows(response, expectedIds, action) {
  if (response.error) {
    throw new Error(`Unexpected error during ${action}: ${response.error.message}`);
  }

  const rows = response.data ?? [];
  const expected = new Set(expectedIds);

  if (
    rows.length !== expected.size ||
    rows.some((row) => !expected.has(row.id))
  ) {
    throw new Error(`RLS returned an unexpected time-session scope during ${action}.`);
  }
}

function assertRpcRejected(response, action, expectedMessage) {
  if (!response.error) {
    throw new Error(`RPC unexpectedly allowed ${action}.`);
  }

  if (
    expectedMessage &&
    !response.error.message.toLowerCase().includes(expectedMessage.toLowerCase())
  ) {
    throw new Error(`RPC rejected ${action} with an unexpected safe error.`);
  }
}

async function assertProfileIsolation(client, otherUserId) {
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("id", otherUserId);

  assertNoError(error, "reading another user's profile");
  assertNoRows(data, "another user's profile");

  return "profile_select";
}

async function assertCategoryIsolation(client, otherUserId) {
  const { data, error } = await client
    .from("categories")
    .select("id")
    .eq("user_id", otherUserId);

  assertNoError(error, "reading another user's categories");
  assertNoRows(data, "another user's categories");

  return "category_select";
}

async function assertBehaviorIsolation(client, otherBehaviorId) {
  const { data, error } = await client
    .from("behaviors")
    .select("id")
    .eq("id", otherBehaviorId);

  assertNoError(error, "reading another user's behavior");
  assertNoRows(data, "another user's behavior");

  return "behavior_select";
}

async function assertBehaviorInsertCheck(client, otherUserId) {
  const { data, error } = await client
    .from("behaviors")
    .insert({
      user_id: otherUserId,
      category_id: null,
      title: "RLS smoke forbidden insert",
      description: null,
      recurrence_rule: {
        frequency: "daily",
        interval: 1,
      },
      scheduled_time: "10:00",
      timezone: "America/New_York",
      browser_reminder_enabled: true,
      email_reminder_enabled: false,
      reminder_offset_minutes: 0,
      active: true,
      archived_at: null,
    })
    .select("id");

  if (!error) {
    throw new Error(
      `RLS allowed inserting a behavior for another user: ${JSON.stringify(data)}`,
    );
  }

  return "behavior_insert_check";
}

async function assertBehaviorUpdateIsolation(client, otherBehaviorId) {
  const { data, error } = await client
    .from("behaviors")
    .update({ title: "RLS smoke forbidden update" })
    .eq("id", otherBehaviorId)
    .select("id");

  assertNoError(error, "updating another user's behavior");
  assertNoRows(data, "updated behavior rows");

  return "behavior_update";
}

async function assertOwnBehaviorVisible(client, behaviorId) {
  const { data, error } = await client
    .from("behaviors")
    .select("id")
    .eq("id", behaviorId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`RLS hid the signed-in user's own behavior: ${error?.message}`);
  }

  return "own_behavior_select";
}

function createSupabase(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function assertNoError(error, action) {
  if (error) {
    throw new Error(`Unexpected error while ${action}: ${error.message}`);
  }
}

function assertNoRows(data, label) {
  if (data && data.length > 0) {
    throw new Error(`RLS exposed ${label}.`);
  }
}

function normalizeEnvValue(value) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseEnvironmentValue(rawValue) {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue.slice(1, -1);
    }
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const env = {};
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return env;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(
      `${basename(process.argv[1])} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
