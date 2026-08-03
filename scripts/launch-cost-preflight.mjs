import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_POLICY_BYTES = 128 * 1024;
const MAX_REVIEW_AGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const REQUIRED_PROVIDER_IDS = Object.freeze([
  "vercel_app",
  "vercel_marketing",
  "supabase",
  "sequenzy",
  "domain",
  "monitoring",
]);

export const REQUIRED_MONITORING_SIGNAL_IDS = Object.freeze([
  "requests",
  "errors",
  "latency",
  "function_execution",
  "database",
  "auth",
  "egress",
  "reminder_backlog",
  "provider_sends",
]);

export const REQUIRED_TRAFFIC_CONTROL_IDS = Object.freeze([
  "anonymous_public",
  "oauth",
  "authenticated_reads",
  "export_downloads",
  "push_subscription_writes",
  "server_actions",
  "reminder_process",
  "occurrence_sync",
]);

const REQUIRED_RESUMPTION_CHECKS = Object.freeze([
  "cost acceleration stopped",
  "traffic and latency stable",
  "integrity and RLS pass",
  "queues understood",
  "owner recorded go decision",
]);

const SENSITIVE_KEY_PARTS = Object.freeze([
  "account_identifier",
  "account_id",
  "billing_email",
  "card",
  "invoice",
  "password",
  "payment",
  "project_ref",
  "recipient_address",
  "secret",
  "token",
]);

export class LaunchCostPreflightError extends Error {
  constructor(message) {
    super(message);
    this.name = "LaunchCostPreflightError";
  }
}

export function inspectLaunchCostPolicyFile(policyPath, options = {}) {
  const stats = lstatSync(policyPath);

  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new LaunchCostPreflightError(
      "The launch cost policy must be a regular non-symlink file.",
    );
  }

  if ((stats.mode & 0o077) !== 0) {
    throw new LaunchCostPreflightError(
      "The launch cost policy must use owner-only permissions (chmod 600).",
    );
  }

  if (stats.size < 2 || stats.size > MAX_POLICY_BYTES) {
    throw new LaunchCostPreflightError(
      "The launch cost policy size is outside the allowed range.",
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(readFileSync(policyPath, "utf8"));
  } catch {
    throw new LaunchCostPreflightError(
      "The launch cost policy must contain valid JSON.",
    );
  }

  return validateLaunchCostPolicy(parsed, options);
}

export function validateLaunchCostPolicy(policy, options = {}) {
  const now = options.now ?? new Date();
  assertPlainObject(policy, "policy");
  assertNoSensitiveData(policy);
  assertExactString(policy.schema_version, "1.0.0", "schema_version");
  assertRecentTimestamp(policy.reviewed_at, "reviewed_at", now);
  validateOwnerPolicy(policy.owner_policy, now);
  validateProviders(policy.providers, now);
  validateProviderPostures(policy.provider_postures);
  validateInventoryById(
    policy.monitoring_signals,
    REQUIRED_MONITORING_SIGNAL_IDS,
    "monitoring signal",
    (entry) => {
      assertNonEmptyString(entry.source, `${entry.id}.source`);
      assertExactString(entry.status, "verified", `${entry.id}.status`);
      assertNonEmptyString(entry.review_cadence, `${entry.id}.review_cadence`);
    },
  );
  validateInventoryById(
    policy.traffic_controls,
    REQUIRED_TRAFFIC_CONTROL_IDS,
    "traffic control",
    (entry) => {
      assertExactString(entry.status, "verified", `${entry.id}.status`);
      assertNonEmptyString(
        entry.enforcement_layer,
        `${entry.id}.enforcement_layer`,
      );
      assertTrue(
        entry.preview_or_log_only_tested,
        `${entry.id}.preview_or_log_only_tested`,
      );
      assertTrue(
        entry.legitimate_paths_tested,
        `${entry.id}.legitimate_paths_tested`,
      );
      assertTrue(
        entry.shared_network_risk_reviewed,
        `${entry.id}.shared_network_risk_reviewed`,
      );
      assertNonEmptyString(entry.rollback_steps, `${entry.id}.rollback_steps`);
    },
  );
  validateIncidentLevels(policy.incident_levels);
  assertStringArray(policy.resumption_checks, "resumption_checks");

  for (const requiredCheck of REQUIRED_RESUMPTION_CHECKS) {
    if (!policy.resumption_checks.includes(requiredCheck)) {
      throw new LaunchCostPreflightError(
        `resumption_checks must include: ${requiredCheck}.`,
      );
    }
  }

  return policy;
}

