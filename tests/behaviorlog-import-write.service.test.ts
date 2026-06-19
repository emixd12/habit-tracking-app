import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { resolveBehaviorLogImportPreview } from "../lib/resolvers/behaviorlog-import.resolver";
import {
  applyApprovedBehaviorLogMergePlan,
  applyCreateMissingBehaviorLogImportPlan,
  createBehaviorLogImportRecordMappings,
  createBehaviorLogImportRunFromPreview,
  createBehaviorLogMergePreviewRunFromFiles,
  updateBehaviorLogImportRunStatus,
} from "../lib/services/behaviorlog-import-write.service";
import type {
  BehaviorLogImportFile,
  BehaviorLogImportMergePreview,
  BehaviorLogImportMergePreviewResult,
  BehaviorLogImportPreview,
} from "../lib/types/behaviorlog-import";

const STARTED_AT = "2026-06-12T10:00:00Z";
const COMPLETED_AT = "2026-06-12T10:00:01Z";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMPORT_RUN_ID = "22222222-2222-4222-8222-222222222222";

describe("BehaviorLog import write service", () => {
  it("creates an import run with manifest metadata and a dry-run summary snapshot", async () => {
    const files = behaviorLogFiles();
    const preview = behaviorLogPreview();
    const { supabase, from, insert } = createInsertClient({
      id: "00000000-0000-0000-0000-000000000018",
    });

    await createBehaviorLogImportRunFromPreview(supabase, {
      userId: "11111111-1111-4111-8111-111111111111",
      files,
      preview,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
    });

    expect(from).toHaveBeenCalledWith("behaviorlog_import_runs");
    expect(insert).toHaveBeenCalledWith({
      user_id: "11111111-1111-4111-8111-111111111111",
      bundle_format: "behaviorlog.bundle",
      schema_version: "0.1.0-draft",
      manifest_sha256: sha256(files[0].content),
      bundle_fingerprint: bundleFingerprint(files),
      producer_name: "Cadence Tracker",
      producer_version: "0.1.0",
      subject_id_strategy: "pseudonymous",
      privacy_redaction_level: "standard_redaction",
      import_mode: "preview_only",
      dry_run_summary: {
        ...preview.summary,
        valid: true,
      },
      status: "previewed",
      failure_message: null,
      started_at: STARTED_AT,
      completed_at: COMPLETED_AT,
    });
  });

  it("persists a merge preview snapshot without touching product records", async () => {
    const files = behaviorLogImportFiles();
    const { supabase, from, insert } = createInsertClient({
      id: "00000000-0000-0000-0000-000000000020",
    });

    await createBehaviorLogMergePreviewRunFromFiles(supabase, {
      userId: "11111111-1111-4111-8111-111111111111",
      files,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
    });

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("behaviorlog_import_runs");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "11111111-1111-4111-8111-111111111111",
        import_mode: "merge_preview",
        status: "previewed",
        dry_run_summary: expect.objectContaining({
          valid: true,
          mergePreview: expect.objectContaining({
            mode: "merge_preview",
            actionCounts: {
              create_new: 4,
              map_to_existing: 0,
              skip_existing: 0,
              conflict_requires_decision: 0,
            },
            semantics: {
              jsonlAuthoritative: true,
              csvIgnoredForMerge: true,
              statusEventsAuthoritative: true,
              unresolvedIsFailure: false,
              appendOnlyStatusEvents: true,
            },
          }),
        }),
      }),
    );
  });

  it("inserts record mappings idempotently by import run, record type, and external id", async () => {
    const { supabase, from, upsert } = createUpsertClient();

    await createBehaviorLogImportRecordMappings(supabase, [
      {
        userId: "11111111-1111-4111-8111-111111111111",
        importRunId: "22222222-2222-4222-8222-222222222222",
        recordType: "behavior",
        externalId: " behavior-export-id ",
        localId: "33333333-3333-4333-8333-333333333333",
      },
      {
        userId: "11111111-1111-4111-8111-111111111111",
        importRunId: "22222222-2222-4222-8222-222222222222",
        recordType: "intervention",
        externalId: "intervention-export-id",
        localId: "44444444-4444-4444-8444-444444444444",
      },
    ]);

    expect(from).toHaveBeenCalledWith("behaviorlog_import_record_mappings");
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          user_id: "11111111-1111-4111-8111-111111111111",
          import_run_id: "22222222-2222-4222-8222-222222222222",
          record_type: "behavior",
          external_id: "behavior-export-id",
          local_id: "33333333-3333-4333-8333-333333333333",
        },
        {
          user_id: "11111111-1111-4111-8111-111111111111",
          import_run_id: "22222222-2222-4222-8222-222222222222",
          record_type: "intervention",
          external_id: "intervention-export-id",
          local_id: "44444444-4444-4444-8444-444444444444",
        },
      ],
      {
        onConflict: "import_run_id,record_type,external_id",
        ignoreDuplicates: true,
      },
    );
  });

  it("updates import run status without touching product records", async () => {
    const { supabase, from, update, eq } = createUpdateClient({
      id: "22222222-2222-4222-8222-222222222222",
    });

    await updateBehaviorLogImportRunStatus(supabase, {
      userId: "11111111-1111-4111-8111-111111111111",
      importRunId: "22222222-2222-4222-8222-222222222222",
      status: "failed",
      failureMessage: "  Could not apply accepted plan.  ",
      completedAt: COMPLETED_AT,
    });

    expect(from).toHaveBeenCalledWith("behaviorlog_import_runs");
    expect(update).toHaveBeenCalledWith({
      status: "failed",
      failure_message: "Could not apply accepted plan.",
      completed_at: COMPLETED_AT,
    });
    expect(eq).toHaveBeenNthCalledWith(
      1,
      "user_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(eq).toHaveBeenNthCalledWith(
      2,
      "id",
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("applies a create-only core plan and is idempotent for the same import run", async () => {
    const preview = createApplyPreview();
    const { supabase, tables } = createApplyClient();

    const result = await applyCreateMissingBehaviorLogImportPlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.created).toMatchObject({
      behaviors: 1,
      schedules: 1,
      occurrences: 1,
      statusEvents: 1,
      mappings: 4,
    });
    expect(tables.behaviors).toHaveLength(1);
    expect(tables.behaviors[0]).toMatchObject({
      user_id: USER_ID,
      category_id: "category-grooming",
      title: "Brush teeth",
      recurrence_rule: {
        frequency: "daily",
        interval: 1,
      },
      scheduled_time: "09:00",
      timezone: "America/New_York",
      browser_reminder_enabled: true,
      email_reminder_enabled: true,
      reminder_offset_minutes: 60,
      active: true,
      created_at: "2026-05-01T12:00:00Z",
    });
    expect(tables.behavior_schedule_slots).toEqual([
      expect.objectContaining({
        user_id: USER_ID,
        behavior_id: tables.behaviors[0].id,
        kind: "exact",
        preset: null,
        start_time: "09:00",
        end_time: null,
      }),
    ]);
    expect(tables.occurrence_status_events).toEqual([
      expect.objectContaining({
        user_id: USER_ID,
        occurrence_id: tables.occurrences[0].id,
        behavior_id: tables.behaviors[0].id,
        status: "completed",
        status_semantics: "explicit_user_mark",
        source_capture_method: "manual_tap",
        source_confidence: "high",
      }),
    ]);
    expect(tables.occurrences[0]).toMatchObject({
      status: "completed",
      completed_at: "2026-06-08T13:05:00Z",
      status_marked_at: "2026-06-08T13:10:00Z",
    });
    expect(
      tables.behaviorlog_import_record_mappings.map((mapping) => [
        mapping.record_type,
        mapping.external_id,
      ]),
    ).toEqual([
      ["behavior", "behavior-brush"],
      ["schedule", "schedule-brush"],
      ["occurrence", "occurrence-1"],
      ["status_event", "event-1"],
    ]);
    expect(tables.behaviorlog_import_runs[0]).toMatchObject({
      status: "applied",
      failure_message: null,
      completed_at: COMPLETED_AT,
    });

    const rerun = await applyCreateMissingBehaviorLogImportPlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: "2026-06-12T10:00:02Z",
    });

    expect(rerun.created).toMatchObject({
      behaviors: 0,
      schedules: 0,
      occurrences: 0,
      statusEvents: 0,
      mappings: 0,
    });
    expect(tables.behaviors).toHaveLength(1);
    expect(tables.behavior_schedule_slots).toHaveLength(1);
    expect(tables.occurrences).toHaveLength(1);
    expect(tables.occurrence_status_events).toHaveLength(1);
    expect(tables.behaviorlog_import_record_mappings).toHaveLength(4);
  });

  it("preserves unresolved when a resolved snapshot has no status event history", async () => {
    const warning = {
      severity: "warning" as const,
      code: "resolved_snapshot_without_history",
      message:
        "Occurrence occurrence-1 has current_status not_completed but no status_events row.",
      file: "data/occurrences.jsonl",
    };
    const preview = createApplyPreview({
      warnings: [warning],
      statusEvents: [],
      occurrenceStatus: "not_completed",
    });
    const { supabase, tables } = createApplyClient();

    const result = await applyCreateMissingBehaviorLogImportPlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.warnings).toContainEqual(warning);
    expect(tables.occurrence_status_events).toHaveLength(0);
    expect(tables.occurrences[0]).toMatchObject({
      status: "unresolved",
      completed_at: null,
      status_marked_at: null,
    });
    expect(
      tables.behaviorlog_import_record_mappings.map(
        (mapping) => mapping.record_type,
      ),
    ).toEqual(["behavior", "schedule", "occurrence"]);
  });

  it("requires an accepted merge preview on a merge apply import run", async () => {
    const preview = createMergeApplyPreview();
    const { supabase, tables } = createApplyClient({
      importMode: "merge_by_user_approved_plan",
      dryRunSummary: {
        valid: true,
        errorCount: 0,
      },
    });

    await expect(
      applyApprovedBehaviorLogMergePlan(supabase, {
        userId: USER_ID,
        importRunId: IMPORT_RUN_ID,
        preview,
        completedAt: COMPLETED_AT,
      }),
    ).rejects.toThrow("accepted merge preview");
    expect(tables.behaviorlog_import_runs[0]).toMatchObject({
      status: "failed",
      failure_message:
        "BehaviorLog merge import run does not contain an accepted merge preview.",
    });
    expect(tables.behaviors).toHaveLength(0);
  });

  it("refuses merge plans with unresolved conflict actions", async () => {
    const preview = createMergeApplyPreview({
      actionOverrides: {
        behaviors: [
          mergeAction({
            recordType: "behavior",
            externalId: "behavior-brush",
            action: "conflict_requires_decision",
            localId: "local-behavior",
            conflictCodes: ["behavior_identity_mismatch"],
            reasons: ["User has not accepted a behavior merge decision."],
          }),
        ],
      },
    });
    const { supabase, tables } = createApplyClient({
      importMode: "merge_by_user_approved_plan",
      dryRunSummary: acceptedMergeDryRunSummary(preview.mergePreview),
    });

    await expect(
      applyApprovedBehaviorLogMergePlan(supabase, {
        userId: USER_ID,
        importRunId: IMPORT_RUN_ID,
        preview,
        completedAt: COMPLETED_AT,
      }),
    ).rejects.toThrow("conflict action");
    expect(tables.behaviorlog_import_runs[0]).toMatchObject({
      status: "failed",
    });
    expect(tables.behaviorlog_import_record_mappings).toHaveLength(0);
    expect(tables.behaviors).toHaveLength(0);
  });

  it("applies an accepted merge create plan append-only, preserves revisions, and is idempotent", async () => {
    const preview = createMergeApplyPreview({
      statusEvents: [
        createStatusEventPlan({
          externalId: "event-1",
          status: "completed",
          recordedAtUtc: "2026-06-08T13:10:00Z",
          effectiveAtUtc: "2026-06-08T13:05:00Z",
        }),
        createStatusEventPlan({
          externalId: "event-2",
          previousStatus: "completed",
          status: "not_completed",
          recordedAtUtc: "2026-06-08T13:20:00Z",
          effectiveAtUtc: "2026-06-08T13:20:00Z",
          revisesEventId: "event-1",
        }),
      ],
    });
    const { supabase, tables } = createApplyClient({
      importMode: "merge_by_user_approved_plan",
      dryRunSummary: acceptedMergeDryRunSummary(preview.mergePreview),
    });

    const result = await applyApprovedBehaviorLogMergePlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.created).toMatchObject({
      behaviors: 1,
      schedules: 1,
      occurrences: 1,
      statusEvents: 2,
      mappings: 5,
    });
    expect(tables.occurrence_status_events).toHaveLength(2);
    expect(tables.occurrence_status_events[1]).toMatchObject({
      status: "not_completed",
      revises_event_id: tables.occurrence_status_events[0].id,
    });
    expect(tables.occurrences[0]).toMatchObject({
      status: "not_completed",
      completed_at: null,
      status_marked_at: "2026-06-08T13:20:00Z",
    });

    const rerun = await applyApprovedBehaviorLogMergePlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: "2026-06-12T10:00:02Z",
    });

    expect(rerun.created).toMatchObject({
      behaviors: 0,
      schedules: 0,
      occurrences: 0,
      statusEvents: 0,
      mappings: 0,
    });
    expect(tables.behaviors).toHaveLength(1);
    expect(tables.behavior_schedule_slots).toHaveLength(1);
    expect(tables.occurrences).toHaveLength(1);
    expect(tables.occurrence_status_events).toHaveLength(2);
    expect(tables.behaviorlog_import_record_mappings).toHaveLength(5);
  });

  it("maps existing behavior, schedule, and occurrence records without overwriting local fields", async () => {
    const preview = createMergeApplyPreview({
      actionOverrides: {
        behaviors: [
          mergeAction({
            recordType: "behavior",
            externalId: "behavior-brush",
            action: "map_to_existing",
            localId: "local-behavior",
          }),
        ],
        schedules: [
          mergeAction({
            recordType: "schedule",
            externalId: "schedule-brush",
            action: "map_to_existing",
            localId: "local-schedule",
            relatedExternalIds: {
              behavior: "behavior-brush",
            },
          }),
        ],
        occurrences: [
          mergeAction({
            recordType: "occurrence",
            externalId: "occurrence-1",
            action: "map_to_existing",
            localId: "local-occurrence",
            relatedExternalIds: {
              behavior: "behavior-brush",
              schedule: "schedule-brush",
            },
          }),
        ],
      },
    });
    const { supabase, tables } = createApplyClient({
      importMode: "merge_by_user_approved_plan",
      dryRunSummary: acceptedMergeDryRunSummary(preview.mergePreview),
      seed: {
        behaviors: [
          {
            id: "local-behavior",
            user_id: USER_ID,
            title: "Local Brush Title",
            description: "Keep local description",
            recurrence_rule: { frequency: "daily", interval: 1 },
            scheduled_time: "09:00",
            timezone: "America/New_York",
            active: true,
          },
        ],
        behavior_schedule_slots: [
          {
            id: "local-schedule",
            user_id: USER_ID,
            behavior_id: "local-behavior",
            kind: "exact",
            preset: null,
            start_time: "09:00",
            end_time: null,
            sort_order: 0,
          },
        ],
        occurrences: [
          {
            id: "local-occurrence",
            user_id: USER_ID,
            behavior_id: "local-behavior",
            behavior_schedule_slot_id: "local-schedule",
            scheduled_for: "2026-06-08T13:00:00Z",
            local_date: "2026-06-08",
            schedule_kind: "exact",
            schedule_preset: null,
            schedule_start_time: "09:00",
            schedule_end_time: null,
            status: "unresolved",
            completed_at: null,
            status_marked_at: null,
            note: "Keep local note",
          },
        ],
      },
    });

    const result = await applyApprovedBehaviorLogMergePlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.mapped).toMatchObject({
      behaviors: 1,
      schedules: 1,
      occurrences: 1,
    });
    expect(tables.behaviors).toHaveLength(1);
    expect(tables.behaviors[0]).toMatchObject({
      title: "Local Brush Title",
      description: "Keep local description",
    });
    expect(tables.occurrences[0]).toMatchObject({
      note: "Keep local note",
      status: "completed",
      completed_at: "2026-06-08T13:05:00Z",
    });
    expect(
      tables.behaviorlog_import_record_mappings.map((mapping) => [
        mapping.record_type,
        mapping.external_id,
        mapping.local_id,
      ]),
    ).toEqual([
      ["behavior", "behavior-brush", "local-behavior"],
      ["schedule", "schedule-brush", "local-schedule"],
      ["occurrence", "occurrence-1", "local-occurrence"],
      ["status_event", "event-1", "occurrence_status_events-1"],
    ]);
  });

  it("does not downgrade a high-confidence local explicit status snapshot with a lower-confidence import", async () => {
    const preview = createMergeApplyPreview({
      actionOverrides: {
        behaviors: [
          mergeAction({
            recordType: "behavior",
            externalId: "behavior-brush",
            action: "map_to_existing",
            localId: "local-behavior",
          }),
        ],
        schedules: [
          mergeAction({
            recordType: "schedule",
            externalId: "schedule-brush",
            action: "map_to_existing",
            localId: "local-schedule",
            relatedExternalIds: {
              behavior: "behavior-brush",
            },
          }),
        ],
        occurrences: [
          mergeAction({
            recordType: "occurrence",
            externalId: "occurrence-1",
            action: "map_to_existing",
            localId: "local-occurrence",
            relatedExternalIds: {
              behavior: "behavior-brush",
              schedule: "schedule-brush",
            },
          }),
        ],
      },
      statusEvents: [
        createStatusEventPlan({
          externalId: "event-low",
          status: "not_completed",
          statusSemantics: "ambiguous_import",
          sourceConfidence: "low",
          recordedAtUtc: "2026-06-08T13:30:00Z",
          effectiveAtUtc: "2026-06-08T13:30:00Z",
        }),
      ],
    });
    const { supabase, tables } = createApplyClient({
      importMode: "merge_by_user_approved_plan",
      dryRunSummary: acceptedMergeDryRunSummary(preview.mergePreview),
      seed: {
        behaviors: [
          {
            id: "local-behavior",
            user_id: USER_ID,
            title: "Brush teeth",
            recurrence_rule: { frequency: "daily", interval: 1 },
            scheduled_time: "09:00",
            timezone: "America/New_York",
            active: true,
          },
        ],
        behavior_schedule_slots: [
          {
            id: "local-schedule",
            user_id: USER_ID,
            behavior_id: "local-behavior",
            kind: "exact",
            preset: null,
            start_time: "09:00",
            end_time: null,
            sort_order: 0,
          },
        ],
        occurrences: [
          {
            id: "local-occurrence",
            user_id: USER_ID,
            behavior_id: "local-behavior",
            behavior_schedule_slot_id: "local-schedule",
            scheduled_for: "2026-06-08T13:00:00Z",
            local_date: "2026-06-08",
            schedule_kind: "exact",
            schedule_preset: null,
            schedule_start_time: "09:00",
            schedule_end_time: null,
            status: "completed",
            completed_at: "2026-06-08T13:10:00Z",
            status_marked_at: "2026-06-08T13:10:00Z",
          },
        ],
        occurrence_status_events: [
          {
            id: "local-high-event",
            user_id: USER_ID,
            occurrence_id: "local-occurrence",
            behavior_id: "local-behavior",
            previous_status: "unresolved",
            status: "completed",
            status_semantics: "explicit_user_mark",
            recorded_at: "2026-06-08T13:10:00Z",
            effective_at: "2026-06-08T13:10:00Z",
            local_date: "2026-06-08",
            timezone: "America/New_York",
            source_capture_method: "manual_tap",
            source_confidence: "high",
            revises_event_id: null,
            reason_code: null,
          },
        ],
      },
    });

    const result = await applyApprovedBehaviorLogMergePlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.created.statusEvents).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "status_snapshot_protected_by_high_confidence_local_event",
        }),
      ]),
    );
    expect(tables.occurrence_status_events).toHaveLength(2);
    expect(tables.occurrences[0]).toMatchObject({
      status: "completed",
      completed_at: "2026-06-08T13:10:00Z",
      status_marked_at: "2026-06-08T13:10:00Z",
    });
  });

  it("fills an empty occurrence note from an accepted note action without status side effects", async () => {
    const note = createNotePlan({
      externalId: "note-1",
      bodyMarkdown: " Imported occurrence note. ",
    });
    const preview = createMergeApplyPreview({
      statusEvents: [],
      notes: [note],
      actionOverrides: {
        behaviors: [
          mergeAction({
            recordType: "behavior",
            externalId: "behavior-brush",
            action: "map_to_existing",
            localId: "local-behavior",
          }),
        ],
        schedules: [
          mergeAction({
            recordType: "schedule",
            externalId: "schedule-brush",
            action: "map_to_existing",
            localId: "local-schedule",
            relatedExternalIds: {
              behavior: "behavior-brush",
            },
          }),
        ],
        occurrences: [
          mergeAction({
            recordType: "occurrence",
            externalId: "occurrence-1",
            action: "map_to_existing",
            localId: "local-occurrence",
            relatedExternalIds: {
              behavior: "behavior-brush",
              schedule: "schedule-brush",
            },
          }),
        ],
        statusEvents: [],
        notes: [
          mergeAction({
            recordType: "note",
            externalId: "note-1",
            action: "map_to_existing",
            localId: "local-occurrence",
            relatedExternalIds: {
              occurrence: "occurrence-1",
            },
            metadata: {
              noteDecision: "fill_empty_occurrence_note",
              attachedToType: "occurrence",
              attachedToId: "occurrence-1",
            },
          }),
        ],
      },
    });
    const { supabase, tables } = createApplyClient({
      importMode: "merge_by_user_approved_plan",
      dryRunSummary: acceptedMergeDryRunSummary(preview.mergePreview),
      seed: {
        behaviors: [
          {
            id: "local-behavior",
            user_id: USER_ID,
            title: "Brush teeth",
            recurrence_rule: { frequency: "daily", interval: 1 },
            scheduled_time: "09:00",
            timezone: "America/New_York",
            active: true,
          },
        ],
        behavior_schedule_slots: [
          {
            id: "local-schedule",
            user_id: USER_ID,
            behavior_id: "local-behavior",
            kind: "exact",
            preset: null,
            start_time: "09:00",
            end_time: null,
            sort_order: 0,
          },
        ],
        occurrences: [
          {
            id: "local-occurrence",
            user_id: USER_ID,
            behavior_id: "local-behavior",
            behavior_schedule_slot_id: "local-schedule",
            scheduled_for: "2026-06-08T13:00:00Z",
            local_date: "2026-06-08",
            schedule_kind: "exact",
            schedule_preset: null,
            schedule_start_time: "09:00",
            schedule_end_time: null,
            status: "completed",
            completed_at: "2026-06-08T13:10:00Z",
            status_marked_at: "2026-06-08T13:10:00Z",
            note: null,
          },
        ],
      },
    });

    const result = await applyApprovedBehaviorLogMergePlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.created.notes).toBe(1);
    expect(result.mapped.notes).toBe(0);
    expect(result.created.statusEvents).toBe(0);
    expect(tables.occurrence_status_events).toHaveLength(0);
    expect(tables.imported_notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          external_id: "note-1",
          target_type: "occurrence",
          target_external_id: "occurrence-1",
          target_local_id: "local-occurrence",
          body_markdown: "Imported occurrence note.",
          note_role: "user",
          sensitivity: "high",
        }),
      ]),
    );
    expect(tables.occurrences[0]).toMatchObject({
      note: "Imported occurrence note.",
      status: "completed",
      completed_at: "2026-06-08T13:10:00Z",
      status_marked_at: "2026-06-08T13:10:00Z",
    });
    expect(tables.behaviorlog_import_record_mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_type: "note",
          external_id: "note-1",
          local_id: "imported_notes-1",
        }),
      ]),
    );
  });

  it("stores behavior, status-event, and review notes as passive imported note rows", async () => {
    const preview = createApplyPreview({
      notes: [
        createNotePlan({
          externalId: "note-behavior",
          attachedToType: "behavior",
          attachedToId: "behavior-brush",
          bodyMarkdown: "Behavior-level imported context.",
          sensitivity: "medium",
          sourceOriginalId: "behavior-brush",
        }),
        createNotePlan({
          externalId: "note-status-event",
          attachedToType: "status_event",
          attachedToId: "event-1",
          bodyMarkdown: "Status-event imported context.",
          sensitivity: "low",
          sourceOriginalId: "event-1",
        }),
        createNotePlan({
          externalId: "note-review",
          attachedToType: "review",
          attachedToId: "review-1",
          bodyMarkdown: "Review imported context.",
          sensitivity: "high",
          sourceOriginalId: "review-1",
        }),
      ],
    });
    const { supabase, tables } = createApplyClient();

    const result = await applyCreateMissingBehaviorLogImportPlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.created.notes).toBe(3);
    expect(tables.imported_notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          external_id: "note-behavior",
          target_type: "behavior",
          target_external_id: "behavior-brush",
          target_local_id: "behaviors-1",
          body_markdown: "Behavior-level imported context.",
          sensitivity: "medium",
        }),
        expect.objectContaining({
          external_id: "note-status-event",
          target_type: "status_event",
          target_external_id: "event-1",
          target_local_id: "occurrence_status_events-1",
          body_markdown: "Status-event imported context.",
          sensitivity: "low",
        }),
        expect.objectContaining({
          external_id: "note-review",
          target_type: "review",
          target_external_id: "review-1",
          target_local_id: null,
          body_markdown: "Review imported context.",
          sensitivity: "high",
        }),
      ]),
    );
    expect(tables.behaviorlog_import_record_mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_type: "note",
          external_id: "note-behavior",
          local_id: "imported_notes-1",
        }),
        expect.objectContaining({
          record_type: "note",
          external_id: "note-status-event",
          local_id: "imported_notes-2",
        }),
        expect.objectContaining({
          record_type: "note",
          external_id: "note-review",
          local_id: "imported_notes-3",
        }),
      ]),
    );
    expect(tables.occurrences[0]).toMatchObject({
      status: "completed",
    });
    expect(tables.occurrences[0].note).toBeUndefined();
  });

  it("skips unsupported recurrence profiles before product writes", async () => {
    const preview = resolveBehaviorLogImportPreview({
      files: behaviorLogImportFiles({
        schedule: {
          recurrence_profile: "other.calendar.v1",
        },
      }),
    });
    const { supabase, tables } = createApplyClient();

    expect(preview.valid).toBe(true);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_recurrence_profile",
        }),
      ]),
    );
    expect(preview.plan.schedules[0]).toMatchObject({
      action: "skip",
      skipReasons: ["unsupported_recurrence_profile"],
    });

    const result = await applyCreateMissingBehaviorLogImportPlan(supabase, {
      userId: USER_ID,
      importRunId: IMPORT_RUN_ID,
      preview,
      completedAt: COMPLETED_AT,
    });

    expect(result.created).toMatchObject({
      behaviors: 0,
      schedules: 0,
      occurrences: 0,
      statusEvents: 0,
      mappings: 0,
    });
    expect(tables.behaviors).toHaveLength(0);
    expect(tables.occurrences).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "unsupported_recurrence_profile",
        "behavior_without_supported_schedule",
      ]),
    );
  });
});

