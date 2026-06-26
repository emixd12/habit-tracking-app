import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  normalizeExportRangeKey,
  resolveExportBundle,
  resolveExportDateRange,
} from "../lib/resolvers/export.resolver";
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
    sortOrder: 2,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
  },
  {
    id: "category-food",
    name: "Food / Drink",
    sortOrder: 1,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
  },
];

function behavior(
  overrides: Partial<ExportBehaviorInput> & Pick<ExportBehaviorInput, "id">,
): ExportBehaviorInput {
  return {
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
  overrides: Partial<ExportOccurrenceInput> &
    Pick<ExportOccurrenceInput, "id">,
): ExportOccurrenceInput {
  return {
    behaviorId: "behavior-brush",
    behaviorScheduleSlotId: "slot-brush",
    scheduledFor: "2026-06-08T13:00:00Z",
    scheduledTimeLabel: "9:00 AM",
    scheduleKind: "exact",
    schedulePreset: null,
    scheduleStartTime: "09:00",
    scheduleEndTime: null,
    localDate: "2026-06-08",
    status: "completed",
    completedAt: "2026-06-08T13:05:00Z",
    statusMarkedAt: "2026-06-08T13:05:00Z",
    note: null,
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T13:05:00Z",
    ...overrides,
  };
}

function reminderDelivery(
  overrides: Partial<ExportReminderDeliveryInput> &
    Pick<ExportReminderDeliveryInput, "id">,
): ExportReminderDeliveryInput {
  return {
    occurrenceId: "occurrence-1",
    channel: "browser_push",
    scheduledSendAt: "2026-06-08T12:45:00Z",
    sentAt: null,
    status: "pending",
    error: null,
    processingStartedAt: null,
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T12:00:00Z",
    ...overrides,
  };
}

function resolve(overrides: {
  behaviors?: ExportBehaviorInput[];
  occurrences?: ExportOccurrenceInput[];
  statusEvents?: ExportStatusEventInput[];
  reminderDeliveries?: ExportReminderDeliveryInput[];
  range?: string | number | null;
  includeArchived?: boolean;
} = {}) {
  return resolveExportBundle({
    profile: {
      timezone: DEFAULT_TIMEZONE,
      subjectId: "subject_test",
    },
    categories,
    behaviors: overrides.behaviors ?? [behavior({ id: "behavior-brush" })],
    occurrences: overrides.occurrences ?? [occurrence({ id: "occurrence-1" })],
    statusEvents: overrides.statusEvents,
    reminderDeliveries: overrides.reminderDeliveries,
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    range: overrides.range,
    includeArchived: overrides.includeArchived,
  });
}

describe("resolveExportDateRange", () => {
  it("defaults to the last 30 local days ending today", () => {
    expect(
      resolveExportDateRange({
        now: NOW,
        timezone: DEFAULT_TIMEZONE,
      }),
    ).toEqual({
      key: "30",
      label: "30 days",
      startLocalDate: "2026-05-10",
      endLocalDate: "2026-06-08",
      summaryLabel: "2026-05-10 to 2026-06-08",
    });
  });

  it("accepts only documented export range options", () => {
    expect(normalizeExportRangeKey("7")).toBe("7");
    expect(normalizeExportRangeKey(30)).toBe("30");
    expect(normalizeExportRangeKey("90")).toBe("90");
    expect(normalizeExportRangeKey("all")).toBe("all");
    expect(normalizeExportRangeKey("14")).toBe("30");
    expect(normalizeExportRangeKey(Number.NaN)).toBe("30");
  });
});

describe("resolveExportBundle", () => {
  it("emits valid JSONL with one category, behavior, or occurrence per line", () => {
    const bundle = resolve();
    const records = bundle.jsonl.split("\n").map((line) => JSON.parse(line));

    expect(records).toHaveLength(4);
    expect(records.map((record) => record.type)).toEqual([
      "category",
      "category",
      "behavior",
      "occurrence",
    ]);
    expect(records[0]).toMatchObject({
      type: "category",
      name: "Food / Drink",
      sort_order: 1,
    });
    expect(records[2]).toMatchObject({
      type: "behavior",
      behavior_title: "Brush teeth",
      recurrence_rule: {
        frequency: "daily",
        interval: 1,
      },
      schedule_slots: [
        expect.objectContaining({
          kind: "exact",
          startTime: "22:00",
          label: "10:00 PM",
        }),
      ],
      schedules: [
        expect.objectContaining({
          recurrenceRule: {
            frequency: "daily",
            interval: 1,
          },
          timeEntries: [
            expect.objectContaining({
              kind: "exact",
              startTime: "22:00",
              label: "10:00 PM",
            }),
          ],
        }),
      ],
    });
    expect(records[3]).toMatchObject({
      type: "occurrence",
      behavior_title: "Brush teeth",
      local_date: "2026-06-08",
      scheduled_for: "2026-06-08T09:00:00-04:00",
      schedule: "9:00 AM",
      schedule_kind: "exact",
      status: "completed",
      note: null,
    });
  });

  it("escapes commas, quotes, and newlines in CSV cells", () => {
    const bundle = resolve({
      behaviors: [
        behavior({
          id: "behavior-brush",
          title: 'Brush, "teeth"',
          categoryName: "Grooming\nCare",
        }),
      ],
      occurrences: [
        occurrence({
          id: "csv-row",
          note: 'Line one\nLine "two", more',
        }),
      ],
    });

    expect(bundle.csv).toBe(
      [
        "local_date,scheduled_for,schedule,behavior_title,category,status,status_marked_at,note",
        '2026-06-08,2026-06-08T09:00:00-04:00,9:00 AM,"Brush, ""teeth""","Grooming\nCare",completed,2026-06-08T09:05:00-04:00,"Line one\nLine ""two"", more"',
      ].join("\n"),
    );
  });

  it("exports preset time range labels and snapshots", () => {
    const bundle = resolve({
      behaviors: [
        behavior({
          id: "behavior-stretch",
          title: "Stretch",
          scheduledTime: "06:00",
          scheduleSlots: [
            {
              id: "slot-morning",
              kind: "range",
              preset: "morning",
              startTime: "06:00",
              endTime: "12:00",
              sortOrder: 0,
              label: "Morning (6:00 AM-Noon)",
            },
          ],
        }),
      ],
      occurrences: [
        occurrence({
          id: "range-row",
          behaviorId: "behavior-stretch",
          scheduledFor: "2026-06-08T10:00:00Z",
          scheduledTimeLabel: "Morning (6:00 AM-Noon)",
          scheduleKind: "range",
          schedulePreset: "morning",
          scheduleStartTime: "06:00",
          scheduleEndTime: "12:00",
        }),
      ],
    });
    const occurrenceRecord = bundle.jsonBackup.occurrences[0];

    expect(occurrenceRecord).toMatchObject({
      schedule: "Morning (6:00 AM-Noon)",
      schedule_kind: "range",
      schedule_preset: "morning",
      schedule_start_time: "06:00",
      schedule_end_time: "12:00",
    });
    expect(bundle.csv).toContain(
      "Morning (6:00 AM-Noon),Stretch,Grooming,completed",
    );
  });

  it("exports multiple schedules with their own recurrence rules", () => {
    const bundle = resolve({
      behaviors: [
        behavior({
          id: "behavior-clean-aligners",
          title: "Clean Invisalign",
          scheduledTime: "08:00",
          recurrenceRule: { frequency: "daily", interval: 1 },
          schedules: [
            {
              id: "schedule-daily",
              recurrenceRule: { frequency: "daily", interval: 1 },
              recurrenceSummary: "Daily",
              recurrenceDefaults: {
                kind: "daily",
                dailyInterval: 1,
                everyDays: 2,
                weeklyInterval: 1,
                weeklyDays: ["monday"],
                monthlyInterval: 1,
                monthlyDay: 1,
              },
              timeEntries: [
                {
                  id: "slot-morning",
                  scheduleId: "schedule-daily",
                  kind: "exact",
                  preset: null,
                  startTime: "08:00",
                  endTime: null,
                  sortOrder: 0,
                  label: "8:00 AM",
                },
                {
                  id: "slot-night",
                  scheduleId: "schedule-daily",
                  kind: "exact",
                  preset: null,
                  startTime: "23:00",
                  endTime: null,
                  sortOrder: 1,
                  label: "11:00 PM",
                },
              ],
              timeSummary: "8:00 AM, 11:00 PM",
              sortOrder: 0,
            },
            {
              id: "schedule-every-two-days",
              recurrenceRule: { frequency: "interval_days", intervalDays: 2 },
              recurrenceSummary: "Every 2 days",
              recurrenceDefaults: {
                kind: "every_days",
                dailyInterval: 1,
                everyDays: 2,
                weeklyInterval: 1,
                weeklyDays: ["monday"],
                monthlyInterval: 1,
                monthlyDay: 1,
              },
              timeEntries: [
                {
                  id: "slot-overlap",
                  scheduleId: "schedule-every-two-days",
                  kind: "range",
                  preset: null,
                  startTime: "23:00",
                  endTime: "23:30",
                  sortOrder: 0,
                  label: "11:00 PM - 11:30 PM",
                },
              ],
              timeSummary: "11:00 PM - 11:30 PM",
              sortOrder: 1,
            },
          ],
          scheduleSlots: [
            {
              id: "slot-morning",
              scheduleId: "schedule-daily",
              kind: "exact",
              preset: null,
              startTime: "08:00",
              endTime: null,
              sortOrder: 0,
              label: "8:00 AM",
            },
            {
              id: "slot-night",
              scheduleId: "schedule-daily",
              kind: "exact",
              preset: null,
              startTime: "23:00",
              endTime: null,
              sortOrder: 1,
              label: "11:00 PM",
            },
            {
              id: "slot-overlap",
              scheduleId: "schedule-every-two-days",
              kind: "range",
              preset: null,
              startTime: "23:00",
              endTime: "23:30",
              sortOrder: 2,
              label: "11:00 PM - 11:30 PM",
            },
          ],
        }),
      ],
      occurrences: [
        occurrence({
          id: "aligners-night",
          behaviorId: "behavior-clean-aligners",
          behaviorScheduleSlotId: "slot-overlap",
          scheduledFor: "2026-06-09T03:00:00Z",
          scheduledTimeLabel: "11:00 PM - 11:30 PM",
          scheduleKind: "range",
          schedulePreset: null,
          scheduleStartTime: "23:00",
          scheduleEndTime: "23:30",
        }),
      ],
    });
    const jsonlRecords = bundle.jsonl.split("\n").map((line) => JSON.parse(line));
    const behaviorRecord = jsonlRecords.find(
      (record) => record.type === "behavior",
    );
    const fileByPath = new Map(
      bundle.behaviorLog.files.map((file) => [file.path, file]),
    );
    const schedules = parseJsonl(
      fileByPath.get("data/schedules.jsonl")?.content ?? "",
    );

    expect(bundle.jsonBackup.behaviors[0]?.schedules).toHaveLength(2);
    expect(behaviorRecord.schedules).toHaveLength(2);
    expect(behaviorRecord.schedules[1].recurrenceRule).toEqual({
      frequency: "interval_days",
      intervalDays: 2,
    });
    expect(schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schedule_id: "sch_slot-morning",
          recurrence: { type: "daily", interval: 1 },
          local_time: "08:00",
        }),
        expect.objectContaining({
          schedule_id: "sch_slot-overlap",
          recurrence: { type: "every_n_days", interval: 2 },
          local_time: "23:00",
          window_start_local: "23:00",
          window_end_local: "23:30",
        }),
      ]),
    );
  });

  it("includes profile timezone, categories, behaviors, occurrences, and exported_at in full JSON", () => {
    const bundle = resolve();

    expect(bundle.jsonBackup).toMatchObject({
      exported_at: "2026-06-08T12:00:00-04:00",
      profile: {
        timezone: DEFAULT_TIMEZONE,
      },
      categories: [
        {
          id: "category-food",
          name: "Food / Drink",
        },
        {
          id: "category-grooming",
          name: "Grooming",
        },
      ],
      behaviors: [
        {
          id: "behavior-brush",
          title: "Brush teeth",
        },
      ],
      occurrences: [
        {
          id: "occurrence-1",
          behavior_title: "Brush teeth",
          schedule: "9:00 AM",
          note: null,
        },
      ],
    });
    expect(JSON.parse(bundle.json)).toEqual(bundle.jsonBackup);
  });

  it("emits a BehaviorLog bundle with required files, hashes, status events, and notes", () => {
    const bundle = resolve({
      occurrences: [
        occurrence({
          id: "occurrence-1",
          note: "Flossed too.",
        }),
      ],
      statusEvents: [
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
      ],
    });
    const fileByPath = new Map(
      bundle.behaviorLog.files.map((file) => [file.path, file]),
    );
    const manifest = JSON.parse(fileByPath.get("manifest.json")?.content ?? "");
    const occurrences = parseJsonl(
      fileByPath.get("data/occurrences.jsonl")?.content ?? "",
    );
    const statusEvents = parseJsonl(
      fileByPath.get("data/status_events.jsonl")?.content ?? "",
    );
    const notes = parseJsonl(fileByPath.get("data/notes.jsonl")?.content ?? "");

    expect(bundle.behaviorLog.fileName).toBe(
      "cadence-export-30-days-2026-06-08.behaviorlog.zip",
    );
    expect(bundle.behaviorLog.files.map((file) => file.path)).toEqual([
      "manifest.json",
      "schema.json",
      "README.md",
      "AGENTS.md",
      "data/behaviors.jsonl",
      "data/schedules.jsonl",
      "data/occurrences.jsonl",
      "data/status_events.jsonl",
      "data/notes.jsonl",
      "csv/behaviors.csv",
      "csv/schedules.csv",
      "csv/occurrences.csv",
      "csv/status_events.csv",
    ]);
    expect(manifest).toMatchObject({
      format: "behaviorlog.bundle",
      schema_version: "0.1.0-draft",
      subject: {
        subject_id: "subject_test",
        timezone_default: DEFAULT_TIMEZONE,
      },
      privacy: {
        subject_id_strategy: "pseudonymous",
        contains_notes: true,
      },
      profiles: ["core", "notes"],
    });

    for (const manifestFile of manifest.files) {
      const file = fileByPath.get(manifestFile.path);

      expect(file).toBeDefined();
      expect(manifestFile.sha256).toBe(sha256(file?.content ?? ""));
    }

    expect(occurrences[0]).toMatchObject({
      record_type: "occurrence",
      occurrence_id: "occurrence-1",
      schedule_id: "sch_slot-brush",
      local_date: "2026-06-08",
      timezone: DEFAULT_TIMEZONE,
      current_status: "completed",
    });
    expect(statusEvents).toEqual([
      expect.objectContaining({
        record_type: "status_event",
        event_id: "event-1",
        occurrence_id: "occurrence-1",
        previous_status: "unresolved",
        status: "completed",
        status_semantics: "explicit_user_mark",
        recorded_at_utc: "2026-06-08T13:05:00Z",
        source: expect.objectContaining({
          capture_method: "manual_tap",
          confidence: "high",
        }),
      }),
    ]);
    expect(notes).toEqual([
      expect.objectContaining({
        record_type: "note",
        attached_to_type: "occurrence",
        attached_to_id: "occurrence-1",
        body_markdown: "Flossed too.",
      }),
    ]);
  });

  it("emits optional BehaviorLog CSV views that join back to authoritative JSONL records", () => {
    const bundle = resolve({
      statusEvents: [
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
      ],
    });
    const fileByPath = new Map(
      bundle.behaviorLog.files.map((file) => [file.path, file]),
    );
    const manifest = JSON.parse(fileByPath.get("manifest.json")?.content ?? "");
    const manifestByPath = new Map(
      manifest.files.map((file: Record<string, unknown>) => [file.path, file]),
    );

    const comparisons = [
      {
        jsonPath: "data/behaviors.jsonl",
        csvPath: "csv/behaviors.csv",
        idField: "behavior_id",
      },
      {
        jsonPath: "data/schedules.jsonl",
        csvPath: "csv/schedules.csv",
        idField: "schedule_id",
      },
      {
        jsonPath: "data/occurrences.jsonl",
        csvPath: "csv/occurrences.csv",
        idField: "occurrence_id",
      },
      {
        jsonPath: "data/status_events.jsonl",
        csvPath: "csv/status_events.csv",
        idField: "event_id",
      },
    ];

    for (const comparison of comparisons) {
      const manifestEntry = manifestByPath.get(comparison.csvPath);
      const csvFile = fileByPath.get(comparison.csvPath);
      const jsonRecords = parseJsonl(
        fileByPath.get(comparison.jsonPath)?.content ?? "",
      );
      const csvRows = parseCsv(csvFile?.content ?? "");

      expect(manifestEntry).toMatchObject({
        media_type: "text/csv",
        required: false,
        schema_ref: null,
        sha256: sha256(csvFile?.content ?? ""),
      });
      expect(csvRows).toHaveLength(jsonRecords.length);
      expect(csvRows.map((row) => row[comparison.idField])).toEqual(
        jsonRecords.map((record) => String(record[comparison.idField])),
      );
    }
  });

  it("escapes BehaviorLog CSV view cells and keeps extension data in one JSON string column", () => {
    const bundle = resolve({
      behaviors: [
        behavior({
          id: "behavior-brush",
          title: 'Brush, "teeth"\ncarefully',
          description: 'Use "soft", circular strokes\nbefore bed.',
          categoryName: "Grooming",
        }),
      ],
    });
    const behaviorsCsv =
      bundle.behaviorLog.files.find((file) => file.path === "csv/behaviors.csv")
        ?.content ?? "";
    const [row] = parseCsv(behaviorsCsv);

    expect(behaviorsCsv).toContain('"Brush, ""teeth""\ncarefully"');
    expect(row.title).toBe('Brush, "teeth"\ncarefully');
    expect(row.description).toBe('Use "soft", circular strokes\nbefore bed.');
    expect(Object.keys(row)).toContain("extensions");
    expect(Object.keys(row)).not.toContain("app.cadence");
    expect(JSON.parse(row.extensions)).toMatchObject({
      "app.cadence": {
        category_name: "Grooming",
        browser_reminder_enabled: true,
      },
    });
  });

  it("exports reminder deliveries as optional BehaviorLog intervention records", () => {
    const bundle = resolve({
      occurrences: [
        occurrence({
          id: "occurrence-1",
          behaviorId: "behavior-brush",
        }),
        occurrence({
          id: "occurrence-2",
          behaviorId: "behavior-brush",
          scheduledFor: "2026-06-08T14:00:00Z",
        }),
      ],
      reminderDeliveries: [
        reminderDelivery({
          id: "delivery-pending",
          occurrenceId: "occurrence-1",
          channel: "browser_push",
          status: "pending",
          scheduledSendAt: "2026-06-08T12:45:00Z",
        }),
        reminderDelivery({
          id: "delivery-sent",
          occurrenceId: "occurrence-1",
          channel: "email",
          status: "sent",
          scheduledSendAt: "2026-06-08T12:50:00Z",
          sentAt: "2026-06-08T12:51:00Z",
        }),
        reminderDelivery({
          id: "delivery-failed",
          occurrenceId: "occurrence-2",
          channel: "email",
          status: "failed",
          scheduledSendAt: "2026-06-08T13:40:00Z",
          error:
            "Provider rejected emma@example.com endpoint https://push.example/sub p256dh=secret-key auth=auth-key token=secret-token",
        }),
        reminderDelivery({
          id: "delivery-cancelled",
          occurrenceId: "occurrence-2",
          channel: "browser_push",
          status: "cancelled",
          scheduledSendAt: "2026-06-08T13:45:00Z",
        }),
        reminderDelivery({
          id: "delivery-outside-export",
          occurrenceId: "occurrence-not-exported",
        }),
      ],
    });
    const fileByPath = new Map(
      bundle.behaviorLog.files.map((file) => [file.path, file]),
    );
    const manifest = JSON.parse(fileByPath.get("manifest.json")?.content ?? "");
    const manifestEntry = manifest.files.find(
      (file: Record<string, unknown>) =>
        file.path === "data/interventions.jsonl",
    );
    const schema = JSON.parse(fileByPath.get("schema.json")?.content ?? "");
    const interventions = parseJsonl(
      fileByPath.get("data/interventions.jsonl")?.content ?? "",
    );
    const occurrenceIds = new Set(
      parseJsonl(fileByPath.get("data/occurrences.jsonl")?.content ?? "").map(
        (record) => record.occurrence_id,
      ),
    );
    const behaviorIds = new Set(
      parseJsonl(fileByPath.get("data/behaviors.jsonl")?.content ?? "").map(
        (record) => record.behavior_id,
      ),
    );

    expect(manifest.profiles).toEqual(["core", "interventions"]);
    expect(manifestEntry).toMatchObject({
      path: "data/interventions.jsonl",
      media_type: "application/jsonl",
      required: false,
      schema_ref: "#/$defs/Intervention",
      sha256: sha256(fileByPath.get("data/interventions.jsonl")?.content ?? ""),
    });
    expect(schema.$defs.Intervention).toMatchObject({
      required: expect.arrayContaining([
        "intervention_id",
        "occurrence_id",
        "behavior_id",
        "channel",
        "scheduled_send_at_utc",
        "delivery_status",
      ]),
    });
    expect(interventions.map((intervention) => intervention.intervention_id)).toEqual([
      "delivery-pending",
      "delivery-sent",
      "delivery-failed",
      "delivery-cancelled",
    ]);
    expect(interventions.map((intervention) => intervention.delivery_status)).toEqual([
      "pending",
      "sent",
      "failed",
      "cancelled",
    ]);
    expect(interventions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intervention_id: "delivery-sent",
          occurrence_id: "occurrence-1",
          behavior_id: "behavior-brush",
          channel: "email",
          sent_at_utc: "2026-06-08T12:51:00Z",
          failure_reason: null,
        }),
      ]),
    );

    for (const intervention of interventions) {
      expect(occurrenceIds.has(intervention.occurrence_id)).toBe(true);
      expect(behaviorIds.has(intervention.behavior_id)).toBe(true);
      expect(intervention).not.toHaveProperty("message_body");
      expect(intervention).not.toHaveProperty("endpoint");
      expect(intervention).not.toHaveProperty("p256dh");
      expect(intervention).not.toHaveProperty("auth");
    }

    const failedIntervention = interventions.find(
      (intervention) => intervention.intervention_id === "delivery-failed",
    );

    expect(failedIntervention?.failure_reason).toContain("Provider rejected");
    expect(failedIntervention?.failure_reason).not.toContain(
      "https://push.example/sub",
    );
    expect(failedIntervention?.failure_reason).not.toContain(
      "emma@example.com",
    );
    expect(failedIntervention?.failure_reason).not.toContain("secret-key");
    expect(failedIntervention?.failure_reason).not.toContain("auth-key");
    expect(failedIntervention?.failure_reason).not.toContain("secret-token");
    expect(failedIntervention?.extensions).toMatchObject({
      "app.cadence": {
        reminder_delivery_id: "delivery-failed",
      },
    });
  });

  it("keeps BehaviorLog core valid when intervention records are absent", () => {
    const bundle = resolve();
    const fileByPath = new Map(
      bundle.behaviorLog.files.map((file) => [file.path, file]),
    );
    const manifest = JSON.parse(fileByPath.get("manifest.json")?.content ?? "");

    expect(fileByPath.has("data/interventions.jsonl")).toBe(false);
    expect(manifest.profiles).toEqual(["core"]);
  });

  it("synthesizes BehaviorLog status events for resolved legacy occurrences", () => {
    const bundle = resolve({
      occurrences: [
        occurrence({
          id: "completed-without-event",
          status: "completed",
          completedAt: "2026-06-08T13:05:00Z",
          statusMarkedAt: "2026-06-08T13:05:00Z",
        }),
        occurrence({
          id: "not-completed-without-event",
          status: "not_completed",
          scheduledFor: "2026-06-08T14:00:00Z",
          completedAt: null,
          statusMarkedAt: "2026-06-08T14:05:00Z",
        }),
        occurrence({
          id: "unresolved-without-event",
          status: "unresolved",
          scheduledFor: "2026-06-08T15:00:00Z",
          completedAt: null,
          statusMarkedAt: null,
        }),
      ],
    });
    const statusEvents = parseJsonl(
      bundle.behaviorLog.files.find(
        (file) => file.path === "data/status_events.jsonl",
      )?.content ?? "",
    );

    expect(statusEvents).toHaveLength(2);
    expect(statusEvents.map((event) => event.occurrence_id)).toEqual([
      "completed-without-event",
      "not-completed-without-event",
    ]);
    expect(statusEvents).toEqual([
      expect.objectContaining({
        previous_status: "unresolved",
        status: "completed",
        status_semantics: "explicit_user_mark",
        source: expect.objectContaining({
          capture_method: "derived",
          confidence: "medium",
        }),
      }),
      expect.objectContaining({
        previous_status: "unresolved",
        status: "not_completed",
        status_semantics: "explicit_user_mark",
        source: expect.objectContaining({
          capture_method: "derived",
          confidence: "medium",
        }),
      }),
    ]);
  });

  it("calculates Markdown adherence with unresolved excluded", () => {
    const bundle = resolve({
      occurrences: [
        occurrence({ id: "completed-1", status: "completed" }),
        occurrence({
          id: "completed-2",
          status: "completed",
          scheduledFor: "2026-06-08T14:00:00Z",
        }),
        occurrence({
          id: "not-completed-1",
          status: "not_completed",
          scheduledFor: "2026-06-08T15:00:00Z",
          completedAt: null,
          statusMarkedAt: "2026-06-08T15:03:00Z",
        }),
        occurrence({
          id: "unresolved-1",
          status: "unresolved",
          scheduledFor: "2026-06-08T16:00:00Z",
          completedAt: null,
          statusMarkedAt: null,
        }),
      ],
    });

    expect(bundle.markdownSummary).toContain(
      "- Default adherence: 2 / (2 + 1) = 66.7%",
    );
    expect(bundle.markdownSummary).toContain(
      "- Brush teeth: 2 completed, 1 not completed, 1 unresolved, 66.7% adherence",
    );
    expect(bundle.overallCounts).toMatchObject({
      completedCount: 2,
      notCompletedCount: 1,
      unresolvedCount: 1,
      resolvedCount: 3,
      totalCount: 4,
    });
  });

  it("excludes archived behaviors and their occurrences by default", () => {
    const bundle = resolve({
      behaviors: [
        behavior({ id: "behavior-active", title: "Active behavior" }),
        behavior({
          id: "behavior-archived",
          title: "Archived behavior",
          active: false,
          archivedAt: "2026-06-01T12:00:00Z",
        }),
      ],
      occurrences: [
        occurrence({
          id: "active-occurrence",
          behaviorId: "behavior-active",
        }),
        occurrence({
          id: "archived-occurrence",
          behaviorId: "behavior-archived",
        }),
      ],
    });

    expect(bundle.behaviorCount).toBe(1);
    expect(bundle.occurrenceCount).toBe(1);
    expect(bundle.json).toContain("Active behavior");
    expect(bundle.json).not.toContain("Archived behavior");
  });

  it("includes archived behaviors and their occurrences when selected", () => {
    const bundle = resolve({
      includeArchived: true,
      behaviors: [
        behavior({ id: "behavior-active", title: "Active behavior" }),
        behavior({
          id: "behavior-archived",
          title: "Archived behavior",
          active: false,
          archivedAt: "2026-06-01T12:00:00Z",
        }),
      ],
      occurrences: [
        occurrence({
          id: "active-occurrence",
          behaviorId: "behavior-active",
        }),
        occurrence({
          id: "archived-occurrence",
          behaviorId: "behavior-archived",
        }),
      ],
    });

    expect(bundle.behaviorCount).toBe(2);
    expect(bundle.occurrenceCount).toBe(2);
    expect(bundle.json).toContain("Archived behavior");
  });

  it("filters occurrences by local-date range and excludes future rows", () => {
    const bundle = resolve({
      range: "7",
      occurrences: [
        occurrence({
          id: "too-old",
          localDate: "2026-05-31",
          scheduledFor: "2026-05-31T13:00:00Z",
        }),
        occurrence({
          id: "inside-range",
          localDate: "2026-06-02",
          scheduledFor: "2026-06-02T13:00:00Z",
        }),
        occurrence({
          id: "future",
          localDate: "2026-06-09",
          scheduledFor: "2026-06-09T13:00:00Z",
        }),
      ],
    });

    expect(bundle.range).toMatchObject({
      key: "7",
      startLocalDate: "2026-06-02",
      endLocalDate: "2026-06-08",
    });
    expect(bundle.jsonBackup.occurrences.map((row) => row.id)).toEqual([
      "inside-range",
    ]);
  });
});

function parseJsonl(content: string): Array<Record<string, unknown>> {
  return content
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function parseCsv(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char !== "\r" || inQuotes) {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  const [headers = [], ...dataRows] = rows;

  return dataRows
    .filter((dataRow) => dataRow.some((value) => value.length > 0))
    .map((dataRow) =>
      Object.fromEntries(
        headers.map((header, index) => [header, dataRow[index] ?? ""]),
      ),
    );
}
