import { Temporal } from "@js-temporal/polyfill";

export const PUBLIC_TRUST_CHECKS = {
  source_to_deployment_provenance: {
    meaning: "The named source commit produced both named production deployments.",
    scopeLimit: "It does not prove that later configuration or provider state is unchanged.",
    freshnessHours: 24,
  },
  production_dependency_vulnerabilities: {
    meaning: "The named commit's production dependencies completed the declared vulnerability check.",
    scopeLimit: "It covers declared production dependencies and the tool's data at completion time only.",
    freshnessHours: 168,
  },
  code_scanning: {
    meaning: "The named commit completed the repository's configured code-scanning checks.",
    scopeLimit: "It covers configured analyzers and rules only and cannot establish the absence of defects.",
    freshnessHours: 168,
  },
  secret_scanning: {
    meaning: "The named commit completed the repository's available secret-scanning check.",
    scopeLimit: "It covers patterns and repository history visible to the configured platform only.",
    freshnessHours: 168,
  },
  public_artifact_integrity: {
    meaning: "The named commit's generated public artifacts match their declared manifests and sanitization rules.",
    scopeLimit: "It covers generated public files, not private operational records or live-route availability.",
    freshnessHours: 24,
  },
  application_live_route_comparison: {
    meaning: "The required application routes on the named production deployment matched the declared route contract.",
    scopeLimit: "It covers the sampled routes and responses at completion time, not every authenticated workflow.",
    freshnessHours: 24,
  },
  marketing_live_route_comparison: {
    meaning: "The required marketing routes on the named production deployment matched the declared route contract.",
    scopeLimit: "It covers declared marketing routes at completion time, not every external cache or network path.",
    freshnessHours: 24,
  },
  hosted_migration_boundary: {
    meaning: "The hosted database migration boundary matched the named source commit's migration history.",
    scopeLimit: "It proves migration-history alignment only, not correctness of user-owned data.",
    freshnessHours: 24,
  },
  cross_account_rls_isolation: {
    meaning: "Disposable accounts could not read or mutate each other's tested rows through ordinary authenticated clients.",
    scopeLimit: "It covers only the tested tables and operations at completion time.",
    freshnessHours: 168,
  },
} as const;

export const PUBLIC_TRUST_CHECK_IDS = Object.keys(
  PUBLIC_TRUST_CHECKS,
) as PublicTrustCheckId[];

export type PublicTrustCheckId = keyof typeof PUBLIC_TRUST_CHECKS;
export type PublicTrustStatus =
  | "passed"
  | "failed"
  | "stale"
  | "not_run"
  | "unavailable";

export type PublicTrustEvidenceSnapshot = {
  schema: "cadence.public-trust-evidence";
  schema_version: 1;
  snapshot_id: string;
  snapshot_url: string;
  source_commit: string;
  application_deployment: { id: string; url: string };
  marketing_deployment: { id: string; url: string };
  workflow_run: { id: string; url: string };
  built_at: string;
  verified_at: string;
  freshness_deadline: string;
  checks: PublicTrustEvidenceCheck[];
};

export type PublicTrustEvidenceCheck = {
  id: PublicTrustCheckId;
  status: PublicTrustStatus;
  scope: string;
  scope_limit: string;
  tool: { name: string; version: string };
  completed_at: string | null;
  freshness_deadline: string | null;
  summary: string;
  unavailable_reason: string | null;
  evidence_url: string;
  source_commit: string;
  application_deployment_id: string;
  marketing_deployment_id: string;
};

export type PublicTrustValidationResult =
  | { ok: true; value: PublicTrustEvidenceSnapshot }
  | { ok: false; errors: string[] };

export type CurrentPublicTrustDeployment = {
  source_commit: string;
  application_deployment_id: string;
  marketing_deployment_id: string;
};

const STATUSES = new Set<PublicTrustStatus>([
  "passed",
  "failed",
  "stale",
  "not_run",
  "unavailable",
]);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]+$/;
const SNAPSHOT_ID_PATTERN = /^20\d{6}T\d{6}Z-[0-9a-f]{12}$/;
const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|authorization|cookie|headers?|scanner_(?:match|finding)|user_(?:id|email)|behavior|occurrence|notes?|provider_payload|private_(?:host|repo))/i;
const SENSITIVE_VALUE_PATTERN = /(?:bearer\s+[A-Za-z0-9._~-]+|(?:secret|token|password|authorization|cookie)\s*[:=]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)\b)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function parseInstant(value: unknown): Temporal.Instant | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return null;
  try {
    return Temporal.Instant.from(value);
  } catch {
    return null;
  }
}

function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !SENSITIVE_VALUE_PATTERN.test(url.hostname);
  } catch {
    return false;
  }
}

