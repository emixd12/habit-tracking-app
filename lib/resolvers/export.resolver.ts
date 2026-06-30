import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";

import type {
  BehaviorLogBundle,
  BehaviorLogFile,
  ExportBehaviorInput,
  ExportBundle,
  ExportCategoryInput,
  ExportDateRange,
  ExportJsonBackup,
  ExportJsonBehavior,
  ExportJsonCategory,
  ExportJsonOccurrence,
  ExportOccurrenceInput,
  ExportProfileInput,
  ExportRangeKey,
  ExportRangeOption,
  ExportReminderDeliveryInput,
  ExportStatusCounts,
  ExportStatusEventInput,
} from "@/lib/types/export";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

const BEHAVIORLOG_SCHEMA_VERSION = "0.1.0-draft";
const BEHAVIORLOG_FORMAT = "behaviorlog.bundle";
const BEHAVIORLOG_EXTENSION_NAMESPACE = "app.cadence";
const BEHAVIORLOG_GENERATION_RULE_ID = "rule_recurrence_calendar_simple_v1";
const BEHAVIORLOG_BEHAVIOR_CSV_COLUMNS = [
  "record_type",
  "behavior_id",
  "title",
  "description",
  "category",
  "success_definition",
  "expected_duration_minutes",
  "created_at_utc",
  "archived_at_utc",
  "source",
  "sensitivity",
  "extensions",
] as const;
const BEHAVIORLOG_SCHEDULE_CSV_COLUMNS = [
  "record_type",
  "schedule_id",
  "behavior_id",
  "recurrence_profile",
  "recurrence",
  "timezone",
  "local_time",
  "window_start_local",
  "window_end_local",
  "active_from_local_date",
  "active_until_local_date",
  "source",
  "extensions",
] as const;
const BEHAVIORLOG_OCCURRENCE_CSV_COLUMNS = [
  "record_type",
  "occurrence_id",
  "behavior_id",
  "schedule_id",
  "scheduled_for_utc",
  "local_date",
  "local_time",
  "timezone",
  "utc_offset_at_event",
  "due_window_start_utc",
  "due_window_end_utc",
  "generated_at_utc",
  "generation_rule_id",
  "occurrence_state",
  "current_status",
  "source",
  "extensions",
] as const;
const BEHAVIORLOG_STATUS_EVENT_CSV_COLUMNS = [
  "record_type",
  "event_id",
  "occurrence_id",
  "behavior_id",
  "previous_status",
  "status",
  "status_semantics",
  "recorded_at_utc",
  "effective_at_utc",
  "local_date",
  "timezone",
  "utc_offset_at_event",
  "actor",
  "source",
  "note_id",
  "revises_event_id",
  "reason_code",
  "extensions",
] as const;

export const EXPORT_RANGE_OPTIONS: ExportRangeOption[] = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All time" },
];
export const EXPORT_DEFAULT_RANGE_KEY: ExportRangeKey = "30";

const CSV_COLUMNS = [
  "local_date",
  "scheduled_for",
  "schedule",
  "behavior_title",
  "category",
  "status",
  "status_marked_at",
  "note",
] as const;

export type ResolveExportInput = {
  profile: ExportProfileInput;
  categories: ExportCategoryInput[];
  behaviors: ExportBehaviorInput[];
  occurrences: ExportOccurrenceInput[];
  statusEvents?: ExportStatusEventInput[];
  reminderDeliveries?: ExportReminderDeliveryInput[];
  now: Temporal.Instant;
  timezone?: string;
  range?: string | number | null;
  includeArchived?: boolean;
  includeNotes?: boolean;
};

export function resolveExportBundle(input: ResolveExportInput): ExportBundle {
  const timezone = input.timezone || input.profile.timezone || DEFAULT_TIMEZONE;
  const includeArchived = input.includeArchived ?? false;
  const includeNotes = input.includeNotes ?? false;
  const range = resolveExportDateRange({
    now: input.now,
    timezone,
    range: input.range,
  });
  const exportedAt = formatInstantInTimezone(input.now, timezone);
  const categories = toJsonCategories(input.categories);
  const includedBehaviors = input.behaviors
    .filter((behavior) => includeArchived || behavior.active)
    .sort(compareBehaviors);
  const behaviorById = new Map(
    includedBehaviors.map((behavior) => [behavior.id, behavior]),
  );
  const behaviors = includedBehaviors.map(toJsonBehavior);
  const occurrences = input.occurrences
    .filter((occurrence) => behaviorById.has(occurrence.behaviorId))
    .filter((occurrence) => isOccurrenceWithinRange(occurrence, range))
    .sort((left, right) => compareOccurrences(left, right, behaviorById))
    .map((occurrence) =>
      toJsonOccurrence({
        occurrence,
        behaviorById,
        includeNotes,
      }),
    );
  const overallCounts = countOccurrences(occurrences);
  const fileBaseName = [
    "cadence-export",
    range.key === "all" ? "all-time" : `${range.key}-days`,
    range.endLocalDate,
    includeArchived ? "with-archived" : null,
  ]
    .filter(Boolean)
    .join("-");
  const jsonBackup = toJsonBackup({
    exportedAt,
    profile: input.profile,
    categories,
    behaviors,
    occurrences,
  });
  const behaviorLog = toBehaviorLogBundle({
    exportedAtInstant: input.now,
    fileBaseName,
    profile: input.profile,
    behaviors,
    occurrences,
    statusEvents: input.statusEvents ?? [],
    reminderDeliveries: input.reminderDeliveries ?? [],
  });

  return {
    timezone,
    exportedAt,
    includeArchived,
    includeNotes,
    range,
    rangeOptions: [...EXPORT_RANGE_OPTIONS],
    categoryCount: categories.length,
    behaviorCount: behaviors.length,
    occurrenceCount: occurrences.length,
    overallCounts,
    overallAdherenceLabel: formatAdherenceValue(overallCounts),
    jsonl: toJsonl({ categories, behaviors, occurrences }),
    csv: toCsv(occurrences),
    jsonBackup,
    json: JSON.stringify(jsonBackup, null, 2),
    markdownSummary: toMarkdownSummary({
      range,
      counts: overallCounts,
      behaviors,
      occurrences,
      includeArchived,
      includeNotes,
    }),
    fileBaseName,
    markdownFileName: `${fileBaseName}-summary.md`,
    behaviorLog,
  };
}

export function resolveExportDateRange(input: {
  now: Temporal.Instant;
  timezone?: string;
  range?: string | number | null;
}): ExportDateRange {
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const key = normalizeExportRangeKey(input.range);
  const endDate = input.now.toZonedDateTimeISO(timezone).toPlainDate();

  if (key === "all") {
    return {
      key,
      label: "All time",
      startLocalDate: null,
      endLocalDate: endDate.toString(),
      summaryLabel: `all time through ${endDate.toString()}`,
    };
  }

  const rangeDays = Number(key);
  const startDate = endDate.subtract({ days: rangeDays - 1 });

  return {
    key,
    label: `${rangeDays} days`,
    startLocalDate: startDate.toString(),
    endLocalDate: endDate.toString(),
    summaryLabel: `${startDate.toString()} to ${endDate.toString()}`,
  };
}

export function normalizeExportRangeKey(
  value: string | number | null | undefined,
): ExportRangeKey {
  const rawValue =
    typeof value === "number" ? String(Math.trunc(value)) : value?.trim();

  if (rawValue === "7" || rawValue === "30" || rawValue === "90") {
    return rawValue;
  }

  if (rawValue === "all" || rawValue === "all_time") {
    return "all";
  }

  return EXPORT_DEFAULT_RANGE_KEY;
}

