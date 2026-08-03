import { isIP } from "node:net";
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path, { basename } from "node:path";
import { pathToFileURL } from "node:url";

export const HOSTED_PREFLIGHT_SCHEMA_VERSION = "1.0.0";

export const HOSTED_STAGE_NAMES = Object.freeze([
  "public_read_baseline",
  "authenticated_read_baseline",
  "authenticated_read_ramp",
  "mixed_mutation_ramp",
  "spike_recovery",
  "soak",
  "contention_operator",
  "breakpoint",
]);

export const HOSTED_HARD_CEILINGS = Object.freeze({
  maximum_users: 100,
  maximum_requests_per_second: 60,
  maximum_runtime_seconds: 3_900,
  maximum_requests: 200_000,
  maximum_source_ips: 999,
  maximum_workers: 100,
});

const TOP_LEVEL_KEYS = Object.freeze([
  "schema_version",
  "target",
  "approvals",
  "traffic",
  "data",
  "monitoring",
  "verification",
]);
const TARGET_KEYS = Object.freeze([
  "classification",
  "application_url",
  "production_application_url",
  "deployment_id",
  "deployment_environment",
  "vercel_project_id",
  "vercel_region",
  "vercel_runtime",
  "fluid_compute",
  "supabase_project_ref",
  "production_supabase_project_ref",
  "supabase_region",
  "supabase_compute_tier",
  "isolation_posture",
  "deployment_protection",
  "unrelated_traffic_blocked",
]);
const APPROVAL_KEYS = Object.freeze([
  "policy_reviewed_at",
  "owner_authorization_reference",
  "vercel_plan",
  "vercel_approval_reference",
  "vercel_approved_at",
  "approved_start_at",
  "approved_end_at",
  "supabase_plan",
  "supabase_coordination_status",
  "supabase_coordination_reference",
]);
const TRAFFIC_KEYS = Object.freeze([
  "stage",
  "prior_stage_evidence_reference",
  "human_checkpoint_reference",
  "maximum_users",
  "maximum_requests_per_second",
  "maximum_runtime_seconds",
  "maximum_requests",
  "cost_ceiling_usd",
  "source_geography",
  "source_ips",
  "distributed",
  "worker_count",
  "automatic_stage_advance",
]);
const DATA_KEYS = Object.freeze([
  "synthetic_only",
  "production_data_copied",
  "real_user_access",
  "real_email_recipients",
  "active_push_subscriptions",
  "google_oauth_load",
  "destructive_workloads",
  "provider_mode",
  "provider_stub_url",
  "production_provider_url",
  "fixture_cohorts",
]);
const COHORT_KEYS = Object.freeze([
  "empty",
  "typical_daily",
  "review_heavy",
  "export_heavy",
  "heavy_schedule",
]);
const MONITORING_KEYS = Object.freeze([
  "locust_artifacts",
  "cadence_performance_timing",
  "vercel_request_status",
  "vercel_duration",
  "vercel_invocations",
  "vercel_memory_cpu",
  "vercel_cost",
  "supabase_cpu",
  "supabase_memory",
  "supabase_disk_io",
  "supabase_connections",
  "supabase_postgrest_auth",
  "supabase_slow_queries",
  "retention_end_at",
]);
const VERIFICATION_KEYS = Object.freeze([
  "git_commit",
  "deployment_git_commit",
  "dirty_worktree",
  "repository_verification_passed",
  "local_protocol_smoke_passed",
  "local_integrity_passed",
  "hosted_rls_smoke_passed",
  "hosted_migration_comparison_passed",
  "supabase_advisors_reviewed",
  "unauthenticated_smoke_passed",
  "authenticated_one_user_smoke_passed",
  "exact_cleanup_dry_run_passed",
  "monitoring_collection_tested",
]);
const REQUIRED_TRUE_MONITORING_KEYS = MONITORING_KEYS.filter(
  (key) => key !== "retention_end_at",
);
const REQUIRED_TRUE_VERIFICATION_KEYS = VERIFICATION_KEYS.filter(
  (key) =>
    ![
      "git_commit",
      "deployment_git_commit",
      "dirty_worktree",
    ].includes(key),
);
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{7,255}$/;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SECRET_KEY_PATTERN =
  /password|secret|token|cookie|service.?role|publishable.?key|api.?key/i;