function behaviorLogPreview(): BehaviorLogImportPreview {
  return {
    valid: true,
    summary: {
      schemaVersion: "0.1.0-draft",
      fileCount: 5,
      behaviorCount: 1,
      scheduleCount: 1,
      occurrenceCount: 1,
      statusEventCount: 1,
      noteCount: 0,
      interventionCount: 0,
      interventionPreviewOnlyCount: 0,
      interventionStoredCount: 0,
      interventionSensitiveFieldDropCount: 0,
      interventionRedactedFieldCount: 0,
      interventionCounts: {
        byChannel: [],
        byDeliveryStatus: [],
        byBehavior: [],
      },
      createCount: 4,
      skipCount: 0,
      errorCount: 0,
      warningCount: 0,
      conflictCount: 0,
      unsupportedFieldCount: 0,
      dayGroups: [
        {
          localDate: "2026-06-12",
          timezone: "America/New_York",
          occurrenceCount: 1,
          statusEventCount: 1,
          noteCount: 0,
          conflictCount: 0,
        },
      ],
    },
    errors: [],
    warnings: [],
    conflicts: [],
    unsupportedFields: [],
    plan: {
      behaviors: [],
      schedules: [],
      occurrences: [],
      statusEvents: [],
      notes: [],
      interventions: [],
    },
  };
}

