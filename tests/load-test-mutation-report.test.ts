import { describe, expect, it } from "vitest";

import {
  OPERATOR_REQUEST_NAMES,
  REQUIRED_MUTATION_INTEGRITY_ZERO_FIELDS,
  REQUIRED_TIMED_MUTATION_REQUEST_NAMES,
  buildInteractionRequestContracts,
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
  parseMutationStatsCsv,
  selectHighestSustainableLocalPlateau,
  // @ts-expect-error The report helper is a plain Node ESM module.
} from "../scripts/load-test-mutation-report.mjs";

const TIMELINE_READ = "INT-SHELL-001 GET /timeline protected-document";

function row(
  method: string,
  name: string,
  requests: number,
  failures = 0,
) {
  return {
    method,
    name,
    requests,
    failures,
    requests_per_second: requests / 10,
  };
}

function interactionManifest() {
  const requestNames = [
    TIMELINE_READ,
    ...REQUIRED_TIMED_MUTATION_REQUEST_NAMES,
  ];
  return {
    entries: requestNames.map((name, index) => ({
      id: `INT-TEST-${String(index).padStart(3, "0")}`,
      requests: [
        {
          name,
          method: name.includes(" POST ") ? "POST" : "GET",
        },
      ],
    })),
  };
}

function validIntegritySummary() {
  return {
    workloadClassification: "mutation",
    violations: 0,
    integrityChecks: Object.fromEntries(
      REQUIRED_MUTATION_INTEGRITY_ZERO_FIELDS.map((field: string) => [
        field,
        0,
      ]),
    ),
    rowCounts: {
      behaviors: 10,
      occurrences: 100,
    },
    reminderStatuses: {
      pending: 0,
      processing: 0,
      sent: 1,
      failed: 0,
      cancelled: 1,
    },
    duePastReminderNonReactivation: {
      tracked_occurrences: 10,
      tracked_deliveries: 10,
      exercised_occurrences: 2,
      clear_events: 2,
      unresolved_occurrences: 10,
      cancelled_deliveries: 2,
      reactivated_deliveries: 0,
    },
    activePushSubscriptions: 0,
    databaseConnectionCount: null,
    mutationDeltas: {
      behaviors: 1,
      schedules: 1,
      slots: 1,
      occurrences: 4,
      statusEvents: 20,
      definitionEvents: 2,
      reminders: 2,
    },
  };
}

function processResult(overrides = {}) {
  return {
    checked: 1,
    claimed: 1,
    skipped: 0,
    sent: 1,
    failed: 0,
    cancelled: 0,
    ...overrides,
  };
}

const MEBIBYTE = 1024 * 1024;
const SOAK_DURATION_SECONDS = 60 * 60;

function soakResourceSamples(
  appRssAt: (elapsedMilliseconds: number) => number = () =>
    512 * MEBIBYTE,
) {
  return Array.from(
    { length: SOAK_DURATION_SECONDS / 5 },
    (_, index) => {
      const elapsedMilliseconds = index * 5_000;
      return {
        elapsed_milliseconds: elapsedMilliseconds,
        app_rss_bytes: appRssAt(elapsedMilliseconds),
      };
    },
  );
}

