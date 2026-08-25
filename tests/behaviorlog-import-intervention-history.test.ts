import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveBehaviorLogImportPreview } from "../lib/resolvers/behaviorlog-import.resolver";
import {
  applyApprovedBehaviorLogMergePlan,
  applyCreateMissingBehaviorLogImportPlan,
} from "../lib/services/behaviorlog-import-write.service";
import type {
  BehaviorLogImportFile,
  BehaviorLogImportMergePreview,
  BehaviorLogImportMergePreviewResult,
  BehaviorLogImportPreview,
} from "../lib/types/behaviorlog-import";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMPORT_RUN_ID = "22222222-2222-4222-8222-222222222222";
const COMPLETED_AT = "2026-06-18T12:00:00Z";

const occurrenceSyncMocks = vi.hoisted(() => ({
  markOccurrenceSyncStale: vi.fn(),
  repairUserOccurrenceReminderGraphBestEffort: vi.fn(),
}));

vi.mock("@/lib/services/occurrence-sync-state.service", () => ({
  markOccurrenceSyncStale: occurrenceSyncMocks.markOccurrenceSyncStale,
}));

vi.mock("@/lib/services/occurrence-reminder-repair.service", () => ({
  repairUserOccurrenceReminderGraphBestEffort:
    occurrenceSyncMocks.repairUserOccurrenceReminderGraphBestEffort,
}));

describe("BehaviorLog imported intervention history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    occurrenceSyncMocks.markOccurrenceSyncStale.mockResolvedValue({} as never);
    occurrenceSyncMocks.repairUserOccurrenceReminderGraphBestEffort.mockResolvedValue(
      false,
    );
  });

  it("previews passive storage and redacts or drops sensitive delivery fields", () => {
    const preview = resolveBehaviorLogImportPreview({
      files: behaviorLogFiles({
        intervention: {
          message_body: "Brush teeth reminder",
          endpoint: "https://push.example.test/subscription",
          provider_secret: "server-only-secret",
          recipient_email: "emma@example.com",
          failure_reason: "Provider rejected emma@example.com",
        },
      }),
    });

    expect(preview.valid).toBe(true);
    expect(preview.summary).toMatchObject({
      interventionStoredCount: 1,
      interventionRedactedFieldCount: 1,
    });
    expect(preview.plan.interventions[0]).toMatchObject({
      externalId: "intervention-1",
      failureReason: "Redacted sensitive delivery detail.",
      storageDecision: {
        decision: "store_passive_history",
        droppedSensitiveFields: expect.arrayContaining([
          "endpoint",
          "message_body",
          "provider_secret",
          "recipient_email",
        ]),
        redactedFields: ["failure_reason"],
        rawMessageBodyStored: false,
        rawEndpointStored: false,
        recipientIdentifiersStored: false,
        reminderDeliverySideEffects: false,
        providerSideEffects: false,
      },
    });
  });

  it("stores passive intervention history during create-only apply without reminder writes", async () => {
    const preview = createApplyPreview({
      interventions: [createInterventionPlan()],
    });
    const { supabase, tables, from } = createApplyClient();

    const result = await applyCreateMissingBehaviorLogImportPlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(occurrenceSyncMocks.markOccurrenceSyncStale).toHaveBeenCalledWith(
      supabase,
      {
        userId: USER_ID,
        reason: "behaviorlog_import_applied",
      },
    );
    expect(result.created.interventions).toBe(1);
    expect(tables.imported_interventions).toEqual([
      expect.objectContaining({
        user_id: USER_ID,
        import_run_id: IMPORT_RUN_ID,
        external_id: "intervention-1",
        behavior_external_id: "behavior-brush",
        occurrence_external_id: "occurrence-1",
        behavior_id: "behaviors-1",
        occurrence_id: "occurrences-1",
        intervention_type: "reminder",
        channel: "email",
        delivery_status: "failed",
        scheduled_send_at: "2026-06-08T12:45:00Z",
        sent_at: null,
        failure_reason: "Redacted sensitive delivery detail.",
        source_original_id: "delivery-source-1",
        source_capture_method: "system_generated",
        source_confidence: "high",
        redacted_sensitivity_indicators: expect.objectContaining({
          droppedSensitiveFields: ["message_body"],
          redactedFields: ["failure_reason"],
          rawMessageBodyStored: false,
          rawEndpointStored: false,
          recipientIdentifiersStored: false,
        }),
        metadata: expect.objectContaining({
          passiveImportedIntervention: true,
          reminderDeliverySideEffects: false,
          providerSideEffects: false,
        }),
      }),
    ]);
    expect(tables.behaviorlog_import_record_mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_type: "intervention",
          external_id: "intervention-1",
          local_id: "imported_interventions-1",
        }),
      ]),
    );
    expect(tables.reminder_deliveries).toHaveLength(0);
    expect(from).not.toHaveBeenCalledWith("reminder_deliveries");
  });

  it("applies the same approved merge run idempotently", async () => {
    const preview = createMergePreview({
      interventions: [createInterventionPlan()],
    });
    const { supabase, tables } = createApplyClient({
      importMode: "merge_by_user_approved_plan",
      dryRunSummary: {
        valid: true,
        errorCount: 0,
        mergePreview: preview.mergePreview,
      },
    });

    const first = await applyApprovedBehaviorLogMergePlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });
    const second = await applyApprovedBehaviorLogMergePlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(occurrenceSyncMocks.markOccurrenceSyncStale).toHaveBeenCalledWith(
      supabase,
      {
        userId: USER_ID,
        reason: "behaviorlog_import_applied",
      },
    );
    expect(first.created.interventions).toBe(1);
    expect(second.created.interventions).toBe(0);
    expect(second.skipped.interventions).toBe(1);
    expect(tables.imported_interventions).toHaveLength(1);
    expect(
      tables.behaviorlog_import_record_mappings.filter(
        (mapping) => mapping.record_type === "intervention",
      ),
    ).toHaveLength(1);
    expect(tables.reminder_deliveries).toHaveLength(0);
  });

  it("defines owner-scoped RLS for imported interventions", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260618220226_add_imported_intervention_history.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "alter table public.imported_interventions enable row level security",
    );
    expect(migration).toContain("imported_interventions_select_own");
    expect(migration).toContain("imported_interventions_insert_own");
    expect(migration).toContain("imported_interventions_update_own");
    expect(migration).toContain("imported_interventions_delete_own");
    expect(migration).toContain("with check ((select auth.uid()) = user_id)");
    expect(migration).toContain(
      "grant select, insert, update, delete\n  on table public.imported_interventions\n  to authenticated, service_role",
    );
  });
});

