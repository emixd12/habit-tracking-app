import {
  parseLocustStatsCsv,
} from "./load-test-read-report.mjs";

export const REQUIRED_TIMED_MUTATION_REQUEST_NAMES = Object.freeze([
  "INT-TIMELINE-005 POST /timeline server-action",
  "INT-TIMELINE-006 POST /timeline server-action",
  "INT-TIMELINE-007 POST /timeline server-action",
  "INT-TIMELINE-008 POST /timeline server-action",
  "INT-BEHAVIOR-019 POST /behaviors server-action",
  "INT-BEHAVIOR-020 POST /behaviors server-action",
  "INT-BEHAVIOR-022 POST /behaviors server-action",
  "INT-BEHAVIOR-023 POST /behaviors server-action",
  "INT-SETTINGS-003 POST /settings server-action",
]);

export const STATUS_TRANSITION_REQUEST_NAMES = Object.freeze(
  REQUIRED_TIMED_MUTATION_REQUEST_NAMES.slice(0, 3),
);

export const OPERATOR_REQUEST_NAMES = Object.freeze([
  "SYS-OCCURRENCE-001 POST /api/occurrences/sync operator",
  "SYS-REMINDER-001 POST /api/reminders/process operator",
]);

export const REQUIRED_MUTATION_INTEGRITY_ZERO_FIELDS = Object.freeze([
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

export const DEFAULT_SOAK_THRESHOLDS = Object.freeze({
  maximumRssGrowthBytes: 128 * 1024 * 1024,
  maximumRssGrowthRatio: 0.25,
  maximumFailureRatio: 0.005,
  maximumFailureRatioIncrease: 0.001,
  maximumDatabaseConnectionGrowth: 2,
});

const SOAK_RSS_BASELINE_START_MILLISECONDS = 5 * 60 * 1_000;
const SOAK_RSS_WINDOW_DURATION_MILLISECONDS = 5 * 60 * 1_000;
const SOAK_RSS_MINIMUM_VALID_SAMPLES = 50;
const SOAK_RSS_MAXIMUM_BOUNDARY_OFFSET_MILLISECONDS = 15_000;
const SOAK_RSS_MAXIMUM_SAMPLE_GAP_MILLISECONDS = 15_000;

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const DATE_IDENTIFIER_PATTERN = /\b(?:\d{4}-\d{2}-\d{2}|20\d{6})\b/;
const EMAIL_PATTERN = /\b[^\s/@]+@[^\s/@]+\.[^\s/@]+\b/;
const OWNER_MARKER_PATTERN = /\bcadence-owner-[a-f0-9]{20}\b/i;
const PRIVATE_IDENTIFIER_PATTERN =
  /\b(?:account|owner|user)(?:[_ -]?id)?[:=][^\s]+/i;
const DYNAMIC_QUERY_PATTERN =
  /[?&](?:id|user_id|owner|owner_id|behavior|behavior_id|occurrence|occurrence_id|date|day|local_date)=/i;

/**
 * Parse Locust stats with the Ticket 064 CSV parser, then add the mutation
 * suite's achieved read/write mix. This function performs no file I/O.
 */
export function parseMutationStatsCsv(text) {
  const metrics = parseLocustStatsCsv(text);
  return {
    ...metrics,
    request_mix: summarizeRequestMix(metrics),
  };
}

export function summarizeRequestMix(metrics) {
  const rows = readRequestRows(metrics);
  const totalRequests = rows.reduce((sum, row) => sum + row.requests, 0);
  const readRequests = rows
    .filter((row) => row.method === "GET")
    .reduce((sum, row) => sum + row.requests, 0);
  const mutationRequests = rows
    .filter((row) => row.method === "POST" && !row.name.startsWith("SYS-"))
    .reduce((sum, row) => sum + row.requests, 0);
  const operatorRequests = rows
    .filter((row) => row.method === "POST" && row.name.startsWith("SYS-"))
    .reduce((sum, row) => sum + row.requests, 0);
  const classifiedRequests =
    readRequests + mutationRequests + operatorRequests;
  const otherRequests = totalRequests - classifiedRequests;
  const aggregateRps = readNonnegativeNumber(
    metrics?.requests_per_second,
    "aggregate requests per second",
  );

  const weight = (requests) =>
    totalRequests === 0 ? 0 : (requests / totalRequests) * 100;
  const rps = (requests) =>
    totalRequests === 0 ? 0 : aggregateRps * (requests / totalRequests);

  return {
    total_requests: totalRequests,
    requests_per_second: aggregateRps,
    read: {
      requests: readRequests,
      weight_percent: weight(readRequests),
      requests_per_second: rps(readRequests),
    },
    mutation: {
      requests: mutationRequests,
      weight_percent: weight(mutationRequests),
      requests_per_second: rps(mutationRequests),
    },
    operator: {
      requests: operatorRequests,
      weight_percent: weight(operatorRequests),
      requests_per_second: rps(operatorRequests),
    },
    other: {
      requests: otherRequests,
      weight_percent: weight(otherRequests),
      requests_per_second: rps(otherRequests),
    },
    reads_dominant:
      readRequests > mutationRequests + operatorRequests + otherRequests,
    achieved_by_name: rows.map((row) => ({
      method: row.method,
      name: row.name,
      requests: row.requests,
      failures: row.failures,
      weight_percent: weight(row.requests),
      requests_per_second: row.requests_per_second,
    })),
  };
}

export function evaluateRequestMixGate(metrics) {
  const summary = summarizeRequestMix(metrics);
  const failures = [];

  if (summary.total_requests === 0) {
    failures.push("no timed requests were recorded");
  }
  if (!summary.reads_dominant) {
    failures.push("timed GET reads were not dominant");
  }
  if (summary.mutation.requests === 0) {
    failures.push("no timed user mutation was recorded");
  }
  if (summary.other.requests !== 0) {
    failures.push("one or more timed requests used an unclassified method");
  }

  return gateResult(failures, { summary });
}

/**
 * Derive the exact method/name contracts from interaction-map.json content.
 * The caller owns reading that manifest so this report helper remains pure.
 */
export function buildInteractionRequestContracts(interactionManifest) {
  if (
    !interactionManifest ||
    typeof interactionManifest !== "object" ||
    !Array.isArray(interactionManifest.entries)
  ) {
    throw new Error("The interaction manifest is invalid.");
  }

  const contracts = new Map();
  for (const entry of interactionManifest.entries) {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.requests)) {
      continue;
    }
    for (const request of entry.requests) {
      const name = normalizeStableRequestName(request?.name);
      const method = normalizeMethod(request?.method);
      if (!name || !method) {
        throw new Error("The interaction manifest contains an invalid request.");
      }
      if (contracts.has(name)) {
        throw new Error(`The interaction manifest repeats ${name}.`);
      }
      contracts.set(name, method);
    }
  }

  return contracts;
}

