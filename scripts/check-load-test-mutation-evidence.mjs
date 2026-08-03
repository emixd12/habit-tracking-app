import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import {
  assertSanitizedArtifact,
  countUnexpected5xxFailures,
  evaluateRecoveryGate,
  evaluateStageGates,
  parseCsv,
  parseLocustPeakUsers,
  parseLocustStatsCsv,
} from "./load-test-read-report.mjs";
import {
  evaluateDuePastReminderNonReactivation,
  evaluateMutationIntegrityGate,
  evaluateOperatorIsolationAndCausalRepair,
  evaluateOperatorProviderReconciliation,
  evaluateRequestMixGate,
  evaluateSemanticVerificationGate,
  evaluateSoakNoGrowthGate,
  evaluateStableRequestNameGate,
  evaluateStatusEventCorrelation,
  evaluateTimedMutationCoverage,
  evaluateTimezoneDynamicOccurrencePreservation,
  OPERATOR_REQUEST_NAMES,
  REQUIRED_TIMED_MUTATION_REQUEST_NAMES,
  selectHighestSustainableLocalPlateau,
  summarizeRequestMix,
} from "./load-test-mutation-report.mjs";

const root = process.cwd();
const defaultRunsRoot = path.join(root, "load-tests", ".runs");
const mutationManifestPath = path.join(
  root,
  "load-tests",
  "scenarios",
  "mutation-profiles.json",
);
const interactionManifestPath = path.join(
  root,
  "load-tests",
  "scenarios",
  "interaction-map.json",
);

const RUN_ID_PATTERN =
  /^20\d{6}t\d{6}z-[0-9a-f]{12}$/;
const SAFE_STAGE_NAME_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_STAGE_GROUP_PATTERN =
  /^[a-z][a-z0-9_]*$/;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
const RUN_EVIDENCE_SCHEMA_VERSION = "1.1.0";
const SEMANTIC_EVIDENCE_SCHEMA_VERSION = "1.0.0";
const FAKE_PROVIDER_SCHEMA_VERSION = "1.0.0";
const MUTATION_MANIFEST_SCHEMA_VERSION = "1.0.0";
const SUPPORTED_SUITES = new Set([
  "smoke",
  "baseline",
  "ramp",
  "spike",
  "soak",
  "breakpoint",
  "timezone",
  "contention",
  "operator",
  "full",
]);
const TERMINAL_GROUPS = new Set(["breakpoint"]);
const TERMINAL_PERFORMANCE_FAILURE_PREFIXES = [
  "unexpected request failures were not below ",
  "p95 exceeded ",
];
const EXPECTED_SPIKE_STRESS_FAILURE =
  "p95 exceeded 2x the calibrated representative mixed warm baseline";
const SKIP_REASONS = Object.freeze({
  breakpoint:
    "skipped after the first bounded breakpoint performance failure",
});
const REQUIRED_INTEGRITY_ZERO_FIELDS = Object.freeze([
  "crossOwnerRows",
  "duplicateOccurrences",
  "duplicateDeliveries",
  "invalidStatusChains",
  "invalidDefinitionChains",
  "scheduleOnlyDefinitionEvents",
  "invalidReminderStates",
  "orphanRows",
  "falseFreshHorizons",
  "preservationFailures",
  "stuckProcessingClaims",
  "forbiddenRows",
  "boundedGrowth",
]);
const LOCUST_ARTIFACT_PATTERN =
  /(?:\.html|_(?:exceptions|failures|stats|stats_history)\.csv|_semantic-verifications\.json)$/;
const ALLOWED_SEMANTIC_REQUEST_NAMES = new Set(
  REQUIRED_TIMED_MUTATION_REQUEST_NAMES,
);
const MUTATION_CALIBRATION_STAGE = "mixed-calibration-1";
const MUTATION_CALIBRATION_GROUP = "mixed_calibration";
const MUTATION_GATE_LATENCY_FAILURE =
  "p95 exceeded 2x the calibrated representative mixed warm baseline";
const READ_GATE_LATENCY_FAILURE =
  "p95 exceeded 2x the one-user warm baseline";
const SPIKE_RECOVERY_COMPARISON_GATE =
  "spike-recovery-comparison";
const COMPARABLE_MIXED_GROUPS = new Set([
  "mixed_baseline",
  "ramp",
  "spike",
  "soak",
  "breakpoint",
  "operator_overlap",
]);
const STAGE_NAMES_BY_GROUP = Object.freeze({
  smoke: ["smoke-1"],
  mixed_calibration: [MUTATION_CALIBRATION_STAGE],
  mixed_baseline: [
    "mixed-baseline-5",
    "mixed-baseline-10",
  ],
  ramp: ["ramp-10", "ramp-25", "ramp-50", "ramp-100"],
  spike: [
    "spike-baseline-10",
    "spike-hold-100",
    "spike-recovery-10",
  ],
  soak: ["soak-25"],
  breakpoint: [
    "breakpoint-10",
    "breakpoint-25",
    "breakpoint-50",
    "breakpoint-75",
    "breakpoint-100",
  ],
  timezone_changed: ["timezone-changed-5"],
  contention: ["contention-1"],
  operator_overlap: ["operator-overlap-10"],
});
const SUITE_GROUPS = Object.freeze({
  smoke: ["smoke"],
  baseline: ["mixed_calibration", "mixed_baseline"],
  ramp: ["mixed_calibration", "ramp"],
  spike: ["mixed_calibration", "spike"],
  soak: ["mixed_calibration", "ramp", "soak"],
  breakpoint: ["mixed_calibration", "breakpoint"],
  timezone: ["timezone_changed"],
  contention: ["contention"],
  operator: ["mixed_calibration", "operator_overlap"],
  full: [
    "smoke",
    "mixed_calibration",
    "mixed_baseline",
    "ramp",
    "spike",
    "soak",
    "breakpoint",
    "timezone_changed",
    "contention",
    "operator_overlap",
  ],
});
const MUTATION_COHORTS = Object.freeze([
  "typical_daily",
  "review_heavy",
  "export_heavy",
]);
const ALL_COHORTS = Object.freeze([
  "empty",
  ...MUTATION_COHORTS,
  "heavy_schedule",
]);
const INTEGRITY_ROW_COUNT_KEYS = Object.freeze([
  "profiles",
  "categories",
  "behaviors",
  "behavior_definition_events",
  "behavior_schedules",
  "behavior_schedule_slots",
  "occurrences",
  "reminder_deliveries",
  "push_subscriptions",
  "occurrence_status_events",
  "occurrence_sync_state",
  "behaviorlog_import_runs",
  "behaviorlog_import_record_mappings",
  "imported_notes",
  "imported_interventions",
]);
const REMINDER_STATUS_KEYS = Object.freeze([
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
]);
const MUTATION_DELTA_KEYS = Object.freeze([
  "behaviors",
  "schedules",
  "slots",
  "occurrences",
  "statusEvents",
  "definitionEvents",
  "reminders",
]);
const STATUS_TRANSITION_EVIDENCE_KEYS = Object.freeze([
  "baselineEventCount",
  "totalEventCount",
  "appendedEventCount",
  "eventBackedOccurrenceCount",
  "snapshotCorrelatedOccurrenceCount",
]);
const DUE_PAST_EVIDENCE_KEYS = Object.freeze([
  "tracked_occurrences",
  "tracked_deliveries",
  "exercised_occurrences",
  "clear_events",
  "unresolved_occurrences",
  "cancelled_deliveries",
  "reactivated_deliveries",
]);
const INTEGRITY_CHECKPOINT_KEYS = Object.freeze([
  "activePushSubscriptions",
  "cancellationReminderStatuses",
  "checkedAccounts",
  "cohorts",
  "databaseConnectionCount",
  "duePastReminderNonReactivation",
  "integrityChecks",
  "label",
  "mutationDeltas",
  "operatorReminderStatuses",
  "reminderStatuses",
  "rowCounts",
  "runId",
  "statusTransitionEvidence",
  "totalRows",
  "violations",
  "workloadClassification",
]);
const FAKE_PROVIDER_SNAPSHOT_KEYS = Object.freeze([
  "accepted",
  "duplicate_send_attempts",
  "provider",
  "rejected",
  "rejection_reasons",
  "requests_total",
  "response_statuses",
  "schema_version",
  "target_classification",
  "unique_delivery_fingerprints",
  "web_push_attempts",
]);
const OPERATOR_FAKE_PROVIDER_KEYS = Object.freeze([
  "final_replay",
  "isolation_checks",
  "occurrence_request_count",
  "occurrence_sync_causal_repair_proofs",
  "occurrence_sync_prepared_accounts",
  "occurrence_sync_verified_fresh_accounts",
  "operator_required",
  "reminder_request_count",
  "requests",
  "snapshot",
]);
const OPERATOR_REQUEST_KEYS = Object.freeze([
  "duration_ms",
  "name",
  "result",
  "status",
]);
const OCCURRENCE_OPERATOR_RESULT_KEYS = Object.freeze([
  "checked",
  "failed",
  "skipped",
  "synced",
]);
const REMINDER_OPERATOR_RESULT_KEYS = Object.freeze([
  "cancelled",
  "checked",
  "claimed",
  "failed",
  "sent",
  "skipped",
]);
const MAXIMUM_OPERATOR_REQUESTS = 5_000;
const MAXIMUM_OPERATOR_DURATION_MILLISECONDS = 120_000;
// Locust history is periodic and can trail the terminal stats snapshot. Bound
// that unsampled tail to a conservative five seconds at the hard RPS ceiling.
const LOCUST_HISTORY_FRESHNESS_SECONDS = 5;
// Locust 2.46.2 records integer-second history samples and reports a rolling
// request rate over older request buckets. Across 26,815 retained intervals,
// the largest sample gap was five seconds, the largest independently derived
// 5–12 second rate was 50.34 RPS, and the largest reported/derived rolling-rate
// difference was 10.4 RPS. These bounds leave explicit headroom below 60 RPS
// without treating legitimate one-second cumulative-count bursts as current
// RPS violations.
const MAXIMUM_LOCUST_HISTORY_SAMPLE_GAP_SECONDS = 5;
const MINIMUM_DERIVED_RPS_WINDOW_SECONDS = 5;
const MAXIMUM_DERIVED_RPS_WINDOW_SECONDS = 12;
const LOCUST_REPORTED_RPS_EXCLUDED_SECONDS = 2;
const LOCUST_REPORTED_RPS_WINDOW_SECONDS = 10;
const LOCUST_REPORTED_RPS_RECONCILIATION_TOLERANCE = 12;
const MUTATION_EVIDENCE_CAVEATS = Object.freeze([
  "Weights are initial product assumptions, not observed analytics.",
  "All provider sends target a loopback fake; Web Push is disabled.",
  "Results are local capacity evidence, not production capacity.",
]);
const DECLARATION_TOP_LEVEL_KEYS = Object.freeze([
  "abort_thresholds",
  "caveats",
  "ceilings",
  "cohort_counts",
  "contention_pair_count",
  "declared_at",
  "identity_count",
  "read_task_keys",
  "read_weight_percent",
  "request_ceiling_scope",
  "resource_ceilings",
  "run_id",
  "runtime",
  "schema_version",
  "stages",
  "suite",
  "task_weights",
  "think_time_seconds",
  "workload_classification",
]);
const SUMMARY_TOP_LEVEL_KEYS = Object.freeze([
  "artifact_inspection",
  "caveats",
  "ceilings",
  "cleanup",
  "cohort_counts",
  "contention_pair_count",
  "cumulative_request_usage",
  "failure",
  "fake_provider",
  "gates",
  "identity_count",
  "inspection_failures",
  "integrity",
  "local_capacity",
  "request_ceiling_scope",
  "request_mix",
  "resource_ceilings",
  "rls_smoke",
  "run_id",
  "runtime",
  "schema_version",
  "session_renewals",
  "skipped_stages",
  "stages",
  "status",
  "suite",
  "task_weights",
  "think_time_seconds",
  "timezone_occurrence_preservation",
  "workload_classification",
]);
const COMPLETION_TOP_LEVEL_KEYS = Object.freeze([
  "artifact_inspection",
  "cleanup",
  "completed_stage_count",
  "failure",
  "run_id",
  "schema_version",
  "status",
  "suite",
]);
const DEFAULT_LOCAL_RESOURCE_CEILINGS = Object.freeze({
  max_host_load_per_logical_cpu: 2,
  min_available_memory_bytes: 512 * 1024 * 1024,
  max_app_rss_bytes: 4 * 1024 * 1024 * 1024,
  max_locust_rss_bytes: 4 * 1024 * 1024 * 1024,
});
const SOAK_RSS_GROWTH_CONTRACT = Object.freeze({
  sampling_interval_seconds: 5,
  baseline_window_start_seconds: 300,
  baseline_window_end_seconds: 600,
  terminal_window_duration_seconds: 300,
  minimum_valid_samples_per_window: 50,
  maximum_boundary_offset_seconds: 15,
  maximum_sample_gap_seconds: 15,
  maximum_growth_bytes: 128 * 1024 * 1024,
  maximum_growth_ratio: 0.25,
});
const MAXIMUM_RESOURCE_SAMPLE_GAP_MILLISECONDS = 15_000;
const MAXIMUM_RESOURCE_SAMPLE_BOUNDARY_OFFSET_MILLISECONDS = 15_000;
const REQUIRED_RESOURCE_SAMPLE_KEYS = Object.freeze([
  "app_rss_bytes",
  "available_memory_bytes",
  "elapsed_milliseconds",
  "host_load_1m",
  "host_load_per_logical_cpu",
  "locust_rss_bytes",
]);
const REQUIRED_RESOURCE_EVIDENCE_KEYS = Object.freeze([
  "breaches",
  "final_app_rss_bytes",
  "final_locust_rss_bytes",
  "first_app_rss_bytes",
  "first_locust_rss_bytes",
  "max_app_rss_bytes",
  "max_host_load_1m",
  "max_host_load_per_logical_cpu",
  "max_locust_rss_bytes",
  "min_available_memory_bytes",
  "resource_samples",
  "samples",
]);

export class MutationEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "MutationEvidenceError";
  }
}

export function parseMutationEvidenceArgs(args) {
  if (!Array.isArray(args)) {
    throw new MutationEvidenceError(
      "Mutation evidence arguments must be an array.",
    );
  }
  let runId;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== "--run-id") {
      throw new MutationEvidenceError(
        `Unknown mutation evidence argument: ${String(argument)}.`,
      );
    }
    if (runId !== undefined || index + 1 >= args.length) {
      throw new MutationEvidenceError(
        "Provide --run-id exactly once with one exact local run id.",
      );
    }
    runId = args[index + 1];
    index += 1;
  }
  if (runId === undefined) {
    throw new MutationEvidenceError(
      "Mutation evidence verification requires --run-id.",
    );
  }
  return { runId: validateMutationEvidenceRunId(runId) };
}

export function validateMutationEvidenceRunId(value) {
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) {
    throw new MutationEvidenceError(
      "Mutation evidence run id must use the exact YYYYMMDDtHHMMSSz-<12 lowercase hex> form.",
    );
  }
  return value;
}

export function expectedMutationStageArtifactNames(stageName) {
  validateStageName(stageName, "Declared stage");
  return [
    `${stageName}.html`,
    `${stageName}_exceptions.csv`,
    `${stageName}_failures.csv`,
    `${stageName}_semantic-verifications.json`,
    `${stageName}_stats.csv`,
    `${stageName}_stats_history.csv`,
  ];
}

export function canonicalMutationSuitePlan(suiteInput) {
  const suite = requireString(suiteInput, "Mutation suite");
  if (!SUPPORTED_SUITES.has(suite)) {
    throw new MutationEvidenceError(
      `Declaration suite ${suite} is unsupported.`,
    );
  }
  const manifest = readMutationManifest();
  const groups = SUITE_GROUPS[suite];
  const stages = groups.flatMap((group) => {
    const profile = requireObject(
      manifest.profiles[group],
      `Mutation manifest profile ${group}`,
    );
    const shapeName = requireString(
      profile.shape,
      `Mutation manifest profile ${group} shape`,
    );
    const shape = requireObject(
      manifest.shapes[shapeName],
      `Mutation manifest shape ${shapeName}`,
    );
    const rawStages = requireArray(
      shape.stages,
      `Mutation manifest shape ${shapeName} stages`,
    );
    const names = STAGE_NAMES_BY_GROUP[group];
    if (!names || names.length !== rawStages.length) {
      throw new MutationEvidenceError(
        `Mutation manifest shape ${shapeName} does not match its canonical stage inventory.`,
      );
    }
    return rawStages.map((rawStageInput, index) => {
      const rawStage = requireObject(
        rawStageInput,
        `Mutation manifest ${names[index]}`,
      );
      return {
        name: names[index],
        group,
        profile: group,
        workload: requireString(
          profile.workload,
          `Mutation manifest profile ${group} workload`,
        ),
        users: requirePositiveInteger(
          rawStage.users,
          `Mutation manifest ${names[index]} users`,
        ),
        spawnRate: requirePositiveNumber(
          rawStage.spawn_rate,
          `Mutation manifest ${names[index]} spawn rate`,
        ),
        durationSeconds: requirePositiveInteger(
          rawStage.duration_seconds,
          `Mutation manifest ${names[index]} duration`,
        ),
        sessionRenewalStrategy:
          group === "soak"
            ? "password_sign_in"
            : "refresh_token",
        renewContentionSessions: group === "contention",
        operatorOverlap: group === "operator_overlap",
        integrityCheckpoint:
          group === "breakpoint" ||
          index === rawStages.length - 1,
      };
    });
  });
  const identityCount = Math.max(
    1,
    ...stages.map((stage) =>
      stage.workload === "contention" ? 1 : stage.users,
    ),
    ...stages
      .filter((stage) => stage.operatorOverlap)
      .map((stage) => stage.users + 1),
  );
  const positionedStages = stages.map((stage) => ({
    ...stage,
    identityOffset:
      stage.group === "timezone_changed"
        ? identityCount - stage.users
        : 0,
  }));
  const cumulativeRequestCeiling =
    requirePositiveInteger(
      manifest.ceilings.maximum_requests,
      "Mutation manifest maximum request ceiling",
    ) * stages.length;
  if (!Number.isSafeInteger(cumulativeRequestCeiling)) {
    throw new MutationEvidenceError(
      "Canonical cumulative request ceiling is unsafe.",
    );
  }
  return {
    suite,
    stages: positionedStages,
    identityCount,
    cohortCounts: expectedMutationCohortCounts(identityCount),
    cohortAllocation: smoothMutationCohortAllocation(
      expectedMutationCohortCounts(identityCount),
    ),
    contentionPairCount: Math.min(8, identityCount),
    taskWeights: manifest.task_weights,
    readTaskKeys: manifest.read_task_keys,
    thinkTimeSeconds: manifest.think_time_seconds,
    ceilings: manifest.ceilings,
    readWeightPercent: manifest.read_task_keys.reduce(
      (total, key) => {
        const weight = manifest.task_weights[key];
        if (!Number.isSafeInteger(weight) || weight < 0) {
          throw new MutationEvidenceError(
            `Mutation manifest task weight ${key} is invalid.`,
          );
        }
        return total + weight;
      },
      0,
    ),
    cumulativeRequestCeiling,
  };
}

