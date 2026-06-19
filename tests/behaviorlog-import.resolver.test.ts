import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { resolveBehaviorLogImportPreview } from "../lib/resolvers/behaviorlog-import.resolver";
import { resolveExportBundle } from "../lib/resolvers/export.resolver";
import { previewBehaviorLogImportFromZip } from "../lib/services/behaviorlog-import.service";
import { createStoredZip } from "../lib/services/zip";
import type { BehaviorLogFile } from "../lib/types/export";
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

  return events.map((event, index) => ({
    ...event,
    ...overrides[index],
  }));
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

function bundleFiles(input: {
  occurrences?: ExportOccurrenceInput[];
  statusEvents?: ExportStatusEventInput[];
  reminderDeliveries?: ExportReminderDeliveryInput[];
} = {}): BehaviorLogFile[] {
  return resolveExportBundle({
    profile: {
      timezone: DEFAULT_TIMEZONE,
      subjectId: "subject_test",
    },
    categories,
    behaviors: [behavior()],
    occurrences: input.occurrences ?? [occurrence()],
    statusEvents: input.statusEvents ?? statusEvents(),
    reminderDeliveries: input.reminderDeliveries,
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    range: "30",
  }).behaviorLog.files;
}

describe("resolveBehaviorLogImportPreview", () => {
  it("validates and plans a dry-run from an exported BehaviorLog zip", () => {
    const zip = createStoredZip(bundleFiles());
    const preview = previewBehaviorLogImportFromZip({ zip });

    expect(preview.valid).toBe(true);
    expect(preview.summary).toMatchObject({
      schemaVersion: "0.1.0-draft",
      behaviorCount: 1,
      scheduleCount: 1,
      occurrenceCount: 1,
      statusEventCount: 2,
      noteCount: 1,
      errorCount: 0,
      conflictCount: 0,
    });
    expect(preview.plan.occurrences[0]).toMatchObject({
      externalId: "occurrence-1",
      currentStatus: "not_completed",
      localDate: "2026-06-08",
      timezone: DEFAULT_TIMEZONE,
      action: "create",
    });
    expect(preview.plan.statusEvents[1]).toMatchObject({
      externalId: "event-2",
      status: "not_completed",
      statusSemantics: "explicit_user_correction",
      sourceCaptureMethod: "manual_tap",
      sourceConfidence: "medium",
      revisesEventId: "event-1",
      reasonCode: "user_correction",
    });
    expect(preview.summary.dayGroups).toEqual([
      {
        localDate: "2026-06-08",
        timezone: DEFAULT_TIMEZONE,
        occurrenceCount: 1,
        statusEventCount: 2,
        noteCount: 1,
        conflictCount: 0,
      },
    ]);
  });

  it("reports manifest hash mismatches and actionable JSONL parse rows", () => {
    const files = replaceFileContent(
      bundleFiles(),
      "data/status_events.jsonl",
      '{"record_type":"status_event"',
      { updateManifestHash: false },
    );
    const preview = resolveBehaviorLogImportPreview({ files });

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "manifest_hash_mismatch",
          path: "data/status_events.jsonl",
        }),
        expect.objectContaining({
          code: "jsonl_parse_error",
          file: "data/status_events.jsonl",
          row: 1,
        }),
      ]),
    );
  });

  it("detects likely local conflicts without mutating the import records", () => {
    const preview = resolveBehaviorLogImportPreview({
      files: bundleFiles(),
      existing: {
        behaviors: [
          {
            id: "local-behavior",
            title: "Brush teeth",
            category: "hygiene",
          },
        ],
        occurrences: [
          {
            id: "local-occurrence",
            behaviorId: "local-behavior",
            behaviorTitle: "Brush teeth",
            scheduledForUtc: "2026-06-08T13:00:00Z",
            localDate: "2026-06-08",
            timezone: DEFAULT_TIMEZONE,
            status: "completed",
          },
        ],
        statusEvents: [
          {
            id: "local-event",
            occurrenceId: "occurrence-1",
            behaviorId: "behavior-brush",
            recordedAtUtc: "2026-06-08T13:05:00Z",
            status: "completed",
          },
        ],
      },
    });

    expect(preview.valid).toBe(true);
    expect(preview.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining([
        "likely_existing_behavior",
        "likely_existing_occurrence",
        "likely_existing_status_event",
      ]),
    );
    expect(preview.plan.behaviors[0]).toMatchObject({
      action: "skip",
      skipReasons: ["likely_existing_behavior"],
    });
    expect(preview.plan.occurrences[0].skipReasons).toEqual(
      expect.arrayContaining([
        "parent_behavior_skipped",
        "likely_existing_occurrence",
      ]),
    );
    expect(preview.plan.statusEvents[0].skipReasons).toEqual(
      expect.arrayContaining([
        "parent_occurrence_skipped",
        "likely_existing_status_event",
      ]),
    );
  });

  it("treats current_status as a snapshot instead of synthesizing history", () => {
    const files = replaceFileContent(
      bundleFiles({
        occurrences: [
          occurrence({
            status: "completed",
            completedAt: "2026-06-08T13:05:00Z",
            statusMarkedAt: "2026-06-08T13:05:00Z",
          }),
        ],
        statusEvents: [],
      }),
      "data/status_events.jsonl",
      "",
    );
    const preview = resolveBehaviorLogImportPreview({ files });

    expect(preview.valid).toBe(true);
    expect(preview.summary.statusEventCount).toBe(0);
    expect(preview.plan.occurrences[0]).toMatchObject({
      currentStatus: "completed",
      action: "create",
    });
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolved_snapshot_without_history",
          file: "data/occurrences.jsonl",
        }),
      ]),
    );
  });

  it("previews optional intervention profile records during dry-run import", () => {
    const files = bundleFiles({
      reminderDeliveries: [reminderDelivery()],
    });
    const preview = resolveBehaviorLogImportPreview({ files });
    const manifest = JSON.parse(
      files.find((file) => file.path === "manifest.json")?.content ?? "{}",
    );
    const interventionFile = files.find(
      (file) => file.path === "data/interventions.jsonl",
    );
    const interventionEntry = manifest.files.find(
      (entry: Record<string, unknown>) =>
        entry.path === "data/interventions.jsonl",
    );

    expect(interventionFile).toBeDefined();
    expect(interventionEntry).toMatchObject({
      required: false,
      sha256: sha256(interventionFile?.content ?? ""),
    });
    expect(preview.valid).toBe(true);
    expect(preview.summary).toMatchObject({
      behaviorCount: 1,
      scheduleCount: 1,
      occurrenceCount: 1,
      statusEventCount: 2,
      noteCount: 1,
      interventionCount: 1,
      interventionPreviewOnlyCount: 1,
      interventionStoredCount: 1,
      interventionSensitiveFieldDropCount: 0,
      interventionRedactedFieldCount: 0,
      errorCount: 0,
    });
    expect(preview.plan.interventions[0]).toMatchObject({
      action: "preview_only",
      previewOnly: true,
      externalId: "delivery-1",
      behaviorExternalId: "behavior-brush",
      occurrenceExternalId: "occurrence-1",
      channel: "email",
      deliveryStatus: "sent",
    });
  });

  it("rejects unsupported top-level fields in core records", () => {
    const files = replaceJsonlRecords(
      bundleFiles(),
      "data/behaviors.jsonl",
      (records) =>
        records.map((record) => ({
          ...record,
          unknown_top_level_field: true,
        })),
    );
    const preview = resolveBehaviorLogImportPreview({ files });

    expect(preview.valid).toBe(false);
    expect(preview.summary.unsupportedFieldCount).toBe(1);
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_top_level_field",
          file: "data/behaviors.jsonl",
          row: 1,
        }),
      ]),
    );
    expect(preview.unsupportedFields).toEqual([
      expect.objectContaining({
        file: "data/behaviors.jsonl",
        row: 1,
        fields: ["unknown_top_level_field"],
      }),
    ]);
  });
});