export function normalizeStableRequestName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
}

export function evaluateStableRequestNameGate({
  requestsByName,
  interactionManifest,
  additionalContracts = OPERATOR_REQUEST_NAMES.map((name) => ({
    name,
    method: "POST",
  })),
}) {
  const manifestContracts = buildInteractionRequestContracts(
    interactionManifest,
  );
  const allowed = new Map(manifestContracts);
  for (const contract of additionalContracts) {
    const name = normalizeStableRequestName(contract?.name);
    const method = normalizeMethod(contract?.method);
    if (!name || !method) {
      throw new Error("An additional request-name contract is invalid.");
    }
    allowed.set(name, method);
  }

  const failures = [];
  const invalidNames = [];
  for (const row of readRequestRows({ requests_by_name: requestsByName })) {
    const normalized = normalizeStableRequestName(row.name);
    const expectedMethod = allowed.get(normalized);
    const reasons = [];

    if (normalized !== row.name) reasons.push("not normalized");
    if (!expectedMethod) reasons.push("not declared");
    if (expectedMethod && expectedMethod !== row.method) {
      reasons.push("method does not match its declaration");
    }
    if (
      UUID_PATTERN.test(row.name) ||
      DATE_IDENTIFIER_PATTERN.test(row.name) ||
      EMAIL_PATTERN.test(row.name) ||
      OWNER_MARKER_PATTERN.test(row.name) ||
      PRIVATE_IDENTIFIER_PATTERN.test(row.name) ||
      DYNAMIC_QUERY_PATTERN.test(row.name)
    ) {
      reasons.push("contains a dynamic or private identifier");
    }

    if (reasons.length > 0) {
      invalidNames.push({
        name: row.name,
        reasons,
      });
    }
  }
  if (invalidNames.length > 0) {
    failures.push("one or more request names were unstable or undeclared");
  }

  return gateResult(failures, { invalid_names: invalidNames });
}

export function evaluateTimedMutationCoverage({
  requestsByName,
  requiredNames = REQUIRED_TIMED_MUTATION_REQUEST_NAMES,
  semanticVerifications,
}) {
  const rows = readRequestRows({ requests_by_name: requestsByName });
  const rowsByName = new Map(rows.map((row) => [row.name, row]));
  const missing = [];
  const withoutSuccess = [];
  const unverified = [];
  const covered = [];

  for (const name of requiredNames) {
    const row = rowsByName.get(name);
    if (!row || row.method !== "POST" || row.requests === 0) {
      missing.push(name);
      continue;
    }
    const successfulRequests = row.requests - row.failures;
    if (successfulRequests <= 0) {
      withoutSuccess.push(name);
      continue;
    }
    if (semanticVerifications !== undefined) {
      const verified = semanticVerifications[name];
      if (
        !Number.isInteger(verified) ||
        verified < successfulRequests
      ) {
        unverified.push(name);
        continue;
      }
    }
    covered.push(name);
  }

  const failures = [];
  if (missing.length > 0) failures.push("required timed mutations are missing");
  if (withoutSuccess.length > 0) {
    failures.push("required timed mutations lack a successful request");
  }
  if (unverified.length > 0) {
    failures.push("required timed mutations lack semantic verification");
  }

  return gateResult(failures, {
    required: [...requiredNames],
    covered,
    missing,
    without_success: withoutSuccess,
    unverified,
  });
}

