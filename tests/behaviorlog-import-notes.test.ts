import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveBehaviorLogImportMergePreview } from "../lib/resolvers/behaviorlog-import.resolver";
import type {
  BehaviorLogExistingRecords,
  BehaviorLogImportFile,
} from "../lib/types/behaviorlog-import";

const TIMEZONE = "America/New_York";

describe("BehaviorLog optional notes import preview", () => {
  it("plans occurrence-attached notes as fillable only when the local occurrence note is empty", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({ includeNote: true }),
      existing: existingRecords({ occurrenceNote: null }),
    });

    expect(preview.valid).toBe(true);
    expect(preview.mergePreview.actions.notes[0]).toMatchObject({
      recordType: "note",
      externalId: "note-1",
      action: "create_new",
      localId: null,
      conflictCodes: [],
      metadata: {
        noteDecision: "fill_empty_occurrence_note",
        noteStorageDecision: "create_imported_note_record",
        targetLocalId: "local-occurrence",
        attachedToType: "occurrence",
        attachedToId: "occurrence-1",
        noteRole: "user",
        sensitivity: "high",
        sourceCaptureMethod: "manual_text",
        sourceConfidence: "high",
      },
    });
  });

  it("requires a user decision when an imported note differs from an existing occurrence note", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({ includeNote: true }),
      existing: existingRecords({ occurrenceNote: "Keep this local note." }),
    });

    expect(preview.mergePreview.actions.notes[0]).toMatchObject({
      recordType: "note",
      externalId: "note-1",
      action: "create_new",
      localId: null,
      conflictCodes: [],
      metadata: {
        noteDecision: "requires_explicit_note_replace_decision",
        noteStorageDecision: "create_imported_note_record",
        targetLocalId: "local-occurrence",
      },
    });
    expect(preview.mergePreview.conflictCodes).not.toContain(
      "occurrence_note_conflict",
    );
  });

  it("stores behavior-attached notes passively and skips AI-generated notes without product side effects", () => {
    const behaviorNotePreview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        noteOverrides: {
          attached_to_type: "behavior",
          attached_to_id: "behavior-brush",
          sensitivity: "restricted",
        },
      }),
      existing: existingRecords({ occurrenceNote: null }),
    });
    const aiNotePreview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        noteOverrides: {
          note_role: "ai_generated",
          sensitivity: "medium",
        },
      }),
      existing: existingRecords({ occurrenceNote: null }),
    });

    expect(behaviorNotePreview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "restricted_note_present" }),
      ]),
    );
    expect(behaviorNotePreview.plan.notes[0]).toMatchObject({
      action: "create",
      skipReasons: [],
      sensitivity: "restricted",
    });
    expect(behaviorNotePreview.mergePreview.actions.notes[0]).toMatchObject({
      action: "create_new",
      localId: null,
      metadata: {
        noteDecision: "create_imported_note_record",
        noteStorageDecision: "create_imported_note_record",
        targetLocalId: "local-behavior",
        attachedToType: "behavior",
      },
    });

    expect(aiNotePreview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ai_generated_note_skipped" }),
      ]),
    );
    expect(aiNotePreview.plan.notes[0]).toMatchObject({
      action: "skip",
      skipReasons: ["ai_generated_note"],
    });
    expect(aiNotePreview.mergePreview.actions.notes[0]).toMatchObject({
      action: "skip_existing",
      localId: null,
      metadata: {
        noteDecision: "skip_unsupported_note",
        noteRole: "ai_generated",
      },
    });
  });

  it("stores status-event and review notes as passive imported note records", () => {
    const statusEventNotePreview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        noteOverrides: {
          attached_to_type: "status_event",
          attached_to_id: "event-1",
          sensitivity: "medium",
        },
      }),
      existing: existingRecords({ occurrenceNote: null }),
    });
    const reviewNotePreview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        noteOverrides: {
          attached_to_type: "review",
          attached_to_id: "review-1",
          sensitivity: "low",
        },
      }),
      existing: existingRecords({ occurrenceNote: null }),
    });

    expect(statusEventNotePreview.mergePreview.actions.notes[0]).toMatchObject({
      action: "create_new",
      localId: null,
      metadata: {
        noteDecision: "create_imported_note_record",
        noteStorageDecision: "create_imported_note_record",
        targetLocalId: "local-event",
        attachedToType: "status_event",
      },
    });
    expect(reviewNotePreview.mergePreview.actions.notes[0]).toMatchObject({
      action: "create_new",
      localId: null,
      metadata: {
        noteDecision: "create_imported_note_record",
        noteStorageDecision: "create_imported_note_record",
        targetLocalId: null,
        attachedToType: "review",
      },
    });
  });

  it("maps notes to existing imported note rows when they were already stored", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({ includeNote: true }),
      existing: {
        ...existingRecords({ occurrenceNote: null }),
        importedNotes: [
          {
            id: "local-imported-note",
            importRunId: "prior-import-run",
            externalId: "note-1",
            targetType: "occurrence",
            targetExternalId: "occurrence-1",
            targetLocalId: "local-occurrence",
            bodyMarkdown: "Skipped before work.",
            noteRole: "user",
            sensitivity: "high",
            sourceCaptureMethod: "manual_text",
            sourceConfidence: "high",
            createdAtUtc: "2026-06-08T13:12:00Z",
            updatedAtUtc: null,
          },
        ],
      },
    });

    expect(preview.mergePreview.actions.notes[0]).toMatchObject({
      recordType: "note",
      externalId: "note-1",
      action: "map_to_existing",
      localId: "local-imported-note",
      metadata: {
        noteDecision: "already_imported_note_record",
        noteStorageDecision: "existing_imported_note_record",
      },
    });
  });

  it("rejects unsupported note target types before planning note imports", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        noteOverrides: {
          attached_to_type: "measurement",
        },
      }),
      existing: existingRecords({ occurrenceNote: null }),
    });

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "note_target_type_invalid" }),
      ]),
    );
    expect(preview.plan.notes).toHaveLength(0);
  });

  it("surfaces note privacy warnings and keeps notes out of status merge actions", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({ includeNote: true }),
      existing: existingRecords({ occurrenceNote: null }),
    });

    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "high_sensitivity_note_present",
          file: "data/notes.jsonl",
        }),
      ]),
    );
    expect(preview.mergePreview.privacy).toMatchObject({
      containsNotes: true,
      containsAiGeneratedContent: false,
    });
    expect(preview.mergePreview.actions.statusEvents[0]).toMatchObject({
      recordType: "status_event",
      externalId: "event-1",
      action: "skip_existing",
      localId: "local-event",
    });
  });

  it("keeps imported notes user-owned with RLS policies", () => {
    const migration = readFileSync(
      "supabase/migrations/20260618120000_add_imported_notes.sql",
      "utf8",
    );

    expect(migration).toContain("alter table public.imported_notes enable row level security");
    expect(migration).toContain("create policy imported_notes_select_own");
    expect(migration).toContain("create policy imported_notes_insert_own");
    expect(migration).toContain("create policy imported_notes_update_own");
    expect(migration).toContain("create policy imported_notes_delete_own");
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain("with check ((select auth.uid()) = user_id)");
  });
});