function replaceJsonlRecords(
  files: BehaviorLogFile[],
  path: string,
  update: (records: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
): BehaviorLogFile[] {
  const file = files.find((entry) => entry.path === path);
  const records = parseJsonl(file?.content ?? "");

  return replaceFileContent(
    files,
    path,
    update(records)
      .map((record) => JSON.stringify(record))
      .join("\n"),
  );
}

function replaceFileContent(
  files: BehaviorLogFile[],
  path: string,
  content: string,
  options: { updateManifestHash?: boolean } = {},
): BehaviorLogFile[] {
  const cloned = files.map((file) => ({ ...file }));
  const target = cloned.find((file) => file.path === path);

  if (!target) {
    throw new Error(`Missing fixture file ${path}.`);
  }

  target.content = content;

  if (options.updateManifestHash === false) {
    return cloned;
  }

  const manifestFile = cloned.find((file) => file.path === "manifest.json");

  if (!manifestFile) {
    throw new Error("Missing fixture manifest.");
  }

  const manifest = JSON.parse(manifestFile.content);
  manifest.files = manifest.files.map((entry: Record<string, unknown>) =>
    entry.path === path ? { ...entry, sha256: sha256(content) } : entry,
  );
  manifestFile.content = JSON.stringify(manifest, null, 2);

  return cloned;
}

function parseJsonl(content: string): Array<Record<string, unknown>> {
  return content
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