export function evaluateSemanticVerificationGate({
  requestsByName,
  evidence,
  allowedNames = REQUIRED_TIMED_MUTATION_REQUEST_NAMES,
}) {
  const failures = [];
  const allowed = new Set(allowedNames);
  const expectedEvidenceFields = [
    "pending_verifications",
    "schema_version",
    "semantic_verifications",
    "successful_submissions",
  ];
  const actualEvidenceFields =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? Object.keys(evidence).sort()
      : [];
  if (
    actualEvidenceFields.length !== expectedEvidenceFields.length ||
    actualEvidenceFields.some(
      (field, index) => field !== expectedEvidenceFields[index],
    )
  ) {
    failures.push("semantic verification evidence has unexpected fields");
  }
  const records = {
    successful_submissions: readSemanticCountRecord(
      evidence?.successful_submissions,
      "successful submissions",
      failures,
    ),
    semantic_verifications: readSemanticCountRecord(
      evidence?.semantic_verifications,
      "semantic verifications",
      failures,
    ),
    pending_verifications: readSemanticCountRecord(
      evidence?.pending_verifications,
      "pending verifications",
      failures,
    ),
  };
  if (evidence?.schema_version !== "1.0.0") {
    failures.push("semantic verification evidence has an invalid schema");
  }

  const rows = readRequestRows({ requests_by_name: requestsByName });
  const successfulByName = new Map(
    rows
      .filter((row) => row.method === "POST")
      .map((row) => [row.name, row.requests - row.failures]),
  );
  const observedNames = new Set([
    ...successfulByName.keys(),
    ...Object.keys(records.successful_submissions),
    ...Object.keys(records.semantic_verifications),
    ...Object.keys(records.pending_verifications),
  ]);
  const unknownNames = [...observedNames]
    .filter((name) => !allowed.has(name))
    .sort();
  if (unknownNames.length > 0) {
    failures.push("semantic verification evidence used an undeclared POST name");
  }

  const mismatches = [];
  for (const name of [...observedNames].sort()) {
    const successfulRequests = successfulByName.get(name) ?? 0;
    const submissions = records.successful_submissions[name] ?? 0;
    const verifications = records.semantic_verifications[name] ?? 0;
    const pending = records.pending_verifications[name] ?? 0;
    const expectedPending = submissions - verifications;
    const reasons = [];
    if (submissions !== successfulRequests) {
      reasons.push("successful POST count did not match receipts");
    }
    if (verifications !== submissions) {
      reasons.push("not every successful POST had semantic readback");
    }
    if (expectedPending < 0 || pending !== expectedPending) {
      reasons.push("pending receipt count did not reconcile");
    }
    if (reasons.length > 0) {
      mismatches.push({
        name,
        successful_requests: successfulRequests,
        successful_submissions: submissions,
        semantic_verifications: verifications,
        pending_verifications: pending,
        reasons,
      });
    }
  }
  if (mismatches.length > 0) {
    failures.push(
      "successful Server Action POSTs lack one-to-one semantic readback",
    );
  }

  return gateResult(failures, {
    successful_submissions: records.successful_submissions,
    semantic_verifications: records.semantic_verifications,
    pending_verifications: records.pending_verifications,
    mismatches,
    unknown_names: unknownNames,
  });
}

export function evaluateStatusEventCorrelation({
  requestsByName,
  statusEventDelta,
  statusTransitionEvidence,
  requireAppended = false,
}) {
  const rows = readRequestRows({ requests_by_name: requestsByName });
  const successfulTransitions = rows
    .filter((row) => STATUS_TRANSITION_REQUEST_NAMES.includes(row.name))
    .reduce(
      (total, row) => total + Math.max(0, row.requests - row.failures),
      0,
    );
  const failures = [];
  if (
    !Number.isInteger(statusEventDelta) ||
    statusEventDelta < 0
  ) {
    failures.push(
      "status-event mutation delta is missing or invalid",
    );
  } else if (statusEventDelta < successfulTransitions) {
    failures.push(
      "append-only status events do not cover successful status transitions",
    );
  }
  const baselineEventCount =
    statusTransitionEvidence?.baselineEventCount;
  const totalEventCount =
    statusTransitionEvidence?.totalEventCount;
  const appendedEventCount =
    statusTransitionEvidence?.appendedEventCount;
  const eventBackedOccurrenceCount =
    statusTransitionEvidence?.eventBackedOccurrenceCount;
  const snapshotCorrelatedOccurrenceCount =
    statusTransitionEvidence?.snapshotCorrelatedOccurrenceCount;
  if (
    ![
      baselineEventCount,
      totalEventCount,
      appendedEventCount,
      eventBackedOccurrenceCount,
      snapshotCorrelatedOccurrenceCount,
    ].every((value) => Number.isInteger(value) && value >= 0) ||
    totalEventCount - baselineEventCount !== appendedEventCount ||
    appendedEventCount !== statusEventDelta
  ) {
    failures.push(
      "status-transition integrity evidence does not reconcile",
    );
  }
  if (
    snapshotCorrelatedOccurrenceCount !==
    eventBackedOccurrenceCount
  ) {
    failures.push(
      "latest occurrence snapshots do not correlate with status-event chains",
    );
  }
  if (requireAppended && appendedEventCount <= 0) {
    failures.push(
      "the completed mutation suite appended no status event",
    );
  }
  return gateResult(failures, {
    successful_status_transitions: successfulTransitions,
    appended_status_events:
      Number.isInteger(statusEventDelta) && statusEventDelta >= 0
        ? statusEventDelta
        : null,
    transition_evidence: statusTransitionEvidence ?? null,
  });
}