const SECRET_VALUE_PATTERNS = Object.freeze([
  /\bBearer\s+\S+/i,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
]);
const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const POLICY_MAX_AGE_MILLISECONDS = 30 * ONE_DAY_MILLISECONDS;

export class HostedPreflightError extends Error {}

function requireObject(value, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HostedPreflightError(`${label} must be an object.`);
  }
  return value;
}

function requireExactKeys(value, keys, label) {
  const object = requireObject(value, label);
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new HostedPreflightError(
      `${label} must contain exactly: ${expected.join(", ")}.`,
    );
  }
  return object;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || !value) {
    throw new HostedPreflightError(`${label} must be a nonempty trimmed string.`);
  }
  return value;
}

function requireReference(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const reference = requireString(value, label);
  if (!REFERENCE_PATTERN.test(reference)) {
    throw new HostedPreflightError(`${label} has an invalid reference form.`);
  }
  return reference;
}

function requireBoolean(value, expected, label) {
  if (value !== expected) {
    throw new HostedPreflightError(`${label} must be ${String(expected)}.`);
  }
  return value;
}

function requirePositiveNumber(value, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > maximum
  ) {
    throw new HostedPreflightError(
      `${label} must be greater than zero and no more than ${maximum}.`,
    );
  }
  return value;
}

function requirePositiveInteger(value, maximum, label) {
  requirePositiveNumber(value, maximum, label);
  if (!Number.isSafeInteger(value)) {
    throw new HostedPreflightError(`${label} must be a safe integer.`);
  }
  return value;
}

function requireCanonicalInstant(value, label) {
  const instant = requireString(value, label);
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== instant) {
    throw new HostedPreflightError(
      `${label} must be a canonical UTC ISO instant.`,
    );
  }
  return date;
}

function requireHttpsOrigin(value, label) {
  const raw = requireString(value, label);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HostedPreflightError(`${label} must be a valid HTTPS origin.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    (url.port && url.port !== "443")
  ) {
    throw new HostedPreflightError(`${label} must be a bare HTTPS origin.`);
  }
  return url.origin;
}

function requireDifferent(left, right, label) {
  if (left === right) {
    throw new HostedPreflightError(`${label} must be isolated from production.`);
  }
}

function rejectSecretMaterial(value, pathLabel = "manifest") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      rejectSecretMaterial(entry, `${pathLabel}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new HostedPreflightError(
          `${pathLabel}.${key} is a forbidden secret-bearing field.`,
        );
      }
      rejectSecretMaterial(entry, `${pathLabel}.${key}`);
    }
    return;
  }
  if (
    typeof value === "string" &&
    SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    throw new HostedPreflightError(
      `${pathLabel} contains forbidden secret or identity material.`,
    );
  }
}

function validateTarget(value) {
  const target = requireExactKeys(value, TARGET_KEYS, "Hosted target");
  if (target.classification !== "hosted_staging") {
    throw new HostedPreflightError(
      "Hosted target classification must be hosted_staging.",
    );
  }
  const applicationUrl = requireHttpsOrigin(
    target.application_url,
    "Hosted application URL",
  );
  const productionApplicationUrl = requireHttpsOrigin(
    target.production_application_url,
    "Production application URL",
  );
  requireDifferent(
    applicationUrl,
    productionApplicationUrl,
    "Hosted application URL",
  );
  if (!/^dpl_[A-Za-z0-9]+$/.test(target.deployment_id)) {
    throw new HostedPreflightError("Hosted deployment ID must use the Vercel dpl_ form.");
  }
  if (!/^prj_[A-Za-z0-9]+$/.test(target.vercel_project_id)) {
    throw new HostedPreflightError("Hosted Vercel project ID must use the prj_ form.");
  }
  if (!new Set(["preview", "staging"]).has(target.deployment_environment)) {
    throw new HostedPreflightError(
      "Hosted deployment environment must be preview or staging.",
    );
  }
  requireString(target.vercel_region, "Vercel region");
  requireString(target.vercel_runtime, "Vercel runtime");
  if (typeof target.fluid_compute !== "boolean") {
    throw new HostedPreflightError("Fluid Compute posture must be boolean.");
  }
  for (const [key, label] of [
    ["supabase_project_ref", "Supabase staging project ref"],
    ["production_supabase_project_ref", "Supabase production project ref"],
  ]) {
    if (!SUPABASE_PROJECT_REF_PATTERN.test(target[key])) {
      throw new HostedPreflightError(`${label} has an invalid project-ref form.`);
    }
  }
  requireDifferent(
    target.supabase_project_ref,
    target.production_supabase_project_ref,
    "Supabase staging project",
  );
  requireString(target.supabase_region, "Supabase region");
  requireString(target.supabase_compute_tier, "Supabase compute tier");
  if (target.isolation_posture !== "dedicated_synthetic_only") {
    throw new HostedPreflightError(
      "Hosted isolation posture must be dedicated_synthetic_only.",
    );
  }
  if (target.deployment_protection !== "source_ip_allowlist") {
    throw new HostedPreflightError(
      "Hosted deployment protection must be source_ip_allowlist.",
    );
  }
  requireBoolean(
    target.unrelated_traffic_blocked,
    true,
    "Unrelated hosted traffic block",
  );
  return {
    ...target,
    application_url: applicationUrl,
    production_application_url: productionApplicationUrl,
  };
}

