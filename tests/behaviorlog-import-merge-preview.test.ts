import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resolveBehaviorLogImportMergePreview } from "../lib/resolvers/behaviorlog-import.resolver";
import type { BehaviorLogImportFile } from "../lib/types/behaviorlog-import";

const TIMEZONE = "America/New_York";

describe("resolveBehaviorLogImportMergePreview", () => {
  it("plans create_new actions for records without local matches and previews optional records", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({ includeNote: true, includeIntervention: true }),
    });

    expect(preview.valid).toBe(true);
    expect(preview.mergePreview.semantics).toEqual({
      jsonlAuthoritative: true,
      csvIgnoredForMerge: true,
      statusEventsAuthoritative: true,
      unresolvedIsFailure: false,
      appendOnlyStatusEvents: true,
    });
    expect(preview.mergePreview.privacy).toMatchObject({
      profiles: ["core", "notes", "interventions"],
      redactionLevel: "standard_redaction",
      subjectIdStrategy: "pseudonymous",
      containsNotes: true,
      containsInterventions: true,
      containsRawLocation: false,
      containsHealthData: false,
      containsAiGeneratedContent: false,
    });
    expect(preview.mergePreview.actionCounts).toMatchObject({
      create_new: 5,
      map_to_existing: 0,
      skip_existing: 1,
      conflict_requires_decision: 0,
    });
    expect(preview.mergePreview.actions.behaviors[0]).toMatchObject({
      recordType: "behavior",
      externalId: "behavior-brush",
      action: "create_new",
    });
    expect(preview.mergePreview.actions.statusEvents[0].reasons[0]).toContain(
      "status_events.jsonl remains authoritative",
    );
    expect(preview.mergePreview.actions.notes[0]).toMatchObject({
      recordType: "note",
      externalId: "note-1",
      action: "create_new",
      metadata: {
        noteDecision: "fill_created_occurrence_note",
        sensitivity: "high",
        sourceCaptureMethod: "manual_text",
        sourceConfidence: "high",
      },
    });
    expect(preview.mergePreview.actions.interventions[0]).toMatchObject({
      recordType: "intervention",
      externalId: "delivery-1",
      action: "skip_existing",
    });
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "high_sensitivity_note_present",
          file: "data/notes.jsonl",
        }),
      ]),
    );
  });

  it("maps existing behavior, schedule, occurrence records and skips duplicate status events", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles(),
      existing: existingRecords(),
    });

    expect(preview.valid).toBe(true);
    expect(preview.mergePreview.actionCounts).toMatchObject({
      create_new: 0,
      map_to_existing: 3,
      skip_existing: 1,
      conflict_requires_decision: 0,
    });
    expect(preview.mergePreview.actions.behaviors[0]).toMatchObject({
      action: "map_to_existing",
      localId: "local-behavior",
    });
    expect(preview.mergePreview.actions.behaviors[0].reasons).toEqual([
      "Behavior behavior-brush shares source original id source-behavior.",
    ]);
    expect(preview.mergePreview.actions.schedules[0]).toMatchObject({
      action: "map_to_existing",
      localId: "local-schedule",
    });
    expect(preview.mergePreview.actions.occurrences[0]).toMatchObject({
      action: "map_to_existing",
      localId: "local-occurrence",
    });
    expect(preview.mergePreview.actions.statusEvents[0]).toMatchObject({
      action: "skip_existing",
      localId: "local-event",
    });
  });

  it("emits stable conflict codes and human-readable reasons", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles(),
      existing: {
        behaviors: [
          {
            id: "local-behavior",
            title: "Brush teeth",
            category: "Grooming",
            active: false,
            archivedAt: "2026-06-01T12:00:00Z",
            sourceOriginalId: "source-behavior",
          },
        ],
      },
    });

    expect(preview.mergePreview.actions.behaviors[0]).toEqual({
      recordType: "behavior",
      externalId: "behavior-brush",
      action: "conflict_requires_decision",
      localId: "local-behavior",
      conflictCodes: ["behavior_archive_state_mismatch"],
      reasons: [
        "Behavior behavior-brush archive state differs from local behavior local-behavior.",
      ],
    });
    expect(preview.mergePreview.conflicts[0]).toEqual({
      code: "behavior_archive_state_mismatch",
      reason:
        "Behavior behavior-brush archive state differs from local behavior local-behavior.",
      importedRecordType: "behavior",
      importedId: "behavior-brush",
      existingId: "local-behavior",
      localDate: undefined,
      timezone: undefined,
    });
    expect(preview.mergePreview.conflictCodes).toEqual([
      "behavior_archive_state_mismatch",
      "occurrence_parent_mapping_unresolved",
      "schedule_parent_behavior_conflict",
      "status_event_parent_mapping_unresolved",
    ]);
  });

  it("keeps status_events.jsonl authoritative over occurrence current_status snapshots", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        occurrence: {
          current_status: "not_completed",
        },
        statusEvent: {
          status: "completed",
        },
      }),
      existing: {
        behaviors: existingRecords().behaviors,
        schedules: existingRecords().schedules,
        occurrences: existingRecords().occurrences,
        statusEvents: [],
      },
    });

    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "snapshot_status_differs_from_history",
          file: "data/occurrences.jsonl",
        }),
      ]),
    );
    expect(preview.mergePreview.actions.occurrences[0]).toMatchObject({
      action: "map_to_existing",
      localId: "local-occurrence",
      conflictCodes: [],
    });
    expect(preview.mergePreview.actions.statusEvents[0]).toMatchObject({
      action: "create_new",
      conflictCodes: [],
    });
    expect(preview.mergePreview.conflictCodes).toEqual([]);
  });

  it("plans occurrence note fill only when the local note is empty", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({ includeNote: true }),
      existing: existingRecords(),
    });

    expect(preview.valid).toBe(true);
    expect(preview.mergePreview.actions.notes[0]).toMatchObject({
      recordType: "note",
      externalId: "note-1",
      action: "map_to_existing",
      localId: "local-occurrence",
      conflictCodes: [],
      relatedExternalIds: {
        occurrence: "occurrence-1",
      },
      metadata: {
        noteDecision: "fill_empty_occurrence_note",
        attachedToType: "occurrence",
        attachedToId: "occurrence-1",
        sensitivity: "high",
        noteRole: "user",
      },
    });
  });

  it("requires an explicit decision when an imported note differs from a local note", () => {
    const records = existingRecords();
    records.occurrences[0].note = "Keep local note.";

    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({ includeNote: true }),
      existing: records,
    });

    expect(preview.mergePreview.actions.notes[0]).toMatchObject({
      recordType: "note",
      externalId: "note-1",
      action: "conflict_requires_decision",
      localId: "local-occurrence",
      conflictCodes: ["occurrence_note_conflict"],
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

  it("skips unsupported note targets and AI-generated notes with warnings", () => {
    const unsupportedTargetPreview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        note: {
          attached_to_type: "behavior",
          attached_to_id: "behavior-brush",
          sensitivity: "restricted",
        },
      }),
    });
    const aiGeneratedPreview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        note: {
          note_role: "ai_generated",
          sensitivity: "medium",
        },
      }),
    });

    expect(unsupportedTargetPreview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_note_target" }),
        expect.objectContaining({ code: "restricted_note_present" }),
      ]),
    );
    expect(unsupportedTargetPreview.plan.notes[0]).toMatchObject({
      action: "skip",
      skipReasons: ["unsupported_note_target"],
      sensitivity: "restricted",
    });
    expect(
      unsupportedTargetPreview.mergePreview.actions.notes[0],
    ).toMatchObject({
      action: "skip_existing",
      metadata: {
        noteDecision: "skip_unsupported_note",
        attachedToType: "behavior",
      },
    });

    expect(aiGeneratedPreview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ai_generated_note_skipped" }),
      ]),
    );
    expect(aiGeneratedPreview.plan.notes[0]).toMatchObject({
      action: "skip",
      skipReasons: ["ai_generated_note"],
    });
    expect(aiGeneratedPreview.mergePreview.actions.notes[0]).toMatchObject({
      action: "skip_existing",
      metadata: {
        noteDecision: "skip_unsupported_note",
        noteRole: "ai_generated",
      },
    });
  });
});