export function evaluateMutationIntegrityGate(summary) {
  const failures = [];

  if (!summary || typeof summary !== "object") {
    return gateResult(["mutation integrity summary is missing"]);
  }
  if (summary.workloadClassification !== "mutation") {
    failures.push("integrity summary is not classified as mutation");
  }
  if (summary.violations !== 0) {
    failures.push("aggregate fixture integrity violations are nonzero");
  }

  const checks = summary.integrityChecks;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    failures.push("mutation integrity checks are missing");
  } else {
    for (const field of REQUIRED_MUTATION_INTEGRITY_ZERO_FIELDS) {
      if (!Object.hasOwn(checks, field)) {
        failures.push(`integrityChecks.${field} is missing`);
      }
    }
    for (const [field, value] of Object.entries(checks)) {
      if (!Number.isInteger(value) || value < 0) {
        failures.push(`integrityChecks.${field} is not a nonnegative integer`);
      } else if (value !== 0) {
        failures.push(`integrityChecks.${field} is nonzero`);
      }
    }
  }

  if (summary.activePushSubscriptions !== 0) {
    failures.push("active Web Push subscriptions are nonzero");
  }
  validateCountRecord(summary.rowCounts, "rowCounts", failures);
  validateCountRecord(
    summary.reminderStatuses,
    "reminderStatuses",
    failures,
    ["pending", "processing", "sent", "failed", "cancelled"],
  );
  validateCountRecord(
    summary.duePastReminderNonReactivation,
    "duePastReminderNonReactivation",
    failures,
    [
      "tracked_occurrences",
      "tracked_deliveries",
      "exercised_occurrences",
      "clear_events",
      "unresolved_occurrences",
      "cancelled_deliveries",
      "reactivated_deliveries",
    ],
  );
  validateIntegerRecord(summary.mutationDeltas, "mutationDeltas", failures, {
    required: [
      "behaviors",
      "schedules",
      "slots",
      "occurrences",
      "statusEvents",
      "definitionEvents",
      "reminders",
    ],
  });

  if (
    summary.databaseConnectionCount !== null &&
    (!Number.isInteger(summary.databaseConnectionCount) ||
      summary.databaseConnectionCount < 0)
  ) {
    failures.push(
      "databaseConnectionCount must be null or a nonnegative integer",
    );
  }

  return gateResult([...new Set(failures)]);
}

export function evaluateDuePastReminderNonReactivation({
  evidence,
  requireExercised = true,
}) {
  const failures = [];
  validateCountRecord(
    evidence,
    "due/past reminder evidence",
    failures,
    [
      "tracked_occurrences",
      "tracked_deliveries",
      "exercised_occurrences",
      "clear_events",
      "unresolved_occurrences",
      "cancelled_deliveries",
      "reactivated_deliveries",
    ],
  );
  if (failures.length > 0) return gateResult(failures);

  if (
    evidence.tracked_occurrences <= 0 ||
    evidence.tracked_deliveries !== evidence.tracked_occurrences
  ) {
    failures.push(
      "dedicated due/past reminder fixture counts do not reconcile",
    );
  }
  if (
    evidence.exercised_occurrences >
      evidence.tracked_occurrences ||
    evidence.clear_events < evidence.exercised_occurrences ||
    (evidence.clear_events === 0) !==
      (evidence.exercised_occurrences === 0)
  ) {
    failures.push(
      "due/past clear events do not reconcile with unique exercised occurrences",
    );
  }
  if (
    evidence.unresolved_occurrences !==
    evidence.tracked_occurrences
  ) {
    failures.push(
      "dedicated due/past selector occurrences did not remain Unresolved",
    );
  }
  if (
    evidence.cancelled_deliveries !==
    evidence.exercised_occurrences
  ) {
    failures.push(
      "cancelled due/past deliveries do not match unique exercised occurrences",
    );
  }
  if (
    evidence.reactivated_deliveries !== 0
  ) {
    failures.push("one or more due/past reminders reactivated");
  }
  if (
    requireExercised &&
    evidence.exercised_occurrences <= 0
  ) {
    failures.push(
      "the dedicated resolved-to-Unresolved due/past reminder path was not exercised",
    );
  }
  return gateResult(failures, {
    evidence,
    exercised: evidence.exercised_occurrences > 0,
  });
}

