import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { resolveBehaviorLogImportPreview } from "../lib/resolvers/behaviorlog-import.resolver";
import { resolveBehaviorLogRestorePreview } from "../lib/resolvers/behaviorlog-restore.resolver";
import { resolveExportBundle } from "../lib/resolvers/export.resolver";
import type {
  BehaviorLogExistingRecords,
  BehaviorLogImportFile,
} from "../lib/types/behaviorlog-import";
import type {
  ExportBehaviorInput,
  ExportCategoryInput,
  ExportOccurrenceInput,
  ExportReminderDeliveryInput,
  ExportStatusEventInput,
} from "../lib/types/export";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

const NOW = Temporal.Instant.from("2026-06-08T16:00:00Z");

const categories: ExportCategoryInput[] = [
  {
    id: "category-grooming",
    name: "Grooming",
    sortOrder: 1,
  },
];

describe("resolveBehaviorLogRestorePreview", () => {
  it("classifies restore actions separately from merge preview decisions", () => {
    const importPreview = resolveBehaviorLogImportPreview({
      files: bundleFiles(),
    });
    const preview = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords(),
    });

    expect(preview.valid).toBe(true);
    expect(preview.mode).toBe("restore_preview");
    expect(preview.semantics).toMatchObject({
      jsonlAuthoritative: true,
      csvIgnoredForRestore: true,
      statusEventsAuthoritative: true,
      currentStatusIsSnapshotOnly: true,
      unresolvedIsFailure: false,
      behaviorLogIsNotAccountImage: true,
      providerSideEffects: false,
      reminderDeliverySideEffects: false,
    });
    expect(preview.nonRestorableFields.map((field) => field.field)).toEqual(
      expect.arrayContaining([
        "auth_identity",
        "profile_email",
        "browser_permissions",
        "push_subscriptions",
        "provider_accounts",
        "external_provider_state",
      ]),
    );
    expect(preview.actions.behaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "behavior",
          externalId: "behavior-brush",
          localId: "behavior-brush",
          action: "replace",
          destructive: true,
        }),
        expect.objectContaining({
          recordType: "behavior",
          externalId: null,
          localId: "behavior-local-extra",
          action: "archive",
          destructive: true,
        }),
      ]),
    );
    expect(preview.actions.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "occurrence",
          externalId: "occurrence-1",
          action: "replace",
          destructive: true,
          metadata: expect.objectContaining({
            currentStatus: "not_completed",
            currentStatusIsSnapshotOnly: true,
          }),
        }),
      ]),
    );
    expect(preview.actions.statusEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "status_event",
          externalId: "event-2",
          action: "create",
          destructive: false,
        }),
        expect.objectContaining({
          recordType: "status_event",
          externalId: null,
          localId: "event-local-extra",
          action: "keep",
          destructive: false,
        }),
      ]),
    );
    expect(preview.actions.inlineOccurrenceNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "inline_occurrence_note",
          externalId: "note_occurrence-1",
          localId: "occurrence-1",
          action: "replace",
          destructive: true,
        }),
      ]),
    );
    expect(preview.actions.importedInterventions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "intervention",
          externalId: "delivery-1",
          action: "create",
          destructive: false,
        }),
        expect.objectContaining({
          recordType: "intervention",
          externalId: "intervention-local-extra",
          action: "delete",
          destructive: true,
        }),
      ]),
    );
    expect(preview.summary).toMatchObject({
      destructiveActionCount: expect.any(Number),
      replacedCount: expect.any(Number),
      archivedCount: 1,
      deletedCount: expect.any(Number),
      createdCount: expect.any(Number),
    });
    expect(preview.summary.destructiveActionCount).toBeGreaterThan(0);
  });

  it("preserves unresolved as unresolved in restore snapshot planning", () => {
    const importPreview = resolveBehaviorLogImportPreview({
      files: bundleFiles({
        occurrences: [
          occurrence({
            status: "unresolved",
            completedAt: null,
            statusMarkedAt: null,
            note: null,
          }),
        ],
        statusEvents: [],
      }),
    });
    const preview = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords({
        occurrences: [
          {
            ...existingOccurrence(),
            status: "completed",
            note: null,
          },
        ],
        statusEvents: [],
      }),
    });

    expect(preview.actions.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: "occurrence-1",
          action: "replace",
          metadata: expect.objectContaining({
            currentStatus: "unresolved",
            currentStatusIsSnapshotOnly: true,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(preview.actions.occurrences)).not.toContain(
      "not_completed",
    );
  });

  it("plans append-only status history preservation by default and previews replacement as future policy", () => {
    const importPreview = resolveBehaviorLogImportPreview({
      files: bundleFiles(),
    });
    const preservePreview = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords(),
    });
    const replacePreview = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords(),
      statusHistoryPolicy: "replace_status_history",
    });

    expect(preservePreview.statusHistoryPolicy).toMatchObject({
      selected: "preserve_append_only_history",
      default: "preserve_append_only_history",
      applySupportedInThisTicket: true,
    });
    expect(preservePreview.actions.statusEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localId: "event-local-extra",
          action: "keep",
          destructive: false,
        }),
      ]),
    );
    expect(replacePreview.statusHistoryPolicy.selected).toBe(
      "replace_status_history",
    );
    expect(replacePreview.statusHistoryPolicy.applySupportedInThisTicket).toBe(
      false,
    );
    expect(replacePreview.actions.statusEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localId: "event-local-extra",
          action: "delete",
          destructive: true,
        }),
      ]),
    );
    expect(replacePreview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "status_history_replacement_preview_only",
        }),
      ]),
    );
  });

  it("surfaces high sensitivity notes and redacted intervention fields", () => {
    const files = updateInterventionSensitiveFields(
      updateNoteSensitivity(bundleFiles(), "high"),
    );
    const importPreview = resolveBehaviorLogImportPreview({ files });
    const preview = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords(),
    });

    expect(preview.valid).toBe(true);
    expect(preview.sensitivity).toMatchObject({
      highOrRestrictedNotesPresent: true,
      redactedInterventionFieldsPresent: true,
    });
    expect(preview.sensitivity.noteSensitivities).toContain("high");
    expect(preview.summary.highOrRestrictedNoteCount).toBeGreaterThan(0);
    expect(preview.summary.redactedInterventionFieldCount).toBeGreaterThan(0);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "high_sensitivity_note_present",
        }),
        expect.objectContaining({
          code: "intervention_sensitive_payload_present",
        }),
      ]),
    );
  });

  it("keeps preview fingerprints stable and changes them when local data changes", () => {
    const importPreview = resolveBehaviorLogImportPreview({
      files: bundleFiles(),
    });
    const first = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords(),
    });
    const second = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords(),
    });
    const changed = resolveBehaviorLogRestorePreview({
      importPreview,
      existing: existingRecords({
        behaviors: [
          {
            ...existingBehavior(),
            title: "Changed local title",
          },
        ],
      }),
    });

    expect(first.previewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.previewFingerprint).toBe(second.previewFingerprint);
    expect(first.localDataFingerprint).toBe(second.localDataFingerprint);
    expect(first.previewFingerprint).not.toBe(changed.previewFingerprint);
    expect(first.localDataFingerprint).not.toBe(changed.localDataFingerprint);
  });
});

