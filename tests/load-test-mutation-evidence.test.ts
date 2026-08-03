import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const RUN_ID = "20260729t200000z-abcdef123456";
const GET_REQUEST =
  "INT-SHELL-001 GET /timeline protected-document";
const SPIKE_RECOVERY_COMPARISON =
  "spike-recovery-comparison";
const MUTATION_EVIDENCE_CAVEATS = [
  "Weights are initial product assumptions, not observed analytics.",
  "All provider sends target a loopback fake; Web Push is disabled.",
  "Results are local capacity evidence, not production capacity.",
];
const SUITE_STAGE_NAMES = {
  smoke: ["smoke-1"],
  baseline: [
    "mixed-calibration-1",
    "mixed-baseline-5",
    "mixed-baseline-10",
  ],
  ramp: [
    "mixed-calibration-1",
    "ramp-10",
    "ramp-25",
    "ramp-50",
    "ramp-100",
  ],
  spike: [
    "mixed-calibration-1",
    "spike-baseline-10",
    "spike-hold-100",
    "spike-recovery-10",
  ],
  soak: [
    "mixed-calibration-1",
    "ramp-10",
    "ramp-25",
    "ramp-50",
    "ramp-100",
    "soak-25",
  ],
  breakpoint: [
    "mixed-calibration-1",
    "breakpoint-10",
    "breakpoint-25",
    "breakpoint-50",
    "breakpoint-75",
    "breakpoint-100",
  ],
  timezone: ["timezone-changed-5"],
  contention: ["contention-1"],
  operator: [
    "mixed-calibration-1",
    "operator-overlap-10",
  ],
  full: [
    "smoke-1",
    "mixed-calibration-1",
    "mixed-baseline-5",
    "mixed-baseline-10",
    "ramp-10",
    "ramp-25",
    "ramp-50",
    "ramp-100",
    "spike-baseline-10",
    "spike-hold-100",
    "spike-recovery-10",
    "soak-25",
    "breakpoint-10",
    "breakpoint-25",
    "breakpoint-50",
    "breakpoint-75",
    "breakpoint-100",
    "timezone-changed-5",
    "contention-1",
    "operator-overlap-10",
  ],
} as const;

type SuiteName = keyof typeof SUITE_STAGE_NAMES;
type JsonRecord = ReturnType<typeof JSON.parse>;
type CanonicalStage = {
  name: string;
  group: string;
  profile: string;
  workload: string;
  users: number;
  spawnRate: number;
  durationSeconds: number;
  sessionRenewalStrategy: string;
  renewContentionSessions: boolean;
  operatorOverlap: boolean;
  integrityCheckpoint: boolean;
  identityOffset: number;
};
type CanonicalPlan = {
  suite: SuiteName;
  stages: CanonicalStage[];
  identityCount: number;
  cohortCounts: Record<string, number>;
  cohortAllocation: string[];
  contentionPairCount: number;
  taskWeights: Record<string, number>;
  readTaskKeys: string[];
  thinkTimeSeconds: { minimum: number; maximum: number };
  ceilings: Record<string, number>;
  readWeightPercent: number;
  cumulativeRequestCeiling: number;
};
type EvidenceModule = {
  canonicalMutationSuitePlan: (suite: SuiteName) => CanonicalPlan;
  parseMutationEvidenceArgs: (
    args: string[],
  ) => { runId: string };
  validateMutationEvidenceDirectory: (options: {
    runId: string;
    runsRoot: string;
  }) => {
    run_id: string;
    suite: string;
    completed_stage_count: number;
    skipped_stage_count: number;
  };
};
type ReadReportModule = {
  evaluateRecoveryGate: (input: {
    baseline: JsonRecord;
    recovery: JsonRecord;
  }) => JsonRecord;
  evaluateStageGates: (input: JsonRecord) => JsonRecord;
  parseLocustStatsCsv: (text: string) => JsonRecord;
};
type MutationReportModule = {
  REQUIRED_TIMED_MUTATION_REQUEST_NAMES: readonly string[];
  STATUS_TRANSITION_REQUEST_NAMES: readonly string[];
  evaluateDuePastReminderNonReactivation: (
    input: JsonRecord,
  ) => JsonRecord;
  evaluateMutationIntegrityGate: (
    input: JsonRecord,
  ) => JsonRecord;
  evaluateRequestMixGate: (
    metrics: JsonRecord,
  ) => JsonRecord;
  evaluateSemanticVerificationGate: (
    input: JsonRecord,
  ) => JsonRecord;
  evaluateSoakNoGrowthGate: (
    input: JsonRecord,
  ) => JsonRecord;
  evaluateStableRequestNameGate: (
    input: JsonRecord,
  ) => JsonRecord;
  evaluateStatusEventCorrelation: (
    input: JsonRecord,
  ) => JsonRecord;
  evaluateTimedMutationCoverage: (
    input: JsonRecord,
  ) => JsonRecord;
  evaluateTimezoneDynamicOccurrencePreservation: (
    input: JsonRecord,
  ) => JsonRecord;
  selectHighestSustainableLocalPlateau: (
    input: JsonRecord,
  ) => JsonRecord;
  summarizeRequestMix: (metrics: JsonRecord) => JsonRecord;
};

let evidenceModule: EvidenceModule;
let readReportModule: ReadReportModule;
let mutationReportModule: MutationReportModule;
let interactionManifest: JsonRecord;
const temporaryRoots: string[] = [];