function createApplyPreview(input: {
  interventions?: BehaviorLogImportPreview["plan"]["interventions"];
}): BehaviorLogImportPreview {
  const interventions = input.interventions ?? [];

  return {
    valid: true,
    summary: {
      schemaVersion: "0.1.0-draft",
      fileCount: 8,
      behaviorCount: 1,
      scheduleCount: 1,
      occurrenceCount: 1,
      statusEventCount: 0,
      noteCount: 0,
      interventionCount: interventions.length,
      interventionPreviewOnlyCount: interventions.length,
      interventionStoredCount: interventions.length,
      interventionSensitiveFieldDropCount: interventions.reduce(
        (count, intervention) =>
          count + intervention.storageDecision.droppedSensitiveFields.length,
        0,
      ),
      interventionRedactedFieldCount: interventions.reduce(
        (count, intervention) =>
          count + intervention.storageDecision.redactedFields.length,
        0,
      ),
      interventionCounts: {
        byChannel: [{ value: "email", count: interventions.length }],
        byDeliveryStatus: [{ value: "failed", count: interventions.length }],
        byBehavior: [
          {
            behaviorExternalId: "behavior-brush",
            behaviorTitle: "Brush teeth",
            count: interventions.length,
          },
        ],
      },
      createCount: 3,
      skipCount: 0,
      errorCount: 0,
      warningCount: 0,
      conflictCount: 0,
      unsupportedFieldCount: 0,
      dayGroups: [],
    },
    errors: [],
    warnings: [],
    conflicts: [],
    unsupportedFields: [],
    plan: {
      behaviors: [
        {
          action: "create",
          skipReasons: [],
          externalId: "behavior-brush",
          title: "Brush teeth",
          category: "hygiene",
          cadenceCategoryName: "Grooming",
          description: null,
          createdAtUtc: "2026-05-01T12:00:00Z",
          archivedAtUtc: null,
          cadenceActive: true,
          cadenceBrowserReminderEnabled: true,
          cadenceEmailReminderEnabled: false,
          cadenceReminderOffsetMinutes: 0,
          sourceConfidence: "high",
        },
      ],
      schedules: [
        {
          action: "create",
          skipReasons: [],
          externalId: "schedule-brush",
          behaviorExternalId: "behavior-brush",
          recurrenceProfile: "behaviorlog.calendar_simple.v1",
          recurrence: {
            type: "daily",
            interval: 1,
          },
          timezone: "America/New_York",
          localTime: "09:00",
          windowStartLocal: null,
          windowEndLocal: null,
          cadenceScheduleKind: "exact",
          cadenceSchedulePreset: null,
          activeFromLocalDate: "2026-05-01",
          activeUntilLocalDate: null,
          sourceConfidence: "high",
        },
      ],
      occurrences: [
        {
          action: "create",
          skipReasons: [],
          externalId: "occurrence-1",
          behaviorExternalId: "behavior-brush",
          scheduleExternalId: "schedule-brush",
          scheduledForUtc: "2026-06-08T13:00:00Z",
          localDate: "2026-06-08",
          timezone: "America/New_York",
          localTime: "09:00",
          generatedAtUtc: "2026-06-08T12:00:00Z",
          currentStatus: "unresolved",
          sourceConfidence: "high",
        },
      ],
      statusEvents: [],
      notes: [],
      interventions,
    },
  };
}

