import { randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  cpus,
  homedir,
  platform,
  release,
  totalmem,
} from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Temporal } from "@js-temporal/polyfill";

import {
  assertLoadRunOperatorIsolation,
  captureLoadRunTimezoneOccurrenceSnapshot,
  cleanupLoadRun,
  markLoadRunOccurrenceSyncStale,
  provisionLoadRun,
  refreshLoadRunSessions,
  validateLoadRunId,
  verifyPreparedLoadRunOccurrenceSyncFresh,
  verifyLoadRunTimezoneOccurrenceSnapshot,
  verifyLoadRunIntegrity,
} from "./load-test-fixtures.mjs";
import {
  assertFakeSequenzyRunEvidence,
  startFakeSequenzyServer,
} from "./load-test-fake-sequenzy.mjs";
import {
  countCsvDataRows,
  countUnexpected5xxFailures,
  evaluateRecoveryGate,
  evaluateStageGates,
  parseCsv,
  parseLocustPeakUsers,
  parseLocustStatsCsv,
  sanitizeLoadOutput,
  summarizeArtifactDigest,
} from "./load-test-read-report.mjs";
import {
  OPERATOR_REQUEST_NAMES,
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
  selectHighestSustainableLocalPlateau,
  summarizeRequestMix,
} from "./load-test-mutation-report.mjs";
import {
  DEFAULT_LOCAL_RESOURCE_CEILINGS,
  assertLocalPortAvailable,
  assertLocalRuntimeDependencies,
  buildPrivatePathReplacements,
  childExit,
  locustWorkerEnvironment,
  privateOutputReplacements,
  readExplicitLocalSupabaseConfig,
  readLocalDatabaseConnectionCount,
  runSanitizedChild,
  safeLoadEnvironment,
  sanitizeLocustStageArtifacts,
  startLocalResourceMonitor,
  startSanitizedChild,
  stopChild,
} from "./load-test-local-runtime.mjs";
import { installCooperativeSignalController } from "./cooperative-signal-controller.mjs";

const root = process.cwd();
const baseUrl = "http://127.0.0.1:3100";
const runsRoot = path.join(root, "load-tests", ".runs");
const locustExecutable = path.join(
  root,
  "load-tests",
  ".venv",
  "bin",
  "locust",
);
const pythonExecutable = path.join(
  root,
  "load-tests",
  ".venv",
  "bin",
  "python",
);
const nextExecutable = path.join(root, "node_modules", ".bin", "next");
const locustFile = path.join(root, "load-tests", "mutation_locustfile.py");
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
const DEFAULT_TIMEZONE = "America/New_York";
const FIXTURE_MODE = "mutation";
const FAKE_TEMPLATE_SLUG = "cadence-load-habit-reminder";
const LOCUST_REQUEST_FAILURE_EXIT_CODE = 0;
const OPERATOR_INTERVAL_MILLISECONDS = 20_000;
const MUTATION_CALIBRATION_STAGE = "mixed-calibration-1";
const MUTATION_RUN_EVIDENCE_SCHEMA_VERSION = "1.1.0";
const MUTATION_CALIBRATION_GROUP = "mixed_calibration";
const COMPARABLE_MIXED_GROUPS = new Set([
  "mixed_baseline",
  "ramp",
  "spike",
  "soak",
  "breakpoint",
  "operator_overlap",
]);
const READ_GATE_LATENCY_FAILURE =
  "p95 exceeded 2x the one-user warm baseline";
const MUTATION_GATE_LATENCY_FAILURE =
  "p95 exceeded 2x the calibrated representative mixed warm baseline";
const SPIKE_RECOVERY_COMPARISON_GATE =
  "spike-recovery-comparison";
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
const BLANK_APP_ENV = Object.freeze({
  SUPABASE_SECRET_KEY: "",
  AGENTMAIL_API_KEY: "",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
});
const OPERATOR_REQUESTS = Object.freeze({
  occurrence_sync: Object.freeze({
    name: "SYS-OCCURRENCE-001 POST /api/occurrences/sync operator",
    path: "/api/occurrences/sync?limit=100",
    fields: ["checked", "synced", "skipped", "failed"],
  }),
  reminder_process: Object.freeze({
    name: "SYS-REMINDER-001 POST /api/reminders/process operator",
    path: "/api/reminders/process?limit=100",
    fields: [
      "checked",
      "claimed",
      "skipped",
      "sent",
      "failed",
      "cancelled",
    ],
  }),
});

let appProcess = null;
let locustProcess = null;
let interrupted = false;
const lifecycleAbortController = new AbortController();
const activeChildren = new Set();

export function createMutationLoadRunId(now = new Date()) {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z")
    .replace("T", "t");
  return validateLoadRunId(
    `${timestamp}-${randomBytes(6).toString("hex")}`,
  );
}

export function buildMutationSuitePlan(suite) {
  if (!SUPPORTED_SUITES.has(suite)) {
    throw new Error(
      "Mutation-load suite must be smoke, baseline, ramp, spike, soak, breakpoint, timezone, contention, operator, or full.",
    );
  }
  const manifest = readMutationManifest();
  const groups = buildStageGroups(manifest);
  const selectedGroups =
    suite === "full"
      ? [
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
        ]
      : {
          smoke: ["smoke"],
          baseline: ["mixed_calibration", "mixed_baseline"],
          ramp: ["mixed_calibration", "ramp"],
          spike: ["mixed_calibration", "spike"],
          soak: ["mixed_calibration", "ramp", "soak"],
          breakpoint: ["mixed_calibration", "breakpoint"],
          timezone: ["timezone_changed"],
          contention: ["contention"],
          operator: ["mixed_calibration", "operator_overlap"],
        }[suite];
  const stages = selectedGroups.flatMap((name) => groups[name]);
  const totalDurationSeconds = stages.reduce(
    (total, stageDefinition) =>
      total + stageDefinition.durationSeconds,
    0,
  );
  if (
    totalDurationSeconds >
    manifest.ceilings.maximum_suite_runtime_seconds
  ) {
    throw new Error(
      "The selected mutation suite exceeds its declared runtime ceiling.",
    );
  }
  const activeAccountCount = Math.max(
    1,
    ...stages.map((stageDefinition) =>
      stageDefinition.workload === "contention"
        ? 1
        : stageDefinition.users,
    ),
  );
  const operatorSpareAccountCount = stages.some(
    (stageDefinition) => stageDefinition.operatorOverlap,
  )
    ? Math.max(
        ...stages
          .filter((stageDefinition) => stageDefinition.operatorOverlap)
          .map((stageDefinition) => stageDefinition.users + 1),
      )
    : 1;
  const accountCount = Math.max(
    activeAccountCount,
    operatorSpareAccountCount,
  );
  const positionedStages = stages.map((stageDefinition) => ({
    ...stageDefinition,
    identityOffset:
      stageDefinition.group === "timezone_changed"
        ? accountCount - stageDefinition.users
        : 0,
  }));
  const cumulativeRequestCeiling = deriveCumulativeSuiteRequestCeiling({
    stages: positionedStages,
    ceilings: manifest.ceilings,
  });

  return {
    suite,
    fixtureMode: FIXTURE_MODE,
    accountCount,
    heavyCount: 0,
    stages: positionedStages,
    totalDurationSeconds,
    taskWeights: manifest.task_weights,
    readTaskKeys: manifest.read_task_keys,
    thinkTimeSeconds: manifest.think_time_seconds,
    ceilings: manifest.ceilings,
    cumulativeRequestCeiling,
  };
}

export function deriveCumulativeSuiteRequestCeiling({
  stages,
  ceilings,
}) {
  if (
    !Array.isArray(stages) ||
    stages.length === 0 ||
    !Number.isInteger(ceilings?.maximum_requests) ||
    ceilings.maximum_requests <= 0
  ) {
    throw new Error(
      "The mutation suite cannot derive a cumulative request ceiling.",
    );
  }
  const cumulativeRequestCeiling =
    ceilings.maximum_requests * stages.length;
  if (!Number.isSafeInteger(cumulativeRequestCeiling)) {
    throw new Error(
      "The mutation suite cumulative request ceiling is unsafe.",
    );
  }
  return cumulativeRequestCeiling;
}

export function summarizeCumulativeRequestUsage({
  stageResults,
  operatorRequestCount = 0,
  ceiling,
}) {
  if (
    !Array.isArray(stageResults) ||
    !Number.isInteger(operatorRequestCount) ||
    operatorRequestCount < 0 ||
    !Number.isSafeInteger(ceiling) ||
    ceiling <= 0
  ) {
    throw new Error(
      "The cumulative mutation request evidence is invalid.",
    );
  }
  const locustRequests = stageResults.reduce(
    (total, result) => {
      const requests = result?.metrics?.requests;
      if (
        !Number.isInteger(requests) ||
        requests < 0 ||
        !Number.isSafeInteger(total + requests)
      ) {
        throw new Error(
          "A mutation stage has an invalid aggregate request count.",
        );
      }
      return total + requests;
    },
    0,
  );
  const totalRequests = locustRequests + operatorRequestCount;
  if (!Number.isSafeInteger(totalRequests)) {
    throw new Error(
      "The cumulative mutation request count is unsafe.",
    );
  }
  return {
    locust_requests: locustRequests,
    operator_requests: operatorRequestCount,
    total_requests: totalRequests,
    ceiling,
    reached: totalRequests >= ceiling,
  };
}

function buildStageGroups(manifest) {
  const names = {
    smoke: ["smoke-1"],
    mixed_calibration: [MUTATION_CALIBRATION_STAGE],
    mixed_baseline: ["mixed-baseline-5", "mixed-baseline-10"],
    ramp: ["ramp-10", "ramp-25", "ramp-50", "ramp-100"],
    spike: ["spike-baseline-10", "spike-hold-100", "spike-recovery-10"],
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
  };
  return Object.fromEntries(
    Object.entries(names).map(([profileName, stageNames]) => {
      const profile = manifest.profiles[profileName];
      const shape = manifest.shapes[profile.shape];
      if (!profile || !shape || shape.stages.length !== stageNames.length) {
        throw new Error(
          "The mutation profile manifest does not match the supervised stage inventory.",
        );
      }
      return [
        profileName,
        shape.stages.map((rawStage, index) => ({
          name: stageNames[index],
          group: profileName,
          profile: profileName,
          workload: profile.workload,
          users: rawStage.users,
          spawnRate: rawStage.spawn_rate,
          durationSeconds: rawStage.duration_seconds,
          sessionRenewalStrategy:
            profileName === "soak"
              ? "password_sign_in"
              : "refresh_token",
          renewContentionSessions:
            profileName === "contention",
          operatorOverlap: profileName === "operator_overlap",
          integrityCheckpoint:
            profileName === "breakpoint" ||
            index === shape.stages.length - 1,
        })),
      ];
    }),
  );
}

function readMutationManifest() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(mutationManifestPath, "utf8"));
  } catch {
    throw new Error(
      "The mutation workload manifest is unavailable or invalid.",
    );
  }
  if (
    manifest?.schema_version !== "1.0.0" ||
    !Number.isFinite(manifest?.think_time_seconds?.minimum) ||
    !Number.isFinite(manifest?.think_time_seconds?.maximum) ||
    manifest.think_time_seconds.minimum < 0 ||
    manifest.think_time_seconds.maximum <
      manifest.think_time_seconds.minimum ||
    typeof manifest.ceilings !== "object" ||
    typeof manifest.profiles !== "object" ||
    typeof manifest.shapes !== "object"
  ) {
    throw new Error(
      "The mutation workload manifest has an unsupported schema.",
    );
  }
  return manifest;
}