export function summarizeLaunchCostPolicy(policy) {
  return {
    providerCount: policy.providers.length,
    monitoringSignalCount: policy.monitoring_signals.length,
    trafficControlCount: policy.traffic_controls.length,
    hardStopPosture: policy.owner_policy.hard_stop_posture,
    warningThresholdUsd: policy.owner_policy.warning_threshold_usd,
    urgentThresholdUsd: policy.owner_policy.urgent_threshold_usd,
    emergencyThresholdUsd: policy.owner_policy.emergency_threshold_usd,
  };
}

export function parseLaunchCostPreflightArgs(args) {
  let manifestPath = null;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--manifest") {
      manifestPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    throw new LaunchCostPreflightError(`Unsupported argument: ${value}.`);
  }

  if (!manifestPath) {
    throw new LaunchCostPreflightError("--manifest is required.");
  }

  return { manifestPath };
}

export function assertPrivateLaunchPolicyPath(policyPath, cwd = process.cwd()) {
  const resolvedPath = realpathSync(policyPath);
  const privateRoot = resolve(cwd, ".launch-safety");
  const relativePath = relative(privateRoot, resolvedPath);

  if (
    relativePath === "" ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    throw new LaunchCostPreflightError(
      "The private policy must live under the ignored .launch-safety directory.",
    );
  }

  const resolvedParent = realpathSync(dirname(resolvedPath));
  if (!resolvedParent.startsWith(`${privateRoot}${sep}`)) {
    throw new LaunchCostPreflightError(
      "The private policy directory must resolve under .launch-safety.",
    );
  }
}

function validateOwnerPolicy(ownerPolicy, now) {
  assertPlainObject(ownerPolicy, "owner_policy");
  assertExactString(ownerPolicy.status, "approved", "owner_policy.status");

  const orderedThresholds = [
    ownerPolicy.monthly_normal_budget_usd,
    ownerPolicy.warning_threshold_usd,
    ownerPolicy.urgent_threshold_usd,
    ownerPolicy.emergency_threshold_usd,
    ownerPolicy.maximum_unplanned_spend_usd,
  ];

  if (
    orderedThresholds.some(
      (value) => typeof value !== "number" || !Number.isFinite(value) || value < 0,
    ) ||
    !orderedThresholds.every(
      (value, index) => index === 0 || value > orderedThresholds[index - 1],
    )
  ) {
    throw new LaunchCostPreflightError(
      "The monthly budget and warning, urgent, and emergency thresholds must be finite, nonnegative, and strictly ordered below maximum unplanned spend.",
    );
  }

  assertPositiveInteger(
    ownerPolicy.maximum_hard_stop_outage_minutes,
    "owner_policy.maximum_hard_stop_outage_minutes",
  );

  if (!new Set(["enabled", "declined"]).has(ownerPolicy.hard_stop_posture)) {
    throw new LaunchCostPreflightError(
      "owner_policy.hard_stop_posture must be enabled or declined.",
    );
  }

  assertTrue(
    ownerPolicy.uncovered_costs_acknowledged,
    "owner_policy uncovered costs acknowledgement",
  );
  validateAuthority(ownerPolicy.authority);
  validateNotificationDelivery(ownerPolicy.notification_delivery, now);
}

function validateAuthority(authority) {
  assertPlainObject(authority, "owner_policy.authority");
  assertNonEmptyString(authority.billing_owner_role, "billing_owner_role");
  assertNonEmptyString(authority.incident_owner_role, "incident_owner_role");

  for (const key of [
    "alert_acknowledger_roles",
    "emergency_control_roles",
    "pause_roles",
    "limit_change_roles",
    "resume_roles",
  ]) {
    assertStringArray(authority[key], `authority.${key}`);
  }
}