function toJsonCategories(
  categories: ExportCategoryInput[],
): ExportJsonCategory[] {
  return [...categories]
    .sort((left, right) => {
      const sortOrderComparison = left.sortOrder - right.sortOrder;

      if (sortOrderComparison !== 0) {
        return sortOrderComparison;
      }

      return left.name.localeCompare(right.name);
    })
    .map((category) => ({
      id: category.id,
      name: category.name,
      sort_order: category.sortOrder,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    }));
}

function toJsonBehavior(behavior: ExportBehaviorInput): ExportJsonBehavior {
  return {
    id: behavior.id,
    category_id: behavior.categoryId,
    category: behavior.categoryName,
    title: behavior.title,
    description: behavior.description,
    recurrence_rule: behavior.recurrenceRule,
    scheduled_time: behavior.scheduledTime,
    schedules: normalizeExportInputSchedules(behavior),
    schedule_slots: behavior.scheduleSlots,
    timezone: behavior.timezone,
    browser_reminder_enabled: behavior.browserReminderEnabled,
    email_reminder_enabled: behavior.emailReminderEnabled,
    reminder_offset_minutes: behavior.reminderOffsetMinutes,
    active: behavior.active,
    archived_at: behavior.archivedAt,
    created_at: behavior.createdAt,
    updated_at: behavior.updatedAt,
  };
}

function toJsonOccurrence(input: {
  occurrence: ExportOccurrenceInput;
  behaviorById: Map<string, ExportBehaviorInput>;
  includeNotes: boolean;
}): ExportJsonOccurrence {
  const { occurrence, behaviorById, includeNotes } = input;
  const behavior = behaviorById.get(occurrence.behaviorId);
  const timezone = behavior?.timezone || DEFAULT_TIMEZONE;

  return {
    id: occurrence.id,
    behavior_id: occurrence.behaviorId,
    behavior_schedule_slot_id: occurrence.behaviorScheduleSlotId,
    behavior_title: behavior?.title ?? "Unknown behavior",
    category: behavior?.categoryName ?? null,
    scheduled_for: formatInstantInTimezone(occurrence.scheduledFor, timezone),
    schedule: occurrence.scheduledTimeLabel,
    schedule_kind: occurrence.scheduleKind,
    schedule_preset: occurrence.schedulePreset,
    schedule_start_time: occurrence.scheduleStartTime,
    schedule_end_time: occurrence.scheduleEndTime,
    local_date: occurrence.localDate,
    timezone,
    status: occurrence.status,
    completed_at: formatOptionalInstantInTimezone(
      occurrence.completedAt,
      timezone,
    ),
    status_marked_at: formatOptionalInstantInTimezone(
      occurrence.statusMarkedAt,
      timezone,
    ),
    note: includeNotes ? occurrence.note : null,
    created_at: occurrence.createdAt,
    updated_at: occurrence.updatedAt,
  };
}

function toJsonBackup(input: {
  exportedAt: string;
  profile: ExportProfileInput;
  categories: ExportJsonCategory[];
  behaviors: ExportJsonBehavior[];
  occurrences: ExportJsonOccurrence[];
}): ExportJsonBackup {
  return {
    exported_at: input.exportedAt,
    profile: {
      timezone: input.profile.timezone,
    },
    categories: input.categories,
    behaviors: input.behaviors,
    occurrences: input.occurrences,
  };
}

function toJsonl(input: {
  categories: ExportJsonCategory[];
  behaviors: ExportJsonBehavior[];
  occurrences: ExportJsonOccurrence[];
}): string {
  const lines = [
    ...input.categories.map((category) =>
      JSON.stringify({
        type: "category",
        id: category.id,
        name: category.name,
        sort_order: category.sort_order,
      }),
    ),
    ...input.behaviors.map((behavior) =>
      JSON.stringify({
        type: "behavior",
        id: behavior.id,
        behavior_title: behavior.title,
        category: behavior.category,
        description: behavior.description,
        recurrence_rule: behavior.recurrence_rule,
        scheduled_time: behavior.scheduled_time,
        schedules: behavior.schedules,
        schedule_slots: behavior.schedule_slots,
        timezone: behavior.timezone,
        browser_reminder_enabled: behavior.browser_reminder_enabled,
        email_reminder_enabled: behavior.email_reminder_enabled,
        reminder_offset_minutes: behavior.reminder_offset_minutes,
        active: behavior.active,
        archived_at: behavior.archived_at,
      }),
    ),
    ...input.occurrences.map((occurrence) =>
      JSON.stringify({
        type: "occurrence",
        id: occurrence.id,
        behavior_id: occurrence.behavior_id,
        behavior_schedule_slot_id: occurrence.behavior_schedule_slot_id,
        local_date: occurrence.local_date,
        scheduled_for: occurrence.scheduled_for,
        schedule: occurrence.schedule,
        schedule_kind: occurrence.schedule_kind,
        schedule_preset: occurrence.schedule_preset,
        schedule_start_time: occurrence.schedule_start_time,
        schedule_end_time: occurrence.schedule_end_time,
        behavior_title: occurrence.behavior_title,
        category: occurrence.category,
        status: occurrence.status,
        status_marked_at: occurrence.status_marked_at,
        note: occurrence.note,
      }),
    ),
  ];

  return lines.join("\n");
}