export function validateMutationEvidenceDirectory({
  runId: runIdInput,
  runsRoot = defaultRunsRoot,
} = {}) {
  const runId = validateMutationEvidenceRunId(runIdInput);
  if (typeof runsRoot !== "string" || !runsRoot) {
    throw new MutationEvidenceError(
      "Mutation evidence runs root is required.",
    );
  }
  const resolvedRunsRoot = path.resolve(runsRoot);
  const reportDirectory = path.resolve(resolvedRunsRoot, runId);
  if (path.dirname(reportDirectory) !== resolvedRunsRoot) {
    throw new MutationEvidenceError(
      "Mutation evidence directory escaped the local runs root.",
    );
  }
  assertRegularDirectory(reportDirectory);

  const declaration = readRequiredJson(
    reportDirectory,
    "declaration.json",
  );
  const summary = readRequiredJson(reportDirectory, "summary.json");
  const completion = readRequiredJson(
    reportDirectory,
    "completion.json",
  );
  const records = validateMutationEvidenceRecords({
    runId,
    declaration,
    summary,
    completion,
  });
  validateArtifactFiles({
    reportDirectory,
    completedStages: records.completedStages,
    declaredStages: records.declaredStages,
  });
  validateReportDirectorySanitization(reportDirectory);

  return {
    run_id: runId,
    suite: records.suite,
    completed_stage_count: records.completedStages.length,
    skipped_stage_count: records.skippedStages.length,
  };
}

export function validateMutationEvidenceRecords({
  runId: runIdInput,
  declaration: declarationInput,
  summary: summaryInput,
  completion: completionInput,
}) {
  const runId = validateMutationEvidenceRunId(runIdInput);
  const declaration = requireObject(
    declarationInput,
    "declaration.json",
  );
  const summary = requireObject(summaryInput, "summary.json");
  const completion = requireObject(
    completionInput,
    "completion.json",
  );

  requireExactObjectKeys(
    declaration,
    DECLARATION_TOP_LEVEL_KEYS,
    "declaration.json",
  );
  requireExactObjectKeys(
    summary,
    SUMMARY_TOP_LEVEL_KEYS,
    "summary.json",
  );
  requireExactObjectKeys(
    completion,
    COMPLETION_TOP_LEVEL_KEYS,
    "completion.json",
  );
  requireSchemaVersion(declaration, "declaration.json");
  requireSchemaVersion(summary, "summary.json");
  requireSchemaVersion(completion, "completion.json");
  requireMatchingValue(
    declaration.run_id,
    runId,
    "Declaration run id",
  );
  requireMatchingValue(summary.run_id, runId, "Summary run id");
  requireMatchingValue(
    completion.run_id,
    runId,
    "Completion run id",
  );
  const declaredAt = requireString(
    declaration.declared_at,
    "Declaration timestamp",
  );
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      declaredAt,
    ) ||
    Number.isNaN(Date.parse(declaredAt)) ||
    new Date(declaredAt).toISOString() !== declaredAt
  ) {
    throw new MutationEvidenceError(
      "Declaration timestamp must be a canonical UTC ISO instant.",
    );
  }
  if (
    !isDeepStrictEqual(
      declaration.caveats,
      MUTATION_EVIDENCE_CAVEATS,
    ) ||
    !isDeepStrictEqual(summary.caveats, declaration.caveats)
  ) {
    throw new MutationEvidenceError(
      "Declaration and summary caveats must match the producer's exact local-capacity caveats.",
    );
  }

  const suite = requireString(
    declaration.suite,
    "Declaration suite",
  );
  if (!SUPPORTED_SUITES.has(suite)) {
    throw new MutationEvidenceError(
      `Declaration suite ${suite} is unsupported.`,
    );
  }
  requireMatchingValue(summary.suite, suite, "Summary suite");
  requireMatchingValue(
    completion.suite,
    suite,
    "Completion suite",
  );
  const canonicalPlan = canonicalMutationSuitePlan(suite);
  requireMatchingValue(
    declaration.workload_classification,
    "mutation",
    "Declaration workload classification",
  );
  requireMatchingValue(
    summary.workload_classification,
    "mutation",
    "Summary workload classification",
  );
  requireMatchingValue(
    summary.status,
    "passed",
    "Summary status must be passed; received",
  );
  requireMatchingValue(
    completion.status,
    "passed",
    "Completion status must be passed; received",
  );
  if (summary.failure !== null) {
    throw new MutationEvidenceError(
      "A passing summary must have a null failure.",
    );
  }
  if (completion.failure !== null) {
    throw new MutationEvidenceError(
      "A passing completion sentinel must have a null failure.",
    );
  }
  const inspectionFailures = requireArray(
    summary.inspection_failures,
    "Summary inspection failures",
  );
  if (inspectionFailures.length !== 0) {
    throw new MutationEvidenceError(
      "A passing summary cannot retain inspection failures.",
    );
  }

  const identityCount = requirePositiveInteger(
    declaration.identity_count,
    "Declaration identity count",
  );
  requireMatchingValue(
    identityCount,
    canonicalPlan.identityCount,
    "Declaration identity count",
  );
  requireMatchingValue(
    summary.identity_count,
    identityCount,
    "Summary identity count",
  );
  validateCohortAndContentionContract({
    declaration,
    summary,
    canonicalPlan,
  });
  validateRuntime(declaration.runtime, summary.runtime);

  const declaredStages = validateDeclaredStages(
    declaration.stages,
  );
  validateCanonicalStageDeclaration({
    declaredStages,
    canonicalPlan,
  });
  validateWorkloadContract({
    declaration,
    summary,
    canonicalPlan,
  });
  const completedStages = validateCompletedStages({
    stageResults: summary.stages,
    declaredStages,
    cohortAllocation: canonicalPlan.cohortAllocation,
    logicalCpuCount:
      declaration.runtime.hardware.logical_cpu_count,
  });
  validateSessionRenewals({
    value: summary.session_renewals,
    completedStages,
  });
  const skippedStages = validateSkippedStageRecords({
    skippedStages: summary.skipped_stages,
    declaredStages,
  });
  const completionCount = requireNonnegativeInteger(
    completion.completed_stage_count,
    "Completion completed stage count",
  );
  if (completionCount !== completedStages.length) {
    throw new MutationEvidenceError(
      `Completion completed stage count ${completionCount} does not match ${completedStages.length} completed stages.`,
    );
  }
  validateArtifactInspection({
    summaryValue: summary.artifact_inspection,
    completionValue: completion.artifact_inspection,
    completedStageCount: completedStages.length,
  });

  const gates = validateAllGates(summary.gates);
  validateStageReconciliation({
    declaredStages,
    completedStages,
    skippedStages,
    gates,
  });
  const integrity = validateIntegrity({
    value: summary.integrity,
    runId,
    identityCount,
    cohortCounts: canonicalPlan.cohortCounts,
  });
  validateIntegrityCheckpointPlan({
    completedStages,
    gates,
    checkpoints: integrity.checkpoints,
  });
  validateRequiredEvidenceGates({
    suite,
    completedStages,
    gates,
    integrityCheckpoints: integrity.checkpoints,
    identityCount,
    fakeProvider: summary.fake_provider,
  });
  const operatorRequired = completedStages.some(
    (stage) => stage.group === "operator_overlap",
  );
  validateFakeProvider({
    value: summary.fake_provider,
    operatorRequired,
    completedStages,
    gates,
    integrity,
    identityCount,
  });
  validateTimezoneOccurrencePreservation({
    value: summary.timezone_occurrence_preservation,
    timezoneRequired: completedStages.some(
      (stage) => stage.group === "timezone_changed",
    ),
    gate: gates.get("timezone-dynamic-preservation"),
  });
  if (summary.rls_smoke !== "passed") {
    throw new MutationEvidenceError(
      "Local RLS smoke must be passed in final mutation evidence.",
    );
  }
  validateRecomputedEvidence({
    suite,
    summary,
    completedStages,
    gates,
    integrity,
    canonicalPlan,
  });
  validateCleanup({
    summaryCleanup: summary.cleanup,
    completionCleanup: completion.cleanup,
    runId,
    identityCount,
  });

  return {
    suite,
    declaredStages,
    completedStages,
    skippedStages,
    gates,
  };
}

function validateRuntime(declarationRuntimeInput, summaryRuntimeInput) {
  const declarationRuntime = requireObject(
    declarationRuntimeInput,
    "Declaration runtime",
  );
  const summaryRuntime = requireObject(
    summaryRuntimeInput,
    "Summary runtime",
  );
  if (!isDeepStrictEqual(summaryRuntime, declarationRuntime)) {
    throw new MutationEvidenceError(
      "Summary runtime does not match the declaration runtime.",
    );
  }
  if (
    !isDeepStrictEqual(
      Object.keys(declarationRuntime).sort(),
      ["application", "hardware", "runtime", "source"],
    )
  ) {
    throw new MutationEvidenceError(
      "Mutation evidence runtime metadata has an invalid top-level schema.",
    );
  }
  const source = requireObject(
    declarationRuntime.source,
    "Declaration source runtime",
  );
  if (
    !isDeepStrictEqual(Object.keys(source).sort(), [
      "commit",
      "working_tree_dirty",
    ]) ||
    typeof source.commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(source.commit) ||
    typeof source.working_tree_dirty !== "boolean"
  ) {
    throw new MutationEvidenceError(
      "Mutation evidence source runtime must identify an exact Git commit and dirty-worktree state.",
    );
  }
  const hardware = requireObject(
    declarationRuntime.hardware,
    "Declaration hardware runtime",
  );
  if (
    !isDeepStrictEqual(Object.keys(hardware).sort(), [
      "architecture",
      "cpu_model",
      "logical_cpu_count",
      "memory_bytes",
      "platform",
      "release",
    ])
  ) {
    throw new MutationEvidenceError(
      "Mutation evidence hardware runtime has an invalid schema.",
    );
  }
  for (const field of [
    "platform",
    "release",
    "architecture",
    "cpu_model",
  ]) {
    requireString(
      hardware[field],
      `Declaration hardware ${field}`,
    );
  }
  requirePositiveInteger(
    hardware.logical_cpu_count,
    "Declaration logical CPU count",
  );
  requirePositiveInteger(
    hardware.memory_bytes,
    "Declaration hardware memory bytes",
  );
  const runtime = requireObject(
    declarationRuntime.runtime,
    "Declaration tool runtime",
  );
  const runtimeFields = [
    "docker",
    "locust",
    "next",
    "node",
    "python",
    "supabase_cli",
  ];
  if (
    !isDeepStrictEqual(
      Object.keys(runtime).sort(),
      runtimeFields,
    )
  ) {
    throw new MutationEvidenceError(
      "Mutation evidence tool runtime has an invalid schema.",
    );
  }
  for (const field of runtimeFields) {
    requireString(
      runtime[field],
      `Declaration runtime ${field}`,
    );
  }
  const application = requireObject(
    declarationRuntime.application,
    "Declaration application runtime",
  );
  if (
    !isDeepStrictEqual(Object.keys(application).sort(), [
      "base_url",
      "interpretation",
      "next_mode",
      "provider_mode",
      "supabase_mode",
      "target_classification",
      "web_push_enabled",
    ])
  ) {
    throw new MutationEvidenceError(
      "Mutation evidence application runtime has an invalid schema.",
    );
  }
  if (application.target_classification !== "local") {
    throw new MutationEvidenceError(
      "Mutation evidence target classification must be local.",
    );
  }
  if (application.base_url !== "http://127.0.0.1:3100") {
    throw new MutationEvidenceError(
      "Mutation evidence application URL must be the declared loopback target.",
    );
  }
  if (
    application.provider_mode !==
    "loopback fake Sequenzy only"
  ) {
    throw new MutationEvidenceError(
      "Mutation evidence provider mode must remain loopback fake Sequenzy only.",
    );
  }
  requireMatchingValue(
    application.next_mode,
    "production persistent Node process",
    "Mutation evidence Next.js mode",
  );
  requireMatchingValue(
    application.supabase_mode,
    "project-local CLI Docker stack",
    "Mutation evidence Supabase mode",
  );
  requireMatchingValue(
    application.interpretation,
    "Local persistent-Node mutation evidence only; not hosted or production capacity.",
    "Mutation evidence interpretation",
  );
  if (application.web_push_enabled !== false) {
    throw new MutationEvidenceError(
      "Mutation evidence must keep Web Push disabled.",
    );
  }
}

function validateArtifactInspection({
  summaryValue,
  completionValue,
  completedStageCount,
}) {
  const summaryInspection = requireObject(
    summaryValue,
    "Summary artifact inspection",
  );
  const completionInspection = requireObject(
    completionValue,
    "Completion artifact inspection",
  );
  if (
    !isDeepStrictEqual(
      completionInspection,
      summaryInspection,
    )
  ) {
    throw new MutationEvidenceError(
      "Completion artifact inspection must match summary artifact inspection exactly.",
    );
  }
  const expectedKeys = [
    "completed_stage_count",
    "expected_stage_artifact_count",
    "orphan_stage_artifact_count",
    "retained_stage_artifact_count",
    "status",
  ];
  if (
    !isDeepStrictEqual(
      Object.keys(summaryInspection).sort(),
      expectedKeys,
    )
  ) {
    throw new MutationEvidenceError(
      "Summary artifact inspection has an invalid final sentinel schema.",
    );
  }
  requireMatchingValue(
    summaryInspection.status,
    "passed",
    "Artifact inspection status",
  );
  requireMatchingValue(
    requireNonnegativeInteger(
      summaryInspection.completed_stage_count,
      "Artifact inspection completed stage count",
    ),
    completedStageCount,
    "Artifact inspection completed stage count",
  );
  const expectedArtifactCount = completedStageCount * 6;
  if (!Number.isSafeInteger(expectedArtifactCount)) {
    throw new MutationEvidenceError(
      "Expected stage artifact count is not a safe integer.",
    );
  }
  requireMatchingValue(
    requireNonnegativeInteger(
      summaryInspection.expected_stage_artifact_count,
      "Expected stage artifact count",
    ),
    expectedArtifactCount,
    "Expected stage artifact count",
  );
  requireMatchingValue(
    requireNonnegativeInteger(
      summaryInspection.retained_stage_artifact_count,
      "Retained stage artifact count",
    ),
    expectedArtifactCount,
    "Retained stage artifact count",
  );
  requireMatchingValue(
    requireNonnegativeInteger(
      summaryInspection.orphan_stage_artifact_count,
      "Orphan stage artifact count",
    ),
    0,
    "Orphan stage artifact count must be zero; received",
  );
}

function validateDeclaredStages(value) {
  const stages = requireArray(value, "Declaration stages");
  if (stages.length === 0) {
    throw new MutationEvidenceError(
      "Declaration must contain at least one mutation stage.",
    );
  }
  const names = new Set();
  return stages.map((stageInput, index) => {
    const stage = requireObject(
      stageInput,
      `Declaration stage ${index + 1}`,
    );
    const name = validateStageName(
      stage.name,
      `Declaration stage ${index + 1}`,
    );
    if (names.has(name)) {
      throw new MutationEvidenceError(
        `Declaration repeats stage ${name}.`,
      );
    }
    names.add(name);
    const group = requireString(
      stage.group,
      `Declaration stage ${name} group`,
    );
    if (!SAFE_STAGE_GROUP_PATTERN.test(group)) {
      throw new MutationEvidenceError(
        `Declaration stage ${name} has an invalid group.`,
      );
    }
    return {
      ...stage,
      name,
      group,
      profile: requireString(
        stage.profile,
        `Declaration stage ${name} profile`,
      ),
      workload: requireString(
        stage.workload,
        `Declaration stage ${name} workload`,
      ),
      users: requirePositiveInteger(
        stage.users,
        `Declaration stage ${name} users`,
      ),
      spawnRate: requirePositiveNumber(
        stage.spawnRate,
        `Declaration stage ${name} spawn rate`,
      ),
      durationSeconds: requirePositiveInteger(
        stage.durationSeconds,
        `Declaration stage ${name} duration`,
      ),
      identityOffset: requireNonnegativeInteger(
        stage.identityOffset,
        `Declaration stage ${name} identity offset`,
      ),
    };
  });
}

function validateCanonicalStageDeclaration({
  declaredStages,
  canonicalPlan,
}) {
  if (
    !isDeepStrictEqual(
      declaredStages,
      canonicalPlan.stages,
    )
  ) {
    throw new MutationEvidenceError(
      `Declaration stages must match the canonical ${canonicalPlan.suite} suite exactly, including order, calibration, shape, workload, identity offset, session renewal, operator, and integrity-checkpoint fields.`,
    );
  }
}

function validateCohortAndContentionContract({
  declaration,
  summary,
  canonicalPlan,
}) {
  for (const [record, label] of [
    [declaration, "Declaration"],
    [summary, "Summary"],
  ]) {
    if (
      !isDeepStrictEqual(
        record.cohort_counts,
        canonicalPlan.cohortCounts,
      )
    ) {
      throw new MutationEvidenceError(
        `${label} cohort counts do not match the canonical mutation account allocation.`,
      );
    }
    requireMatchingValue(
      record.contention_pair_count,
      canonicalPlan.contentionPairCount,
      `${label} contention pair count`,
    );
  }
}

function validateWorkloadContract({
  declaration,
  summary,
  canonicalPlan,
}) {
  for (const [record, label] of [
    [declaration, "Declaration"],
    [summary, "Summary"],
  ]) {
    for (const [field, expected] of [
      ["task_weights", canonicalPlan.taskWeights],
      ["think_time_seconds", canonicalPlan.thinkTimeSeconds],
      ["ceilings", canonicalPlan.ceilings],
      ["resource_ceilings", DEFAULT_LOCAL_RESOURCE_CEILINGS],
    ]) {
      if (!isDeepStrictEqual(record[field], expected)) {
        throw new MutationEvidenceError(
          `${label} ${field.replaceAll("_", " ")} does not match the checked-in mutation workload contract.`,
        );
      }
    }
  }
  if (
    !isDeepStrictEqual(
      declaration.read_task_keys,
      canonicalPlan.readTaskKeys,
    )
  ) {
    throw new MutationEvidenceError(
      "Declaration read task keys do not match the checked-in mutation workload contract.",
    );
  }
  requireMatchingValue(
    declaration.read_weight_percent,
    canonicalPlan.readWeightPercent,
    "Declaration read weight percent",
  );
  const expectedRequestScope = {
    maximum_requests: "per Locust stage",
    cumulative_supervised_requests:
      canonicalPlan.cumulativeRequestCeiling,
    cumulative_includes_operator_requests: true,
  };
  for (const [value, label] of [
    [declaration.request_ceiling_scope, "Declaration"],
    [summary.request_ceiling_scope, "Summary"],
  ]) {
    if (!isDeepStrictEqual(value, expectedRequestScope)) {
      throw new MutationEvidenceError(
        `${label} request ceiling scope does not match the canonical bounded suite.`,
      );
    }
  }
  const expectedAbortThresholds = {
    unexpected_request_failure_ratio_percent:
      "less than 0.5",
    unexpected_5xx_ratio:
      canonicalPlan.ceilings.unexpected_5xx_ratio,
    unexpected_5xx_window_seconds:
      canonicalPlan.ceilings.unexpected_5xx_window_seconds,
    unexpected_5xx_consecutive_windows:
      canonicalPlan.ceilings
        .unexpected_5xx_consecutive_windows,
    repeated_database_refusals: 3,
    soak_rss_growth: SOAK_RSS_GROWTH_CONTRACT,
    cross_owner_or_real_provider_attempt: "immediate",
    false_fresh_or_integrity_failure: "at checkpoint",
    per_stage_request_runtime_user_rps_ceiling: "immediate",
    cumulative_suite_request_ceiling: "after each bounded stage",
  };
  if (
    !isDeepStrictEqual(
      declaration.abort_thresholds,
      expectedAbortThresholds,
    )
  ) {
    throw new MutationEvidenceError(
      "Declaration abort thresholds do not match the canonical supervised mutation contract.",
    );
  }
}