function validateApprovals(value, now) {
  const approvals = requireExactKeys(
    value,
    APPROVAL_KEYS,
    "Hosted approvals",
  );
  const policyReviewedAt = requireCanonicalInstant(
    approvals.policy_reviewed_at,
    "Provider policy review time",
  );
  if (
    policyReviewedAt.getTime() > now.getTime() ||
    now.getTime() - policyReviewedAt.getTime() > POLICY_MAX_AGE_MILLISECONDS
  ) {
    throw new HostedPreflightError(
      "Provider policy review must be no more than 30 days old and not in the future.",
    );
  }
  requireReference(
    approvals.owner_authorization_reference,
    "Owner authorization reference",
  );
  if (approvals.vercel_plan !== "enterprise") {
    throw new HostedPreflightError(
      "Vercel plan must be enterprise before hosted load is permitted.",
    );
  }
  requireReference(
    approvals.vercel_approval_reference,
    "Vercel approval reference",
  );
  const vercelApprovedAt = requireCanonicalInstant(
    approvals.vercel_approved_at,
    "Vercel approval time",
  );
  if (vercelApprovedAt.getTime() > now.getTime()) {
    throw new HostedPreflightError("Vercel approval time cannot be in the future.");
  }
  const start = requireCanonicalInstant(
    approvals.approved_start_at,
    "Approved start time",
  );
  const end = requireCanonicalInstant(
    approvals.approved_end_at,
    "Approved end time",
  );
  if (start.getTime() >= end.getTime()) {
    throw new HostedPreflightError("Approved end time must follow approved start time.");
  }
  if (end.getTime() <= now.getTime()) {
    throw new HostedPreflightError("The provider-approved traffic window has expired.");
  }
  if (!new Set(["pro", "team", "enterprise"]).has(approvals.supabase_plan)) {
    throw new HostedPreflightError("Supabase plan must be pro, team, or enterprise.");
  }
  const coordinationRequired = new Set(["team", "enterprise"]).has(
    approvals.supabase_plan,
  );
  if (coordinationRequired) {
    if (approvals.supabase_coordination_status !== "approved") {
      throw new HostedPreflightError(
        "Team or Enterprise Supabase load requires approved support coordination.",
      );
    }
    requireReference(
      approvals.supabase_coordination_reference,
      "Supabase coordination reference",
    );
  } else {
    if (
      approvals.supabase_coordination_status !==
        "not_required_under_current_guidance" ||
      approvals.supabase_coordination_reference !== null
    ) {
      throw new HostedPreflightError(
        "Pro Supabase staging must record coordination as not required under current guidance with a null reference.",
      );
    }
  }
  return {
    ...approvals,
    start,
    end,
    coordination_required: coordinationRequired,
  };
}