function createApplyPreview(
  options: {
    warnings?: BehaviorLogImportPreview["warnings"];
    statusEvents?: BehaviorLogImportPreview["plan"]["statusEvents"];
    notes?: BehaviorLogImportPreview["plan"]["notes"];
    interventions?: BehaviorLogImportPreview["plan"]["interventions"];
    occurrenceStatus?: "unresolved" | "completed" | "not_completed";
  } = {},
): BehaviorLogImportPreview {
  const statusEvents =
    options.statusEvents ??
    [
      {
        action: "create" as const,
        skipReasons: [],
        externalId: "event-1",
        occurrenceExternalId: "occurrence-1",
        behaviorExternalId: "behavior-brush",
        previousStatus: "unresolved" as const,
        status: "completed" as const,
        statusSemantics: "explicit_user_mark" as const,
        recordedAtUtc: "2026-06-08T13:10:00Z",
        effectiveAtUtc: "2026-06-08T13:05:00Z",
        localDate: "2026-06-08",
        timezone: "America/New_York",
        sourceCaptureMethod: "manual_tap" as const,
        sourceConfidence: "high" as const,
        revisesEventId: null,
        reasonCode: null,
      },
    ];

  return {
    valid: true,
    summary: {
      schemaVersion: "0.1.0-draft",
      fileCount: 8,
      behaviorCount: 1,
      scheduleCount: 1,
      occurrenceCount: 1,
      statusEventCount: statusEvents.length,
      noteCount: options.notes?.length ?? 0,
      interventionCount: options.interventions?.length ?? 0,
      interventionPreviewOnlyCount: options.interventions?.length ?? 0,
      interventionStoredCount: options.interventions?.length ?? 0,
      interventionSensitiveFieldDropCount:
        options.interventions?.reduce(
          (count, intervention) =>
            count +
            intervention.storageDecision.droppedSensitiveFields.length,
          0,
        ) ?? 0,
      interventionRedactedFieldCount:
        options.interventions?.reduce(
          (count, intervention) =>
            count + intervention.storageDecision.redactedFields.length,
          0,
        ) ?? 0,
      interventionCounts: {
        byChannel: [],
        byDeliveryStatus: [],
        byBehavior: [],
      },
      createCount: 3 + statusEvents.length + (options.notes?.length ?? 0),
      skipCount: 0,
      errorCount: 0,
      warningCount: options.warnings?.length ?? 0,
      conflictCount: 0,
      unsupportedFieldCount: 0,
      dayGroups: [],
    },
    errors: [],
    warnings: options.warnings ?? [],
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
          description: "Night brushing",
          createdAtUtc: "2026-05-01T12:00:00Z",
          archivedAtUtc: null,
          cadenceActive: true,
          cadenceBrowserReminderEnabled: true,
          cadenceEmailReminderEnabled: true,
          cadenceReminderOffsetMinutes: 60,
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
          currentStatus: options.occurrenceStatus ?? "completed",
          sourceConfidence: "high",
        },
      ],
      statusEvents,
      notes: options.notes ?? [],
      interventions: options.interventions ?? [],
    },
  };
}