function toCsv(occurrences: ExportJsonOccurrence[]): string {
  const rows = [
    CSV_COLUMNS.join(","),
    ...occurrences.map((occurrence) =>
      [
        occurrence.local_date,
        occurrence.scheduled_for,
        occurrence.schedule,
        occurrence.behavior_title,
        occurrence.category ?? "",
        occurrence.status,
        occurrence.status_marked_at ?? "",
        occurrence.note ?? "",
      ]
        .map(escapeCsvCell)
        .join(","),
    ),
  ];

  return rows.join("\n");
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function toBehaviorLogBundle(input: {
  exportedAtInstant: Temporal.Instant;
  fileBaseName: string;
  profile: ExportProfileInput;
  behaviors: ExportJsonBehavior[];
  occurrences: ExportJsonOccurrence[];
  statusEvents: ExportStatusEventInput[];
  reminderDeliveries: ExportReminderDeliveryInput[];
}): BehaviorLogBundle {
  const schemaContent = JSON.stringify(createBehaviorLogSchema(), null, 2);
  const readmeContent = createBehaviorLogReadme();
  const agentsContent = createBehaviorLogAgentsMd();
  const behaviorRecords = input.behaviors.map((behavior) =>
    toBehaviorLogBehavior(behavior, input.profile),
  );
  const schedules = toBehaviorLogSchedules(input.behaviors, input.occurrences);
  const occurrenceRecords = input.occurrences.map((occurrence) =>
    toBehaviorLogOccurrence(occurrence, schedules.scheduleIdByOccurrenceId),
  );
  const statusEventRecords = toBehaviorLogStatusEvents({
    statusEvents: input.statusEvents,
    occurrences: input.occurrences,
    behaviors: input.behaviors,
  });
  const interventionRecords = toBehaviorLogInterventions({
    reminderDeliveries: input.reminderDeliveries,
    occurrences: input.occurrences,
  });
  const noteRecords = toBehaviorLogNotes(input.occurrences);
  const filesWithoutManifest: BehaviorLogFile[] = [
    {
      path: "schema.json",
      mediaType: "application/json",
      content: schemaContent,
    },
    {
      path: "README.md",
      mediaType: "text/markdown",
      content: readmeContent,
    },
    {
      path: "AGENTS.md",
      mediaType: "text/markdown",
      content: agentsContent,
    },
    {
      path: "data/behaviors.jsonl",
      mediaType: "application/jsonl",
      content: toJsonlRecords(behaviorRecords),
    },
    {
      path: "data/schedules.jsonl",
      mediaType: "application/jsonl",
      content: toJsonlRecords(schedules.records),
    },
    {
      path: "data/occurrences.jsonl",
      mediaType: "application/jsonl",
      content: toJsonlRecords(occurrenceRecords),
    },
    {
      path: "data/status_events.jsonl",
      mediaType: "application/jsonl",
      content: toJsonlRecords(statusEventRecords),
    },
  ];

  if (noteRecords.length > 0) {
    filesWithoutManifest.push({
      path: "data/notes.jsonl",
      mediaType: "application/jsonl",
      content: toJsonlRecords(noteRecords),
    });
  }

  if (interventionRecords.length > 0) {
    filesWithoutManifest.push({
      path: "data/interventions.jsonl",
      mediaType: "application/jsonl",
      content: toJsonlRecords(interventionRecords),
    });
  }

  filesWithoutManifest.push(
    ...toBehaviorLogCsvFiles({
      behaviorRecords,
      scheduleRecords: schedules.records,
      occurrenceRecords,
      statusEventRecords,
    }),
  );

  const manifestContent = JSON.stringify(
    createBehaviorLogManifest({
      exportedAt: input.exportedAtInstant.toString(),
      profile: input.profile,
      containsNotes: noteRecords.length > 0,
      containsInterventions: interventionRecords.length > 0,
      files: filesWithoutManifest,
    }),
    null,
    2,
  );

  return {
    fileName: `${input.fileBaseName}.behaviorlog.zip`,
    files: [
      {
        path: "manifest.json",
        mediaType: "application/json",
        content: manifestContent,
      },
      ...filesWithoutManifest,
    ],
  };
}

function createBehaviorLogManifest(input: {
  exportedAt: string;
  profile: ExportProfileInput;
  containsNotes: boolean;
  containsInterventions: boolean;
  files: BehaviorLogFile[];
}) {
  return {
    format: BEHAVIORLOG_FORMAT,
    schema_version: BEHAVIORLOG_SCHEMA_VERSION,
    exported_at_utc: input.exportedAt,
    producer: {
      name: input.profile.producerName ?? "Cadence Tracker",
      version: input.profile.producerVersion ?? "0.1.0",
      exporter_version: BEHAVIORLOG_SCHEMA_VERSION,
      website: null,
    },
    subject: {
      subject_id: input.profile.subjectId,
      timezone_default: input.profile.timezone,
      locale: input.profile.locale ?? "en-US",
    },
    privacy: {
      redaction_level: "standard_redaction",
      subject_id_strategy: "pseudonymous",
      contains_notes: input.containsNotes,
      contains_context: false,
      contains_raw_location: false,
      contains_health_data: false,
      contains_ai_generated_content: false,
    },
    profiles: createBehaviorLogProfiles({
      containsNotes: input.containsNotes,
      containsInterventions: input.containsInterventions,
    }),
    rules: {
      status_semantics: {
        unresolved:
          "No explicit completion or non-completion decision has been recorded.",
        completed: "The occurrence was explicitly completed.",
        not_completed: "The occurrence was explicitly marked not completed.",
      },
      unresolved_policy: "exclude_from_explicit_adherence",
      day_boundary: "local_midnight",
      metric_rules: {
        rule_explicit_adherence_rate_v1: {
          formula: "completed / (completed + not_completed)",
          excludes: ["unresolved", "cancelled_occurrences"],
        },
        rule_resolution_rate_v1: {
          formula:
            "(completed + not_completed) / eligible_occurrences",
          excludes: ["cancelled_occurrences"],
        },
        rule_scheduled_completion_rate_v1: {
          formula: "completed / eligible_occurrences",
          excludes: ["cancelled_occurrences"],
        },
        rule_unresolved_rate_v1: {
          formula: "unresolved / eligible_occurrences",
          excludes: ["cancelled_occurrences"],
        },
      },
      source_status_mappings: [
        {
          source_status: "completed",
          mapped_status: "completed",
          semantic_confidence: "high",
        },
        {
          source_status: "not_completed",
          mapped_status: "not_completed",
          semantic_confidence: "high",
        },
      ],
    },
    files: input.files.map((file) => ({
      path: file.path,
      media_type: file.mediaType,
      schema_ref: schemaRefForBehaviorLogPath(file.path),
      required: isRequiredBehaviorLogPath(file.path),
      sha256: sha256(file.content),
    })),
  };
}

function createBehaviorLogSchema() {
  const timestamp = { type: "string", format: "date-time" };
  const localDate = { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" };
  const localTime = { type: "string", pattern: "^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$" };
  const timezone = { type: "string", minLength: 1 };
  const status = {
    type: "string",
    enum: ["unresolved", "completed", "not_completed"],
  };
  const source = {
    type: "object",
    additionalProperties: false,
    properties: {
      producer: { type: "string" },
      producer_version: { type: ["string", "null"] },
      original_id: { type: ["string", "null"] },
      capture_method: {
        type: "string",
        enum: [
          "manual_tap",
          "manual_text",
          "system_generated",
          "imported",
          "inferred",
          "derived",
          "ai_generated",
          "unknown",
        ],
      },
      imported_from: { type: ["string", "null"] },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low", "ambiguous", "unknown"],
      },
      transformation_notes: { type: ["string", "null"] },
    },
  };
  const extensions = {
    type: "object",
    additionalProperties: true,
  };

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://behaviorlog.org/schema/behaviorlog.bundle/0.1.0-draft",
    title: "BehaviorLog Bundle 0.1.0-draft",
    type: "object",
    oneOf: [
      { $ref: "#/$defs/Manifest" },
      { $ref: "#/$defs/Behavior" },
      { $ref: "#/$defs/Schedule" },
      { $ref: "#/$defs/Occurrence" },
      { $ref: "#/$defs/StatusEvent" },
      { $ref: "#/$defs/Note" },
      { $ref: "#/$defs/Intervention" },
    ],
    $defs: {
      Source: source,
      Extensions: extensions,
      Status: status,
      Manifest: {
        type: "object",
        additionalProperties: false,
        required: [
          "format",
          "schema_version",
          "exported_at_utc",
          "producer",
          "subject",
          "privacy",
          "rules",
          "files",
        ],
        properties: {
          format: { const: BEHAVIORLOG_FORMAT },
          schema_version: { type: "string" },
          exported_at_utc: timestamp,
          producer: { type: "object", additionalProperties: true },
          subject: { type: "object", additionalProperties: true },
          privacy: { type: "object", additionalProperties: true },
          profiles: { type: "array", items: { type: "string" } },
          rules: { type: "object", additionalProperties: true },
          files: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path", "media_type", "required"],
              properties: {
                path: { type: "string" },
                media_type: { type: "string" },
                schema_ref: { type: ["string", "null"] },
                required: { type: "boolean" },
                sha256: {
                  type: ["string", "null"],
                  pattern: "^[a-fA-F0-9]{64}$",
                },
              },
            },
          },
          extensions,
        },
      },
      Behavior: {
        type: "object",
        additionalProperties: false,
        required: [
          "record_type",
          "behavior_id",
          "title",
          "category",
          "success_definition",
          "created_at_utc",
        ],
        properties: {
          record_type: { const: "behavior" },
          behavior_id: { type: "string" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          category: { type: "string" },
          success_definition: { type: "string" },
          expected_duration_minutes: { type: ["number", "null"] },
          created_at_utc: timestamp,
          archived_at_utc: { anyOf: [timestamp, { type: "null" }] },
          source,
          sensitivity: {
            type: "string",
            enum: ["low", "medium", "high", "restricted"],
          },
          extensions,
        },
      },
      Schedule: {
        type: "object",
        additionalProperties: false,
        required: [
          "record_type",
          "schedule_id",
          "behavior_id",
          "recurrence_profile",
          "recurrence",
          "timezone",
          "active_from_local_date",
        ],
        properties: {
          record_type: { const: "schedule" },
          schedule_id: { type: "string" },
          behavior_id: { type: "string" },
          recurrence_profile: { type: "string" },
          recurrence: { type: "object", additionalProperties: true },
          timezone,
          local_time: { anyOf: [localTime, { type: "null" }] },
          window_start_local: { anyOf: [localTime, { type: "null" }] },
          window_end_local: { anyOf: [localTime, { type: "null" }] },
          active_from_local_date: localDate,
          active_until_local_date: { anyOf: [localDate, { type: "null" }] },
          source,
          extensions,
        },
      },
      Occurrence: {
        type: "object",
        additionalProperties: false,
        required: [
          "record_type",
          "occurrence_id",
          "behavior_id",
          "schedule_id",
          "scheduled_for_utc",
          "local_date",
          "timezone",
          "occurrence_state",
          "current_status",
        ],
        properties: {
          record_type: { const: "occurrence" },
          occurrence_id: { type: "string" },
          behavior_id: { type: "string" },
          schedule_id: { type: "string" },
          scheduled_for_utc: timestamp,
          local_date: localDate,
          local_time: { anyOf: [localTime, { type: "null" }] },
          timezone,
          utc_offset_at_event: { type: ["string", "null"] },
          due_window_start_utc: { anyOf: [timestamp, { type: "null" }] },
          due_window_end_utc: { anyOf: [timestamp, { type: "null" }] },
          generated_at_utc: { anyOf: [timestamp, { type: "null" }] },
          generation_rule_id: { type: ["string", "null"] },
          occurrence_state: { type: "string", enum: ["active", "cancelled"] },
          current_status: status,
          source,
          extensions,
        },
      },
      StatusEvent: {
        type: "object",
        additionalProperties: false,
        required: [
          "record_type",
          "event_id",
          "occurrence_id",
          "behavior_id",
          "status",
          "status_semantics",
          "recorded_at_utc",
          "local_date",
          "timezone",
          "source",
        ],
        properties: {
          record_type: { const: "status_event" },
          event_id: { type: "string" },
          occurrence_id: { type: "string" },
          behavior_id: { type: "string" },
          previous_status: { anyOf: [status, { type: "null" }] },
          status,
          status_semantics: {
            type: "string",
            enum: [
              "explicit_user_mark",
              "explicit_user_correction",
              "imported_explicit",
              "system_rule_declared",
              "ambiguous_import",
            ],
          },
          recorded_at_utc: timestamp,
          effective_at_utc: { anyOf: [timestamp, { type: "null" }] },
          local_date: localDate,
          timezone,
          utc_offset_at_event: { type: ["string", "null"] },
          actor: { type: "object", additionalProperties: true },
          source,
          note_id: { type: ["string", "null"] },
          revises_event_id: { type: ["string", "null"] },
          reason_code: { type: ["string", "null"] },
          extensions,
        },
      },
      Note: {
        type: "object",
        additionalProperties: false,
        required: [
          "record_type",
          "note_id",
          "attached_to_type",
          "attached_to_id",
          "body_markdown",
          "note_role",
          "created_at_utc",
        ],
        properties: {
          record_type: { const: "note" },
          note_id: { type: "string" },
          attached_to_type: {
            type: "string",
            enum: ["behavior", "occurrence", "status_event", "review"],
          },
          attached_to_id: { type: "string" },
          body_markdown: { type: "string" },
          note_role: {
            type: "string",
            enum: ["user", "imported", "system", "ai_generated"],
          },
          created_at_utc: timestamp,
          updated_at_utc: { anyOf: [timestamp, { type: "null" }] },
          sensitivity: {
            type: "string",
            enum: ["low", "medium", "high", "restricted"],
          },
          source,
          extensions,
        },
      },
      Intervention: {
        type: "object",
        additionalProperties: false,
        required: [
          "record_type",
          "intervention_id",
          "behavior_id",
          "occurrence_id",
          "intervention_type",
          "channel",
          "scheduled_send_at_utc",
          "delivery_status",
        ],
        properties: {
          record_type: { const: "intervention" },
          intervention_id: { type: "string" },
          behavior_id: { type: "string" },
          occurrence_id: { type: "string" },
          intervention_type: { type: "string", enum: ["reminder"] },
          channel: { type: "string", enum: ["browser_push", "email"] },
          scheduled_send_at_utc: timestamp,
          sent_at_utc: { anyOf: [timestamp, { type: "null" }] },
          delivery_status: {
            type: "string",
            enum: ["pending", "sent", "failed", "cancelled"],
          },
          failure_reason: { type: ["string", "null"] },
          source,
          extensions,
        },
      },
    },
  };
}