function validateTraffic(value, approvals, now) {
  const traffic = requireExactKeys(value, TRAFFIC_KEYS, "Hosted traffic");
  if (!HOSTED_STAGE_NAMES.includes(traffic.stage)) {
    throw new HostedPreflightError("Hosted traffic stage is not canonical.");
  }
  if (traffic.stage === HOSTED_STAGE_NAMES[0]) {
    if (traffic.prior_stage_evidence_reference !== null) {
      throw new HostedPreflightError(
        "The first hosted stage must not claim prior-stage evidence.",
      );
    }
  } else {
    requireReference(
      traffic.prior_stage_evidence_reference,
      "Prior-stage evidence reference",
    );
  }
  requireReference(
    traffic.human_checkpoint_reference,
    "Human checkpoint reference",
  );
  const maximumUsers = requirePositiveInteger(
    traffic.maximum_users,
    HOSTED_HARD_CEILINGS.maximum_users,
    "Maximum hosted users",
  );
  const maximumRps = requirePositiveNumber(
    traffic.maximum_requests_per_second,
    HOSTED_HARD_CEILINGS.maximum_requests_per_second,
    "Maximum hosted requests per second",
  );
  const maximumRuntimeSeconds = requirePositiveInteger(
    traffic.maximum_runtime_seconds,
    HOSTED_HARD_CEILINGS.maximum_runtime_seconds,
    "Maximum hosted runtime seconds",
  );
  const maximumRequests = requirePositiveInteger(
    traffic.maximum_requests,
    HOSTED_HARD_CEILINGS.maximum_requests,
    "Maximum hosted requests",
  );
  if (
    maximumRuntimeSeconds * maximumRps < maximumRequests
  ) {
    throw new HostedPreflightError(
      "Maximum hosted requests cannot exceed the runtime and RPS envelope.",
    );
  }
  const executableWindowStartsAt = Math.max(
    approvals.start.getTime(),
    now.getTime(),
  );
  if (
    maximumRuntimeSeconds * 1_000 >
    approvals.end.getTime() - executableWindowStartsAt
  ) {
    throw new HostedPreflightError(
      "Maximum hosted runtime exceeds the provider-approved window.",
    );
  }
  if (
    typeof traffic.cost_ceiling_usd !== "number" ||
    !Number.isFinite(traffic.cost_ceiling_usd) ||
    traffic.cost_ceiling_usd <= 0
  ) {
    throw new HostedPreflightError(
      "Hosted cost ceiling must be a positive finite USD amount.",
    );
  }
  requireString(traffic.source_geography, "Load source geography");
  if (
    !Array.isArray(traffic.source_ips) ||
    traffic.source_ips.length === 0 ||
    traffic.source_ips.length > HOSTED_HARD_CEILINGS.maximum_source_ips
  ) {
    throw new HostedPreflightError(
      `Source IPs must contain 1-${HOSTED_HARD_CEILINGS.maximum_source_ips} addresses.`,
    );
  }
  const sourceIps = traffic.source_ips.map((entry) => {
    const address = requireString(entry, "Load source IP");
    if (isIP(address) === 0) {
      throw new HostedPreflightError("Every load source IP must be a literal IPv4 or IPv6 address.");
    }
    return address;
  });
  if (new Set(sourceIps).size !== sourceIps.length) {
    throw new HostedPreflightError("Load source IPs must be unique.");
  }
  if (typeof traffic.distributed !== "boolean") {
    throw new HostedPreflightError("Distributed load posture must be boolean.");
  }
  requirePositiveInteger(
    traffic.worker_count,
    HOSTED_HARD_CEILINGS.maximum_workers,
    "Hosted worker count",
  );
  requireBoolean(
    traffic.automatic_stage_advance,
    false,
    "Automatic hosted stage advancement",
  );
  return {
    ...traffic,
    maximum_users: maximumUsers,
    maximum_requests_per_second: maximumRps,
    maximum_runtime_seconds: maximumRuntimeSeconds,
    maximum_requests: maximumRequests,
    source_ips: sourceIps,
  };
}