function behavior(
  overrides: Partial<ExportBehaviorInput> = {},
): ExportBehaviorInput {
  return {
    id: "behavior-brush",
    categoryId: "category-grooming",
    categoryName: "Grooming",
    title: "Brush teeth",
    description: "Night brushing",
    recurrenceRule: {
      frequency: "daily",
      interval: 1,
    },
    scheduledTime: "22:00",
    scheduleSlots: [
      {
        id: "slot-brush",
        kind: "exact",
        preset: null,
        startTime: "22:00",
        endTime: null,
        sortOrder: 0,
        label: "10:00 PM",
      },
    ],
    timezone: DEFAULT_TIMEZONE,
    browserReminderEnabled: true,
    emailReminderEnabled: false,
    reminderOffsetMinutes: 0,
    active: true,
    archivedAt: null,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
    ...overrides,
  };
}

function occurrence(
  overrides: Partial<ExportOccurrenceInput> = {},
): ExportOccurrenceInput {
  return {
    id: "occurrence-1",
    behaviorId: "behavior-brush",
    behaviorScheduleSlotId: "slot-brush",
    scheduledFor: "2026-06-08T13:00:00Z",
    scheduledTimeLabel: "9:00 AM",
    scheduleKind: "exact",
    schedulePreset: null,
    scheduleStartTime: "09:00",
    scheduleEndTime: null,
    localDate: "2026-06-08",
    status: "not_completed",
    completedAt: null,
    statusMarkedAt: "2026-06-08T14:10:00Z",
    note: "Skipped before work.",
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T14:10:00Z",
    ...overrides,
  };
}