export function evaluateSoakNoGrowthGate({
  resourceSamples,
  declaredDurationSeconds,
  firstResource,
  finalResource,
  failureHalves,
  thresholds = {},
}) {
  const limits = normalizeSoakThresholds(thresholds);
  const failures = [];
  const rssWindows = evaluateSoakRssWindows({
    resourceSamples,
    declaredDurationSeconds,
    failures,
  });

  const firstHalf = readFailureHalf(
    failureHalves?.first,
    "first failure half",
    failures,
  );
  const secondHalf = readFailureHalf(
    failureHalves?.second,
    "second failure half",
    failures,
  );

  let rssGrowthBytes = null;
  let rssGrowthRatio = null;
  let allowedRssGrowthBytes = null;
  const baselineMedian = rssWindows.baseline.median_bytes;
  const terminalMedian = rssWindows.terminal.median_bytes;
  if (baselineMedian !== null && terminalMedian !== null) {
    rssGrowthBytes = terminalMedian - baselineMedian;
    rssGrowthRatio = rssGrowthBytes / baselineMedian;
    allowedRssGrowthBytes = Math.max(
      limits.maximumRssGrowthBytes,
      baselineMedian * limits.maximumRssGrowthRatio,
    );
    if (rssGrowthBytes > allowedRssGrowthBytes) {
      failures.push("RSS growth exceeded the bounded soak allowance");
    }
  }

  if (firstHalf && secondHalf) {
    if (secondHalf.ratio > limits.maximumFailureRatio) {
      failures.push("second-half failure ratio exceeded its ceiling");
    }
    if (
      secondHalf.ratio >
      firstHalf.ratio + limits.maximumFailureRatioIncrease
    ) {
      failures.push("failure ratio grew beyond the first-half allowance");
    }
  }

  const firstConnections = readOptionalDatabaseConnections(
    firstResource?.databaseConnections,
    "first database connections",
    failures,
  );
  const finalConnections = readOptionalDatabaseConnections(
    finalResource?.databaseConnections,
    "final database connections",
    failures,
  );
  let databaseConnectionGrowth = null;
  if (firstConnections === null || finalConnections === null) {
    failures.push(
      "first and final database connection samples are required",
    );
  } else {
    databaseConnectionGrowth = finalConnections - firstConnections;
    if (
      databaseConnectionGrowth >
      limits.maximumDatabaseConnectionGrowth
    ) {
      failures.push(
        "database connection growth exceeded the bounded soak allowance",
      );
    }
  }

  return gateResult([...new Set(failures)], {
    evidence: {
      rss: {
        sampling_contract: {
          baseline_start_elapsed_milliseconds:
            SOAK_RSS_BASELINE_START_MILLISECONDS,
          window_duration_milliseconds:
            SOAK_RSS_WINDOW_DURATION_MILLISECONDS,
          minimum_valid_samples:
            SOAK_RSS_MINIMUM_VALID_SAMPLES,
          maximum_boundary_offset_milliseconds:
            SOAK_RSS_MAXIMUM_BOUNDARY_OFFSET_MILLISECONDS,
          maximum_sample_gap_milliseconds:
            SOAK_RSS_MAXIMUM_SAMPLE_GAP_MILLISECONDS,
        },
        baseline_window: rssWindows.baseline,
        terminal_window: rssWindows.terminal,
        growth_bytes: rssGrowthBytes,
        growth_ratio: rssGrowthRatio,
        allowed_growth_bytes: allowedRssGrowthBytes,
      },
      failures: {
        first_half: firstHalf,
        second_half: secondHalf,
      },
      database_connections: {
        first: firstConnections,
        final: finalConnections,
        growth: databaseConnectionGrowth,
      },
    },
    thresholds: limits,
  });
}

export function selectHighestSustainableLocalPlateau({
  targetClassification,
  plateaus,
}) {
  if (targetClassification !== "local") {
    throw new Error(
      "Sustainable mutation capacity may be selected only from local evidence.",
    );
  }
  if (!Array.isArray(plateaus) || plateaus.length === 0) {
    throw new Error("At least one local plateau is required.");
  }

  const candidates = plateaus.map((plateau) => {
    const users = readPositiveInteger(plateau?.users, "plateau users");
    const requestsPerSecond = readNonnegativeNumber(
      plateau?.metrics?.requests_per_second ??
        plateau?.requests_per_second,
      "plateau requests per second",
    );
    if (typeof plateau?.passed !== "boolean") {
      throw new Error("Each local plateau requires an explicit pass result.");
    }
    return {
      stage: String(plateau.stage ?? ""),
      users,
      requests_per_second: requestsPerSecond,
      passed: plateau.passed,
    };
  });
  const passing = candidates
    .filter((plateau) => plateau.passed)
    .sort(
      (left, right) =>
        right.users - left.users ||
        right.requests_per_second - left.requests_per_second,
    );
  if (passing.length === 0) {
    throw new Error("No local mutation plateau passed its nominal gates.");
  }

  return {
    target_classification: "local",
    production_capacity: false,
    capacity_label: "highest sustainable local plateau (not production)",
    highest_sustainable_local_users: passing[0].users,
    achieved_requests_per_second: passing[0].requests_per_second,
    stage: passing[0].stage,
    evaluated_plateaus: candidates.length,
    passing_plateaus: passing.length,
  };
}

