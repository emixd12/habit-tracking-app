import { createHash } from "node:crypto";

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
      action: "map_to_existing",
      localId: "local-occurrence",
      conflictCodes: [],
      metadata: {
        noteDecision: "fill_empty_occurrence_note",
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
      action: "conflict_requires_decision",
      localId: "local-occurrence",
      conflictCodes: ["occurrence_note_conflict"],
      metadata: {
        noteDecision: "requires_explicit_note_replace_decision",
      },
    });
    expect(preview.mergePreview.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "occurrence_note_conflict",
          importedRecordType: "note",
          importedId: "note-1",
          existingId: "local-occurrence",
        }),
      ]),
    );
  });

  it("skips unsupported note targets and AI-generated notes without product-write actions", () => {
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
        expect.objectContaining({ code: "unsupported_note_target" }),
        expect.objectContaining({ code: "restricted_note_present" }),
      ]),
    );
    expect(behaviorNotePreview.plan.notes[0]).toMatchObject({
      action: "skip",
      skipReasons: ["unsupported_note_target"],
      sensitivity: "restricted",
    });
    expect(behaviorNotePreview.mergePreview.actions.notes[0]).toMatchObject({
      action: "skip_existing",
      localId: null,
      metadata: {
        noteDecision: "skip_unsupported_note",
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