function existingRecords(input: {
  occurrenceNote: string | null;
}): BehaviorLogExistingRecords {
  return {
    behaviors: [
      {
        id: "local-behavior",
        title: "Brush teeth",
        category: "Grooming",
        active: true,
        archivedAt: null,
        sourceOriginalId: "source-behavior",
      },
    ],
    schedules: [
      {
        id: "local-schedule",
        behaviorId: "local-behavior",
        recurrenceProfile: "behaviorlog.calendar_simple.v1",
        recurrence: { type: "daily", interval: 1 },
        timezone: TIMEZONE,
        localTime: "09:00",
        windowStartLocal: null,
        windowEndLocal: null,
        cadenceScheduleKind: "exact" as const,
        cadenceSchedulePreset: null,
        activeFromLocalDate: "2026-05-01",
        activeUntilLocalDate: null,
      },
    ],
    occurrences: [
      {
        id: "local-occurrence",
        behaviorId: "local-behavior",
        scheduleId: "local-schedule",
        scheduledForUtc: "2026-06-08T13:00:00Z",
        localDate: "2026-06-08",
        timezone: TIMEZONE,
        status: "unresolved" as const,
        note: input.occurrenceNote,
      },
    ],
    statusEvents: [
      {
        id: "local-event",
        occurrenceId: "local-occurrence",
        behaviorId: "local-behavior",
        recordedAtUtc: "2026-06-08T13:10:00Z",
        status: "completed" as const,
        statusSemantics: "explicit_user_mark" as const,
        revisesEventId: null,
      },
    ],
  };
}

