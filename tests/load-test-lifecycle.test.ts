import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, describe, expect, it } from "vitest";

type Cohort =
  | "empty"
  | "typical_daily"
  | "review_heavy"
  | "export_heavy"
  | "heavy_schedule";

type FixtureAccount = {
  ordinal: number;
  cohort: Cohort;
  email: string;
  password: string;
  user_id: string | null;
  cookies: Record<string, string>;
  contention_cookies?: Record<string, string>;
  contention_pair_id?: string;
  selectors: Record<string, string> | null;
  owner_marker: string;
  forbidden_marker: string;
  seeded: boolean;
  expected?: FixturePlan["expected"];
};

type FixturePlan = {
  behaviors: Array<Record<string, unknown>>;
  schedules: Array<Record<string, unknown>>;
  slots: Array<Record<string, unknown>>;
  occurrences: Array<Record<string, unknown>>;
  statusEvents: Array<Record<string, unknown>>;
  definitionEvents: Array<Record<string, unknown>>;
  reminders: Array<Record<string, unknown>>;
  syncState: Record<string, unknown>;
  selectors: Record<string, string>;
  expected: {
    futureOccurrenceKeys: string[];
    counts: Record<string, number>;
    baselineDigests?: Record<string, string>;
    mutationLimits?: Record<string, number>;
  };
};

type LifecycleModule = {
  LoadFixtureError: new (message: string) => Error & {
    retryable?: boolean;
  };
  LOAD_COHORTS: readonly Cohort[];
  RUN_ID_PATTERN: RegExp;
  buildAccountAllocation: (input: {
    accountCount: number;
    heavyCount?: number;
    cohort?: Cohort;
    fixtureMode?: "read" | "mutation";
  }) => Cohort[];
  buildAccountPlan: (input: {
    runId: string;
    accountCount: number;
    heavyCount?: number;
    cohort?: Cohort;
    fixtureMode?: "read" | "mutation";
  }) => FixtureAccount[];
  buildFixturePlan: (input: {
    runId: string;
    account: FixtureAccount;
    categoryId: string;
    anchorLocalDate: string;
    fixtureMode?: "read" | "mutation";
  }) => FixturePlan;
  buildLoadEmail: (
    runId: string,
    cohort: Cohort,
    ordinal: number,
  ) => string;
  buildSessionArtifact: (
    metadata: Record<string, unknown>,
    baseUrl: string,
  ) => Record<string, unknown>;
  classifyRunUser: (
    user: {
      email?: string;
      app_metadata?: Record<string, unknown>;
    },
    runId: string,
  ) => "exact" | "suspicious" | "unrelated";
  evaluateLoadRunOperatorIsolation: (input: {
    expectedUserIds: string[];
    authUserIds: string[];
    profileUserIds: string[];
    occurrenceSyncUserIds: string[];
    reminderDeliveryUserIds: string[];
  }) => {
    passed: boolean;
    failures: string[];
    summary: Record<string, number>;
  };
  evaluateTimezoneOccurrencePreservationSnapshot: (input: {
    capturedOccurrences: Array<Record<string, unknown>>;
    currentOccurrences: Array<Record<string, unknown>>;
  }) => {
    passed: boolean;
    failures: string[];
    summary: {
      captured_occurrences: number;
      verified_occurrences: number;
      violations: number;
    };
  };
  definitionEventHasValidAppendOnlyTimestamps: (
    event: {
      recorded_at: string;
      created_at: string;
      updated_at: string;
    },
    maximumClockSkewMilliseconds?: number,
  ) => boolean;
  evaluateFixtureIntegrity: (
    snapshot: Record<string, Array<Record<string, unknown>>>,
    metadata: Record<string, unknown>,
  ) => {
    totalViolations: number;
    violations: Record<string, number>;
    checks: Record<string, number>;
    metrics: {
      rowCounts: Record<string, number>;
      reminderStatuses: Record<string, number>;
      operatorReminderStatuses: Record<string, number>;
      cancellationReminderStatuses: Record<string, number>;
      activePushSubscriptions: number;
      databaseConnectionCount: number | null;
      mutationDeltas: Record<string, number>;
      statusTransitionEvidence: Record<string, number>;
      duePastReminderNonReactivation: Record<string, number>;
    };
  };
  insertAppendOnlyRowsIdempotently: (
    client: {
      from: (table: string) => {
        upsert: (
          rows: Array<Record<string, unknown>>,
          options: Record<string, unknown>,
        ) => Promise<{ error: null | Error }>;
      };
    },
    table: string,
    rows: Array<Record<string, unknown>>,
  ) => Promise<void>;
  markLoadRunOccurrenceSyncStale: (
    options?: Record<string, unknown>,
  ) => Promise<{
    summary: Record<string, unknown>;
  }>;
  parseLoadFixtureArgs: (
    args: string[],
    env?: Record<string, string | undefined>,
  ) => Record<string, unknown>;
  readLocalSupabaseConfig: (
    env?: Record<string, string | undefined>,
    envFilePath?: string,
  ) => {
    target: string;
    url: string;
    baseUrl: string;
    publishableKey: string;
    serviceRoleKey: string;
  };
  resolveAuthPacing: (input: {
    accountCount: number;
    concurrency?: number;
    minimumIntervalMs?: number;
  }) => {
    concurrency: number;
    minimumIntervalMs: number;
    maxAttempts: number;
  };
  resolvePrivateRunPaths: (
    runId: string,
    runDirectory?: string,
  ) => {
    directory: string;
    metadataPath: string;
    sessionPath: string;
  };
  summarizeLifecycleResult: (
    label: string,
    summary: Record<string, unknown>,
  ) => string;
  validateLoadRunId: (value?: string) => string;
  validateCleanupConfirmation: (input: {
    runId: string;
    confirmRunId?: string;
    dryRun?: boolean;
  }) => { runId: string; dryRun: boolean };
  refreshLoadRunSessions: (options?: Record<string, unknown>) => Promise<{
    sessionPath: string;
    summary: Record<string, unknown>;
  }>;
  shouldFallbackToPasswordSignIn: (error: unknown) => boolean;
};

const RUN_ID = "20260729t120000z-abcdef123456";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const ANCHOR_DATE = "2026-07-29";
let lifecycle: LifecycleModule;

beforeAll(async () => {
  // @ts-expect-error The lifecycle command is a plain Node ESM module.
  lifecycle = await import("../scripts/load-test-fixtures.mjs");
});

