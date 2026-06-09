import { Temporal } from "@js-temporal/polyfill";

import type {
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
  ExportStatusCounts,
} from "@/lib/types/export";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

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
  now: Temporal.Instant;
  timezone?: string;
  range?: string | number | null;
  includeArchived?: boolean;
};

export function resolveExportBundle(input: ResolveExportInput): ExportBundle {
  const timezone = input.timezone || input.profile.timezone || DEFAULT_TIMEZONE;
  const includeArchived = input.includeArchived ?? false;
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
    .map((occurrence) => toJsonOccurrence(occurrence, behaviorById));
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

  return {
    timezone,
    exportedAt,
    includeArchived,
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
    }),
    fileBaseName,
    markdownFileName: `${fileBaseName}-summary.md`,
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

function toJsonOccurrence(
  occurrence: ExportOccurrenceInput,
  behaviorById: Map<string, ExportBehaviorInput>,
): ExportJsonOccurrence {
  const behavior = behaviorById.get(occurrence.behaviorId);
  const timezone = behavior?.timezone || DEFAULT_TIMEZONE;

  return {
    id: occurrence.id,
    behavior_id: occurrence.behaviorId,
    behavior_title: behavior?.title ?? "Unknown behavior",
    category: behavior?.categoryName ?? null,
    scheduled_for: formatInstantInTimezone(occurrence.scheduledFor, timezone),
    schedule: occurrence.scheduledTimeLabel,
    schedule_kind: occurrence.scheduleKind,
    schedule_preset: occurrence.schedulePreset,
    schedule_start_time: occurrence.scheduleStartTime,
    schedule_end_time: occurrence.scheduleEndTime,
    local_date: occurrence.localDate,
    status: occurrence.status,
    completed_at: formatOptionalInstantInTimezone(
      occurrence.completedAt,
      timezone,
    ),
    status_marked_at: formatOptionalInstantInTimezone(
      occurrence.statusMarkedAt,
      timezone,
    ),
    note: occurrence.note,
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

function toMarkdownSummary(input: {
  range: ExportDateRange;
  counts: ExportStatusCounts;
  behaviors: ExportJsonBehavior[];
  occurrences: ExportJsonOccurrence[];
  includeArchived: boolean;
}): string {
  const behaviorLines = summarizeByBehavior(input.occurrences);
  const categoryLines = summarizeByCategory(input.occurrences);

  return [
    `# Behavior adherence summary, ${input.range.summaryLabel}`,
    "",
    `Archived behaviors: ${input.includeArchived ? "included" : "excluded"}`,
    "",
    "## Overall",
    `- Done: ${input.counts.doneCount}`,
    `- Not done: ${input.counts.notDoneCount}`,
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

      return `- ${title}: ${counts.doneCount} done, ${counts.notDoneCount} not done, ${counts.unresolvedCount} unresolved, ${formatAdherenceLabel(counts)}`;
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

      return `- ${categoryName}: ${counts.doneCount} done, ${counts.notDoneCount} not done, ${counts.unresolvedCount} unresolved`;
    })
    .sort((left, right) => left.localeCompare(right));
}

function countOccurrences(
  occurrences: ExportJsonOccurrence[],
): ExportStatusCounts {
  const counts: ExportStatusCounts = {
    doneCount: 0,
    notDoneCount: 0,
    unresolvedCount: 0,
    resolvedCount: 0,
    totalCount: 0,
  };

  for (const occurrence of occurrences) {
    counts.totalCount += 1;

    switch (occurrence.status) {
      case "done":
        counts.doneCount += 1;
        counts.resolvedCount += 1;
        break;
      case "not_done":
        counts.notDoneCount += 1;
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

  return `${counts.doneCount} / (${counts.doneCount} + ${counts.notDoneCount}) = ${formatPercent(counts.doneCount / counts.resolvedCount)}%`;
}

function formatAdherenceLabel(counts: ExportStatusCounts): string {
  if (counts.resolvedCount === 0) {
    return "No resolved occurrences";
  }

  return `${formatPercent(counts.doneCount / counts.resolvedCount)}% adherence`;
}

function formatAdherenceValue(counts: ExportStatusCounts): string {
  if (counts.resolvedCount === 0) {
    return "No resolved occurrences";
  }

  return `${formatPercent(counts.doneCount / counts.resolvedCount)}%`;
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