function createMergePreview(input: {
  interventions?: BehaviorLogImportPreview["plan"]["interventions"];
}): BehaviorLogImportMergePreviewResult {
  const preview = createApplyPreview(input);
  const actions: BehaviorLogImportMergePreview["actions"] = {
    behaviors: [
      mergeAction("behavior", "behavior-brush", "create_new", null),
    ],
    schedules: [
      mergeAction("schedule", "schedule-brush", "create_new", null, {
        behavior: "behavior-brush",
      }),
    ],
    occurrences: [
      mergeAction("occurrence", "occurrence-1", "create_new", null, {
        behavior: "behavior-brush",
        schedule: "schedule-brush",
      }),
    ],
    statusEvents: [],
    notes: [],
    interventions: preview.plan.interventions.map((intervention) =>
      mergeAction("intervention", intervention.externalId, "create_new", null, {
        behavior: intervention.behaviorExternalId,
        occurrence: intervention.occurrenceExternalId,
      }, {
        interventionDecision: "store_passive_history",
        storageDecision: intervention.storageDecision,
      }),
    ),
  };

  return {
    ...preview,
    bundleFingerprint: "a".repeat(64),
    localDataFingerprint: "b".repeat(64),
    previewFingerprint: "c".repeat(64),
    mergePreview: {
      mode: "merge_preview",
      privacy: {
        profiles: ["core", "interventions"],
        redactionLevel: "standard_redaction",
        subjectIdStrategy: "pseudonymous",
        containsNotes: false,
        containsInterventions: true,
        containsRawLocation: false,
        containsHealthData: false,
        containsAiGeneratedContent: false,
      },
      semantics: {
        jsonlAuthoritative: true,
        csvIgnoredForMerge: true,
        statusEventsAuthoritative: true,
        unresolvedIsFailure: false,
        appendOnlyStatusEvents: true,
      },
      actionCounts: {
        create_new: 3 + preview.plan.interventions.length,
        map_to_existing: 0,
        skip_existing: 0,
        conflict_requires_decision: 0,
      },
      conflictCodes: [],
      conflictCount: 0,
      conflicts: [],
      actions,
    },
  };
}

function createInterventionPlan(): BehaviorLogImportPreview["plan"]["interventions"][number] {
  return {
    action: "preview_only",
    previewOnly: true,
    externalId: "intervention-1",
    behaviorExternalId: "behavior-brush",
    occurrenceExternalId: "occurrence-1",
    interventionType: "reminder",
    channel: "email",
    deliveryStatus: "failed",
    scheduledSendAtUtc: "2026-06-08T12:45:00Z",
    sentAtUtc: null,
    failureReason: "Redacted sensitive delivery detail.",
    sourceOriginalId: "delivery-source-1",
    sourceCaptureMethod: "system_generated",
    sourceConfidence: "high",
    storageDecision: {
      decision: "store_passive_history",
      storedFields: [
        "intervention_id",
        "behavior_id",
        "occurrence_id",
        "channel",
        "delivery_status",
        "scheduled_send_at_utc",
        "failure_reason (redacted)",
      ],
      droppedSensitiveFields: ["message_body"],
      redactedFields: ["failure_reason"],
      rawMessageBodyStored: false,
      rawEndpointStored: false,
      recipientIdentifiersStored: false,
      reminderDeliverySideEffects: false,
      providerSideEffects: false,
    },
  };
}