function behaviorLogFiles(input: {
  includeNote?: boolean;
  noteOverrides?: Partial<Record<string, unknown>>;
} = {}): BehaviorLogImportFile[] {
  const records = {
    behavior: {
      record_type: "behavior",
      behavior_id: "behavior-brush",
      title: "Brush teeth",
      description: "Night brushing",
      category: "Grooming",
      success_definition: "Complete Brush teeth for each scheduled occurrence.",
      created_at_utc: "2026-05-01T12:00:00Z",
      archived_at_utc: null,
      source: {
        original_id: "source-behavior",
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
      recurrence: { type: "daily", interval: 1 },
      timezone: TIMEZONE,
      local_time: "09:00",
      window_start_local: null,
      window_end_local: null,
      active_from_local_date: "2026-05-01",
      active_until_local_date: null,
      source: {
        original_id: "local-schedule",
        capture_method: "system_generated",
        confidence: "high",
      },
      extensions: {
        "app.cadence": {
          schedule_kind: "exact",
          schedule_preset: null,
        },
      },
    },
    occurrence: {
      record_type: "occurrence",
      occurrence_id: "occurrence-1",
      behavior_id: "behavior-brush",
      schedule_id: "schedule-brush",
      scheduled_for_utc: "2026-06-08T13:00:00Z",
      local_date: "2026-06-08",
      timezone: TIMEZONE,
      local_time: "09:00",
      generated_at_utc: "2026-06-08T12:00:00Z",
      occurrence_state: "active",
      current_status: "completed",
      source: {
        original_id: "local-occurrence",
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
      timezone: TIMEZONE,
      source: {
        capture_method: "manual_tap",
        confidence: "high",
        original_id: "local-event",
      },
      revises_event_id: null,
      reason_code: null,
    },
    note: {
      record_type: "note",
      note_id: "note-1",
      attached_to_type: "occurrence",
      attached_to_id: "occurrence-1",
      body_markdown: "Skipped before work.",
      note_role: "user",
      sensitivity: "high",
      created_at_utc: "2026-06-08T13:12:00Z",
      updated_at_utc: null,
      source: {
        capture_method: "manual_text",
        confidence: "high",
        original_id: "occurrence-1",
      },
      ...input.noteOverrides,
    },
  };
  const contentByPath = new Map<string, string>([
    ["schema.json", "{}"],
    ["README.md", "# BehaviorLog"],
    ["AGENTS.md", "# AGENTS"],
    ["data/behaviors.jsonl", `${JSON.stringify(records.behavior)}\n`],
    ["data/schedules.jsonl", `${JSON.stringify(records.schedule)}\n`],
    ["data/occurrences.jsonl", `${JSON.stringify(records.occurrence)}\n`],
    ["data/status_events.jsonl", `${JSON.stringify(records.statusEvent)}\n`],
  ]);

  if (input.includeNote) {
    contentByPath.set("data/notes.jsonl", `${JSON.stringify(records.note)}\n`);
  }

  const manifest = {
    format: "behaviorlog.bundle",
    schema_version: "0.1.0-draft",
    producer: { name: "Cadence Tracker", version: "0.1.0" },
    profiles: input.includeNote ? ["core", "notes"] : ["core"],
    files: [...contentByPath.entries()].map(([path, content]) => ({
      path,
      media_type: path.endsWith(".jsonl")
        ? "application/jsonl"
        : path.endsWith(".md")
          ? "text/markdown"
          : "application/json",
      sha256: createHash("sha256").update(content).digest("hex"),
      required: !path.includes("notes"),
    })),
    privacy: {
      redaction_level: "standard_redaction",
      subject_id_strategy: "pseudonymous",
      contains_notes: input.includeNote ?? false,
      contains_context: false,
      contains_raw_location: false,
      contains_health_data: false,
      contains_ai_generated_content: false,
    },
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