beforeAll(async () => {
  // @ts-expect-error The evidence checker is a plain Node ESM module.
  evidenceModule = await import("../scripts/check-load-test-mutation-evidence.mjs");
  // @ts-expect-error The report helper is a plain Node ESM module.
  readReportModule = await import("../scripts/load-test-read-report.mjs");
  // @ts-expect-error The mutation helper is a plain Node ESM module.
  mutationReportModule = await import("../scripts/load-test-mutation-report.mjs");
  interactionManifest = JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        "load-tests",
        "scenarios",
        "interaction-map.json",
      ),
      "utf8",
    ),
  ) as JsonRecord;
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Ticket 065 final mutation evidence checker", () => {
  it("accepts canonical, independently reconcilable evidence for every supported suite", () => {
    for (const suite of Object.keys(
      SUITE_STAGE_NAMES,
    ) as SuiteName[]) {
      const fixture = createValidEvidenceRun(suite);

      expect(
        fixture.declaration.stages.map(
          (stage: CanonicalStage) => stage.name,
        ),
      ).toEqual(SUITE_STAGE_NAMES[suite]);
      expect(
        evidenceModule.validateMutationEvidenceDirectory({
          runId: RUN_ID,
          runsRoot: fixture.runsRoot,
        }),
      ).toEqual({
        run_id: RUN_ID,
        suite,
        completed_stage_count:
          SUITE_STAGE_NAMES[suite].length,
        skipped_stage_count: 0,
      });
    }
  });

  it("validates deterministic cohort mix from each stage identity offset", () => {
    const fixture = createValidEvidenceRun("full");
    const plan = evidenceModule.canonicalMutationSuitePlan("full");
    const timezoneDeclaration = plan.stages.find(
      (stage) => stage.group === "timezone_changed",
    );
    const timezoneResult = fixture.summary.stages.find(
      (stage: JsonRecord) =>
        stage.group === "timezone_changed",
    );

    expect(timezoneDeclaration?.identityOffset).toBe(
      plan.identityCount - timezoneDeclaration!.users,
    );
    expect(timezoneResult?.cohort_mix).toEqual(
      activeCohortMix(
        timezoneDeclaration!,
        plan.cohortAllocation,
      ),
    );
    expect(() => validate(fixture)).not.toThrow();
  });

  it("rejects the formerly accepted truncated and arbitrary full declaration", () => {
    const fixture = createValidEvidenceRun("full");
    const truncatedNames = new Set([
      "ramp-10",
      "ramp-25",
      "ramp-50",
      "ramp-100",
      "timezone-changed-5",
      "operator-overlap-10",
      "breakpoint-10",
      "breakpoint-25",
      "breakpoint-50",
      "spike-hold-100",
      "spike-recovery-10",
    ]);
    fixture.declaration.stages =
      fixture.declaration.stages
        .filter((stage: CanonicalStage) =>
          truncatedNames.has(stage.name),
        )
        .map((stage: CanonicalStage) => ({
          ...stage,
          spawnRate: 10,
          durationSeconds: 60,
        }));
    fixture.writeRecords();

    expect(() => validate(fixture)).toThrow(
      /canonical full suite exactly/i,
    );
  });

  it.each([
    ["name", "smoke-altered"],
    ["group", "ramp"],
    ["profile", "ramp"],
    ["workload", "contention"],
    ["users", 2],
    ["spawnRate", 2],
    ["durationSeconds", 181],
    ["sessionRenewalStrategy", "password_sign_in"],
    ["renewContentionSessions", true],
    ["operatorOverlap", true],
    ["integrityCheckpoint", false],
    ["identityOffset", 1],
  ])(
    "rejects a noncanonical stage %s",
    (field, value) => {
      const fixture = createValidEvidenceRun("smoke");
      (
        fixture.declaration.stages[0] as unknown as JsonRecord
      )[field] = value;
      fixture.writeRecords();

      expect(() => validate(fixture)).toThrow(
        /canonical smoke suite exactly/i,
      );
    },
  );

  it("requires canonical identities, cohorts, pacing, weights, ceilings, and request bounds", () => {
    const identity = createValidEvidenceRun("operator");
    identity.declaration.identity_count = 10;
    identity.writeRecords();
    expect(() => validate(identity)).toThrow(
      /declaration identity count.*11/i,
    );

    const cohorts = createValidEvidenceRun("baseline");
    cohorts.summary.cohort_counts.typical_daily -= 1;
    cohorts.writeRecords();
    expect(() => validate(cohorts)).toThrow(
      /summary cohort counts/i,
    );

    const weights = createValidEvidenceRun("smoke");
    weights.declaration.task_weights.timeline_read = 29;
    weights.writeRecords();
    expect(() => validate(weights)).toThrow(
      /declaration task weights/i,
    );

    const thinkTime = createValidEvidenceRun("smoke");
    thinkTime.summary.think_time_seconds.maximum = 4;
    thinkTime.writeRecords();
    expect(() => validate(thinkTime)).toThrow(
      /summary think time seconds/i,
    );

    const readWeight = createValidEvidenceRun("smoke");
    readWeight.declaration.read_weight_percent = 64;
    readWeight.writeRecords();
    expect(() => validate(readWeight)).toThrow(
      /read weight percent/i,
    );

    const ceiling = createValidEvidenceRun("smoke");
    ceiling.summary.request_ceiling_scope
      .cumulative_supervised_requests += 1;
    ceiling.writeRecords();
    expect(() => validate(ceiling)).toThrow(
      /request ceiling scope/i,
    );

    const soakContract = createValidEvidenceRun("smoke");
    soakContract.declaration.abort_thresholds
      .soak_rss_growth.maximum_sample_gap_seconds = 16;
    soakContract.writeRecords();
    expect(() => validate(soakContract)).toThrow(
      /abort thresholds.*canonical supervised mutation contract/i,
    );
  });

  it("requires one producer-exact session renewal per completed stage", () => {
    const lifecycle = createValidEvidenceRun("baseline");
    expect(
      lifecycle.summary.integrity.checkpoints.map(
        (checkpoint: JsonRecord) => checkpoint.label,
      ),
    ).toEqual([
      "before",
      "after-mixed-calibration-1",
      "after-mixed-baseline-10",
    ]);
    expect(lifecycle.summary.integrity.after).toEqual(
      lifecycle.summary.integrity.checkpoints.at(-1),
    );

    const operator = createValidEvidenceRun("operator");
    const overlapRenewal =
      operator.summary.session_renewals.at(-1);
    expect(overlapRenewal).toMatchObject({
      before_stage: "operator-overlap-10",
      refreshed_accounts: 11,
      contention_sessions_renewed: 0,
      renewal_strategies: {
        refresh: 11,
        password_sign_in: 0,
        password_sign_in_fallback: 0,
      },
    });

    overlapRenewal.refreshed_accounts = 10;
    operator.writeRecords();
    expect(() => validate(operator)).toThrow(
      /refreshed accounts.*operator-overlap-10/i,
    );

    const order = createValidEvidenceRun("baseline");
    [
      order.summary.session_renewals[0],
      order.summary.session_renewals[1],
    ] = [
      order.summary.session_renewals[1],
      order.summary.session_renewals[0],
    ];
    order.writeRecords();
    expect(() => validate(order)).toThrow(
      /session renewal stage 1/i,
    );

    const contention =
      createValidEvidenceRun("contention");
    contention.summary.session_renewals[0]
      .contention_sessions_renewed = 0;
    contention.writeRecords();
    expect(() => validate(contention)).toThrow(
      /contention sessions renewed/i,
    );
  });

  it("requires internally reconciled producer-exact integrity checkpoints", () => {
    const missingRow = createValidEvidenceRun("smoke");
    delete missingRow.summary.integrity.before.rowCounts
      .categories;
    missingRow.writeRecords();
    expect(() => validate(missingRow)).toThrow(
      /integrity before row counts.*invalid schema/i,
    );

    const total = createValidEvidenceRun("smoke");
    total.summary.integrity.after.totalRows += 1;
    total.writeRecords();
    expect(() => validate(total)).toThrow(
      /integrity after total row count/i,
    );

    const reminder = createValidEvidenceRun("smoke");
    reminder.summary.integrity.after.reminderStatuses
      .pending = 1;
    reminder.writeRecords();
    expect(() => validate(reminder)).toThrow(
      /reminder statuses.*reminder_deliveries/i,
    );

    const cohorts = createValidEvidenceRun("smoke");
    cohorts.summary.integrity.after.cohorts
      .typical_daily -= 1;
    cohorts.writeRecords();
    expect(() => validate(cohorts)).toThrow(
      /cohort counts.*canonical declaration/i,
    );

    const delta = createValidEvidenceRun("smoke");
    delta.summary.integrity.after.mutationDeltas
      .occurrences += 1;
    delta.writeRecords();
    expect(() => validate(delta)).toThrow(
      /occurrences mutation delta/i,
    );

    const status = createValidEvidenceRun("smoke");
    status.summary.integrity.after
      .statusTransitionEvidence.baselineEventCount = 1;
    status.writeRecords();
    expect(() => validate(status)).toThrow(
      /status-transition baseline event count/i,
    );

    const push = createValidEvidenceRun("smoke");
    push.summary.integrity.after.activePushSubscriptions =
      1;
    push.writeRecords();
    expect(() => validate(push)).toThrow(
      /active push subscription count/i,
    );

    const missingExercise =
      createValidEvidenceRun("smoke");
    delete missingExercise.summary.integrity.before
      .duePastReminderNonReactivation
      .exercised_occurrences;
    missingExercise.writeRecords();
    expect(() => validate(missingExercise)).toThrow(
      /due-past reminder evidence.*invalid schema/i,
    );

    const contradictoryExercise =
      createValidEvidenceRun("smoke");
    contradictoryExercise.summary.integrity.after
      .duePastReminderNonReactivation
      .exercised_occurrences = 2;
    contradictoryExercise.writeRecords();
    expect(() => validate(contradictoryExercise)).toThrow(
      /clear events.*unique exercised occurrences/i,
    );

    const contradictoryCancellation =
      createValidEvidenceRun("smoke");
    contradictoryCancellation.summary.integrity.after
      .duePastReminderNonReactivation
      .cancelled_deliveries = 0;
    contradictoryCancellation.writeRecords();
    expect(() =>
      validate(contradictoryCancellation),
    ).toThrow(
      /cancelled due-past deliveries.*unique exercised occurrences/i,
    );

    const reactivation = createValidEvidenceRun("smoke");
    reactivation.summary.integrity.after
      .duePastReminderNonReactivation
      .reactivated_deliveries = 1;
    reactivation.writeRecords();
    expect(() => validate(reactivation)).toThrow(
      /reactivation count must be zero/i,
    );

    const repeatedClear = createValidEvidenceRun("smoke");
    repeatedClear.summary.integrity.after
      .duePastReminderNonReactivation.clear_events = 2;
    repeatedClear.writeRecords();
    expect(() => validate(repeatedClear)).not.toThrow();

    const missingApplicableExercise =
      createValidEvidenceRun("smoke");
    for (const checkpoint of
      missingApplicableExercise.summary.integrity
        .checkpoints.slice(1)) {
      checkpoint.duePastReminderNonReactivation
        .exercised_occurrences = 0;
      checkpoint.duePastReminderNonReactivation.clear_events =
        0;
      checkpoint.duePastReminderNonReactivation
        .cancelled_deliveries = 0;
      checkpoint.reminderStatuses.pending = 1;
      checkpoint.reminderStatuses.cancelled = 0;
      checkpoint.cancellationReminderStatuses.pending = 1;
      checkpoint.cancellationReminderStatuses.cancelled = 0;
    }
    missingApplicableExercise.writeRecords();
    expect(() =>
      validate(missingApplicableExercise),
    ).toThrow(/unique exercise evidence.*applicability/i);

    const gateSchema = createValidEvidenceRun("smoke");
    const dueGate = gateSchema.summary.gates.find(
      (gate: JsonRecord) =>
        gate.stage ===
        "due-past-reminder-non-reactivation",
    );
    dueGate.evidence = structuredClone(dueGate.evidence);
    delete dueGate.evidence.exercised_occurrences;
    gateSchema.writeRecords();
    expect(() => validate(gateSchema)).toThrow(
      /due\/past reminder non-reactivation gate.*recomputed/i,
    );
  });

  it("recomputes timezone evidence and rejects non-applicable records", () => {
    const missing = createValidEvidenceRun("timezone");
    missing.summary.timezone_occurrence_preservation =
      null;
    missing.writeRecords();
    expect(() => validate(missing)).toThrow(
      /timezone occurrence-preservation evidence/i,
    );

    const contradiction =
      createValidEvidenceRun("timezone");
    contradiction.summary.timezone_occurrence_preservation
      .verified_occurrences = 1;
    contradiction.writeRecords();
    expect(() => validate(contradiction)).toThrow(
      /timezone verified occurrence count|timezone dynamic preservation gate.*recomputed/i,
    );

    const nonApplicable = createValidEvidenceRun("smoke");
    nonApplicable.summary.timezone_occurrence_preservation = {
      captured_occurrences: 1,
      verified_occurrences: 1,
      violations: 0,
    };
    nonApplicable.writeRecords();
    expect(() => validate(nonApplicable)).toThrow(
      /non-timezone.*null timezone/i,
    );
  });

  it("recomputes both operator gates from exact retained raw evidence", () => {
    const missing = createValidEvidenceRun("operator");
    delete missing.summary.fake_provider.requests;
    missing.writeRecords();
    expect(() => validate(missing)).toThrow(
      /fake provider evidence.*invalid schema/i,
    );

    const result = createValidEvidenceRun("operator");
    result.summary.fake_provider.requests[0].result.synced =
      0;
    result.writeRecords();
    expect(() => validate(result)).toThrow(
      /occurrence-sync counts do not reconcile/i,
    );

    const counts = createValidEvidenceRun("operator");
    counts.summary.fake_provider.reminder_request_count = 3;
    counts.writeRecords();
    expect(() => validate(counts)).toThrow(
      /reminder-process operator request count/i,
    );

    const replay = createValidEvidenceRun("operator");
    const replayResult =
      replay.summary.fake_provider.final_replay;
    replayResult.checked = 1;
    replayResult.claimed = 1;
    replayResult.cancelled = 1;
    replay.writeRecords();
    expect(() => validate(replay)).toThrow(
      /final operator reminder replay claimed/i,
    );

    const isolation = createValidEvidenceRun("operator");
    isolation.summary.fake_provider.isolation_checks = 4;
    isolation.writeRecords();
    expect(() => validate(isolation)).toThrow(
      /operator isolation check count/i,
    );

    const snapshot = createValidEvidenceRun("operator");
    snapshot.summary.fake_provider.snapshot
      .response_statuses = { "202": 2 };
    snapshot.writeRecords();
    expect(() => validate(snapshot)).toThrow(
      /response statuses.*accepted fake sends/i,
    );

    const deliveryDelta =
      createValidEvidenceRun("operator");
    const preOperator =
      deliveryDelta.summary.integrity.checkpoints.find(
        (checkpoint: JsonRecord) =>
          checkpoint.label ===
          "after-mixed-calibration-1",
      );
    preOperator.reminderStatuses.sent = 1;
    preOperator.operatorReminderStatuses.sent = 1;
    preOperator.rowCounts.reminder_deliveries += 1;
    preOperator.totalRows += 1;
    preOperator.mutationDeltas.reminders += 1;
    deliveryDelta.writeRecords();
    expect(() => validate(deliveryDelta)).toThrow(
      /operator provider reconciliation gate.*recomputed/i,
    );

    const gate = createValidEvidenceRun("operator");
    gate.summary.gates.find(
      (candidate: JsonRecord) =>
        candidate.stage ===
        "operator-provider-reconciliation",
    ).evidence.reminder_process_totals.sent = 2;
    gate.writeRecords();
    expect(() => validate(gate)).toThrow(
      /provider reconciliation sent count/i,
    );
  });

  it("rejects missing stage metric, resource, duration, peak, and exit evidence", () => {
    const metrics = createValidEvidenceRun("smoke");
    delete metrics.summary.stages[0].metrics;
    metrics.writeRecords();
    expect(() => validate(metrics)).toThrow(
      /stage smoke-1 metrics/i,
    );

    const resources = createValidEvidenceRun("smoke");
    delete resources.summary.stages[0].resources.samples;
    resources.writeRecords();
    expect(() => validate(resources)).toThrow(
      /resource evidence.*invalid schema/i,
    );

    const duration = createValidEvidenceRun("smoke");
    duration.summary.stages[0].achieved_duration_seconds =
      120;
    duration.writeRecords();
    expect(() => validate(duration)).toThrow(
      /achieved duration.*bounded/i,
    );

    const peak = createValidEvidenceRun("smoke");
    peak.summary.stages[0].achieved_peak_users = 0;
    peak.writeRecords();
    expect(() => validate(peak)).toThrow(
      /active-user ceiling/i,
    );

    const exit = createValidEvidenceRun("smoke");
    exit.summary.stages[0].locust_exit_code = 1;
    exit.writeRecords();
    expect(() => validate(exit)).toThrow(
      /Locust exit code.*0/i,
    );
  });

  it("validates full runtime metadata, deterministic cohort mix, and numeric resource ceilings", () => {
    const runtime = createValidEvidenceRun("smoke");
    delete runtime.declaration.runtime.hardware.cpu_model;
    delete runtime.summary.runtime.hardware.cpu_model;
    runtime.writeRecords();
    expect(() => validate(runtime)).toThrow(
      /hardware runtime.*invalid schema/i,
    );

    const cohort = createValidEvidenceRun("baseline");
    cohort.summary.stages[1].cohort_mix = {
      typical_daily: cohort.summary.stages[1].users,
    };
    cohort.writeRecords();
    expect(() => validate(cohort)).toThrow(
      /cohort mix.*deterministic active-account allocation/i,
    );

    const resource = createValidEvidenceRun("smoke");
    resource.summary.stages[0].resources.max_app_rss_bytes =
      4 * 1024 * 1024 * 1024 + 1;
    resource.writeRecords();
    expect(() => validate(resource)).toThrow(
      /max_app_rss_bytes.*retained raw observations/i,
    );

    const rss = createValidEvidenceRun("smoke");
    rss.summary.stages[0].resources.final_locust_rss_bytes =
      101;
    rss.writeRecords();
    expect(() => validate(rss)).toThrow(
      /final_locust_rss_bytes.*retained raw observations/i,
    );

    const zeroRss = createValidEvidenceRun("smoke");
    zeroRss.summary.stages[0].resources
      .first_app_rss_bytes = 0;
    zeroRss.writeRecords();
    expect(() => validate(zeroRss)).toThrow(
      /first_app_rss_bytes.*retained raw observations/i,
    );

    const missingRss = createValidEvidenceRun("smoke");
    delete missingRss.summary.stages[0].resources
      .max_locust_rss_bytes;
    missingRss.writeRecords();
    expect(() => validate(missingRss)).toThrow(
      /resource evidence.*invalid schema/i,
    );
  });

  it("requires exact, ordered, covered raw resource samples and recomputes every diagnostic", () => {
    const count = createValidEvidenceRun("smoke");
    count.summary.stages[0].resources.samples += 1;
    count.writeRecords();
    expect(() => validate(count)).toThrow(
      /resource sample count.*raw observations/i,
    );

    const schema = createValidEvidenceRun("smoke");
    schema.summary.stages[0].resources
      .resource_samples[0].extra = true;
    schema.writeRecords();
    expect(() => validate(schema)).toThrow(
      /raw resource sample 0.*invalid schema/i,
    );

    const order = createValidEvidenceRun("smoke");
    order.summary.stages[0].resources
      .resource_samples[1].elapsed_milliseconds = 0;
    order.writeRecords();
    expect(() => validate(order)).toThrow(
      /elapsed milliseconds.*strictly increasing/i,
    );

    const gap = createValidEvidenceRun("smoke");
    gap.summary.stages[0].resources.resource_samples.splice(
      1,
      3,
    );
    gap.summary.stages[0].resources.samples =
      gap.summary.stages[0].resources.resource_samples.length;
    gap.writeRecords();
    expect(() => validate(gap)).toThrow(
      /maximum sampling gap/i,
    );

    const start = createValidEvidenceRun("smoke");
    start.summary.stages[0].resources.resource_samples.splice(
      0,
      4,
    );
    start.summary.stages[0].resources.samples =
      start.summary.stages[0].resources.resource_samples.length;
    start.writeRecords();
    expect(() => validate(start)).toThrow(
      /do not cover the stage start/i,
    );

    const end = createValidEvidenceRun("smoke");
    end.summary.stages[0].resources.resource_samples.splice(-4);
    end.summary.stages[0].resources.samples =
      end.summary.stages[0].resources.resource_samples.length;
    end.writeRecords();
    expect(() => validate(end)).toThrow(
      /do not cover the achieved stage end/i,
    );

    const ratio = createValidEvidenceRun("smoke");
    ratio.summary.stages[0].resources
      .resource_samples[0].host_load_per_logical_cpu = 0.25;
    ratio.writeRecords();
    expect(() => validate(ratio)).toThrow(
      /host-load ratio.*logical CPU count/i,
    );

    const earlyNull = createValidEvidenceRun("smoke");
    earlyNull.summary.stages[0].resources
      .resource_samples[1].locust_rss_bytes = null;
    earlyNull.writeRecords();
    expect(() => validate(earlyNull)).toThrow(
      /resource breaches.*independently recomputed/i,
    );

    const missingAppRss = createValidEvidenceRun("smoke");
    missingAppRss.summary.stages[0].resources
      .resource_samples[1].app_rss_bytes = null;
    missingAppRss.writeRecords();
    expect(() => validate(missingAppRss)).toThrow(
      /resource breaches.*independently recomputed/i,
    );

    const rawCeiling = createValidEvidenceRun("smoke");
    const excessiveRss = 4 * 1024 * 1024 * 1024 + 1;
    for (const sample of rawCeiling.summary.stages[0]
      .resources.resource_samples) {
      sample.app_rss_bytes = excessiveRss;
    }
    Object.assign(rawCeiling.summary.stages[0].resources, {
      max_app_rss_bytes: excessiveRss,
      first_app_rss_bytes: excessiveRss,
      final_app_rss_bytes: excessiveRss,
    });
    rawCeiling.writeRecords();
    expect(() => validate(rawCeiling)).toThrow(
      /resource breaches.*independently recomputed/i,
    );
  });

  it("recomputes soak RSS windows and growth from raw samples rather than trusting the gate", () => {
    const derived = createValidEvidenceRun("soak");
    const derivedGate = derived.summary.gates.find(
      (gate: JsonRecord) => gate.stage === "soak-no-growth",
    );
    derivedGate.evidence.rss.baseline_window.median_bytes += 1;
    derived.writeRecords();
    expect(() => validate(derived)).toThrow(
      /soak no-growth gate.*independently recomputed/i,
    );

    const growth = createValidEvidenceRun("soak");
    const soak = growth.summary.stages.find(
      (stage: JsonRecord) => stage.stage === "soak-25",
    );
    const terminalRss = 200 * 1024 * 1024;
    for (const sample of soak.resources.resource_samples) {
      if (sample.elapsed_milliseconds >= 3_300_000) {
        sample.app_rss_bytes = terminalRss;
      }
    }
    soak.resources.max_app_rss_bytes = terminalRss;
    soak.resources.final_app_rss_bytes = terminalRss;
    growth.writeRecords();
    expect(() => validate(growth)).toThrow(
      /soak no-growth gate.*independently recomputed/i,
    );

    const sparseWindow = createValidEvidenceRun("soak");
    const sparseSoak = sparseWindow.summary.stages.find(
      (stage: JsonRecord) => stage.stage === "soak-25",
    );
    sparseSoak.resources.resource_samples =
      sparseSoak.resources.resource_samples.filter(
        (sample: JsonRecord) =>
          sample.elapsed_milliseconds < 300_000 ||
          sample.elapsed_milliseconds >= 600_000 ||
          sample.elapsed_milliseconds % 10_000 === 0,
      );
    sparseSoak.resources.samples =
      sparseSoak.resources.resource_samples.length;
    sparseWindow.writeRecords();
    expect(() => validate(sparseWindow)).toThrow(
      /soak no-growth gate.*independently recomputed/i,
    );
  });

  it("recomputes stats metrics and request mix instead of trusting summaries", () => {
    const rawMismatch = createValidEvidenceRun("smoke");
    const stage = rawMismatch.summary.stages[0];
    const statsName = "smoke-1_stats.csv";
    const statsPath = path.join(
      rawMismatch.reportDirectory,
      statsName,
    );
    const changedStats = readFileSync(statsPath, "utf8").replace(
      ",Aggregated,29,0,",
      ",Aggregated,30,0,",
    );
    rewriteArtifact(
      rawMismatch,
      stage,
      statsName,
      changedStats,
    );
    expect(() => validate(rawMismatch)).toThrow(
      /named request\/failure totals.*Aggregated/i,
    );

    const duplicate = createValidEvidenceRun("smoke");
    const duplicateStage = duplicate.summary.stages[0];
    const duplicateStats = readFileSync(
      path.join(duplicate.reportDirectory, statsName),
      "utf8",
    ).split("\n");
    duplicateStats.splice(2, 0, duplicateStats[1]);
    rewriteArtifact(
      duplicate,
      duplicateStage,
      statsName,
      duplicateStats.join("\n"),
    );
    expect(() => validate(duplicate)).toThrow(
      /duplicate method\/name row/i,
    );

    const finalMix = createValidEvidenceRun("baseline");
    finalMix.summary.request_mix.reads_dominant = false;
    finalMix.writeRecords();
    expect(() => validate(finalMix)).toThrow(
      /final request mix does not reconcile/i,
    );

    const bareGate = createValidEvidenceRun("baseline");
    const stableGate = bareGate.summary.gates.find(
      (gate: JsonRecord) =>
        gate.stage === "stable-request-names",
    );
    delete stableGate.invalid_names;
    bareGate.writeRecords();
    expect(() => validate(bareGate)).toThrow(
      /stable request names gate.*recomputed/i,
    );
  });

  it("enforces raw per-stage request and RPS ceilings before trusting summaries", () => {
    const requests = createValidEvidenceRun("smoke");
    const requestStage = requests.summary.stages[0];
    const statsName = "smoke-1_stats.csv";
    const ceilingStats = readFileSync(
      path.join(requests.reportDirectory, statsName),
      "utf8",
    )
      .replace(
        `${GET_REQUEST},20,0,`,
        `${GET_REQUEST},199991,0,`,
      )
      .replace(
        ",Aggregated,29,0,",
        ",Aggregated,200000,0,",
      );
    rewriteArtifact(
      requests,
      requestStage,
      statsName,
      ceilingStats,
    );
    expect(() => validate(requests)).toThrow(
      /reached the canonical per-stage request ceiling/i,
    );

    const rps = createValidEvidenceRun("smoke");
    const rpsStage = rps.summary.stages[0];
    const historyName = "smoke-1_stats_history.csv";
    const ceilingHistory = readFileSync(
      path.join(rps.reportDirectory, historyName),
      "utf8",
    ).replace(
      ",Aggregated,0,0,",
      ",Aggregated,60,0,",
    );
    rewriteArtifact(
      rps,
      rpsStage,
      historyName,
      ceilingHistory,
    );
    expect(() => validate(rps)).toThrow(
      /reached the canonical requests-per-second ceiling/i,
    );
  });

  it("requires nonempty, one-to-one mutation semantics for every successful POST", () => {
    const fixture = createValidEvidenceRun("smoke");
    const stage = fixture.summary.stages[0];
    const semanticName =
      "smoke-1_semantic-verifications.json";
    const emptyEvidence = {
      schema_version: "1.0.0",
      successful_submissions: {},
      semantic_verifications: {},
      pending_verifications: {},
    };
    stage.semantic_verifications = emptyEvidence;
    rewriteArtifact(
      fixture,
      stage,
      semanticName,
      `${JSON.stringify(emptyEvidence, null, 2)}\n`,
    );

    expect(() => validate(fixture)).toThrow(
      /semantic verification/i,
    );

    const mismatch = createValidEvidenceRun("smoke");
    const mismatchStage = mismatch.summary.stages[0];
    const mismatchEvidence = structuredClone(
      mismatchStage.semantic_verifications,
    );
    const requestName =
      mutationReportModule
        .REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0];
    mismatchEvidence.semantic_verifications[requestName] = 0;
    mismatchEvidence.pending_verifications[requestName] = 1;
    mismatchStage.semantic_verifications = mismatchEvidence;
    rewriteArtifact(
      mismatch,
      mismatchStage,
      semanticName,
      `${JSON.stringify(mismatchEvidence, null, 2)}\n`,
    );
    expect(() => validate(mismatch)).toThrow(
      /semantic verification/i,
    );
  });

  it("reconciles history peak, duration, failure halves, failures, and exceptions", () => {
    const peak = createValidEvidenceRun("smoke");
    const peakStage = peak.summary.stages[0];
    const historyName = "smoke-1_stats_history.csv";
    const changedHistory = readFileSync(
      path.join(peak.reportDirectory, historyName),
      "utf8",
    ).replaceAll(",1,,Aggregated,", ",0,,Aggregated,");
    rewriteArtifact(
      peak,
      peakStage,
      historyName,
      changedHistory,
    );
    expect(() => validate(peak)).toThrow(
      /achieved peak users/i,
    );

    const duration = createValidEvidenceRun("smoke");
    const durationStage = duration.summary.stages[0];
    const shortHistory = buildHistoryCsv({
      durationSeconds: 20,
      users: 1,
    });
    rewriteArtifact(
      duration,
      durationStage,
      historyName,
      shortHistory,
    );
    expect(() => validate(duration)).toThrow(
      /duration does not reconcile/i,
    );

    const failures = createValidEvidenceRun("smoke");
    const failureStage = failures.summary.stages[0];
    rewriteArtifact(
      failures,
      failureStage,
      "smoke-1_failures.csv",
      [
        "Method,Name,Error,Occurrences,First Seen,Last Seen",
        `POST,${mutationReportModule.REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0]},HTTP 409,1,1,1`,
        "",
      ].join("\n"),
    );
    expect(() => validate(failures)).toThrow(
      /failure occurrences.*0.*received 1/i,
    );

    const exceptions = createValidEvidenceRun("smoke");
    const exceptionStage = exceptions.summary.stages[0];
    rewriteArtifact(
      exceptions,
      exceptionStage,
      "smoke-1_exceptions.csv",
      "Count,Message,Traceback,Nodes\n1,boom,trace,worker\n",
    );
    expect(() => validate(exceptions)).toThrow(
      /exception count.*1/i,
    );

    const laggedHistory = createValidEvidenceRun("smoke");
    const laggedStage = laggedHistory.summary.stages[0];
    const periodicTail = readFileSync(
      path.join(
        laggedHistory.reportDirectory,
        historyName,
      ),
      "utf8",
    ).replace(
      ",29,0,10,10,5,20,10\n",
      ",28,0,10,10,5,20,10\n",
    );
    rewriteArtifact(
      laggedHistory,
      laggedStage,
      historyName,
      periodicTail,
    );
    expect(() => validate(laggedHistory)).not.toThrow();

    const ahead = createValidEvidenceRun("smoke");
    const aheadStage = ahead.summary.stages[0];
    const aheadTail = readFileSync(
      path.join(ahead.reportDirectory, historyName),
      "utf8",
    ).replace(
      ",29,0,10,10,5,20,10\n",
      ",30,0,10,10,5,20,10\n",
    );
    rewriteArtifact(
      ahead,
      aheadStage,
      historyName,
      aheadTail,
    );
    expect(() => validate(ahead)).toThrow(
      /history.*ahead of stats\.csv/i,
    );

    const regressed = createValidEvidenceRun("smoke");
    const regressedStage = regressed.summary.stages[0];
    const regressedTail = readFileSync(
      path.join(
        regressed.reportDirectory,
        historyName,
      ),
      "utf8",
    ).replace(
      ",29,0,10,10,5,20,10\n",
      ",9,0,10,10,5,20,10\n",
    );
    rewriteArtifact(
      regressed,
      regressedStage,
      historyName,
      regressedTail,
    );
    expect(() => validate(regressed)).toThrow(
      /ordered, nondecreasing aggregate evidence/i,
    );
  });

  it("reconciles periodic cumulative history with Locust rolling Requests/s", () => {
    const equalTimestamp =
      createValidEvidenceRun("smoke");
    const equalStage = equalTimestamp.summary.stages[0];
    const historyName = "smoke-1_stats_history.csv";
    const equalRows = readFileSync(
      path.join(
        equalTimestamp.reportDirectory,
        historyName,
      ),
      "utf8",
    )
      .trimEnd()
      .split("\n");
    const equalPrevious = equalRows[2].split(",");
    const equalRising = equalRows[3].split(",");
    equalRising[0] = equalPrevious[0];
    equalRows[3] = equalRising.join(",");
    rewriteArtifact(
      equalTimestamp,
      equalStage,
      historyName,
      `${equalRows.join("\n")}\n`,
    );
    expect(() => validate(equalTimestamp)).toThrow(
      /timestamps must be strictly increasing/i,
    );

    const sparse = createValidEvidenceRun("smoke");
    const sparseStage = sparse.summary.stages[0];
    const sparseRows = readFileSync(
      path.join(sparse.reportDirectory, historyName),
      "utf8",
    )
      .trimEnd()
      .split("\n");
    sparseRows.splice(2, 1);
    rewriteArtifact(
      sparse,
      sparseStage,
      historyName,
      `${sparseRows.join("\n")}\n`,
    );
    expect(() => validate(sparse)).toThrow(
      /periodic-sample gap bound/i,
    );

    const contradiction =
      createValidEvidenceRun("smoke");
    const contradictionStage =
      contradiction.summary.stages[0];
    const contradictionRows = readFileSync(
      path.join(
        contradiction.reportDirectory,
        historyName,
      ),
      "utf8",
    )
      .trimEnd()
      .split("\n");
    const contradicted = contradictionRows[6].split(",");
    contradicted[4] = "50";
    contradictionRows[6] = contradicted.join(",");
    rewriteArtifact(
      contradiction,
      contradictionStage,
      historyName,
      `${contradictionRows.join("\n")}\n`,
    );
    expect(() => validate(contradiction)).toThrow(
      /reported Requests\/s contradicts.*cumulative request counts/i,
    );

    const hiddenCeiling =
      createValidEvidenceRun("smoke");
    const hiddenStage = hiddenCeiling.summary.stages[0];
    const statsName = "smoke-1_stats.csv";
    const highStats = readFileSync(
      path.join(
        hiddenCeiling.reportDirectory,
        statsName,
      ),
      "utf8",
    )
      .replace(
        `${GET_REQUEST},20,0,`,
        `${GET_REQUEST},591,0,`,
      )
      .replace(
        ",Aggregated,29,0,",
        ",Aggregated,600,0,",
      );
    rewriteArtifact(
      hiddenCeiling,
      hiddenStage,
      statsName,
      highStats,
    );
    const highRows = readFileSync(
      path.join(
        hiddenCeiling.reportDirectory,
        historyName,
      ),
      "utf8",
    )
      .trimEnd()
      .split("\n");
    const highHeader = highRows[0].split(",");
    const timestampIndex = highHeader.indexOf("Timestamp");
    const requestIndex = highHeader.indexOf(
      "Total Request Count",
    );
    for (let index = 1; index < highRows.length; index += 1) {
      const row = highRows[index].split(",");
      const elapsed = Number(row[timestampIndex]) - 1_000;
      row[requestIndex] =
        elapsed < 10
          ? "0"
          : String(
              Math.min(
                600,
                300 +
                  Math.floor(
                    (300 * (elapsed - 10)) / 170,
                  ),
              ),
            );
      highRows[index] = row.join(",");
    }
    const highDataRows = highRows
      .slice(1)
      .map((row) => row.split(","));
    for (
      let index = 0;
      index < highDataRows.length;
      index += 1
    ) {
      const current = highDataRows[index];
      const currentTimestamp = Number(
        current[timestampIndex],
      );
      const latestAtOrBefore = (target: number) => {
        for (
          let previousIndex = index - 1;
          previousIndex >= 0;
          previousIndex -= 1
        ) {
          if (
            Number(
              highDataRows[previousIndex][
                timestampIndex
              ],
            ) <= target
          ) {
            return highDataRows[previousIndex];
          }
        }
        return undefined;
      };
      const recent = latestAtOrBefore(
        currentTimestamp - 2,
      );
      const older = latestAtOrBefore(
        currentTimestamp - 12,
      );
      current[4] =
        recent && older
          ? String(
              (Number(recent[requestIndex]) -
                Number(older[requestIndex])) /
                (Number(recent[timestampIndex]) -
                  Number(older[timestampIndex])),
            )
          : "0";
    }
    highRows.splice(
      1,
      highDataRows.length,
      ...highDataRows.map((row) => row.join(",")),
    );
    rewriteArtifact(
      hiddenCeiling,
      hiddenStage,
      historyName,
      `${highRows.join("\n")}\n`,
    );
    expect(() => validate(hiddenCeiling)).toThrow(
      /requests-per-second ceiling.*independently derived/i,
    );

    const hiddenTail = createValidEvidenceRun("smoke");
    const tailStage = hiddenTail.summary.stages[0];
    const tailStats = readFileSync(
      path.join(hiddenTail.reportDirectory, statsName),
      "utf8",
    )
      .replace(
        `${GET_REQUEST},20,0,`,
        `${GET_REQUEST},320,0,`,
      )
      .replace(
        ",Aggregated,29,0,",
        ",Aggregated,329,0,",
      );
    rewriteArtifact(
      hiddenTail,
      tailStage,
      statsName,
      tailStats,
    );
    expect(() => validate(hiddenTail)).toThrow(
      /bounded 5-second periodic-history freshness lag/i,
    );
  });

  it("requires canonical raw report headers and occurrence-counted 5xx evidence", () => {
    const failureHeader = createValidEvidenceRun("smoke");
    rewriteArtifact(
      failureHeader,
      failureHeader.summary.stages[0],
      "smoke-1_failures.csv",
      "Method,Name,Error\n",
    );
    expect(() => validate(failureHeader)).toThrow(
      /failure CSV has an invalid canonical header/i,
    );

    const exceptionHeader =
      createValidEvidenceRun("smoke");
    rewriteArtifact(
      exceptionHeader,
      exceptionHeader.summary.stages[0],
      "smoke-1_exceptions.csv",
      "Count,Message\n",
    );
    expect(() => validate(exceptionHeader)).toThrow(
      /exception CSV has an invalid canonical header/i,
    );

    const occurrences = createValidEvidenceRun("smoke");
    rewriteArtifact(
      occurrences,
      occurrences.summary.stages[0],
      "smoke-1_failures.csv",
      [
        "Method,Name,Error,Occurrences,First Seen,Last Seen",
        `GET,${GET_REQUEST},HTTP 503,3,1,2`,
        "",
      ].join("\n"),
    );
    expect(() => validate(occurrences)).toThrow(
      /unexpected 5xx count.*0.*received 3/i,
    );
  });

  it("recomputes capacity users/RPS, cumulative usage, timed coverage, and spike recovery", () => {
    const capacity = createValidEvidenceRun("ramp");
    capacity.summary.local_capacity
      .highest_sustainable_local_users = 25;
    capacity.writeRecords();
    expect(() => validate(capacity)).toThrow(
      /local-capacity.*do not reconcile/i,
    );

    const usage = createValidEvidenceRun("baseline");
    usage.summary.cumulative_request_usage.locust_requests += 1;
    usage.writeRecords();
    expect(() => validate(usage)).toThrow(
      /cumulative request usage/i,
    );

    const coverage = createValidEvidenceRun("full");
    const coverageGate = coverage.summary.gates.find(
      (gate: JsonRecord) =>
        gate.stage === "timed-mutation-coverage",
    );
    coverageGate.covered = [];
    coverage.writeRecords();
    expect(() => validate(coverage)).toThrow(
      /timed mutation coverage.*recomputed/i,
    );

    const recovery = createValidEvidenceRun("spike");
    recovery.summary.gates = recovery.summary.gates.filter(
      (gate: JsonRecord) =>
        gate.stage !== SPIKE_RECOVERY_COMPARISON,
    );
    recovery.writeRecords();
    expect(() => validate(recovery)).toThrow(
      /missing required gate.*spike-recovery-comparison/i,
    );
  });

  it("requires exact artifact inventories, digests, and nonempty retained content", () => {
    const missingInventory = createValidEvidenceRun("smoke");
    delete missingInventory.summary.stages[0].artifacts[
      "smoke-1.html"
    ];
    missingInventory.writeRecords();
    expect(() => validate(missingInventory)).toThrow(
      /artifact inventory.*exactly/i,
    );

    const extraInventory = createValidEvidenceRun("smoke");
    extraInventory.summary.stages[0].artifacts[
      "smoke-1_extra.csv"
    ] = "0".repeat(64);
    extraInventory.writeRecords();
    expect(() => validate(extraInventory)).toThrow(
      /artifact inventory.*exactly/i,
    );

    const missingFile = createValidEvidenceRun("smoke");
    rmSync(
      path.join(missingFile.reportDirectory, "smoke-1.html"),
    );
    expect(() => validate(missingFile)).toThrow(
      /smoke-1\.html.*required/i,
    );

    const digestMismatch = createValidEvidenceRun("smoke");
    writeFileSync(
      path.join(
        digestMismatch.reportDirectory,
        "smoke-1.html",
      ),
      "<html>changed</html>\n",
      { mode: 0o600 },
    );
    expect(() => validate(digestMismatch)).toThrow(
      /digest does not match/i,
    );

    const emptyHtml = createValidEvidenceRun("smoke");
    rewriteArtifact(
      emptyHtml,
      emptyHtml.summary.stages[0],
      "smoke-1.html",
      " \n",
    );
    expect(() => validate(emptyHtml)).toThrow(
      /smoke-1\.html.*recognizable Locust HTML/i,
    );

    const arbitraryHtml = createValidEvidenceRun("smoke");
    rewriteArtifact(
      arbitraryHtml,
      arbitraryHtml.summary.stages[0],
      "smoke-1.html",
      "<!DOCTYPE html><html><body>arbitrary</body></html>\n",
    );
    expect(() => validate(arbitraryHtml)).toThrow(
      /recognizable Locust HTML/i,
    );

    const orphan = createValidEvidenceRun("smoke");
    writePrivateFile(
      path.join(
        orphan.reportDirectory,
        "smoke-1_interrupted.partial",
      ),
      "partial\n",
    );
    expect(() => validate(orphan)).toThrow(
      /orphan mutation stage artifact/i,
    );
  });

  it("independently enforces owner-only permissions and sanitization", () => {
    const mode = createValidEvidenceRun("smoke");
    chmodSync(
      path.join(mode.reportDirectory, "smoke-1.html"),
      0o644,
    );
    expect(() => validate(mode)).toThrow(
      /owner-only 0600 permissions/i,
    );

    const directoryMode = createValidEvidenceRun("smoke");
    chmodSync(directoryMode.reportDirectory, 0o755);
    expect(() => validate(directoryMode)).toThrow(
      /directory.*0700 permissions/i,
    );

    const privateContent = createValidEvidenceRun("smoke");
    rewriteArtifact(
      privateContent,
      privateContent.summary.stages[0],
      "smoke-1.html",
      "<!DOCTYPE html><html><head><title>Locust</title></head><body>Locust Test Report cadence-load-secret@example.invalid</body></html>\n",
    );
    expect(() => validate(privateContent)).toThrow(
      /private load-session material/i,
    );

    for (const privateNeedle of [
      "550e8400-e29b-41d4-a716-446655440000",
      "/Users/alice/private/session.json",
      "cadence-load-fake-abcdefghijklmnop",
      "cadence-load-process-abcdefghijklmnop",
    ]) {
      const fixture = createValidEvidenceRun("smoke");
      rewriteArtifact(
        fixture,
        fixture.summary.stages[0],
        "smoke-1.html",
        `<!DOCTYPE html><html><head><title>Locust</title></head><body>Locust Test Report ${privateNeedle}</body></html>\n`,
      );
      expect(() => validate(fixture)).toThrow(
        /private identifier, secret, or absolute local path|private load-session material/i,
      );
    }
  });

  it("requires parseable final records and one exact run-id argument", () => {
    const missingCompletion = createValidEvidenceRun("smoke");
    rmSync(
      path.join(
        missingCompletion.reportDirectory,
        "completion.json",
      ),
    );
    expect(() => validate(missingCompletion)).toThrow(
      /completion\.json.*required/i,
    );

    const malformed = createValidEvidenceRun("smoke");
    writePrivateFile(
      path.join(malformed.reportDirectory, "summary.json"),
      '{"status":',
    );
    expect(() => validate(malformed)).toThrow(
      /summary\.json.*valid JSON/i,
    );

    expect(
      evidenceModule.parseMutationEvidenceArgs([
        "--run-id",
        RUN_ID,
      ]),
    ).toEqual({ runId: RUN_ID });
    expect(() =>
      evidenceModule.parseMutationEvidenceArgs([]),
    ).toThrow(/--run-id/i);
    expect(() =>
      evidenceModule.parseMutationEvidenceArgs([
        "--run-id",
        "../../outside",
      ]),
    ).toThrow(/run id/i);
  });

  it("requires producer-exact declaration, summary, and completion schemas", () => {
    const legacy = createValidEvidenceRun("smoke");
    legacy.declaration.schema_version = "1.0.0";
    legacy.summary.schema_version = "1.0.0";
    legacy.completion.schema_version = "1.0.0";
    legacy.writeRecords();
    expect(() => validate(legacy)).toThrow(
      /legacy mutation run-evidence schema 1\.0\.0.*raw resource samples.*rerun/i,
    );

    const declaration = createValidEvidenceRun("smoke");
    declaration.declaration.unexpected = true;
    declaration.writeRecords();
    expect(() => validate(declaration)).toThrow(
      /declaration\.json.*invalid schema/i,
    );

    const summary = createValidEvidenceRun("smoke");
    delete summary.summary.caveats;
    summary.writeRecords();
    expect(() => validate(summary)).toThrow(
      /summary\.json.*invalid schema/i,
    );

    const completion = createValidEvidenceRun("smoke");
    completion.completion.extra = null;
    completion.writeRecords();
    expect(() => validate(completion)).toThrow(
      /completion\.json.*invalid schema/i,
    );

    const timestamp = createValidEvidenceRun("smoke");
    timestamp.declaration.declared_at =
      "2026-02-31T20:00:00.000Z";
    timestamp.writeRecords();
    expect(() => validate(timestamp)).toThrow(
      /timestamp.*canonical UTC ISO instant/i,
    );

    const caveats = createValidEvidenceRun("smoke");
    caveats.summary.caveats[0] = "changed";
    caveats.writeRecords();
    expect(() => validate(caveats)).toThrow(
      /exact local-capacity caveats/i,
    );
  });
});