function createBehaviorLogProfiles(input: {
  containsNotes: boolean;
  containsInterventions: boolean;
}): string[] {
  return [
    "core",
    input.containsNotes ? "notes" : null,
    input.containsInterventions ? "interventions" : null,
  ].filter((profile): profile is string => Boolean(profile));
}

function toBehaviorLogBehavior(
  behavior: ExportJsonBehavior,
  profile: ExportProfileInput,
) {
  return omitNullish({
    record_type: "behavior",
    behavior_id: behavior.id,
    title: behavior.title,
    description: behavior.description,
    category: toBehaviorLogCategory(behavior.category),
    success_definition: `Complete ${behavior.title} for each scheduled occurrence.`,
    expected_duration_minutes: null,
    created_at_utc: formatUtc(behavior.created_at),
    archived_at_utc: formatOptionalUtc(behavior.archived_at),
    source: createBehaviorLogSource({
      profile,
      originalId: behavior.id,
      captureMethod: "manual_text",
      confidence: "high",
    }),
    sensitivity: isSensitiveCategory(behavior.category) ? "high" : "medium",
    extensions: {
      [BEHAVIORLOG_EXTENSION_NAMESPACE]: {
        category_id: behavior.category_id,
        category_name: behavior.category,
        active: behavior.active,
        browser_reminder_enabled: behavior.browser_reminder_enabled,
        email_reminder_enabled: behavior.email_reminder_enabled,
        reminder_offset_minutes: behavior.reminder_offset_minutes,
      },
    },
  });
}