export function evaluateOperatorProviderReconciliation({
  operatorRequests,
  occurrenceSyncResults,
  reminderProcessResults,
  reminderReplayResult,
  fakeProvider,
  finalDeliveryDelta,
  activePushSubscriptions,
  maximumOperatorRequests = 5_000,
}) {
  const failures = [];
  const rows = readRequestRows({ requests_by_name: operatorRequests });
  const rowsByName = new Map(rows.map((row) => [row.name, row]));
  const occurrenceRow = rowsByName.get(OPERATOR_REQUEST_NAMES[0]);
  const reminderRow = rowsByName.get(OPERATOR_REQUEST_NAMES[1]);
  const totalOperatorRequests = rows.reduce(
    (sum, row) => sum + row.requests,
    0,
  );

  if (!occurrenceRow || occurrenceRow.requests - occurrenceRow.failures <= 0) {
    failures.push("successful occurrence-sync operator evidence is missing");
  }
  if (!reminderRow || reminderRow.requests - reminderRow.failures <= 0) {
    failures.push("successful reminder-process operator evidence is missing");
  }
  if (
    !Number.isInteger(maximumOperatorRequests) ||
    maximumOperatorRequests <= 0 ||
    totalOperatorRequests > maximumOperatorRequests
  ) {
    failures.push("operator request evidence exceeds its declared bound");
  }

  if (
    !Array.isArray(occurrenceSyncResults) ||
    occurrenceSyncResults.length === 0
  ) {
    failures.push("occurrence-sync aggregate results are missing");
  } else {
    let syncedTotal = 0;
    occurrenceSyncResults.forEach((result, index) => {
      if (!occurrenceSyncResultReconciles(result)) {
        failures.push(
          `occurrence-sync aggregate result ${index + 1} does not reconcile`,
        );
      } else {
        syncedTotal += result.synced;
      }
    });
    if (syncedTotal === 0) {
      failures.push(
        "occurrence-sync operator evidence contains no successful repair",
      );
    }
  }
  if (
    !Array.isArray(reminderProcessResults) ||
    reminderProcessResults.length === 0
  ) {
    failures.push("reminder-process aggregate results are missing");
  }

  const processTotals = {
    sent: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const [index, result] of (reminderProcessResults ?? []).entries()) {
    if (!reminderProcessResultReconciles(result)) {
      failures.push(
        `reminder-process aggregate result ${index + 1} does not reconcile`,
      );
      continue;
    }
    processTotals.sent += result.sent;
    processTotals.failed += result.failed;
    processTotals.cancelled += result.cancelled;
  }
  if (
    !reminderProcessResultReconciles(reminderReplayResult) ||
    reminderReplayResult?.claimed !== 0 ||
    reminderReplayResult?.sent !== 0
  ) {
    failures.push("reminder replay was not idempotent");
  }

  const accepted = readEvidenceCounter(
    fakeProvider?.accepted,
    "fake-provider accepted",
    failures,
  );
  const total = readEvidenceCounter(
    fakeProvider?.requests_total,
    "fake-provider requests",
    failures,
  );
  const unique = readEvidenceCounter(
    fakeProvider?.unique_delivery_fingerprints,
    "fake-provider fingerprints",
    failures,
  );
  const rejected = readEvidenceCounter(
    fakeProvider?.rejected,
    "fake-provider rejected",
    failures,
  );
  const duplicateAttempts = readEvidenceCounter(
    fakeProvider?.duplicate_send_attempts,
    "fake-provider duplicate attempts",
    failures,
  );
  const webPushAttempts = readEvidenceCounter(
    fakeProvider?.web_push_attempts,
    "fake-provider Web Push attempts",
    failures,
  );
  if (
    fakeProvider?.target_classification !== "local" ||
    fakeProvider?.provider !== "fake_sequenzy"
  ) {
    failures.push("provider evidence is not from the local fake provider");
  }
  if (
    accepted === 0 ||
    total !== accepted ||
    unique !== accepted ||
    rejected !== 0 ||
    duplicateAttempts !== 0 ||
    webPushAttempts !== 0
  ) {
    failures.push("fake-provider evidence does not reconcile");
  }
  if (processTotals.sent !== accepted) {
    failures.push("processed sends do not equal accepted fake-provider sends");
  }

  if (
    !isCountRecord(finalDeliveryDelta, [
      "sent",
      "failed",
      "cancelled",
      "processing",
      "duplicateKeys",
    ]) ||
    finalDeliveryDelta.sent !== accepted ||
    finalDeliveryDelta.failed !== processTotals.failed ||
    finalDeliveryDelta.cancelled < processTotals.cancelled ||
    finalDeliveryDelta.processing !== 0 ||
    finalDeliveryDelta.duplicateKeys !== 0
  ) {
    failures.push("final reminder-delivery evidence does not reconcile");
  }
  if (activePushSubscriptions !== 0) {
    failures.push("active Web Push subscriptions are nonzero");
  }

  return gateResult([...new Set(failures)], {
    evidence: {
      operator_requests: totalOperatorRequests,
      fake_provider_accepted: accepted,
      reminder_process_totals: processTotals,
    },
  });
}

export function evaluateOperatorIsolationAndCausalRepair({
  operatorRequestCount,
  isolationChecks,
  isolationSummary,
  preparedAccounts,
  verifiedFreshAccounts,
  causalRepairProofs,
}) {
  const failures = [];
  const counts = {
    operatorRequestCount,
    isolationChecks,
    preparedAccounts,
    verifiedFreshAccounts,
    causalRepairProofs,
  };
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value < 0) {
      failures.push(`${name} is not a nonnegative integer`);
    }
  }
  if (failures.length === 0) {
    if (
      operatorRequestCount <= 0 ||
      isolationChecks < operatorRequestCount + 2
    ) {
      failures.push(
        "operator isolation was not checked before every protected call and preflight mutation",
      );
    }
    if (
      preparedAccounts <= 0 ||
      verifiedFreshAccounts !== preparedAccounts ||
      causalRepairProofs <= 0
    ) {
      failures.push(
        "the exact prepared occurrence-sync account lacks a stale-to-fresh causal proof",
      );
    }
  }
  if (
    !isolationSummary ||
    !Number.isInteger(isolationSummary.expected_accounts) ||
    isolationSummary.expected_accounts <= 0 ||
    isolationSummary.auth_accounts !==
      isolationSummary.expected_accounts ||
    isolationSummary.profile_accounts !==
      isolationSummary.expected_accounts ||
    isolationSummary.occurrence_sync_owners !==
      isolationSummary.expected_accounts ||
    !Number.isInteger(isolationSummary.reminder_delivery_owners) ||
    isolationSummary.reminder_delivery_owners < 0
  ) {
    failures.push(
      "the final operator isolation summary does not reconcile to the exact run",
    );
  }

  return gateResult([...new Set(failures)], {
    evidence: {
      operator_requests: operatorRequestCount,
      isolation_checks: isolationChecks,
      isolated_accounts:
        isolationSummary?.expected_accounts ?? 0,
      prepared_occurrence_sync_accounts: preparedAccounts,
      verified_fresh_occurrence_sync_accounts:
        verifiedFreshAccounts,
      causal_occurrence_repair_proofs: causalRepairProofs,
    },
  });
}