function validateNotificationDelivery(notificationDelivery, now) {
  assertPlainObject(notificationDelivery, "notification_delivery");

  for (const key of ["primary", "backup"]) {
    const delivery = notificationDelivery[key];
    assertPlainObject(delivery, `${key} notification`);
    assertNonEmptyString(delivery.channel_kind, `${key} notification channel`);
    assertNonEmptyString(delivery.recipient_role, `${key} notification role`);
    assertRecentTimestamp(
      delivery.tested_at,
      `${key} notification tested_at`,
      now,
    );
  }
}

function validateProviders(providers, now) {
  validateInventoryById(
    providers,
    REQUIRED_PROVIDER_IDS,
    "provider",
    (provider) => {
      assertNonEmptyString(provider.plan, `${provider.id}.plan`);
      assertNonEmptyString(
        provider.billing_cycle,
        `${provider.id}.billing_cycle`,
      );
      assertNonEmptyString(
        provider.billing_owner_role,
        `${provider.id}.billing_owner_role`,
      );
      assertHttpsUrl(
        provider.documentation_url,
        `${provider.id}.documentation_url`,
      );

      if (!Array.isArray(provider.costs) || provider.costs.length === 0) {
        throw new LaunchCostPreflightError(
          `${provider.id} must declare at least one fixed or metered cost.`,
        );
      }

      for (const [index, cost] of provider.costs.entries()) {
        assertPlainObject(cost, `${provider.id}.costs[${index}]`);
        assertNonEmptyString(cost.dimension, `${provider.id}.costs.dimension`);
        if (!new Set(["fixed", "metered"]).has(cost.cost_type)) {
          throw new LaunchCostPreflightError(
            `${provider.id}.costs.cost_type must be fixed or metered.`,
          );
        }
        for (const key of [
          "included_quota",
          "overage_rate",
          "current_baseline",
          "control_coverage",
          "control_gap",
        ]) {
          assertNonEmptyString(cost[key], `${provider.id}.costs.${key}`);
        }
      }

      assertPlainObject(provider.control, `${provider.id}.control`);
      assertExactString(
        provider.control.status,
        "verified",
        `${provider.id}.control.status`,
      );
      assertNonEmptyString(provider.control.kind, `${provider.id}.control.kind`);
      assertRecentTimestamp(
        provider.control.tested_at,
        `${provider.id}.control.tested_at`,
        now,
      );
      assertNonEmptyString(
        provider.control.rollback_steps,
        `${provider.id}.control.rollback_steps`,
      );
      assertNonEmptyString(
        provider.control.residual_risk,
        `${provider.id}.control.residual_risk`,
      );
    },
  );
}

function validateProviderPostures(postures) {
  assertPlainObject(postures, "provider_postures");
  const vercel = postures.vercel;
  const supabase = postures.supabase;
  const sequenzy = postures.sequenzy;
  assertPlainObject(vercel, "provider_postures.vercel");
  assertTrue(vercel.spend_notifications_enabled, "Vercel spend notifications");
  assertTrue(vercel.notification_tested, "Vercel notification test");
  if (!new Set(["enabled", "declined"]).has(vercel.hard_limit_posture)) {
    throw new LaunchCostPreflightError(
      "Vercel hard_limit_posture must be enabled or declined.",
    );
  }
  assertTrue(vercel.hard_limit_verified, "Vercel hard-limit posture verification");
  assertTrue(vercel.firewall_log_only_verified, "Vercel log-only firewall test");
  assertTrue(
    vercel.oauth_and_cron_bypasses_tested,
    "Vercel OAuth and Cron bypass tests",
  );

  assertPlainObject(supabase, "provider_postures.supabase");
  if (!new Set(["enabled", "disabled"]).has(supabase.spend_cap_posture)) {
    throw new LaunchCostPreflightError(
      "Supabase spend_cap_posture must be enabled or disabled.",
    );
  }
  assertTrue(supabase.spend_cap_verified, "Supabase Spend Cap verification");
  assertTrue(supabase.covered_items_recorded, "Supabase covered item inventory");
  assertTrue(
    supabase.uncovered_items_recorded,
    "Supabase uncovered item inventory",
  );

  assertPlainObject(sequenzy, "provider_postures.sequenzy");
  assertNonEmptyString(
    sequenzy.usage_control_kind,
    "Sequenzy usage_control_kind",
  );
  assertTrue(sequenzy.usage_control_verified, "Sequenzy usage control verification");
}