function existingRecords() {
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
        recurrence: {
          type: "daily",
          interval: 1,
        },
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
        note: null as string | null,
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

function behaviorLogFiles(
  input: {
    behavior?: Partial<Record<string, unknown>>;
    schedule?: Partial<Record<string, unknown>>;
    occurrence?: Partial<Record<string, unknown>>;
    statusEvent?: Partial<Record<string, unknown>>;
    note?: Partial<Record<string, unknown>>;
    includeNote?: boolean;
    includeIntervention?: boolean;
  } = {},
): BehaviorLogImportFile[] {
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
      ...input.behavior,
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
      timezone: TIMEZONE,
      generated_at_utc: "2026-06-08T12:00:00Z",
      occurrence_state: "active",
      current_status: "completed",
      source: {
        original_id: "local-occurrence",
        capture_method: "system_generated",
        confidence: "high",
      },
      ...input.occurrence,
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
        original_id: "local-event",
        capture_method: "manual_tap",
        confidence: "high",
      },
      revises_event_id: null,
      reason_code: null,
      ...input.statusEvent,
    },
    note: {
      record_type: "note",
      note_id: "note-1",
      attached_to_type: "occurrence",
      attached_to_id: "occurrence-1",
      body_markdown: "Skipped before work.",
      note_role: "user",
      created_at_utc: "2026-06-08T14:10:00Z",
      updated_at_utc: null,
      sensitivity: "high",
      source: {
        original_id: "occurrence-1",
        capture_method: "manual_text",
        confidence: "high",
      },
      ...input.note,
    },
    intervention: {
      record_type: "intervention",
      intervention_id: "delivery-1",
      behavior_id: "behavior-brush",
      occurrence_id: "occurrence-1",
      intervention_type: "reminder",
      channel: "email",
      scheduled_send_at_utc: "2026-06-08T12:45:00Z",
      sent_at_utc: "2026-06-08T12:46:00Z",
      delivery_status: "sent",
      failure_reason: null,
      source: {
        original_id: "delivery-1",
        capture_method: "system_generated",
        confidence: "high",
      },
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

  if (input.includeNote) {
    contentByPath.set("data/notes.jsonl", JSON.stringify(records.note));
  }

  if (input.includeIntervention) {
    contentByPath.set(
      "data/interventions.jsonl",
      JSON.stringify(records.intervention),
    );
  }

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
      contains_notes: input.includeNote ?? false,
      contains_context: false,
      contains_raw_location: false,
      contains_health_data: false,
      contains_ai_generated_content: false,
    },
    profiles: [
      "core",
      input.includeNote ? "notes" : null,
      input.includeIntervention ? "interventions" : null,
    ].filter(Boolean),
    files: [...contentByPath.entries()].map(([path, content]) => ({
      path,
      media_type: path.endsWith(".jsonl")
        ? "application/jsonl"
        : path.endsWith(".md")
          ? "text/markdown"
          : "application/json",
      sha256: sha256(content),
      required: !path.includes("notes") && !path.includes("interventions"),
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