function validateCompletedStages({
  stageResults: stageResultsInput,
  declaredStages,
  cohortAllocation,
  logicalCpuCount,
}) {
  const stageResults = requireArray(
    stageResultsInput,
    "Summary completed stages",
  );
  const declarations = new Map(
    declaredStages.map((stage) => [stage.name, stage]),
  );
  const names = new Set();
  return stageResults.map((resultInput, index) => {
    const result = requireObject(
      resultInput,
      `Summary completed stage ${index + 1}`,
    );
    const name = validateStageName(
      result.stage,
      `Summary completed stage ${index + 1}`,
    );
    if (names.has(name)) {
      throw new MutationEvidenceError(
        `Summary repeats completed stage ${name}.`,
      );
    }
    names.add(name);
    const declared = declarations.get(name);
    if (!declared) {
      throw new MutationEvidenceError(
        `Summary completed undeclared stage ${name}.`,
      );
    }
    for (const [resultKey, declarationKey] of [
      ["group", "group"],
      ["profile", "profile"],
      ["workload", "workload"],
      ["users", "users"],
      ["spawn_rate", "spawnRate"],
      ["duration_seconds", "durationSeconds"],
    ]) {
      if (result[resultKey] !== declared[declarationKey]) {
        throw new MutationEvidenceError(
          `Summary stage ${name} ${resultKey} does not match its declaration.`,
        );
      }
    }
    const artifacts = requireObject(
      result.artifacts,
      `Summary stage ${name} artifacts`,
    );
    const expectedArtifacts =
      expectedMutationStageArtifactNames(name);
    const artifactNames = Object.keys(artifacts).sort();
    if (
      !isDeepStrictEqual(
        artifactNames,
        [...expectedArtifacts].sort(),
      )
    ) {
      throw new MutationEvidenceError(
        `Summary stage ${name} artifact inventory must contain exactly ${expectedArtifacts.join(", ")}.`,
      );
    }
    for (const artifactName of expectedArtifacts) {
      const digest = artifacts[artifactName];
      if (
        typeof digest !== "string" ||
        !SHA_256_PATTERN.test(digest)
      ) {
        throw new MutationEvidenceError(
          `Summary artifact ${artifactName} has an invalid SHA-256 digest.`,
        );
      }
    }
    const metrics = requireObject(
      result.metrics,
      `Summary stage ${name} metrics`,
    );
    validateDeclaredMetricsSchema(metrics, name);
    const achievedDurationSeconds = requirePositiveNumber(
      result.achieved_duration_seconds,
      `Summary stage ${name} achieved duration`,
    );
    if (
      achievedDurationSeconds <
        declared.durationSeconds - 2 ||
      achievedDurationSeconds >
        declared.durationSeconds + 15
    ) {
      throw new MutationEvidenceError(
        `Summary stage ${name} achieved duration is outside the bounded declaration tolerance.`,
      );
    }
    const resources = validateResourceEvidence({
      value: result.resources,
      stageName: name,
      declaredDurationSeconds: declared.durationSeconds,
      achievedDurationSeconds,
      logicalCpuCount,
    });
    const achievedPeakUsers = requireNonnegativeInteger(
      result.achieved_peak_users,
      `Summary stage ${name} achieved peak users`,
    );
    if (achievedPeakUsers !== declared.users) {
      throw new MutationEvidenceError(
        `Summary stage ${name} achieved peak users must equal its declared active-user ceiling.`,
      );
    }
    const unexpected5xx = requireNonnegativeInteger(
      result.unexpected_5xx,
      `Summary stage ${name} unexpected 5xx count`,
    );
    const exceptionCount = requireNonnegativeInteger(
      result.exception_count,
      `Summary stage ${name} exception count`,
    );
    if (exceptionCount !== 0) {
      throw new MutationEvidenceError(
        `Passing mutation evidence cannot retain Locust exceptions for ${name}.`,
      );
    }
    requireMatchingValue(
      result.locust_exit_code,
      0,
      `Summary stage ${name} Locust exit code`,
    );
    const semanticVerifications = requireObject(
      result.semantic_verifications,
      `Summary stage ${name} semantic verifications`,
    );
    const cohortMix = validateStageCohortMix({
      value: result.cohort_mix,
      stageName: name,
      workload: declared.workload,
      users: declared.users,
      identityOffset: declared.identityOffset,
      cohortAllocation,
    });
    return {
      ...result,
      artifacts,
      metrics,
      resources,
      achieved_duration_seconds: achievedDurationSeconds,
      achieved_peak_users: achievedPeakUsers,
      unexpected_5xx: unexpected5xx,
      exception_count: exceptionCount,
      semantic_verifications: semanticVerifications,
      cohort_mix: cohortMix,
      declaration: declared,
    };
  });
}

function validateSkippedStageRecords({
  skippedStages: skippedStagesInput,
  declaredStages,
}) {
  const skippedStages = requireArray(
    skippedStagesInput,
    "Summary skipped stages",
  );
  const declaredNames = new Set(
    declaredStages.map((stage) => stage.name),
  );
  const names = new Set();
  return skippedStages.map((skipInput, index) => {
    const skip = requireObject(
      skipInput,
      `Summary skipped stage ${index + 1}`,
    );
    const stage = validateStageName(
      skip.stage,
      `Summary skipped stage ${index + 1}`,
    );
    if (!declaredNames.has(stage)) {
      throw new MutationEvidenceError(
        `Summary skipped undeclared stage ${stage}.`,
      );
    }
    if (names.has(stage)) {
      throw new MutationEvidenceError(
        `Summary repeats skipped stage ${stage}.`,
      );
    }
    names.add(stage);
    return {
      stage,
      reason: requireString(
        skip.reason,
        `Summary skipped stage ${stage} reason`,
      ),
    };
  });
}

function validateStageCohortMix({
  value,
  stageName,
  workload,
  users,
  identityOffset,
  cohortAllocation,
}) {
  const cohortMix = requireObject(
    value,
    `Summary stage ${stageName} cohort mix`,
  );
  const entries = Object.entries(cohortMix);
  if (
    entries.length === 0 ||
    entries.some(
      ([cohort, count]) =>
        !MUTATION_COHORTS.includes(cohort) ||
        !Number.isSafeInteger(count) ||
        count <= 0,
    )
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} cohort mix must contain only positive mutation-cohort counts.`,
    );
  }
  const activeCohorts =
    workload === "contention"
      ? [
          cohortAllocation[identityOffset],
          cohortAllocation[identityOffset],
        ]
      : cohortAllocation.slice(
          identityOffset,
          identityOffset + users,
        );
  const expectedMix = activeCohorts.reduce(
    (counts, cohort) => {
      counts[cohort] = (counts[cohort] ?? 0) + 1;
      return counts;
    },
    {},
  );
  if (!isDeepStrictEqual(cohortMix, expectedMix)) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} cohort mix does not match the deterministic active-account allocation.`,
    );
  }
  return cohortMix;
}

function validateSessionRenewals({
  value,
  completedStages,
}) {
  const renewals = requireArray(
    value,
    "Summary session renewals",
  );
  if (renewals.length !== completedStages.length) {
    throw new MutationEvidenceError(
      "Summary session renewals must contain one ordered record per completed stage.",
    );
  }
  for (const [index, stage] of completedStages.entries()) {
    const renewal = requireObject(
      renewals[index],
      `Session renewal before ${stage.stage}`,
    );
    if (
      !isDeepStrictEqual(Object.keys(renewal).sort(), [
        "before_stage",
        "contention_sessions_renewed",
        "refreshed_accounts",
        "renewal_strategies",
        "renewal_strategy",
      ])
    ) {
      throw new MutationEvidenceError(
        `Session renewal before ${stage.stage} has an invalid schema.`,
      );
    }
    requireMatchingValue(
      renewal.before_stage,
      stage.stage,
      `Session renewal stage ${index + 1}`,
    );
    requireMatchingValue(
      renewal.refreshed_accounts,
      stage.workload === "contention"
        ? 1
        : stage.users +
            Number(stage.declaration.operatorOverlap),
      `Session renewal refreshed accounts before ${stage.stage}`,
    );
    requireMatchingValue(
      renewal.renewal_strategy,
      stage.declaration.sessionRenewalStrategy,
      `Session renewal strategy before ${stage.stage}`,
    );
    const contentionSessions =
      stage.workload === "contention" ? 1 : 0;
    requireMatchingValue(
      renewal.contention_sessions_renewed,
      contentionSessions,
      `Contention sessions renewed before ${stage.stage}`,
    );
    const strategies = requireObject(
      renewal.renewal_strategies,
      `Session renewal strategy counts before ${stage.stage}`,
    );
    if (
      !isDeepStrictEqual(Object.keys(strategies).sort(), [
        "password_sign_in",
        "password_sign_in_fallback",
        "refresh",
      ])
    ) {
      throw new MutationEvidenceError(
        `Session renewal strategy counts before ${stage.stage} have an invalid schema.`,
      );
    }
    for (const [strategy, count] of Object.entries(
      strategies,
    )) {
      requireNonnegativeInteger(
        count,
        `Session renewal ${strategy} count before ${stage.stage}`,
      );
    }
    const expectedRenewals =
      renewal.refreshed_accounts + contentionSessions;
    requireMatchingValue(
      Object.values(strategies).reduce(
        (sum, count) => sum + count,
        0,
      ),
      expectedRenewals,
      `Session renewal strategy subtotal before ${stage.stage}`,
    );
    if (
      renewal.renewal_strategy === "password_sign_in"
        ? strategies.password_sign_in !== expectedRenewals ||
          strategies.refresh !== 0 ||
          strategies.password_sign_in_fallback !== 0
        : strategies.password_sign_in !== 0
    ) {
      throw new MutationEvidenceError(
        `Session renewal strategy counts before ${stage.stage} do not match the declared strategy.`,
      );
    }
  }
}

function validateAllGates(value) {
  const gates = requireArray(value, "Summary gates");
  if (gates.length === 0) {
    throw new MutationEvidenceError(
      "Final mutation evidence requires gates.",
    );
  }
  const byStage = new Map();
  for (const [index, gateInput] of gates.entries()) {
    const gate = requireObject(
      gateInput,
      `Summary gate ${index + 1}`,
    );
    const stage = requireString(
      gate.stage,
      `Summary gate ${index + 1} stage`,
    );
    if (byStage.has(stage)) {
      throw new MutationEvidenceError(
        `Summary repeats gate ${stage}.`,
      );
    }
    if (gate.passed !== true) {
      throw new MutationEvidenceError(
        `Final gate ${stage} must be passed.`,
      );
    }
    const failures = requireArray(
      gate.failures,
      `Final gate ${stage} failures`,
    );
    if (failures.length !== 0) {
      throw new MutationEvidenceError(
        `Passing gate ${stage} must have no failures.`,
      );
    }
    byStage.set(stage, { ...gate, stage, failures });
  }
  return byStage;
}

function validateStageReconciliation({
  declaredStages,
  completedStages,
  skippedStages,
  gates,
}) {
  const completedByName = new Map(
    completedStages.map((stage) => [stage.stage, stage]),
  );
  const skippedByName = new Map(
    skippedStages.map((skip) => [skip.stage, skip]),
  );
  const terminalGroups = new Set();
  const expectedCompletedOrder = [];
  const expectedSkippedOrder = [];

  for (const declared of declaredStages) {
    const completed = completedByName.get(declared.name);
    const skipped = skippedByName.get(declared.name);
    if (completed && skipped) {
      throw new MutationEvidenceError(
        `Stage ${declared.name} is both completed and skipped.`,
      );
    }
    if (!completed && !skipped) {
      throw new MutationEvidenceError(
        `Declared stage ${declared.name} is neither completed nor validly skipped.`,
      );
    }

    if (skipped) {
      if (
        !TERMINAL_GROUPS.has(declared.group) ||
        !terminalGroups.has(declared.group)
      ) {
        throw new MutationEvidenceError(
          `${declared.name} cannot be skipped without an earlier same-group expected terminal.`,
        );
      }
      const expectedReason = SKIP_REASONS[declared.group];
      if (skipped.reason !== expectedReason) {
        throw new MutationEvidenceError(
          `The skip reason for ${declared.name} must be "${expectedReason}".`,
        );
      }
      if (gates.has(declared.name)) {
        throw new MutationEvidenceError(
          `Skipped stage ${declared.name} must not have a completed-stage gate.`,
        );
      }
      expectedSkippedOrder.push(declared.name);
      continue;
    }

    if (terminalGroups.has(declared.group)) {
      throw new MutationEvidenceError(
        `Stage ${declared.name} completed after its group reached an expected terminal.`,
      );
    }
    const primaryGate = gates.get(declared.name);
    if (!primaryGate) {
      throw new MutationEvidenceError(
        `Completed stage ${declared.name} is missing its primary gate.`,
      );
    }
    const terminal = primaryGate.expected_terminal === true;
    const stress = primaryGate.expected_stress === true;
    const recordedRampLatencyBreach =
      primaryGate.recorded_ramp_latency_breach === true;
    if (
      Number(terminal) +
        Number(stress) +
        Number(recordedRampLatencyBreach) >
      1
    ) {
      throw new MutationEvidenceError(
        `Stage ${declared.name} has conflicting bounded-performance classifications.`,
      );
    }
    if (terminal) {
      validateExpectedTerminalGate(primaryGate, declared);
      terminalGroups.add(declared.group);
    } else if (stress) {
      validateExpectedStressGate(primaryGate, declared);
    } else if (recordedRampLatencyBreach) {
      validateRecordedRampLatencyBreach(
        primaryGate,
        declared,
      );
    } else if (primaryGate.plateau_passed !== true) {
      throw new MutationEvidenceError(
        `Completed stage ${declared.name} must be a passing plateau unless it is an explicit expected terminal or expected stress result.`,
      );
    }
    expectedCompletedOrder.push(declared.name);
  }

  const actualCompletedOrder = completedStages.map(
    (stage) => stage.stage,
  );
  if (
    !isDeepStrictEqual(
      actualCompletedOrder,
      expectedCompletedOrder,
    )
  ) {
    throw new MutationEvidenceError(
      "Completed stages do not preserve declaration order.",
    );
  }
  const actualSkippedOrder = skippedStages.map(
    (skip) => skip.stage,
  );
  if (
    !isDeepStrictEqual(actualSkippedOrder, expectedSkippedOrder)
  ) {
    throw new MutationEvidenceError(
      "Skipped stages do not preserve declaration order.",
    );
  }
}

function validateExpectedTerminalGate(gate, declared) {
  if (!TERMINAL_GROUPS.has(declared.group)) {
    throw new MutationEvidenceError(
      `Expected terminal stage ${declared.name} must belong to breakpoint.`,
    );
  }
  if (gate.plateau_passed !== false) {
    throw new MutationEvidenceError(
      `Expected terminal ${declared.name} must remain a non-passing plateau.`,
    );
  }
  const performanceFailures = requireNonemptyStringArray(
    gate.performance_failures,
    `Expected terminal ${declared.name} performance failures`,
  );
  if (
    performanceFailures.some(
      (failure) =>
        !TERMINAL_PERFORMANCE_FAILURE_PREFIXES.some((prefix) =>
          failure.startsWith(prefix),
        ),
    )
  ) {
    throw new MutationEvidenceError(
      `Expected terminal ${declared.name} contains a non-performance failure.`,
    );
  }
}

function validateRecordedRampLatencyBreach(gate, declared) {
  if (declared.group !== "ramp") {
    throw new MutationEvidenceError(
      "A recorded ramp latency breach is permitted only for a ramp stage.",
    );
  }
  if (gate.plateau_passed !== false) {
    throw new MutationEvidenceError(
      `Recorded ramp latency breach ${declared.name} must remain a non-passing plateau.`,
    );
  }
  const performanceFailures = requireNonemptyStringArray(
    gate.performance_failures,
    `Recorded ramp latency breach ${declared.name} performance failures`,
  );
  if (
    performanceFailures.length !== 1 ||
    performanceFailures[0] !== EXPECTED_SPIKE_STRESS_FAILURE
  ) {
    throw new MutationEvidenceError(
      "A recorded ramp latency breach must contain only the calibrated p95 failure.",
    );
  }
}

function validateExpectedStressGate(gate, declared) {
  if (
    declared.name !== "spike-hold-100" ||
    declared.group !== "spike"
  ) {
    throw new MutationEvidenceError(
      `Expected stress is permitted only for spike-hold-100.`,
    );
  }
  if (gate.plateau_passed !== false) {
    throw new MutationEvidenceError(
      "Expected spike stress must remain a non-passing plateau.",
    );
  }
  const performanceFailures = requireNonemptyStringArray(
    gate.performance_failures,
    "Expected spike stress performance failures",
  );
  if (
    performanceFailures.length !== 1 ||
    performanceFailures[0] !== EXPECTED_SPIKE_STRESS_FAILURE
  ) {
    throw new MutationEvidenceError(
      "Expected spike stress must contain only the calibrated p95 failure.",
    );
  }
}

function validateIntegrity({
  value,
  runId,
  identityCount,
  cohortCounts,
}) {
  const integrity = requireObject(value, "Summary integrity");
  requireExactObjectKeys(
    integrity,
    ["after", "before", "checkpoints"],
    "Summary integrity",
  );
  const before = validateIntegrityCheckpoint({
    value: integrity.before,
    label: "Integrity before",
    runId,
    identityCount,
    cohortCounts,
  });
  const after = validateIntegrityCheckpoint({
    value: integrity.after,
    label: "Integrity after",
    runId,
    identityCount,
    cohortCounts,
  });
  if (before.label !== "before") {
    throw new MutationEvidenceError(
      "Initial integrity checkpoint must use the before label.",
    );
  }
  const checkpoints = requireArray(
    integrity.checkpoints,
    "Integrity checkpoints",
  ).map((checkpoint, index) =>
    validateIntegrityCheckpoint({
      value: checkpoint,
      label: `Integrity checkpoint ${index + 1}`,
      runId,
      identityCount,
      cohortCounts,
    }),
  );
  if (
    !checkpoints.some((checkpoint) =>
      isDeepStrictEqual(checkpoint, before),
    )
  ) {
    throw new MutationEvidenceError(
      "Integrity checkpoints do not include the initial checkpoint.",
    );
  }
  if (
    !checkpoints.some((checkpoint) =>
      isDeepStrictEqual(checkpoint, after),
    )
  ) {
    throw new MutationEvidenceError(
      "Integrity checkpoints do not include the final checkpoint.",
    );
  }
  if (!isDeepStrictEqual(checkpoints.at(-1), after)) {
    throw new MutationEvidenceError(
      "Summary integrity after evidence must be the final trailing integrity checkpoint.",
    );
  }
  for (const checkpoint of checkpoints) {
    validateIntegrityCheckpointDeltas({
      checkpoint,
      before,
    });
  }
  return { before, after, checkpoints };
}