function statusEvents(
  overrides: Partial<ExportStatusEventInput>[] = [],
): ExportStatusEventInput[] {
  const events: ExportStatusEventInput[] = [
    {
      id: "event-1",
      occurrenceId: "occurrence-1",
      behaviorId: "behavior-brush",
      previousStatus: "unresolved",
      status: "completed",
      statusSemantics: "explicit_user_mark",
      recordedAt: "2026-06-08T13:05:00Z",
      effectiveAt: "2026-06-08T13:05:00Z",
      localDate: "2026-06-08",
      timezone: DEFAULT_TIMEZONE,
      sourceCaptureMethod: "manual_tap",
      sourceConfidence: "high",
      revisesEventId: null,
      reasonCode: null,
    },
    {
      id: "event-2",
      occurrenceId: "occurrence-1",
      behaviorId: "behavior-brush",
      previousStatus: "completed",
      status: "not_completed",
      statusSemantics: "explicit_user_correction",
      recordedAt: "2026-06-08T14:10:00Z",
      effectiveAt: "2026-06-08T14:10:00Z",
      localDate: "2026-06-08",
      timezone: DEFAULT_TIMEZONE,
      sourceCaptureMethod: "manual_tap",
      sourceConfidence: "medium",
      revisesEventId: "event-1",
      reasonCode: "user_correction",
    },
  ];

  return events.map(
    (event, index): ExportStatusEventInput => ({
      ...event,
      ...overrides[index],
    }),
  );
}

function reminderDelivery(
  overrides: Partial<ExportReminderDeliveryInput> = {},
): ExportReminderDeliveryInput {
  return {
    id: "delivery-1",
    occurrenceId: "occurrence-1",
    channel: "email",
    scheduledSendAt: "2026-06-08T12:45:00Z",
    sentAt: "2026-06-08T12:46:00Z",
    status: "sent",
    error: null,
    processingStartedAt: "2026-06-08T12:45:01Z",
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T12:46:00Z",
    ...overrides,
  };
}

function bundleFiles(
  input: {
    occurrences?: ExportOccurrenceInput[];
    statusEvents?: ExportStatusEventInput[];
    reminderDeliveries?: ExportReminderDeliveryInput[];
  } = {},
): BehaviorLogImportFile[] {
  return resolveExportBundle({
    profile: {
      timezone: DEFAULT_TIMEZONE,
      subjectId: "subject_test",
    },
    categories,
    behaviors: [behavior()],
    occurrences: input.occurrences ?? [occurrence()],
    statusEvents: input.statusEvents ?? statusEvents(),
    reminderDeliveries: input.reminderDeliveries ?? [reminderDelivery()],
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    range: "30",
    includeNotes: true,
  }).behaviorLog.files;
}