function createValidEvidenceRun(
  suite: SuiteName = "full",
): JsonRecord {
  const plan = evidenceModule.canonicalMutationSuitePlan(suite);
  const root = mkdtempSync(
    path.join(tmpdir(), "cadence-mutation-evidence-"),
  );
  temporaryRoots.push(root);
  const runsRoot = path.join(root, ".runs");
  const reportDirectory = path.join(runsRoot, RUN_ID);
  mkdirSync(reportDirectory, {
    recursive: true,
    mode: 0o700,
  });
  chmodSync(reportDirectory, 0o700);

  const stageResults = plan.stages.map((stage) =>
    createStageResult(
      reportDirectory,
      stage,
      plan.cohortAllocation,
    ),
  );
  const operatorRequired = stageResults.some(
    (stage) => stage.group === "operator_overlap",
  );
  const statusTransitionCount =
    stageResults.filter(
      (stage) => stage.group !== "contention",
    ).length *
    mutationReportModule.STATUS_TRANSITION_REQUEST_NAMES.length;
  const duePastApplicable = stageResults.some(
    (stage) =>
      stage.stage === "smoke-1" ||
      stage.stage === "mixed-calibration-1",
  );
  const dueEvidence = {
    tracked_occurrences: 1,
    tracked_deliveries: 1,
    exercised_occurrences: duePastApplicable ? 1 : 0,
    clear_events: duePastApplicable ? 1 : 0,
    unresolved_occurrences: 1,
    cancelled_deliveries: duePastApplicable ? 1 : 0,
    reactivated_deliveries: 0,
  };
  const before = createIntegrityCheckpoint({
    label: "before",
    identityCount: plan.identityCount,
    cohortCounts: plan.cohortCounts,
    statusEventCount: 0,
    operatorSentCount: 0,
    dueEvidence: {
      tracked_occurrences: 1,
      tracked_deliveries: 1,
      exercised_occurrences: 0,
      clear_events: 0,
      unresolved_occurrences: 1,
      cancelled_deliveries: 0,
      reactivated_deliveries: 0,
    },
  });
  const stageCheckpoints = stageResults
    .filter(
      (stage) =>
        (
          stage.declaration as CanonicalStage
        ).integrityCheckpoint,
    )
    .map((stage) =>
      createIntegrityCheckpoint({
        label: `after-${stage.stage}`,
        identityCount: plan.identityCount,
        cohortCounts: plan.cohortCounts,
        statusEventCount: statusTransitionCount,
        operatorSentCount:
          operatorRequired &&
          stageResults.findIndex(
            (candidate) =>
              candidate.stage === stage.stage,
          ) >=
            stageResults.findIndex(
              (candidate) =>
                candidate.group === "operator_overlap",
            )
            ? 1
            : 0,
        dueEvidence,
      }),
    );
  const genericAfter = createIntegrityCheckpoint({
    label: "after",
    identityCount: plan.identityCount,
    cohortCounts: plan.cohortCounts,
    statusEventCount: statusTransitionCount,
    operatorSentCount: operatorRequired ? 1 : 0,
    dueEvidence,
  });
  const checkpoints = [
    before,
    ...(stageCheckpoints.length > 0
      ? stageCheckpoints
      : [genericAfter]),
  ];
  const after = checkpoints.at(-1)!;

  const primaryGates = stageResults.map((stage) =>
    createPrimaryStageGate(stage, stageResults),
  );
  const gates = [...primaryGates];
  if (suite === "spike" || suite === "full") {
    const baseline = stageResults.find(
      (stage) => stage.stage === "spike-baseline-10",
    );
    const recovery = stageResults.find(
      (stage) => stage.stage === "spike-recovery-10",
    );
    gates.push({
      ...readReportModule.evaluateRecoveryGate({
        baseline: baseline.metrics,
        recovery: recovery.metrics,
      }),
      stage: SPIKE_RECOVERY_COMPARISON,
    });
  }

  const representativeStages = stageResults.filter(
    (stage) => stage.group !== "mixed_calibration",
  );
  const representativeMetrics =
    aggregateSequentialMetrics(representativeStages);
  gates.push({
    stage: "stable-request-names",
    ...mutationReportModule.evaluateStableRequestNameGate({
      requestsByName:
        representativeMetrics.requests_by_name,
      interactionManifest,
    }),
  });
  for (const stage of representativeStages.filter(
    (candidate) => candidate.workload === "mixed",
  )) {
    gates.push({
      stage: `${stage.stage}-request-mix`,
      ...mutationReportModule.evaluateRequestMixGate(
        stage.metrics,
      ),
    });
  }
  if (suite === "full") {
    gates.push({
      stage: "timed-mutation-coverage",
      ...mutationReportModule.evaluateTimedMutationCoverage({
        requestsByName:
          representativeMetrics.requests_by_name,
        semanticVerifications:
          aggregateSemanticEvidence(representativeStages)
            .semantic_verifications,
      }),
    });
  }
  gates.push({
    stage: "status-event-correlation",
    ...mutationReportModule.evaluateStatusEventCorrelation({
      requestsByName: stageResults
        .filter((stage) => stage.group !== "contention")
        .flatMap(
          (stage) => stage.metrics.requests_by_name,
        ),
      statusEventDelta: statusTransitionCount,
      statusTransitionEvidence:
        after.statusTransitionEvidence,
      requireAppended: suite === "full",
    }),
  });
  gates.push({
    stage: "due-past-reminder-non-reactivation",
    ...mutationReportModule.evaluateDuePastReminderNonReactivation(
      {
        evidence: dueEvidence,
        requireExercised: plan.stages.some(
          (stage) =>
            stage.name === "smoke-1" ||
            stage.name === "mixed-calibration-1",
        ),
      },
    ),
  });

  const timezoneEvidence = {
    captured_occurrences: 2,
    verified_occurrences: 2,
    violations: 0,
  };
  if (
    stageResults.some(
      (stage) => stage.group === "timezone_changed",
    )
  ) {
    gates.push({
      stage: "timezone-dynamic-preservation",
      ...mutationReportModule.evaluateTimezoneDynamicOccurrencePreservation(
        timezoneEvidence,
      ),
    });
  }
  for (const checkpoint of checkpoints) {
    gates.push({
      stage: `integrity-${checkpoint.label}`,
      ...mutationReportModule.evaluateMutationIntegrityGate(
        checkpoint,
      ),
    });
  }

  const soak = stageResults.find(
    (stage) => stage.group === "soak",
  );
  if (soak) {
    const highestRamp = stageResults
      .filter((stage) => stage.group === "ramp")
      .sort(
        (left, right) => right.users - left.users,
      )[0];
    gates.push({
      stage: `${soak.stage}-ramp-headroom`,
      passed: true,
      failures: [],
      basis: "passing_ramp_plateau",
      soak_users: soak.users,
      supporting_ramp_stage: highestRamp.stage,
      supporting_ramp_users: highestRamp.users,
    });
    gates.push({
      stage: "soak-no-growth",
      ...mutationReportModule.evaluateSoakNoGrowthGate({
        resourceSamples: soak.resources.resource_samples,
        declaredDurationSeconds: soak.duration_seconds,
        firstResource: {
          databaseConnections: 5,
        },
        finalResource: {
          databaseConnections: 5,
        },
        failureHalves: soak.failure_halves,
      }),
    });
    gates.push({
      stage: "soak-plateau-provenance",
      passed: true,
      failures: [],
      basis: "passing_plateau",
      soak_users: [soak.users],
      boundary_stage: highestRamp.stage,
      boundary_users: highestRamp.users,
    });
  } else {
    gates.push({
      stage: "soak-plateau-provenance",
      passed: true,
      failures: [],
      basis: "not_applicable",
      soak_users: [],
      boundary_stage: null,
      boundary_users: null,
    });
  }

  if (operatorRequired) {
    gates.push({
      stage: "operator-provider-reconciliation",
      passed: true,
      failures: [],
      evidence: {
        operator_requests: 3,
        fake_provider_accepted: 1,
        reminder_process_totals: {
          sent: 1,
          failed: 0,
          cancelled: 0,
        },
      },
    });
    gates.push({
      stage: "operator-isolation-and-causal-repair",
      passed: true,
      failures: [],
      evidence: {
        operator_requests: 3,
        isolation_checks: 5,
        isolated_accounts: plan.identityCount,
        prepared_occurrence_sync_accounts: 1,
        verified_fresh_occurrence_sync_accounts: 1,
        causal_occurrence_repair_proofs: 1,
      },
    });
  }

  const localCapacity = buildLocalCapacity(
    stageResults,
    primaryGates,
  );
  const operatorRequests = operatorRequired ? 3 : 0;
  const locustRequests = stageResults.reduce(
    (total, stage) => total + stage.metrics.requests,
    0,
  );
  const runtime = {
    source: {
      commit: "a".repeat(40),
      working_tree_dirty: true,
    },
    hardware: {
      platform: "darwin",
      release: "test-release",
      architecture: "arm64",
      cpu_model: "test cpu",
      logical_cpu_count: 8,
      memory_bytes: 16 * 1024 * 1024 * 1024,
    },
    runtime: {
      node: "v22.0.0",
      next: "16.0.0",
      python: "Python 3.13.0",
      locust: "locust 2.43.3",
      docker: "28.0.0",
      supabase_cli: "2.0.0",
    },
    application: {
      target_classification: "local",
      base_url: "http://127.0.0.1:3100",
      next_mode: "production persistent Node process",
      supabase_mode: "project-local CLI Docker stack",
      provider_mode: "loopback fake Sequenzy only",
      web_push_enabled: false,
      interpretation:
        "Local persistent-Node mutation evidence only; not hosted or production capacity.",
    },
  };
  const requestCeilingScope = {
    maximum_requests: "per Locust stage",
    cumulative_supervised_requests:
      plan.cumulativeRequestCeiling,
    cumulative_includes_operator_requests: true,
  };
  const resourceCeilings = {
    max_host_load_per_logical_cpu: 2,
    min_available_memory_bytes: 512 * 1024 * 1024,
    max_app_rss_bytes: 4 * 1024 * 1024 * 1024,
    max_locust_rss_bytes: 4 * 1024 * 1024 * 1024,
  };
  const abortThresholds = {
    unexpected_request_failure_ratio_percent:
      "less than 0.5",
    unexpected_5xx_ratio:
      plan.ceilings.unexpected_5xx_ratio,
    unexpected_5xx_window_seconds:
      plan.ceilings.unexpected_5xx_window_seconds,
    unexpected_5xx_consecutive_windows:
      plan.ceilings.unexpected_5xx_consecutive_windows,
    repeated_database_refusals: 3,
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
    cross_owner_or_real_provider_attempt: "immediate",
    false_fresh_or_integrity_failure: "at checkpoint",
    per_stage_request_runtime_user_rps_ceiling: "immediate",
    cumulative_suite_request_ceiling: "after each bounded stage",
  };
  const cleanup = {
    runId: RUN_ID,
    dryRun: false,
    matchedUsers: plan.identityCount,
    deletedUsers: plan.identityCount,
    residualProductRows: 0,
  };
  const artifactInspection = {
    status: "passed",
    completed_stage_count: stageResults.length,
    expected_stage_artifact_count: stageResults.length * 6,
    retained_stage_artifact_count: stageResults.length * 6,
    orphan_stage_artifact_count: 0,
  };
  const fakeProvider = {
    snapshot: {
      schema_version: "1.0.0",
      target_classification: "local",
      provider: "fake_sequenzy",
      requests_total: operatorRequired ? 1 : 0,
      accepted: operatorRequired ? 1 : 0,
      rejected: 0,
      unique_delivery_fingerprints:
        operatorRequired ? 1 : 0,
      duplicate_send_attempts: 0,
      web_push_attempts: 0,
      rejection_reasons: {},
      response_statuses: {},
    },
    operator_required: operatorRequired,
  };
  if (operatorRequired) {
    const occurrenceResult = {
      checked: 1,
      synced: 1,
      skipped: 0,
      failed: 0,
    };
    const reminderResult = {
      checked: 1,
      claimed: 1,
      skipped: 0,
      sent: 1,
      failed: 0,
      cancelled: 0,
    };
    const replayResult = {
      checked: 0,
      claimed: 0,
      skipped: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };
    fakeProvider.snapshot.response_statuses = {
      "202": 1,
    };
    Object.assign(fakeProvider, {
      isolation_checks: 5,
      occurrence_sync_prepared_accounts: 1,
      occurrence_sync_verified_fresh_accounts: 1,
      occurrence_sync_causal_repair_proofs: 1,
      occurrence_request_count: 1,
      reminder_request_count: 2,
      final_replay: replayResult,
      requests: [
        {
          name: "SYS-OCCURRENCE-001 POST /api/occurrences/sync operator",
          status: 200,
          duration_ms: 10,
          result: occurrenceResult,
        },
        {
          name: "SYS-REMINDER-001 POST /api/reminders/process operator",
          status: 200,
          duration_ms: 10,
          result: reminderResult,
        },
        {
          name: "SYS-REMINDER-001 POST /api/reminders/process operator",
          status: 200,
          duration_ms: 10,
          result: replayResult,
        },
      ],
    });
  }
  const declaration = {
    schema_version: "1.1.0",
    run_id: RUN_ID,
    suite,
    declared_at: "2026-07-29T20:00:00.000Z",
    workload_classification: "mutation",
    identity_count: plan.identityCount,
    cohort_counts: structuredClone(plan.cohortCounts),
    contention_pair_count: plan.contentionPairCount,
    stages: structuredClone(plan.stages),
    task_weights: structuredClone(plan.taskWeights),
    read_task_keys: [...plan.readTaskKeys],
    think_time_seconds: structuredClone(
      plan.thinkTimeSeconds,
    ),
    read_weight_percent: plan.readWeightPercent,
    ceilings: structuredClone(plan.ceilings),
    request_ceiling_scope: structuredClone(
      requestCeilingScope,
    ),
    resource_ceilings: structuredClone(resourceCeilings),
    abort_thresholds: abortThresholds,
    runtime,
    caveats: [...MUTATION_EVIDENCE_CAVEATS],
  };
  const summary = {
    schema_version: "1.1.0",
    run_id: RUN_ID,
    suite,
    status: "passed",
    workload_classification: "mutation",
    identity_count: plan.identityCount,
    cohort_counts: structuredClone(plan.cohortCounts),
    contention_pair_count: plan.contentionPairCount,
    task_weights: structuredClone(plan.taskWeights),
    think_time_seconds: structuredClone(
      plan.thinkTimeSeconds,
    ),
    stages: stageResults,
    skipped_stages: [],
    session_renewals: stageResults.map((stage) =>
      createSessionRenewal(stage),
    ),
    gates,
    integrity: {
      before,
      after,
      checkpoints,
    },
    fake_provider: fakeProvider,
    timezone_occurrence_preservation:
      stageResults.some(
        (stage) => stage.group === "timezone_changed",
      )
        ? timezoneEvidence
        : null,
    request_mix:
      mutationReportModule.summarizeRequestMix(
        representativeMetrics,
      ),
    local_capacity: localCapacity,
    rls_smoke: "passed",
    cleanup: structuredClone(cleanup),
    runtime,
    ceilings: structuredClone(plan.ceilings),
    request_ceiling_scope: structuredClone(
      requestCeilingScope,
    ),
    cumulative_request_usage: {
      locust_requests: locustRequests,
      operator_requests: operatorRequests,
      total_requests: locustRequests + operatorRequests,
      ceiling: plan.cumulativeRequestCeiling,
      reached: false,
    },
    resource_ceilings: structuredClone(resourceCeilings),
    artifact_inspection: structuredClone(
      artifactInspection,
    ),
    caveats: [...MUTATION_EVIDENCE_CAVEATS],
    failure: null,
    inspection_failures: [],
  };
  const completion = {
    schema_version: "1.1.0",
    run_id: RUN_ID,
    suite,
    status: "passed",
    completed_stage_count: stageResults.length,
    artifact_inspection: structuredClone(
      artifactInspection,
    ),
    cleanup: structuredClone(cleanup),
    failure: null,
  };
  const writeRecords = () => {
    writeJson(
      path.join(reportDirectory, "declaration.json"),
      declaration,
    );
    writeJson(
      path.join(reportDirectory, "summary.json"),
      summary,
    );
    writeJson(
      path.join(reportDirectory, "completion.json"),
      completion,
    );
  };
  writeRecords();

  return {
    runsRoot,
    reportDirectory,
    declaration,
    summary,
    completion,
    writeRecords,
  };
}

