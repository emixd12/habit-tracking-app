import { Temporal } from "@js-temporal/polyfill";

import {
  getProfileTimezone,
  listBehaviorCategories,
  listUserBehaviors,
  type AppSupabaseClient,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import {
  listOccurrencesBetweenLocalDates,
  listOccurrencesThroughLocalDate,
} from "@/lib/db/occurrences.repo";
import {
  resolveExportBundle,
  resolveExportDateRange,
} from "@/lib/resolvers/export.resolver";
import {
  normalizeRecurrenceRule,
  normalizeScheduledTime,
} from "@/lib/services/behavior-form";
import { syncUserOccurrences } from "@/lib/services/occurrence.service";
import { createClient } from "@/lib/supabase/server";
import type {
  ExportBehaviorInput,
  ExportBundle,
  ExportCategoryInput,
  ExportOccurrenceInput,
  ExportOccurrenceStatus,
} from "@/lib/types/export";
import type { Category, Occurrence } from "@/lib/types/database";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

export type ExportOptions = {
  now?: Temporal.Instant;
  range?: string | number | null;
  includeArchived?: boolean;
};

export type ExportDownloadFormat = "jsonl" | "csv" | "json";

export type ExportDownload = {
  content: string;
  contentType: string;
  fileName: string;
};

export class ExportAuthError extends Error {
  constructor(message = "Sign in again before exporting data.") {
    super(message);
    this.name = "ExportAuthError";
  }
}

export async function getExportPageData(
  options: ExportOptions = {},
): Promise<ExportBundle> {
  return getUserExportBundle(options);
}

export async function getExportDownload(
  format: ExportDownloadFormat,
  options: ExportOptions = {},
): Promise<ExportDownload> {
  const bundle = await getUserExportBundle(options);

  switch (format) {
    case "jsonl":
      return {
        content: bundle.jsonl,
        contentType: "application/x-ndjson; charset=utf-8",
        fileName: `${bundle.fileBaseName}.jsonl`,
      };
    case "csv":
      return {
        content: bundle.csv,
        contentType: "text/csv; charset=utf-8",
        fileName: `${bundle.fileBaseName}.csv`,
      };
    case "json":
      return {
        content: bundle.json,
        contentType: "application/json; charset=utf-8",
        fileName: `${bundle.fileBaseName}.json`,
      };
  }
}

async function getUserExportBundle(
  options: ExportOptions,
): Promise<ExportBundle> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const now = options.now ?? Temporal.Now.instant();
  const profileTimezone = await getProfileTimezone(supabase, userId);
  const timezone = profileTimezone ?? DEFAULT_TIMEZONE;
  const range = resolveExportDateRange({
    now,
    timezone,
    range: options.range,
  });

  await syncUserOccurrences(supabase, userId, { now });

  const [categories, behaviors, occurrences] = await Promise.all([
    listBehaviorCategories(supabase, userId),
    listUserBehaviors(supabase, userId),
    range.startLocalDate
      ? listOccurrencesBetweenLocalDates(
          supabase,
          userId,
          range.startLocalDate,
          range.endLocalDate,
        )
      : listOccurrencesThroughLocalDate(supabase, userId, range.endLocalDate),
  ]);

  return resolveExportBundle({
    profile: {
      timezone,
    },
    categories: categories.map(toExportCategoryInput),
    behaviors: behaviors.map(toExportBehaviorInput),
    occurrences: occurrences.map(toExportOccurrenceInput),
    now,
    timezone,
    range: range.key,
    includeArchived: options.includeArchived,
  });
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ExportAuthError();
  }

  return user.id;
}

function toExportCategoryInput(category: Category): ExportCategoryInput {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sort_order,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  };
}

function toExportBehaviorInput(
  behavior: BehaviorWithCategory,
): ExportBehaviorInput {
  return {
    id: behavior.id,
    categoryId: behavior.category_id,
    categoryName: behavior.category?.name ?? null,
    title: behavior.title,
    description: behavior.description,
    recurrenceRule: normalizeRecurrenceRule(behavior.recurrence_rule),
    scheduledTime: normalizeScheduledTime(behavior.scheduled_time),
    timezone: behavior.timezone || DEFAULT_TIMEZONE,
    browserReminderEnabled: behavior.browser_reminder_enabled,
    emailReminderEnabled: behavior.email_reminder_enabled,
    reminderOffsetMinutes: behavior.reminder_offset_minutes,
    active: behavior.active,
    archivedAt: behavior.archived_at,
    createdAt: behavior.created_at,
    updatedAt: behavior.updated_at,
  };
}

function toExportOccurrenceInput(
  occurrence: Occurrence,
): ExportOccurrenceInput {
  return {
    id: occurrence.id,
    behaviorId: occurrence.behavior_id,
    scheduledFor: occurrence.scheduled_for,
    localDate: occurrence.local_date,
    status: normalizeOccurrenceStatus(occurrence.status),
    completedAt: occurrence.completed_at,
    statusMarkedAt: occurrence.status_marked_at,
    note: occurrence.note,
    createdAt: occurrence.created_at,
    updatedAt: occurrence.updated_at,
  };
}

function normalizeOccurrenceStatus(value: string): ExportOccurrenceStatus {
  if (value === "unresolved" || value === "done" || value === "not_done") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