function validateData(value, maximumUsers) {
  const data = requireExactKeys(value, DATA_KEYS, "Hosted data posture");
  for (const [key, expected, label] of [
    ["synthetic_only", true, "Synthetic-only data posture"],
    ["production_data_copied", false, "Production-data copy posture"],
    ["real_user_access", false, "Real-user access posture"],
    ["real_email_recipients", false, "Real-recipient posture"],
    ["active_push_subscriptions", false, "Active push posture"],
    ["google_oauth_load", false, "Google OAuth load posture"],
    ["destructive_workloads", false, "Destructive workload posture"],
  ]) {
    requireBoolean(data[key], expected, label);
  }
  if (data.provider_mode !== "isolated_stub") {
    throw new HostedPreflightError(
      "Hosted provider mode must be isolated_stub.",
    );
  }
  const providerStubUrl = requireHttpsOrigin(
    data.provider_stub_url,
    "Isolated provider stub URL",
  );
  const productionProviderUrl = requireHttpsOrigin(
    data.production_provider_url,
    "Production provider URL",
  );
  requireDifferent(
    providerStubUrl,
    productionProviderUrl,
    "Hosted provider stub URL",
  );
  const cohorts = requireExactKeys(
    data.fixture_cohorts,
    COHORT_KEYS,
    "Hosted fixture cohorts",
  );
  let identityCount = 0;
  for (const [cohort, count] of Object.entries(cohorts)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new HostedPreflightError(
        `Hosted fixture cohort ${cohort} must be a nonnegative integer.`,
      );
    }
    identityCount += count;
  }
  if (identityCount < maximumUsers) {
    throw new HostedPreflightError(
      "Hosted fixture identities must cover the authorized user ceiling.",
    );
  }
  return {
    ...data,
    provider_stub_url: providerStubUrl,
    production_provider_url: productionProviderUrl,
    fixture_identity_count: identityCount,
  };
}

function validateMonitoring(value, approvedEnd) {
  const monitoring = requireExactKeys(
    value,
    MONITORING_KEYS,
    "Hosted monitoring",
  );
  for (const key of REQUIRED_TRUE_MONITORING_KEYS) {
    requireBoolean(monitoring[key], true, `Hosted monitoring ${key}`);
  }
  const retentionEnd = requireCanonicalInstant(
    monitoring.retention_end_at,
    "Monitoring retention end",
  );
  if (
    retentionEnd.getTime() < approvedEnd.getTime() + ONE_DAY_MILLISECONDS
  ) {
    throw new HostedPreflightError(
      "Monitoring retention must extend at least 24 hours beyond the approved window.",
    );
  }
  return monitoring;
}

function validateVerification(value) {
  const verification = requireExactKeys(
    value,
    VERIFICATION_KEYS,
    "Hosted verification",
  );
  for (const key of ["git_commit", "deployment_git_commit"]) {
    if (!GIT_COMMIT_PATTERN.test(verification[key])) {
      throw new HostedPreflightError(
        `${key} must be an exact lowercase 40-character Git commit.`,
      );
    }
  }
  if (verification.git_commit !== verification.deployment_git_commit) {
    throw new HostedPreflightError(
      "Local and deployed Git commits must match exactly.",
    );
  }
  requireBoolean(
    verification.dirty_worktree,
    false,
    "Hosted source dirty-worktree state",
  );
  for (const key of REQUIRED_TRUE_VERIFICATION_KEYS) {
    requireBoolean(verification[key], true, `Hosted verification ${key}`);
  }
  return verification;
}

export function validateHostedPreflightManifest(
  manifest,
  { now = new Date() } = {},
) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new HostedPreflightError("Hosted preflight now must be a valid Date.");
  }
  rejectSecretMaterial(manifest);
  const root = requireExactKeys(
    manifest,
    TOP_LEVEL_KEYS,
    "Hosted preflight manifest",
  );
  if (root.schema_version !== HOSTED_PREFLIGHT_SCHEMA_VERSION) {
    throw new HostedPreflightError(
      `Hosted preflight schema must be ${HOSTED_PREFLIGHT_SCHEMA_VERSION}.`,
    );
  }
  const target = validateTarget(root.target);
  const approvals = validateApprovals(root.approvals, now);
  const traffic = validateTraffic(root.traffic, approvals, now);
  const data = validateData(root.data, traffic.maximum_users);
  validateMonitoring(root.monitoring, approvals.end);
  validateVerification(root.verification);

  return {
    schema_version: HOSTED_PREFLIGHT_SCHEMA_VERSION,
    status: "ready_for_single_stage_human_checkpoint",
    target_classification: target.classification,
    authorized_stage: traffic.stage,
    deployment_environment: target.deployment_environment,
    fluid_compute: target.fluid_compute,
    supabase_plan: approvals.supabase_plan,
    supabase_coordination_required: approvals.coordination_required,
    approved_start_at: approvals.approved_start_at,
    approved_end_at: approvals.approved_end_at,
    maximum_users: traffic.maximum_users,
    maximum_requests_per_second: traffic.maximum_requests_per_second,
    maximum_runtime_seconds: traffic.maximum_runtime_seconds,
    maximum_requests: traffic.maximum_requests,
    cost_ceiling_usd: traffic.cost_ceiling_usd,
    distributed: traffic.distributed,
    worker_count: traffic.worker_count,
    source_ip_count: traffic.source_ips.length,
    fixture_identity_count: data.fixture_identity_count,
    automatic_stage_advance: false,
    synthetic_only: true,
    real_provider_traffic: false,
  };
}