function createStageResult(
  reportDirectory: string,
  declaration: CanonicalStage,
  cohortAllocation: string[],
): JsonRecord {
  const statsCsv = buildStatsCsv(declaration.durationSeconds);
  const parsedMetrics =
    readReportModule.parseLocustStatsCsv(statsCsv);
  const metrics = {
    ...parsedMetrics,
    request_mix:
      mutationReportModule.summarizeRequestMix(
        parsedMetrics,
      ),
  };
  const semanticVerifications = {
    schema_version: "1.0.0",
    successful_submissions: Object.fromEntries(
      mutationReportModule.REQUIRED_TIMED_MUTATION_REQUEST_NAMES.map(
        (name) => [name, 1],
      ),
    ),
    semantic_verifications: Object.fromEntries(
      mutationReportModule.REQUIRED_TIMED_MUTATION_REQUEST_NAMES.map(
        (name) => [name, 1],
      ),
    ),
    pending_verifications: Object.fromEntries(
      mutationReportModule.REQUIRED_TIMED_MUTATION_REQUEST_NAMES.map(
        (name) => [name, 0],
      ),
    ),
  };
  const artifactContents: Record<string, string> = {
    [`${declaration.name}.html`]:
      `<!DOCTYPE html><html><head><title>Locust</title></head><body>Locust Test Report: ${declaration.name}</body></html>\n`,
    [`${declaration.name}_exceptions.csv`]:
      "Count,Message,Traceback,Nodes\n",
    [`${declaration.name}_failures.csv`]:
      "Method,Name,Error,Occurrences,First Seen,Last Seen\n",
    [`${declaration.name}_semantic-verifications.json`]:
      `${JSON.stringify(semanticVerifications, null, 2)}\n`,
    [`${declaration.name}_stats.csv`]: statsCsv,
    [`${declaration.name}_stats_history.csv`]:
      buildHistoryCsv({
        durationSeconds: declaration.durationSeconds,
        users: declaration.users,
      }),
  };
  const artifacts: Record<string, string> = {};
  for (const [name, content] of Object.entries(
    artifactContents,
  )) {
    const filePath = path.join(reportDirectory, name);
    writePrivateFile(filePath, content);
    artifacts[name] = digest(filePath);
  }
  const resourceSamples = buildResourceSamples(
    declaration.durationSeconds,
  );
  return {
    stage: declaration.name,
    group: declaration.group,
    profile: declaration.profile,
    workload: declaration.workload,
    users: declaration.users,
    spawn_rate: declaration.spawnRate,
    duration_seconds: declaration.durationSeconds,
    achieved_duration_seconds: declaration.durationSeconds,
    achieved_peak_users: declaration.users,
    cohort_mix: activeCohortMix(
      declaration,
      cohortAllocation,
    ),
    metrics,
    failure_halves: {
      first: { requests: 14, failures: 0 },
      second: { requests: 15, failures: 0 },
    },
    unexpected_5xx: 0,
    exception_count: 0,
    semantic_verifications: semanticVerifications,
    resources: {
      samples: resourceSamples.length,
      max_host_load_1m: 1,
      max_host_load_per_logical_cpu: 0.125,
      min_available_memory_bytes: 1024 * 1024 * 1024,
      max_app_rss_bytes: 100,
      max_locust_rss_bytes: 100,
      first_app_rss_bytes: 100,
      final_app_rss_bytes: 100,
      first_locust_rss_bytes: 100,
      final_locust_rss_bytes: 100,
      resource_samples: resourceSamples,
      breaches: [],
    },
    locust_exit_code: 0,
    artifacts,
    declaration,
  };
}