function mergeAction(
  recordType: BehaviorLogImportMergePreview["actions"][keyof BehaviorLogImportMergePreview["actions"]][number]["recordType"],
  externalId: string,
  action: BehaviorLogImportMergePreview["actions"][keyof BehaviorLogImportMergePreview["actions"]][number]["action"],
  localId: string | null,
  relatedExternalIds?: Record<string, string | null>,
  metadata?: Record<string, unknown>,
): BehaviorLogImportMergePreview["actions"][keyof BehaviorLogImportMergePreview["actions"]][number] {
  return {
    recordType,
    externalId,
    action,
    localId,
    conflictCodes: [],
    reasons: [`Accepted ${action} action for ${recordType} ${externalId}.`],
    relatedExternalIds,
    metadata,
  };
}

type FakeTables = Record<string, Array<Record<string, unknown>>>;

function createApplyClient(input: {
  importMode?: "create_missing_only" | "merge_by_user_approved_plan";
  dryRunSummary?: Record<string, unknown>;
} = {}) {
  const tables: FakeTables = {
    behaviorlog_import_runs: [
      {
        id: IMPORT_RUN_ID,
        user_id: USER_ID,
        import_mode: input.importMode ?? "create_missing_only",
        status: "previewed",
        dry_run_summary: input.dryRunSummary ?? {
          valid: true,
          errorCount: 0,
        },
        failure_message: null,
        completed_at: null,
      },
    ],
    behaviorlog_import_record_mappings: [],
    categories: [
      {
        id: "category-grooming",
        user_id: USER_ID,
        name: "Grooming",
        sort_order: 1,
      },
    ],
    behaviors: [],
    behavior_definition_events: [],
    behavior_configuration_events: [],
    behavior_schedules: [],
    behavior_schedule_slots: [],
    occurrences: [],
    occurrence_status_events: [],
    imported_interventions: [],
    reminder_deliveries: [],
  };
  const counters = new Map<string, number>();
  const from = vi.fn(
    (table: string) => new FakeQuery(table, tables, counters),
  );
  const rpc = vi.fn(
    async (
      functionName: string,
      args: {
        behavior_payload?: Record<string, unknown>;
        definition_event_plan?: Record<string, unknown>;
        configuration_event_plan?: Record<string, unknown>;
        schedule_graph?: Array<Record<string, unknown>>;
      },
    ) => {
      if (functionName !== "create_behavior_with_schedule_graph") {
        return {
          data: null,
          error: new Error(`Unsupported fake RPC ${functionName}.`),
        };
      }

      const behaviorPayload = args.behavior_payload;
      const definitionEventPlan = args.definition_event_plan;
      const configurationEventPlan = args.configuration_event_plan;

      if (
        !behaviorPayload ||
        !definitionEventPlan ||
        !configurationEventPlan ||
        !args.schedule_graph
      ) {
        return {
          data: null,
          error: new Error("Missing atomic behavior definition payload."),
        };
      }

      const behaviorId = `behaviors-${tables.behaviors.length + 1}`;
      const createdAt =
        behaviorPayload.created_at ?? definitionEventPlan.recorded_at;
      const behavior = {
        ...behaviorPayload,
        id: behaviorId,
        user_id: USER_ID,
        created_at: createdAt,
        updated_at: createdAt,
        category: null,
        schedules: [],
        schedule_slots: [],
      };

      tables.behaviors.push(behavior);
      tables.behavior_definition_events.push({
        id: `behavior_definition_events-${tables.behavior_definition_events.length + 1}`,
        user_id: USER_ID,
        behavior_id: behaviorId,
        previous_title: definitionEventPlan.previous_title,
        next_title: definitionEventPlan.next_title,
        previous_description: definitionEventPlan.previous_description,
        next_description: definitionEventPlan.next_description,
        changed_fields: definitionEventPlan.changed_fields,
        recorded_at: definitionEventPlan.recorded_at,
        source: definitionEventPlan.source,
        reason: definitionEventPlan.reason,
        created_at: createdAt,
        updated_at: createdAt,
      });
      tables.behavior_configuration_events.push({
        ...configurationEventPlan,
        id: `behavior_configuration_events-${tables.behavior_configuration_events.length + 1}`,
        user_id: USER_ID,
        behavior_id: behaviorId,
      });
      installFakeScheduleGraph(
        tables,
        behavior,
        args.schedule_graph,
        counters,
      );

      return { data: behavior, error: null };
    },
  );

  return {
    supabase: { from, rpc } as never,
    tables,
    from,
    rpc,
  };
}