describe("Ticket 065 mutation report helpers", () => {
  it("reuses the Locust CSV parser and records achieved read/write weights and RPS", () => {
    const csv = [
      "Type,Name,Request Count,Failure Count,Median Response Time,Average Response Time,Min Response Time,Max Response Time,Average Content Size,Requests/s,Failures/s,50%,66%,75%,80%,90%,95%,98%,99%,99.9%,99.99%,100%",
      `GET,${TIMELINE_READ},70,0,10,10,5,20,2000,7,0,10,10,10,10,15,18,20,20,20,20,20`,
      `POST,${REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0]},30,0,20,20,10,30,1000,3,0,20,20,20,20,25,28,30,30,30,30,30`,
      ",Aggregated,100,0,12,13,5,30,1700,10,0,12,12,15,15,20,25,28,29,30,30,30",
      "",
    ].join("\n");

    expect(parseMutationStatsCsv(csv).request_mix).toMatchObject({
      total_requests: 100,
      requests_per_second: 10,
      read: {
        requests: 70,
        weight_percent: 70,
        requests_per_second: 7,
      },
      mutation: {
        requests: 30,
        weight_percent: 30,
        requests_per_second: 3,
      },
      reads_dominant: true,
    });
  });

  it("requires timed GET reads to remain dominant over user and operator writes", () => {
    const passing = {
      requests_per_second: 10,
      requests_by_name: [
        row("GET", TIMELINE_READ, 60),
        row("POST", REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0], 39),
        row("POST", OPERATOR_REQUEST_NAMES[0], 1),
      ],
    };
    expect(evaluateRequestMixGate(passing)).toMatchObject({
      passed: true,
      summary: {
        read: { weight_percent: 60 },
        mutation: { weight_percent: 39 },
        operator: { weight_percent: 1 },
      },
    });

    expect(
      evaluateRequestMixGate({
        ...passing,
        requests_by_name: [
          row("GET", TIMELINE_READ, 50),
          row("POST", REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0], 50),
        ],
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("not dominant"),
      ]),
    });
  });

  it("derives declared contracts and rejects names containing dynamic identifiers", () => {
    const manifest = interactionManifest();
    expect(buildInteractionRequestContracts(manifest).get(TIMELINE_READ)).toBe(
      "GET",
    );
    expect(
      evaluateStableRequestNameGate({
        requestsByName: [
          row("GET", TIMELINE_READ, 10),
          row(
            "POST",
            REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0],
            1,
          ),
          row("POST", OPERATOR_REQUEST_NAMES[0], 1),
        ],
        interactionManifest: manifest,
      }),
    ).toMatchObject({ passed: true });

    const unstable =
      "INT-TIMELINE-005 POST /timeline?occurrence_id=11111111-1111-4111-8111-111111111111";
    expect(
      evaluateStableRequestNameGate({
        requestsByName: [row("POST", unstable, 1)],
        interactionManifest: manifest,
      }),
    ).toMatchObject({
      passed: false,
      invalid_names: [
        expect.objectContaining({
          name: unstable,
          reasons: expect.arrayContaining([
            "not declared",
            "contains a dynamic or private identifier",
          ]),
        }),
      ],
    });
  });

  it("gates every required timed mutation and its semantic verification count", () => {
    const rows = REQUIRED_TIMED_MUTATION_REQUEST_NAMES.map((name: string) =>
      row("POST", name, 2),
    );
    const semanticVerifications = Object.fromEntries(
      REQUIRED_TIMED_MUTATION_REQUEST_NAMES.map((name: string) => [name, 2]),
    );
    expect(
      evaluateTimedMutationCoverage({
        requestsByName: rows,
        semanticVerifications,
      }),
    ).toMatchObject({
      passed: true,
      covered: REQUIRED_TIMED_MUTATION_REQUEST_NAMES,
    });

    semanticVerifications[REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0]] = 1;
    expect(
      evaluateTimedMutationCoverage({
        requestsByName: rows.slice(0, -1),
        semanticVerifications,
      }),
    ).toMatchObject({
      passed: false,
      missing: [REQUIRED_TIMED_MUTATION_REQUEST_NAMES.at(-1)],
      unverified: [REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0]],
    });
  });

  it("requires one non-reusable semantic readback receipt per successful POST", () => {
    const name = REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0];
    const requests = [row("POST", name, 3, 1)];
    const evidence = {
      schema_version: "1.0.0",
      successful_submissions: { [name]: 2 },
      semantic_verifications: { [name]: 2 },
      pending_verifications: {},
    };

    expect(
      evaluateSemanticVerificationGate({
        requestsByName: requests,
        evidence,
      }),
    ).toMatchObject({
      passed: true,
      mismatches: [],
    });

    expect(
      evaluateSemanticVerificationGate({
        requestsByName: requests,
        evidence: {
          ...evidence,
          semantic_verifications: { [name]: 1 },
          pending_verifications: { [name]: 1 },
        },
      }),
    ).toMatchObject({
      passed: false,
      mismatches: [
        expect.objectContaining({
          name,
          successful_requests: 2,
          successful_submissions: 2,
          semantic_verifications: 1,
          pending_verifications: 1,
          reasons: expect.arrayContaining([
            "not every successful POST had semantic readback",
          ]),
        }),
      ],
    });

    expect(
      evaluateSemanticVerificationGate({
        requestsByName: requests,
        evidence: {
          ...evidence,
          semantic_verifications: { [name]: 3 },
        },
      }),
    ).toMatchObject({
      passed: false,
      mismatches: [
        expect.objectContaining({
          reasons: expect.arrayContaining([
            "not every successful POST had semantic readback",
            "pending receipt count did not reconcile",
          ]),
        }),
      ],
    });
  });

  it("rejects semantic evidence with extra top-level fields", () => {
    const name = REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0];
    const result = evaluateSemanticVerificationGate({
      requestsByName: [row("POST", name, 1)],
      evidence: {
        schema_version: "1.0.0",
        successful_submissions: { [name]: 1 },
        semantic_verifications: { [name]: 1 },
        pending_verifications: {},
        unexpected: true,
      },
    });

    expect(result).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        "semantic verification evidence has unexpected fields",
      ]),
    });
  });

  it("correlates successful status writes with append-only event evidence", () => {
    const requests = [
      row("POST", REQUIRED_TIMED_MUTATION_REQUEST_NAMES[0], 4),
      row("POST", REQUIRED_TIMED_MUTATION_REQUEST_NAMES[1], 3, 1),
      row("POST", REQUIRED_TIMED_MUTATION_REQUEST_NAMES[3], 8),
    ];
    const evidence = {
      baselineEventCount: 20,
      totalEventCount: 26,
      appendedEventCount: 6,
      eventBackedOccurrenceCount: 12,
      snapshotCorrelatedOccurrenceCount: 12,
    };

    expect(
      evaluateStatusEventCorrelation({
        requestsByName: requests,
        statusEventDelta: 6,
        statusTransitionEvidence: evidence,
        requireAppended: true,
      }),
    ).toMatchObject({
      passed: true,
      successful_status_transitions: 6,
      appended_status_events: 6,
    });

    expect(
      evaluateStatusEventCorrelation({
        requestsByName: requests,
        statusEventDelta: 5,
        statusTransitionEvidence: {
          ...evidence,
          totalEventCount: 25,
          appendedEventCount: 5,
          snapshotCorrelatedOccurrenceCount: 11,
        },
        requireAppended: true,
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("do not cover"),
        expect.stringContaining("do not correlate"),
      ]),
    });
  });

  it("requires every mutation fixture integrity counter to be present and zero", () => {
    expect(
      evaluateMutationIntegrityGate(validIntegritySummary()),
    ).toMatchObject({ passed: true });

    const invalid = validIntegritySummary();
    invalid.violations = 2;
    invalid.integrityChecks.crossOwnerRows = 1;
    invalid.activePushSubscriptions = 1;
    delete (
      invalid.duePastReminderNonReactivation as Record<
        string,
        number
      >
    ).exercised_occurrences;
    expect(evaluateMutationIntegrityGate(invalid)).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("aggregate"),
        expect.stringContaining("crossOwnerRows"),
        expect.stringContaining("Web Push"),
        expect.stringContaining(
          "duePastReminderNonReactivation.exercised_occurrences",
        ),
      ]),
    });
  });

  it("requires a nonzero resolved-to-Unresolved proof with no due/past reactivation", () => {
    const evidence = {
      tracked_occurrences: 10,
      tracked_deliveries: 10,
      exercised_occurrences: 1,
      clear_events: 2,
      unresolved_occurrences: 10,
      cancelled_deliveries: 1,
      reactivated_deliveries: 0,
    };
    expect(
      evaluateDuePastReminderNonReactivation({ evidence }),
    ).toMatchObject({
      passed: true,
      exercised: true,
    });
    expect(
      evaluateDuePastReminderNonReactivation({
        evidence: {
          ...evidence,
          cancelled_deliveries: 0,
          reactivated_deliveries: 1,
        },
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("reactivated"),
      ]),
    });
    expect(
      evaluateDuePastReminderNonReactivation({
        evidence: {
          ...evidence,
          exercised_occurrences: 0,
          clear_events: 0,
          cancelled_deliveries: 0,
        },
      }),
    ).toMatchObject({
      passed: false,
      failures: [
        expect.stringContaining("not exercised"),
      ],
    });
  });

  it("rejects due/past count mismatches while allowing repeated clears of one exercised occurrence", () => {
    const evidence = {
      tracked_occurrences: 10,
      tracked_deliveries: 10,
      exercised_occurrences: 2,
      clear_events: 4,
      unresolved_occurrences: 10,
      cancelled_deliveries: 2,
      reactivated_deliveries: 0,
    };
    expect(
      evaluateDuePastReminderNonReactivation({ evidence }),
    ).toMatchObject({ passed: true });

    for (const [overrides, message] of [
      [
        { tracked_deliveries: 9 },
        "fixture counts do not reconcile",
      ],
      [
        {
          exercised_occurrences: 11,
          clear_events: 11,
          cancelled_deliveries: 11,
        },
        "clear events do not reconcile",
      ],
      [
        { clear_events: 1 },
        "clear events do not reconcile",
      ],
      [
        { unresolved_occurrences: 9 },
        "did not remain Unresolved",
      ],
      [
        { cancelled_deliveries: 1 },
        "do not match unique exercised occurrences",
      ],
    ] as const) {
      expect(
        evaluateDuePastReminderNonReactivation({
          evidence: { ...evidence, ...overrides },
        }),
      ).toMatchObject({
        passed: false,
        failures: expect.arrayContaining([
          expect.stringContaining(message),
        ]),
      });
    }
  });

  it("uses warm RSS windows instead of a cold initial soak sample", () => {
    expect(
      evaluateSoakNoGrowthGate({
        resourceSamples: soakResourceSamples((elapsed) => {
          if (elapsed < 300_000) return 64 * MEBIBYTE;
          if (elapsed >= 3_300_000) return 560 * MEBIBYTE;
          return 512 * MEBIBYTE;
        }),
        declaredDurationSeconds: SOAK_DURATION_SECONDS,
        firstResource: {
          databaseConnections: 12,
        },
        finalResource: {
          databaseConnections: 13,
        },
        failureHalves: {
          first: { requests: 1_000, failures: 1 },
          second: { requests: 1_100, failures: 1 },
        },
      }),
    ).toMatchObject({
      passed: true,
      evidence: {
        rss: {
          baseline_window: {
            start_elapsed_milliseconds: 300_000,
            end_elapsed_milliseconds: 600_000,
            valid_sample_count: 60,
            median_bytes: 512 * MEBIBYTE,
          },
          terminal_window: {
            start_elapsed_milliseconds: 3_300_000,
            end_elapsed_milliseconds: 3_600_000,
            valid_sample_count: 60,
            median_bytes: 560 * MEBIBYTE,
          },
          growth_bytes: 48 * MEBIBYTE,
          allowed_growth_bytes: 128 * MEBIBYTE,
        },
        database_connections: { growth: 1 },
      },
    });
  });

  it("fails a sustained RSS increase beyond the bounded allowance", () => {
    expect(
      evaluateSoakNoGrowthGate({
        resourceSamples: soakResourceSamples((elapsed) => {
          if (elapsed < 600_000) return 256 * MEBIBYTE;
          if (elapsed >= 3_300_000) return 512 * MEBIBYTE;
          return Math.round(
            256 * MEBIBYTE +
              ((elapsed - 600_000) / 2_700_000) *
                256 *
                MEBIBYTE,
          );
        }),
        declaredDurationSeconds: SOAK_DURATION_SECONDS,
        firstResource: {
          databaseConnections: 10,
        },
        finalResource: {
          databaseConnections: 10,
        },
        failureHalves: {
          first: { requests: 1_000, failures: 0 },
          second: { requests: 1_000, failures: 0 },
        },
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("RSS growth"),
      ]),
    });
  });

  it("fails closed when RSS windows lack valid temporal coverage", () => {
    const missingCoverage = soakResourceSamples().filter(
      (sample) =>
        sample.elapsed_milliseconds < 545_000 ||
        sample.elapsed_milliseconds >= 600_000,
    );
    expect(
      evaluateSoakNoGrowthGate({
        resourceSamples: missingCoverage,
        declaredDurationSeconds: SOAK_DURATION_SECONDS,
        firstResource: { databaseConnections: 10 },
        finalResource: { databaseConnections: 10 },
        failureHalves: {
          first: { requests: 1_000, failures: 0 },
          second: { requests: 1_000, failures: 0 },
        },
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining(
          "baseline RSS window lacks the required valid sample count",
        ),
        expect.stringContaining(
          "baseline RSS window ends too far before",
        ),
      ]),
    });

    const gappedCoverage = soakResourceSamples().filter(
      (sample) =>
        sample.elapsed_milliseconds < 400_000 ||
        sample.elapsed_milliseconds > 410_000,
    );
    expect(
      evaluateSoakNoGrowthGate({
        resourceSamples: gappedCoverage,
        declaredDurationSeconds: SOAK_DURATION_SECONDS,
        firstResource: { databaseConnections: 10 },
        finalResource: { databaseConnections: 10 },
        failureHalves: {
          first: { requests: 1_000, failures: 0 },
          second: { requests: 1_000, failures: 0 },
        },
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining(
          "baseline RSS window contains an excessive sampling gap",
        ),
      ]),
    });

    const invalidCoverage = soakResourceSamples().map((sample) =>
      sample.elapsed_milliseconds === 3_500_000
        ? { ...sample, app_rss_bytes: null }
        : sample,
    );
    expect(
      evaluateSoakNoGrowthGate({
        resourceSamples: invalidCoverage,
        declaredDurationSeconds: SOAK_DURATION_SECONDS,
        firstResource: { databaseConnections: 10 },
        finalResource: { databaseConnections: 10 },
        failureHalves: {
          first: { requests: 1_000, failures: 0 },
          second: { requests: 1_000, failures: 0 },
        },
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining(
          "terminal RSS window contains invalid app RSS samples",
        ),
      ]),
    });
  });

  it("fails closed for non-monotonic RSS samples or overlapping evidence windows", () => {
    const nonMonotonic = soakResourceSamples();
    nonMonotonic[121] = {
      ...nonMonotonic[121],
      elapsed_milliseconds:
        nonMonotonic[120].elapsed_milliseconds,
    };
    const common = {
      firstResource: { databaseConnections: 10 },
      finalResource: { databaseConnections: 10 },
      failureHalves: {
        first: { requests: 1_000, failures: 0 },
        second: { requests: 1_000, failures: 0 },
      },
    };

    expect(
      evaluateSoakNoGrowthGate({
        ...common,
        resourceSamples: nonMonotonic,
        declaredDurationSeconds: SOAK_DURATION_SECONDS,
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("strictly increasing"),
      ]),
    });

    expect(
      evaluateSoakNoGrowthGate({
        ...common,
        resourceSamples: soakResourceSamples(),
        declaredDurationSeconds: 14 * 60,
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining(
          "declared soak duration must provide distinct RSS evidence windows",
        ),
      ]),
    });
  });

  it("preserves soak failure-half and database-connection gates", () => {
    expect(
      evaluateSoakNoGrowthGate({
        resourceSamples: soakResourceSamples(),
        declaredDurationSeconds: SOAK_DURATION_SECONDS,
        firstResource: { databaseConnections: 10 },
        finalResource: { databaseConnections: 15 },
        failureHalves: {
          first: { requests: 1_000, failures: 0 },
          second: { requests: 1_000, failures: 6 },
        },
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("failure ratio"),
        expect.stringContaining("database connection growth"),
      ]),
    });

    for (const [firstConnections, finalConnections] of [
      [null, null],
      [10, null],
      [null, 10],
    ]) {
      expect(
        evaluateSoakNoGrowthGate({
          resourceSamples: soakResourceSamples(),
          declaredDurationSeconds: SOAK_DURATION_SECONDS,
          firstResource: {
            databaseConnections: firstConnections,
          },
          finalResource: {
            databaseConnections: finalConnections,
          },
          failureHalves: {
            first: { requests: 1_000, failures: 0 },
            second: { requests: 1_000, failures: 0 },
          },
        }),
      ).toMatchObject({
        passed: false,
        failures: expect.arrayContaining([
          expect.stringContaining(
            "database connection samples are required",
          ),
        ]),
      });
    }
  });

  it("selects the highest passing plateau and labels it local, not production", () => {
    expect(
      selectHighestSustainableLocalPlateau({
        targetClassification: "local",
        plateaus: [
          {
            stage: "breakpoint-50",
            users: 50,
            requests_per_second: 12,
            passed: true,
          },
          {
            stage: "breakpoint-100",
            users: 100,
            requests_per_second: 21,
            passed: false,
          },
          {
            stage: "ramp-75",
            users: 75,
            metrics: { requests_per_second: 17.5 },
            passed: true,
          },
        ],
      }),
    ).toEqual({
      target_classification: "local",
      production_capacity: false,
      capacity_label: "highest sustainable local plateau (not production)",
      highest_sustainable_local_users: 75,
      achieved_requests_per_second: 17.5,
      stage: "ramp-75",
      evaluated_plateaus: 3,
      passing_plateaus: 2,
    });

    expect(() =>
      selectHighestSustainableLocalPlateau({
        targetClassification: "hosted_staging",
        plateaus: [
          {
            stage: "hosted",
            users: 10,
            requests_per_second: 1,
            passed: true,
          },
        ],
      }),
    ).toThrow(/only from local evidence/);
  });

  it("reconciles bounded operator calls, idempotent replay, and fake-provider evidence", () => {
    const input = {
      operatorRequests: [
        row("POST", OPERATOR_REQUEST_NAMES[0], 1),
        row("POST", OPERATOR_REQUEST_NAMES[1], 2),
      ],
      occurrenceSyncResults: [
        { checked: 3, synced: 2, skipped: 1, failed: 0 },
      ],
      reminderProcessResults: [processResult()],
      reminderReplayResult: processResult({
        checked: 1,
        claimed: 0,
        skipped: 1,
        sent: 0,
      }),
      fakeProvider: {
        target_classification: "local",
        provider: "fake_sequenzy",
        requests_total: 1,
        accepted: 1,
        rejected: 0,
        unique_delivery_fingerprints: 1,
        duplicate_send_attempts: 0,
        web_push_attempts: 0,
      },
      finalDeliveryDelta: {
        sent: 1,
        failed: 0,
        cancelled: 0,
        processing: 0,
        duplicateKeys: 0,
      },
      activePushSubscriptions: 0,
    };

    expect(
      evaluateOperatorProviderReconciliation(input),
    ).toMatchObject({ passed: true });

    input.finalDeliveryDelta.cancelled = 4;
    expect(
      evaluateOperatorProviderReconciliation(input),
    ).toMatchObject({ passed: true });

    input.occurrenceSyncResults = [
      { checked: 3, synced: 0, skipped: 3, failed: 0 },
    ];
    expect(
      evaluateOperatorProviderReconciliation(input),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("no successful repair"),
      ]),
    });
    input.occurrenceSyncResults = [
      { checked: 3, synced: 2, skipped: 1, failed: 0 },
    ];

    input.fakeProvider.duplicate_send_attempts = 1;
    input.finalDeliveryDelta.processing = 1;
    expect(
      evaluateOperatorProviderReconciliation(input),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("fake-provider"),
        expect.stringContaining("final reminder-delivery"),
      ]),
    });
  });

  it("requires per-call operator isolation and an exact stale-to-fresh repair proof", () => {
    const input = {
      operatorRequestCount: 3,
      isolationChecks: 5,
      isolationSummary: {
        expected_accounts: 11,
        auth_accounts: 11,
        profile_accounts: 11,
        occurrence_sync_owners: 11,
        reminder_delivery_owners: 10,
      },
      preparedAccounts: 1,
      verifiedFreshAccounts: 1,
      causalRepairProofs: 1,
    };
    expect(
      evaluateOperatorIsolationAndCausalRepair(input),
    ).toMatchObject({ passed: true });

    expect(
      evaluateOperatorIsolationAndCausalRepair({
        ...input,
        isolationChecks: 4,
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("before every protected call"),
      ]),
    });
    expect(
      evaluateOperatorIsolationAndCausalRepair({
        ...input,
        verifiedFreshAccounts: 0,
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("stale-to-fresh"),
      ]),
    });
  });

  it("requires exact dynamic pre-timezone occurrence preservation", () => {
    const evidence = {
      captured_occurrences: 47,
      verified_occurrences: 47,
      violations: 0,
    };
    expect(
      evaluateTimezoneDynamicOccurrencePreservation(evidence),
    ).toMatchObject({ passed: true });
    expect(
      evaluateTimezoneDynamicOccurrencePreservation({
        ...evidence,
        verified_occurrences: 46,
        violations: 1,
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("not preserved exactly"),
      ]),
    });
  });
});