function createMergeApplyPreview(
  options: {
    warnings?: BehaviorLogImportPreview["warnings"];
    statusEvents?: BehaviorLogImportPreview["plan"]["statusEvents"];
    notes?: BehaviorLogImportPreview["plan"]["notes"];
    interventions?: BehaviorLogImportPreview["plan"]["interventions"];
    actionOverrides?: Partial<BehaviorLogImportMergePreview["actions"]>;
  } = {},
): BehaviorLogImportMergePreviewResult {
  const basePreview = createApplyPreview({
    warnings: options.warnings,
    statusEvents: options.statusEvents,
    notes: options.notes,
    interventions: options.interventions,
  });
  const actions: BehaviorLogImportMergePreview["actions"] = {
    behaviors: [
      mergeAction({
        recordType: "behavior",
        externalId: "behavior-brush",
        action: "create_new",
        localId: null,
      }),
    ],
    schedules: [
      mergeAction({
        recordType: "schedule",
        externalId: "schedule-brush",
        action: "create_new",
        localId: null,
        relatedExternalIds: {
          behavior: "behavior-brush",
        },
      }),
    ],
    occurrences: [
      mergeAction({
        recordType: "occurrence",
        externalId: "occurrence-1",
        action: "create_new",
        localId: null,
        relatedExternalIds: {
          behavior: "behavior-brush",
          schedule: "schedule-brush",
        },
      }),
    ],
    statusEvents: basePreview.plan.statusEvents.map((event) =>
      mergeAction({
        recordType: "status_event",
        externalId: event.externalId,
        action: "create_new",
        localId: null,
        relatedExternalIds: {
          behavior: event.behaviorExternalId,
          occurrence: event.occurrenceExternalId,
          revisesEvent: event.revisesEventId,
        },
      }),
    ),
    notes: basePreview.plan.notes.map((note) =>
      mergeAction({
        recordType: "note",
        externalId: note.externalId,
        action: "create_new",
        localId: null,
        relatedExternalIds: {
          occurrence:
            note.attachedToType === "occurrence" ? note.attachedToId : null,
        },
        metadata: {
          noteDecision: "fill_created_occurrence_note",
          attachedToType: note.attachedToType,
          attachedToId: note.attachedToId,
        },
      }),
    ),
    interventions: basePreview.plan.interventions.map((intervention) =>
      mergeAction({
        recordType: "intervention",
        externalId: intervention.externalId,
        action: "create_new",
        localId: null,
        relatedExternalIds: {
          behavior: intervention.behaviorExternalId,
          occurrence: intervention.occurrenceExternalId,
        },
        metadata: {
          interventionDecision: "store_passive_history",
          storageDecision: intervention.storageDecision,
        },
      }),
    ),
    ...options.actionOverrides,
  };
  const mergePreview: BehaviorLogImportMergePreview = {
    mode: "merge_preview",
    privacy: {
      profiles: ["core"],
      redactionLevel: "standard_redaction",
      subjectIdStrategy: "pseudonymous",
      containsNotes: false,
      containsInterventions: false,
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
    actionCounts: countMergeActions(actions),
    conflictCodes: [
      ...new Set(
        Object.values(actions)
          .flat()
          .flatMap((action) => action.conflictCodes),
      ),
    ].sort(),
    conflictCount: Object.values(actions)
      .flat()
      .reduce((count, action) => count + action.conflictCodes.length, 0),
    conflicts: Object.values(actions)
      .flat()
      .flatMap((action) =>
        action.conflictCodes.map((code, index) => ({
          code,
          reason: action.reasons[index] ?? action.reasons[0] ?? code,
          importedRecordType: action.recordType,
          importedId: action.externalId,
          existingId: action.localId,
        })),
      ),
    actions,
  };

  return {
    ...basePreview,
    mergePreview,
  };
}

function createStatusEventPlan(
  input: Partial<
    BehaviorLogImportPreview["plan"]["statusEvents"][number]
  > & {
    externalId: string;
  },
): BehaviorLogImportPreview["plan"]["statusEvents"][number] {
  return {
    action: "create",
    skipReasons: [],
    occurrenceExternalId: "occurrence-1",
    behaviorExternalId: "behavior-brush",
    previousStatus: "unresolved",
    status: "completed",
    statusSemantics: "explicit_user_mark",
    recordedAtUtc: "2026-06-08T13:10:00Z",
    effectiveAtUtc: "2026-06-08T13:05:00Z",
    localDate: "2026-06-08",
    timezone: "America/New_York",
    sourceCaptureMethod: "manual_tap",
    sourceConfidence: "high",
    revisesEventId: null,
    reasonCode: null,
    ...input,
  };
}

function createNotePlan(
  input: Partial<BehaviorLogImportPreview["plan"]["notes"][number]> & {
    externalId: string;
  },
): BehaviorLogImportPreview["plan"]["notes"][number] {
  return {
    action: "create",
    skipReasons: [],
    attachedToType: "occurrence",
    attachedToId: "occurrence-1",
    bodyMarkdown: "Imported occurrence note.",
    noteRole: "user",
    createdAtUtc: "2026-06-08T14:10:00Z",
    updatedAtUtc: null,
    sensitivity: "high",
    sourceOriginalId: "occurrence-1",
    sourceCaptureMethod: "manual_text",
    sourceConfidence: "high",
    ...input,
  };
}

function mergeAction(
  input: {
    recordType: BehaviorLogImportMergePreview["actions"][keyof BehaviorLogImportMergePreview["actions"]][number]["recordType"];
    externalId: string;
    action: BehaviorLogImportMergePreview["actions"][keyof BehaviorLogImportMergePreview["actions"]][number]["action"];
    localId: string | null;
    conflictCodes?: string[];
    reasons?: string[];
    relatedExternalIds?: Record<string, string | null>;
    metadata?: Record<string, unknown>;
  },
): BehaviorLogImportMergePreview["actions"][keyof BehaviorLogImportMergePreview["actions"]][number] {
  return {
    recordType: input.recordType,
    externalId: input.externalId,
    action: input.action,
    localId: input.localId,
    conflictCodes: input.conflictCodes ?? [],
    reasons:
      input.reasons ??
      [`Accepted ${input.action} action for ${input.recordType} ${input.externalId}.`],
    relatedExternalIds: input.relatedExternalIds,
    metadata: input.metadata,
  };
}

function countMergeActions(
  actions: BehaviorLogImportMergePreview["actions"],
): BehaviorLogImportMergePreview["actionCounts"] {
  const counts: BehaviorLogImportMergePreview["actionCounts"] = {
    create_new: 0,
    map_to_existing: 0,
    skip_existing: 0,
    conflict_requires_decision: 0,
  };

  for (const action of Object.values(actions).flat()) {
    counts[action.action] += 1;
  }

  return counts;
}

function acceptedMergeDryRunSummary(
  mergePreview: BehaviorLogImportMergePreview,
): Record<string, unknown> {
  return {
    valid: true,
    errorCount: 0,
    mergePreview,
  };
}

function behaviorLogFiles(): BehaviorLogImportFile[] {
  const manifest = {
    format: "behaviorlog.bundle",
    schema_version: "0.1.0-draft",
    producer: {
      name: "Cadence Tracker",
      version: "0.1.0",
    },
    privacy: {
      redaction_level: "standard_redaction",
      subject_id_strategy: "pseudonymous",
    },
    files: [],
  };

  return [
    {
      path: "manifest.json",
      mediaType: "application/json",
      content: JSON.stringify(manifest, null, 2),
    },
    {
      path: "data/behaviors.jsonl",
      mediaType: "application/jsonl",
      content: '{"record_type":"behavior","behavior_id":"behavior-export-id"}',
    },
  ];
}

function behaviorLogImportFiles(input: {
  schedule?: Partial<Record<string, unknown>>;
} = {}): BehaviorLogImportFile[] {
  const records = {
    behavior: {
      record_type: "behavior",
      behavior_id: "behavior-brush",
      title: "Brush teeth",
      description: "Night brushing",
      category: "hygiene",
      created_at_utc: "2026-05-01T12:00:00Z",
      archived_at_utc: null,
      source: {
        capture_method: "manual_text",
        confidence: "high",
      },
      extensions: {
        "app.cadence": {
          category_name: "Grooming",
          active: true,
          browser_reminder_enabled: true,
          email_reminder_enabled: false,
          reminder_offset_minutes: 0,
        },
      },
    },
    schedule: {
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
      window_start_local: null,
      window_end_local: null,
      active_from_local_date: "2026-05-01",
      active_until_local_date: null,
      source: {
        capture_method: "system_generated",
        confidence: "high",
      },
      extensions: {
        "app.cadence": {
          schedule_kind: "exact",
          schedule_preset: null,
        },
      },
      ...input.schedule,
    },
    occurrence: {
      record_type: "occurrence",
      occurrence_id: "occurrence-1",
      behavior_id: "behavior-brush",
      schedule_id: "schedule-brush",
      scheduled_for_utc: "2026-06-08T13:00:00Z",
      local_date: "2026-06-08",
      local_time: "09:00",
      timezone: "America/New_York",
      generated_at_utc: "2026-06-08T12:00:00Z",
      occurrence_state: "active",
      current_status: "unresolved",
      source: {
        capture_method: "system_generated",
        confidence: "high",
      },
    },
    statusEvent: {
      record_type: "status_event",
      event_id: "event-1",
      occurrence_id: "occurrence-1",
      behavior_id: "behavior-brush",
      previous_status: "unresolved",
      status: "completed",
      status_semantics: "explicit_user_mark",
      recorded_at_utc: "2026-06-08T13:10:00Z",
      effective_at_utc: "2026-06-08T13:05:00Z",
      local_date: "2026-06-08",
      timezone: "America/New_York",
      source: {
        capture_method: "manual_tap",
        confidence: "high",
      },
      revises_event_id: null,
      reason_code: null,
    },
  };
  const contentByPath = new Map([
    ["schema.json", "{}"],
    ["README.md", "# BehaviorLog"],
    ["AGENTS.md", "# AGENTS"],
    ["data/behaviors.jsonl", JSON.stringify(records.behavior)],
    ["data/schedules.jsonl", JSON.stringify(records.schedule)],
    ["data/occurrences.jsonl", JSON.stringify(records.occurrence)],
    ["data/status_events.jsonl", JSON.stringify(records.statusEvent)],
  ]);
  const manifest = {
    format: "behaviorlog.bundle",
    schema_version: "0.1.0-draft",
    files: [...contentByPath.entries()].map(([path, content]) => ({
      path,
      sha256: sha256(content),
      required: true,
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

function createInsertClient(data: unknown) {
  const single = vi.fn(async () => ({ data, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return {
    supabase: { from } as never,
    from,
    insert,
  };
}

function createUpsertClient() {
  const upsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ upsert }));

  return {
    supabase: { from } as never,
    from,
    upsert,
  };
}

function createUpdateClient(data: unknown) {
  const maybeSingle = vi.fn(async () => ({ data, error: null }));
  const select = vi.fn(() => ({ maybeSingle }));
  const builder = {
    eq: vi.fn(() => builder),
    select,
  };
  const update = vi.fn(() => builder);
  const from = vi.fn(() => ({ update }));

  return {
    supabase: { from } as never,
    from,
    update,
    eq: builder.eq,
  };
}

type FakeTables = Record<string, Array<Record<string, unknown>>>;

function createApplyClient(input: {
  importMode?: "create_missing_only" | "merge_by_user_approved_plan";
  dryRunSummary?: Record<string, unknown>;
  seed?: Partial<FakeTables>;
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
    behaviors: input.seed?.behaviors ?? [],
    behavior_schedule_slots: input.seed?.behavior_schedule_slots ?? [],
    occurrences: input.seed?.occurrences ?? [],
    occurrence_status_events: input.seed?.occurrence_status_events ?? [],
  };
  const counters = new Map<string, number>();
  const from = vi.fn(
    (table: string) => new FakeQuery(table, tables, counters),
  );

  return {
    supabase: { from } as never,
    tables,
    from,
  };
}

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; values: unknown[] }> = [];
  private operation: "select" | "insert" | "update" | null = null;
  private values: Array<Record<string, unknown>> = [];
  private updateValue: Record<string, unknown> = {};
  private limitCount: number | null = null;

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
    const rows = this.tableRows().filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value) &&
      this.inFilters.every((filter) =>
        filter.values.includes(row[filter.column]),
      ),
    );

    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
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

function bundleFingerprint(files: BehaviorLogImportFile[]): string {
  const hash = createHash("sha256");

  for (const file of [...files].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    hash.update(file.path, "utf8");
    hash.update("\0");
    hash.update(sha256(file.content), "utf8");
    hash.update("\0");
  }

  return hash.digest("hex");
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