function toBehaviorLogSchedules(
  behaviors: ExportJsonBehavior[],
  occurrences: ExportJsonOccurrence[],
) {
  const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
  const recordsById = new Map<string, ReturnType<typeof createBehaviorLogSchedule>>();
  const scheduleIdByOccurrenceId = new Map<string, string>();

  for (const behavior of behaviors) {
    for (const schedule of normalizeExportSchedules(behavior)) {
      for (const slot of schedule.timeEntries) {
        const scheduleId = scheduleIdForSlot(behavior.id, slot.id);
        recordsById.set(
          scheduleId,
          createBehaviorLogSchedule({
            scheduleId,
            behavior,
            recurrenceRule: schedule.recurrenceRule,
            localTime: slot.startTime,
            windowStartLocal: slot.kind === "range" ? slot.startTime : null,
            windowEndLocal: slot.kind === "range" ? slot.endTime : null,
            slotId: slot.id,
            scheduleKind: slot.kind,
            schedulePreset: slot.preset,
            scheduleLabel: slot.label,
            sourceConfidence: "high",
          }),
        );
      }
    }
  }

  for (const occurrence of occurrences) {
    const behavior = behaviorById.get(occurrence.behavior_id);

    if (!behavior) {
      continue;
    }

    const scheduleId = occurrence.behavior_schedule_slot_id
      ? scheduleIdForSlot(behavior.id, occurrence.behavior_schedule_slot_id)
      : scheduleIdForOccurrenceSnapshot(occurrence);
    scheduleIdByOccurrenceId.set(occurrence.id, scheduleId);

    if (!recordsById.has(scheduleId)) {
      recordsById.set(
        scheduleId,
        createBehaviorLogSchedule({
          scheduleId,
          behavior,
          recurrenceRule: recurrenceRuleForOccurrence(behavior, occurrence),
          localTime: occurrence.schedule_start_time,
          windowStartLocal:
            occurrence.schedule_kind === "range"
              ? occurrence.schedule_start_time
              : null,
          windowEndLocal:
            occurrence.schedule_kind === "range"
              ? occurrence.schedule_end_time
              : null,
          slotId: occurrence.behavior_schedule_slot_id,
          scheduleKind: occurrence.schedule_kind,
          schedulePreset: occurrence.schedule_preset,
          scheduleLabel: occurrence.schedule,
          sourceConfidence: occurrence.behavior_schedule_slot_id
            ? "high"
            : "medium",
        }),
      );
    }
  }

  return {
    records: Array.from(recordsById.values()).sort((left, right) =>
      left.schedule_id.localeCompare(right.schedule_id),
    ),
    scheduleIdByOccurrenceId,
  };
}

function normalizeExportSchedules(
  behavior: ExportJsonBehavior,
): ExportJsonBehavior["schedules"] {
  if (behavior.schedules.length > 0) {
    return behavior.schedules;
  }

  return [
    {
      id: "",
      recurrenceRule: behavior.recurrence_rule,
      recurrenceSummary: "",
      recurrenceDefaults: {
        kind: "daily" as const,
        dailyInterval: 1,
        everyDays: 2,
        weeklyInterval: 1,
        weeklyDays: ["monday" as const],
        monthlyInterval: 1,
        monthlyDay: 1,
      },
      timeEntries: behavior.schedule_slots,
      timeSummary: "",
      sortOrder: 0,
    },
  ];
}

function normalizeExportInputSchedules(
  behavior: ExportBehaviorInput,
): ExportJsonBehavior["schedules"] {
  if (behavior.schedules && behavior.schedules.length > 0) {
    return behavior.schedules;
  }

  return [
    {
      id: "",
      recurrenceRule: behavior.recurrenceRule,
      recurrenceSummary: "",
      recurrenceDefaults: {
        kind: "daily" as const,
        dailyInterval: 1,
        everyDays: 2,
        weeklyInterval: 1,
        weeklyDays: ["monday" as const],
        monthlyInterval: 1,
        monthlyDay: 1,
      },
      timeEntries: behavior.scheduleSlots,
      timeSummary: "",
      sortOrder: 0,
    },
  ];
}

function recurrenceRuleForOccurrence(
  behavior: ExportJsonBehavior,
  occurrence: ExportJsonOccurrence,
): ExportJsonBehavior["recurrence_rule"] {
  const schedule = behavior.schedules.find((candidate) =>
    candidate.timeEntries.some(
      (entry) => entry.id === occurrence.behavior_schedule_slot_id,
    ),
  );

  return schedule?.recurrenceRule ?? behavior.recurrence_rule;
}

function createBehaviorLogSchedule(input: {
  scheduleId: string;
  behavior: ExportJsonBehavior;
  recurrenceRule: ExportJsonBehavior["recurrence_rule"];
  localTime: string;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  slotId: string | null;
  scheduleKind: string;
  schedulePreset: string | null;
  scheduleLabel: string;
  sourceConfidence: "high" | "medium";
}) {
  return omitNullish({
    record_type: "schedule",
    schedule_id: input.scheduleId,
    behavior_id: input.behavior.id,
    recurrence_profile: "behaviorlog.calendar_simple.v1",
    recurrence: toBehaviorLogRecurrence(input.recurrenceRule),
    timezone: input.behavior.timezone,
    local_time: input.localTime,
    window_start_local: input.windowStartLocal,
    window_end_local: input.windowEndLocal,
    active_from_local_date: instantToLocalDate(
      input.behavior.created_at,
      input.behavior.timezone,
    ),
    active_until_local_date: input.behavior.archived_at
      ? instantToLocalDate(input.behavior.archived_at, input.behavior.timezone)
      : null,
    source: createBehaviorLogSource({
      originalId: input.slotId ?? input.scheduleId,
      captureMethod: "system_generated",
      confidence: input.sourceConfidence,
    }),
    extensions: {
      [BEHAVIORLOG_EXTENSION_NAMESPACE]: {
        behavior_schedule_slot_id: input.slotId,
        schedule_kind: input.scheduleKind,
        schedule_preset: input.schedulePreset,
        schedule_label: input.scheduleLabel,
      },
    },
  });
}

function toBehaviorLogOccurrence(
  occurrence: ExportJsonOccurrence,
  scheduleIdByOccurrenceId: Map<string, string>,
) {
  const dueWindow = resolveDueWindow(occurrence);

  return omitNullish({
    record_type: "occurrence",
    occurrence_id: occurrence.id,
    behavior_id: occurrence.behavior_id,
    schedule_id:
      scheduleIdByOccurrenceId.get(occurrence.id) ??
      scheduleIdForOccurrenceSnapshot(occurrence),
    scheduled_for_utc: formatUtc(occurrence.scheduled_for),
    local_date: occurrence.local_date,
    local_time: occurrence.schedule_start_time,
    timezone: timezoneForOccurrence(occurrence),
    utc_offset_at_event: utcOffsetAtEvent(
      occurrence.scheduled_for,
      timezoneForOccurrence(occurrence),
    ),
    due_window_start_utc: dueWindow.start,
    due_window_end_utc: dueWindow.end,
    generated_at_utc: formatOptionalUtc(occurrence.created_at),
    generation_rule_id: BEHAVIORLOG_GENERATION_RULE_ID,
    occurrence_state: "active",
    current_status: occurrence.status,
    source: createBehaviorLogSource({
      originalId: occurrence.id,
      captureMethod: "system_generated",
      confidence: "high",
    }),
    extensions: {
      [BEHAVIORLOG_EXTENSION_NAMESPACE]: {
        schedule: occurrence.schedule,
        schedule_kind: occurrence.schedule_kind,
        schedule_preset: occurrence.schedule_preset,
        schedule_start_time: occurrence.schedule_start_time,
        schedule_end_time: occurrence.schedule_end_time,
      },
    },
  });
}