function installFakeScheduleGraph(
  tables: FakeTables,
  behavior: Record<string, unknown>,
  scheduleGraph: Array<Record<string, unknown>>,
  counters: Map<string, number>,
): void {
  const behaviorId = String(behavior.id);
  const schedules = scheduleGraph.map((entry) => {
    const scheduleId = `behavior_schedules-${nextFakeId(
      counters,
      "behavior_schedules",
    )}`;
    const schedule = {
      id: scheduleId,
      user_id: USER_ID,
      behavior_id: behaviorId,
      recurrence_rule: entry.recurrence_rule,
      sort_order: entry.sort_order,
      created_at: behavior.created_at,
      updated_at: behavior.updated_at,
      schedule_slots: [] as Array<Record<string, unknown>>,
    };
    const slots = (entry.time_entries as Array<Record<string, unknown>>).map(
      (timeEntry) => ({
        id: `behavior_schedule_slots-${nextFakeId(
          counters,
          "behavior_schedule_slots",
        )}`,
        user_id: USER_ID,
        behavior_id: behaviorId,
        behavior_schedule_id: scheduleId,
        kind: timeEntry.kind,
        preset: timeEntry.preset,
        start_time: timeEntry.start_time,
        end_time: timeEntry.end_time,
        sort_order: timeEntry.sort_order,
        created_at: behavior.created_at,
        updated_at: behavior.updated_at,
      }),
    );

    schedule.schedule_slots = slots;
    tables.behavior_schedules.push(schedule);
    tables.behavior_schedule_slots.push(...slots);
    return schedule;
  });

  behavior.schedules = schedules;
  behavior.schedule_slots = schedules.flatMap(
    (schedule) => schedule.schedule_slots,
  );
}

function nextFakeId(counters: Map<string, number>, table: string): number {
  const next = (counters.get(table) ?? 0) + 1;
  counters.set(table, next);
  return next;
}

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; values: unknown[] }> = [];
  private operation: "select" | "insert" | "update" | null = null;
  private values: Array<Record<string, unknown>> = [];
  private updateValue: Record<string, unknown> = {};
  private limitCount: number | null = null;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;

  constructor(
    private readonly table: string,
    private readonly tables: FakeTables,
    private readonly counters: Map<string, number>,
  ) {}

  select(): this {
    this.operation ??= "select";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values });
    return this;
  }

  order(): this {
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.operation = "insert";
    this.values = Array.isArray(values) ? values : [values];
    return this;
  }

  update(value: Record<string, unknown>): this {
    this.operation = "update";
    this.updateValue = value;
    return this;
  }

  async upsert(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): Promise<{ error: null }> {
    const rows = Array.isArray(values) ? values : [values];
    const conflictColumns = options?.onConflict?.split(",") ?? [];

    for (const row of rows) {
      const existing = this.tableRows().find((candidate) =>
        conflictColumns.every((column) => candidate[column] === row[column]),
      );

      if (existing && options?.ignoreDuplicates) {
        continue;
      }

      if (existing) {
        Object.assign(existing, row);
        continue;
      }

      this.tableRows().push(this.withDefaults(row));
    }

    return { error: null };
  }

  async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    const rows = this.execute();

    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: Record<string, unknown>; error: null }> {
    const rows = this.execute();

    if (!rows[0]) {
      throw new Error(`No fake row returned from ${this.table}.`);
    }

    return { data: rows[0], error: null };
  }

  then<TResult1 = { data: Array<Record<string, unknown>>; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((
          value: { data: Array<Record<string, unknown>>; error: null },
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.execute(), error: null }).then(
      onfulfilled,
      onrejected,
    );
  }

  private execute(): Array<Record<string, unknown>> {
    if (this.operation === "insert") {
      const inserted = this.values.map((row) => this.withDefaults(row));
      this.tableRows().push(...inserted);
      return inserted;
    }

    if (this.operation === "update") {
      const rows = this.filteredRows();

      for (const row of rows) {
        Object.assign(row, this.updateValue);
      }

      return rows;
    }

    return this.filteredRows();
  }

  private filteredRows(): Array<Record<string, unknown>> {
    const rows = this.tableRows().filter(
      (row) =>
        this.filters.every((filter) => row[filter.column] === filter.value) &&
        this.inFilters.every((filter) =>
          filter.values.includes(row[filter.column]),
        ),
    );

    const limited =
      this.limitCount === null ? rows : rows.slice(0, this.limitCount);

    return this.rangeStart === null || this.rangeEnd === null
      ? limited
      : limited.slice(this.rangeStart, this.rangeEnd + 1);
  }

  private tableRows(): Array<Record<string, unknown>> {
    this.tables[this.table] ??= [];

    return this.tables[this.table];
  }

  private withDefaults(row: Record<string, unknown>): Record<string, unknown> {
    const next = { ...row };

    if (!next.id) {
      next.id = `${this.table}-${this.nextId()}`;
    }

    return next;
  }

  private nextId(): number {
    const current = this.counters.get(this.table) ?? 0;
    const next = current + 1;
    this.counters.set(this.table, next);
    return next;
  }
}