function buildResourceSamples(durationSeconds: number) {
  return Array.from(
    { length: Math.floor(durationSeconds / 5) + 1 },
    (_, index) => {
      const elapsedMilliseconds = index * 5_000;
      return {
        elapsed_milliseconds: elapsedMilliseconds,
        host_load_1m: 1,
        host_load_per_logical_cpu: 0.125,
        available_memory_bytes: 1024 * 1024 * 1024,
        app_rss_bytes: 100,
        locust_rss_bytes:
          elapsedMilliseconds === durationSeconds * 1_000
            ? null
            : 100,
      };
    },
  );
}

function createPrimaryStageGate(
  stage: JsonRecord,
  stages: JsonRecord[],
) {
  const calibration = stages.find(
    (candidate) =>
      candidate.stage === "mixed-calibration-1",
  );
  const comparable = new Set([
    "mixed_baseline",
    "ramp",
    "spike",
    "soak",
    "breakpoint",
    "operator_overlap",
  ]);
  const usesCalibration =
    stage.workload === "mixed" &&
    comparable.has(String(stage.group));
  const raw = readReportModule.evaluateStageGates({
    stage: stage.stage,
    metrics: stage.metrics,
    warmBaselineP95: usesCalibration
      ? calibration.metrics.latency_ms.p95
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
  const semantic =
    mutationReportModule.evaluateSemanticVerificationGate({
      requestsByName: stage.metrics.requests_by_name,
      evidence: stage.semantic_verifications,
    });
  const gate: JsonRecord = {
    ...raw,
    passed: true,
    failures: [],
    semantic_verification: semantic,
    plateau_passed: true,
    expected_terminal: false,
  };
  if (stage.group === "spike") {
    gate.expected_stress = false;
  }
  if (stage.stage === "mixed-calibration-1") {
    gate.latency_reference = {
      role: "established",
      stage: "mixed-calibration-1",
      label:
        "calibrated representative mixed warm baseline",
      p95_ms: stage.metrics.latency_ms.p95,
    };
  } else if (usesCalibration) {
    gate.latency_reference = {
      role: "applied",
      stage: "mixed-calibration-1",
      label:
        "calibrated representative mixed warm baseline",
      p95_ms: calibration.metrics.latency_ms.p95,
    };
  }
  return gate;
}

function activeCohortMix(
  stage: CanonicalStage,
  cohortAllocation: string[],
) {
  const active =
    stage.workload === "contention"
      ? [
          cohortAllocation[stage.identityOffset],
          cohortAllocation[stage.identityOffset],
        ]
      : cohortAllocation.slice(
          stage.identityOffset,
          stage.identityOffset + stage.users,
        );
  return active.reduce<Record<string, number>>(
    (counts, cohort) => {
      counts[cohort] = (counts[cohort] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

function createSessionRenewal(stage: JsonRecord) {
  const contentionSessions =
    stage.workload === "contention" ? 1 : 0;
  const refreshedAccounts =
    stage.workload === "contention"
      ? 1
      : stage.users +
        Number(stage.declaration.operatorOverlap);
  const total = refreshedAccounts + contentionSessions;
  const password =
    stage.declaration.sessionRenewalStrategy ===
    "password_sign_in";
  return {
    before_stage: stage.stage,
    refreshed_accounts: refreshedAccounts,
    renewal_strategy:
      stage.declaration.sessionRenewalStrategy,
    contention_sessions_renewed: contentionSessions,
    renewal_strategies: {
      refresh: password ? 0 : total,
      password_sign_in: password ? total : 0,
      password_sign_in_fallback: 0,
    },
  };
}

function createIntegrityCheckpoint({
  label,
  identityCount,
  cohortCounts,
  statusEventCount,
  operatorSentCount,
  dueEvidence,
}: {
  label: string;
  identityCount: number;
  cohortCounts: Record<string, number>;
  statusEventCount: number;
  operatorSentCount: number;
  dueEvidence: Record<string, number>;
}) {
  const occurrenceCount = Math.max(
    statusEventCount,
    dueEvidence.tracked_occurrences,
  );
  const reminderCount =
    dueEvidence.tracked_deliveries +
    operatorSentCount;
  const pendingDuePastDeliveries =
    dueEvidence.tracked_deliveries -
    dueEvidence.cancelled_deliveries;
  const rowCounts = {
    profiles: identityCount,
    categories: 0,
    behaviors: 0,
    behavior_definition_events: 0,
    behavior_schedules: 0,
    behavior_schedule_slots: 0,
    occurrences: occurrenceCount,
    reminder_deliveries: reminderCount,
    push_subscriptions: 0,
    occurrence_status_events: statusEventCount,
    occurrence_sync_state: 0,
    behaviorlog_import_runs: 0,
    behaviorlog_import_record_mappings: 0,
    imported_notes: 0,
    imported_interventions: 0,
  };
  const emptyStatuses = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
  };
  return {
    label,
    runId: RUN_ID,
    checkedAccounts: identityCount,
    violations: 0,
    workloadClassification: "mutation",
    integrityChecks: {
      crossOwnerRows: 0,
      duplicateOccurrences: 0,
      duplicateDeliveries: 0,
      invalidStatusChains: 0,
      invalidDefinitionChains: 0,
      scheduleOnlyDefinitionEvents: 0,
      invalidReminderStates: 0,
      orphanRows: 0,
      falseFreshHorizons: 0,
      preservationFailures: 0,
      stuckProcessingClaims: 0,
      forbiddenRows: 0,
      boundedGrowth: 0,
    },
    activePushSubscriptions: 0,
    totalRows: Object.values(rowCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
    rowCounts,
    reminderStatuses: {
      pending: pendingDuePastDeliveries,
      processing: 0,
      sent: operatorSentCount,
      failed: 0,
      cancelled: dueEvidence.cancelled_deliveries,
    },
    operatorReminderStatuses: {
      ...emptyStatuses,
      sent: operatorSentCount,
    },
    cancellationReminderStatuses: {
      ...emptyStatuses,
      pending: pendingDuePastDeliveries,
      cancelled: dueEvidence.cancelled_deliveries,
    },
    duePastReminderNonReactivation: dueEvidence,
    mutationDeltas: {
      behaviors: 0,
      schedules: 0,
      slots: 0,
      occurrences:
        occurrenceCount -
        dueEvidence.tracked_occurrences,
      statusEvents: statusEventCount,
      definitionEvents: 0,
      reminders: operatorSentCount,
    },
    statusTransitionEvidence: {
      baselineEventCount: 0,
      totalEventCount: statusEventCount,
      appendedEventCount: statusEventCount,
      eventBackedOccurrenceCount: statusEventCount,
      snapshotCorrelatedOccurrenceCount: statusEventCount,
    },
    databaseConnectionCount: 5,
    cohorts: structuredClone(cohortCounts),
  };
}

function buildLocalCapacity(
  stages: JsonRecord[],
  gates: JsonRecord[],
) {
  const plateaus = stages.filter(
    (stage) =>
      stage.group === "ramp" ||
      stage.group === "breakpoint",
  );
  if (plateaus.length === 0) return null;
  const gatesByStage = new Map(
    gates.map((gate) => [gate.stage, gate]),
  );
  const calibration = stages.find(
    (stage) => stage.stage === "mixed-calibration-1",
  );
  return {
    ...mutationReportModule.selectHighestSustainableLocalPlateau({
      targetClassification: "local",
      plateaus: plateaus.map((stage) => ({
        stage: stage.stage,
        users: stage.users,
        metrics: stage.metrics,
        passed:
          gatesByStage.get(stage.stage).plateau_passed,
      })),
    }),
    latency_reference: {
      stage: "mixed-calibration-1",
      label:
        "calibrated representative mixed warm baseline",
      p95_ms: calibration.metrics.latency_ms.p95,
    },
  };
}

function aggregateSequentialMetrics(stages: JsonRecord[]) {
  const byKey = new Map<
    string,
    {
      method: string;
      name: string;
      requests: number;
      failures: number;
    }
  >();
  const duration = stages.reduce(
    (total, stage) =>
      total + Number(stage.achieved_duration_seconds),
    0,
  );
  for (const stage of stages) {
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

function aggregateSemanticEvidence(stages: JsonRecord[]) {
  const output = {
    successful_submissions: {} as Record<string, number>,
    semantic_verifications: {} as Record<string, number>,
    pending_verifications: {} as Record<string, number>,
  };
  for (const stage of stages) {
    for (const field of Object.keys(
      output,
    ) as (keyof typeof output)[]) {
      for (const [name, count] of Object.entries(
        stage.semantic_verifications[field],
      )) {
        output[field][name] =
          (output[field][name] ?? 0) + Number(count);
      }
    }
  }
  return output;
}

function buildStatsCsv(durationSeconds: number) {
  const header = [
    "Type",
    "Name",
    "Request Count",
    "Failure Count",
    "Median Response Time",
    "Average Response Time",
    "Min Response Time",
    "Max Response Time",
    "Average Content Size",
    "Requests/s",
    "Failures/s",
    "50%",
    "66%",
    "75%",
    "80%",
    "90%",
    "95%",
    "98%",
    "99%",
    "99.9%",
    "99.99%",
    "100%",
  ].join(",");
  const rows = [
    statsRow("GET", GET_REQUEST, 20, durationSeconds),
    ...mutationReportModule.REQUIRED_TIMED_MUTATION_REQUEST_NAMES.map(
      (name) =>
        statsRow("POST", name, 1, durationSeconds),
    ),
    statsRow("", "Aggregated", 29, durationSeconds),
  ];
  return `${[header, ...rows].join("\n")}\n`;
}

function statsRow(
  method: string,
  name: string,
  requests: number,
  durationSeconds: number,
) {
  return [
    method,
    name,
    requests,
    0,
    10,
    10,
    5,
    20,
    10,
    requests / durationSeconds,
    0,
    10,
    10,
    10,
    10,
    15,
    20,
    20,
    20,
    20,
    20,
    20,
  ].join(",");
}

function buildHistoryCsv({
  durationSeconds,
  users,
}: {
  durationSeconds: number;
  users: number;
}) {
  const header = [
    "Timestamp",
    "User Count",
    "Type",
    "Name",
    "Requests/s",
    "Failures/s",
    "50%",
    "66%",
    "75%",
    "80%",
    "90%",
    "95%",
    "98%",
    "99%",
    "99.9%",
    "99.99%",
    "100%",
    "Total Request Count",
    "Total Failure Count",
    "Total Median Response Time",
    "Total Average Response Time",
    "Total Min Response Time",
    "Total Max Response Time",
    "Total Average Content Size",
  ].join(",");
  const start = 1_000;
  const rows = [header];
  for (
    let elapsedSeconds = 0;
    elapsedSeconds <= durationSeconds;
    elapsedSeconds += 5
  ) {
    rows.push(
      historyRow(
        start + elapsedSeconds,
        elapsedSeconds === 0 ? 0 : users,
        elapsedSeconds === durationSeconds
          ? 29
          : Math.floor(
              (29 * elapsedSeconds) /
                durationSeconds,
            ),
      ),
    );
  }
  return `${rows.join("\n")}\n`;
}

function historyRow(
  timestamp: number,
  users: number,
  requests: number,
) {
  return [
    timestamp,
    users,
    "",
    "Aggregated",
    0,
    0,
    10,
    10,
    10,
    10,
    15,
    20,
    20,
    20,
    20,
    20,
    20,
    requests,
    0,
    10,
    10,
    5,
    20,
    10,
  ].join(",");
}

function rewriteArtifact(
  fixture: ReturnType<typeof createValidEvidenceRun>,
  stage: JsonRecord,
  name: string,
  content: string,
) {
  const filePath = path.join(fixture.reportDirectory, name);
  writePrivateFile(filePath, content);
  stage.artifacts[name] = digest(filePath);
  fixture.writeRecords();
}

function validate(
  fixture: ReturnType<typeof createValidEvidenceRun>,
) {
  return evidenceModule.validateMutationEvidenceDirectory({
    runId: RUN_ID,
    runsRoot: fixture.runsRoot,
  });
}

function digest(filePath: string) {
  return createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex");
}

function writeJson(filePath: string, value: unknown) {
  writePrivateFile(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function writePrivateFile(filePath: string, content: string) {
  writeFileSync(filePath, content, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}