function validateIntegrityCheckpoint({
  value,
  label,
  runId,
  identityCount,
  cohortCounts,
}) {
  const checkpoint = requireObject(value, label);
  requireExactObjectKeys(
    checkpoint,
    INTEGRITY_CHECKPOINT_KEYS,
    `${label} schema`,
  );
  requireMatchingValue(
    checkpoint.runId,
    runId,
    `${label} run id`,
  );
  requireMatchingValue(
    checkpoint.checkedAccounts,
    identityCount,
    `${label} checked account count`,
  );
  requireMatchingValue(
    checkpoint.workloadClassification,
    "mutation",
    `${label} workload classification`,
  );
  requireMatchingValue(
    checkpoint.violations,
    0,
    `${label} violations`,
  );
  const checks = requireObject(
    checkpoint.integrityChecks,
    `${label} checks`,
  );
  requireExactObjectKeys(
    checks,
    REQUIRED_INTEGRITY_ZERO_FIELDS,
    `${label} integrity checks`,
  );
  for (const [field, count] of Object.entries(checks)) {
    if (!Number.isSafeInteger(count) || count !== 0) {
      throw new MutationEvidenceError(
        `${label} integrity check ${field} must be zero.`,
      );
    }
  }

  const rowCounts = requireCountMap({
    value: checkpoint.rowCounts,
    keys: INTEGRITY_ROW_COUNT_KEYS,
    label: `${label} row counts`,
  });
  requireMatchingValue(
    rowCounts.profiles,
    identityCount,
    `${label} profile row count`,
  );
  const totalRows = requireNonnegativeInteger(
    checkpoint.totalRows,
    `${label} total row count`,
  );
  requireMatchingValue(
    totalRows,
    Object.values(rowCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
    `${label} total row count`,
  );

  const cohorts = requireCountMap({
    value: checkpoint.cohorts,
    keys: ALL_COHORTS,
    label: `${label} cohort counts`,
  });
  if (!isDeepStrictEqual(cohorts, cohortCounts)) {
    throw new MutationEvidenceError(
      `${label} cohort counts do not match the canonical declaration.`,
    );
  }
  requireMatchingValue(
    Object.values(cohorts).reduce(
      (sum, count) => sum + count,
      0,
    ),
    identityCount,
    `${label} cohort account total`,
  );

  const reminderStatuses = validateReminderStatusCounts({
    value: checkpoint.reminderStatuses,
    label: `${label} reminder statuses`,
    reminderDeliveryCount: rowCounts.reminder_deliveries,
    requireExactTotal: true,
  });
  const operatorReminderStatuses =
    validateReminderStatusCounts({
      value: checkpoint.operatorReminderStatuses,
      label: `${label} operator reminder statuses`,
      reminderDeliveryCount:
        rowCounts.reminder_deliveries,
      requireExactTotal: false,
    });
  const cancellationReminderStatuses =
    validateReminderStatusCounts({
      value: checkpoint.cancellationReminderStatuses,
      label: `${label} cancellation reminder statuses`,
      reminderDeliveryCount:
        rowCounts.reminder_deliveries,
      requireExactTotal: false,
    });
  for (const status of REMINDER_STATUS_KEYS) {
    if (
      operatorReminderStatuses[status] >
        reminderStatuses[status] ||
      cancellationReminderStatuses[status] >
        reminderStatuses[status]
    ) {
      throw new MutationEvidenceError(
        `${label} scoped reminder status ${status} exceeds the overall reminder status count.`,
      );
    }
  }

  requireMatchingValue(
    requireNonnegativeInteger(
      checkpoint.activePushSubscriptions,
      `${label} active push subscription count`,
    ),
    rowCounts.push_subscriptions,
    `${label} active push subscription count`,
  );
  if (
    checkpoint.databaseConnectionCount !== null &&
    (!Number.isSafeInteger(
      checkpoint.databaseConnectionCount,
    ) ||
      checkpoint.databaseConnectionCount < 0)
  ) {
    throw new MutationEvidenceError(
      `${label} database connection count must be null or a nonnegative safe integer.`,
    );
  }
  const mutationDeltas = requireIntegerMap({
    value: checkpoint.mutationDeltas,
    keys: MUTATION_DELTA_KEYS,
    label: `${label} mutation deltas`,
  });
  const statusTransitionEvidence = requireCountMap({
    value: checkpoint.statusTransitionEvidence,
    keys: STATUS_TRANSITION_EVIDENCE_KEYS,
    label: `${label} status transition evidence`,
  });
  requireMatchingValue(
    statusTransitionEvidence.totalEventCount,
    rowCounts.occurrence_status_events,
    `${label} status-transition total event count`,
  );
  requireMatchingValue(
    statusTransitionEvidence.snapshotCorrelatedOccurrenceCount,
    statusTransitionEvidence.eventBackedOccurrenceCount,
    `${label} snapshot-correlated occurrence count`,
  );
  if (
    statusTransitionEvidence.eventBackedOccurrenceCount >
      rowCounts.occurrences ||
    statusTransitionEvidence.eventBackedOccurrenceCount >
      statusTransitionEvidence.totalEventCount
  ) {
    throw new MutationEvidenceError(
      `${label} status-transition occurrence counts exceed retained row counts.`,
    );
  }
  const duePastReminderNonReactivation = requireCountMap({
    value: checkpoint.duePastReminderNonReactivation,
    keys: DUE_PAST_EVIDENCE_KEYS,
    label: `${label} due-past reminder evidence`,
  });
  if (
    duePastReminderNonReactivation.tracked_occurrences <= 0 ||
    duePastReminderNonReactivation.tracked_deliveries !==
      duePastReminderNonReactivation.tracked_occurrences ||
    duePastReminderNonReactivation.tracked_occurrences >
      rowCounts.occurrences ||
    duePastReminderNonReactivation.tracked_deliveries >
      rowCounts.reminder_deliveries
  ) {
    throw new MutationEvidenceError(
      `${label} tracked due-past occurrence and delivery evidence does not reconcile one-to-one with retained rows.`,
    );
  }
  if (
    duePastReminderNonReactivation.exercised_occurrences >
      duePastReminderNonReactivation.tracked_occurrences ||
    duePastReminderNonReactivation.clear_events <
      duePastReminderNonReactivation.exercised_occurrences ||
    (duePastReminderNonReactivation.clear_events === 0) !==
      (duePastReminderNonReactivation.exercised_occurrences ===
        0) ||
    duePastReminderNonReactivation.clear_events >
      rowCounts.occurrence_status_events
  ) {
    throw new MutationEvidenceError(
      `${label} due-past clear events do not reconcile with unique exercised occurrences and retained status events.`,
    );
  }
  if (
    duePastReminderNonReactivation.unresolved_occurrences !==
    duePastReminderNonReactivation.tracked_occurrences
  ) {
    throw new MutationEvidenceError(
      `${label} tracked due-past occurrences must all remain Unresolved.`,
    );
  }
  if (
    duePastReminderNonReactivation.cancelled_deliveries !==
      duePastReminderNonReactivation.exercised_occurrences ||
    duePastReminderNonReactivation.cancelled_deliveries >
      reminderStatuses.cancelled
  ) {
    throw new MutationEvidenceError(
      `${label} cancelled due-past deliveries do not match unique exercised occurrences.`,
    );
  }
  if (
    duePastReminderNonReactivation.reactivated_deliveries !==
    0
  ) {
    throw new MutationEvidenceError(
      `${label} due-past reminder reactivation count must be zero.`,
    );
  }
  return {
    ...checkpoint,
    label: requireString(
      checkpoint.label,
      `${label} label`,
    ),
    integrityChecks: checks,
    rowCounts,
    reminderStatuses,
    operatorReminderStatuses,
    cancellationReminderStatuses,
    mutationDeltas,
    statusTransitionEvidence,
    duePastReminderNonReactivation,
    cohorts,
  };
}

function validateIntegrityCheckpointDeltas({
  checkpoint,
  before,
}) {
  const rowKeyByDelta = {
    behaviors: "behaviors",
    schedules: "behavior_schedules",
    slots: "behavior_schedule_slots",
    occurrences: "occurrences",
    statusEvents: "occurrence_status_events",
    definitionEvents: "behavior_definition_events",
    reminders: "reminder_deliveries",
  };
  for (const [deltaKey, rowKey] of Object.entries(
    rowKeyByDelta,
  )) {
    requireMatchingValue(
      checkpoint.mutationDeltas[deltaKey],
      checkpoint.rowCounts[rowKey] -
        before.rowCounts[rowKey],
      `${checkpoint.label} ${deltaKey} mutation delta`,
    );
  }
  const statusEvidence =
    checkpoint.statusTransitionEvidence;
  requireMatchingValue(
    statusEvidence.baselineEventCount,
    before.rowCounts.occurrence_status_events,
    `${checkpoint.label} status-transition baseline event count`,
  );
  requireMatchingValue(
    statusEvidence.appendedEventCount,
    statusEvidence.totalEventCount -
      statusEvidence.baselineEventCount,
    `${checkpoint.label} status-transition appended event count`,
  );
}

function validateReminderStatusCounts({
  value,
  label,
  reminderDeliveryCount,
  requireExactTotal,
}) {
  const statuses = requireCountMap({
    value,
    keys: REMINDER_STATUS_KEYS,
    label,
  });
  if (statuses.processing > statuses.pending) {
    throw new MutationEvidenceError(
      `${label} processing count exceeds its pending count.`,
    );
  }
  const statusTotal =
    statuses.pending +
    statuses.sent +
    statuses.failed +
    statuses.cancelled;
  if (
    requireExactTotal
      ? statusTotal !== reminderDeliveryCount
      : statusTotal > reminderDeliveryCount
  ) {
    throw new MutationEvidenceError(
      `${label} do not reconcile with reminder_deliveries rows.`,
    );
  }
  return statuses;
}

function requireCountMap({ value, keys, label }) {
  const record = requireObject(value, label);
  requireExactObjectKeys(record, keys, label);
  for (const [field, count] of Object.entries(record)) {
    requireNonnegativeInteger(count, `${label} ${field}`);
  }
  return record;
}

function requireIntegerMap({ value, keys, label }) {
  const record = requireObject(value, label);
  requireExactObjectKeys(record, keys, label);
  for (const [field, count] of Object.entries(record)) {
    if (!Number.isSafeInteger(count)) {
      throw new MutationEvidenceError(
        `${label} ${field} must be a safe integer.`,
      );
    }
  }
  return record;
}

function requireExactObjectKeys(value, keys, label) {
  if (
    !isDeepStrictEqual(
      Object.keys(value).sort(),
      [...keys].sort(),
    )
  ) {
    throw new MutationEvidenceError(
      `${label} has an invalid schema.`,
    );
  }
}

function validateIntegrityCheckpointPlan({
  completedStages,
  gates,
  checkpoints,
}) {
  const requiredStageLabels = completedStages
    .filter((stage) => {
      const gate = gates.get(stage.stage);
      return (
        stage.declaration.integrityCheckpoint ||
        gate?.expected_terminal === true ||
        gate?.expected_stress === true ||
        gate?.recorded_ramp_latency_breach === true
      );
    })
    .map((stage) => `after-${stage.stage}`);
  const expectedLabels = [
    "before",
    ...requiredStageLabels,
    ...(requiredStageLabels.length === 0 ? ["after"] : []),
  ];
  const actualLabels = checkpoints.map(
    (checkpoint) => checkpoint.label,
  );
  if (!isDeepStrictEqual(actualLabels, expectedLabels)) {
    throw new MutationEvidenceError(
      "Integrity checkpoints do not match the canonical completed-stage checkpoint plan.",
    );
  }
}

function validateRequiredEvidenceGates({
  suite,
  completedStages,
  gates,
  integrityCheckpoints,
  identityCount,
  fakeProvider,
}) {
  const required = new Set([
    "stable-request-names",
    "status-event-correlation",
    "due-past-reminder-non-reactivation",
    "soak-plateau-provenance",
  ]);
  for (const stage of completedStages) {
    if (
      stage.workload === "mixed" &&
      stage.group !== "mixed_calibration"
    ) {
      required.add(`${stage.stage}-request-mix`);
    }
    if (stage.group === "soak") {
      required.add("soak-no-growth");
      required.add(`${stage.stage}-ramp-headroom`);
    }
  }
  if (suite === "full") {
    required.add("timed-mutation-coverage");
  }
  if (suite === "spike" || suite === "full") {
    required.add(SPIKE_RECOVERY_COMPARISON_GATE);
  }
  const timezoneRequired = completedStages.some(
    (stage) => stage.group === "timezone_changed",
  );
  const operatorRequired = completedStages.some(
    (stage) => stage.group === "operator_overlap",
  );
  if (timezoneRequired) {
    required.add("timezone-dynamic-preservation");
  }
  if (operatorRequired) {
    required.add("operator-provider-reconciliation");
    required.add("operator-isolation-and-causal-repair");
  }
  for (const checkpoint of integrityCheckpoints) {
    required.add(`integrity-${checkpoint.label}`);
  }
  for (const gateName of required) {
    if (!gates.has(gateName)) {
      throw new MutationEvidenceError(
        `Final mutation evidence is missing required gate ${gateName}.`,
      );
    }
  }
  const expected = new Set([
    ...completedStages.map((stage) => stage.stage),
    ...required,
  ]);
  const actual = [...gates.keys()].sort();
  const expectedNames = [...expected].sort();
  if (!isDeepStrictEqual(actual, expectedNames)) {
    throw new MutationEvidenceError(
      "Final mutation gate inventory does not match the canonical completed suite and conditional evidence gates.",
    );
  }
  if (timezoneRequired) {
    validateTimezoneDynamicPreservationGate(
      gates.get("timezone-dynamic-preservation"),
    );
  }
  if (operatorRequired) {
    validateOperatorProviderReconciliationGate({
      gate: gates.get("operator-provider-reconciliation"),
      isolationGate: gates.get(
        "operator-isolation-and-causal-repair",
      ),
      fakeProvider,
    });
    validateOperatorIsolationAndCausalRepairGate({
      gate: gates.get("operator-isolation-and-causal-repair"),
      identityCount,
    });
  }
}

function validateOperatorProviderReconciliationGate({
  gate,
  isolationGate,
  fakeProvider,
}) {
  const evidence = requireExactGateEvidence({
    gate,
    gateName: "operator-provider-reconciliation",
    expectedKeys: [
      "fake_provider_accepted",
      "operator_requests",
      "reminder_process_totals",
    ],
  });
  const operatorRequests = requirePositiveInteger(
    evidence.operator_requests,
    "Provider reconciliation operator request count",
  );
  requireMatchingValue(
    operatorRequests,
    isolationGate?.evidence?.operator_requests,
    "Operator request count across provider and isolation gates",
  );
  const accepted = requirePositiveInteger(
    evidence.fake_provider_accepted,
    "Provider reconciliation accepted count",
  );
  requireMatchingValue(
    accepted,
    fakeProvider?.snapshot?.accepted,
    "Provider reconciliation accepted count",
  );
  const totals = requireObject(
    evidence.reminder_process_totals,
    "Provider reconciliation reminder totals",
  );
  if (
    !isDeepStrictEqual(Object.keys(totals).sort(), [
      "cancelled",
      "failed",
      "sent",
    ])
  ) {
    throw new MutationEvidenceError(
      "Provider reconciliation reminder totals have an invalid schema.",
    );
  }
  requireMatchingValue(
    requireNonnegativeInteger(
      totals.sent,
      "Provider reconciliation sent count",
    ),
    accepted,
    "Provider reconciliation sent count",
  );
  requireMatchingValue(
    requireNonnegativeInteger(
      totals.failed,
      "Provider reconciliation failed count",
    ),
    0,
    "Provider reconciliation failed count",
  );
  requireNonnegativeInteger(
    totals.cancelled,
    "Provider reconciliation cancelled count",
  );
}

function validateTimezoneDynamicPreservationGate(gate) {
  const evidence = requireExactGateEvidence({
    gate,
    gateName: "timezone-dynamic-preservation",
    expectedKeys: [
      "captured_occurrences",
      "verified_occurrences",
      "violations",
    ],
  });
  const captured = requirePositiveInteger(
    evidence.captured_occurrences,
    "Timezone captured occurrence count",
  );
  const verified = requireNonnegativeInteger(
    evidence.verified_occurrences,
    "Timezone verified occurrence count",
  );
  if (verified !== captured) {
    throw new MutationEvidenceError(
      "Timezone verified occurrence count must equal the captured occurrence count.",
    );
  }
  if (
    requireNonnegativeInteger(
      evidence.violations,
      "Timezone preservation violations",
    ) !== 0
  ) {
    throw new MutationEvidenceError(
      "Timezone preservation violations must be zero.",
    );
  }
}

function validateOperatorIsolationAndCausalRepairGate({
  gate,
  identityCount,
}) {
  const evidence = requireExactGateEvidence({
    gate,
    gateName: "operator-isolation-and-causal-repair",
    expectedKeys: [
      "causal_occurrence_repair_proofs",
      "isolated_accounts",
      "isolation_checks",
      "operator_requests",
      "prepared_occurrence_sync_accounts",
      "verified_fresh_occurrence_sync_accounts",
    ],
  });
  const operatorRequests = requirePositiveInteger(
    evidence.operator_requests,
    "Operator request count",
  );
  const isolationChecks = requireNonnegativeInteger(
    evidence.isolation_checks,
    "Operator isolation check count",
  );
  if (isolationChecks < operatorRequests + 2) {
    throw new MutationEvidenceError(
      "Operator isolation checks must cover every protected request plus both preflight checks.",
    );
  }
  requireMatchingValue(
    requirePositiveInteger(
      evidence.isolated_accounts,
      "Operator isolated account count",
    ),
    identityCount,
    "Operator isolated account count",
  );
  const prepared = requirePositiveInteger(
    evidence.prepared_occurrence_sync_accounts,
    "Operator prepared occurrence-sync account count",
  );
  const verifiedFresh = requireNonnegativeInteger(
    evidence.verified_fresh_occurrence_sync_accounts,
    "Operator verified fresh occurrence-sync account count",
  );
  if (verifiedFresh !== prepared) {
    throw new MutationEvidenceError(
      "Operator verified fresh occurrence-sync account count must equal the prepared account count.",
    );
  }
  requirePositiveInteger(
    evidence.causal_occurrence_repair_proofs,
    "Operator causal occurrence repair proof count",
  );
}

function requireExactGateEvidence({
  gate,
  gateName,
  expectedKeys,
}) {
  const evidence = requireObject(
    gate?.evidence,
    `Final gate ${gateName} evidence`,
  );
  if (
    !isDeepStrictEqual(
      Object.keys(evidence).sort(),
      [...expectedKeys].sort(),
    )
  ) {
    throw new MutationEvidenceError(
      `Final gate ${gateName} evidence has an invalid schema.`,
    );
  }
  return evidence;
}

function validateFakeProvider({
  value,
  operatorRequired: declaredOperatorRequired,
  completedStages,
  gates,
  integrity,
  identityCount,
}) {
  const evidence = requireObject(
    value,
    "Final fake provider evidence",
  );
  if (
    typeof evidence.operator_required !== "boolean" ||
    evidence.operator_required !== declaredOperatorRequired
  ) {
    throw new MutationEvidenceError(
      "Fake provider operator requirement does not match the declared stages.",
    );
  }
  requireExactObjectKeys(
    evidence,
    declaredOperatorRequired
      ? OPERATOR_FAKE_PROVIDER_KEYS
      : ["operator_required", "snapshot"],
    "Final fake provider evidence",
  );
  const snapshot = requireObject(
    evidence.snapshot,
    "Final fake provider snapshot",
  );
  requireExactObjectKeys(
    snapshot,
    FAKE_PROVIDER_SNAPSHOT_KEYS,
    "Final fake provider snapshot",
  );
  if (
    snapshot.schema_version !== FAKE_PROVIDER_SCHEMA_VERSION ||
    snapshot.target_classification !== "local" ||
    snapshot.provider !== "fake_sequenzy"
  ) {
    throw new MutationEvidenceError(
      "Final fake provider evidence is not local fake Sequenzy evidence.",
    );
  }
  const requests = requireNonnegativeInteger(
    snapshot.requests_total,
    "Fake provider request count",
  );
  const accepted = requireNonnegativeInteger(
    snapshot.accepted,
    "Fake provider accepted count",
  );
  const rejected = requireNonnegativeInteger(
    snapshot.rejected,
    "Fake provider rejected count",
  );
  const unique = requireNonnegativeInteger(
    snapshot.unique_delivery_fingerprints,
    "Fake provider unique delivery count",
  );
  const duplicates = requireNonnegativeInteger(
    snapshot.duplicate_send_attempts,
    "Fake provider duplicate attempt count",
  );
  const webPush = requireNonnegativeInteger(
    snapshot.web_push_attempts,
    "Fake provider Web Push attempt count",
  );
  if (rejected !== 0) {
    throw new MutationEvidenceError(
      "Final fake provider rejected count must be zero.",
    );
  }
  if (duplicates !== 0) {
    throw new MutationEvidenceError(
      "Final fake provider duplicate attempts must be zero.",
    );
  }
  if (webPush !== 0) {
    throw new MutationEvidenceError(
      "Final fake provider Web Push attempts must be zero.",
    );
  }
  if (requests !== accepted || unique !== accepted) {
    throw new MutationEvidenceError(
      "Final fake provider request, accepted, and unique counts do not reconcile.",
    );
  }
  if (evidence.operator_required && accepted === 0) {
    throw new MutationEvidenceError(
      "Operator evidence requires at least one accepted fake-provider send.",
    );
  }
  if (!evidence.operator_required && accepted !== 0) {
    throw new MutationEvidenceError(
      "A non-operator suite must not contact the fake provider.",
    );
  }
  const rejectionReasons = requireObject(
    snapshot.rejection_reasons,
    "Fake provider rejection reasons",
  );
  if (Object.keys(rejectionReasons).length !== 0) {
    throw new MutationEvidenceError(
      "Final fake provider evidence must not retain rejection reasons.",
    );
  }
  const responseStatuses = requireObject(
    snapshot.response_statuses,
    "Fake provider response statuses",
  );
  const expectedResponseStatuses = declaredOperatorRequired
    ? { "202": accepted }
    : {};
  if (
    !isDeepStrictEqual(
      responseStatuses,
      expectedResponseStatuses,
    )
  ) {
    throw new MutationEvidenceError(
      "Final fake provider response statuses do not reconcile with accepted fake sends.",
    );
  }
  if (!declaredOperatorRequired) return;

  const raw = validateRawOperatorEvidence({
    evidence,
  });
  const providerGate =
    "operator-provider-reconciliation";
  const isolationGate =
    "operator-isolation-and-causal-repair";
  const operatorStage = completedStages.find(
    (stage) => stage.group === "operator_overlap",
  );
  if (!operatorStage) {
    throw new MutationEvidenceError(
      "Operator fake-provider evidence lacks an operator stage.",
    );
  }
  const operatorRows = OPERATOR_REQUEST_NAMES.map((name) => {
    const requestCount = raw.requests.filter(
      (request) => request.name === name,
    ).length;
    return {
      method: "POST",
      name,
      requests: requestCount,
      failures: 0,
      requests_per_second:
        requestCount /
        operatorStage.achieved_duration_seconds,
    };
  });
  const operatorCheckpointIndex =
    integrity.checkpoints.findIndex(
      (checkpoint) =>
        checkpoint.label ===
        `after-${operatorStage.stage}`,
    );
  if (operatorCheckpointIndex <= 0) {
    throw new MutationEvidenceError(
      "Operator evidence lacks a pre-operator integrity checkpoint.",
    );
  }
  const beforeOperator =
    integrity.checkpoints[operatorCheckpointIndex - 1];
  const afterOperator =
    integrity.checkpoints[operatorCheckpointIndex];
  const expectedProviderGate = {
    stage: providerGate,
    ...evaluateOperatorProviderReconciliation({
      operatorRequests: operatorRows,
      occurrenceSyncResults: raw.occurrenceResults,
      reminderProcessResults: raw.reminderResults,
      reminderReplayResult: evidence.final_replay,
      fakeProvider: snapshot,
      finalDeliveryDelta: {
        sent:
          afterOperator.reminderStatuses.sent -
          beforeOperator.reminderStatuses.sent,
        failed:
          afterOperator.reminderStatuses.failed -
          beforeOperator.reminderStatuses.failed,
        cancelled:
          afterOperator.reminderStatuses.cancelled -
          beforeOperator.reminderStatuses.cancelled,
        processing:
          afterOperator.reminderStatuses.processing,
        duplicateKeys:
          afterOperator.integrityChecks
            .duplicateDeliveries,
      },
      activePushSubscriptions:
        afterOperator.activePushSubscriptions,
      maximumOperatorRequests: MAXIMUM_OPERATOR_REQUESTS,
    }),
  };
  validateExactRecomputedGate({
    actual: gates.get(providerGate),
    expected: expectedProviderGate,
    label: "operator provider reconciliation",
  });

  const expectedIsolationGate = {
    stage: isolationGate,
    ...evaluateOperatorIsolationAndCausalRepair({
      operatorRequestCount: raw.requests.length,
      isolationChecks: evidence.isolation_checks,
      isolationSummary: {
        expected_accounts: identityCount,
        auth_accounts: identityCount,
        profile_accounts: identityCount,
        occurrence_sync_owners: identityCount,
        reminder_delivery_owners:
          afterOperator.rowCounts.reminder_deliveries > 0
            ? identityCount
            : 0,
      },
      preparedAccounts:
        evidence.occurrence_sync_prepared_accounts,
      verifiedFreshAccounts:
        evidence.occurrence_sync_verified_fresh_accounts,
      causalRepairProofs:
        evidence.occurrence_sync_causal_repair_proofs,
    }),
  };
  validateExactRecomputedGate({
    actual: gates.get(isolationGate),
    expected: expectedIsolationGate,
    label: "operator isolation and causal repair",
  });
}

function validateRawOperatorEvidence({ evidence }) {
  const requests = requireArray(
    evidence.requests,
    "Raw operator requests",
  ).map((value, index) => {
    const request = requireObject(
      value,
      `Raw operator request ${index + 1}`,
    );
    requireExactObjectKeys(
      request,
      OPERATOR_REQUEST_KEYS,
      `Raw operator request ${index + 1}`,
    );
    const name = requireString(
      request.name,
      `Raw operator request ${index + 1} name`,
    );
    if (!OPERATOR_REQUEST_NAMES.includes(name)) {
      throw new MutationEvidenceError(
        `Raw operator request ${index + 1} has an unsupported fixed request name.`,
      );
    }
    if (
      !Number.isSafeInteger(request.status) ||
      request.status < 200 ||
      request.status >= 300
    ) {
      throw new MutationEvidenceError(
        `Raw operator request ${index + 1} must retain a successful 2xx status.`,
      );
    }
    if (
      typeof request.duration_ms !== "number" ||
      !Number.isFinite(request.duration_ms) ||
      request.duration_ms <= 0 ||
      request.duration_ms >
        MAXIMUM_OPERATOR_DURATION_MILLISECONDS
    ) {
      throw new MutationEvidenceError(
        `Raw operator request ${index + 1} duration is outside its bounded request timeout.`,
      );
    }
    return {
      ...request,
      name,
      result: validateOperatorResult({
        value: request.result,
        name,
        label: `Raw operator request ${index + 1} result`,
      }),
    };
  });
  if (
    requests.length === 0 ||
    requests.length > MAXIMUM_OPERATOR_REQUESTS
  ) {
    throw new MutationEvidenceError(
      "Raw operator request count is empty or exceeds its declared bound.",
    );
  }
  const occurrenceResults = requests
    .filter(
      (request) =>
        request.name === OPERATOR_REQUEST_NAMES[0],
    )
    .map((request) => request.result);
  const reminderResults = requests
    .filter(
      (request) =>
        request.name === OPERATOR_REQUEST_NAMES[1],
    )
    .map((request) => request.result);
  requireMatchingValue(
    evidence.occurrence_request_count,
    occurrenceResults.length,
    "Raw occurrence-sync operator request count",
  );
  requireMatchingValue(
    evidence.reminder_request_count,
    reminderResults.length,
    "Raw reminder-process operator request count",
  );
  if (
    occurrenceResults.length === 0 ||
    reminderResults.length !==
      occurrenceResults.length + 1
  ) {
    throw new MutationEvidenceError(
      "Raw operator evidence must contain paired occurrence/reminder calls plus one final reminder replay.",
    );
  }
  for (
    let index = 0;
    index < requests.length - 1;
    index += 1
  ) {
    const expectedName =
      OPERATOR_REQUEST_NAMES[index % 2];
    if (requests[index].name !== expectedName) {
      throw new MutationEvidenceError(
        "Raw operator requests do not preserve the producer's paired request order.",
      );
    }
  }
  const finalRequest = requests.at(-1);
  if (
    finalRequest.name !== OPERATOR_REQUEST_NAMES[1] ||
    !isDeepStrictEqual(
      finalRequest.result,
      evidence.final_replay,
    )
  ) {
    throw new MutationEvidenceError(
      "Raw operator evidence does not end with its exact retained reminder replay.",
    );
  }
  const finalReplay = validateOperatorResult({
    value: evidence.final_replay,
    name: OPERATOR_REQUEST_NAMES[1],
    label: "Final operator reminder replay",
  });
  for (const field of [
    "claimed",
    "sent",
    "failed",
    "cancelled",
  ]) {
    requireMatchingValue(
      finalReplay[field],
      0,
      `Final operator reminder replay ${field}`,
    );
  }
  requireMatchingValue(
    evidence.isolation_checks,
    requests.length + 2,
    "Raw operator isolation check count",
  );
  for (const [field, label] of [
    [
      "occurrence_sync_prepared_accounts",
      "prepared occurrence-sync account count",
    ],
    [
      "occurrence_sync_verified_fresh_accounts",
      "verified fresh occurrence-sync account count",
    ],
    [
      "occurrence_sync_causal_repair_proofs",
      "causal occurrence-repair proof count",
    ],
  ]) {
    requireMatchingValue(
      evidence[field],
      1,
      `Raw operator ${label}`,
    );
  }
  return {
    requests,
    occurrenceResults,
    reminderResults,
  };
}

function validateOperatorResult({ value, name, label }) {
  const result = requireObject(value, label);
  const occurrence =
    name === OPERATOR_REQUEST_NAMES[0];
  requireExactObjectKeys(
    result,
    occurrence
      ? OCCURRENCE_OPERATOR_RESULT_KEYS
      : REMINDER_OPERATOR_RESULT_KEYS,
    label,
  );
  for (const [field, count] of Object.entries(result)) {
    requireNonnegativeInteger(count, `${label} ${field}`);
  }
  if (occurrence) {
    if (
      result.checked !==
        result.synced + result.skipped + result.failed ||
      result.failed !== 0
    ) {
      throw new MutationEvidenceError(
        `${label} occurrence-sync counts do not reconcile.`,
      );
    }
  } else if (
    result.checked !== result.claimed + result.skipped ||
    result.claimed !==
      result.sent + result.failed + result.cancelled ||
    result.failed !== 0
  ) {
    throw new MutationEvidenceError(
      `${label} reminder-process counts do not reconcile.`,
    );
  }
  return result;
}

function validateTimezoneOccurrencePreservation({
  value,
  timezoneRequired,
  gate,
}) {
  if (!timezoneRequired) {
    if (value !== null) {
      throw new MutationEvidenceError(
        "Non-timezone mutation evidence must retain a null timezone occurrence-preservation record.",
      );
    }
    return;
  }
  const evidence = requireCountMap({
    value,
    keys: [
      "captured_occurrences",
      "verified_occurrences",
      "violations",
    ],
    label: "Timezone occurrence-preservation evidence",
  });
  validateExactRecomputedGate({
    actual: gate,
    expected: {
      stage: "timezone-dynamic-preservation",
      ...evaluateTimezoneDynamicOccurrencePreservation(
        evidence,
      ),
    },
    label: "timezone dynamic preservation",
  });
}

function validateRecomputedEvidence({
  suite,
  summary,
  completedStages,
  gates,
  integrity,
  canonicalPlan,
}) {
  const representativeStages = completedStages.filter(
    (stage) => stage.group !== MUTATION_CALIBRATION_GROUP,
  );
  const representativeMetrics =
    aggregateSequentialStageMetrics(representativeStages);
  const recomputedRequestMix = summarizeRequestMix(
    representativeMetrics,
  );
  if (
    !isDeepStrictEqual(
      summary.request_mix,
      recomputedRequestMix,
    )
  ) {
    throw new MutationEvidenceError(
      "Final request mix does not reconcile with completed-stage request rows and achieved durations.",
    );
  }
  if (
    recomputedRequestMix.other.requests !== 0 ||
    (representativeStages.some(
      (stage) => stage.workload === "mixed",
    ) &&
      !recomputedRequestMix.reads_dominant)
  ) {
    throw new MutationEvidenceError(
      "Recomputed final request mix must be read dominant and contain zero unclassified requests.",
    );
  }

  const interactionManifest = readCheckedInJson(
    interactionManifestPath,
    "Interaction request manifest",
  );
  validateExactRecomputedGate({
    actual: gates.get("stable-request-names"),
    expected: {
      stage: "stable-request-names",
      ...evaluateStableRequestNameGate({
        requestsByName:
          representativeMetrics.requests_by_name,
        interactionManifest,
      }),
    },
    label: "stable request names",
  });
  for (const stage of representativeStages.filter(
    (candidate) => candidate.workload === "mixed",
  )) {
    validateExactRecomputedGate({
      actual: gates.get(`${stage.stage}-request-mix`),
      expected: {
        stage: `${stage.stage}-request-mix`,
        ...evaluateRequestMixGate(stage.metrics),
      },
      label: `${stage.stage} request mix`,
    });
  }

  if (suite === "full") {
    const aggregatedSemanticEvidence =
      aggregateSemanticEvidence(representativeStages);
    validateExactRecomputedGate({
      actual: gates.get("timed-mutation-coverage"),
      expected: {
        stage: "timed-mutation-coverage",
        ...evaluateTimedMutationCoverage({
          requestsByName:
            representativeMetrics.requests_by_name,
          semanticVerifications:
            aggregatedSemanticEvidence.semantic_verifications,
        }),
      },
      label: "timed mutation coverage",
    });
  }

  const statusRows = completedStages
    .filter((stage) => stage.group !== "contention")
    .flatMap((stage) => stage.metrics.requests_by_name);
  validateExactRecomputedGate({
    actual: gates.get("status-event-correlation"),
    expected: {
      stage: "status-event-correlation",
      ...evaluateStatusEventCorrelation({
        requestsByName: statusRows,
        statusEventDelta:
          integrity.after.mutationDeltas?.statusEvents,
        statusTransitionEvidence:
          integrity.after.statusTransitionEvidence,
        requireAppended: suite === "full",
      }),
    },
    label: "status event correlation",
  });
  const duePastApplicable = completedStages.some(
    (stage) =>
      stage.stage === "smoke-1" ||
      stage.stage === MUTATION_CALIBRATION_STAGE,
  );
  const duePastEvidence =
    integrity.after.duePastReminderNonReactivation;
  if (
    duePastApplicable
      ? duePastEvidence.exercised_occurrences <= 0
      : duePastEvidence.exercised_occurrences !== 0
  ) {
    throw new MutationEvidenceError(
      "Final due-past unique exercise evidence does not match suite applicability.",
    );
  }
  validateExactRecomputedGate({
    actual: gates.get(
      "due-past-reminder-non-reactivation",
    ),
    expected: {
      stage: "due-past-reminder-non-reactivation",
      ...evaluateDuePastReminderNonReactivation({
        evidence: duePastEvidence,
        requireExercised: duePastApplicable,
      }),
    },
    label: "due/past reminder non-reactivation",
  });
  for (const checkpoint of integrity.checkpoints) {
    validateExactRecomputedGate({
      actual: gates.get(`integrity-${checkpoint.label}`),
      expected: {
        stage: `integrity-${checkpoint.label}`,
        ...evaluateMutationIntegrityGate(checkpoint),
      },
      label: `integrity ${checkpoint.label}`,
    });
  }

  validateRecomputedPrimaryStageGates({
    completedStages,
    gates,
  });
  validateRecomputedRecoveryGate({
    suite,
    completedStages,
    gates,
  });
  validateRecomputedSoakGates({
    completedStages,
    gates,
    integrity,
  });
  validateRecomputedCapacity({
    summary,
    completedStages,
    gates,
  });
  validateCumulativeRequestUsage({
    summary,
    completedStages,
    gates,
    canonicalPlan,
  });
}

function validateRecomputedPrimaryStageGates({
  completedStages,
  gates,
}) {
  const calibration = completedStages.find(
    (stage) => stage.stage === MUTATION_CALIBRATION_STAGE,
  );
  const calibrationP95 = calibration?.metrics?.latency_ms?.p95;
  for (const stage of completedStages) {
    const usesCalibration =
      stage.workload === "mixed" &&
      COMPARABLE_MIXED_GROUPS.has(stage.group);
    if (
      usesCalibration &&
      (typeof calibrationP95 !== "number" ||
        !Number.isFinite(calibrationP95) ||
        calibrationP95 <= 0)
    ) {
      throw new MutationEvidenceError(
        `${stage.stage} lacks its canonical calibrated latency reference.`,
      );
    }
    const rawGate = evaluateStageGates({
      stage: stage.stage,
      metrics: stage.metrics,
      warmBaselineP95: usesCalibration
        ? calibrationP95
        : undefined,
      unexpected5xx: stage.unexpected_5xx,
      exceptionCount: stage.exception_count,
      resourceBreaches: stage.resources.breaches,
      declaredDurationSeconds: stage.duration_seconds,
      achievedDurationSeconds:
        stage.achieved_duration_seconds,
      declaredUsers: stage.users,
      achievedPeakUsers: stage.achieved_peak_users,
    });
    rawGate.failures = rawGate.failures.map((failure) =>
      failure === READ_GATE_LATENCY_FAILURE
        ? MUTATION_GATE_LATENCY_FAILURE
        : failure,
    );
    const semanticGate = evaluateSemanticVerificationGate({
      requestsByName: stage.metrics.requests_by_name,
      evidence: stage.semantic_verifications,
    });
    const rawFailures = [
      ...rawGate.failures,
      ...semanticGate.failures.map(
        (failure) => `semantic verification: ${failure}`,
      ),
    ];
    const primary = gates.get(stage.stage);
    if (
      !isDeepStrictEqual(
        primary.semantic_verification,
        semanticGate,
      )
    ) {
      throw new MutationEvidenceError(
        `Primary gate ${stage.stage} does not reconcile its semantic verification evidence.`,
      );
    }
    const expectedLatencyReference =
      stage.stage === MUTATION_CALIBRATION_STAGE
        ? {
            role: "established",
            stage: MUTATION_CALIBRATION_STAGE,
            label:
              "calibrated representative mixed warm baseline",
            p95_ms: stage.metrics.latency_ms.p95,
          }
        : usesCalibration
          ? {
              role: "applied",
              stage: MUTATION_CALIBRATION_STAGE,
              label:
                "calibrated representative mixed warm baseline",
              p95_ms: calibrationP95,
            }
          : undefined;
    if (
      !isDeepStrictEqual(
        primary.latency_reference,
        expectedLatencyReference,
      )
    ) {
      throw new MutationEvidenceError(
        `Primary gate ${stage.stage} does not reconcile its calibrated latency reference.`,
      );
    }
    validatePrimaryGateClassification({
      stage,
      primary,
      rawFailures,
    });
  }
}

function validatePrimaryGateClassification({
  stage,
  primary,
  rawFailures,
}) {
  if (rawFailures.length === 0) {
    if (
      primary.plateau_passed !== true ||
      primary.expected_terminal === true ||
      primary.expected_stress === true ||
      primary.recorded_ramp_latency_breach === true ||
      (Array.isArray(primary.performance_failures) &&
        primary.performance_failures.length !== 0)
    ) {
      throw new MutationEvidenceError(
        `Primary gate ${stage.stage} does not match independently passing raw evidence.`,
      );
    }
    return;
  }
  const performanceOnly = rawFailures.every((failure) =>
    TERMINAL_PERFORMANCE_FAILURE_PREFIXES.some((prefix) =>
      failure.startsWith(prefix),
    ),
  );
  const latencyOnly =
    rawFailures.length === 1 &&
    rawFailures[0] === MUTATION_GATE_LATENCY_FAILURE;
  const expected =
    (stage.group === "ramp" &&
      latencyOnly &&
      primary.recorded_ramp_latency_breach === true) ||
    (stage.group === "breakpoint" &&
      performanceOnly &&
      primary.expected_terminal === true) ||
    (stage.stage === "spike-hold-100" &&
      latencyOnly &&
      primary.expected_stress === true);
  if (
    !expected ||
    primary.plateau_passed !== false ||
    !isDeepStrictEqual(
      primary.performance_failures,
      rawFailures,
    )
  ) {
    throw new MutationEvidenceError(
      `Primary gate ${stage.stage} does not reconcile its independently computed performance failures.`,
    );
  }
}

function validateRecomputedRecoveryGate({
  suite,
  completedStages,
  gates,
}) {
  const baseline = completedStages.find(
    (stage) => stage.stage === "spike-baseline-10",
  );
  const recovery = completedStages.find(
    (stage) => stage.stage === "spike-recovery-10",
  );
  const actual = gates.get(SPIKE_RECOVERY_COMPARISON_GATE);
  if (suite !== "spike" && suite !== "full") {
    if (actual) {
      throw new MutationEvidenceError(
        `${SPIKE_RECOVERY_COMPARISON_GATE} is not applicable to suite ${suite}.`,
      );
    }
    return;
  }
  if (!baseline || !recovery) {
    throw new MutationEvidenceError(
      "Spike recovery comparison lacks its canonical baseline or recovery stage.",
    );
  }
  validateExactRecomputedGate({
    actual,
    expected: {
      ...evaluateRecoveryGate({
        baseline: baseline.metrics,
        recovery: recovery.metrics,
      }),
      stage: SPIKE_RECOVERY_COMPARISON_GATE,
    },
    label: "spike recovery comparison",
  });
}

function validateRecomputedSoakGates({
  completedStages,
  gates,
  integrity,
}) {
  const soak = completedStages.find(
    (stage) => stage.group === "soak",
  );
  if (!soak) {
    validateExactRecomputedGate({
      actual: gates.get("soak-plateau-provenance"),
      expected: {
        stage: "soak-plateau-provenance",
        passed: true,
        failures: [],
        basis: "not_applicable",
        soak_users: [],
        boundary_stage: null,
        boundary_users: null,
      },
      label: "soak plateau provenance",
    });
    return;
  }
  const rampStages = completedStages.filter(
    (stage) => stage.group === "ramp",
  );
  const passingRamps = rampStages.filter(
    (stage) =>
      gates.get(stage.stage)?.plateau_passed === true,
  );
  const matchingRamp = passingRamps.find(
    (stage) => stage.users === soak.users,
  );
  if (!matchingRamp) {
    throw new MutationEvidenceError(
      `${soak.stage} lacks a passing same-run ramp plateau at its user count.`,
    );
  }
  const recordedBoundary = rampStages
    .filter(
      (stage) =>
        gates.get(stage.stage)
          ?.recorded_ramp_latency_breach === true,
    )
    .sort((left, right) => left.users - right.users)[0];
  const highestPassingRamp = [...passingRamps].sort(
    (left, right) => right.users - left.users,
  )[0];
  const headroom = recordedBoundary
    ? {
        stage: `${soak.stage}-ramp-headroom`,
        passed: true,
        failures: [],
        basis: "recorded_ramp_latency_boundary",
        soak_users: soak.users,
        supporting_ramp_stage: recordedBoundary.stage,
        supporting_ramp_users: recordedBoundary.users,
      }
    : {
        stage: `${soak.stage}-ramp-headroom`,
        passed: true,
        failures: [],
        basis: "passing_ramp_plateau",
        soak_users: soak.users,
        supporting_ramp_stage: highestPassingRamp?.stage,
        supporting_ramp_users: highestPassingRamp?.users,
      };
  if (
    !Number.isInteger(headroom.supporting_ramp_users) ||
    headroom.supporting_ramp_users <= soak.users
  ) {
    throw new MutationEvidenceError(
      `${soak.stage} lacks strict same-run ramp headroom.`,
    );
  }
  validateExactRecomputedGate({
    actual: gates.get(`${soak.stage}-ramp-headroom`),
    expected: headroom,
    label: `${soak.stage} ramp headroom`,
  });

  const plateauStages = completedStages.filter(
    (stage) =>
      stage.group === "ramp" ||
      stage.group === "breakpoint",
  );
  const observedBoundaries = plateauStages
    .map((stage, index) => ({
      stage,
      index,
      basis:
        gates.get(stage.stage)?.expected_terminal === true
          ? "performance_terminal"
          : gates.get(stage.stage)
                ?.recorded_ramp_latency_breach === true
            ? "recorded_ramp_latency_boundary"
            : null,
    }))
    .filter((entry) => entry.basis)
    .sort(
      (left, right) =>
        left.stage.users - right.stage.users ||
        left.index - right.index,
    );
  let provenance;
  if (observedBoundaries.length > 0) {
    const boundary = observedBoundaries[0];
    provenance = {
      stage: "soak-plateau-provenance",
      passed: soak.users < boundary.stage.users,
      failures:
        soak.users < boundary.stage.users
          ? []
          : [
              `${soak.stage} at ${soak.users} users must be strictly below its observed performance boundary`,
            ],
      basis: boundary.basis,
      soak_users: [soak.users],
      boundary_stage: boundary.stage.stage,
      boundary_users: boundary.stage.users,
    };
  } else {
    const boundary = plateauStages
      .filter(
        (stage) =>
          gates.get(stage.stage)?.plateau_passed === true,
      )
      .sort(
        (left, right) => right.users - left.users,
      )[0];
    provenance = {
      stage: "soak-plateau-provenance",
      passed: Boolean(boundary && boundary.users > soak.users),
      failures:
        boundary && boundary.users > soak.users
          ? []
          : [
              `${soak.stage} has no passing executed plateau above ${soak.users} users`,
            ],
      basis: "passing_plateau",
      soak_users: [soak.users],
      boundary_stage: boundary?.stage ?? null,
      boundary_users: boundary?.users ?? null,
    };
  }
  validateExactRecomputedGate({
    actual: gates.get("soak-plateau-provenance"),
    expected: provenance,
    label: "soak plateau provenance",
  });

  const soakIndex = completedStages.findIndex(
    (stage) => stage.stage === soak.stage,
  );
  const precedingCheckpointLabels = new Set(
    completedStages
      .slice(0, soakIndex)
      .map((stage) => `after-${stage.stage}`),
  );
  const beforeCheckpoint = [...integrity.checkpoints]
    .reverse()
    .find(
      (checkpoint) =>
        checkpoint.label === "before" ||
        precedingCheckpointLabels.has(checkpoint.label),
    );
  const afterCheckpoint = integrity.checkpoints.find(
    (checkpoint) =>
      checkpoint.label === `after-${soak.stage}`,
  );
  validateExactRecomputedGate({
    actual: gates.get("soak-no-growth"),
    expected: {
      stage: "soak-no-growth",
      ...evaluateSoakNoGrowthGate({
        resourceSamples: soak.resources.resource_samples,
        declaredDurationSeconds: soak.duration_seconds,
        firstResource: {
          databaseConnections:
            beforeCheckpoint?.databaseConnectionCount ??
            null,
        },
        finalResource: {
          databaseConnections:
            afterCheckpoint?.databaseConnectionCount ??
            null,
        },
        failureHalves: soak.failure_halves,
      }),
    },
    label: "soak no-growth",
  });
}

function validateRecomputedCapacity({
  summary,
  completedStages,
  gates,
}) {
  const plateaus = completedStages.filter(
    (stage) =>
      stage.group === "ramp" ||
      stage.group === "breakpoint",
  );
  if (plateaus.length === 0) {
    if (summary.local_capacity !== null) {
      throw new MutationEvidenceError(
        "A suite without ramp or breakpoint plateaus must report null local capacity.",
      );
    }
    return;
  }
  const calibration = completedStages.find(
    (stage) => stage.stage === MUTATION_CALIBRATION_STAGE,
  );
  const calibrationP95 = calibration?.metrics?.latency_ms?.p95;
  if (
    typeof calibrationP95 !== "number" ||
    !Number.isFinite(calibrationP95) ||
    calibrationP95 <= 0
  ) {
    throw new MutationEvidenceError(
      "Local capacity evidence lacks its calibrated representative mixed warm baseline.",
    );
  }
  const recomputed = {
    ...selectHighestSustainableLocalPlateau({
      targetClassification: "local",
      plateaus: plateaus.map((stage) => ({
        stage: stage.stage,
        users: stage.users,
        metrics: stage.metrics,
        passed:
          gates.get(stage.stage)?.plateau_passed ??
          gates.get(stage.stage)?.passed ??
          false,
      })),
    }),
    latency_reference: {
      stage: MUTATION_CALIBRATION_STAGE,
      label:
        "calibrated representative mixed warm baseline",
      p95_ms: calibrationP95,
    },
  };
  if (!isDeepStrictEqual(summary.local_capacity, recomputed)) {
    throw new MutationEvidenceError(
      "Final local-capacity users, selected plateau, achieved RPS, or latency reference do not reconcile with completed raw stages.",
    );
  }
}

function validateCumulativeRequestUsage({
  summary,
  completedStages,
  gates,
  canonicalPlan,
}) {
  const operatorStage = completedStages.some(
    (stage) => stage.group === "operator_overlap",
  );
  const operatorRequests = operatorStage
    ? requireNonnegativeInteger(
        gates.get("operator-isolation-and-causal-repair")
          ?.evidence?.operator_requests,
        "Operator cumulative request count",
      )
    : 0;
  const locustRequests = completedStages.reduce(
    (total, stage) => total + stage.metrics.requests,
    0,
  );
  const recomputed = {
    locust_requests: locustRequests,
    operator_requests: operatorRequests,
    total_requests: locustRequests + operatorRequests,
    ceiling: canonicalPlan.cumulativeRequestCeiling,
    reached:
      locustRequests + operatorRequests >=
      canonicalPlan.cumulativeRequestCeiling,
  };
  if (
    !Number.isSafeInteger(recomputed.total_requests) ||
    recomputed.reached ||
    !isDeepStrictEqual(
      summary.cumulative_request_usage,
      recomputed,
    )
  ) {
    throw new MutationEvidenceError(
      "Final cumulative request usage does not reconcile with stage and operator evidence or reached its declared ceiling.",
    );
  }
}

function validateExactRecomputedGate({
  actual,
  expected,
  label,
}) {
  if (!actual || !isDeepStrictEqual(actual, expected)) {
    throw new MutationEvidenceError(
      `Final ${label} gate does not match independently recomputed evidence.`,
    );
  }
}

function validateCleanup({
  summaryCleanup: summaryCleanupInput,
  completionCleanup: completionCleanupInput,
  runId,
  identityCount,
}) {
  const summaryCleanup = requireObject(
    summaryCleanupInput,
    "Summary cleanup",
  );
  const completionCleanup = requireObject(
    completionCleanupInput,
    "Completion cleanup",
  );
  if (!isDeepStrictEqual(completionCleanup, summaryCleanup)) {
    throw new MutationEvidenceError(
      "Completion cleanup does not match summary cleanup.",
    );
  }
  requireMatchingValue(
    summaryCleanup.runId,
    runId,
    "Exact cleanup run id",
  );
  if (summaryCleanup.dryRun !== false) {
    throw new MutationEvidenceError(
      "Final cleanup must be an executed exact cleanup, not a dry run.",
    );
  }
  for (const field of ["matchedUsers", "deletedUsers"]) {
    if (summaryCleanup[field] !== identityCount) {
      throw new MutationEvidenceError(
        `Exact cleanup ${field} must match the declared identity count ${identityCount}.`,
      );
    }
  }
  if (summaryCleanup.residualProductRows !== 0) {
    throw new MutationEvidenceError(
      "Exact cleanup must leave zero residual product rows.",
    );
  }
}

function validateArtifactFiles({
  reportDirectory,
  completedStages,
  declaredStages,
}) {
  const expectedArtifactNames = new Set();
  for (const stage of completedStages) {
    const contents = new Map();
    for (const artifactName of Object.keys(stage.artifacts)) {
      expectedArtifactNames.add(artifactName);
      const artifactPath = path.join(
        reportDirectory,
        artifactName,
      );
      assertRegularFile(artifactPath, artifactName);
      const content = readFileSync(artifactPath);
      contents.set(artifactName, content);
      const actualDigest = createHash("sha256")
        .update(content)
        .digest("hex");
      if (actualDigest !== stage.artifacts[artifactName]) {
        throw new MutationEvidenceError(
          `Artifact ${artifactName} digest does not match the final summary.`,
        );
      }
    }
    validateStageArtifactContents({
      stage,
      contents,
      reportDirectory,
    });
  }

  const declaredStageNames = declaredStages.map(
    (stage) => stage.name,
  );
  for (const fileName of readdirSync(reportDirectory)) {
    const hasDeclaredStagePrefix = declaredStageNames.some(
      (stageName) =>
        fileName === `${stageName}.html` ||
        fileName.startsWith(`${stageName}_`),
    );
    if (
      (hasDeclaredStagePrefix ||
        LOCUST_ARTIFACT_PATTERN.test(fileName)) &&
      !expectedArtifactNames.has(fileName)
    ) {
      throw new MutationEvidenceError(
        `Orphan mutation stage artifact ${fileName} is not referenced by a completed stage.`,
      );
    }
  }
}

function validateStageArtifactContents({
  stage,
  contents,
  reportDirectory,
}) {
  const artifactText = (suffix) => {
    const name =
      suffix === ".html"
        ? `${stage.stage}.html`
        : `${stage.stage}_${suffix}`;
    const value = contents.get(name);
    if (!value) {
      throw new MutationEvidenceError(
        `Artifact ${name} is required in final mutation evidence.`,
      );
    }
    return { name, text: value.toString("utf8") };
  };
  const html = artifactText(".html");
  if (
    !/(?:<!doctype html|<html(?:\s|>))/i.test(html.text) ||
    !/(?:<title>\s*Locust|Locust Test Report)/i.test(
      html.text,
    )
  ) {
    throw new MutationEvidenceError(
      `Artifact ${html.name} must contain a recognizable Locust HTML report.`,
    );
  }
  const stats = artifactText("stats.csv");
  const history = artifactText("stats_history.csv");
  const failures = artifactText("failures.csv");
  const exceptions = artifactText("exceptions.csv");
  for (const artifact of [
    stats,
    history,
    failures,
    exceptions,
  ]) {
    if (!artifact.text.trim()) {
      throw new MutationEvidenceError(
        `Artifact ${artifact.name} must contain a nonempty CSV schema.`,
      );
    }
  }

  let parsedMetrics;
  let peakUsers;
  let failureHalves;
  let historyTiming;
  try {
    parsedMetrics = parseLocustStatsCsv(stats.text);
    validateLocustStatsStructure({
      text: stats.text,
      metrics: parsedMetrics,
      stageName: stage.stage,
    });
    peakUsers = parseLocustPeakUsers(history.text);
    historyTiming = summarizeHistoryTiming(history.text);
    failureHalves = summarizeFailureHalves(
      history.text,
      parsedMetrics,
    );
  } catch (error) {
    throw new MutationEvidenceError(
      `Raw Locust artifacts for ${stage.stage} are invalid: ${
        error instanceof Error
          ? error.message
          : "unknown CSV failure"
      }.`,
    );
  }
  const ceilings = readMutationManifest().ceilings;
  if (
    parsedMetrics.requests >= ceilings.maximum_requests
  ) {
    throw new MutationEvidenceError(
      `Raw Locust stats for ${stage.stage} reached the canonical per-stage request ceiling.`,
    );
  }
  if (
    Math.max(
      parsedMetrics.requests_per_second,
      historyTiming.maximumRequestsPerSecond,
      historyTiming.maximumDerivedRequestsPerSecond,
    ) >= ceilings.maximum_requests_per_second
  ) {
    throw new MutationEvidenceError(
      `Raw Locust history for ${stage.stage} reached the canonical requests-per-second ceiling in reported or independently derived rolling evidence.`,
    );
  }
  const maximumRuntime =
    stage.group === "soak"
      ? ceilings.maximum_soak_runtime_seconds
      : ceilings.maximum_profile_runtime_seconds;
  if (
    stage.achieved_duration_seconds >= maximumRuntime
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stage.stage} reached its canonical runtime watchdog ceiling.`,
    );
  }
  const historyRequestLag =
    parsedMetrics.requests - historyTiming.finalRequests;
  const historyFailureLag =
    parsedMetrics.failures - historyTiming.finalFailures;
  if (
    historyRequestLag < 0 ||
    historyFailureLag < 0 ||
    historyFailureLag > historyRequestLag ||
    historyRequestLag >=
      ceilings.maximum_requests_per_second *
        LOCUST_HISTORY_FRESHNESS_SECONDS
  ) {
    throw new MutationEvidenceError(
      `Raw Locust history for ${stage.stage} is ahead of stats.csv or exceeds the bounded ${LOCUST_HISTORY_FRESHNESS_SECONDS}-second periodic-history freshness lag.`,
    );
  }
  const recomputedMetrics = {
    ...parsedMetrics,
    request_mix: summarizeRequestMix(parsedMetrics),
  };
  if (!isDeepStrictEqual(stage.metrics, recomputedMetrics)) {
    throw new MutationEvidenceError(
      `Summary stage ${stage.stage} metrics do not match the raw Locust stats aggregate and request rows.`,
    );
  }
  requireMatchingValue(
    peakUsers,
    stage.achieved_peak_users,
    `Summary stage ${stage.stage} achieved peak users`,
  );
  if (
    historyTiming.spanSeconds <
      stage.duration_seconds - 10 ||
    historyTiming.spanSeconds >
      stage.duration_seconds + 15 ||
    Math.abs(
      stage.achieved_duration_seconds -
        historyTiming.spanSeconds,
    ) > 15
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stage.stage} achieved duration does not reconcile with its Locust history timestamps.`,
    );
  }
  if (
    !isDeepStrictEqual(
      stage.failure_halves,
      failureHalves,
    )
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stage.stage} failure halves do not match its Locust history.`,
    );
  }

  let failureEvidence;
  let exceptionEvidence;
  try {
    failureEvidence = parseLocustFailureEvidence(
      failures.text,
    );
    exceptionEvidence = parseLocustExceptionEvidence(
      exceptions.text,
    );
  } catch (error) {
    throw new MutationEvidenceError(
      `Failure artifacts for ${stage.stage} are invalid: ${
        error instanceof Error ? error.message : "invalid CSV"
      }.`,
    );
  }
  requireMatchingValue(
    failureEvidence.unexpected5xxOccurrences,
    stage.unexpected_5xx,
    `Summary stage ${stage.stage} unexpected 5xx count`,
  );
  requireMatchingValue(
    exceptionEvidence.rowCount,
    stage.exception_count,
    `Summary stage ${stage.stage} exception count`,
  );
  requireMatchingValue(
    failureEvidence.totalOccurrences,
    stage.metrics.failures,
    `Summary stage ${stage.stage} failure occurrences`,
  );
  if (exceptionEvidence.rowCount !== 0) {
    throw new MutationEvidenceError(
      `Passing mutation evidence cannot retain exception rows for ${stage.stage}.`,
    );
  }

  const semanticName = `${stage.stage}_semantic-verifications.json`;
  const semanticEvidence =
    validateSemanticVerificationArtifact({
      artifactName: semanticName,
      artifactPath: path.join(
        reportDirectory,
        semanticName,
      ),
    });
  if (
    !isDeepStrictEqual(
      stage.semantic_verifications,
      semanticEvidence,
    )
  ) {
    throw new MutationEvidenceError(
      `Artifact ${semanticName} does not match its completed-stage semantic evidence.`,
    );
  }
  const semanticGate = evaluateSemanticVerificationGate({
    requestsByName: parsedMetrics.requests_by_name,
    evidence: semanticEvidence,
  });
  if (!semanticGate.passed) {
    throw new MutationEvidenceError(
      `Artifact ${semanticName} does not reconcile successful POST requests with one-to-one semantic readback: ${semanticGate.failures.join("; ")}.`,
    );
  }
  const successfulPostCount =
    parsedMetrics.requests_by_name
      .filter((row) => row.method === "POST")
      .reduce(
        (total, row) =>
          total + row.requests - row.failures,
        0,
      );
  if (
    successfulPostCount > 0 &&
    Object.keys(
      semanticEvidence.successful_submissions,
    ).length === 0
  ) {
    throw new MutationEvidenceError(
      `Artifact ${semanticName} must contain nonempty mutation receipts when successful POSTs occurred.`,
    );
  }
}

function validateLocustStatsStructure({
  text,
  metrics,
  stageName,
}) {
  const [headers, ...rows] = parseCsv(text);
  if (!headers) {
    throw new Error("Locust stats CSV is empty.");
  }
  const typeIndex = headers.indexOf("Type");
  const nameIndex = headers.indexOf("Name");
  const requestIndex = headers.indexOf("Request Count");
  const failureIndex = headers.indexOf("Failure Count");
  if (
    typeIndex < 0 ||
    nameIndex < 0 ||
    requestIndex < 0 ||
    failureIndex < 0
  ) {
    throw new Error(
      "Locust stats CSV lacks request identity/count columns.",
    );
  }
  const aggregateRows = rows.filter(
    (row) => row[nameIndex] === "Aggregated",
  );
  if (aggregateRows.length !== 1) {
    throw new Error(
      "Locust stats CSV must contain exactly one Aggregated row.",
    );
  }
  const namedRows = rows.filter(
    (row) => row[nameIndex] !== "Aggregated",
  );
  if (
    namedRows.length === 0 ||
    namedRows.some(
      (row) => !row[typeIndex] || !row[nameIndex],
    )
  ) {
    throw new Error(
      "Locust stats CSV contains an invalid named request row.",
    );
  }
  const keys = namedRows.map(
    (row) => `${row[typeIndex]}\u0000${row[nameIndex]}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      "Locust stats CSV contains a duplicate method/name row.",
    );
  }
  let requestTotal = 0;
  let failureTotal = 0;
  for (const row of namedRows) {
    const requests = Number(row[requestIndex]);
    const failures = Number(row[failureIndex]);
    if (
      !Number.isSafeInteger(requests) ||
      requests < 0 ||
      !Number.isSafeInteger(failures) ||
      failures < 0 ||
      failures > requests ||
      !Number.isSafeInteger(requestTotal + requests) ||
      !Number.isSafeInteger(failureTotal + failures)
    ) {
      throw new Error(
        "Locust stats CSV contains invalid per-name request/failure counts.",
      );
    }
    requestTotal += requests;
    failureTotal += failures;
  }
  if (
    metrics.failures > metrics.requests ||
    requestTotal !== metrics.requests ||
    failureTotal !== metrics.failures
  ) {
    throw new MutationEvidenceError(
      `Raw Locust stats for ${stageName} named request/failure totals do not match its Aggregated row.`,
    );
  }
}