export function assertMutationAnchorDate(
  anchorLocalDate,
  now = Temporal.Now.instant(),
) {
  const current = now
    .toZonedDateTimeISO(DEFAULT_TIMEZONE)
    .toPlainDate()
    .toString();
  if (current !== anchorLocalDate) {
    throw new Error(
      "The local date crossed the mutation fixture anchor; the run was stopped.",
    );
  }
}

function parseSuiteArgument(argv) {
  const index = argv.indexOf("--suite");
  const value = index >= 0 ? argv[index + 1] : "full";
  if (!value || !SUPPORTED_SUITES.has(value)) {
    throw new Error(
      "--suite must name a supported bounded mutation suite.",
    );
  }
  return value;
}

function assertDependencies() {
  assertLocalRuntimeDependencies({
    root,
    requiredFiles: [
      [locustExecutable, "Locust"],
      [pythonExecutable, "the load-test Python environment"],
      [nextExecutable, "Next.js"],
      [locustFile, "the Ticket 065 Locust entrypoint"],
      [mutationManifestPath, "the mutation profile manifest"],
    ],
  });
}

function createAppEnvironment({
  config,
  fakeProvider,
  fakeApiKey,
  processSecret,
}) {
  const fakeApiUrl = new URL(fakeProvider.apiUrl);
  if (
    fakeApiUrl.protocol !== "http:" ||
    fakeApiUrl.hostname !== "127.0.0.1"
  ) {
    throw new Error(
      "The mutation app refused a nonloopback fake provider.",
    );
  }
  return safeLoadEnvironment({
    ...BLANK_APP_ENV,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    CADENCE_PERF_LOG: "0",
    NEXT_PUBLIC_SITE_URL: baseUrl,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    SEQUENZY_API_URL: fakeProvider.apiUrl,
    SEQUENZY_API_KEY: fakeApiKey,
    SEQUENZY_REMINDER_TEMPLATE_SLUG: FAKE_TEMPLATE_SLUG,
    SEQUENZY_APP_URL: baseUrl,
    REMINDER_PROCESS_SECRET: processSecret,
    CRON_SECRET: processSecret,
  });
}

async function buildProductionApp(appEnvironment, replacements) {
  console.log("Building the local production-mode mutation target.");
  const result = await runSanitizedChild(
    "npm",
    ["run", "build"],
    {
      root,
      env: appEnvironment,
      replacements,
      activeChildren,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error("The local production build failed.");
  }
}

function startProductionApp(appEnvironment, replacements) {
  const target = new URL(baseUrl);
  appProcess = startSanitizedChild(
    nextExecutable,
    [
      "start",
      "--hostname",
      target.hostname,
      "--port",
      target.port,
    ],
    {
      root,
      env: appEnvironment,
      replacements,
      activeChildren,
    },
  );
}

async function waitForApp() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (appProcess?.exitCode !== null) {
      throw new Error(
        "The local production app exited before readiness.",
      );
    }
    try {
      const response = await fetch(`${baseUrl}/terms`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });
      if (
        response.status >= 200 &&
        response.status < 400 &&
        (await response.text()).includes("Terms")
      ) {
        return;
      }
    } catch {
      // Readiness remains bounded and retried.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the local production app.");
}

async function prewarmMutationSessions(session) {
  let nextIndex = 0;
  const identities = session.identities;
  const concurrency = Math.min(8, identities.length);
  console.log(
    `Prewarming ${identities.length} mutation sessions outside timed statistics.`,
  );

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= identities.length) return;
        assertNotInterrupted();
        await prewarmMutationIdentity(identities[index]);
      }
    }),
  );
}