function behaviorLogFiles(input: {
  intervention?: Record<string, unknown>;
} = {}): BehaviorLogImportFile[] {
  const contentByPath = new Map([
    ["schema.json", "{}"],
    ["README.md", "# BehaviorLog"],
    ["AGENTS.md", "# AGENTS"],
    [
      "data/behaviors.jsonl",
      JSON.stringify({
        record_type: "behavior",
        behavior_id: "behavior-brush",
        title: "Brush teeth",
        category: "hygiene",
        source: {
          capture_method: "manual_text",
          confidence: "high",
        },
      }),
    ],
    [
      "data/schedules.jsonl",
      JSON.stringify({
        record_type: "schedule",
        schedule_id: "schedule-brush",
        behavior_id: "behavior-brush",
        recurrence_profile: "behaviorlog.calendar_simple.v1",
        recurrence: {
          type: "daily",
          interval: 1,
        },
        timezone: "America/New_York",
        local_time: "09:00",
        active_from_local_date: "2026-05-01",
        source: {
          capture_method: "system_generated",
          confidence: "high",
        },
      }),
    ],
    [
      "data/occurrences.jsonl",
      JSON.stringify({
        record_type: "occurrence",
        occurrence_id: "occurrence-1",
        behavior_id: "behavior-brush",
        schedule_id: "schedule-brush",
        scheduled_for_utc: "2026-06-08T13:00:00Z",
        local_date: "2026-06-08",
        timezone: "America/New_York",
        current_status: "unresolved",
        source: {
          capture_method: "system_generated",
          confidence: "high",
        },
      }),
    ],
    [
      "data/status_events.jsonl",
      JSON.stringify({
        record_type: "status_event",
        event_id: "event-1",
        occurrence_id: "occurrence-1",
        behavior_id: "behavior-brush",
        previous_status: "unresolved",
        status: "completed",
        status_semantics: "explicit_user_mark",
        recorded_at_utc: "2026-06-08T13:10:00Z",
        local_date: "2026-06-08",
        timezone: "America/New_York",
        source: {
          capture_method: "manual_tap",
          confidence: "high",
        },
      }),
    ],
    [
      "data/interventions.jsonl",
      JSON.stringify({
        record_type: "intervention",
        intervention_id: "intervention-1",
        behavior_id: "behavior-brush",
        occurrence_id: "occurrence-1",
        intervention_type: "reminder",
        channel: "email",
        scheduled_send_at_utc: "2026-06-08T12:45:00Z",
        sent_at_utc: null,
        delivery_status: "failed",
        failure_reason: null,
        source: {
          original_id: "delivery-source-1",
          capture_method: "system_generated",
          confidence: "high",
        },
        ...input.intervention,
      }),
    ],
  ]);
  const manifest = {
    format: "behaviorlog.bundle",
    schema_version: "0.1.0-draft",
    privacy: {
      redaction_level: "standard_redaction",
      subject_id_strategy: "pseudonymous",
    },
    profiles: ["core", "interventions"],
    files: [...contentByPath.entries()].map(([path, content]) => ({
      path,
      sha256: sha256(content),
      required: !path.includes("interventions"),
    })),
  };

  return [
    {
      path: "manifest.json",
      mediaType: "application/json",
      content: JSON.stringify(manifest),
    },
    ...[...contentByPath.entries()].map(([path, content]) => ({
      path,
      mediaType: path.endsWith(".jsonl")
        ? "application/jsonl"
        : path.endsWith(".md")
          ? "text/markdown"
          : "application/json",
      content,
    })),
  ];
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