function toBehaviorLogStatusEvents(input: {
  statusEvents: ExportStatusEventInput[];
  occurrences: ExportJsonOccurrence[];
  behaviors: ExportJsonBehavior[];
}) {
  const occurrenceById = new Map(
    input.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const behaviorById = new Map(input.behaviors.map((behavior) => [behavior.id, behavior]));
  const explicitEvents = input.statusEvents
    .filter((event) => occurrenceById.has(event.occurrenceId))
    .sort(compareStatusEvents)
    .map((event) => {
      const occurrence = occurrenceById.get(event.occurrenceId);
      const behavior = behaviorById.get(event.behaviorId);

      return omitNullish({
        record_type: "status_event",
        event_id: event.id,
        occurrence_id: event.occurrenceId,
        behavior_id: event.behaviorId,
        previous_status: event.previousStatus,
        status: event.status,
        status_semantics: event.statusSemantics,
        recorded_at_utc: formatUtc(event.recordedAt),
        effective_at_utc: formatOptionalUtc(event.effectiveAt),
        local_date: event.localDate,
        timezone:
          event.timezone ||
          behavior?.timezone ||
          (occurrence ? timezoneForOccurrence(occurrence) : DEFAULT_TIMEZONE),
        utc_offset_at_event: utcOffsetAtEvent(
          event.recordedAt,
          event.timezone ||
            behavior?.timezone ||
            (occurrence ? timezoneForOccurrence(occurrence) : DEFAULT_TIMEZONE),
        ),
        actor: {
          type: "user",
          id: "subject",
        },
        source: createBehaviorLogSource({
          originalId: event.id,
          captureMethod: event.sourceCaptureMethod,
          confidence: event.sourceConfidence,
        }),
        note_id: null,
        revises_event_id: event.revisesEventId,
        reason_code: event.reasonCode,
      });
    });
  const eventOccurrenceIds = new Set(
    input.statusEvents.map((event) => event.occurrenceId),
  );
  const syntheticEvents = input.occurrences
    .filter(
      (occurrence) =>
        occurrence.status !== "unresolved" && !eventOccurrenceIds.has(occurrence.id),
    )
    .map((occurrence) =>
      toSyntheticBehaviorLogStatusEvent(
        occurrence,
        behaviorById.get(occurrence.behavior_id),
      ),
    );

  return [...explicitEvents, ...syntheticEvents].sort((left, right) =>
    String(left.recorded_at_utc).localeCompare(String(right.recorded_at_utc)),
  );
}

function toSyntheticBehaviorLogStatusEvent(
  occurrence: ExportJsonOccurrence,
  behavior: ExportJsonBehavior | undefined,
) {
  const recordedAt =
    occurrence.status_marked_at ??
    occurrence.completed_at ??
    occurrence.updated_at ??
    occurrence.created_at ??
    occurrence.scheduled_for;
  const timezone = behavior?.timezone ?? timezoneForOccurrence(occurrence);

  return omitNullish({
    record_type: "status_event",
    event_id: `evt_${stableId(occurrence.id)}_${occurrence.status}`,
    occurrence_id: occurrence.id,
    behavior_id: occurrence.behavior_id,
    previous_status: "unresolved",
    status: occurrence.status,
    status_semantics: "explicit_user_mark",
    recorded_at_utc: formatUtc(recordedAt),
    effective_at_utc: formatOptionalUtc(
      occurrence.status === "completed"
        ? occurrence.completed_at
        : occurrence.status_marked_at,
    ),
    local_date: occurrence.local_date,
    timezone,
    utc_offset_at_event: utcOffsetAtEvent(recordedAt, timezone),
    actor: {
      type: "user",
      id: "subject",
    },
    source: createBehaviorLogSource({
      originalId: occurrence.id,
      captureMethod: "derived",
      confidence: "medium",
      transformationNotes:
        "Synthesized from the current occurrence status because no status event row was available.",
    }),
    note_id: null,
    revises_event_id: null,
    reason_code: null,
  });
}

function toBehaviorLogNotes(occurrences: ExportJsonOccurrence[]) {
  return occurrences
    .filter((occurrence) => occurrence.note)
    .map((occurrence) =>
      omitNullish({
        record_type: "note",
        note_id: noteIdForOccurrence(occurrence.id),
        attached_to_type: "occurrence",
        attached_to_id: occurrence.id,
        body_markdown: occurrence.note,
        note_role: "user",
        created_at_utc: formatUtc(
          occurrence.updated_at ??
            occurrence.status_marked_at ??
            occurrence.created_at ??
            occurrence.scheduled_for,
        ),
        updated_at_utc: null,
        sensitivity: "high",
        source: createBehaviorLogSource({
          originalId: occurrence.id,
          captureMethod: "manual_text",
          confidence: "high",
        }),
      }),
    );
}

function createBehaviorLogSource(input: {
  profile?: ExportProfileInput;
  originalId: string | null;
  captureMethod:
    | "manual_tap"
    | "manual_text"
    | "system_generated"
    | "imported"
    | "inferred"
    | "derived"
    | "ai_generated"
    | "unknown";
  confidence: "high" | "medium" | "low" | "ambiguous" | "unknown";
  transformationNotes?: string;
}) {
  return omitNullish({
    producer: input.profile?.producerName ?? "Cadence Tracker",
    producer_version: input.profile?.producerVersion ?? "0.1.0",
    original_id: input.originalId,
    capture_method: input.captureMethod,
    imported_from: null,
    confidence: input.confidence,
    transformation_notes: input.transformationNotes ?? null,
    });
}

function toBehaviorLogInterventions(input: {
  reminderDeliveries: ExportReminderDeliveryInput[];
  occurrences: ExportJsonOccurrence[];
}) {
  const occurrenceById = new Map(
    input.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );

  return [...input.reminderDeliveries]
    .filter((delivery) => occurrenceById.has(delivery.occurrenceId))
    .sort(compareReminderDeliveries)
    .map((delivery) => {
      const occurrence = occurrenceById.get(delivery.occurrenceId)!;

      return omitNullish({
        record_type: "intervention",
        intervention_id: delivery.id,
        behavior_id: occurrence.behavior_id,
        occurrence_id: delivery.occurrenceId,
        intervention_type: "reminder",
        channel: delivery.channel,
        scheduled_send_at_utc: formatUtc(delivery.scheduledSendAt),
        sent_at_utc: formatOptionalUtc(delivery.sentAt),
        delivery_status: delivery.status,
        failure_reason: sanitizeInterventionFailureReason(delivery.error),
        source: createBehaviorLogSource({
          originalId: delivery.id,
          captureMethod: "system_generated",
          confidence: "high",
        }),
        extensions: {
          [BEHAVIORLOG_EXTENSION_NAMESPACE]: omitNullish({
            reminder_delivery_id: delivery.id,
            processing_started_at_utc: formatOptionalUtc(
              delivery.processingStartedAt,
            ),
            created_at_utc: formatOptionalUtc(delivery.createdAt),
            updated_at_utc: formatOptionalUtc(delivery.updatedAt),
          }),
        },
      });
    });
}

function createBehaviorLogReadme(): string {
  return [
    "# Cadence BehaviorLog Bundle",
    "",
    "This export contains BehaviorLog core records generated by Cadence Tracker.",
    "",
    "Read `manifest.json` first. JSONL files under `data/` are authoritative.",
    "CSV files under `csv/`, when present, are derived compatibility views and should join back to JSONL records by stable ID.",
  ].join("\n");
}

function createBehaviorLogAgentsMd(): string {
  return [
    "# AGENTS.md",
    "",
    "This is a BehaviorLog Bundle. Read `manifest.json` first, then validate `schema.json`, then inspect files under `data/`.",
    "",
    "## Required reasoning rules",
    "",
    "- Do not treat `unresolved` as `not_completed`.",
    "- Do not use `missed` unless the manifest defines it as a derived label.",
    "- Use `local_date` and `timezone` for day, week, and month analysis.",
    "- Use UTC timestamps for ordering events.",
    "- Prefer `status_events.jsonl` over `current_status` snapshots when analyzing history.",
    "- Treat files under `csv/` as compatibility views only; JSONL files under `data/` remain authoritative.",
    "- Treat notes as attributed context, not objective fact.",
    "- Report unresolved counts when computing adherence.",
  ].join("\n");
}

function toBehaviorLogRecurrence(rule: ExportJsonBehavior["recurrence_rule"]) {
  switch (rule.frequency) {
    case "daily":
      return rule.interval === 1
        ? { type: "daily", interval: 1 }
        : { type: "every_n_days", interval: rule.interval };
    case "interval_days":
      return { type: "every_n_days", interval: rule.intervalDays };
    case "weekly":
      return rule.interval === 1
        ? { type: "weekly_on_weekdays", weekdays: rule.daysOfWeek }
        : {
            type: "every_n_weeks_on_weekdays",
            interval: rule.interval,
            weekdays: rule.daysOfWeek,
          };
    case "monthly":
      return {
        type: "monthly_on_day",
        interval: rule.interval,
        day: rule.dayOfMonth,
        fallback: "last_day_of_month",
      };
  }
}

function toBehaviorLogCategory(category: string | null): string {
  switch (category) {
    case "Grooming":
      return "hygiene";
    case "Fitness":
      return "fitness";
    case "Food / Drink":
      return "nutrition";
    case "Home":
      return "chores";
    case "Admin":
      return "admin";
    case "Medical":
    case "Measurements":
      return "health_wellness";
    case "Other":
      return "other";
    case null:
      return "uncategorized";
    default:
      return category.trim().length > 0 ? category : "uncategorized";
  }
}

function isSensitiveCategory(category: string | null): boolean {
  return category === "Medical" || category === "Measurements";
}

function resolveDueWindow(occurrence: ExportJsonOccurrence): {
  start: string | null;
  end: string | null;
} {
  if (occurrence.schedule_kind !== "range" || !occurrence.schedule_end_time) {
    return {
      start: null,
      end: null,
    };
  }

  const timezone = timezoneForOccurrence(occurrence);
  const localDate = Temporal.PlainDate.from(occurrence.local_date);
  const startTime = Temporal.PlainTime.from(occurrence.schedule_start_time);
  const endTime = Temporal.PlainTime.from(occurrence.schedule_end_time);
  const endDate =
    Temporal.PlainTime.compare(endTime, startTime) <= 0
      ? localDate.add({ days: 1 })
      : localDate;

  return {
    start: plainDateTimeToInstant(localDate, startTime, timezone).toString(),
    end: plainDateTimeToInstant(endDate, endTime, timezone).toString(),
  };
}

function plainDateTimeToInstant(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timezone: string,
): Temporal.Instant {
  return date.toPlainDateTime(time).toZonedDateTime(timezone).toInstant();
}

function instantToLocalDate(value: string | null | undefined, timezone: string): string {
  const instant = value ? Temporal.Instant.from(value) : Temporal.Instant.from("1970-01-01T00:00:00Z");

  return instant.toZonedDateTimeISO(timezone || DEFAULT_TIMEZONE).toPlainDate().toString();
}

function timezoneForOccurrence(occurrence: ExportJsonOccurrence): string {
  return occurrence.timezone || DEFAULT_TIMEZONE;
}

function utcOffsetAtEvent(value: string, timezone: string): string {
  return Temporal.Instant.from(value).toZonedDateTimeISO(timezone || DEFAULT_TIMEZONE).offset;
}

function formatUtc(value: string | Temporal.Instant | null | undefined): string {
  if (!value) {
    return Temporal.Instant.from("1970-01-01T00:00:00Z").toString();
  }

  return (typeof value === "string" ? Temporal.Instant.from(value) : value).toString();
}

function formatOptionalUtc(value: string | null | undefined): string | null {
  return value ? Temporal.Instant.from(value).toString() : null;
}

function schemaRefForBehaviorLogPath(path: string): string | null {
  switch (path) {
    case "data/behaviors.jsonl":
      return "#/$defs/Behavior";
    case "data/schedules.jsonl":
      return "#/$defs/Schedule";
    case "data/occurrences.jsonl":
      return "#/$defs/Occurrence";
    case "data/status_events.jsonl":
      return "#/$defs/StatusEvent";
    case "data/notes.jsonl":
      return "#/$defs/Note";
    case "data/interventions.jsonl":
      return "#/$defs/Intervention";
    default:
      return null;
  }
}

function isRequiredBehaviorLogPath(path: string): boolean {
  return [
    "schema.json",
    "README.md",
    "AGENTS.md",
    "data/behaviors.jsonl",
    "data/schedules.jsonl",
    "data/occurrences.jsonl",
    "data/status_events.jsonl",
  ].includes(path);
}

function scheduleIdForSlot(behaviorId: string, slotId: string | null): string {
  return `sch_${stableId(slotId ?? behaviorId)}`;
}

function scheduleIdForOccurrenceSnapshot(
  occurrence: Pick<
    ExportJsonOccurrence,
    | "behavior_id"
    | "schedule_kind"
    | "schedule_preset"
    | "schedule_start_time"
    | "schedule_end_time"
  >,
): string {
  return `sch_${stableId(
    [
      occurrence.behavior_id,
      occurrence.schedule_kind,
      occurrence.schedule_preset ?? "exact",
      occurrence.schedule_start_time,
      occurrence.schedule_end_time ?? "none",
    ].join("_"),
  )}`;
}

function noteIdForOccurrence(occurrenceId: string): string {
  return `note_${stableId(occurrenceId)}`;
}

function stableId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function toJsonlRecords(records: unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function toBehaviorLogCsvFiles(input: {
  behaviorRecords: Record<string, unknown>[];
  scheduleRecords: Record<string, unknown>[];
  occurrenceRecords: Record<string, unknown>[];
  statusEventRecords: Record<string, unknown>[];
}): BehaviorLogFile[] {
  return [
    {
      path: "csv/behaviors.csv",
      mediaType: "text/csv",
      content: toBehaviorLogCsv(
        BEHAVIORLOG_BEHAVIOR_CSV_COLUMNS,
        input.behaviorRecords,
      ),
    },
    {
      path: "csv/schedules.csv",
      mediaType: "text/csv",
      content: toBehaviorLogCsv(
        BEHAVIORLOG_SCHEDULE_CSV_COLUMNS,
        input.scheduleRecords,
      ),
    },
    {
      path: "csv/occurrences.csv",
      mediaType: "text/csv",
      content: toBehaviorLogCsv(
        BEHAVIORLOG_OCCURRENCE_CSV_COLUMNS,
        input.occurrenceRecords,
      ),
    },
    {
      path: "csv/status_events.csv",
      mediaType: "text/csv",
      content: toBehaviorLogCsv(
        BEHAVIORLOG_STATUS_EVENT_CSV_COLUMNS,
        input.statusEventRecords,
      ),
    },
  ];
}

function toBehaviorLogCsv(
  columns: readonly string[],
  records: Record<string, unknown>[],
): string {
  return [
    columns.join(","),
    ...records.map((record) =>
      columns.map((column) => escapeCsvCell(formatCsvValue(record[column]))).join(","),
    ),
  ].join("\n");
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function compareStatusEvents(
  left: ExportStatusEventInput,
  right: ExportStatusEventInput,
): number {
  const recordedComparison = Temporal.Instant.compare(
    Temporal.Instant.from(left.recordedAt),
    Temporal.Instant.from(right.recordedAt),
  );

  if (recordedComparison !== 0) {
    return recordedComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareReminderDeliveries(
  left: ExportReminderDeliveryInput,
  right: ExportReminderDeliveryInput,
): number {
  const scheduledComparison = Temporal.Instant.compare(
    Temporal.Instant.from(left.scheduledSendAt),
    Temporal.Instant.from(right.scheduledSendAt),
  );

  if (scheduledComparison !== 0) {
    return scheduledComparison;
  }

  return left.id.localeCompare(right.id);
}

function sanitizeInterventionFailureReason(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted-email]",
    )
    .replace(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
    .replace(/\b(p256dh|auth)\s*[:=]\s*\S+/gi, "$1=[redacted-key]")
    .replace(
      /\b(api[_-]?key|token|secret|bearer)\s*[:=]\s*\S+/gi,
      "$1=[redacted-secret]",
    );
}

function omitNullish<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

function toMarkdownSummary(input: {
  range: ExportDateRange;
  counts: ExportStatusCounts;
  behaviors: ExportJsonBehavior[];
  occurrences: ExportJsonOccurrence[];
  includeArchived: boolean;
  includeNotes: boolean;
}): string {
  const behaviorLines = summarizeByBehavior(input.occurrences);
  const categoryLines = summarizeByCategory(input.occurrences);
  const noteLines = summarizeOccurrenceNotes(input.occurrences);

  return [
    `# Behavior adherence summary, ${input.range.summaryLabel}`,
    "",
    `Archived behaviors: ${input.includeArchived ? "included" : "excluded"}`,
    `Occurrence notes: ${input.includeNotes ? "included" : "excluded"}`,
    "",
    "## Overall",
    `- Completed: ${input.counts.completedCount}`,
    `- Not Completed: ${input.counts.notCompletedCount}`,
    `- Unresolved: ${input.counts.unresolvedCount}`,
    `- Default adherence: ${formatAdherenceFormula(input.counts)}`,
    "",
    "## By behavior",
    ...(behaviorLines.length > 0
      ? behaviorLines
      : ["- No occurrences in this range."]),
    "",
    "## By category",
    ...(categoryLines.length > 0
      ? categoryLines
      : ["- No category counts in this range."]),
    ...(noteLines.length > 0 ? ["", "## Notes", ...noteLines] : []),
  ].join("\n");
}

function summarizeByBehavior(
  occurrences: ExportJsonOccurrence[],
): string[] {
  const groups = new Map<string, ExportJsonOccurrence[]>();

  for (const occurrence of occurrences) {
    const existing = groups.get(occurrence.behavior_id) ?? [];
    existing.push(occurrence);
    groups.set(occurrence.behavior_id, existing);
  }

  return Array.from(groups.values())
    .map((group) => {
      const firstOccurrence = group[0];
      const title = firstOccurrence?.behavior_title ?? "Unknown behavior";
      const counts = countOccurrences(group);

      return `- ${title}: ${counts.completedCount} completed, ${counts.notCompletedCount} not completed, ${counts.unresolvedCount} unresolved, ${formatAdherenceLabel(counts)}`;
    })
    .sort((left, right) => left.localeCompare(right));
}

function summarizeByCategory(
  occurrences: ExportJsonOccurrence[],
): string[] {
  const groups = new Map<string, ExportJsonOccurrence[]>();

  for (const occurrence of occurrences) {
    const categoryName = occurrence.category ?? "No category";
    const existing = groups.get(categoryName) ?? [];
    existing.push(occurrence);
    groups.set(categoryName, existing);
  }

  return Array.from(groups.entries())
    .map(([categoryName, group]) => {
      const counts = countOccurrences(group);

      return `- ${categoryName}: ${counts.completedCount} completed, ${counts.notCompletedCount} not completed, ${counts.unresolvedCount} unresolved`;
    })
    .sort((left, right) => left.localeCompare(right));
}

function summarizeOccurrenceNotes(
  occurrences: ExportJsonOccurrence[],
): string[] {
  return occurrences
    .filter((occurrence) => occurrence.note)
    .map((occurrence) => {
      const note = normalizeMarkdownNote(occurrence.note ?? "");
      const statusLabel =
        occurrence.status === "not_completed" ? "not completed" : occurrence.status;

      return `- ${occurrence.local_date} - ${occurrence.behavior_title} - ${occurrence.schedule} - ${statusLabel}: ${note}`;
    })
    .filter((line) => !line.endsWith(": "))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeMarkdownNote(note: string): string {
  return note.replace(/\s+/g, " ").trim();
}

function countOccurrences(
  occurrences: ExportJsonOccurrence[],
): ExportStatusCounts {
  const counts: ExportStatusCounts = {
    completedCount: 0,
    notCompletedCount: 0,
    unresolvedCount: 0,
    resolvedCount: 0,
    totalCount: 0,
  };

  for (const occurrence of occurrences) {
    counts.totalCount += 1;

    switch (occurrence.status) {
      case "completed":
        counts.completedCount += 1;
        counts.resolvedCount += 1;
        break;
      case "not_completed":
        counts.notCompletedCount += 1;
        counts.resolvedCount += 1;
        break;
      case "unresolved":
        counts.unresolvedCount += 1;
        break;
    }
  }

  return counts;
}

function formatAdherenceFormula(counts: ExportStatusCounts): string {
  if (counts.resolvedCount === 0) {
    return "No resolved occurrences";
  }

  return `${counts.completedCount} / (${counts.completedCount} + ${counts.notCompletedCount}) = ${formatPercent(counts.completedCount / counts.resolvedCount)}%`;
}

function formatAdherenceLabel(counts: ExportStatusCounts): string {
  if (counts.resolvedCount === 0) {
    return "No resolved occurrences";
  }

  return `${formatPercent(counts.completedCount / counts.resolvedCount)}% adherence`;
}

function formatAdherenceValue(counts: ExportStatusCounts): string {
  if (counts.resolvedCount === 0) {
    return "No resolved occurrences";
  }

  return `${formatPercent(counts.completedCount / counts.resolvedCount)}%`;
}

function formatPercent(rate: number): string {
  const rounded = Math.round(rate * 1000) / 10;

  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function isOccurrenceWithinRange(
  occurrence: ExportOccurrenceInput,
  range: ExportDateRange,
): boolean {
  const localDate = Temporal.PlainDate.from(occurrence.localDate);
  const endDate = Temporal.PlainDate.from(range.endLocalDate);

  if (Temporal.PlainDate.compare(localDate, endDate) > 0) {
    return false;
  }

  if (!range.startLocalDate) {
    return true;
  }

  const startDate = Temporal.PlainDate.from(range.startLocalDate);

  return Temporal.PlainDate.compare(localDate, startDate) >= 0;
}

function compareBehaviors(
  left: ExportBehaviorInput,
  right: ExportBehaviorInput,
): number {
  const titleComparison = left.title.localeCompare(right.title);

  if (titleComparison !== 0) {
    return titleComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareOccurrences(
  left: ExportOccurrenceInput,
  right: ExportOccurrenceInput,
  behaviorById: Map<string, ExportBehaviorInput>,
): number {
  const localDateComparison = Temporal.PlainDate.compare(
    Temporal.PlainDate.from(left.localDate),
    Temporal.PlainDate.from(right.localDate),
  );

  if (localDateComparison !== 0) {
    return localDateComparison;
  }

  const instantComparison = Temporal.Instant.compare(
    Temporal.Instant.from(left.scheduledFor),
    Temporal.Instant.from(right.scheduledFor),
  );

  if (instantComparison !== 0) {
    return instantComparison;
  }

  const leftTitle = behaviorById.get(left.behaviorId)?.title ?? "";
  const rightTitle = behaviorById.get(right.behaviorId)?.title ?? "";

  return leftTitle.localeCompare(rightTitle);
}

function formatOptionalInstantInTimezone(
  value: string | null,
  timezone: string,
): string | null {
  return value ? formatInstantInTimezone(value, timezone) : null;
}

function formatInstantInTimezone(
  value: Temporal.Instant | string,
  timezone: string,
): string {
  const instant =
    typeof value === "string" ? Temporal.Instant.from(value) : value;

  return instant
    .toZonedDateTimeISO(timezone || DEFAULT_TIMEZONE)
    .toString({ timeZoneName: "never" });
}