function parseLocustFailureEvidence(text) {
  const [headers, ...rows] = parseCsv(text);
  const expectedHeaders = [
    "Method",
    "Name",
    "Error",
    "Occurrences",
    "First Seen",
    "Last Seen",
  ];
  if (!isDeepStrictEqual(headers, expectedHeaders)) {
    throw new Error(
      "Locust failure CSV has an invalid canonical header.",
    );
  }
  const occurrencesIndex = headers.indexOf("Occurrences");
  let totalOccurrences = 0;
  for (const row of rows) {
    if (row.length !== expectedHeaders.length) {
      throw new Error(
        "Locust failure CSV contains a malformed row.",
      );
    }
    const occurrences = Number(row[occurrencesIndex]);
    if (
      !Number.isSafeInteger(occurrences) ||
      occurrences <= 0 ||
      !Number.isSafeInteger(
        totalOccurrences + occurrences,
      )
    ) {
      throw new Error(
        "Locust failure CSV contains an invalid Occurrences count.",
      );
    }
    totalOccurrences += occurrences;
  }
  return {
    rowCount: rows.length,
    totalOccurrences,
    unexpected5xxOccurrences:
      countUnexpected5xxFailures(text),
  };
}

function parseLocustExceptionEvidence(text) {
  const [headers, ...rows] = parseCsv(text);
  const expectedHeaders = [
    "Count",
    "Message",
    "Traceback",
    "Nodes",
  ];
  if (!isDeepStrictEqual(headers, expectedHeaders)) {
    throw new Error(
      "Locust exception CSV has an invalid canonical header.",
    );
  }
  let totalCount = 0;
  for (const row of rows) {
    if (row.length !== expectedHeaders.length) {
      throw new Error(
        "Locust exception CSV contains a malformed row.",
      );
    }
    const count = Number(row[0]);
    if (
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      !Number.isSafeInteger(totalCount + count)
    ) {
      throw new Error(
        "Locust exception CSV contains an invalid Count value.",
      );
    }
    totalCount += count;
  }
  return {
    rowCount: rows.length,
    totalCount,
  };
}