export function evaluateTimezoneDynamicOccurrencePreservation(evidence) {
  const failures = [];
  validateCountRecord(
    evidence,
    "timezone occurrence preservation evidence",
    failures,
    [
      "captured_occurrences",
      "verified_occurrences",
      "violations",
    ],
  );
  if (failures.length === 0) {
    if (evidence.captured_occurrences <= 0) {
      failures.push(
        "the dynamic pre-timezone snapshot is empty",
      );
    }
    if (
      evidence.verified_occurrences !==
        evidence.captured_occurrences ||
      evidence.violations !== 0
    ) {
      failures.push(
        "the dynamic pre-timezone occurrence snapshot was not preserved exactly",
      );
    }
  }
  return gateResult(failures, { evidence });
}

function readRequestRows(metrics) {
  if (!Array.isArray(metrics?.requests_by_name)) {
    throw new Error("Locust request rows are missing.");
  }
  return metrics.requests_by_name.map((row) => {
    const method = normalizeMethod(row?.method);
    const name = typeof row?.name === "string" ? row.name : "";
    if (!method || !name) {
      throw new Error("A Locust request row has an invalid method or name.");
    }
    const requests = readNonnegativeInteger(
      row.requests,
      `${name} requests`,
    );
    const failures = readNonnegativeInteger(
      row.failures,
      `${name} failures`,
    );
    if (failures > requests) {
      throw new Error(`${name} failures cannot exceed its request count.`);
    }
    return {
      ...row,
      method,
      name,
      requests,
      failures,
      requests_per_second: readNonnegativeNumber(
        row.requests_per_second ?? 0,
        `${name} requests per second`,
      ),
    };
  });
}

function normalizeMethod(value) {
  if (typeof value !== "string") return "";
  const method = value.trim().toUpperCase();
  return /^[A-Z]+$/.test(method) ? method : "";
}

function validateCountRecord(value, label, failures, required = []) {
  validateIntegerRecord(value, label, failures, {
    required,
    nonnegative: true,
  });
}