function validateIncidentLevels(levels) {
  if (!Array.isArray(levels) || levels.length !== 4) {
    throw new LaunchCostPreflightError(
      "incident_levels must define exactly Levels 0 through 3.",
    );
  }

  for (let level = 0; level <= 3; level += 1) {
    const entry = levels.find((candidate) => candidate?.level === level);
    assertPlainObject(entry, `incident level ${level}`);
    for (const key of [
      "entry_threshold",
      "exit_threshold",
      "decision_owner_role",
      "rollback_steps",
      "escalation",
    ]) {
      assertNonEmptyString(entry[key], `incident level ${level}.${key}`);
    }
    assertPositiveInteger(
      entry.maximum_response_minutes,
      `incident level ${level}.maximum_response_minutes`,
    );
    assertStringArray(
      entry.evidence_to_capture,
      `incident level ${level}.evidence_to_capture`,
    );
    assertStringArray(
      entry.prohibited_actions,
      `incident level ${level}.prohibited_actions`,
    );
  }
}

function validateInventoryById(entries, requiredIds, label, validateEntry) {
  if (!Array.isArray(entries)) {
    throw new LaunchCostPreflightError(`${label} inventory must be an array.`);
  }

  const ids = entries.map((entry) => entry?.id);
  if (new Set(ids).size !== ids.length) {
    throw new LaunchCostPreflightError(`${label} ids must be unique.`);
  }

  for (const requiredId of requiredIds) {
    const entry = entries.find((candidate) => candidate?.id === requiredId);
    assertPlainObject(entry, `${label} ${requiredId}`);
    validateEntry(entry);
  }
}

function assertNoSensitiveData(value, path = "policy") {
  if (typeof value === "string") {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      throw new LaunchCostPreflightError(
        `${path} contains a private recipient value. Store roles only.`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveData(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
      throw new LaunchCostPreflightError(
        `${path} contains a forbidden private billing or credential field.`,
      );
    }
    assertNoSensitiveData(child, `${path}.${key}`);
  }
}

function assertRecentTimestamp(value, label, now) {
  if (typeof value !== "string") {
    throw new LaunchCostPreflightError(`${label} must be an ISO timestamp.`);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new LaunchCostPreflightError(`${label} must be an ISO timestamp.`);
  }

  const age = now.getTime() - timestamp;
  if (age > MAX_REVIEW_AGE_MS || age < -MAX_FUTURE_CLOCK_SKEW_MS) {
    throw new LaunchCostPreflightError(
      `${label} must be current within 31 days and not future-dated.`,
    );
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LaunchCostPreflightError(`${label} must be an object.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new LaunchCostPreflightError(`${label} must be a non-empty string.`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LaunchCostPreflightError(`${label} must be a non-empty string array.`);
  }
  value.forEach((entry) => assertNonEmptyString(entry, label));
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new LaunchCostPreflightError(`${label} must be a positive integer.`);
  }
}

function assertTrue(value, label) {
  if (value !== true) {
    throw new LaunchCostPreflightError(`${label} must be verified true.`);
  }
}

function assertExactString(value, expected, label) {
  if (value !== expected) {
    throw new LaunchCostPreflightError(`${label} must equal ${expected}.`);
  }
}

function assertHttpsUrl(value, label) {
  assertNonEmptyString(value, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new LaunchCostPreflightError(`${label} must be an HTTPS URL.`);
  }
  if (url.protocol !== "https:") {
    throw new LaunchCostPreflightError(`${label} must be an HTTPS URL.`);
  }
}

async function main() {
  try {
    const { manifestPath } = parseLaunchCostPreflightArgs(process.argv.slice(2));
    assertPrivateLaunchPolicyPath(manifestPath);
    const policy = inspectLaunchCostPolicyFile(manifestPath);
    const summary = summarizeLaunchCostPolicy(policy);
    console.info(
      `Launch cost preflight passed: ${summary.providerCount} providers, ` +
        `${summary.monitoringSignalCount} monitoring signals, ` +
        `${summary.trafficControlCount} traffic controls; hard stop ` +
        `${summary.hardStopPosture}.`,
    );
  } catch (error) {
    const message =
      error instanceof LaunchCostPreflightError
        ? error.message
        : "Unexpected preflight failure.";
    console.error(`Launch cost preflight failed: ${message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