describe("Ticket 064 load fixture safety", () => {
  it("reconciles large append-only fixture sets without a long ID query", async () => {
    const calls: Array<{
      table: string;
      rows: Array<Record<string, unknown>>;
      options: Record<string, unknown>;
    }> = [];
    const client = {
      from: (table: string) => ({
        upsert: async (
          rows: Array<Record<string, unknown>>,
          options: Record<string, unknown>,
        ) => {
          calls.push({ table, rows, options });
          return { error: null };
        },
      }),
    };
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: `event-${index}`,
    }));

    await lifecycle.insertAppendOnlyRowsIdempotently(
      client,
      "occurrence_status_events",
      rows,
    );

    expect(calls.map((call) => call.rows.length)).toEqual([250, 250, 1]);
    expect(
      calls.every(
        (call) =>
          call.table === "occurrence_status_events" &&
          call.options.onConflict === "id" &&
          call.options.ignoreDuplicates === true,
      ),
    ).toBe(true);
  });

  it("accepts one exact lowercase run-id shape", () => {
    expect(lifecycle.validateLoadRunId(RUN_ID)).toBe(RUN_ID);
    expect(lifecycle.RUN_ID_PATTERN.test(RUN_ID)).toBe(true);
  });

  it("exposes supervised ordinary-session renewal outside Locust", () => {
    expect(typeof lifecycle.refreshLoadRunSessions).toBe("function");
    expect(typeof lifecycle.markLoadRunOccurrenceSyncStale).toBe(
      "function",
    );
  });

  it("uses password sign-in only for a non-retryable stale session refresh", () => {
    const stale = new lifecycle.LoadFixtureError(
      "Unable to refresh an ordinary fixture session.",
    );
    const rateLimited = new lifecycle.LoadFixtureError(
      "Local Auth rate limit delayed fixture session refresh.",
    );
    rateLimited.retryable = true;

    expect(lifecycle.shouldFallbackToPasswordSignIn(stale)).toBe(true);
    expect(
      lifecycle.shouldFallbackToPasswordSignIn(rateLimited),
    ).toBe(false);
    expect(
      lifecycle.shouldFallbackToPasswordSignIn(new Error("network")),
    ).toBe(false);
  });

  it("keeps generated Auth passwords within the local provider limit", () => {
    const account = lifecycle.buildAccountPlan({
      runId: RUN_ID,
      accountCount: 1,
    })[0];

    expect(account.password.length).toBeGreaterThanOrEqual(12);
    expect(account.password.length).toBeLessThanOrEqual(72);
    expect(account.password).toMatch(/[a-z]/);
    expect(account.password).toMatch(/[A-Z]/);
    expect(account.password).toMatch(/[0-9]/);
    expect(account.password).toMatch(/[^A-Za-z0-9]/);
  });

  it.each([
    undefined,
    "",
    "*",
    "20260729",
    "cadence-load",
    "20260729T120000Z-abcdef123456",
    "20260729t120000z-ABCDEF123456",
    "20261340t256199z-abcdef123456",
    "20260729t120000z-abcdef12345",
    "20260729t120000z-abcdef123456*",
  ])("rejects empty, broad, wildcard, or malformed run id %s", (value) => {
    expect(() => lifecycle.validateLoadRunId(value)).toThrow(
      "CADENCE_LOAD_RUN_ID",
    );
  });

  it("accepts explicit loopback config and rejects a hosted Supabase URL", () => {
    expect(
      lifecycle.readLocalSupabaseConfig(
        {
          CADENCE_LOAD_TARGET: "local",
          CADENCE_LOAD_BASE_URL: "http://127.0.0.1:3100",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
          SUPABASE_SERVICE_ROLE_KEY: "service",
        },
        "missing-env-file",
      ),
    ).toEqual({
      target: "local",
      url: "http://127.0.0.1:55321",
      baseUrl: "http://127.0.0.1:3100",
      publishableKey: "publishable",
      serviceRoleKey: "service",
    });

    expect(() =>
      lifecycle.readLocalSupabaseConfig(
        {
          CADENCE_LOAD_TARGET: "local",
          CADENCE_LOAD_BASE_URL: "http://localhost:3000",
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
          SUPABASE_SERVICE_ROLE_KEY: "service",
        },
        "missing-env-file",
      ),
    ).toThrow("loopback HTTP");
  });

  it("requires exact email and server-only metadata markers together", () => {
    const email = lifecycle.buildLoadEmail(
      RUN_ID,
      "typical_daily",
      7,
    );
    const exact = {
      email,
      app_metadata: {
        cadence_load_fixture_version: "1",
        cadence_load_run_id: RUN_ID,
        cadence_load_cohort: "typical_daily",
        cadence_load_ordinal: 7,
      },
    };

    expect(lifecycle.classifyRunUser(exact, RUN_ID)).toBe("exact");
    expect(
      lifecycle.classifyRunUser(
        { email, app_metadata: {} },
        RUN_ID,
      ),
    ).toBe("suspicious");
    expect(
      lifecycle.classifyRunUser(
        {
          email,
          app_metadata: {
            ...exact.app_metadata,
            cadence_load_cohort: "review_heavy",
          },
        },
        RUN_ID,
      ),
    ).toBe("suspicious");
    expect(
      lifecycle.classifyRunUser(
        {
          email: "ordinary@example.invalid",
          app_metadata: exact.app_metadata,
        },
        RUN_ID,
      ),
    ).toBe("suspicious");
    expect(
      lifecycle.classifyRunUser(
        { email: "ordinary@example.com", app_metadata: {} },
        RUN_ID,
      ),
    ).toBe("unrelated");
  });

  it("requires protected operators to own the entire isolated local account set", () => {
    const expectedUserIds = ["run-user-1", "run-user-2"];
    const isolated = {
      expectedUserIds,
      authUserIds: [...expectedUserIds],
      profileUserIds: [...expectedUserIds],
      occurrenceSyncUserIds: [...expectedUserIds],
      reminderDeliveryUserIds: [
        "run-user-1",
        "run-user-1",
        "run-user-2",
      ],
    };

    expect(
      lifecycle.evaluateLoadRunOperatorIsolation(isolated),
    ).toMatchObject({
      passed: true,
      summary: {
        expected_accounts: 2,
        auth_accounts: 2,
        profile_accounts: 2,
        occurrence_sync_owners: 2,
        reminder_delivery_owners: 2,
      },
    });
    expect(
      lifecycle.evaluateLoadRunOperatorIsolation({
        ...isolated,
        authUserIds: [...expectedUserIds, "ordinary-user"],
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("Auth"),
      ]),
    });
    expect(
      lifecycle.evaluateLoadRunOperatorIsolation({
        ...isolated,
        reminderDeliveryUserIds: ["ordinary-user"],
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("reminder-delivery"),
      ]),
    });
  });

  it("keeps private artifacts outside the repository and exact-run scoped", () => {
    const paths = lifecycle.resolvePrivateRunPaths(
      RUN_ID,
      "/private/tmp/cadence-load-lifecycle-test",
    );

    expect(paths.directory).toBe(
      `/private/tmp/cadence-load-lifecycle-test/${RUN_ID}`,
    );
    expect(paths.metadataPath).toMatch(/metadata\.json$/);
    expect(paths.sessionPath).toMatch(/sessions\.json$/);
    expect(() =>
      lifecycle.resolvePrivateRunPaths(RUN_ID, process.cwd()),
    ).toThrow("outside tracked source");
  });

  it("requires exact destructive confirmation but permits a no-write dry run", () => {
    expect(() =>
      lifecycle.validateCleanupConfirmation({
        runId: RUN_ID,
        confirmRunId: "*",
      }),
    ).toThrow("exact run id");
    expect(
      lifecycle.validateCleanupConfirmation({
        runId: RUN_ID,
        dryRun: true,
      }),
    ).toEqual({ runId: RUN_ID, dryRun: true });
  });
});

