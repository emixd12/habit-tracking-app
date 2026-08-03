import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, describe, expect, it } from "vitest";

type Stage = {
  name: string;
  group: string;
  profile: string;
  workload: string;
  users: number;
  spawnRate: number;
  durationSeconds: number;
  sessionRenewalStrategy: "refresh_token" | "password_sign_in";
  renewContentionSessions: boolean;
  operatorOverlap: boolean;
  integrityCheckpoint: boolean;
};

type MutationSuiteModule = {
  applyMutationStageSemanticEvidenceGate: (input: {
    result: {
      metrics: {
        requests_by_name: Array<{
          method: string;
          name: string;
          requests: number;
          failures: number;
        }>;
      };
      semantic_verifications: {
        schema_version: string;
        successful_submissions: Record<string, number>;
        semantic_verifications: Record<string, number>;
        pending_verifications: Record<string, number>;
      };
    };
    gate: {
      stage: string;
      passed: boolean;
      failures: string[];
    };
  }) => {
    stage: string;
    passed: boolean;
    failures: string[];
    semantic_verification: {
      passed: boolean;
      failures: string[];
    };
  };
  assertMutationAnchorDate: (
    anchorLocalDate: string,
    now?: Temporal.Instant,
  ) => void;
  buildMutationSuitePlan: (suite: string) => {
    suite: string;
    fixtureMode: string;
    accountCount: number;
    stages: Stage[];
    totalDurationSeconds: number;
    taskWeights: Record<string, number>;
    readTaskKeys: string[];
    thinkTimeSeconds: {
      minimum: number;
      maximum: number;
    };
    ceilings: Record<string, number>;
    cumulativeRequestCeiling: number;
  };
  buildMutationCapacityEvidence: (input: {
    stageResults: Array<Record<string, unknown>>;
    stageGates: Array<{
      stage: string;
      passed: boolean;
      plateau_passed?: boolean;
    }>;
  }) => null | {
    highest_sustainable_local_users: number;
    stage: string;
    latency_reference: {
      stage: string;
      label: string;
      p95_ms: number;
    };
  };
  aggregateSequentialStageMetrics: (
    stageResults: Array<{
      achieved_duration_seconds: number;
      metrics: {
        requests?: number;
        requests_per_second?: number;
        requests_by_name: Array<{
          method: string;
          name: string;
          requests: number;
          failures: number;
          requests_per_second?: number;
        }>;
      };
    }>,
  ) => {
    achieved_duration_seconds: number;
    requests: number;
    requests_per_second: number;
    requests_by_name: Array<{
      method: string;
      name: string;
      requests: number;
      failures: number;
      requests_per_second: number;
    }>;
  };
  collectSessionSecrets: (
    value: unknown,
    needles: Set<string>,
    key?: string,
  ) => void;
  createMutationLoadRunId: (now?: Date) => string;
  deriveCumulativeSuiteRequestCeiling: (input: {
    stages: Array<{ durationSeconds?: number }>;
    ceilings: { maximum_requests: number };
  }) => number;
  evaluateBreakpointStageOutcome: (input: {
    result: { group: string };
    gate: {
      stage: string;
      passed: boolean;
      failures: string[];
    };
  }) => {
    gate: {
      stage: string;
      passed: boolean;
      failures: string[];
      plateau_passed: boolean;
      expected_terminal: boolean;
      performance_failures?: string[];
    };
    stopRemainingBreakpoints: boolean;
  };
  evaluateMutationStageOutcome: (input: {
    result: { stage: string; group: string };
    gate: {
      stage: string;
      passed: boolean;
      failures: string[];
    };
  }) => {
    gate: {
      stage: string;
      passed: boolean;
      failures: string[];
      plateau_passed: boolean;
      expected_terminal?: boolean;
      expected_stress?: boolean;
      performance_failures?: string[];
    };
    stopRemainingRamps: boolean;
    stopRemainingBreakpoints: boolean;
  };
  evaluateCompletedSoakPlateauProvenance: (input: {
    stageResults: Array<{
      stage: string;
      group: string;
      users: number;
    }>;
    stageGates: Array<{
      stage: string;
      passed: boolean;
      plateau_passed?: boolean;
      expected_terminal?: boolean;
      recorded_ramp_latency_breach?: boolean;
      failures?: string[];
      performance_failures?: string[];
    }>;
  }) => {
    passed: boolean;
    failures: string[];
    basis:
      | "not_applicable"
      | "performance_terminal"
      | "recorded_ramp_latency_boundary"
      | "passing_plateau";
    soak_users: number[];
    boundary_stage: string | null;
    boundary_users: number | null;
  };
  assertSoakSupportedByRampEvidence: (input: {
    soakStage: { stage?: string; name?: string; users: number };
    planStages: Array<{
      name: string;
      group: string;
      users: number;
    }>;
    stageResults: Array<{
      stage: string;
      group: string;
      users: number;
    }>;
    stageGates: Array<{
      stage: string;
      passed: boolean;
      plateau_passed?: boolean;
      expected_terminal?: boolean;
      recorded_ramp_latency_breach?: boolean;
      failures?: string[];
      performance_failures?: string[];
    }>;
  }) =>
    | null
    | {
        stage: string;
        passed: true;
        basis:
          | "recorded_ramp_latency_boundary"
          | "passing_ramp_plateau";
        soak_users: number;
        supporting_ramp_users: number;
      };
  evaluateMutationLocustStage: (input: {
    result: {
      stage: string;
      group: string;
      workload: string;
      users: number;
      metrics: {
        requests: number;
        failure_ratio_percent: number;
        latency_ms: { p95: number };
      };
      unexpected_5xx: number;
      exception_count: number;
      resources: { breaches: string[] };
      duration_seconds: number;
      achieved_duration_seconds: number;
      achieved_peak_users: number;
      locust_exit_code: number;
    };
    calibratedMixedP95?: number;
  }) => {
    stage: string;
    passed: boolean;
    failures: string[];
    latency_reference?: {
      role: "established" | "applied";
      stage: string;
      label: string;
      p95_ms: number;
    };
  };
  evaluateSpikeRecoveryComparison: (input: {
    baseline: {
      failure_ratio_percent: number;
      latency_ms: { p95: number };
    };
    recovery: {
      failure_ratio_percent: number;
      latency_ms: { p95: number };
    };
  }) => {
    stage: string;
    passed: boolean;
    failures: string[];
  };
  finalProviderEvidence: (
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => {
    sent: number;
    failed: number;
    cancelled: number;
    processing: number;
    duplicateKeys: number;
  };
  runMutationSuite: (options: {
    suite?: string;
    runId?: string;
  }) => Promise<unknown>;
  summarizeFailureHalves: (
    historyCsv: string,
    finalTotals: { requests: number; failures: number },
  ) => {
    first: { requests: number; failures: number };
    second: { requests: number; failures: number };
  };
  summarizeCumulativeRequestUsage: (input: {
    stageResults: Array<{ metrics: { requests: number } }>;
    operatorRequestCount?: number;
    ceiling: number;
  }) => {
    locust_requests: number;
    operator_requests: number;
    total_requests: number;
    ceiling: number;
    reached: boolean;
  };
  mutationLatencyReferenceForStage: (input: {
    stage: {
      stage: string;
      group: string;
      workload: string;
    };
    calibratedMixedP95?: number;
  }) => number | undefined;
  mutationStageSkipReason: (input: {
    stage: { group: string };
    rampTerminated?: boolean;
    breakpointTerminated?: boolean;
  }) => string | null;
  mutationStageRequiresIntegrityCheckpoint: (input: {
    stageDefinition: { integrityCheckpoint: boolean };
    stageOutcome: {
      gate: {
        expected_terminal?: boolean;
        expected_stress?: boolean;
        recorded_ramp_latency_breach?: boolean;
      };
      stopRemainingRamps: boolean;
      stopRemainingBreakpoints: boolean;
    };
  }) => boolean;
  runRequiredMutationIntegrityCheckpoint: (input: {
    stageDefinition: { integrityCheckpoint: boolean };
    stageOutcome: {
      gate: {
        expected_terminal?: boolean;
        expected_stress?: boolean;
        recorded_ramp_latency_breach?: boolean;
      };
      stopRemainingRamps: boolean;
      stopRemainingBreakpoints: boolean;
    };
    checkpoint: () => Promise<unknown>;
  }) => Promise<unknown | null>;
  mutationRepresentativeEvidenceStages: (
    stageResults: Array<Record<string, unknown>>,
  ) => Array<Record<string, unknown>>;
  requireMutationCalibrationP95: (
    stageResults: Array<Record<string, unknown>>,
  ) => number;
};

let suiteModule: MutationSuiteModule;

beforeAll(async () => {
  // @ts-expect-error The supervised load command is a plain Node ESM module.
  suiteModule = await import("../scripts/load-test-mutation-suite.mjs");
});

describe("Ticket 065 supervised mutation suite", () => {
  it("declares the strict full sequence and one-hour bounded soak", () => {
    const plan = suiteModule.buildMutationSuitePlan("full");

    expect(plan).toMatchObject({
      suite: "full",
      fixtureMode: "mutation",
      accountCount: 100,
      totalDurationSeconds: 9_120,
      cumulativeRequestCeiling: 4_000_000,
      thinkTimeSeconds: {
        minimum: 2,
        maximum: 5,
      },
    });
    expect(plan.stages.map((stage) => stage.name)).toEqual([
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
    ]);
    expect(
      plan.stages.find(
        (stage) => stage.name === "mixed-calibration-1",
      ),
    ).toMatchObject({
      group: "mixed_calibration",
      profile: "mixed_calibration",
      workload: "mixed",
      users: 1,
      durationSeconds: 180,
      integrityCheckpoint: true,
    });
    expect(
      plan.stages.find((stage) => stage.name === "soak-25"),
    ).toMatchObject({
      users: 25,
      durationSeconds: 3_600,
      integrityCheckpoint: true,
      sessionRenewalStrategy: "password_sign_in",
      renewContentionSessions: false,
    });
    expect(
      plan.stages
        .filter((stage) => stage.name !== "soak-25")
        .every(
          (stage) =>
            stage.sessionRenewalStrategy === "refresh_token",
        ),
    ).toBe(true);
    expect(
      plan.stages.filter((stage) => stage.renewContentionSessions),
    ).toEqual([
      expect.objectContaining({ name: "contention-1" }),
    ]);
  });

  it("uses exact mutation, spike, breakpoint, contention, and operator bounds", () => {
    const spike = suiteModule.buildMutationSuitePlan("spike");
    expect(spike.stages.map((stage) => stage.users)).toEqual([
      1, 10, 100, 10,
    ]);
    expect(spike.stages[2]).toMatchObject({
      name: "spike-hold-100",
      spawnRate: 100,
      durationSeconds: 300,
    });

    const breakpoint = suiteModule.buildMutationSuitePlan("breakpoint");
    expect(breakpoint.stages.map((stage) => stage.users)).toEqual([
      1, 10, 25, 50, 75, 100,
    ]);
    expect(
      breakpoint.stages.every((stage) => stage.integrityCheckpoint),
    ).toBe(true);

    expect(
      suiteModule.buildMutationSuitePlan("contention"),
    ).toMatchObject({
      accountCount: 1,
      stages: [
        {
          name: "contention-1",
          users: 1,
          workload: "contention",
        },
      ],
    });
    expect(
      suiteModule.buildMutationSuitePlan("operator").stages[1],
    ).toMatchObject({
      users: 10,
      operatorOverlap: true,
      identityOffset: 0,
    });
  });

  it("leases a disjoint refreshed identity window for changed-timezone traffic", () => {
    const full = suiteModule.buildMutationSuitePlan("full");
    const timezone = full.stages.find(
      (stage) => stage.name === "timezone-changed-5",
    );
    const operator = full.stages.find(
      (stage) => stage.name === "operator-overlap-10",
    );

    expect(timezone).toMatchObject({
      users: 5,
      identityOffset: 95,
    });
    expect(operator).toMatchObject({
      users: 10,
      identityOffset: 0,
    });
    expect(
      suiteModule.buildMutationSuitePlan("timezone").stages[0],
    ).toMatchObject({
      users: 5,
      identityOffset: 0,
    });
  });

  it("prepends calibration only to suites with comparable mixed evidence", () => {
    const comparableSuites = {
      baseline: {
        names: [
          "mixed-calibration-1",
          "mixed-baseline-5",
          "mixed-baseline-10",
        ],
        duration: 1_380,
        requestCeiling: 600_000,
      },
      ramp: {
        names: [
          "mixed-calibration-1",
          "ramp-10",
          "ramp-25",
          "ramp-50",
          "ramp-100",
        ],
        duration: 1_140,
        requestCeiling: 1_000_000,
      },
      spike: {
        names: [
          "mixed-calibration-1",
          "spike-baseline-10",
          "spike-hold-100",
          "spike-recovery-10",
        ],
        duration: 1_080,
        requestCeiling: 800_000,
      },
      soak: {
        names: [
          "mixed-calibration-1",
          "ramp-10",
          "ramp-25",
          "ramp-50",
          "ramp-100",
          "soak-25",
        ],
        duration: 4_740,
        requestCeiling: 1_200_000,
      },
      breakpoint: {
        names: [
          "mixed-calibration-1",
          "breakpoint-10",
          "breakpoint-25",
          "breakpoint-50",
          "breakpoint-75",
          "breakpoint-100",
        ],
        duration: 1_380,
        requestCeiling: 1_200_000,
      },
      operator: {
        names: [
          "mixed-calibration-1",
          "operator-overlap-10",
        ],
        duration: 480,
        requestCeiling: 400_000,
      },
    };

    for (const [suite, expected] of Object.entries(
      comparableSuites,
    )) {
      const plan = suiteModule.buildMutationSuitePlan(suite);
      expect(plan.stages.map((stage) => stage.name)).toEqual(
        expected.names,
      );
      expect(plan.totalDurationSeconds).toBe(expected.duration);
      expect(plan.cumulativeRequestCeiling).toBe(
        expected.requestCeiling,
      );
      if (suite === "operator") {
        expect(plan.accountCount).toBe(11);
      }
    }

    for (const [suite, expectedStage] of [
      ["smoke", "smoke-1"],
      ["timezone", "timezone-changed-5"],
      ["contention", "contention-1"],
    ]) {
      const plan = suiteModule.buildMutationSuitePlan(suite);
      expect(plan.stages.map((stage) => stage.name)).toEqual([
        expectedStage,
      ]);
      expect(plan.stages).toHaveLength(1);
    }
  });

  it("applies calibration only to comparable mixed stages and uses mutation-specific gate wording", () => {
    for (const group of [
      "mixed_baseline",
      "ramp",
      "spike",
      "soak",
      "breakpoint",
      "operator_overlap",
    ]) {
      expect(
        suiteModule.mutationLatencyReferenceForStage({
          stage: {
            stage: `${group}-stage`,
            group,
            workload: "mixed",
          },
          calibratedMixedP95: 50,
        }),
      ).toBe(50);
    }

    for (const [group, workload] of [
      ["smoke", "mixed"],
      ["mixed_calibration", "mixed"],
      ["timezone_changed", "timezone_changed"],
      ["contention", "contention"],
    ]) {
      expect(
        suiteModule.mutationLatencyReferenceForStage({
          stage: {
            stage: `${group}-stage`,
            group,
            workload,
          },
        }),
      ).toBeUndefined();
    }

    expect(() =>
      suiteModule.mutationLatencyReferenceForStage({
        stage: {
          stage: "ramp-10",
          group: "ramp",
          workload: "mixed",
        },
      }),
    ).toThrow(/calibrated representative mixed warm baseline/);

    const result = {
      stage: "ramp-10",
      group: "ramp",
      workload: "mixed",
      users: 10,
      metrics: {
        requests: 100,
        failure_ratio_percent: 0,
        latency_ms: { p95: 101 },
      },
      unexpected_5xx: 0,
      exception_count: 0,
      resources: { breaches: [] },
      duration_seconds: 240,
      achieved_duration_seconds: 240,
      achieved_peak_users: 10,
      locust_exit_code: 0,
    };
    expect(
      suiteModule.evaluateMutationLocustStage({
        result,
        calibratedMixedP95: 50,
      }),
    ).toMatchObject({
      stage: "ramp-10",
      passed: false,
      failures: [
        "p95 exceeded 2x the calibrated representative mixed warm baseline",
      ],
      latency_reference: {
        role: "applied",
        stage: "mixed-calibration-1",
        label: "calibrated representative mixed warm baseline",
        p95_ms: 50,
      },
    });

    const calibrationGate =
      suiteModule.evaluateMutationLocustStage({
        result: {
          ...result,
          stage: "mixed-calibration-1",
          group: "mixed_calibration",
          users: 1,
          metrics: {
            ...result.metrics,
            latency_ms: { p95: 42 },
          },
          duration_seconds: 180,
          achieved_duration_seconds: 180,
          achieved_peak_users: 1,
        },
      });
    expect(calibrationGate).toMatchObject({
      passed: true,
      latency_reference: {
        role: "established",
        stage: "mixed-calibration-1",
        label: "calibrated representative mixed warm baseline",
        p95_ms: 42,
      },
    });

    const smokeGate = suiteModule.evaluateMutationLocustStage({
      result: {
        ...result,
        stage: "smoke-1",
        group: "smoke",
        users: 1,
        metrics: {
          ...result.metrics,
          latency_ms: { p95: 1_000 },
        },
        duration_seconds: 180,
        achieved_duration_seconds: 180,
        achieved_peak_users: 1,
      },
      calibratedMixedP95: 50,
    });
    expect(smokeGate).toMatchObject({
      passed: true,
      failures: [],
    });
    expect(smokeGate.latency_reference).toBeUndefined();
  });

  it("keeps calibration out of representative mix evidence and requires it for capacity claims", () => {
    const calibration = {
      stage: "mixed-calibration-1",
      group: "mixed_calibration",
      workload: "mixed",
      users: 1,
      metrics: {
        latency_ms: { p95: 42 },
        requests_per_second: 2,
      },
    };
    const ramp = {
      stage: "ramp-10",
      group: "ramp",
      workload: "mixed",
      users: 10,
      metrics: { requests_per_second: 8 },
    };

    expect(
      suiteModule.mutationRepresentativeEvidenceStages([
        calibration,
        ramp,
      ]),
    ).toEqual([ramp]);
    expect(
      suiteModule.requireMutationCalibrationP95([
        calibration,
        ramp,
      ]),
    ).toBe(42);
    expect(() =>
      suiteModule.buildMutationCapacityEvidence({
        stageResults: [ramp],
        stageGates: [
          { stage: "ramp-10", passed: true },
        ],
      }),
    ).toThrow(/capacity evidence requires.*calibrated/i);
    expect(
      suiteModule.buildMutationCapacityEvidence({
        stageResults: [calibration, ramp],
        stageGates: [
          { stage: "mixed-calibration-1", passed: true },
          { stage: "ramp-10", passed: true },
        ],
      }),
    ).toMatchObject({
      highest_sustainable_local_users: 10,
      latency_reference: {
        stage: "mixed-calibration-1",
        label: "calibrated representative mixed warm baseline",
        p95_ms: 42,
      },
    });

    const ramp100 = {
      stage: "ramp-100",
      group: "ramp",
      workload: "mixed",
      users: 100,
      metrics: { requests_per_second: 20 },
    };
    expect(
      suiteModule.buildMutationCapacityEvidence({
        stageResults: [calibration, ramp, ramp100],
        stageGates: [
          { stage: "mixed-calibration-1", passed: true },
          {
            stage: "ramp-10",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-100",
            passed: true,
            plateau_passed: false,
          },
        ],
      }),
    ).toMatchObject({
      highest_sustainable_local_users: 10,
      stage: "ramp-10",
    });
  });

  it("treats only a breakpoint performance breach as a bounded terminal result", () => {
    expect(
      suiteModule.evaluateBreakpointStageOutcome({
        result: { group: "breakpoint" },
        gate: {
          stage: "breakpoint-50",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
          ],
        },
      }),
    ).toMatchObject({
      gate: {
        passed: true,
        plateau_passed: false,
        expected_terminal: true,
        failures: [],
        performance_failures: [
          "p95 exceeded 2x the calibrated representative mixed warm baseline",
        ],
      },
      stopRemainingBreakpoints: true,
    });

    expect(
      suiteModule.evaluateBreakpointStageOutcome({
        result: { group: "breakpoint" },
        gate: {
          stage: "breakpoint-50",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
            "one or more unexpected 5xx responses were recorded",
          ],
        },
      }),
    ).toMatchObject({
      gate: {
        passed: false,
        plateau_passed: false,
        expected_terminal: false,
      },
      stopRemainingBreakpoints: false,
    });

    expect(
      suiteModule.evaluateBreakpointStageOutcome({
        result: { group: "ramp" },
        gate: {
          stage: "ramp-50",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
          ],
        },
      }),
    ).toMatchObject({
      gate: {
        passed: false,
        expected_terminal: false,
      },
      stopRemainingBreakpoints: false,
    });
  });

  it("records a p95-only ramp breach while continuing every declared ramp plateau", () => {
    const outcome = suiteModule.evaluateMutationStageOutcome({
      result: { stage: "ramp-25", group: "ramp" },
      gate: {
        stage: "ramp-25",
        passed: false,
        failures: [
          "p95 exceeded 2x the calibrated representative mixed warm baseline",
        ],
      },
    });

    expect(outcome).toMatchObject({
      gate: {
        passed: true,
        plateau_passed: false,
        expected_terminal: false,
        recorded_ramp_latency_breach: true,
        failures: [],
        performance_failures: [
          "p95 exceeded 2x the calibrated representative mixed warm baseline",
        ],
      },
      stopRemainingRamps: false,
      stopRemainingBreakpoints: false,
    });

    expect(
      suiteModule.evaluateMutationStageOutcome({
        result: { stage: "ramp-50", group: "ramp" },
        gate: {
          stage: "ramp-50",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
            "one or more unexpected 5xx responses were recorded",
          ],
        },
      }),
    ).toMatchObject({
      gate: {
        passed: false,
        plateau_passed: false,
        expected_terminal: false,
      },
      stopRemainingRamps: false,
    });
    expect(
      suiteModule.evaluateMutationStageOutcome({
        result: { stage: "ramp-50", group: "ramp" },
        gate: {
          stage: "ramp-50",
          passed: false,
          failures: [
            "unexpected request failures were not below 0.5%",
          ],
        },
      }),
    ).toMatchObject({
      gate: {
        passed: false,
        plateau_passed: false,
        expected_terminal: false,
      },
      stopRemainingRamps: false,
    });

    expect(
      suiteModule.evaluateMutationStageOutcome({
        result: { stage: "spike-baseline-10", group: "spike" },
        gate: {
          stage: "spike-baseline-10",
          passed: true,
          failures: [],
        },
      }),
    ).toMatchObject({
      gate: { passed: true },
      stopRemainingRamps: false,
      stopRemainingBreakpoints: false,
    });

    for (const group of [
      "ramp",
      "spike",
      "soak",
      "breakpoint",
      "timezone_changed",
      "contention",
      "operator_overlap",
    ]) {
      expect(
        suiteModule.mutationStageSkipReason({
          stage: { group },
          rampTerminated: true,
        }),
      ).toBeNull();
    }
  });

  it("keeps an unmatched semantic readback as a stage safety failure", () => {
    const requestName =
      "INT-TIMELINE-005 POST /timeline server-action";
    const result = {
      metrics: {
        requests_by_name: [
          {
            method: "POST",
            name: requestName,
            requests: 2,
            failures: 0,
          },
        ],
      },
      semantic_verifications: {
        schema_version: "1.0.0",
        successful_submissions: { [requestName]: 2 },
        semantic_verifications: { [requestName]: 1 },
        pending_verifications: { [requestName]: 1 },
      },
    };

    const gate =
      suiteModule.applyMutationStageSemanticEvidenceGate({
        result,
        gate: {
          stage: "ramp-25",
          passed: true,
          failures: [],
        },
      });

    expect(gate).toMatchObject({
      passed: false,
      failures: [
        expect.stringMatching(
          /semantic verification: successful Server Action POSTs lack one-to-one semantic readback/i,
        ),
      ],
      semantic_verification: {
        passed: false,
      },
    });
    expect(
      suiteModule.evaluateMutationStageOutcome({
        result: { stage: "ramp-25", group: "ramp" },
        gate,
      }),
    ).toMatchObject({
      gate: {
        passed: false,
        expected_terminal: false,
      },
      stopRemainingRamps: false,
    });
  });

  it("allows only a p95-only spike hold breach as expected stress", () => {
    expect(
      suiteModule.evaluateMutationStageOutcome({
        result: { stage: "spike-hold-100", group: "spike" },
        gate: {
          stage: "spike-hold-100",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
          ],
        },
      }),
    ).toMatchObject({
      gate: {
        passed: true,
        plateau_passed: false,
        expected_stress: true,
        failures: [],
        performance_failures: [
          "p95 exceeded 2x the calibrated representative mixed warm baseline",
        ],
      },
      stopRemainingRamps: false,
      stopRemainingBreakpoints: false,
    });

    for (const failures of [
      [
        "p95 exceeded 2x the calibrated representative mixed warm baseline",
        "one or more unexpected 5xx responses were recorded",
      ],
      ["unexpected request failures were not below 0.5%"],
      ["Locust returned a nonzero critical exit code"],
      ["p95 exceeded a non-reference stress ceiling"],
    ]) {
      expect(
        suiteModule.evaluateMutationStageOutcome({
          result: {
            stage: "spike-hold-100",
            group: "spike",
          },
          gate: {
            stage: "spike-hold-100",
            passed: false,
            failures,
          },
        }),
      ).toMatchObject({
        gate: {
          passed: false,
          plateau_passed: false,
          expected_stress: false,
        },
      });
    }

    expect(
      suiteModule.evaluateMutationStageOutcome({
        result: {
          stage: "spike-baseline-10",
          group: "spike",
        },
        gate: {
          stage: "spike-baseline-10",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
          ],
        },
      }),
    ).toMatchObject({
      gate: {
        passed: false,
        expected_stress: false,
      },
    });
  });

  it("keeps the spike recovery stage gate distinct from its comparison gate", () => {
    const primaryGate = {
      stage: "spike-recovery-10",
      passed: true,
      failures: [] as string[],
    };
    const comparisonGate =
      suiteModule.evaluateSpikeRecoveryComparison({
        baseline: {
          failure_ratio_percent: 0,
          latency_ms: { p95: 100 },
        },
        recovery: {
          failure_ratio_percent: 0,
          latency_ms: { p95: 110 },
        },
      });

    expect(comparisonGate).toEqual({
      stage: "spike-recovery-comparison",
      passed: true,
      failures: [],
    });
    expect(
      new Set([primaryGate.stage, comparisonGate.stage]),
    ).toHaveLength(2);
  });

  it("fails the distinct spike recovery comparison outside the 10% bounds", () => {
    expect(
      suiteModule.evaluateSpikeRecoveryComparison({
        baseline: {
          failure_ratio_percent: 0.1,
          latency_ms: { p95: 100 },
        },
        recovery: {
          failure_ratio_percent: 0.12,
          latency_ms: { p95: 111 },
        },
      }),
    ).toEqual({
      stage: "spike-recovery-comparison",
      passed: false,
      failures: [
        "recovery p95 exceeded 10% above the pre-ramp 10-user baseline",
        "recovery failure ratio did not return within 10% of the pre-ramp baseline",
      ],
    });
  });

  it("forces ramp-latency, terminal, and expected-stress integrity before continuation and propagates violations", async () => {
    const rampOutcome =
      suiteModule.evaluateMutationStageOutcome({
        result: { stage: "ramp-50", group: "ramp" },
        gate: {
          stage: "ramp-50",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
          ],
        },
      });
    const spikeOutcome =
      suiteModule.evaluateMutationStageOutcome({
        result: {
          stage: "spike-hold-100",
          group: "spike",
        },
        gate: {
          stage: "spike-hold-100",
          passed: false,
          failures: [
            "p95 exceeded 2x the calibrated representative mixed warm baseline",
          ],
        },
      });

    for (const [outcome, continuation] of [
      [rampOutcome, "next-ramp-plateau"],
      [spikeOutcome, "recovery"],
    ] as const) {
      expect(
        suiteModule.mutationStageRequiresIntegrityCheckpoint({
          stageDefinition: { integrityCheckpoint: false },
          stageOutcome: outcome,
        }),
      ).toBe(true);
      const order = ["gate-outcome"];
      await suiteModule.runRequiredMutationIntegrityCheckpoint({
        stageDefinition: { integrityCheckpoint: false },
        stageOutcome: outcome,
        checkpoint: async () => {
          order.push("integrity-checkpoint");
          return { violations: 0 };
        },
      });
      order.push(continuation);
      expect(order).toEqual([
        "gate-outcome",
        "integrity-checkpoint",
        continuation,
      ]);
    }

    const abortOrder: string[] = [];
    await expect(
      suiteModule.runRequiredMutationIntegrityCheckpoint({
        stageDefinition: { integrityCheckpoint: false },
        stageOutcome: spikeOutcome,
        checkpoint: async () => {
          abortOrder.push("integrity-checkpoint");
          throw new Error(
            "reminder_count_below_baseline=30",
          );
        },
      }),
    ).rejects.toThrow(/reminder_count_below_baseline=30/);
    expect(abortOrder).toEqual(["integrity-checkpoint"]);
  });

  it("requires complete same-run ramp evidence and a boundary above a later soak", () => {
    const planStages = [
      { name: "ramp-10", group: "ramp", users: 10 },
      { name: "ramp-25", group: "ramp", users: 25 },
      { name: "ramp-50", group: "ramp", users: 50 },
      { name: "ramp-100", group: "ramp", users: 100 },
      { name: "soak-25", group: "soak", users: 25 },
    ];
    const passed10 = {
      stage: "ramp-10",
      passed: true,
      plateau_passed: true,
    };

    expect(() =>
      suiteModule.assertSoakSupportedByRampEvidence({
        soakStage: { name: "soak-25", users: 25 },
        planStages,
        stageResults: [
          { stage: "ramp-10", group: "ramp", users: 10 },
          { stage: "ramp-25", group: "ramp", users: 25 },
        ],
        stageGates: [
          passed10,
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: false,
            recorded_ramp_latency_breach: true,
            failures: [],
            performance_failures: [
              "p95 exceeded 2x the calibrated representative mixed warm baseline",
            ],
          },
        ],
      }),
    ).toThrow(
      /soak-25.*every declared same-run ramp.*ramp-50, ramp-100/i,
    );

    expect(
      suiteModule.assertSoakSupportedByRampEvidence({
        soakStage: { name: "soak-25", users: 25 },
        planStages,
        stageResults: planStages
          .filter((stage) => stage.group === "ramp")
          .map((stage) => ({
            stage: stage.name,
            group: stage.group,
            users: stage.users,
          })),
        stageGates: [
          passed10,
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-50",
            passed: true,
            plateau_passed: false,
            recorded_ramp_latency_breach: true,
            failures: [],
            performance_failures: [
              "p95 exceeded 2x the calibrated representative mixed warm baseline",
            ],
          },
          {
            stage: "ramp-100",
            passed: true,
            plateau_passed: false,
            recorded_ramp_latency_breach: true,
            failures: [],
            performance_failures: [
              "p95 exceeded 2x the calibrated representative mixed warm baseline",
            ],
          },
        ],
      }),
    ).toMatchObject({
      passed: true,
      basis: "recorded_ramp_latency_boundary",
      soak_users: 25,
      supporting_ramp_users: 50,
    });

    expect(() =>
      suiteModule.assertSoakSupportedByRampEvidence({
        soakStage: { name: "soak-25", users: 25 },
        planStages,
        stageResults: planStages
          .filter((stage) => stage.group === "ramp")
          .map((stage) => ({
            stage: stage.name,
            group: stage.group,
            users: stage.users,
          })),
        stageGates: [
          passed10,
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: false,
            recorded_ramp_latency_breach: true,
            failures: [],
            performance_failures: [
              "p95 exceeded 2x the calibrated representative mixed warm baseline",
            ],
          },
          {
            stage: "ramp-50",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-100",
            passed: true,
            plateau_passed: false,
            recorded_ramp_latency_breach: true,
            failures: [],
            performance_failures: [
              "p95 exceeded 2x the calibrated representative mixed warm baseline",
            ],
          },
        ],
      }),
    ).toThrow(/soak-25.*strictly below.*ramp-25/i);

    expect(
      suiteModule.assertSoakSupportedByRampEvidence({
        soakStage: { name: "soak-25", users: 25 },
        planStages,
        stageResults: planStages
          .filter((stage) => stage.group === "ramp")
          .map((stage) => ({
            stage: stage.name,
            group: stage.group,
            users: stage.users,
          })),
        stageGates: planStages
          .filter((stage) => stage.group === "ramp")
          .map((stage) => ({
            stage: stage.name,
            passed: true,
            plateau_passed: true,
          })),
      }),
    ).toMatchObject({
      passed: true,
      basis: "passing_ramp_plateau",
      soak_users: 25,
      supporting_ramp_users: 100,
    });

    const standaloneSoak =
      suiteModule.buildMutationSuitePlan("soak");
    expect(
      standaloneSoak.stages.map((stage) => stage.name),
    ).toEqual([
      "mixed-calibration-1",
      "ramp-10",
      "ramp-25",
      "ramp-50",
      "ramp-100",
      "soak-25",
    ]);
  });

  it("reconciles completed soak users against final ramp and breakpoint boundaries", () => {
    const soak = {
      stage: "soak-25",
      group: "soak",
      users: 25,
    };
    const ramp10 = {
      stage: "ramp-10",
      group: "ramp",
      users: 10,
    };
    const ramp25 = {
      stage: "ramp-25",
      group: "ramp",
      users: 25,
    };
    const terminal25 = {
      stage: "breakpoint-25",
      group: "breakpoint",
      users: 25,
    };
    const terminal50 = {
      stage: "breakpoint-50",
      group: "breakpoint",
      users: 50,
    };

    expect(
      suiteModule.evaluateCompletedSoakPlateauProvenance({
        stageResults: [ramp10, ramp25, soak, terminal25],
        stageGates: [
          {
            stage: "ramp-10",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "breakpoint-25",
            passed: true,
            plateau_passed: false,
            expected_terminal: true,
          },
        ],
      }),
    ).toMatchObject({
      passed: false,
      basis: "performance_terminal",
      soak_users: [25],
      boundary_stage: "breakpoint-25",
      boundary_users: 25,
      failures: [
        expect.stringMatching(/soak-25.*strictly below.*breakpoint-25/i),
      ],
    });

    expect(
      suiteModule.evaluateCompletedSoakPlateauProvenance({
        stageResults: [ramp10, ramp25, soak, terminal50],
        stageGates: [
          {
            stage: "ramp-10",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "breakpoint-50",
            passed: true,
            plateau_passed: false,
            expected_terminal: true,
          },
        ],
      }),
    ).toMatchObject({
      passed: true,
      basis: "performance_terminal",
      boundary_stage: "breakpoint-50",
      boundary_users: 50,
      failures: [],
    });

    const ramp50 = {
      stage: "ramp-50",
      group: "ramp",
      users: 50,
    };
    const ramp100 = {
      stage: "ramp-100",
      group: "ramp",
      users: 100,
    };
    expect(
      suiteModule.evaluateCompletedSoakPlateauProvenance({
        stageResults: [
          ramp10,
          ramp25,
          ramp50,
          ramp100,
          soak,
        ],
        stageGates: [
          {
            stage: "ramp-10",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: true,
          },
          ...["ramp-50", "ramp-100"].map((stage) => ({
            stage,
            passed: true,
            plateau_passed: false,
            recorded_ramp_latency_breach: true,
            failures: [],
            performance_failures: [
              "p95 exceeded 2x the calibrated representative mixed warm baseline",
            ],
          })),
        ],
      }),
    ).toMatchObject({
      passed: true,
      basis: "recorded_ramp_latency_boundary",
      boundary_stage: "ramp-50",
      boundary_users: 50,
      failures: [],
    });

    expect(
      suiteModule.evaluateCompletedSoakPlateauProvenance({
        stageResults: [ramp10, ramp25, soak],
        stageGates: [
          {
            stage: "ramp-10",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: false,
            recorded_ramp_latency_breach: true,
            failures: [],
            performance_failures: [
              "p95 exceeded 2x the calibrated representative mixed warm baseline",
            ],
          },
        ],
      }),
    ).toMatchObject({
      passed: false,
      basis: "recorded_ramp_latency_boundary",
      boundary_stage: "ramp-25",
      boundary_users: 25,
      failures: expect.arrayContaining([
        expect.stringMatching(/passing same-run ramp plateau at 25 users/i),
        expect.stringMatching(/strictly below.*ramp-25/i),
      ]),
    });

    const passing50 = {
      stage: "breakpoint-50",
      group: "breakpoint",
      users: 50,
    };
    expect(
      suiteModule.evaluateCompletedSoakPlateauProvenance({
        stageResults: [ramp10, ramp25, soak, passing50],
        stageGates: [
          {
            stage: "ramp-10",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "breakpoint-50",
            passed: true,
            plateau_passed: true,
          },
        ],
      }),
    ).toMatchObject({
      passed: true,
      basis: "passing_plateau",
      boundary_stage: "breakpoint-50",
      boundary_users: 50,
      failures: [],
    });

    expect(
      suiteModule.evaluateCompletedSoakPlateauProvenance({
        stageResults: [ramp10, ramp25, soak],
        stageGates: [
          {
            stage: "ramp-10",
            passed: true,
            plateau_passed: true,
          },
          {
            stage: "ramp-25",
            passed: true,
            plateau_passed: true,
          },
        ],
      }),
    ).toMatchObject({
      passed: false,
      basis: "passing_plateau",
      boundary_stage: "ramp-25",
      boundary_users: 25,
      failures: [
        expect.stringMatching(/no passing executed plateau above 25 users/i),
      ],
    });

    expect(
      suiteModule.evaluateCompletedSoakPlateauProvenance({
        stageResults: [soak],
        stageGates: [],
      }),
    ).toMatchObject({
      passed: false,
      basis: "passing_plateau",
      boundary_stage: null,
      boundary_users: null,
      failures: expect.arrayContaining([
        expect.stringMatching(/passing same-run ramp plateau at 25 users/i),
        expect.stringMatching(/no passing executed plateau above 25 users/i),
      ]),
    });
  });

  it("keeps declared normal weights read dominant", () => {
    const plan = suiteModule.buildMutationSuitePlan("full");
    const readWeight = plan.readTaskKeys.reduce(
      (total, key) => total + plan.taskWeights[key],
      0,
    );

    expect(Object.values(plan.taskWeights).reduce((a, b) => a + b, 0)).toBe(
      100,
    );
    expect(readWeight).toBe(65);
    expect(plan.ceilings).toMatchObject({
      maximum_users: 100,
      maximum_profile_runtime_seconds: 3_600,
      maximum_soak_runtime_seconds: 3_900,
      maximum_requests: 200_000,
      maximum_requests_per_second: 60,
    });
  });

  it("derives and enforces a finite selected-suite request ceiling from the per-stage cap", () => {
    expect(
      suiteModule.buildMutationSuitePlan("smoke")
        .cumulativeRequestCeiling,
    ).toBe(200_000);
    expect(
      suiteModule.deriveCumulativeSuiteRequestCeiling({
        stages: [{}, {}, {}],
        ceilings: { maximum_requests: 200_000 },
      }),
    ).toBe(600_000);

    expect(
      suiteModule.summarizeCumulativeRequestUsage({
        stageResults: [
          { metrics: { requests: 120 } },
          { metrics: { requests: 75 } },
        ],
        operatorRequestCount: 5,
        ceiling: 201,
      }),
    ).toEqual({
      locust_requests: 195,
      operator_requests: 5,
      total_requests: 200,
      ceiling: 201,
      reached: false,
    });
    expect(
      suiteModule.summarizeCumulativeRequestUsage({
        stageResults: [{ metrics: { requests: 195 } }],
        operatorRequestCount: 5,
        ceiling: 200,
      }).reached,
    ).toBe(true);
  });

  it("computes sequential aggregate rates from counts over total achieved duration", () => {
    const aggregate =
      suiteModule.aggregateSequentialStageMetrics([
        {
          achieved_duration_seconds: 10,
          metrics: {
            requests: 120,
            requests_per_second: 12,
            requests_by_name: [
              {
                method: "GET",
                name: "GET timeline",
                requests: 100,
                failures: 1,
                requests_per_second: 10,
              },
              {
                method: "POST",
                name: "POST status",
                requests: 20,
                failures: 0,
                requests_per_second: 2,
              },
            ],
          },
        },
        {
          achieved_duration_seconds: 30,
          metrics: {
            requests: 120,
            requests_per_second: 4,
            requests_by_name: [
              {
                method: "GET",
                name: "GET timeline",
                requests: 60,
                failures: 0,
                requests_per_second: 2,
              },
              {
                method: "POST",
                name: "POST status",
                requests: 60,
                failures: 2,
                requests_per_second: 2,
              },
            ],
          },
        },
      ]);

    expect(aggregate).toMatchObject({
      achieved_duration_seconds: 40,
      requests: 240,
      requests_per_second: 6,
      requests_by_name: [
        {
          method: "GET",
          name: "GET timeline",
          requests: 160,
          failures: 1,
          requests_per_second: 4,
        },
        {
          method: "POST",
          name: "POST status",
          requests: 80,
          failures: 2,
          requests_per_second: 2,
        },
      ],
    });
  });

  it("creates exact run IDs and rejects a mutation anchor rollover", () => {
    expect(
      suiteModule.createMutationLoadRunId(
        new Date("2026-07-29T12:34:56.000Z"),
      ),
    ).toMatch(/^20260729t123456z-[a-f0-9]{12}$/);

    const now = Temporal.Instant.from("2026-07-29T16:00:00Z");
    expect(() =>
      suiteModule.assertMutationAnchorDate("2026-07-29", now),
    ).not.toThrow();
    expect(() =>
      suiteModule.assertMutationAnchorDate("2026-07-28", now),
    ).toThrow(/crossed the mutation fixture anchor/);
  });

  it("rejects undeclared suites and path-like run IDs before lifecycle work", async () => {
    expect(() =>
      suiteModule.buildMutationSuitePlan("unbounded"),
    ).toThrow(/Mutation-load suite/);
    await expect(
      suiteModule.runMutationSuite({
        suite: "smoke",
        runId: "../../outside",
      }),
    ).rejects.toThrow(/CADENCE_LOAD_RUN_ID/);
  });

  it("splits cumulative Locust history into independent soak halves", () => {
    const history = [
      "Timestamp,User Count,Type,Name,Requests/s,Failures/s,Total Request Count,Total Failure Count",
      "1,25,,Aggregated,1,0,0,0",
      "2,25,,Aggregated,2,0,100,1",
      "3,25,,Aggregated,2,0,220,1",
      "4,25,,Aggregated,2,0,350,2",
      "",
    ].join("\n");

    expect(
      suiteModule.summarizeFailureHalves(history, {
        requests: 400,
        failures: 3,
      }),
    ).toEqual({
      first: {
        requests: 100,
        failures: 1,
      },
      second: {
        requests: 300,
        failures: 2,
      },
    });
  });

  it("retains sparse fail-closed history without masking the stage gate", () => {
    const header =
      "Timestamp,User Count,Type,Name,Requests/s,Failures/s,Total Request Count,Total Failure Count";

    expect(
      suiteModule.summarizeFailureHalves(`${header}\n`, {
        requests: 0,
        failures: 0,
      }),
    ).toEqual({
      first: { requests: 0, failures: 0 },
      second: { requests: 0, failures: 0 },
    });
    expect(
      suiteModule.summarizeFailureHalves(
        `${header}\n1,0,,Aggregated,0,0,0,0\n`,
        { requests: 25, failures: 1 },
      ),
    ).toEqual({
      first: { requests: 0, failures: 0 },
      second: { requests: 25, failures: 1 },
    });
  });

  it("rejects final stats totals that regress behind cumulative history", () => {
    const history = [
      "Timestamp,User Count,Type,Name,Requests/s,Failures/s,Total Request Count,Total Failure Count",
      "1,25,,Aggregated,1,0,100,1",
      "2,25,,Aggregated,2,0,220,2",
      "",
    ].join("\n");

    expect(() =>
      suiteModule.summarizeFailureHalves(history, {
        requests: 219,
        failures: 2,
      }),
    ).toThrow(/must not regress behind cumulative history/i);
    expect(() =>
      suiteModule.summarizeFailureHalves(history, {
        requests: 220,
        failures: 1,
      }),
    ).toThrow(/must not regress behind cumulative history/i);
  });

  it("rejects invalid final stats totals", () => {
    const history =
      "Timestamp,User Count,Type,Name,Requests/s,Failures/s,Total Request Count,Total Failure Count\n";

    expect(() =>
      suiteModule.summarizeFailureHalves(history, {
        requests: 10,
        failures: 11,
      }),
    ).toThrow(/valid cumulative request counts/i);
  });

  it("reconciles every processed send while retaining concurrent user cancellations", () => {
    const before = {
      reminderStatuses: {
        pending: 20,
        cancelled: 10,
        sent: 0,
        failed: 0,
      },
      operatorReminderStatuses: {
        pending: 10,
        processing: 0,
        cancelled: 0,
        sent: 0,
        failed: 0,
      },
    };
    const after = {
      reminderStatuses: {
        pending: 4,
        cancelled: 16,
        sent: 10,
        failed: 0,
      },
      operatorReminderStatuses: {
        pending: 0,
        processing: 0,
        cancelled: 0,
        sent: 10,
        failed: 0,
      },
      integrityChecks: {
        duplicateDeliveries: 0,
      },
    };

    expect(suiteModule.finalProviderEvidence(before, after)).toEqual({
      sent: 10,
      failed: 0,
      cancelled: 6,
      processing: 0,
      duplicateKeys: 0,
    });
  });

  it("publishes the synthetic run id while retaining private selectors", () => {
    const needles = new Set<string>();
    suiteModule.collectSessionSecrets(
      {
        run_id: "20260729t120000z-abcdef123456",
        identities: [
          {
            cookies: { session: "private-cookie" },
            selectors: {
              occurrence_id:
                "11111111-1111-4111-8111-111111111111",
              owner_marker: "cadence-owner-aaaaaaaaaaaaaaaaaaaa",
            },
          },
        ],
      },
      needles,
    );

    expect(needles).not.toContain(
      "20260729t120000z-abcdef123456",
    );
    expect(needles).toContain("private-cookie");
    expect(needles).toContain(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(needles).toContain(
      "cadence-owner-aaaaaaaaaaaaaaaaaaaa",
    );
  });
});