function isImmutableEvidenceUrl(
  value: unknown,
  commit: string,
  workflowRunId: string,
  applicationDeploymentId: string,
  marketingDeploymentId: string,
): value is string {
  if (!isPublicHttpsUrl(value)) return false;
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);
  return (
    !segments.includes("latest.json") &&
    ((url.hostname === "github.com" &&
      (url.pathname.includes(`/blob/${commit}/`) ||
        url.pathname.includes(`/actions/runs/${workflowRunId}`))) ||
      (url.hostname.endsWith(".github.io") &&
        [workflowRunId, applicationDeploymentId, marketingDeploymentId].every(
          (id) => segments.includes(id),
        )))
  );
}

function findSensitiveData(value: unknown, path = "snapshot"): string[] {
  if (typeof value === "string") {
    return SENSITIVE_VALUE_PATTERN.test(value) ? [`${path} contains prohibited sensitive content.`] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => findSensitiveData(item, `${path}[${index}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(SENSITIVE_KEY_PATTERN.test(key) ? [`${path}.${key} is a prohibited sensitive field.`] : []),
    ...findSensitiveData(item, `${path}.${key}`),
  ]);
}

export function validatePublicTrustEvidence(input: unknown): PublicTrustValidationResult {
  const errors = findSensitiveData(input);
  if (!isRecord(input)) return { ok: false, errors: [...errors, "Snapshot must be an object."] };

  const snapshotKeys = ["schema", "schema_version", "snapshot_id", "snapshot_url", "source_commit", "application_deployment", "marketing_deployment", "workflow_run", "built_at", "verified_at", "freshness_deadline", "checks"];
  if (!hasExactKeys(input, snapshotKeys)) errors.push("Snapshot has missing or unknown fields.");
  if (input.schema !== "cadence.public-trust-evidence") errors.push("schema must be cadence.public-trust-evidence.");
  if (input.schema_version !== 1) errors.push("schema_version must be integer 1.");
  if (typeof input.snapshot_id !== "string" || !SNAPSHOT_ID_PATTERN.test(input.snapshot_id)) errors.push("snapshot_id is invalid.");
  if (typeof input.source_commit !== "string" || !COMMIT_PATTERN.test(input.source_commit)) errors.push("source_commit must be a lowercase 40-character commit SHA.");

  const application = input.application_deployment;
  const marketing = input.marketing_deployment;
  const workflow = input.workflow_run;
  for (const [name, value] of [["application_deployment", application], ["marketing_deployment", marketing], ["workflow_run", workflow]] as const) {
    if (!isRecord(value) || !hasExactKeys(value, ["id", "url"]) || typeof value.id !== "string" || !IDENTIFIER_PATTERN.test(value.id) || !isPublicHttpsUrl(value.url)) errors.push(`${name} is invalid.`);
  }
  const commit = typeof input.source_commit === "string" ? input.source_commit : "";
  const workflowRunId = isRecord(workflow) && typeof workflow.id === "string" ? workflow.id : "";
  const applicationDeploymentId = isRecord(application) && typeof application.id === "string" ? application.id : "";
  const marketingDeploymentId = isRecord(marketing) && typeof marketing.id === "string" ? marketing.id : "";
  if (!isRecord(workflow) || !isImmutableEvidenceUrl(workflow.url, commit, workflowRunId, applicationDeploymentId, marketingDeploymentId)) errors.push("workflow_run.url must identify the immutable named workflow run.");
  if (!isImmutableEvidenceUrl(input.snapshot_url, commit, workflowRunId, applicationDeploymentId, marketingDeploymentId)) errors.push("snapshot_url must be an immutable GitHub URL pinned by commit or by workflow and deployment IDs.");

  const builtAt = parseInstant(input.built_at);
  const verifiedAt = parseInstant(input.verified_at);
  const snapshotDeadline = parseInstant(input.freshness_deadline);
  if (!builtAt) errors.push("built_at is not a valid UTC timestamp.");
  if (!verifiedAt) errors.push("verified_at is not a valid UTC timestamp.");
  if (!snapshotDeadline) errors.push("freshness_deadline is not a valid UTC timestamp.");
  if (builtAt && verifiedAt && Temporal.Instant.compare(builtAt, verifiedAt) > 0) errors.push("built_at must not be after verified_at.");

  if (!Array.isArray(input.checks)) {
    errors.push("checks must be an array.");
    return { ok: false, errors };
  }
  const seen = new Set<string>();
  const deadlines: Temporal.Instant[] = [];
  for (const [index, rawCheck] of input.checks.entries()) {
    const path = `checks[${index}]`;
    const keys = ["id", "status", "scope", "scope_limit", "tool", "completed_at", "freshness_deadline", "summary", "unavailable_reason", "evidence_url", "source_commit", "application_deployment_id", "marketing_deployment_id"];
    if (!isRecord(rawCheck)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    if (!hasExactKeys(rawCheck, keys)) errors.push(`${path} has missing or unknown fields.`);
    const id = rawCheck.id;
    if (typeof id !== "string" || !(id in PUBLIC_TRUST_CHECKS)) {
      errors.push(`${path}.id is unknown.`);
      continue;
    }
    if (seen.has(id)) errors.push(`${path}.id is duplicated.`);
    seen.add(id);
    if (typeof rawCheck.status !== "string" || !STATUSES.has(rawCheck.status as PublicTrustStatus)) errors.push(`${path}.status is unknown.`);
    for (const field of ["scope", "scope_limit", "summary"] as const) {
      if (typeof rawCheck[field] !== "string" || rawCheck[field].trim().length < 8 || rawCheck[field].length > 500) errors.push(`${path}.${field} must contain 8 to 500 sanitized characters.`);
    }
    if (!isRecord(rawCheck.tool) || !hasExactKeys(rawCheck.tool, ["name", "version"]) || typeof rawCheck.tool.name !== "string" || typeof rawCheck.tool.version !== "string" || !rawCheck.tool.name.trim() || !rawCheck.tool.version.trim()) errors.push(`${path}.tool is invalid.`);
    if (!isImmutableEvidenceUrl(rawCheck.evidence_url, commit, workflowRunId, applicationDeploymentId, marketingDeploymentId)) errors.push(`${path}.evidence_url must be immutable and pinned by commit or by workflow and deployment IDs.`);
    if (rawCheck.source_commit !== input.source_commit || rawCheck.application_deployment_id !== (isRecord(application) ? application.id : undefined) || rawCheck.marketing_deployment_id !== (isRecord(marketing) ? marketing.id : undefined)) errors.push(`${path} deployment subject does not match the snapshot.`);

    const status = rawCheck.status as PublicTrustStatus;
    const completedAt = parseInstant(rawCheck.completed_at);
    const deadline = parseInstant(rawCheck.freshness_deadline);
    if (status === "not_run" || status === "unavailable") {
      if (rawCheck.completed_at !== null || rawCheck.freshness_deadline !== null) errors.push(`${path} ${status} results must have null completion and freshness timestamps.`);
    } else {
      if (!completedAt) errors.push(`${path}.completed_at is not a valid UTC timestamp.`);
      if (!deadline) errors.push(`${path}.freshness_deadline is not a valid UTC timestamp.`);
      if (completedAt && deadline) {
        const expected = completedAt.add({ hours: PUBLIC_TRUST_CHECKS[id as PublicTrustCheckId].freshnessHours });
        if (!expected.equals(deadline)) errors.push(`${path}.freshness_deadline does not match the check-specific policy.`);
        deadlines.push(deadline);
      }
    }
    if (status === "unavailable") {
      if (typeof rawCheck.unavailable_reason !== "string" || rawCheck.unavailable_reason.trim().length < 8) errors.push(`${path}.unavailable_reason must state a concrete reason.`);
    } else if (rawCheck.unavailable_reason !== null) errors.push(`${path}.unavailable_reason must be null unless status is unavailable.`);
  }
  for (const id of PUBLIC_TRUST_CHECK_IDS) if (!seen.has(id)) errors.push(`Missing required check: ${id}.`);
  if (input.checks.length !== PUBLIC_TRUST_CHECK_IDS.length) errors.push(`checks must contain exactly ${PUBLIC_TRUST_CHECK_IDS.length} required checks.`);
  if (snapshotDeadline && deadlines.length > 0 && !snapshotDeadline.equals(deadlines.reduce((earliest, value) => Temporal.Instant.compare(value, earliest) < 0 ? value : earliest))) errors.push("freshness_deadline must equal the earliest completed check deadline.");

  return errors.length === 0
    ? { ok: true, value: input as PublicTrustEvidenceSnapshot }
    : { ok: false, errors };
}

export function normalizePublicTrustEvidence(input: unknown, now: Temporal.Instant, current: CurrentPublicTrustDeployment): PublicTrustValidationResult {
  const result = validatePublicTrustEvidence(input);
  if (!result.ok) return result;
  const deploymentMatches = result.value.source_commit === current.source_commit && result.value.application_deployment.id === current.application_deployment_id && result.value.marketing_deployment.id === current.marketing_deployment_id;
  return {
    ok: true,
    value: {
      ...result.value,
      checks: result.value.checks.map((check) => ({
        ...check,
        status: check.status === "passed" && (!deploymentMatches || !check.freshness_deadline || Temporal.Instant.compare(now, Temporal.Instant.from(check.freshness_deadline)) > 0) ? "stale" : check.status,
      })),
    },
  };
}