function validateSemanticVerificationArtifact({
  artifactName,
  artifactPath,
}) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch {
    throw new MutationEvidenceError(
      `Artifact ${artifactName} must contain valid JSON.`,
    );
  }
  const artifact = requireObject(
    parsed,
    `Artifact ${artifactName}`,
  );
  const expectedKeys = [
    "pending_verifications",
    "schema_version",
    "semantic_verifications",
    "successful_submissions",
  ];
  if (
    !isDeepStrictEqual(
      Object.keys(artifact).sort(),
      expectedKeys,
    )
  ) {
    throw new MutationEvidenceError(
      `Artifact ${artifactName} has an invalid top-level schema.`,
    );
  }
  if (
    artifact.schema_version !==
    SEMANTIC_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new MutationEvidenceError(
      `Artifact ${artifactName} has an unsupported schema version.`,
    );
  }
  const successful = validateCounterMap(
    artifact.successful_submissions,
    `${artifactName} successful submissions`,
  );
  const verified = validateCounterMap(
    artifact.semantic_verifications,
    `${artifactName} semantic verifications`,
  );
  const pending = validateCounterMap(
    artifact.pending_verifications,
    `${artifactName} pending verifications`,
  );
  const names = new Set([
    ...Object.keys(successful),
    ...Object.keys(verified),
    ...Object.keys(pending),
  ]);
  for (const name of names) {
    if (!ALLOWED_SEMANTIC_REQUEST_NAMES.has(name)) {
      throw new MutationEvidenceError(
        `Artifact ${artifactName} used undeclared semantic request name ${name}.`,
      );
    }
    const successfulCount = successful[name] ?? 0;
    const verifiedCount = verified[name] ?? 0;
    const pendingCount = pending[name] ?? 0;
    if (
      verifiedCount !== successfulCount ||
      pendingCount !== 0
    ) {
      throw new MutationEvidenceError(
        `Artifact ${artifactName} lacks one-to-one completed semantic verification for ${name}.`,
      );
    }
  }
  return artifact;
}