describe("Ticket 064 cohort and identity planning", () => {
  it("interleaves the default 100 identities and reserves five heavy identities last", () => {
    const allocation = lifecycle.buildAccountAllocation({
      accountCount: 105,
      heavyCount: 5,
    });

    expect(allocation).toHaveLength(105);
    expect(allocation.slice(0, 100)).not.toContain("heavy_schedule");
    expect(new Set(allocation.slice(0, 10)).size).toBeGreaterThan(2);
    expect(allocation.slice(100)).toEqual(
      Array.from({ length: 5 }, () => "heavy_schedule"),
    );
    expect(
      Object.fromEntries(
        lifecycle.LOAD_COHORTS.map((cohort) => [
          cohort,
          allocation.filter((value) => value === cohort).length,
        ]),
      ),
    ).toEqual({
      empty: 10,
      typical_daily: 60,
      review_heavy: 20,
      export_heavy: 10,
      heavy_schedule: 5,
    });
  });

  it("never adds heavy schedule accounts without an explicit request", () => {
    expect(
      lifecycle.buildAccountAllocation({ accountCount: 100 }),
    ).not.toContain("heavy_schedule");
    expect(
      lifecycle.buildAccountAllocation({
        accountCount: 5,
        cohort: "heavy_schedule",
      }),
    ).toEqual(Array.from({ length: 5 }, () => "heavy_schedule"));
  });

  it("builds exact distinct identities and private ownership markers", () => {
    const accounts = lifecycle.buildAccountPlan({
      runId: RUN_ID,
      accountCount: 10,
    });

    expect(new Set(accounts.map((account) => account.email)).size).toBe(10);
    expect(new Set(accounts.map((account) => account.password)).size).toBe(10);
    for (const account of accounts) {
      expect(account.email).toMatch(
        /^cadence-load-20260729t120000z-abcdef123456-[a-z_]+-[0-9]{4}@example[.]invalid$/,
      );
      expect(account.owner_marker).toMatch(
        /^cadence-owner-[a-f0-9]{20}$/,
      );
      expect(account.forbidden_marker).toMatch(
        /^cadence-owner-[a-f0-9]{20}$/,
      );
      expect(account.owner_marker).not.toBe(account.forbidden_marker);
    }
  });

  it("keeps passwords and user ids out of the owner-only Locust session schema", () => {
    const account = buildAccount("typical_daily");
    account.cookies = { "sb-local-auth-token": "private-cookie-a" };
    account.selectors = {
      behavior_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      local_date: ANCHOR_DATE,
      owner_marker: account.owner_marker,
      forbidden_marker: account.forbidden_marker,
    };
    account.seeded = true;
    const artifact = lifecycle.buildSessionArtifact(
      {
        run_id: RUN_ID,
        anchor_local_date: ANCHOR_DATE,
        accounts: [account],
      },
      "http://127.0.0.1:3100",
    );
    const serialized = JSON.stringify(artifact);

    expect(artifact).toMatchObject({
      schema_version: "1.0.0",
      target_classification: "local",
      run_id: RUN_ID,
      base_url: "http://127.0.0.1:3100",
    });
    expect(serialized).not.toContain(account.password);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain(account.email);
  });

  it("uses conservative local Auth pacing above the local 30-sign-in window", () => {
    expect(lifecycle.resolveAuthPacing({ accountCount: 10 })).toMatchObject({
      concurrency: 4,
      minimumIntervalMs: 0,
    });
    expect(lifecycle.resolveAuthPacing({ accountCount: 105 })).toMatchObject({
      concurrency: 1,
      minimumIntervalMs: 10_500,
      maxAttempts: 8,
    });
  });
});