function existingRecords(
  overrides: Partial<BehaviorLogExistingRecords> = {},
): BehaviorLogExistingRecords {
  return {
    behaviors: [
      existingBehavior(),
      {
        id: "behavior-local-extra",
        title: "Local extra",
        category: "other",
        active: true,
        archivedAt: null,
        sourceOriginalId: "behavior-local-extra",
      },
    ],
    schedules: [
      {
        id: "slot-brush",
        behaviorId: "behavior-brush",
        recurrenceProfile: "behaviorlog.calendar_simple.v1",
        recurrence: { type: "daily", interval: 1 },
        timezone: DEFAULT_TIMEZONE,
        localTime: "22:00",
        windowStartLocal: null,
        windowEndLocal: null,
        cadenceScheduleKind: "exact",
        cadenceSchedulePreset: null,
        activeFromLocalDate: "2026-05-01",
        activeUntilLocalDate: null,
        sourceOriginalId: "slot-brush",
      },
    ],
    occurrences: [existingOccurrence()],
    statusEvents: [
      {
        id: "event-1",
        occurrenceId: "occurrence-1",
        behaviorId: "behavior-brush",
        recordedAtUtc: "2026-06-08T13:05:00Z",
        status: "completed",
        statusSemantics: "explicit_user_mark",
        sourceCaptureMethod: "manual_tap",
        sourceConfidence: "high",
        revisesEventId: null,
        sourceOriginalId: "event-1",
      },
      {
        id: "event-local-extra",
        occurrenceId: "occurrence-1",
        behaviorId: "behavior-brush",
        recordedAtUtc: "2026-06-08T13:20:00Z",
        status: "completed",
        statusSemantics: "explicit_user_correction",
        sourceCaptureMethod: "manual_tap",
        sourceConfidence: "high",
        revisesEventId: "event-1",
        sourceOriginalId: "event-local-extra",
      },
    ],
    importedNotes: [],
    importedInterventions: [
      {
        id: "intervention-local-extra",
        importRunId: "run-local",
        externalId: "intervention-local-extra",
        behaviorExternalId: "behavior-local-extra",
        occurrenceExternalId: "occurrence-local-extra",
        behaviorId: "behavior-local-extra",
        occurrenceId: null,
        interventionType: "reminder",
        channel: "email",
        deliveryStatus: "sent",
        scheduledSendAtUtc: "2026-06-01T12:00:00Z",
        sentAtUtc: "2026-06-01T12:01:00Z",
        failureReason: null,
        sourceOriginalId: "intervention-local-extra",
        sourceCaptureMethod: "imported",
        sourceConfidence: "high",
      },
    ],
    mappings: [],
    ...overrides,
  };
}

function existingBehavior() {
  return {
    id: "behavior-brush",
    title: "Brush teeth local rename",
    category: "hygiene",
    active: true,
    archivedAt: null,
    sourceOriginalId: "behavior-brush",
  };
}

function existingOccurrence() {
  return {
    id: "occurrence-1",
    behaviorId: "behavior-brush",
    scheduleId: "slot-brush",
    behaviorTitle: "Brush teeth",
    scheduledForUtc: "2026-06-08T13:00:00Z",
    localDate: "2026-06-08",
    timezone: DEFAULT_TIMEZONE,
    status: "completed" as const,
    note: "Local note",
    sourceOriginalId: "occurrence-1",
  };
}

function updateNoteSensitivity(
  files: BehaviorLogImportFile[],
  sensitivity: "high" | "restricted",
): BehaviorLogImportFile[] {
  return updateJsonlFile(files, "data/notes.jsonl", (record) => ({
    ...record,
    sensitivity,
  }));
}

function updateInterventionSensitiveFields(
  files: BehaviorLogImportFile[],
): BehaviorLogImportFile[] {
  return updateJsonlFile(files, "data/interventions.jsonl", (record) => ({
    ...record,
    message_body: "Reminder body",
    endpoint: "https://push.example.test/subscription",
  }));
}

function updateJsonlFile(
  files: BehaviorLogImportFile[],
  path: string,
  update: (record: Record<string, unknown>) => Record<string, unknown>,
): BehaviorLogImportFile[] {
  const next = files.map((file) =>
    file.path === path
      ? {
          ...file,
          content: file.content
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.stringify(update(JSON.parse(line))))
            .join("\n"),
        }
      : file,
  );

  return updateManifestHash(next, path);
}

function updateManifestHash(
  files: BehaviorLogImportFile[],
  path: string,
): BehaviorLogImportFile[] {
  const changedFile = files.find((file) => file.path === path);

  if (!changedFile) {
    return files;
  }

  return files.map((file) => {
    if (file.path !== "manifest.json") {
      return file;
    }

    const manifest = JSON.parse(file.content);
    manifest.files = manifest.files.map((entry: Record<string, unknown>) =>
      entry.path === path
        ? {
            ...entry,
            sha256: createHash("sha256")
              .update(changedFile.content)
              .digest("hex"),
          }
        : entry,
    );

    return {
      ...file,
      content: JSON.stringify(manifest, null, 2),
    };
  });
}