function validateReportDirectorySanitization(reportDirectory) {
  const forbiddenRetainedPatterns = [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    /\bcadence-load-(?:fake|process)-[A-Za-z0-9_-]{16,}\b/,
    /(?:^|[\s"'=(])(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|\/private\/(?:tmp|var\/folders)|\/var\/folders|\/tmp)\/[^\s"'<>]*/m,
  ];
  for (const fileName of readdirSync(reportDirectory)) {
    const filePath = path.join(reportDirectory, fileName);
    assertRegularFile(filePath, fileName);
    const content = readFileSync(filePath, "utf8");
    if (
      content.includes(root) ||
      forbiddenRetainedPatterns.some((pattern) =>
        pattern.test(content),
      )
    ) {
      throw new MutationEvidenceError(
        `${fileName} retained a private identifier, secret, or absolute local path.`,
      );
    }
    try {
      assertSanitizedArtifact({
        content,
        label: fileName,
      });
    } catch (error) {
      throw new MutationEvidenceError(
        error instanceof Error
          ? error.message
          : `${fileName} retained private load-session material.`,
      );
    }
  }
}

function validateCounterMap(value, label) {
  const counters = requireObject(value, label);
  for (const [name, count] of Object.entries(counters)) {
    if (typeof name !== "string" || !name) {
      throw new MutationEvidenceError(
        `${label} contains an invalid request name.`,
      );
    }
    requireNonnegativeInteger(count, `${label} ${name}`);
  }
  return counters;
}

function readMutationManifest() {
  const manifest = readCheckedInJson(
    mutationManifestPath,
    "Mutation workload manifest",
  );
  if (
    manifest.schema_version !==
      MUTATION_MANIFEST_SCHEMA_VERSION ||
    !isDeepStrictEqual(manifest.think_time_seconds, {
      minimum: 2,
      maximum: 5,
    }) ||
    !Array.isArray(manifest.read_task_keys) ||
    !manifest.task_weights ||
    typeof manifest.task_weights !== "object" ||
    Array.isArray(manifest.task_weights) ||
    !manifest.profiles ||
    typeof manifest.profiles !== "object" ||
    Array.isArray(manifest.profiles) ||
    !manifest.shapes ||
    typeof manifest.shapes !== "object" ||
    Array.isArray(manifest.shapes) ||
    !manifest.ceilings ||
    typeof manifest.ceilings !== "object" ||
    Array.isArray(manifest.ceilings)
  ) {
    throw new MutationEvidenceError(
      "The checked-in mutation workload manifest has an unsupported schema.",
    );
  }
  const weights = Object.values(manifest.task_weights);
  if (
    weights.length === 0 ||
    weights.some(
      (weight) =>
        !Number.isSafeInteger(weight) || weight <= 0,
    ) ||
    weights.reduce((total, weight) => total + weight, 0) !==
      100 ||
    new Set(manifest.read_task_keys).size !==
      manifest.read_task_keys.length ||
    manifest.read_task_keys.some(
      (key) =>
        typeof key !== "string" ||
        !Object.hasOwn(manifest.task_weights, key),
    ) ||
    manifest.read_task_keys.reduce(
      (total, key) => total + manifest.task_weights[key],
      0,
    ) !== 65
  ) {
    throw new MutationEvidenceError(
      "The checked-in mutation workload must retain positive task weights totaling 100 with an exact 65% read weight.",
    );
  }
  return manifest;
}

function readCheckedInJson(filePath, label) {
  try {
    return requireObject(
      JSON.parse(readFileSync(filePath, "utf8")),
      label,
    );
  } catch (error) {
    if (error instanceof MutationEvidenceError) {
      throw error;
    }
    throw new MutationEvidenceError(
      `${label} is unavailable or invalid.`,
    );
  }
}

function expectedMutationCohortCounts(identityCount) {
  const weights = {
    typical_daily: 70,
    review_heavy: 20,
    export_heavy: 10,
  };
  const raw = Object.fromEntries(
    MUTATION_COHORTS.map((name) => [
      name,
      (identityCount * weights[name]) / 100,
    ]),
  );
  const counts = Object.fromEntries(
    MUTATION_COHORTS.map((name) => [
      name,
      Math.floor(raw[name]),
    ]),
  );
  if (identityCount >= MUTATION_COHORTS.length) {
    for (const name of MUTATION_COHORTS) {
      if (counts[name] === 0) counts[name] = 1;
    }
  }
  let assigned = Object.values(counts).reduce(
    (total, count) => total + count,
    0,
  );
  while (assigned > identityCount) {
    const candidate = [...MUTATION_COHORTS]
      .reverse()
      .find((name) => counts[name] > 1);
    if (!candidate) break;
    counts[candidate] -= 1;
    assigned -= 1;
  }
  const remainderOrder = [...MUTATION_COHORTS].sort(
    (left, right) =>
      raw[right] -
        Math.floor(raw[right]) -
        (raw[left] - Math.floor(raw[left])) ||
      MUTATION_COHORTS.indexOf(left) -
        MUTATION_COHORTS.indexOf(right),
  );
  for (
    let index = 0;
    assigned < identityCount;
    index += 1, assigned += 1
  ) {
    counts[
      remainderOrder[index % remainderOrder.length]
    ] += 1;
  }
  return Object.fromEntries(
    ALL_COHORTS.map((name) => [name, counts[name] ?? 0]),
  );
}

function smoothMutationCohortAllocation(cohortCounts) {
  const counts = Object.fromEntries(
    MUTATION_COHORTS.map((name) => [
      name,
      cohortCounts[name],
    ]),
  );
  const total = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const current = Object.fromEntries(
    MUTATION_COHORTS.map((name) => [name, 0]),
  );
  const remaining = { ...counts };
  const allocation = [];
  for (let index = 0; index < total; index += 1) {
    for (const name of MUTATION_COHORTS) {
      current[name] += counts[name];
    }
    const selected = [...MUTATION_COHORTS]
      .filter((name) => remaining[name] > 0)
      .sort(
        (left, right) =>
          current[right] -
            current[left] ||
          MUTATION_COHORTS.indexOf(left) -
            MUTATION_COHORTS.indexOf(right),
      )[0];
    allocation.push(selected);
    remaining[selected] -= 1;
    current[selected] -= total;
  }
  return allocation;
}

function validateDeclaredMetricsSchema(metrics, stageName) {
  const expectedKeys = [
    "average_response_bytes",
    "failure_ratio_percent",
    "failures",
    "latency_ms",
    "request_mix",
    "requests",
    "requests_by_name",
    "requests_per_second",
    "response_bytes",
  ];
  if (
    !isDeepStrictEqual(
      Object.keys(metrics).sort(),
      expectedKeys,
    )
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} metrics have an invalid schema.`,
    );
  }
  const requests = requireNonnegativeInteger(
    metrics.requests,
    `Summary stage ${stageName} request count`,
  );
  const failures = requireNonnegativeInteger(
    metrics.failures,
    `Summary stage ${stageName} failure count`,
  );
  if (requests === 0 || failures > requests) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} must contain timed requests with failures no greater than requests.`,
    );
  }
  for (const [field, value] of [
    ["failure ratio", metrics.failure_ratio_percent],
    ["requests per second", metrics.requests_per_second],
    ["average response bytes", metrics.average_response_bytes],
  ]) {
    requireNonnegativeNumber(
      value,
      `Summary stage ${stageName} ${field}`,
    );
  }
  requireNonnegativeInteger(
    metrics.response_bytes,
    `Summary stage ${stageName} response bytes`,
  );
  const latency = requireObject(
    metrics.latency_ms,
    `Summary stage ${stageName} latency`,
  );
  if (
    !isDeepStrictEqual(Object.keys(latency).sort(), [
      "p50",
      "p75",
      "p95",
      "p99",
    ])
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} latency metrics have an invalid schema.`,
    );
  }
  for (const [percentile, value] of Object.entries(latency)) {
    requireNonnegativeNumber(
      value,
      `Summary stage ${stageName} latency ${percentile}`,
    );
  }
  const rows = requireArray(
    metrics.requests_by_name,
    `Summary stage ${stageName} request rows`,
  );
  if (rows.length === 0) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} must retain per-name request rows.`,
    );
  }
  for (const [index, rowInput] of rows.entries()) {
    const row = requireObject(
      rowInput,
      `Summary stage ${stageName} request row ${index + 1}`,
    );
    requireString(
      row.method,
      `Summary stage ${stageName} request method`,
    );
    requireString(
      row.name,
      `Summary stage ${stageName} request name`,
    );
    const rowRequests = requireNonnegativeInteger(
      row.requests,
      `Summary stage ${stageName} named request count`,
    );
    const rowFailures = requireNonnegativeInteger(
      row.failures,
      `Summary stage ${stageName} named failure count`,
    );
    if (rowFailures > rowRequests) {
      throw new MutationEvidenceError(
        `Summary stage ${stageName} named failures cannot exceed requests.`,
      );
    }
  }
  requireObject(
    metrics.request_mix,
    `Summary stage ${stageName} request mix`,
  );
}