describe("Ticket 064 deterministic cohort fixtures", () => {
  it("builds an empty account with only a fresh sync horizon", () => {
    const plan = buildPlan("empty");

    expect(plan.expected.counts).toMatchObject({
      behaviors: 0,
      occurrences: 0,
      statusEvents: 0,
      reminders: 0,
    });
    expect(plan.syncState).toMatchObject({
      stale: false,
      stale_reason: null,
      last_synced_local_date: ANCHOR_DATE,
      synced_through_local_date: "2026-08-28",
    });
    expect(plan.selectors.behavior_id).toBeUndefined();
    expect(plan.selectors.owner_marker).toMatch(
      /^cadence-owner-[a-f0-9]{20}$/,
    );
  });

  it("covers the complete typical recurrence, schedule, status, and note shape", () => {
    const plan = buildPlan("typical_daily");
    const rules = plan.behaviors.map((row) => row.recurrence_rule) as Array<{
      frequency: string;
      interval?: number;
    }>;

    expect(plan.expected.counts).toMatchObject({
      activeBehaviors: 10,
      archivedBehaviors: 2,
      reminders: 0,
    });
    expect(new Set(rules.map((rule) => rule.frequency))).toEqual(
      new Set(["daily", "interval_days", "weekly", "monthly"]),
    );
    expect(
      rules.some(
        (rule) => rule.frequency === "weekly" && rule.interval === 2,
      ),
    ).toBe(true);
    expect(
      new Set(plan.slots.map((row) => row.kind)),
    ).toEqual(new Set(["exact", "range"]));
    expect(
      plan.slots
        .filter((row) => row.kind === "range")
        .map((row) => [
          row.preset,
          row.start_time,
          row.end_time,
        ]),
    ).toEqual([
      ["morning", "06:00", "12:00"],
      ["evening", "18:00", "00:00"],
    ]);
    expect(
      new Set(plan.occurrences.map((row) => row.status)),
    ).toEqual(new Set(["unresolved", "completed", "not_completed"]));
    expect(
      new Set(
        plan.occurrences
          .filter((row) => row.local_date === ANCHOR_DATE)
          .map((row) => row.status),
      ),
    ).toEqual(new Set(["unresolved", "completed", "not_completed"]));
    expect(
      plan.occurrences.some(
        (row) =>
          row.status === "unresolved" &&
          String(row.local_date) < ANCHOR_DATE,
      ),
    ).toBe(true);
    expect(plan.occurrences.some((row) => row.note !== null)).toBe(true);
    expect(
      plan.behaviors.every(
        (row) => row.email_reminder_enabled === false,
      ),
    ).toBe(true);
  });

  it("builds 90-day review history with valid correction and definition chains", () => {
    const plan = buildPlan("review_heavy");
    const dates = plan.occurrences.map((row) => String(row.local_date)).sort();
    const corrections = plan.statusEvents.filter(
      (row) => row.status_semantics === "explicit_user_correction",
    );

    expect(dates[0] <= "2026-05-01").toBe(true);
    expect(corrections.length).toBeGreaterThan(0);
    for (const correction of corrections) {
      const revised = plan.statusEvents.find(
        (event) => event.id === correction.revises_event_id,
      );
      expect(revised).toBeDefined();
      expect(correction.previous_status).toBe(revised?.status);
      expect(correction.occurrence_id).toBe(revised?.occurrence_id);
    }
    expect(
      plan.definitionEvents.filter(
        (event) => event.previous_title !== null,
      ).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("builds bounded one-year export history with terminal reminder history", () => {
    const plan = buildPlan("export_heavy");
    const dates = plan.occurrences.map((row) => String(row.local_date)).sort();

    expect(dates[0] <= "2025-07-31").toBe(true);
    expect(plan.occurrences.length).toBeLessThan(1000);
    expect(plan.statusEvents.length).toBeLessThan(1000);
    expect(plan.reminders.length).toBeGreaterThan(0);
    expect(
      plan.reminders.every(
        (row) =>
          row.status !== "pending" &&
          row.processing_started_at === null,
      ),
    ).toBe(true);
    expect(plan.occurrences.some((row) => row.note !== null)).toBe(true);
  });

  it("builds an opt-in 40-behavior multi-slot heavy schedule under query caps", () => {
    const plan = buildPlan("heavy_schedule");

    expect(plan.expected.counts).toMatchObject({
      activeBehaviors: 36,
      archivedBehaviors: 4,
    });
    expect(plan.slots.length).toBeGreaterThan(plan.behaviors.length);
    expect(plan.occurrences.length).toBeLessThan(1000);
    expect(plan.reminders).toHaveLength(0);
  });

  it("is deterministic and idempotent for one run plan", () => {
    const first = buildPlan("typical_daily");
    const second = buildPlan("typical_daily");

    expect(second).toEqual(first);
    expect(
      new Set(first.behaviors.map((row) => row.id)).size,
    ).toBe(first.behaviors.length);
    expect(
      new Set(first.occurrences.map((row) => row.id)).size,
    ).toBe(first.occurrences.length);
  });
});

describe("Ticket 064 integrity evaluation and aggregate output", () => {
  it("accepts a complete deterministic snapshot and catches duplicate corruption", () => {
    const account = buildAccount("typical_daily");
    const plan = lifecycle.buildFixturePlan({
      runId: RUN_ID,
      account,
      categoryId: CATEGORY_ID,
      anchorLocalDate: ANCHOR_DATE,
    });
    account.expected = plan.expected;
    const categories = defaultCategories(account.user_id as string);
    const snapshot = completeSnapshot(account, plan, categories);
    snapshot.occurrences = snapshot.occurrences.map((row) => ({
      ...row,
      scheduled_for: String(row.scheduled_for).replace("Z", "+00:00"),
      schedule_start_time: `${row.schedule_start_time}:00`,
      schedule_end_time: row.schedule_end_time
        ? `${row.schedule_end_time}:00`
        : null,
    }));
    const metadata = {
      run_id: RUN_ID,
      anchor_local_date: ANCHOR_DATE,
      timezone: "America/New_York",
      accounts: [account],
    };

    expect(
      lifecycle.evaluateFixtureIntegrity(snapshot, metadata),
    ).toMatchObject({ totalViolations: 0, violations: {} });

    snapshot.occurrences.push({ ...snapshot.occurrences[0] });
    const corrupted = lifecycle.evaluateFixtureIntegrity(snapshot, metadata);
    expect(corrupted.totalViolations).toBeGreaterThan(0);
    expect(corrupted.violations.duplicate_occurrence).toBeGreaterThan(0);
  });

  it("parses exact cleanup confirmation arguments and summarizes without identities", () => {
    const parsed = lifecycle.parseLoadFixtureArgs(
      [
        "--run-id",
        RUN_ID,
        "--accounts",
        "105",
        "--heavy-count",
        "5",
        "--confirm-run-id",
        RUN_ID,
        "--dry-run",
      ],
      {},
    );

    expect(parsed).toMatchObject({
      runId: RUN_ID,
      accountCount: 105,
      heavyCount: 5,
      confirmRunId: RUN_ID,
      dryRun: true,
    });

    const summary = lifecycle.summarizeLifecycleResult("Cleanup", {
      runId: RUN_ID,
      matchedUsers: 105,
      deletedUsers: 0,
      dryRun: true,
    });
    expect(summary).toContain("Matched 105 exact users");
    expect(summary).not.toContain("@");
    expect(summary).not.toContain(USER_ID);
  });
});

describe("Ticket 065 mutation fixture and integrity contracts", () => {
  it.each([
    "typical_daily",
    "review_heavy",
    "export_heavy",
  ] as const)(
    "reserves a stable active contention occurrence for the %s cohort",
    (cohort) => {
      const plan = buildMutationPlan(cohort);
      const selectors = plan.selectors;
      const behavior = plan.behaviors.find(
        (row) => row.id === selectors.fresh_horizon_behavior_id,
      );
      const occurrence = plan.occurrences.find(
        (row) => row.id === selectors.contention_occurrence_id,
      );

      expect(behavior).toMatchObject({ active: true });
      expect(behavior?.id).not.toBe(selectors.maintainer_behavior_id);
      expect(behavior?.id).not.toBe(selectors.schedule_only_behavior_id);
      expect(occurrence).toMatchObject({
        behavior_id: behavior?.id,
        status: "unresolved",
      });
      expect(String(occurrence?.local_date) < ANCHOR_DATE).toBe(true);
    },
  );

  it("adds bounded run-owned mutation selectors and reminder state machines without changing read fixtures", () => {
    const readPlan = buildPlan("typical_daily");
    const mutationPlan = buildMutationPlan("typical_daily");
    const selectors = mutationPlan.selectors;
    const maintainer = mutationPlan.behaviors.find(
      (row) => row.id === selectors.maintainer_behavior_id,
    );
    const archived = mutationPlan.behaviors.find(
      (row) => row.id === selectors.archived_behavior_id,
    );
    const scheduleOnly = mutationPlan.behaviors.find(
      (row) => row.id === selectors.schedule_only_behavior_id,
    );
    const freshHorizon = mutationPlan.behaviors.find(
      (row) => row.id === selectors.fresh_horizon_behavior_id,
    );
    const futureReminderOccurrence = mutationPlan.occurrences.find(
      (row) => row.id === selectors.future_reminder_occurrence_id,
    );
    const futureReminder = mutationPlan.reminders.find(
      (row) => row.id === selectors.future_reminder_delivery_id,
    );
    const mutationOccurrence = mutationPlan.occurrences.find(
      (row) => row.id === selectors.mutation_occurrence_id,
    );
    const cancellationReminder = mutationPlan.reminders.find(
      (row) => row.id === selectors.cancellation_reminder_delivery_id,
    );
    const dueReminderOccurrence = mutationPlan.occurrences.find(
      (row) => row.id === selectors.due_reminder_occurrence_id,
    );
    const duePastClearOccurrence = mutationPlan.occurrences.find(
      (row) => row.id === selectors.due_past_clear_occurrence_id,
    );
    const duePastClearReminder = mutationPlan.reminders.find(
      (row) => row.id === selectors.due_past_clear_delivery_id,
    );
    const contentionOccurrence = mutationPlan.occurrences.find(
      (row) => row.id === selectors.contention_occurrence_id,
    );

    expect(readPlan.expected.counts.reminders).toBe(0);
    expect(readPlan.selectors.mutation_occurrence_id).toBeUndefined();
    expect(selectors).toMatchObject({
      mutation_occurrence_status: "unresolved",
      review_occurrence_status: "unresolved",
      contention_occurrence_status: "unresolved",
      profile_timezone: "America/New_York",
      horizon_start_local_date: ANCHOR_DATE,
      horizon_end_local_date: "2026-08-28",
    });
    for (const key of [
      "mutation_occurrence_id",
      "review_behavior_id",
      "review_local_date",
      "review_occurrence_id",
      "review_occurrence_status",
      "maintainer_behavior_id",
      "maintainer_schedule_id",
      "maintainer_slot_id",
      "archived_behavior_id",
      "schedule_only_behavior_id",
      "stale_horizon_behavior_id",
      "fresh_horizon_behavior_id",
      "past_preservation_occurrence_id",
      "resolved_preservation_occurrence_id",
      "due_reminder_occurrence_id",
      "due_reminder_delivery_id",
      "due_past_clear_occurrence_id",
      "due_past_clear_delivery_id",
      "due_past_clear_behavior_id",
      "due_past_clear_local_date",
      "cancellation_reminder_occurrence_id",
      "cancellation_reminder_delivery_id",
      "future_reminder_occurrence_id",
      "future_reminder_delivery_id",
      "contention_behavior_id",
      "contention_local_date",
      "contention_occurrence_id",
      "contention_occurrence_status",
      "category_id",
    ]) {
      expect(selectors[key]).toBeTruthy();
    }
    expect(maintainer).toMatchObject({ active: true });
    expect(archived).toMatchObject({ active: false });
    expect(scheduleOnly).toMatchObject({ active: true });
    expect(freshHorizon).toMatchObject({ active: true });
    expect(freshHorizon?.id).not.toBe(selectors.maintainer_behavior_id);
    expect(freshHorizon?.id).not.toBe(selectors.schedule_only_behavior_id);
    expect(futureReminderOccurrence).toMatchObject({ status: "completed" });
    expect(futureReminder).toMatchObject({
      status: "cancelled",
      processing_started_at: null,
    });
    expect(mutationOccurrence).toMatchObject({
      status: "unresolved",
      local_date: "2026-07-31",
    });
    expect(cancellationReminder).toMatchObject({
      occurrence_id: selectors.mutation_occurrence_id,
      status: "pending",
      processing_started_at: null,
    });
    expect(
      String(cancellationReminder?.scheduled_send_at) >
        "2026-07-29T23:59:59Z",
    ).toBe(true);
    expect(
      String(dueReminderOccurrence?.local_date) <= ANCHOR_DATE,
    ).toBe(true);
    expect(duePastClearOccurrence).toMatchObject({
      status: "unresolved",
    });
    expect(
      String(duePastClearOccurrence?.local_date) < ANCHOR_DATE,
    ).toBe(true);
    expect(
      Temporal.PlainDate.compare(
        Temporal.PlainDate.from(
          String(duePastClearOccurrence?.local_date),
        ),
        Temporal.PlainDate.from(ANCHOR_DATE).subtract({
          days: 89,
        }),
      ),
    ).toBeGreaterThanOrEqual(0);
    expect(duePastClearReminder).toMatchObject({
      occurrence_id: selectors.due_past_clear_occurrence_id,
      status: "pending",
      processing_started_at: null,
    });
    expect(selectors.due_past_clear_behavior_id).toBe(
      duePastClearOccurrence?.behavior_id,
    );
    expect(selectors.due_past_clear_local_date).toBe(
      duePastClearOccurrence?.local_date,
    );
    expect(contentionOccurrence).toMatchObject({
      behavior_id: selectors.contention_behavior_id,
      local_date: selectors.contention_local_date,
      status: "unresolved",
    });
    expect(selectors.contention_behavior_id).toBe(
      selectors.fresh_horizon_behavior_id,
    );
    expect(
      String(contentionOccurrence?.local_date) < ANCHOR_DATE,
    ).toBe(true);
    expect(selectors.due_past_clear_occurrence_id).not.toBe(
      selectors.due_reminder_occurrence_id,
    );
    expect(
      mutationPlan.reminders.some((row) => row.status === "pending"),
    ).toBe(true);
    expect(selectors.due_reminder_occurrence_id).not.toBe(
      selectors.mutation_occurrence_id,
    );
    expect(selectors.cancellation_reminder_occurrence_id).toBe(
      selectors.mutation_occurrence_id,
    );
    expect(
      Object.values(mutationPlan.expected.baselineDigests ?? {}).every(
        (value) => /^[a-f0-9]{64}$/.test(value),
      ),
    ).toBe(true);
    expect(mutationPlan.expected.mutationLimits).toMatchObject({
      behaviorGrowth: 1,
    });
  });

  it("allocates all 100 default mutation identities to action-capable cohorts", () => {
    const allocation = lifecycle.buildAccountAllocation({
      accountCount: 100,
      fixtureMode: "mutation",
    });

    expect(allocation).toHaveLength(100);
    expect(allocation).not.toContain("empty");
    expect(
      Object.fromEntries(
        ["typical_daily", "review_heavy", "export_heavy"].map((cohort) => [
          cohort,
          allocation.filter((value) => value === cohort).length,
        ]),
      ),
    ).toEqual({
      typical_daily: 70,
      review_heavy: 20,
      export_heavy: 10,
    });
  });

  it("requires an explicit exact mutation lifecycle flag", () => {
    expect(
      lifecycle.parseLoadFixtureArgs(["--mutation"], {}),
    ).toMatchObject({ fixtureMode: "mutation" });
    expect(
      lifecycle.parseLoadFixtureArgs([], {
        CADENCE_LOAD_MUTATION_FIXTURES: "1",
      }),
    ).toMatchObject({ fixtureMode: "mutation" });
    expect(() =>
      lifecycle.parseLoadFixtureArgs([], {
        CADENCE_LOAD_MUTATION_FIXTURES: "true",
      }),
    ).toThrow("exactly 0 or 1");
    expect(() =>
      lifecycle.buildAccountAllocation({
        accountCount: 1,
        cohort: "empty",
        fixtureMode: "mutation",
      }),
    ).toThrow("read-only empty cohort");
  });

  it.each([
    "typical_daily",
    "review_heavy",
    "export_heavy",
    "heavy_schedule",
  ] as const)("makes every non-empty %s cohort mutation-capable", (cohort) => {
    const plan = buildMutationPlan(cohort);

    expect(plan.selectors).toMatchObject({
      mutation_occurrence_status: "unresolved",
      profile_timezone: "America/New_York",
    });
    expect(plan.selectors.maintainer_behavior_id).toBeTruthy();
    expect(plan.selectors.schedule_only_behavior_id).toBeTruthy();
    expect(plan.selectors.archived_behavior_id).toBeTruthy();
    expect(plan.selectors.contention_occurrence_id).toBeTruthy();
    expect(plan.reminders.some((row) => row.status === "pending")).toBe(true);
    expect(plan.reminders.some((row) => row.status === "cancelled")).toBe(true);
  });

  it("emits a separate same-account contention pool with two distinct ordinary sessions", () => {
    const account = buildAccount("typical_daily");
    const plan = lifecycle.buildFixturePlan({
      runId: RUN_ID,
      account,
      categoryId: CATEGORY_ID,
      anchorLocalDate: ANCHOR_DATE,
      fixtureMode: "mutation",
    });
    account.cookies = { "sb-local-auth-token": "ordinary-primary" };
    account.contention_cookies = {
      "sb-local-auth-token": "ordinary-secondary",
    };
    account.contention_pair_id = plan.selectors.contention_pair_id;
    account.selectors = plan.selectors;
    account.seeded = true;

    const artifact = lifecycle.buildSessionArtifact(
      {
        run_id: RUN_ID,
        anchor_local_date: ANCHOR_DATE,
        workload_classification: "mutation",
        accounts: [account],
      },
      "http://127.0.0.1:3100",
    ) as {
      workload_classification: string;
      identities: Array<Record<string, unknown>>;
      contention_sessions: Array<{
        pair_id: string;
        primary_cookies: Record<string, string>;
        secondary_cookies: Record<string, string>;
        selectors: Record<string, string>;
      }>;
    };

    expect(artifact.workload_classification).toBe("mutation");
    expect(artifact.identities).toHaveLength(1);
    expect(artifact.contention_sessions).toEqual([
      expect.objectContaining({
        pair_id: plan.selectors.contention_pair_id,
        primary_cookies: account.cookies,
        secondary_cookies: account.contention_cookies,
        selectors: expect.objectContaining({
          occurrence_id: plan.selectors.contention_occurrence_id,
          expected_status: plan.selectors.contention_occurrence_status,
        }),
      }),
    ]);
    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toContain(account.email);
    expect(serialized).not.toContain(account.password);
    expect(serialized).not.toContain(USER_ID);

    account.contention_cookies = { ...account.cookies };
    expect(() =>
      lifecycle.buildSessionArtifact(
        {
          run_id: RUN_ID,
          anchor_local_date: ANCHOR_DATE,
          workload_classification: "mutation",
          accounts: [account],
        },
        "http://127.0.0.1:3100",
      ),
    ).toThrow("distinct ordinary cookie jars");
  });

  it("accepts the mutation baseline and reports stable zero-valued aggregate gates", () => {
    const account = buildAccount("typical_daily");
    const plan = buildMutationPlan("typical_daily", account);
    account.expected = plan.expected;
    account.selectors = plan.selectors;
    const snapshot = completeSnapshot(
      account,
      plan,
      defaultCategories(account.user_id as string),
    );
    const evaluation = lifecycle.evaluateFixtureIntegrity(snapshot, {
      run_id: RUN_ID,
      anchor_local_date: ANCHOR_DATE,
      timezone: "America/New_York",
      workload_classification: "mutation",
      accounts: [account],
    });

    expect(evaluation.totalViolations).toBe(0);
    expect(evaluation.violations).toEqual({});
    expect(evaluation.checks).toEqual({
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
    });
    expect(evaluation.metrics).toMatchObject({
      reminderStatuses: {
        processing: 0,
      },
      operatorReminderStatuses: {
        pending: 1,
        processing: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
      },
      cancellationReminderStatuses: {
        pending: 1,
        processing: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
      },
      activePushSubscriptions: 0,
      databaseConnectionCount: null,
      statusTransitionEvidence: {
        baselineEventCount: plan.statusEvents.length,
        totalEventCount: plan.statusEvents.length,
        appendedEventCount: 0,
        eventBackedOccurrenceCount: new Set(
          plan.statusEvents.map((event) => event.occurrence_id),
        ).size,
        snapshotCorrelatedOccurrenceCount: new Set(
          plan.statusEvents.map((event) => event.occurrence_id),
        ).size,
      },
      mutationDeltas: {
        behaviors: 0,
        schedules: 0,
        slots: 0,
        occurrences: 0,
        statusEvents: 0,
        definitionEvents: 0,
        reminders: 0,
      },
    });
  });

  it("reports appended status events correlated to their latest occurrence snapshot", () => {
    const account = buildAccount("typical_daily");
    const plan = buildMutationPlan("typical_daily", account);
    account.expected = plan.expected;
    account.selectors = plan.selectors;
    const snapshot = completeSnapshot(
      account,
      plan,
      defaultCategories(account.user_id as string),
    );
    const occurrence = snapshot.occurrences.find(
      (row) => row.id === plan.selectors.mutation_occurrence_id,
    );
    expect(occurrence).toBeDefined();
    if (!occurrence) return;

    const existingEvents = snapshot.occurrence_status_events.filter(
      (event) => event.occurrence_id === occurrence.id,
    );
    const revisedIds = new Set(
      existingEvents
        .map((event) => event.revises_event_id)
        .filter((value) => typeof value === "string"),
    );
    const latest = existingEvents.find(
      (event) =>
        typeof event.id === "string" &&
        !revisedIds.has(event.id),
    );
    const nextStatus =
      occurrence.status === "completed"
        ? "not_completed"
        : "completed";
    const recordedAt = "2026-07-29T23:50:00Z";
    snapshot.occurrence_status_events.push({
      id: "99999999-9999-4999-8999-999999999991",
      user_id: occurrence.user_id,
      occurrence_id: occurrence.id,
      behavior_id: occurrence.behavior_id,
      previous_status: occurrence.status,
      status: nextStatus,
      status_semantics:
        latest
          ? "explicit_user_correction"
          : "explicit_user_mark",
      recorded_at: recordedAt,
      effective_at: recordedAt,
      local_date: occurrence.local_date,
      timezone: "America/New_York",
      source_capture_method: "manual_tap",
      source_confidence: "high",
      revises_event_id: latest?.id ?? null,
      reason_code: null,
      created_at: recordedAt,
      updated_at: recordedAt,
    });
    occurrence.status = nextStatus;
    occurrence.status_marked_at = recordedAt;
    occurrence.completed_at =
      nextStatus === "completed" ? recordedAt : null;
    occurrence.updated_at = recordedAt;
    for (const reminder of snapshot.reminder_deliveries.filter(
      (row) => row.occurrence_id === occurrence.id,
    )) {
      reminder.status = "cancelled";
      reminder.processing_started_at = null;
      reminder.updated_at = recordedAt;
    }

    const evaluation = lifecycle.evaluateFixtureIntegrity(snapshot, {
      run_id: RUN_ID,
      anchor_local_date: ANCHOR_DATE,
      timezone: "America/New_York",
      workload_classification: "mutation",
      accounts: [account],
    });

    expect(evaluation.totalViolations).toBe(0);
    expect(evaluation.metrics.statusTransitionEvidence).toMatchObject({
      baselineEventCount: plan.statusEvents.length,
      totalEventCount: plan.statusEvents.length + 1,
      appendedEventCount: 1,
    });
    expect(
      evaluation.metrics.statusTransitionEvidence
        .snapshotCorrelatedOccurrenceCount,
    ).toBe(
      evaluation.metrics.statusTransitionEvidence
        .eventBackedOccurrenceCount,
    );
  });

  it("proves a dedicated due/past Clear decision never reactivates its cancelled reminder", () => {
    const account = buildAccount("typical_daily");
    const plan = buildMutationPlan("typical_daily", account);
    account.expected = plan.expected;
    account.selectors = plan.selectors;
    const snapshot = completeSnapshot(
      account,
      plan,
      defaultCategories(account.user_id as string),
    );
    const occurrence = snapshot.occurrences.find(
      (row) =>
        row.id === plan.selectors.due_past_clear_occurrence_id,
    );
    const delivery = snapshot.reminder_deliveries.find(
      (row) =>
        row.id === plan.selectors.due_past_clear_delivery_id,
    );
    const eventTemplate = snapshot.occurrence_status_events[0];
    expect(occurrence).toBeDefined();
    expect(delivery).toBeDefined();
    expect(eventTemplate).toBeDefined();
    if (!occurrence || !delivery || !eventTemplate) return;

    const completedAt = "2026-07-29T23:54:00Z";
    const recordedAt = "2026-07-29T23:55:00Z";
    const completedEvent = {
      ...eventTemplate,
      id: "99999999-9999-4999-8999-999999999991",
      user_id: occurrence.user_id,
      occurrence_id: occurrence.id,
      behavior_id: occurrence.behavior_id,
      previous_status: "unresolved",
      status: "completed",
      status_semantics: "explicit_user_mark",
      recorded_at: completedAt,
      effective_at: completedAt,
      local_date: occurrence.local_date,
      revises_event_id: null,
      created_at: completedAt,
      updated_at: completedAt,
    };
    const clearedEvent = {
      ...completedEvent,
      id: "99999999-9999-4999-8999-999999999992",
      previous_status: "completed",
      status: "unresolved",
      status_semantics: "explicit_user_correction",
      recorded_at: recordedAt,
      effective_at: null,
      revises_event_id: completedEvent.id,
      created_at: recordedAt,
      updated_at: recordedAt,
    };
    const repeatedCompletedAt = "2026-07-29T23:56:00Z";
    const repeatedCompletedEvent = {
      ...completedEvent,
      id: "99999999-9999-4999-8999-999999999993",
      previous_status: "unresolved",
      status_semantics: "explicit_user_correction",
      recorded_at: repeatedCompletedAt,
      effective_at: repeatedCompletedAt,
      revises_event_id: clearedEvent.id,
      created_at: repeatedCompletedAt,
      updated_at: repeatedCompletedAt,
    };
    const repeatedClearAt = "2026-07-29T23:57:00Z";
    snapshot.occurrence_status_events.push(
      completedEvent,
      clearedEvent,
      repeatedCompletedEvent,
      {
        ...clearedEvent,
        id: "99999999-9999-4999-8999-999999999994",
        recorded_at: repeatedClearAt,
        revises_event_id: repeatedCompletedEvent.id,
        created_at: repeatedClearAt,
        updated_at: repeatedClearAt,
      },
    );
    occurrence.status = "unresolved";
    occurrence.status_marked_at = null;
    occurrence.completed_at = null;
    occurrence.updated_at = repeatedClearAt;
    delivery.status = "cancelled";

    const metadata = {
      run_id: RUN_ID,
      anchor_local_date: ANCHOR_DATE,
      timezone: "America/New_York",
      workload_classification: "mutation",
      integrity_now: "2026-07-29T23:59:00Z",
      accounts: [account],
    };
    const evaluation = lifecycle.evaluateFixtureIntegrity(
      snapshot,
      metadata,
    );
    expect(evaluation.totalViolations).toBe(0);
    expect(
      evaluation.metrics.duePastReminderNonReactivation,
    ).toEqual({
      tracked_occurrences: 1,
      tracked_deliveries: 1,
      exercised_occurrences: 1,
      clear_events: 2,
      unresolved_occurrences: 1,
      cancelled_deliveries: 1,
      reactivated_deliveries: 0,
    });

    delivery.status = "pending";
    expect(
      lifecycle.evaluateFixtureIntegrity(snapshot, metadata).checks
        .invalidReminderStates,
    ).toBeGreaterThan(0);
  });

  it("allows bounded app/database clock skew for append-only definition events", () => {
    const createdAt = "2026-07-29T12:00:00.000Z";
    const event = {
      created_at: createdAt,
      updated_at: createdAt,
      recorded_at: "2026-07-29T12:00:04.999Z",
    };

    expect(
      lifecycle.definitionEventHasValidAppendOnlyTimestamps(event),
    ).toBe(true);
    expect(
      lifecycle.definitionEventHasValidAppendOnlyTimestamps({
        ...event,
        recorded_at: "2026-07-29T12:00:05.001Z",
      }),
    ).toBe(false);
    expect(
      lifecycle.definitionEventHasValidAppendOnlyTimestamps({
        ...event,
        recorded_at: "2026-07-29T11:59:55.001Z",
      }),
    ).toBe(true);
    expect(
      lifecycle.definitionEventHasValidAppendOnlyTimestamps({
        ...event,
        recorded_at: "2026-07-29T11:59:54.999Z",
      }),
    ).toBe(false);
    expect(
      lifecycle.definitionEventHasValidAppendOnlyTimestamps({
        ...event,
        updated_at: "2026-07-29T12:00:00.001Z",
      }),
    ).toBe(false);
  });

  it("rejects a definition revision recorded before its predecessor", () => {
    const account = buildAccount("review_heavy");
    const plan = buildMutationPlan("review_heavy", account);
    account.expected = plan.expected;
    account.selectors = plan.selectors;
    const snapshot = completeSnapshot(
      account,
      plan,
      defaultCategories(account.user_id as string),
    );
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const event of snapshot.behavior_definition_events) {
      const behaviorId = String(event.behavior_id);
      groups.set(behaviorId, [
        ...(groups.get(behaviorId) ?? []),
        event,
      ]);
    }
    const chain = [...groups.values()].find(
      (events) => events.length >= 2,
    );
    expect(chain).toBeDefined();
    if (!chain) return;
    const ordered = [...chain].sort((left, right) =>
      String(left.recorded_at).localeCompare(
        String(right.recorded_at),
      ),
    );
    const earlier = "2025-01-01T00:00:00Z";
    ordered[1].recorded_at = earlier;
    ordered[1].created_at = earlier;
    ordered[1].updated_at = earlier;

    const evaluation = lifecycle.evaluateFixtureIntegrity(snapshot, {
      run_id: RUN_ID,
      anchor_local_date: ANCHOR_DATE,
      timezone: "America/New_York",
      workload_classification: "mutation",
      accounts: [account],
    });
    expect(evaluation.violations.definition_revision_chain).toBeGreaterThan(
      0,
    );
  });

  it("preserves the dynamic pre-timezone set including rows resolved by earlier stages", () => {
    const account = buildAccount("typical_daily");
    const plan = buildMutationPlan("typical_daily", account);
    const futureResolved = plan.occurrences.find(
      (row) =>
        String(row.local_date) > ANCHOR_DATE &&
        row.status === "unresolved",
    );
    expect(futureResolved).toBeDefined();
    if (!futureResolved) return;
    futureResolved.status = "completed";
    const capturedOccurrences = plan.occurrences.filter(
      (row) =>
        String(row.local_date) < ANCHOR_DATE ||
        row.status !== "unresolved",
    );
    expect(
      capturedOccurrences.some(
        (row) => row.id === futureResolved.id,
      ),
    ).toBe(true);
    const currentOccurrences = structuredClone(plan.occurrences);

    expect(
      lifecycle.evaluateTimezoneOccurrencePreservationSnapshot({
        capturedOccurrences,
        currentOccurrences,
      }),
    ).toMatchObject({
      passed: true,
      summary: {
        captured_occurrences: capturedOccurrences.length,
        verified_occurrences: capturedOccurrences.length,
        violations: 0,
      },
    });

    const changed = currentOccurrences.find(
      (row) => row.id === futureResolved.id,
    );
    expect(changed).toBeDefined();
    if (!changed) return;
    changed.scheduled_for = "2026-08-15T15:00:00Z";
    expect(
      lifecycle.evaluateTimezoneOccurrencePreservationSnapshot({
        capturedOccurrences,
        currentOccurrences,
      }),
    ).toMatchObject({
      passed: false,
      summary: {
        violations: 1,
      },
    });
  });

  it("allows due reminder replacement loss while preserving historical reminder rows", () => {
    const account = buildAccount("typical_daily");
    const plan = buildMutationPlan("typical_daily", account);
    account.expected = plan.expected;
    account.selectors = plan.selectors;
    const snapshot = completeSnapshot(
      account,
      plan,
      defaultCategories(account.user_id as string),
    );
    const integrityNow = Temporal.Instant.from(
      "2026-07-29T23:59:00Z",
    );
    const futureUnresolvedOccurrenceIds = new Set(
      snapshot.occurrences
        .filter(
          (row) =>
            String(row.local_date) >= ANCHOR_DATE &&
            row.status === "unresolved",
        )
        .map((row) => row.id),
    );
    const dueReplaceableReminder = snapshot.reminder_deliveries.find(
      (row) =>
        futureUnresolvedOccurrenceIds.has(row.occurrence_id) &&
        Temporal.Instant.compare(
          Temporal.Instant.from(String(row.scheduled_send_at)),
          integrityNow,
        ) <= 0,
    );
    expect(dueReplaceableReminder).toBeDefined();
    if (!dueReplaceableReminder) return;

    snapshot.reminder_deliveries =
      snapshot.reminder_deliveries.filter(
        (row) => row.id !== dueReplaceableReminder.id,
      );
    const metadata = {
      run_id: RUN_ID,
      anchor_local_date: ANCHOR_DATE,
      timezone: "America/New_York",
      workload_classification: "mutation",
      integrity_now: integrityNow.toString(),
      accounts: [account],
    };

    expect(
      lifecycle.evaluateFixtureIntegrity(snapshot, metadata),
    ).toMatchObject({
      totalViolations: 0,
      violations: {},
      checks: {
        preservationFailures: 0,
        boundedGrowth: 0,
      },
    });

    snapshot.reminder_deliveries =
      snapshot.reminder_deliveries.filter(
        (row) =>
          row.id !== plan.selectors.due_past_clear_delivery_id,
      );
    const corrupted = lifecycle.evaluateFixtureIntegrity(
      snapshot,
      metadata,
    );

    expect(
      corrupted.violations.preserved_reminder_missing,
    ).toBeGreaterThan(0);
    expect(corrupted.checks.preservationFailures).toBeGreaterThan(0);
  });

  it.each([
    "typical_daily",
    "review_heavy",
    "export_heavy",
    "heavy_schedule",
  ] as const)("accepts a complete %s mutation snapshot", (cohort) => {
    const account = buildAccount(cohort);
    const plan = buildMutationPlan(cohort, account);
    account.expected = plan.expected;
    account.selectors = plan.selectors;
    const evaluation = lifecycle.evaluateFixtureIntegrity(
      completeSnapshot(
        account,
        plan,
        defaultCategories(account.user_id as string),
      ),
      {
        run_id: RUN_ID,
        anchor_local_date: ANCHOR_DATE,
        timezone: "America/New_York",
        workload_classification: "mutation",
        accounts: [account],
      },
    );

    expect(evaluation).toMatchObject({
      totalViolations: 0,
      violations: {},
    });
  });

  it("detects mutation corruption across ownership, chains, reminder, horizon, preservation, and orphan gates", () => {
    const account = buildAccount("typical_daily");
    const plan = buildMutationPlan("typical_daily", account);
    account.expected = plan.expected;
    account.selectors = plan.selectors;
    const snapshot = completeSnapshot(
      account,
      plan,
      defaultCategories(account.user_id as string),
    );
    const pastId = plan.selectors.past_preservation_occurrence_id;
    const futureOccurrence = snapshot.occurrences.find(
      (row) =>
        row.local_date === "2026-08-01" &&
        row.status === "unresolved",
    );
    const scheduleOnlyId = plan.selectors.schedule_only_behavior_id;
    const scheduleOnlyEvents = snapshot.behavior_definition_events.filter(
      (row) => row.behavior_id === scheduleOnlyId,
    );
    const pendingReminder = snapshot.reminder_deliveries.find(
      (row) => row.status === "pending",
    );

    snapshot.categories.push({
      ...snapshot.categories[0],
      id: "99999999-9999-4999-8999-999999999999",
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    snapshot.occurrences.push({ ...snapshot.occurrences[0] });
    snapshot.reminder_deliveries.push({
      ...snapshot.reminder_deliveries[0],
      id: "88888888-8888-4888-8888-888888888888",
    });
    const statusEvent = snapshot.occurrence_status_events.at(-1);
    if (statusEvent) statusEvent.previous_status = "not_completed";
    if (scheduleOnlyEvents[0]) {
      snapshot.behavior_definition_events.push({
        ...scheduleOnlyEvents[0],
        id: "77777777-7777-4777-8777-777777777777",
        previous_title: scheduleOnlyEvents[0].next_title,
        next_title: `${scheduleOnlyEvents[0].next_title} changed`,
        changed_fields: ["title"],
      });
    }
    if (pendingReminder) pendingReminder.processing_started_at = "2026-07-29T12:00:00Z";
    snapshot.occurrences = snapshot.occurrences.filter(
      (row) => row.id !== pastId && row.id !== futureOccurrence?.id,
    );
    snapshot.behavior_schedule_slots.push({
      ...snapshot.behavior_schedule_slots[0],
      id: "66666666-6666-4666-8666-666666666666",
      behavior_id: "55555555-5555-4555-8555-555555555555",
    });

    const evaluation = lifecycle.evaluateFixtureIntegrity(snapshot, {
      run_id: RUN_ID,
      anchor_local_date: ANCHOR_DATE,
      timezone: "America/New_York",
      workload_classification: "mutation",
      accounts: [account],
    });

    expect(evaluation.checks.crossOwnerRows).toBeGreaterThan(0);
    expect(evaluation.checks.duplicateOccurrences).toBeGreaterThan(0);
    expect(evaluation.checks.duplicateDeliveries).toBeGreaterThan(0);
    expect(evaluation.checks.invalidStatusChains).toBeGreaterThan(0);
    expect(evaluation.checks.invalidDefinitionChains).toBeGreaterThan(0);
    expect(evaluation.checks.scheduleOnlyDefinitionEvents).toBeGreaterThan(0);
    expect(evaluation.checks.invalidReminderStates).toBeGreaterThan(0);
    expect(evaluation.checks.orphanRows).toBeGreaterThan(0);
    expect(evaluation.checks.falseFreshHorizons).toBeGreaterThan(0);
    expect(evaluation.checks.preservationFailures).toBeGreaterThan(0);
    expect(evaluation.checks.stuckProcessingClaims).toBeGreaterThan(0);
  });
});

function buildAccount(cohort: Cohort): FixtureAccount {
  const account = lifecycle.buildAccountPlan({
    runId: RUN_ID,
    accountCount: 1,
    cohort,
  })[0];
  account.user_id = USER_ID;
  return account;
}

function buildPlan(cohort: Cohort) {
  return lifecycle.buildFixturePlan({
    runId: RUN_ID,
    account: buildAccount(cohort),
    categoryId: CATEGORY_ID,
    anchorLocalDate: ANCHOR_DATE,
  });
}

function buildMutationPlan(
  cohort: Cohort,
  account = buildAccount(cohort),
) {
  return lifecycle.buildFixturePlan({
    runId: RUN_ID,
    account,
    categoryId: CATEGORY_ID,
    anchorLocalDate: ANCHOR_DATE,
    fixtureMode: "mutation",
  });
}

function defaultCategories(userId: string) {
  const names = [
    "Medical",
    "Grooming",
    "Fitness",
    "Food / Drink",
    "Home",
    "Measurements",
    "Admin",
    "Other",
  ];
  return names.map((name, index) => ({
    id:
      name === "Other"
        ? CATEGORY_ID
        : `33333333-3333-4${String(index).padStart(3, "0")}-8333-${String(
            index,
          ).padStart(12, "0")}`,
    user_id: userId,
    name,
    sort_order: index,
  }));
}

function completeSnapshot(
  account: FixtureAccount,
  plan: FixturePlan,
  categories: Array<Record<string, unknown>>,
) {
  return {
    profiles: [
      { id: account.user_id, timezone: "America/New_York" },
    ],
    categories,
    behaviors: plan.behaviors.map((row) => ({ ...row })),
    behavior_definition_events: plan.definitionEvents.map((row) => ({
      ...row,
    })),
    behavior_schedules: plan.schedules.map((row) => ({ ...row })),
    behavior_schedule_slots: plan.slots.map((row) => ({ ...row })),
    occurrences: plan.occurrences.map((row) => ({ ...row })),
    reminder_deliveries: plan.reminders.map((row) => ({ ...row })),
    push_subscriptions: [],
    occurrence_status_events: plan.statusEvents.map((row) => ({ ...row })),
    occurrence_sync_state: [{ ...plan.syncState }],
    behaviorlog_import_runs: [],
    behaviorlog_import_record_mappings: [],
    imported_notes: [],
    imported_interventions: [],
  };
}