function validateIntegerRecord(
  value,
  label,
  failures,
  { required = [], nonnegative = false } = {},
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label} is missing`);
    return;
  }
  for (const field of required) {
    if (!Object.hasOwn(value, field)) {
      failures.push(`${label}.${field} is missing`);
    }
  }
  for (const [field, count] of Object.entries(value)) {
    if (
      !Number.isInteger(count) ||
      (nonnegative && count < 0)
    ) {
      failures.push(`${label}.${field} is not a valid integer`);
    }
  }
}

function evaluateSoakRssWindows({
  resourceSamples,
  declaredDurationSeconds,
  failures,
}) {
  const durationMilliseconds =
    Number.isSafeInteger(declaredDurationSeconds) &&
    declaredDurationSeconds >= 15 * 60
      ? declaredDurationSeconds * 1_000
      : null;
  if (durationMilliseconds === null) {
    failures.push(
      "declared soak duration must provide distinct RSS evidence windows",
    );
  }

  const samples = readSoakResourceSamples(resourceSamples, failures);
  const baselineStart = SOAK_RSS_BASELINE_START_MILLISECONDS;
  const baselineEnd =
    baselineStart + SOAK_RSS_WINDOW_DURATION_MILLISECONDS;
  const terminalEnd = durationMilliseconds;
  const terminalStart =
    durationMilliseconds === null
      ? null
      : durationMilliseconds -
        SOAK_RSS_WINDOW_DURATION_MILLISECONDS;

  return {
    baseline: evaluateSoakRssWindow({
      samples,
      label: "baseline RSS window",
      startMilliseconds: baselineStart,
      endMilliseconds: baselineEnd,
      failures,
    }),
    terminal: evaluateSoakRssWindow({
      samples,
      label: "terminal RSS window",
      startMilliseconds: terminalStart,
      endMilliseconds: terminalEnd,
      failures,
    }),
  };
}

function readSoakResourceSamples(resourceSamples, failures) {
  if (!Array.isArray(resourceSamples)) {
    failures.push("raw soak resource samples are required");
    return [];
  }

  const samples = [];
  let previousElapsed = Number.NEGATIVE_INFINITY;
  for (const [index, sample] of resourceSamples.entries()) {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      failures.push(`resource sample ${index} is invalid`);
      continue;
    }
    const elapsed = sample.elapsed_milliseconds;
    if (
      typeof elapsed !== "number" ||
      !Number.isFinite(elapsed) ||
      elapsed < 0
    ) {
      failures.push(
        `resource sample ${index} elapsed milliseconds is invalid`,
      );
      continue;
    }
    if (elapsed <= previousElapsed) {
      failures.push(
        "resource sample elapsed milliseconds must be strictly increasing",
      );
    }
    previousElapsed = elapsed;
    samples.push({
      elapsed_milliseconds: elapsed,
      app_rss_bytes: sample.app_rss_bytes,
    });
  }
  return samples;
}

function evaluateSoakRssWindow({
  samples,
  label,
  startMilliseconds,
  endMilliseconds,
  failures,
}) {
  const evidence = {
    start_elapsed_milliseconds: startMilliseconds,
    end_elapsed_milliseconds: endMilliseconds,
    minimum_valid_samples: SOAK_RSS_MINIMUM_VALID_SAMPLES,
    valid_sample_count: 0,
    invalid_sample_count: 0,
    first_elapsed_milliseconds: null,
    last_elapsed_milliseconds: null,
    maximum_gap_milliseconds: null,
    median_bytes: null,
  };
  if (
    typeof startMilliseconds !== "number" ||
    typeof endMilliseconds !== "number" ||
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(endMilliseconds) ||
    startMilliseconds < 0 ||
    endMilliseconds <= startMilliseconds
  ) {
    failures.push(`${label} bounds are invalid`);
    return evidence;
  }

  const windowSamples = samples.filter(
    (sample) =>
      sample.elapsed_milliseconds >= startMilliseconds &&
      sample.elapsed_milliseconds < endMilliseconds,
  );
  const validSamples = [];
  for (const sample of windowSamples) {
    if (
      Number.isSafeInteger(sample.app_rss_bytes) &&
      sample.app_rss_bytes > 0
    ) {
      validSamples.push(sample);
    } else {
      evidence.invalid_sample_count += 1;
    }
  }
  evidence.valid_sample_count = validSamples.length;

  if (evidence.invalid_sample_count > 0) {
    failures.push(`${label} contains invalid app RSS samples`);
  }
  if (validSamples.length < SOAK_RSS_MINIMUM_VALID_SAMPLES) {
    failures.push(`${label} lacks the required valid sample count`);
  }
  if (validSamples.length === 0) return evidence;

  const firstElapsed = validSamples[0].elapsed_milliseconds;
  const lastElapsed =
    validSamples[validSamples.length - 1].elapsed_milliseconds;
  evidence.first_elapsed_milliseconds = firstElapsed;
  evidence.last_elapsed_milliseconds = lastElapsed;

  if (
    firstElapsed - startMilliseconds >
    SOAK_RSS_MAXIMUM_BOUNDARY_OFFSET_MILLISECONDS
  ) {
    failures.push(`${label} starts too far after its declared bound`);
  }
  if (
    endMilliseconds - lastElapsed >
    SOAK_RSS_MAXIMUM_BOUNDARY_OFFSET_MILLISECONDS
  ) {
    failures.push(`${label} ends too far before its declared bound`);
  }

  let maximumGap = 0;
  for (let index = 1; index < validSamples.length; index += 1) {
    maximumGap = Math.max(
      maximumGap,
      validSamples[index].elapsed_milliseconds -
        validSamples[index - 1].elapsed_milliseconds,
    );
  }
  evidence.maximum_gap_milliseconds = maximumGap;
  if (maximumGap > SOAK_RSS_MAXIMUM_SAMPLE_GAP_MILLISECONDS) {
    failures.push(`${label} contains an excessive sampling gap`);
  }
  evidence.median_bytes = median(
    validSamples.map((sample) => sample.app_rss_bytes),
  );
  return evidence;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? sorted[middle - 1] +
        (sorted[middle] - sorted[middle - 1]) / 2
    : sorted[middle];
}

function normalizeSoakThresholds(thresholds) {
  const merged = {
    ...DEFAULT_SOAK_THRESHOLDS,
    ...thresholds,
  };
  for (const field of [
    "maximumRssGrowthBytes",
    "maximumRssGrowthRatio",
    "maximumFailureRatio",
    "maximumFailureRatioIncrease",
    "maximumDatabaseConnectionGrowth",
  ]) {
    readNonnegativeNumber(merged[field], `soak threshold ${field}`);
  }
  return merged;
}

function readFailureHalf(value, label, failures) {
  if (!value || typeof value !== "object") {
    failures.push(`${label} is missing`);
    return null;
  }
  const requests = value.requests;
  const failuresCount = value.failures;
  if (
    !Number.isInteger(requests) ||
    requests <= 0 ||
    !Number.isInteger(failuresCount) ||
    failuresCount < 0 ||
    failuresCount > requests
  ) {
    failures.push(`${label} has invalid request counts`);
    return null;
  }
  return {
    requests,
    failures: failuresCount,
    ratio: failuresCount / requests,
  };
}

function readOptionalDatabaseConnections(value, label, failures) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    failures.push(`${label} is invalid`);
    return null;
  }
  return value;
}

function readEvidenceCounter(value, label, failures) {
  if (!Number.isInteger(value) || value < 0) {
    failures.push(`${label} is invalid`);
    return Number.NaN;
  }
  return value;
}

function readSemanticCountRecord(value, label, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label} are missing`);
    return {};
  }
  const output = {};
  for (const [name, count] of Object.entries(value)) {
    if (
      typeof name !== "string" ||
      !name ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      failures.push(`${label} contain an invalid name or count`);
      continue;
    }
    output[name] = count;
  }
  return output;
}

function occurrenceSyncResultReconciles(result) {
  return (
    isCountRecord(result, ["checked", "synced", "skipped", "failed"]) &&
    result.synced + result.skipped + result.failed === result.checked
  );
}

function reminderProcessResultReconciles(result) {
  return (
    isCountRecord(result, [
      "checked",
      "claimed",
      "skipped",
      "sent",
      "failed",
      "cancelled",
    ]) &&
    result.claimed + result.skipped === result.checked &&
    result.sent + result.failed + result.cancelled === result.claimed
  );
}

function isCountRecord(value, fields) {
  return (
    value &&
    typeof value === "object" &&
    fields.every(
      (field) => Number.isInteger(value[field]) && value[field] >= 0,
    )
  );
}

function readPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function readNonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }
  return value;
}

function readNonnegativeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative finite number.`);
  }
  return value;
}

function gateResult(failures, evidence = {}) {
  return {
    passed: failures.length === 0,
    failures,
    ...evidence,
  };
}