function validateResourceEvidence({
  value,
  stageName,
  declaredDurationSeconds,
  achievedDurationSeconds,
  logicalCpuCount,
}) {
  const resources = requireObject(
    value,
    `Summary stage ${stageName} resources`,
  );
  if (
    !isDeepStrictEqual(
      Object.keys(resources).sort(),
      [...REQUIRED_RESOURCE_EVIDENCE_KEYS].sort(),
    )
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} resource evidence has an invalid schema.`,
    );
  }
  const breaches = requireArray(
    resources.breaches,
    `Summary stage ${stageName} resource breaches`,
  );
  if (
    breaches.some(
      (breach) =>
        typeof breach !== "string" || !breach,
    )
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} resource breaches contain an invalid label.`,
    );
  }
  if (new Set(breaches).size !== breaches.length) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} resource breaches contain a duplicate label.`,
    );
  }
  const recordedSampleCount = requirePositiveInteger(
    resources.samples,
    `Summary stage ${stageName} resource samples`,
  );
  const resourceSamples = requireArray(
    resources.resource_samples,
    `Summary stage ${stageName} raw resource samples`,
  );
  if (resourceSamples.length !== recordedSampleCount) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} resource sample count does not match its retained raw observations.`,
    );
  }

  const durationMilliseconds = declaredDurationSeconds * 1_000;
  const achievedDurationMilliseconds =
    achievedDurationSeconds * 1_000;
  const recomputedBreaches = new Set();
  const parsedSamples = [];
  let previousElapsed = Number.NEGATIVE_INFINITY;
  for (const [index, sampleInput] of resourceSamples.entries()) {
    const label = `Summary stage ${stageName} raw resource sample ${index}`;
    const sample = requireObject(sampleInput, label);
    requireExactObjectKeys(
      sample,
      REQUIRED_RESOURCE_SAMPLE_KEYS,
      label,
    );

    const elapsedMilliseconds = requireNonnegativeNumber(
      sample.elapsed_milliseconds,
      `${label} elapsed milliseconds`,
    );
    if (elapsedMilliseconds <= previousElapsed) {
      throw new MutationEvidenceError(
        `Summary stage ${stageName} raw resource sample elapsed milliseconds must be strictly increasing.`,
      );
    }
    previousElapsed = elapsedMilliseconds;

    const hostLoad = requireNonnegativeNumber(
      sample.host_load_1m,
      `${label} host load`,
    );
    const hostLoadPerLogicalCpu = requireNonnegativeNumber(
      sample.host_load_per_logical_cpu,
      `${label} host load per logical CPU`,
    );
    if (hostLoadPerLogicalCpu !== hostLoad / logicalCpuCount) {
      throw new MutationEvidenceError(
        `Summary stage ${stageName} raw host-load ratio does not match the declared logical CPU count.`,
      );
    }
    const availableMemory = requirePositiveInteger(
      sample.available_memory_bytes,
      `${label} available memory bytes`,
    );
    const appRss = requireNullablePositiveInteger(
      sample.app_rss_bytes,
      `${label} app RSS bytes`,
    );
    const locustRss = requireNullablePositiveInteger(
      sample.locust_rss_bytes,
      `${label} Locust RSS bytes`,
    );

    if (appRss === null) {
      recomputedBreaches.add("app RSS measurement");
    } else if (
      appRss > DEFAULT_LOCAL_RESOURCE_CEILINGS.max_app_rss_bytes
    ) {
      recomputedBreaches.add("app RSS");
    }
    if (
      locustRss === null &&
      elapsedMilliseconds < durationMilliseconds
    ) {
      recomputedBreaches.add("Locust RSS measurement");
    } else if (
      locustRss !== null &&
      locustRss >
        DEFAULT_LOCAL_RESOURCE_CEILINGS.max_locust_rss_bytes
    ) {
      recomputedBreaches.add("Locust RSS");
    }
    if (
      hostLoadPerLogicalCpu >
      DEFAULT_LOCAL_RESOURCE_CEILINGS.max_host_load_per_logical_cpu
    ) {
      recomputedBreaches.add("host load");
    }
    if (
      availableMemory <
      DEFAULT_LOCAL_RESOURCE_CEILINGS.min_available_memory_bytes
    ) {
      recomputedBreaches.add("available memory");
    }
    parsedSamples.push({
      elapsed_milliseconds: elapsedMilliseconds,
      host_load_1m: hostLoad,
      host_load_per_logical_cpu: hostLoadPerLogicalCpu,
      available_memory_bytes: availableMemory,
      app_rss_bytes: appRss,
      locust_rss_bytes: locustRss,
    });
  }

  const firstElapsed = parsedSamples[0]?.elapsed_milliseconds;
  const finalElapsed =
    parsedSamples.at(-1)?.elapsed_milliseconds;
  if (
    firstElapsed === undefined ||
    firstElapsed >
      MAXIMUM_RESOURCE_SAMPLE_BOUNDARY_OFFSET_MILLISECONDS
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} raw resource samples do not cover the stage start.`,
    );
  }
  if (
    finalElapsed === undefined ||
    Math.abs(finalElapsed - achievedDurationMilliseconds) >
      MAXIMUM_RESOURCE_SAMPLE_BOUNDARY_OFFSET_MILLISECONDS
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} raw resource samples do not cover the achieved stage end.`,
    );
  }
  for (let index = 1; index < parsedSamples.length; index += 1) {
    if (
      parsedSamples[index].elapsed_milliseconds -
        parsedSamples[index - 1].elapsed_milliseconds >
      MAXIMUM_RESOURCE_SAMPLE_GAP_MILLISECONDS
    ) {
      throw new MutationEvidenceError(
        `Summary stage ${stageName} raw resource samples exceed the maximum sampling gap.`,
      );
    }
  }

  const appRssSamples = parsedSamples
    .map((sample) => sample.app_rss_bytes)
    .filter((value) => value !== null);
  const locustRssSamples = parsedSamples
    .map((sample) => sample.locust_rss_bytes)
    .filter((value) => value !== null);
  if (appRssSamples.length === 0 || locustRssSamples.length === 0) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} raw resource samples require positive app and Locust RSS observations.`,
    );
  }

  const recomputedDiagnostics = {
    max_host_load_1m: Math.max(
      ...parsedSamples.map((sample) => sample.host_load_1m),
    ),
    max_host_load_per_logical_cpu: Math.max(
      ...parsedSamples.map(
        (sample) => sample.host_load_per_logical_cpu,
      ),
    ),
    min_available_memory_bytes: Math.min(
      ...parsedSamples.map(
        (sample) => sample.available_memory_bytes,
      ),
    ),
    max_app_rss_bytes: Math.max(...appRssSamples),
    max_locust_rss_bytes: Math.max(...locustRssSamples),
    first_app_rss_bytes: appRssSamples[0],
    final_app_rss_bytes: appRssSamples.at(-1),
    first_locust_rss_bytes: locustRssSamples[0],
    final_locust_rss_bytes: locustRssSamples.at(-1),
  };
  for (const [key, expected] of Object.entries(
    recomputedDiagnostics,
  )) {
    const actual = requireNonnegativeNumber(
      resources[key],
      `Summary stage ${stageName} resource ${key}`,
    );
    if (actual !== expected) {
      throw new MutationEvidenceError(
        `Summary stage ${stageName} resource ${key} does not match its retained raw observations.`,
      );
    }
  }

  const expectedBreaches = [...recomputedBreaches].sort();
  if (
    !isDeepStrictEqual([...breaches].sort(), expectedBreaches)
  ) {
    throw new MutationEvidenceError(
      `Summary stage ${stageName} resource breaches do not match independently recomputed raw observations.`,
    );
  }
  if (expectedBreaches.length > 0) {
    throw new MutationEvidenceError(
      `Passing mutation evidence independently breaches canonical resources for ${stageName}: ${expectedBreaches.join(", ")}.`,
    );
  }
  return resources;
}

function aggregateSequentialStageMetrics(stageResults) {
  if (!Array.isArray(stageResults) || stageResults.length === 0) {
    throw new MutationEvidenceError(
      "Sequential mutation stage evidence is required.",
    );
  }
  const byKey = new Map();
  let duration = 0;
  for (const stage of stageResults) {
    duration += stage.achieved_duration_seconds;
    for (const row of stage.metrics.requests_by_name) {
      const key = `${row.method}\u0000${row.name}`;
      const current = byKey.get(key) ?? {
        method: row.method,
        name: row.name,
        requests: 0,
        failures: 0,
      };
      current.requests += row.requests;
      current.failures += row.failures;
      byKey.set(key, current);
    }
  }
  const rows = [...byKey.values()]
    .map((row) => ({
      ...row,
      requests_per_second: row.requests / duration,
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.method.localeCompare(right.method),
    );
  const requests = rows.reduce(
    (total, row) => total + row.requests,
    0,
  );
  return {
    achieved_duration_seconds: duration,
    requests,
    requests_per_second: requests / duration,
    requests_by_name: rows,
  };
}

function aggregateSemanticEvidence(stageResults) {
  const aggregate = {
    successful_submissions: {},
    semantic_verifications: {},
    pending_verifications: {},
  };
  for (const stage of stageResults) {
    for (const field of Object.keys(aggregate)) {
      for (const [name, count] of Object.entries(
        stage.semantic_verifications[field],
      )) {
        aggregate[field][name] =
          (aggregate[field][name] ?? 0) + count;
      }
    }
  }
  return aggregate;
}

function summarizeFailureHalves(
  historyCsv,
  finalMetrics,
) {
  const [headers, ...rows] = parseCsv(historyCsv);
  if (!headers) {
    throw new Error("Locust history CSV is empty.");
  }
  const nameIndex = headers.indexOf("Name");
  const requestIndex = headers.indexOf(
    "Total Request Count",
  );
  const failureIndex = headers.indexOf(
    "Total Failure Count",
  );
  if (
    nameIndex < 0 ||
    requestIndex < 0 ||
    failureIndex < 0
  ) {
    throw new Error(
      "Locust history lacks cumulative request columns.",
    );
  }
  const aggregate = rows
    .filter((row) => row[nameIndex] === "Aggregated")
    .map((row) => ({
      requests: Number(row[requestIndex]),
      failures: Number(row[failureIndex]),
    }))
    .filter(
      (row) =>
        Number.isInteger(row.requests) &&
        row.requests >= 0 &&
        Number.isInteger(row.failures) &&
        row.failures >= 0 &&
        row.failures <= row.requests,
    );
  if (aggregate.length === 0) {
    throw new Error(
      "Locust history lacks valid aggregate request rows.",
    );
  }
  const middle =
    aggregate[
      aggregate.length === 1
        ? 0
        : Math.floor((aggregate.length - 1) / 2)
    ];
  if (
    finalMetrics.requests < middle.requests ||
    finalMetrics.failures < middle.failures
  ) {
    throw new Error(
      "Locust history cumulative midpoint exceeds final stats totals.",
    );
  }
  if (aggregate.length === 1) {
    return {
      first: { ...aggregate[0] },
      second: {
        requests:
          finalMetrics.requests - aggregate[0].requests,
        failures:
          finalMetrics.failures - aggregate[0].failures,
      },
    };
  }
  return {
    first: {
      requests: middle.requests,
      failures: middle.failures,
    },
    second: {
      requests: finalMetrics.requests - middle.requests,
      failures: finalMetrics.failures - middle.failures,
    },
  };
}

function summarizeHistoryTiming(historyCsv) {
  const [headers, ...rows] = parseCsv(historyCsv);
  if (!headers) {
    throw new Error("Locust history CSV is empty.");
  }
  const timestampIndex = headers.indexOf("Timestamp");
  const nameIndex = headers.indexOf("Name");
  const requestsPerSecondIndex =
    headers.indexOf("Requests/s");
  const requestIndex = headers.indexOf(
    "Total Request Count",
  );
  const failureIndex = headers.indexOf(
    "Total Failure Count",
  );
  if (
    timestampIndex < 0 ||
    nameIndex < 0 ||
    requestsPerSecondIndex < 0 ||
    requestIndex < 0 ||
    failureIndex < 0
  ) {
    throw new Error(
      "Locust history lacks timestamp, RPS, or cumulative-count columns.",
    );
  }
  const aggregate = rows
    .filter((row) => row[nameIndex] === "Aggregated")
    .map((row) => ({
      timestamp: Number(row[timestampIndex]),
      requestsPerSecond: Number(
        row[requestsPerSecondIndex],
      ),
      requests: Number(row[requestIndex]),
      failures: Number(row[failureIndex]),
    }));
  if (
    aggregate.length < 2 ||
    aggregate.some(
      (row) =>
        !Number.isSafeInteger(row.timestamp) ||
        row.timestamp < 0 ||
        typeof row.requestsPerSecond !== "number" ||
        !Number.isFinite(row.requestsPerSecond) ||
        row.requestsPerSecond < 0 ||
        !Number.isSafeInteger(row.requests) ||
        row.requests < 0 ||
        !Number.isSafeInteger(row.failures) ||
        row.failures < 0 ||
        row.failures > row.requests,
    )
  ) {
    throw new Error(
      "Locust history lacks valid aggregate timing, RPS, or cumulative-count evidence.",
    );
  }
  for (let index = 1; index < aggregate.length; index += 1) {
    const previous = aggregate[index - 1];
    const current = aggregate[index];
    const elapsedSeconds =
      current.timestamp - previous.timestamp;
    if (elapsedSeconds <= 0) {
      throw new Error(
        "Locust history aggregate timestamps must be strictly increasing; equal timestamps cannot retain rising totals safely.",
      );
    }
    if (
      current.requests < previous.requests ||
      current.failures < previous.failures
    ) {
      throw new Error(
        "Locust history lacks ordered, nondecreasing aggregate evidence.",
      );
    }
    if (
      elapsedSeconds >
      MAXIMUM_LOCUST_HISTORY_SAMPLE_GAP_SECONDS
    ) {
      throw new Error(
        `Locust history aggregate samples exceed the retained ${MAXIMUM_LOCUST_HISTORY_SAMPLE_GAP_SECONDS}-second periodic-sample gap bound.`,
      );
    }
  }

  const derivedRates = [];
  for (let index = 1; index < aggregate.length; index += 1) {
    const current = aggregate[index];
    for (
      let previousIndex = index - 1;
      previousIndex >= 0;
      previousIndex -= 1
    ) {
      const previous = aggregate[previousIndex];
      const elapsedSeconds =
        current.timestamp - previous.timestamp;
      if (
        elapsedSeconds >
        MAXIMUM_DERIVED_RPS_WINDOW_SECONDS
      ) {
        break;
      }
      if (
        elapsedSeconds >=
        MINIMUM_DERIVED_RPS_WINDOW_SECONDS
      ) {
        derivedRates.push(
          (current.requests - previous.requests) /
            elapsedSeconds,
        );
      }
    }
  }
  if (derivedRates.length === 0) {
    throw new Error(
      "Locust history lacks a cumulative-count window for independent RPS verification.",
    );
  }

  let reconciliationCount = 0;
  for (let index = 0; index < aggregate.length; index += 1) {
    const current = aggregate[index];
    const recentBoundary = latestHistorySampleAtOrBefore({
      aggregate,
      beforeIndex: index,
      timestamp:
        current.timestamp -
        LOCUST_REPORTED_RPS_EXCLUDED_SECONDS,
    });
    const olderBoundary = latestHistorySampleAtOrBefore({
      aggregate,
      beforeIndex: index,
      timestamp:
        current.timestamp -
        LOCUST_REPORTED_RPS_EXCLUDED_SECONDS -
        LOCUST_REPORTED_RPS_WINDOW_SECONDS,
    });
    if (
      !recentBoundary ||
      !olderBoundary ||
      recentBoundary.timestamp <= olderBoundary.timestamp
    ) {
      continue;
    }
    const derivedRollingRate =
      (recentBoundary.requests -
        olderBoundary.requests) /
      (recentBoundary.timestamp -
        olderBoundary.timestamp);
    if (
      Math.abs(
        current.requestsPerSecond - derivedRollingRate,
      ) >
      LOCUST_REPORTED_RPS_RECONCILIATION_TOLERANCE
    ) {
      throw new Error(
        "Locust history reported Requests/s contradicts its rolling cumulative request counts.",
      );
    }
    reconciliationCount += 1;
  }
  if (reconciliationCount === 0) {
    throw new Error(
      "Locust history lacks enough periodic samples to reconcile reported and cumulative rolling RPS.",
    );
  }
  const first = aggregate[0];
  const final = aggregate.at(-1);
  return {
    spanSeconds: final.timestamp - first.timestamp,
    finalRequests: final.requests,
    finalFailures: final.failures,
    maximumRequestsPerSecond: Math.max(
      ...aggregate.map((row) => row.requestsPerSecond),
    ),
    maximumDerivedRequestsPerSecond: Math.max(
      ...derivedRates,
    ),
  };
}

function latestHistorySampleAtOrBefore({
  aggregate,
  beforeIndex,
  timestamp,
}) {
  for (
    let index = beforeIndex - 1;
    index >= 0;
    index -= 1
  ) {
    if (aggregate[index].timestamp <= timestamp) {
      return aggregate[index];
    }
  }
  return null;
}

function readRequiredJson(reportDirectory, fileName) {
  const filePath = path.join(reportDirectory, fileName);
  try {
    assertRegularFile(filePath, fileName);
  } catch (error) {
    if (
      error instanceof MutationEvidenceError &&
      error.message.includes("is required")
    ) {
      throw error;
    }
    throw error;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new MutationEvidenceError(
      `${fileName} must contain valid JSON.`,
    );
  }
}

function assertRegularDirectory(directory) {
  let status;
  try {
    status = lstatSync(directory);
  } catch {
    throw new MutationEvidenceError(
      "The exact mutation evidence run directory is required.",
    );
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new MutationEvidenceError(
      "The exact mutation evidence path must be a real directory.",
    );
  }
  if ((status.mode & 0o077) !== 0) {
    throw new MutationEvidenceError(
      "The exact mutation evidence directory must use owner-only 0700 permissions.",
    );
  }
  if (
    typeof process.getuid === "function" &&
    status.uid !== process.getuid()
  ) {
    throw new MutationEvidenceError(
      "The exact mutation evidence directory must be owned by the current user.",
    );
  }
}

function assertRegularFile(filePath, label) {
  let status;
  try {
    status = lstatSync(filePath);
  } catch {
    throw new MutationEvidenceError(
      `${label} is required in final mutation evidence.`,
    );
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new MutationEvidenceError(
      `${label} must be a regular non-symlink file.`,
    );
  }
  if ((status.mode & 0o077) !== 0) {
    throw new MutationEvidenceError(
      `${label} must use owner-only 0600 permissions.`,
    );
  }
  if (
    typeof process.getuid === "function" &&
    status.uid !== process.getuid()
  ) {
    throw new MutationEvidenceError(
      `${label} must be owned by the current user.`,
    );
  }
}

function validateStageName(value, label) {
  const name = requireString(value, `${label} name`);
  if (!SAFE_STAGE_NAME_PATTERN.test(name)) {
    throw new MutationEvidenceError(
      `${label} has an invalid stage name.`,
    );
  }
  return name;
}

function requireSchemaVersion(value, label) {
  if (value.schema_version === "1.0.0") {
    throw new MutationEvidenceError(
      `${label} uses legacy mutation run-evidence schema 1.0.0, which lacks independently verifiable raw resource samples; rerun the mutation suite to produce schema ${RUN_EVIDENCE_SCHEMA_VERSION}.`,
    );
  }
  if (value.schema_version !== RUN_EVIDENCE_SCHEMA_VERSION) {
    throw new MutationEvidenceError(
      `${label} has an unsupported schema version.`,
    );
  }
}

function requireMatchingValue(actual, expected, label) {
  if (actual !== expected) {
    throw new MutationEvidenceError(
      `${label} must equal ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}.`,
    );
  }
}

function requireObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new MutationEvidenceError(`${label} must be an object.`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new MutationEvidenceError(`${label} must be an array.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value) {
    throw new MutationEvidenceError(
      `${label} must be a nonempty string.`,
    );
  }
  return value;
}

function requireNonemptyStringArray(value, label) {
  const values = requireArray(value, label);
  if (
    values.length === 0 ||
    values.some(
      (item) => typeof item !== "string" || !item,
    )
  ) {
    throw new MutationEvidenceError(
      `${label} must contain nonempty strings.`,
    );
  }
  return values;
}

function requireNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MutationEvidenceError(
      `${label} must be a nonnegative safe integer.`,
    );
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MutationEvidenceError(
      `${label} must be a positive safe integer.`,
    );
  }
  return value;
}

function requireNullablePositiveInteger(value, label) {
  if (value === null) return null;
  return requirePositiveInteger(value, label);
}

function requireNonnegativeNumber(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new MutationEvidenceError(
      `${label} must be a nonnegative finite number.`,
    );
  }
  return value;
}

function requirePositiveNumber(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new MutationEvidenceError(
      `${label} must be a positive finite number.`,
    );
  }
  return value;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const result = validateMutationEvidenceDirectory(
      parseMutationEvidenceArgs(process.argv.slice(2)),
    );
    console.log(
      `Ticket 065 final evidence passed for run ${result.run_id}: ${result.suite}, ${result.completed_stage_count} completed stage(s), ${result.skipped_stage_count} valid skip(s), exact cleanup verified.`,
    );
  } catch (error) {
    console.error(
      `Mutation evidence check failed: ${
        error instanceof Error
          ? error.message
          : "Unknown validation failure."
      }`,
    );
    process.exitCode = 1;
  }
}