async function prewarmMutationIdentity(identity) {
  const headers = { cookie: cookieHeader(identity.cookies) };
  const duePastBehaviorId =
    identity.selectors?.due_past_clear_behavior_id;
  const duePastLocalDate =
    identity.selectors?.due_past_clear_local_date;
  if (
    typeof duePastBehaviorId !== "string" ||
    typeof duePastLocalDate !== "string"
  ) {
    throw new Error(
      "A mutation identity lacked its due/past review selectors.",
    );
  }
  const duePastReview = new URL("/behaviors", baseUrl);
  duePastReview.searchParams.set("range", "90");
  duePastReview.searchParams.set("behavior", duePastBehaviorId);
  duePastReview.searchParams.set("day", duePastLocalDate);

  for (const [route, marker] of [
    ["/timeline?days=30", "Timeline"],
    ["/behaviors?range=30", "Behaviors"],
    ["/settings", "Settings"],
    [
      `${duePastReview.pathname}${duePastReview.search}`,
      "Review selected day",
    ],
  ]) {
    const response = await fetch(`${baseUrl}${route}`, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.text();
    if (
      response.status < 200 ||
      response.status >= 400 ||
      response.headers.get("location")?.includes("/login") ||
      body.includes("Continue with Google") ||
      !body.includes(marker) ||
      body.includes(identity.selectors.forbidden_marker)
    ) {
      throw new Error(
        "A mutation session failed its protected prewarm contract.",
      );
    }
  }
}

async function runLocustStage({
  stage: stageDefinition,
  session,
  sessionPath,
  reportDirectory,
  replacements,
  secretNeedles,
  ceilings,
  operatorContext,
}) {
  const prefix = path.join(reportDirectory, stageDefinition.name);
  const semanticEvidencePath =
    `${prefix}_semantic-verifications.json`;
  const outputReplacements = privateOutputReplacements(
    replacements,
    secretNeedles,
  );
  const environment = locustWorkerEnvironment({
    CADENCE_LOAD_SESSION_FILE: sessionPath,
    CADENCE_LOAD_IDENTITY_OFFSET: String(
      stageDefinition.identityOffset,
    ),
    CADENCE_LOAD_PROFILE: stageDefinition.profile,
    CADENCE_LOAD_WORKLOAD: stageDefinition.workload,
    CADENCE_LOAD_USERS: String(stageDefinition.users),
    CADENCE_LOAD_DURATION_SECONDS: String(
      stageDefinition.durationSeconds,
    ),
    CADENCE_LOAD_MAXIMUM_REQUESTS: String(
      ceilings.maximum_requests,
    ),
    CADENCE_LOAD_MAXIMUM_RPS: String(
      ceilings.maximum_requests_per_second,
    ),
    CADENCE_LOAD_SEMANTIC_EVIDENCE_FILE: semanticEvidencePath,
    PYTHONPATH: path.join(root, "load-tests"),
  });

  console.log(
    `Starting ${stageDefinition.name}: ${stageDefinition.users} users for ${stageDefinition.durationSeconds} seconds.`,
  );
  const startedAt = performance.now();
  locustProcess = startSanitizedChild(
    locustExecutable,
    [
      "--locustfile",
      locustFile,
      "--config",
      "/dev/null",
      "--host",
      baseUrl,
      "--headless",
      "--stop-timeout",
      "10",
      "--exit-code-on-error",
      String(LOCUST_REQUEST_FAILURE_EXIT_CODE),
      "--csv",
      prefix,
      "--csv-full-history",
      "--html",
      `${prefix}.html`,
      "--only-summary",
    ],
    {
      root,
      env: environment,
      replacements: outputReplacements,
      activeChildren,
    },
  );
  const resourceMonitor = startLocalResourceMonitor({
    appPid: appProcess?.pid,
    locustPid: locustProcess.pid,
    locustRssRequiredDurationMilliseconds:
      stageDefinition.durationSeconds * 1_000,
    onBreach() {
      if (locustProcess?.exitCode === null) {
        locustProcess.kill("SIGINT");
      }
    },
  });
  const operatorController = new AbortController();
  const operatorPromise = stageDefinition.operatorOverlap
    ? runOperatorOverlap({
        signal: operatorController.signal,
        context: operatorContext,
        onFailure() {
          if (locustProcess?.exitCode === null) {
            locustProcess.kill("SIGINT");
          }
        },
      })
    : null;
  const exitCode = await childExit(locustProcess);
  operatorController.abort();
  if (operatorPromise) await operatorPromise;
  const achievedDurationSeconds =
    (performance.now() - startedAt) / 1_000;
  const resources = resourceMonitor.stop();
  locustProcess = null;
  assertNotInterrupted();

  const artifactPaths = sanitizeLocustStageArtifacts({
    prefix,
    replacements: outputReplacements,
    secretNeedles,
  });
  if (!artifactPaths.includes(semanticEvidencePath)) {
    throw new Error(
      `${stageDefinition.name} did not retain its semantic verification artifact.`,
    );
  }
  const statsPath = `${prefix}_stats.csv`;
  const historyPath = `${prefix}_stats_history.csv`;
  const failuresPath = `${prefix}_failures.csv`;
  const exceptionsPath = `${prefix}_exceptions.csv`;
  const metrics = parseLocustStatsCsv(readFileSync(statsPath, "utf8"));
  metrics.request_mix = summarizeRequestMix(metrics);
  const failureHalves = summarizeFailureHalves(
    readFileSync(historyPath, "utf8"),
    metrics,
  );
  const achievedPeakUsers = parseLocustPeakUsers(
    readFileSync(historyPath, "utf8"),
  );
  const unexpected5xx = countUnexpected5xxFailures(
    readFileSync(failuresPath, "utf8"),
  );
  const exceptionCount = countCsvDataRows(
    readFileSync(exceptionsPath, "utf8"),
  );
  let semanticVerifications;
  try {
    semanticVerifications = JSON.parse(
      readFileSync(semanticEvidencePath, "utf8"),
    );
  } catch {
    throw new Error(
      `${stageDefinition.name} lacked valid semantic verification evidence.`,
    );
  }

  return {
    stage: stageDefinition.name,
    group: stageDefinition.group,
    profile: stageDefinition.profile,
    workload: stageDefinition.workload,
    users: stageDefinition.users,
    spawn_rate: stageDefinition.spawnRate,
    duration_seconds: stageDefinition.durationSeconds,
    achieved_duration_seconds: achievedDurationSeconds,
    achieved_peak_users: achievedPeakUsers,
    cohort_mix: activeCohortMix(session, stageDefinition),
    metrics,
    failure_halves: failureHalves,
    unexpected_5xx: unexpected5xx,
    exception_count: exceptionCount,
    semantic_verifications: semanticVerifications,
    resources,
    locust_exit_code: exitCode,
    artifacts: Object.fromEntries(
      artifactPaths.map((artifactPath) => [
        path.basename(artifactPath),
        summarizeArtifactDigest(artifactPath),
      ]),
    ),
  };
}

async function runOperatorOverlap({
  signal,
  context,
  onFailure,
}) {
  try {
    await abortableDelay(OPERATOR_INTERVAL_MILLISECONDS, signal);
    if (signal.aborted) return;
    do {
      assertNotInterrupted();
      const occurrence = await issueOperatorRequest(
        OPERATOR_REQUESTS.occurrence_sync,
        context,
      );
      context.occurrenceResults.push(occurrence);
      if (
        context.preparedOccurrenceSyncPrivateEvidence &&
        context.verifiedOccurrenceSyncAccounts === 0
      ) {
        const verified =
          await verifyPreparedLoadRunOccurrenceSyncFresh({
            runId: context.runId,
            baseUrl,
            config: context.config,
            fixtureMode: FIXTURE_MODE,
            privateEvidence:
              context.preparedOccurrenceSyncPrivateEvidence,
            operatorResult: occurrence,
            signal: context.signal,
          });
        context.verifiedOccurrenceSyncAccounts =
          verified.summary.verifiedFreshAccounts;
        context.causalOccurrenceRepairProofs += 1;
      }
      const reminder = await issueOperatorRequest(
        OPERATOR_REQUESTS.reminder_process,
        context,
      );
      context.reminderResults.push(reminder);
      await abortableDelay(OPERATOR_INTERVAL_MILLISECONDS, signal);
    } while (!signal.aborted);
  } catch (error) {
    if (signal.aborted) return;
    context.failure =
      error instanceof Error
        ? error
        : new Error("The fixed-count operator failed.");
    onFailure();
    throw context.failure;
  }
}

async function issueOperatorRequest(request, context) {
  await recordOperatorIsolationCheck(context);
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${request.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${context.processSecret}`,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  const result = await readOperatorResult(response, request);
  context.requests.push({
    name: request.name,
    status: response.status,
    duration_ms: performance.now() - startedAt,
    result,
  });
  return result;
}

async function recordOperatorIsolationCheck(context) {
  const result = await assertLoadRunOperatorIsolation({
    runId: context.runId,
    baseUrl,
    config: context.config,
    fixtureMode: FIXTURE_MODE,
    signal: context.signal,
  });
  context.isolationChecks += 1;
  context.operatorIsolation = result.summary;
  return result;
}

async function readOperatorResult(response, request) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("An operator response was not valid JSON.");
  }
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !response.headers.get("content-type")?.includes("application/json") ||
    payload?.ok !== true ||
    typeof payload.result !== "object"
  ) {
    throw new Error(
      "A protected operator request failed its response contract.",
    );
  }
  const result = {};
  for (const field of request.fields) {
    const value = payload.result[field];
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        "An operator response contained an invalid aggregate count.",
      );
    }
    result[field] = value;
  }
  if (
    request === OPERATOR_REQUESTS.occurrence_sync &&
    result.synced + result.skipped + result.failed !== result.checked
  ) {
    throw new Error(
      "Occurrence-sync operator counts did not reconcile.",
    );
  }
  if (
    request === OPERATOR_REQUESTS.occurrence_sync &&
    result.failed !== 0
  ) {
    throw new Error(
      "Occurrence-sync operator reported one or more failed users.",
    );
  }
  if (
    request === OPERATOR_REQUESTS.reminder_process &&
    (result.claimed + result.skipped !== result.checked ||
      result.sent + result.failed + result.cancelled !== result.claimed)
  ) {
    throw new Error(
      "Reminder-process operator counts did not reconcile.",
    );
  }
  if (
    request === OPERATOR_REQUESTS.reminder_process &&
    result.failed !== 0
  ) {
    throw new Error(
      "Reminder-process operator reported one or more failed deliveries.",
    );
  }
  return result;
}

async function checkpointIntegrity({
  runId,
  config,
  label,
}) {
  const result = await verifyLoadRunIntegrity({
    runId,
    baseUrl,
    config,
    fixtureMode: FIXTURE_MODE,
  });
  return {
    label,
    ...result.summary,
    databaseConnectionCount: readLocalDatabaseConnectionCount({
      root,
      databaseUrl: config.databaseUrl,
    }),
  };
}

async function runLocalRlsSmoke(config, replacements) {
  console.log("Running the post-mutation local RLS smoke.");
  const result = await runSanitizedChild(
    "npm",
    ["run", "smoke:rls"],
    {
      root,
      env: safeLoadEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: config.url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: config.publishableKey,
        SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
      }),
      replacements,
      activeChildren,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error("The post-mutation local RLS smoke failed.");
  }
}

export function mutationLatencyReferenceForStage({
  stage,
  calibratedMixedP95,
}) {
  const comparable =
    stage?.workload === "mixed" &&
    COMPARABLE_MIXED_GROUPS.has(stage?.group);
  if (!comparable) return undefined;
  if (
    typeof calibratedMixedP95 !== "number" ||
    !Number.isFinite(calibratedMixedP95) ||
    calibratedMixedP95 <= 0
  ) {
    throw new Error(
      `${stage?.stage ?? "A comparable mixed mutation stage"} requires the calibrated representative mixed warm baseline.`,
    );
  }
  return calibratedMixedP95;
}

export function mutationRepresentativeEvidenceStages(stageResults) {
  if (!Array.isArray(stageResults)) {
    throw new Error(
      "Mutation representative evidence requires stage results.",
    );
  }
  return stageResults.filter(
    (result) => result?.group !== MUTATION_CALIBRATION_GROUP,
  );
}

export function requireMutationCalibrationP95(stageResults) {
  if (!Array.isArray(stageResults)) {
    throw new Error(
      "Mutation calibration evidence requires stage results.",
    );
  }
  const calibration = stageResults.find(
    (result) => result?.stage === MUTATION_CALIBRATION_STAGE,
  );
  const p95 = calibration?.metrics?.latency_ms?.p95;
  if (
    calibration?.group !== MUTATION_CALIBRATION_GROUP ||
    calibration?.workload !== "mixed" ||
    calibration?.users !== 1 ||
    typeof p95 !== "number" ||
    !Number.isFinite(p95) ||
    p95 <= 0
  ) {
    throw new Error(
      "Local mutation capacity evidence requires a valid calibrated representative mixed warm baseline.",
    );
  }
  return p95;
}

export function evaluateMutationLocustStage({
  result,
  calibratedMixedP95,
}) {
  const warmBaselineP95 = mutationLatencyReferenceForStage({
    stage: result,
    calibratedMixedP95,
  });
  const gate = evaluateStageGates({
    stage: result.stage,
    metrics: result.metrics,
    warmBaselineP95,
    unexpected5xx: result.unexpected_5xx,
    exceptionCount: result.exception_count,
    resourceBreaches: result.resources.breaches,
    declaredDurationSeconds: result.duration_seconds,
    achievedDurationSeconds: result.achieved_duration_seconds,
    declaredUsers: result.users,
    achievedPeakUsers: result.achieved_peak_users,
  });
  gate.failures = gate.failures.map((failure) =>
    failure === READ_GATE_LATENCY_FAILURE
      ? MUTATION_GATE_LATENCY_FAILURE
      : failure,
  );
  gate.passed = gate.failures.length === 0;
  if (result.stage === MUTATION_CALIBRATION_STAGE) {
    gate.latency_reference = {
      role: "established",
      stage: MUTATION_CALIBRATION_STAGE,
      label: "calibrated representative mixed warm baseline",
      p95_ms: result.metrics.latency_ms.p95,
    };
  } else if (warmBaselineP95 !== undefined) {
    gate.latency_reference = {
      role: "applied",
      stage: MUTATION_CALIBRATION_STAGE,
      label: "calibrated representative mixed warm baseline",
      p95_ms: warmBaselineP95,
    };
  }
  if (result.locust_exit_code !== 0) {
    gate.passed = false;
    gate.failures.push("Locust returned a nonzero critical exit code");
  }
  return gate;
}

export function evaluateMutationStageSemanticEvidence(result) {
  return evaluateSemanticVerificationGate({
    requestsByName: result?.metrics?.requests_by_name,
    evidence: result?.semantic_verifications,
  });
}

export function applyMutationStageSemanticEvidenceGate({
  result,
  gate,
}) {
  const semanticVerification =
    evaluateMutationStageSemanticEvidence(result);
  return {
    ...gate,
    passed: gate.passed && semanticVerification.passed,
    failures: [
      ...gate.failures,
      ...semanticVerification.failures.map(
        (failureReason) =>
          `semantic verification: ${failureReason}`,
      ),
    ],
    semantic_verification: semanticVerification,
  };
}

const NOMINAL_PERFORMANCE_FAILURE_PREFIXES = Object.freeze([
  "unexpected request failures were not below ",
  "p95 exceeded ",
]);
function partitionStageFailures(gate, allowedPrefixes) {
  const performanceFailures = gate.failures.filter((failure) =>
    allowedPrefixes.some((prefix) => failure.startsWith(prefix)),
  );
  const safetyFailures = gate.failures.filter(
    (failure) => !performanceFailures.includes(failure),
  );
  return { performanceFailures, safetyFailures };
}

export function evaluateBreakpointStageOutcome({
  result,
  gate,
}) {
  const plateauGate = {
    ...gate,
    plateau_passed: gate.passed,
    expected_terminal: false,
  };
  if (result.group !== "breakpoint" || gate.passed) {
    return {
      gate: plateauGate,
      stopRemainingBreakpoints: false,
    };
  }

  const { performanceFailures, safetyFailures } =
    partitionStageFailures(
      gate,
      NOMINAL_PERFORMANCE_FAILURE_PREFIXES,
    );
  if (performanceFailures.length === 0 || safetyFailures.length > 0) {
    return {
      gate: plateauGate,
      stopRemainingBreakpoints: false,
    };
  }

  return {
    gate: {
      ...plateauGate,
      passed: true,
      plateau_passed: false,
      expected_terminal: true,
      failures: [],
      performance_failures: performanceFailures,
    },
    stopRemainingBreakpoints: true,
  };
}

export function evaluateRampStageOutcome({
  result,
  gate,
}) {
  const plateauGate = {
    ...gate,
    plateau_passed: gate.passed,
    expected_terminal: false,
  };
  if (result.group !== "ramp" || gate.passed) {
    return {
      gate: plateauGate,
      stopRemainingRamps: false,
    };
  }

  const performanceFailures = gate.failures.filter(
    (failure) => failure === MUTATION_GATE_LATENCY_FAILURE,
  );
  const fatalFailures = gate.failures.filter(
    (failure) => !performanceFailures.includes(failure),
  );
  if (performanceFailures.length === 0 || fatalFailures.length > 0) {
    return {
      gate: plateauGate,
      stopRemainingRamps: false,
    };
  }

  return {
    gate: {
      ...plateauGate,
      passed: true,
      plateau_passed: false,
      expected_terminal: false,
      recorded_ramp_latency_breach: true,
      failures: [],
      performance_failures: performanceFailures,
    },
    stopRemainingRamps: false,
  };
}

export function evaluateSpikeStressStageOutcome({
  result,
  gate,
}) {
  const stressGate = {
    ...gate,
    plateau_passed: gate.passed,
    expected_terminal: false,
    expected_stress: false,
  };
  if (result.stage !== "spike-hold-100" || gate.passed) {
    return { gate: stressGate };
  }

  const performanceFailures = gate.failures.filter(
    (failure) => failure === MUTATION_GATE_LATENCY_FAILURE,
  );
  const safetyFailures = gate.failures.filter(
    (failure) => !performanceFailures.includes(failure),
  );
  if (performanceFailures.length === 0 || safetyFailures.length > 0) {
    return { gate: stressGate };
  }

  return {
    gate: {
      ...stressGate,
      passed: true,
      plateau_passed: false,
      expected_stress: true,
      failures: [],
      performance_failures: performanceFailures,
    },
  };
}

export function evaluateSpikeRecoveryComparison({
  baseline,
  recovery,
}) {
  return {
    ...evaluateRecoveryGate({ baseline, recovery }),
    stage: SPIKE_RECOVERY_COMPARISON_GATE,
  };
}

export function evaluateMutationStageOutcome({
  result,
  gate,
}) {
  if (result.group === "ramp") {
    const outcome = evaluateRampStageOutcome({ result, gate });
    return {
      gate: outcome.gate,
      stopRemainingRamps: outcome.stopRemainingRamps,
      stopRemainingBreakpoints: false,
    };
  }
  if (result.group === "breakpoint") {
    const outcome = evaluateBreakpointStageOutcome({
      result,
      gate,
    });
    return {
      gate: outcome.gate,
      stopRemainingRamps: false,
      stopRemainingBreakpoints:
        outcome.stopRemainingBreakpoints,
    };
  }
  if (result.group === "spike") {
    const outcome = evaluateSpikeStressStageOutcome({
      result,
      gate,
    });
    return {
      gate: outcome.gate,
      stopRemainingRamps: false,
      stopRemainingBreakpoints: false,
    };
  }
  return {
    gate: {
      ...gate,
      plateau_passed: gate.passed,
      expected_terminal: false,
    },
    stopRemainingRamps: false,
    stopRemainingBreakpoints: false,
  };
}

export function mutationStageSkipReason({
  stage,
  breakpointTerminated = false,
}) {
  if (
    breakpointTerminated &&
    stage?.group === "breakpoint"
  ) {
    return "skipped after the first bounded breakpoint performance failure";
  }
  return null;
}

export function mutationStageRequiresIntegrityCheckpoint({
  stageDefinition,
  stageOutcome,
}) {
  return Boolean(
    stageDefinition?.integrityCheckpoint ||
      stageOutcome?.stopRemainingRamps ||
      stageOutcome?.stopRemainingBreakpoints ||
      stageOutcome?.gate?.expected_terminal ||
      stageOutcome?.gate?.expected_stress ||
      stageOutcome?.gate?.recorded_ramp_latency_breach,
  );
}

export async function runRequiredMutationIntegrityCheckpoint({
  stageDefinition,
  stageOutcome,
  checkpoint,
}) {
  if (
    !mutationStageRequiresIntegrityCheckpoint({
      stageDefinition,
      stageOutcome,
    })
  ) {
    return null;
  }
  if (typeof checkpoint !== "function") {
    throw new Error(
      "A required mutation integrity checkpoint callback is unavailable.",
    );
  }
  return await checkpoint();
}

export function assertSoakSupportedByRampEvidence({
  soakStage,
  planStages,
  stageResults,
  stageGates,
}) {
  if (
    !Array.isArray(planStages) ||
    !Array.isArray(stageResults) ||
    !Array.isArray(stageGates)
  ) {
    throw new Error(
      "Soak ramp-headroom validation requires plan, result, and gate evidence.",
    );
  }
  const soakName =
    soakStage?.stage ?? soakStage?.name ?? "the soak stage";
  const soakUsers = soakStage?.users;
  if (!Number.isInteger(soakUsers) || soakUsers <= 0) {
    throw new Error(`${soakName} has an invalid user count.`);
  }
  const rampResults = stageResults.filter(
    (result) => result?.group === "ramp",
  );
  if (rampResults.length === 0) {
    throw new Error(
      `${soakName} requires same-run ramp evidence; run the full mutation suite or provide proven in-run ramp evidence before the soak.`,
    );
  }
  const gatesByStage = new Map(
    stageGates.map((gate) => [gate.stage, gate]),
  );
  const plannedRampStages = planStages.filter(
    (stage) => stage?.group === "ramp",
  );
  const rampResultsByStage = new Map(
    rampResults.map((result) => [result.stage, result]),
  );
  const missingRampStages = plannedRampStages
    .filter(
      (stage) =>
        !rampResultsByStage.has(stage.name) ||
        !gatesByStage.has(stage.name),
    )
    .map((stage) => stage.name);
  if (
    plannedRampStages.length === 0 ||
    missingRampStages.length > 0
  ) {
    throw new Error(
      `${soakName} requires every declared same-run ramp plateau before soak; missing ${missingRampStages.join(", ") || "the declared ramp plan"}.`,
    );
  }

  const soakLevelRamp = rampResults.find(
    (result) => result.users === soakUsers,
  );
  const hasPassingSoakLevelRamp =
    Boolean(soakLevelRamp) &&
    gatesByStage.get(soakLevelRamp.stage)
      ?.plateau_passed === true;

  const recordedRampBoundaries = rampResults.filter(
    (result) =>
      gatesByStage.get(result.stage)
        ?.recorded_ramp_latency_breach === true,
  );
  for (const result of recordedRampBoundaries) {
    const gate = gatesByStage.get(result.stage);
    if (
      gate?.passed !== true ||
      gate?.plateau_passed !== false ||
      !Array.isArray(gate?.failures) ||
      gate.failures.length !== 0 ||
      !Array.isArray(gate?.performance_failures) ||
      gate.performance_failures.length !== 1 ||
      gate.performance_failures[0] !==
        MUTATION_GATE_LATENCY_FAILURE
    ) {
      throw new Error(
        `${result.stage} has invalid recorded ramp latency-boundary evidence.`,
      );
    }
  }
  const recordedRampBoundary = recordedRampBoundaries
    .sort((left, right) => left.users - right.users)[0];
  if (recordedRampBoundary) {
    if (
      !Number.isInteger(recordedRampBoundary.users) ||
      recordedRampBoundary.users <= 0
    ) {
      throw new Error(
        "The recorded ramp latency boundary has an invalid user count.",
      );
    }
    if (soakUsers >= recordedRampBoundary.users) {
      throw new Error(
        `${soakName} at ${soakUsers} users must be strictly below recorded ramp latency boundary ${recordedRampBoundary.stage} at ${recordedRampBoundary.users} users.`,
      );
    }
    if (!hasPassingSoakLevelRamp) {
      throw new Error(
        `${soakName} requires a passing same-run ramp plateau at ${soakUsers} users.`,
      );
    }
    return {
      stage: `${soakName}-ramp-headroom`,
      passed: true,
      failures: [],
      basis: "recorded_ramp_latency_boundary",
      soak_users: soakUsers,
      supporting_ramp_stage: recordedRampBoundary.stage,
      supporting_ramp_users: recordedRampBoundary.users,
    };
  }

  if (!hasPassingSoakLevelRamp) {
    throw new Error(
      `${soakName} requires a passing same-run ramp plateau at ${soakUsers} users.`,
    );
  }
  const passingRampResults = rampResults.filter(
    (result) =>
      gatesByStage.get(result.stage)?.plateau_passed === true,
  );
  const highestPassingRamp = passingRampResults.reduce(
    (highest, result) =>
      !highest || result.users > highest.users ? result : highest,
    null,
  );
  if (
    !highestPassingRamp ||
    !Number.isInteger(highestPassingRamp.users) ||
    highestPassingRamp.users <= soakUsers
  ) {
    throw new Error(
      `${soakName} requires a passing ramp plateau strictly above ${soakUsers} users.`,
    );
  }
  return {
    stage: `${soakName}-ramp-headroom`,
    passed: true,
    failures: [],
    basis: "passing_ramp_plateau",
    soak_users: soakUsers,
    supporting_ramp_stage: highestPassingRamp.stage,
    supporting_ramp_users: highestPassingRamp.users,
  };
}

export function evaluateCompletedSoakPlateauProvenance({
  stageResults,
  stageGates,
}) {
  if (!Array.isArray(stageResults) || !Array.isArray(stageGates)) {
    throw new Error(
      "Completed soak provenance requires stage results and gates.",
    );
  }
  const soakResults = stageResults.filter(
    (result) => result?.group === "soak",
  );
  if (soakResults.length === 0) {
    return {
      passed: true,
      failures: [],
      basis: "not_applicable",
      soak_users: [],
      boundary_stage: null,
      boundary_users: null,
    };
  }

  const failures = [];
  for (const soak of soakResults) {
    if (!Number.isInteger(soak?.users) || soak.users <= 0) {
      failures.push(
        `${soak?.stage ?? "A completed soak"} has an invalid user count`,
      );
    }
  }
  const gatesByStage = new Map(
    stageGates.map((gate) => [gate.stage, gate]),
  );
  const plateauResults = stageResults
    .map((result, index) => ({ result, index }))
    .filter(
      ({ result }) =>
        result?.group === "ramp" ||
        result?.group === "breakpoint",
    );
  const rampPlateaus = plateauResults.filter(
    ({ result }) => result.group === "ramp",
  );
  for (const soak of soakResults) {
    const matchingRamp = rampPlateaus.find(
      ({ result }) => result.users === soak.users,
    )?.result;
    if (
      Number.isInteger(soak.users) &&
      (!matchingRamp ||
        gatesByStage.get(matchingRamp.stage)
          ?.plateau_passed !== true)
    ) {
      failures.push(
        `${soak.stage} requires a passing same-run ramp plateau at ${soak.users} users`,
      );
    }
  }

  const terminalBoundaries = plateauResults
    .filter(
      ({ result }) =>
        gatesByStage.get(result.stage)?.expected_terminal === true,
    )
    .filter(({ result }) => {
      if (!Number.isInteger(result.users) || result.users <= 0) {
        failures.push(
          `${result.stage} has an invalid terminal user boundary`,
        );
        return false;
      }
      return true;
    })
    .map((entry) => ({
      ...entry,
      basis: "performance_terminal",
    }));
  const recordedRampBoundaries = rampPlateaus
    .filter(
      ({ result }) =>
        gatesByStage.get(result.stage)
          ?.recorded_ramp_latency_breach === true,
    )
    .filter(({ result }) => {
      const gate = gatesByStage.get(result.stage);
      if (
        !Number.isInteger(result.users) ||
        result.users <= 0 ||
        gate?.passed !== true ||
        gate?.plateau_passed !== false ||
        !Array.isArray(gate?.failures) ||
        gate.failures.length !== 0 ||
        !Array.isArray(gate?.performance_failures) ||
        gate.performance_failures.length !== 1 ||
        gate.performance_failures[0] !==
          MUTATION_GATE_LATENCY_FAILURE
      ) {
        failures.push(
          `${result.stage} has invalid recorded ramp latency-boundary evidence`,
        );
        return false;
      }
      return true;
    })
    .map((entry) => ({
      ...entry,
      basis: "recorded_ramp_latency_boundary",
    }));
  const observedBoundaries = [
    ...terminalBoundaries,
    ...recordedRampBoundaries,
  ]
    .sort(
      (left, right) =>
        left.result.users - right.result.users ||
        left.index - right.index,
    );

  if (observedBoundaries.length > 0) {
    const boundaryEvidence = observedBoundaries[0];
    const boundary = boundaryEvidence.result;
    const boundaryLabel =
      boundaryEvidence.basis === "performance_terminal"
        ? "performance-terminal"
        : "recorded ramp latency boundary";
    for (const soak of soakResults) {
      if (
        Number.isInteger(soak.users) &&
        soak.users >= boundary.users
      ) {
        failures.push(
          `${soak.stage} at ${soak.users} users must be strictly below ${boundaryLabel} ${boundary.stage} at ${boundary.users} users`,
        );
      }
    }
    return {
      passed: failures.length === 0,
      failures,
      basis: boundaryEvidence.basis,
      soak_users: soakResults.map((soak) => soak.users),
      boundary_stage: boundary.stage,
      boundary_users: boundary.users,
    };
  }

  const passingBoundaries = plateauResults
    .filter(
      ({ result }) =>
        gatesByStage.get(result.stage)?.plateau_passed === true,
    )
    .filter(({ result }) => {
      if (!Number.isInteger(result.users) || result.users <= 0) {
        failures.push(
          `${result.stage} has an invalid passing user boundary`,
        );
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        right.result.users - left.result.users ||
        left.index - right.index,
    );
  const boundary = passingBoundaries[0]?.result ?? null;
  for (const soak of soakResults) {
    if (
      Number.isInteger(soak.users) &&
      (!boundary || boundary.users <= soak.users)
    ) {
      failures.push(
        `${soak.stage} has no passing executed plateau above ${soak.users} users`,
      );
    }
  }
  return {
    passed: failures.length === 0,
    failures,
    basis: "passing_plateau",
    soak_users: soakResults.map((soak) => soak.users),
    boundary_stage: boundary?.stage ?? null,
    boundary_users: boundary?.users ?? null,
  };
}

export function summarizeFailureHalves(historyCsv, finalTotals) {
  if (
    !finalTotals ||
    !Number.isInteger(finalTotals.requests) ||
    finalTotals.requests < 0 ||
    !Number.isInteger(finalTotals.failures) ||
    finalTotals.failures < 0 ||
    finalTotals.failures > finalTotals.requests
  ) {
    throw new Error(
      "Final Locust stats totals must contain valid cumulative request counts.",
    );
  }
  const [headers, ...rows] = parseCsv(historyCsv);
  if (!headers) {
    throw new Error("Locust history CSV is empty.");
  }
  const nameIndex = headers.indexOf("Name");
  const requestIndex = headers.indexOf("Total Request Count");
  const failureIndex = headers.indexOf("Total Failure Count");
  if (nameIndex < 0 || requestIndex < 0 || failureIndex < 0) {
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
    return {
      first: { requests: 0, failures: 0 },
      second: {
        requests: finalTotals.requests,
        failures: finalTotals.failures,
      },
    };
  }
  const latest = aggregate.at(-1);
  if (
    finalTotals.requests < latest.requests ||
    finalTotals.failures < latest.failures
  ) {
    throw new Error(
      "Final Locust stats totals must not regress behind cumulative history.",
    );
  }
  const middle = aggregate[Math.floor((aggregate.length - 1) / 2)];
  return {
    first: {
      requests: middle.requests,
      failures: middle.failures,
    },
    second: {
      requests: finalTotals.requests - middle.requests,
      failures: finalTotals.failures - middle.failures,
    },
  };
}

function runtimeMetadata() {
  const cpuList = cpus();
  return {
    source: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]),
      working_tree_dirty:
        commandOutput("git", ["status", "--porcelain"]).length > 0,
    },
    hardware: {
      platform: platform(),
      release: release(),
      architecture: process.arch,
      cpu_model: cpuList[0]?.model ?? "unknown",
      logical_cpu_count: cpuList.length,
      memory_bytes: totalmem(),
    },
    runtime: {
      node: process.version,
      next: JSON.parse(
        readFileSync(path.join(root, "node_modules", "next", "package.json")),
      ).version,
      python: commandOutput(pythonExecutable, ["--version"]),
      locust: commandOutput(locustExecutable, ["--version"]),
      docker: commandOutput(
        "docker",
        ["version", "--format", "{{.Server.Version}}"],
      ),
      supabase_cli: commandOutput(
        "npm",
        ["run", "supabase", "--", "--version"],
      )
        .split(/\r?\n/)
        .at(-1),
    },
    application: {
      target_classification: "local",
      base_url: baseUrl,
      next_mode: "production persistent Node process",
      supabase_mode: "project-local CLI Docker stack",
      provider_mode: "loopback fake Sequenzy only",
      web_push_enabled: false,
      interpretation:
        "Local persistent-Node mutation evidence only; not hosted or production capacity.",
    },
  };
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: safeLoadEnvironment({
      SUPABASE_TELEMETRY_DISABLED: "1",
    }),
  });
  if (result.status !== 0) return "unavailable";
  return (result.stdout || result.stderr || "").trim();
}

function buildSecretInventory({
  config,
  session,
  sessionPath,
  fakeApiKey,
  processSecret,
}) {
  const needles = new Set([
    config.publishableKey,
    config.serviceRoleKey,
    config.databaseUrl,
    fakeApiKey,
    processSecret,
    sessionPath,
    root,
    homedir(),
  ]);
  collectSessionSecrets(session, needles);
  return [...needles].filter(Boolean);
}

export function collectSessionSecrets(value, needles, key = "") {
  if (Array.isArray(value)) {
    for (const item of value) collectSessionSecrets(item, needles, key);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectSessionSecrets(
        childValue,
        needles,
        key ? `${key}.${childKey}` : childKey,
      );
    }
    return;
  }
  if (
    typeof value === "string" &&
    value &&
    (key.includes("cookie") ||
      key.includes("marker") ||
      (key.endsWith("_id") && key !== "run_id") ||
      key === "pair_id")
  ) {
    needles.add(value);
  }
}

function activeCohortMix(session, stageDefinition) {
  if (stageDefinition.workload === "contention") {
    const pair = session.contention_sessions?.[0];
    if (!pair) {
      throw new Error(
        "The contention stage lacks its paired session artifact.",
      );
    }
    return { [pair.cohort]: 2 };
  }
  const active = session.identities.slice(
    stageDefinition.identityOffset,
    stageDefinition.identityOffset + stageDefinition.users,
  );
  if (active.length !== stageDefinition.users) {
    throw new Error(
      "The stage lacks enough unique mutation identities.",
    );
  }
  return active.reduce((counts, identity) => {
    counts[identity.cohort] = (counts[identity.cohort] ?? 0) + 1;
    return counts;
  }, {});
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function writeAggregateJson(
  filePath,
  value,
  replacements = [],
) {
  const serialized = sanitizeLoadOutput(
    `${JSON.stringify(value, null, 2)}\n`,
    replacements,
  );
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString(
    "hex",
  )}.tmp`;
  try {
    writeFileSync(temporaryPath, serialized, {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, filePath);
    chmodSync(filePath, 0o600);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function assertReportDirectorySanitized(
  reportDirectory,
  secretNeedles,
) {
  for (const filePath of readdirSync(reportDirectory).map((name) =>
    path.join(reportDirectory, name),
  )) {
    const status = statSync(filePath);
    if (!status.isFile()) continue;
    const content = readFileSync(filePath, "utf8");
    if (
      secretNeedles.some(
        (needle) =>
          typeof needle === "string" &&
          needle &&
          content.includes(needle),
      )
    ) {
      rmSync(filePath);
      throw new Error(
        "A retained mutation artifact contained private session material.",
      );
    }
    chmodSync(filePath, 0o600);
  }
}

function expectedMutationStageArtifactNames(stageName) {
  return [
    `${stageName}.html`,
    `${stageName}_exceptions.csv`,
    `${stageName}_failures.csv`,
    `${stageName}_semantic-verifications.json`,
    `${stageName}_stats.csv`,
    `${stageName}_stats_history.csv`,
  ].sort();
}

function isMutationStageArtifactCandidate(name, stageNames) {
  return (
    name.endsWith(".html") ||
    name.endsWith(".csv") ||
    name.endsWith("_semantic-verifications.json") ||
    stageNames.some(
      (stageName) =>
        name === `${stageName}.html` ||
        name.startsWith(`${stageName}_`),
    )
  );
}

export function inspectMutationStageArtifacts({
  reportDirectory,
  declaredStages,
  stageResults,
}) {
  const stageNames = declaredStages.map((stage) =>
    typeof stage === "string" ? stage : stage.name,
  );
  const expectedDigests = new Map();
  const failures = [];

  for (const result of stageResults) {
    const expectedNames = expectedMutationStageArtifactNames(
      result.stage,
    );
    const recordedNames = Object.keys(result.artifacts ?? {}).sort();
    if (
      recordedNames.length !== expectedNames.length ||
      recordedNames.some(
        (name, index) => name !== expectedNames[index],
      )
    ) {
      failures.push(
        `${result.stage} does not declare the exact six-artifact inventory.`,
      );
      continue;
    }
    for (const name of expectedNames) {
      expectedDigests.set(name, result.artifacts[name]);
    }
  }

  const retainedNames = readdirSync(reportDirectory)
    .filter((name) =>
      isMutationStageArtifactCandidate(name, stageNames),
    )
    .sort();
  const retainedNameSet = new Set(retainedNames);
  const expectedNames = [...expectedDigests.keys()].sort();
  const expectedNameSet = new Set(expectedNames);
  const orphanNames = retainedNames.filter(
    (name) => !expectedNameSet.has(name),
  );

  for (const name of expectedNames) {
    const artifactPath = path.join(reportDirectory, name);
    if (!retainedNameSet.has(name)) {
      failures.push(`${name} is missing.`);
      continue;
    }
    const status = lstatSync(artifactPath);
    if (status.isSymbolicLink() || !status.isFile()) {
      failures.push(`${name} is not a regular retained artifact.`);
      continue;
    }
    const digest = summarizeArtifactDigest(artifactPath);
    if (digest !== expectedDigests.get(name)) {
      failures.push(`${name} does not match its recorded SHA-256 digest.`);
    }
  }

  for (const name of orphanNames) {
    const artifactPath = path.join(reportDirectory, name);
    const status = lstatSync(artifactPath);
    if (status.isSymbolicLink() || !status.isFile()) {
      failures.push(`${name} is not a regular retained artifact.`);
    }
  }

  const expectedCount = stageResults.length * 6;
  if (expectedNames.length !== expectedCount) {
    failures.push(
      "Completed stages do not declare six unique artifacts each.",
    );
  }
  if (retainedNames.length !== expectedCount) {
    failures.push(
      "The retained stage-artifact count does not match the completed stages.",
    );
  }
  if (orphanNames.length > 0) {
    failures.push(
      "The report directory contains orphan stage-prefixed artifacts.",
    );
  }

  return {
    artifactInspection: {
      status: failures.length === 0 ? "passed" : "failed",
      completed_stage_count: stageResults.length,
      expected_stage_artifact_count: expectedCount,
      retained_stage_artifact_count: retainedNames.length,
      orphan_stage_artifact_count: orphanNames.length,
    },
    failures,
  };
}

function reminderStatusCounts(summary) {
  return (
    summary?.reminderStatuses ??
    summary?.providerEvidence?.reminderStatuses ??
    null
  );
}

export function finalProviderEvidence(before, after) {
  const initial = reminderStatusCounts(before) ?? {};
  const final = reminderStatusCounts(after) ?? {};
  const checks = after?.integrityChecks ?? {};
  return {
    sent: Math.max(0, (final.sent ?? 0) - (initial.sent ?? 0)),
    failed: Math.max(0, (final.failed ?? 0) - (initial.failed ?? 0)),
    cancelled: Math.max(
      0,
      (final.cancelled ?? 0) - (initial.cancelled ?? 0),
    ),
    processing: final.processing ?? 0,
    duplicateKeys:
      checks.duplicateDeliveries ??
      after?.providerEvidence?.duplicateKeys ??
      0,
  };
}

function activePushSubscriptionCount(summary) {
  return (
    summary?.activePushSubscriptions ??
    summary?.rowCounts?.push_subscriptions ??
    0
  );
}

export function aggregateSequentialStageMetrics(stageResults) {
  if (!Array.isArray(stageResults) || stageResults.length === 0) {
    throw new Error(
      "Sequential mutation stage evidence is required.",
    );
  }
  const byKey = new Map();
  let achievedDurationSeconds = 0;
  for (const result of stageResults) {
    const duration = result?.achieved_duration_seconds;
    if (
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      throw new Error(
        "A mutation stage has an invalid achieved duration.",
      );
    }
    achievedDurationSeconds += duration;
    for (const row of result.metrics.requests_by_name ?? []) {
      if (
        typeof row?.method !== "string" ||
        !row.method ||
        typeof row?.name !== "string" ||
        !row.name ||
        !Number.isInteger(row.requests) ||
        row.requests < 0 ||
        !Number.isInteger(row.failures) ||
        row.failures < 0
      ) {
        throw new Error(
          "A mutation stage has invalid request-name evidence.",
        );
      }
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
  const requestsByName = [...byKey.values()]
    .map((row) => ({
      ...row,
      requests_per_second:
        row.requests / achievedDurationSeconds,
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.method.localeCompare(right.method),
    );
  const requests = requestsByName.reduce(
    (total, row) => total + row.requests,
    0,
  );
  return {
    achieved_duration_seconds: achievedDurationSeconds,
    requests,
    requests_per_second: requests / achievedDurationSeconds,
    requests_by_name: requestsByName,
  };
}

function aggregateOperatorRequestRows(operatorContext, durationSeconds) {
  const byName = new Map(
    OPERATOR_REQUEST_NAMES.map((name) => [
      name,
      {
        method: "POST",
        name,
        requests: 0,
        failures: 0,
        requests_per_second: 0,
      },
    ]),
  );
  for (const request of operatorContext.requests) {
    const row = byName.get(request.name);
    if (row) row.requests += 1;
  }
  for (const row of byName.values()) {
    row.requests_per_second =
      durationSeconds > 0 ? row.requests / durationSeconds : 0;
  }
  return [...byName.values()];
}

export function buildMutationCapacityEvidence({
  stageResults,
  stageGates,
}) {
  if (!Array.isArray(stageResults) || !Array.isArray(stageGates)) {
    throw new Error(
      "Local mutation capacity evidence requires stage results and gates.",
    );
  }
  const plateauResults = stageResults.filter(
    (result) =>
      result.group === "breakpoint" || result.group === "ramp",
  );
  if (plateauResults.length === 0) return null;

  const calibrationP95 =
    requireMutationCalibrationP95(stageResults);
  const plateauGates = new Map(
    stageGates.map((gate) => [gate.stage, gate]),
  );
  const capacity = selectHighestSustainableLocalPlateau({
    targetClassification: "local",
    plateaus: plateauResults.map((result) => ({
      stage: result.stage,
      users: result.users,
      metrics: result.metrics,
      passed:
        plateauGates.get(result.stage)?.plateau_passed ??
        plateauGates.get(result.stage)?.passed ??
        false,
    })),
  });
  return {
    ...capacity,
    latency_reference: {
      stage: MUTATION_CALIBRATION_STAGE,
      label: "calibrated representative mixed warm baseline",
      p95_ms: calibrationP95,
    },
  };
}

function evaluateCompletedMutationEvidence({
  suite,
  stageResults,
  stageGates,
  integrityCheckpoints,
  operatorContext,
  fakeProviderEvidence,
  preIntegrity,
  postIntegrity,
  timezoneOccurrencePreservation,
}) {
  const evidenceGates = [];
  const interactionManifest = JSON.parse(
    readFileSync(interactionManifestPath, "utf8"),
  );
  const representativeStageResults =
    mutationRepresentativeEvidenceStages(stageResults);
  const timedMetrics =
    aggregateSequentialStageMetrics(representativeStageResults);
  const timedRows = timedMetrics.requests_by_name;
  const stableNames = evaluateStableRequestNameGate({
    requestsByName: timedRows,
    interactionManifest,
  });
  evidenceGates.push({
    stage: "stable-request-names",
    ...stableNames,
  });

  for (const result of representativeStageResults.filter(
    (candidate) => candidate.workload === "mixed",
  )) {
    const requestMix = evaluateRequestMixGate(result.metrics);
    evidenceGates.push({
      stage: `${result.stage}-request-mix`,
      ...requestMix,
    });
  }

  if (suite === "full") {
    const semanticEvidence =
      aggregateMutationSemanticEvidence(representativeStageResults);
    const coverage = evaluateTimedMutationCoverage({
      requestsByName: timedRows,
      semanticVerifications:
        semanticEvidence.semantic_verifications,
    });
    evidenceGates.push({
      stage: "timed-mutation-coverage",
      ...coverage,
    });
  }

  const statusEventCorrelation = evaluateStatusEventCorrelation({
    requestsByName: stageResults
      .filter((result) => result.group !== "contention")
      .flatMap((result) => result.metrics.requests_by_name ?? []),
    statusEventDelta:
      postIntegrity?.mutationDeltas?.statusEvents,
    statusTransitionEvidence:
      postIntegrity?.statusTransitionEvidence,
    requireAppended: suite === "full",
  });
  evidenceGates.push({
    stage: "status-event-correlation",
    ...statusEventCorrelation,
  });

  const duePastReminder =
    evaluateDuePastReminderNonReactivation({
      evidence: postIntegrity?.duePastReminderNonReactivation,
      requireExercised: stageResults.some(
        (result) =>
          result.stage === "smoke-1" ||
          result.stage === MUTATION_CALIBRATION_STAGE,
      ),
    });
  evidenceGates.push({
    stage: "due-past-reminder-non-reactivation",
    ...duePastReminder,
  });

  if (
    stageResults.some(
      (result) => result.group === "timezone_changed",
    )
  ) {
    const timezonePreservation =
      evaluateTimezoneDynamicOccurrencePreservation(
        timezoneOccurrencePreservation,
      );
    evidenceGates.push({
      stage: "timezone-dynamic-preservation",
      ...timezonePreservation,
    });
  }

  for (const checkpoint of integrityCheckpoints) {
    const integrity = evaluateMutationIntegrityGate(checkpoint);
    evidenceGates.push({
      stage: `integrity-${checkpoint.label}`,
      ...integrity,
    });
  }

  const soak = stageResults.find(
    (result) => result.group === "soak",
  );
  if (soak) {
    const beforeConnections =
      integrityCheckpointBeforeStage(
        integrityCheckpoints,
        "soak-25",
      )?.databaseConnectionCount ?? null;
    const afterConnections =
      integrityCheckpoints.find(
        (checkpoint) => checkpoint.label === "after-soak-25",
      )?.databaseConnectionCount ?? null;
    const soakGate = evaluateSoakNoGrowthGate({
      resourceSamples: soak.resources.resource_samples,
      declaredDurationSeconds: soak.duration_seconds,
      firstResource: {
        databaseConnections: beforeConnections,
      },
      finalResource: {
        databaseConnections: afterConnections,
      },
      failureHalves: soak.failure_halves,
    });
    evidenceGates.push({
      stage: "soak-no-growth",
      ...soakGate,
    });
  }

  const soakPlateauProvenance =
    evaluateCompletedSoakPlateauProvenance({
      stageResults,
      stageGates,
  });
  evidenceGates.push({
    stage: "soak-plateau-provenance",
    ...soakPlateauProvenance,
  });

  const capacity = buildMutationCapacityEvidence({
    stageResults,
    stageGates,
  });

  if (fakeProviderEvidence?.operator_required) {
    const operatorRows = aggregateOperatorRequestRows(
      operatorContext,
      stageResults
        .filter((result) => result.group === "operator_overlap")
        .reduce(
          (total, result) => total + result.duration_seconds,
          0,
        ),
    );
    const operatorGate = evaluateOperatorProviderReconciliation({
      operatorRequests: operatorRows,
      occurrenceSyncResults: operatorContext.occurrenceResults,
      reminderProcessResults: operatorContext.reminderResults,
      reminderReplayResult:
        operatorContext.reminderResults.at(-1),
      fakeProvider: fakeProviderEvidence.snapshot,
      finalDeliveryDelta: finalProviderEvidence(
        preIntegrity,
        postIntegrity,
      ),
      activePushSubscriptions:
        activePushSubscriptionCount(postIntegrity),
    });
    evidenceGates.push({
      stage: "operator-provider-reconciliation",
      ...operatorGate,
    });
    const operatorIsolation =
      evaluateOperatorIsolationAndCausalRepair({
        operatorRequestCount: operatorContext.requests.length,
        isolationChecks: operatorContext.isolationChecks,
        isolationSummary: operatorContext.operatorIsolation,
        preparedAccounts:
          operatorContext.preparedOccurrenceSyncAccounts,
        verifiedFreshAccounts:
          operatorContext.verifiedOccurrenceSyncAccounts,
        causalRepairProofs:
          operatorContext.causalOccurrenceRepairProofs,
      });
    evidenceGates.push({
      stage: "operator-isolation-and-causal-repair",
      ...operatorIsolation,
    });
  }

  const failed = evidenceGates.find((gate) => !gate.passed);
  return {
    gates: evidenceGates,
    request_mix: summarizeRequestMix(timedMetrics),
    capacity,
    failed_gate: failed ?? null,
  };
}

export function aggregateMutationSemanticEvidence(stageResults) {
  if (!Array.isArray(stageResults)) {
    throw new Error(
      "Mutation semantic evidence aggregation requires stage results.",
    );
  }
  const aggregate = {
    successful_submissions: {},
    semantic_verifications: {},
    pending_verifications: {},
  };
  for (const result of stageResults) {
    const evidence = result?.semantic_verifications;
    for (const field of Object.keys(aggregate)) {
      const counts = evidence?.[field];
      if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
        throw new Error(
          `${result?.stage ?? "A mutation stage"} lacks ${field} evidence.`,
        );
      }
      for (const [name, count] of Object.entries(counts)) {
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new Error(
            `${result?.stage ?? "A mutation stage"} has invalid ${field} evidence.`,
          );
        }
        aggregate[field][name] =
          (aggregate[field][name] ?? 0) + count;
      }
    }
  }
  return aggregate;
}

function integrityCheckpointBeforeStage(checkpoints, stageName) {
  const afterLabel = `after-${stageName}`;
  const index = checkpoints.findIndex(
    (checkpoint) => checkpoint.label === afterLabel,
  );
  return index > 0 ? checkpoints[index - 1] : checkpoints[0] ?? null;
}

async function finalizeFakeProviderEvidence({
  fakeProvider,
  operatorContext,
  preIntegrity,
  postIntegrity,
  requiresOperator,
}) {
  const snapshot = fakeProvider.snapshot();
  if (!requiresOperator) {
    if (
      snapshot.requests_total !== 0 ||
      snapshot.accepted !== 0 ||
      snapshot.rejected !== 0 ||
      snapshot.web_push_attempts !== 0
    ) {
      throw new Error(
        "A non-operator suite unexpectedly contacted the fake provider.",
      );
    }
    return {
      snapshot,
      operator_required: false,
    };
  }

  const replay = await issueOperatorRequest(
    OPERATOR_REQUESTS.reminder_process,
    operatorContext,
  );
  operatorContext.reminderResults.push(replay);
  assertFakeSequenzyRunEvidence({
    snapshot: fakeProvider.snapshot(),
    processResults: operatorContext.reminderResults,
    replayResult: replay,
    finalDeliveryDelta: finalProviderEvidence(
      preIntegrity,
      postIntegrity,
    ),
    activePushSubscriptions:
      activePushSubscriptionCount(postIntegrity),
  });
  return {
    snapshot: fakeProvider.snapshot(),
    operator_required: true,
    isolation_checks: operatorContext.isolationChecks,
    occurrence_sync_prepared_accounts:
      operatorContext.preparedOccurrenceSyncAccounts,
    occurrence_sync_verified_fresh_accounts:
      operatorContext.verifiedOccurrenceSyncAccounts,
    occurrence_sync_causal_repair_proofs:
      operatorContext.causalOccurrenceRepairProofs,
    occurrence_request_count: operatorContext.occurrenceResults.length,
    reminder_request_count: operatorContext.reminderResults.length,
    final_replay: replay,
    requests: operatorContext.requests,
  };
}

export function stopMutationChildrenForSignal({
  lifecycleController,
  locust,
  app,
  children,
}) {
  lifecycleController.abort();
  if (locust?.exitCode === null) locust.kill("SIGINT");
  for (const child of children) {
    if (
      child !== app &&
      child !== locust &&
      child.exitCode === null
    ) {
      child.kill("SIGTERM");
    }
  }
}

function handleSignal() {
  interrupted = true;
  stopMutationChildrenForSignal({
    lifecycleController: lifecycleAbortController,
    locust: locustProcess,
    app: appProcess,
    children: activeChildren,
  });
}

function assertNotInterrupted() {
  if (interrupted || lifecycleAbortController.signal.aborted) {
    throw new Error("The local mutation suite was interrupted.");
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function abortableDelay(milliseconds, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runMutationSuite({
  suite = "full",
  runId = createMutationLoadRunId(),
} = {}) {
  runId = validateLoadRunId(runId);
  const plan = buildMutationSuitePlan(suite);
  const reportDirectory = path.join(runsRoot, runId);
  let config;
  let fakeProvider;
  let fakeProviderEvidence = null;
  let completedEvidence = null;
  let session;
  let sessionPath;
  let anchorLocalDate;
  let attemptedProvision = false;
  let cleanupSummary = null;
  let failure = null;
  let declaration = null;
  let preIntegrity = null;
  let postIntegrity = null;
  let rlsSmoke = "not_run";
  let artifactInspection = null;
  let replacements = [
    { value: root, label: "[workspace]" },
    { value: homedir(), label: "[home]" },
  ];
  const retainedSecretNeedles = new Set();
  const stageResults = [];
  const skippedStages = [];
  const sessionRenewals = [];
  const gates = [];
  const integrityCheckpoints = [];
  const inspectionFailures = [];
  let timezoneOccurrenceSnapshot = null;
  let timezoneOccurrencePreservation = null;
  const fakeApiKey = `cadence-load-fake-${randomBytes(24).toString(
    "base64url",
  )}`;
  const processSecret = `cadence-load-process-${randomBytes(24).toString(
    "base64url",
  )}`;
  const operatorContext = {
    runId,
    config: null,
    signal: lifecycleAbortController.signal,
    processSecret,
    requests: [],
    occurrenceResults: [],
    reminderResults: [],
    isolationChecks: 0,
    operatorIsolation: null,
    preparedOccurrenceSyncAccounts: 0,
    preparedOccurrenceSyncPrivateEvidence: null,
    verifiedOccurrenceSyncAccounts: 0,
    causalOccurrenceRepairProofs: 0,
    failure: null,
  };

  assertDependencies();
  await assertLocalPortAvailable(baseUrl);
  mkdirSync(runsRoot, { recursive: true, mode: 0o700 });
  mkdirSync(reportDirectory, { mode: 0o700 });
  chmodSync(reportDirectory, 0o700);

  try {
    config = readExplicitLocalSupabaseConfig({ root, baseUrl });
    operatorContext.config = config;
    retainedSecretNeedles.add(config.publishableKey);
    retainedSecretNeedles.add(config.serviceRoleKey);
    if (config.databaseUrl) retainedSecretNeedles.add(config.databaseUrl);
    retainedSecretNeedles.add(fakeApiKey);
    retainedSecretNeedles.add(processSecret);

    fakeProvider = await startFakeSequenzyServer({
      runId,
      apiKey: fakeApiKey,
      reminderTemplateSlug: FAKE_TEMPLATE_SLUG,
      maxRequests: 10_000,
    });
    const appEnvironment = createAppEnvironment({
      config,
      fakeProvider,
      fakeApiKey,
      processSecret,
    });
    await buildProductionApp(
      appEnvironment,
      privateOutputReplacements(
        replacements,
        [...retainedSecretNeedles],
      ),
    );
    assertNotInterrupted();

    attemptedProvision = true;
    const provisioned = await provisionLoadRun({
      runId,
      accountCount: plan.accountCount,
      heavyCount: plan.heavyCount,
      baseUrl,
      config,
      fixtureMode: FIXTURE_MODE,
      signal: lifecycleAbortController.signal,
    });
    sessionPath = provisioned.sessionPath;
    session = JSON.parse(readFileSync(sessionPath, "utf8"));
    anchorLocalDate = session.anchor_local_date;
    replacements = buildPrivatePathReplacements({
      root,
      sessionPath,
    });
    for (const secret of buildSecretInventory({
      config,
      session,
      sessionPath,
      fakeApiKey,
      processSecret,
    })) {
      retainedSecretNeedles.add(secret);
    }

    declaration = {
      schema_version: MUTATION_RUN_EVIDENCE_SCHEMA_VERSION,
      run_id: runId,
      suite,
      declared_at: new Date().toISOString(),
      workload_classification: FIXTURE_MODE,
      cohort_counts: provisioned.summary.cohorts,
      identity_count: session.identities.length,
      contention_pair_count:
        session.contention_sessions?.length ?? 0,
      stages: plan.stages,
      task_weights: plan.taskWeights,
      read_task_keys: plan.readTaskKeys,
      think_time_seconds: plan.thinkTimeSeconds,
      read_weight_percent: plan.readTaskKeys.reduce(
        (total, key) => total + plan.taskWeights[key],
        0,
      ),
      ceilings: plan.ceilings,
      request_ceiling_scope: {
        maximum_requests: "per Locust stage",
        cumulative_supervised_requests:
          plan.cumulativeRequestCeiling,
        cumulative_includes_operator_requests: true,
      },
      resource_ceilings: DEFAULT_LOCAL_RESOURCE_CEILINGS,
      abort_thresholds: {
        unexpected_request_failure_ratio_percent: "less than 0.5",
        unexpected_5xx_ratio: plan.ceilings.unexpected_5xx_ratio,
        unexpected_5xx_window_seconds:
          plan.ceilings.unexpected_5xx_window_seconds,
        unexpected_5xx_consecutive_windows:
          plan.ceilings.unexpected_5xx_consecutive_windows,
        repeated_database_refusals: 3,
        cross_owner_or_real_provider_attempt: "immediate",
        false_fresh_or_integrity_failure: "at checkpoint",
        per_stage_request_runtime_user_rps_ceiling: "immediate",
        cumulative_suite_request_ceiling:
          "after each bounded stage",
        soak_rss_growth: {
          sampling_interval_seconds: 5,
          baseline_window_start_seconds: 300,
          baseline_window_end_seconds: 600,
          terminal_window_duration_seconds: 300,
          minimum_valid_samples_per_window: 50,
          maximum_boundary_offset_seconds: 15,
          maximum_sample_gap_seconds: 15,
          maximum_growth_bytes: 128 * 1024 * 1024,
          maximum_growth_ratio: 0.25,
        },
      },
      runtime: runtimeMetadata(),
      caveats: [
        "Weights are initial product assumptions, not observed analytics.",
        "All provider sends target a loopback fake; Web Push is disabled.",
        "Results are local capacity evidence, not production capacity.",
      ],
    };
    writeAggregateJson(
      path.join(reportDirectory, "declaration.json"),
      declaration,
      replacements,
    );

    startProductionApp(
      appEnvironment,
      () =>
        privateOutputReplacements(
          replacements,
          [...retainedSecretNeedles],
        ),
    );
    await waitForApp();
    assertNotInterrupted();
    assertMutationAnchorDate(anchorLocalDate);
    await prewarmMutationSessions(session);
    if (
      plan.stages.some(
        (stageDefinition) => stageDefinition.operatorOverlap,
      )
    ) {
      await recordOperatorIsolationCheck(operatorContext);
    }
    preIntegrity = await checkpointIntegrity({
      runId,
      config,
      label: "before",
    });
    integrityCheckpoints.push(preIntegrity);

    let calibratedMixedP95;
    let spikeBaseline;
    let breakpointTerminated = false;
    for (const stageDefinition of plan.stages) {
      const skipReason = mutationStageSkipReason({
        stage: stageDefinition,
        breakpointTerminated,
      });
      if (skipReason) {
        skippedStages.push({
          stage: stageDefinition.name,
          reason: skipReason,
        });
        continue;
      }
      assertNotInterrupted();
      assertMutationAnchorDate(anchorLocalDate);
      if (stageDefinition.group === "soak") {
        const rampSupport =
          assertSoakSupportedByRampEvidence({
            soakStage: stageDefinition,
            planStages: plan.stages,
            stageResults,
            stageGates: gates,
          });
        if (rampSupport) gates.push(rampSupport);
      }
      const refreshed = await refreshLoadRunSessions({
        runId,
        baseUrl,
        config,
        fixtureMode: FIXTURE_MODE,
        activeCount:
          stageDefinition.workload === "contention"
            ? 1
            : stageDefinition.users +
              Number(stageDefinition.operatorOverlap),
        accountOffset: stageDefinition.identityOffset,
        renewalStrategy:
          stageDefinition.sessionRenewalStrategy,
        includeContentionSessions:
          stageDefinition.renewContentionSessions,
        signal: lifecycleAbortController.signal,
      });
      sessionRenewals.push({
        before_stage: stageDefinition.name,
        refreshed_accounts: refreshed.summary.refreshedAccounts,
        renewal_strategy: refreshed.summary.renewalStrategy,
        contention_sessions_renewed:
          refreshed.summary.contentionSessionsRenewed,
        renewal_strategies: refreshed.summary.renewalStrategies,
      });
      session = JSON.parse(readFileSync(refreshed.sessionPath, "utf8"));
      for (const secret of buildSecretInventory({
        config,
        session,
        sessionPath,
        fakeApiKey,
        processSecret,
      })) {
        retainedSecretNeedles.add(secret);
      }
      if (stageDefinition.group === "timezone_changed") {
        timezoneOccurrenceSnapshot =
          await captureLoadRunTimezoneOccurrenceSnapshot({
            runId,
            baseUrl,
            config,
            fixtureMode: FIXTURE_MODE,
            signal: lifecycleAbortController.signal,
          });
      }
      if (stageDefinition.operatorOverlap) {
        await recordOperatorIsolationCheck(operatorContext);
        const prepared = await markLoadRunOccurrenceSyncStale({
          runId,
          baseUrl,
          config,
          fixtureMode: FIXTURE_MODE,
          activeCount: 1,
          accountOffset: stageDefinition.users,
          signal: lifecycleAbortController.signal,
        });
        operatorContext.preparedOccurrenceSyncAccounts =
          prepared.summary.preparedAccounts;
        operatorContext.preparedOccurrenceSyncPrivateEvidence =
          prepared.privateEvidence;
      }

      let result;
      try {
        result = await runLocustStage({
          stage: stageDefinition,
          session,
          sessionPath,
          reportDirectory,
          replacements,
          secretNeedles: [...retainedSecretNeedles],
          ceilings: plan.ceilings,
          operatorContext,
        });
      } finally {
        if (
          stageDefinition.group === "timezone_changed" &&
          timezoneOccurrenceSnapshot
        ) {
          const verified =
            await verifyLoadRunTimezoneOccurrenceSnapshot({
              runId,
              baseUrl,
              config,
              fixtureMode: FIXTURE_MODE,
              privateEvidence:
                timezoneOccurrenceSnapshot.privateEvidence,
              signal: lifecycleAbortController.signal,
            });
          timezoneOccurrencePreservation = {
            ...verified.summary,
          };
          delete timezoneOccurrencePreservation.runId;
        }
      }
      stageResults.push(result);
      if (operatorContext.failure) throw operatorContext.failure;
      const cumulativeRequestUsage =
        summarizeCumulativeRequestUsage({
          stageResults,
          operatorRequestCount: operatorContext.requests.length,
          ceiling: plan.cumulativeRequestCeiling,
        });
      if (cumulativeRequestUsage.reached) {
        throw new Error(
          "The selected mutation suite reached its cumulative supervised request ceiling.",
        );
      }

      const locustGate = evaluateMutationLocustStage({
        result,
        calibratedMixedP95,
      });
      const rawGate = applyMutationStageSemanticEvidenceGate({
        result,
        gate: locustGate,
      });
      const stageOutcome = evaluateMutationStageOutcome({
        result,
        gate: rawGate,
      });
      const gate = stageOutcome.gate;
      gates.push(gate);
      if (stageOutcome.stopRemainingBreakpoints) {
        breakpointTerminated = true;
      }
      if (!gate.passed) {
        throw new Error(
          `${result.stage} failed its mutation stop/go gates: ${gate.failures.join(
            "; ",
          )}.`,
        );
      }
      if (result.stage === MUTATION_CALIBRATION_STAGE) {
        calibratedMixedP95 =
          requireMutationCalibrationP95(stageResults);
      }
      if (result.stage === "spike-baseline-10") {
        spikeBaseline = result.metrics;
      }
      if (result.stage === "spike-recovery-10") {
        if (!spikeBaseline) {
          throw new Error(
            "Spike recovery lacks its pre-spike baseline.",
          );
        }
        const recovery = evaluateSpikeRecoveryComparison({
          baseline: spikeBaseline,
          recovery: result.metrics,
        });
        gates.push(recovery);
        if (!recovery.passed) {
          throw new Error(
            `Spike recovery failed: ${recovery.failures.join("; ")}.`,
          );
        }
      }

      const checkpoint =
        await runRequiredMutationIntegrityCheckpoint({
          stageDefinition,
          stageOutcome,
          checkpoint: () =>
            checkpointIntegrity({
              runId,
              config,
              label: `after-${stageDefinition.name}`,
            }),
        });
      if (checkpoint) {
        integrityCheckpoints.push(checkpoint);
        postIntegrity = checkpoint;
      }
      writeAggregateJson(
        path.join(reportDirectory, "progress.json"),
        {
          schema_version: MUTATION_RUN_EVIDENCE_SCHEMA_VERSION,
          run_id: runId,
          completed_stages: stageResults,
          skipped_stages: skippedStages,
          session_renewals: sessionRenewals,
          gates,
          integrity_checkpoints: integrityCheckpoints,
          operator: {
            request_count: operatorContext.requests.length,
            isolation_checks: operatorContext.isolationChecks,
            prepared_occurrence_sync_accounts:
              operatorContext.preparedOccurrenceSyncAccounts,
            verified_occurrence_sync_accounts:
              operatorContext.verifiedOccurrenceSyncAccounts,
            causal_occurrence_repair_proofs:
              operatorContext.causalOccurrenceRepairProofs,
          },
          timezone_occurrence_preservation:
            timezoneOccurrencePreservation,
          cumulative_request_usage: cumulativeRequestUsage,
        },
        replacements,
      );
    }

    assertMutationAnchorDate(anchorLocalDate);
    postIntegrity ??= await checkpointIntegrity({
      runId,
      config,
      label: "after",
    });
    if (!integrityCheckpoints.includes(postIntegrity)) {
      integrityCheckpoints.push(postIntegrity);
    }
    const providerBaselineIntegrity =
      integrityCheckpointBeforeStage(
        integrityCheckpoints,
        "operator-overlap-10",
      ) ?? preIntegrity;
    fakeProviderEvidence = await finalizeFakeProviderEvidence({
      fakeProvider,
      operatorContext,
      preIntegrity: providerBaselineIntegrity,
      postIntegrity,
      requiresOperator: plan.stages.some(
        (stageDefinition) => stageDefinition.operatorOverlap,
      ),
    });
    completedEvidence = evaluateCompletedMutationEvidence({
      suite,
      stageResults,
      stageGates: gates,
      integrityCheckpoints,
      operatorContext,
      fakeProviderEvidence,
      preIntegrity: providerBaselineIntegrity,
      postIntegrity,
      timezoneOccurrencePreservation,
    });
    gates.push(...completedEvidence.gates);
    if (completedEvidence.failed_gate) {
      throw new Error(
        `${completedEvidence.failed_gate.stage} failed: ${completedEvidence.failed_gate.failures.join("; ")}.`,
      );
    }
    await runLocalRlsSmoke(config, replacements);
    rlsSmoke = "passed";
  } catch (error) {
    failure =
      error instanceof Error
        ? error
        : new Error("The local mutation suite failed.");
  } finally {
    if (
      sessionPath &&
      config &&
      appProcess?.exitCode === null &&
      (failure !== null || postIntegrity === null)
    ) {
      try {
        postIntegrity = await checkpointIntegrity({
          runId,
          config,
          label: "after-failure",
        });
        integrityCheckpoints.push(postIntegrity);
      } catch (inspectionError) {
        inspectionFailures.push(
          sanitizeLoadOutput(
            inspectionError instanceof Error
              ? inspectionError.message
              : "Post-failure mutation integrity inspection failed.",
            replacements,
          ),
        );
      }
    }
    if (config && rlsSmoke !== "passed") {
      try {
        await runLocalRlsSmoke(config, replacements);
        rlsSmoke = "passed";
      } catch (inspectionError) {
        inspectionFailures.push(
          sanitizeLoadOutput(
            inspectionError instanceof Error
              ? inspectionError.message
              : "Post-failure local RLS smoke failed.",
            replacements,
          ),
        );
        rlsSmoke = "failed";
      }
    }
    await stopChild(locustProcess);
    await stopChild(appProcess);
    locustProcess = null;
    appProcess = null;
    if (fakeProvider) {
      try {
        const finalSnapshot = await fakeProvider.close();
        fakeProviderEvidence ??= {
          snapshot: finalSnapshot,
          operator_required: false,
        };
      } catch (providerError) {
        failure ??=
          providerError instanceof Error
            ? providerError
            : new Error("The local fake provider did not stop cleanly.");
      }
    }
    if (attemptedProvision && config) {
      try {
        const cleaned = await cleanupLoadRun({
          runId,
          confirmRunId: runId,
          baseUrl,
          config,
          fixtureMode: FIXTURE_MODE,
        });
        cleanupSummary = cleaned.summary;
      } catch (cleanupError) {
        failure ??=
          cleanupError instanceof Error
            ? cleanupError
            : new Error("Exact mutation-fixture cleanup failed.");
      }
    }
  }

  if (interrupted && failure === null) {
    failure = new Error("The local mutation suite was interrupted.");
  }
  const finalArtifactInspection = inspectMutationStageArtifacts({
    reportDirectory,
    declaredStages: plan.stages,
    stageResults,
  });
  artifactInspection =
    finalArtifactInspection.artifactInspection;
  if (finalArtifactInspection.failures.length > 0) {
    inspectionFailures.push(
      ...finalArtifactInspection.failures.map((message) =>
        sanitizeLoadOutput(message, replacements),
      ),
    );
    failure ??= new Error(
      "Final mutation artifact inspection failed.",
    );
  }

  const summary = {
    schema_version: MUTATION_RUN_EVIDENCE_SCHEMA_VERSION,
    run_id: runId,
    suite,
    status: failure ? "failed" : "passed",
    workload_classification: FIXTURE_MODE,
    cohort_counts: declaration?.cohort_counts ?? null,
    identity_count: declaration?.identity_count ?? null,
    contention_pair_count:
      declaration?.contention_pair_count ?? null,
    task_weights: plan.taskWeights,
    think_time_seconds: plan.thinkTimeSeconds,
    stages: stageResults,
    skipped_stages: skippedStages,
    session_renewals: sessionRenewals,
    gates,
    integrity: {
      before: preIntegrity,
      after: postIntegrity,
      checkpoints: integrityCheckpoints,
    },
    fake_provider: fakeProviderEvidence,
    timezone_occurrence_preservation:
      timezoneOccurrencePreservation,
    request_mix: completedEvidence?.request_mix ?? null,
    local_capacity: completedEvidence?.capacity ?? null,
    rls_smoke: rlsSmoke,
    cleanup: cleanupSummary,
    runtime: declaration?.runtime ?? null,
    ceilings: plan.ceilings,
    request_ceiling_scope:
      declaration?.request_ceiling_scope ?? null,
    cumulative_request_usage: summarizeCumulativeRequestUsage({
      stageResults,
      operatorRequestCount: operatorContext.requests.length,
      ceiling: plan.cumulativeRequestCeiling,
    }),
    resource_ceilings: DEFAULT_LOCAL_RESOURCE_CEILINGS,
    artifact_inspection: artifactInspection,
    caveats: declaration?.caveats ?? [],
    failure: failure
      ? sanitizeLoadOutput(failure.message, replacements)
      : null,
    inspection_failures: inspectionFailures,
  };
  writeAggregateJson(
    path.join(reportDirectory, "summary.json"),
    summary,
    replacements,
  );
  try {
    assertReportDirectorySanitized(
      reportDirectory,
      [...retainedSecretNeedles],
    );
  } catch (inspectionError) {
    const message = sanitizeLoadOutput(
      inspectionError instanceof Error
        ? inspectionError.message
        : "Final mutation artifact sanitization failed.",
      replacements,
    );
    inspectionFailures.push(message);
    failure ??= new Error(
      "Final mutation artifact sanitization failed.",
    );
    const reinspected = inspectMutationStageArtifacts({
      reportDirectory,
      declaredStages: plan.stages,
      stageResults,
    });
    artifactInspection = {
      ...reinspected.artifactInspection,
      status: "failed",
    };
    for (const failureMessage of reinspected.failures) {
      const sanitized = sanitizeLoadOutput(
        failureMessage,
        replacements,
      );
      if (!inspectionFailures.includes(sanitized)) {
        inspectionFailures.push(sanitized);
      }
    }
    summary.status = "failed";
    summary.failure = sanitizeLoadOutput(
      failure.message,
      replacements,
    );
    summary.inspection_failures = inspectionFailures;
    summary.artifact_inspection = artifactInspection;
    writeAggregateJson(
      path.join(reportDirectory, "summary.json"),
      summary,
      replacements,
    );
  }
  writeAggregateJson(
    path.join(reportDirectory, "completion.json"),
    {
      schema_version: MUTATION_RUN_EVIDENCE_SCHEMA_VERSION,
      run_id: runId,
      suite,
      status: summary.status,
      completed_stage_count: stageResults.length,
      artifact_inspection: artifactInspection,
      cleanup: cleanupSummary,
      failure: summary.failure,
    },
    replacements,
  );

  if (failure) throw failure;
  console.log(
    `Ticket 065 ${suite} suite passed ${stageResults.length} stages with exact cleanup.`,
  );
  return summary;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const signalController =
    installCooperativeSignalController({
      emitter: process,
      onFirstSignal: handleSignal,
    });
  runMutationSuite({
    suite: parseSuiteArgument(process.argv.slice(2)),
  })
    .catch((error) => {
      console.error(
        sanitizeLoadOutput(
          error instanceof Error
            ? error.message
            : "The local mutation suite failed.",
        ),
      );
      process.exitCode = 1;
    })
    .finally(() => signalController.uninstall());
}