export function parseHostedPreflightArgs(args) {
  if (!Array.isArray(args)) {
    throw new HostedPreflightError("Hosted preflight arguments must be an array.");
  }
  let manifestPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      if (manifestPath !== null || index + 1 >= args.length) {
        throw new HostedPreflightError(
          "Hosted preflight requires one --manifest path.",
        );
      }
      manifestPath = args[index + 1];
      index += 1;
      continue;
    }
    throw new HostedPreflightError(
      `Unknown hosted preflight argument: ${String(argument)}.`,
    );
  }
  if (!manifestPath) {
    throw new HostedPreflightError(
      "Hosted preflight requires --manifest with an owner-only JSON file.",
    );
  }
  return { manifestPath };
}

export function readHostedPreflightManifest(
  manifestPath,
  { repositoryRoot = process.cwd() } = {},
) {
  const requestedPath = path.resolve(
    requireString(manifestPath, "Hosted manifest path"),
  );
  let status;
  try {
    status = lstatSync(requestedPath);
  } catch {
    throw new HostedPreflightError(
      "Hosted preflight manifest must be an accessible regular file.",
    );
  }
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new HostedPreflightError(
      "Hosted preflight manifest must be a regular non-symlink file.",
    );
  }
  if ((status.mode & 0o077) !== 0) {
    throw new HostedPreflightError(
      "Hosted preflight manifest must use owner-only permissions.",
    );
  }
  let realPath;
  let root;
  try {
    realPath = realpathSync(requestedPath);
    root = realpathSync(path.resolve(repositoryRoot));
  } catch {
    throw new HostedPreflightError(
      "Hosted preflight path validation could not resolve its manifest or repository root.",
    );
  }
  const hostedPrivateRoot = path.join(root, "load-tests", ".hosted");
  const relativeToRepository = path.relative(root, realPath);
  const insideRepository =
    relativeToRepository !== "" &&
    !relativeToRepository.startsWith(`..${path.sep}`) &&
    relativeToRepository !== ".." &&
    !path.isAbsolute(relativeToRepository);
  if (insideRepository) {
    const relativeToPrivateRoot = path.relative(hostedPrivateRoot, realPath);
    if (
      relativeToPrivateRoot === "" ||
      relativeToPrivateRoot.startsWith(`..${path.sep}`) ||
      relativeToPrivateRoot === ".." ||
      path.isAbsolute(relativeToPrivateRoot)
    ) {
      throw new HostedPreflightError(
        "A repository-local hosted manifest must live under ignored load-tests/.hosted/.",
      );
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(realPath, "utf8"));
  } catch {
    throw new HostedPreflightError(
      "Hosted preflight manifest must contain valid JSON.",
    );
  }
  return parsed;
}

export function runHostedPreflight(args, options = {}) {
  const { manifestPath } = parseHostedPreflightArgs(args);
  const manifest = readHostedPreflightManifest(manifestPath, options);
  return validateHostedPreflightManifest(manifest, options);
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isEntrypoint) {
  try {
    const result = runHostedPreflight(process.argv.slice(2));
    console.log(
      `Hosted preflight passed for one ${result.authorized_stage} stage: ${result.maximum_users} users, ${result.maximum_requests_per_second} RPS, ${result.maximum_runtime_seconds} seconds, ${result.source_ip_count} source IP(s).`,
    );
  } catch (error) {
    console.error(
      `${basename(process.argv[1])}: ${
        error instanceof Error
          ? error.message
          : "Hosted preflight failed."
      }`,
    );
    process.exitCode = 1;
  }
}
