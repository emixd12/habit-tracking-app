import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";

import type {
  AppSupabaseClient,
  BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import {
  readExportPageBundle,
  type ExportPageCategoryRow,
  type ExportPageOccurrenceRow,
  type ExportPageReminderDeliveryRow,
  type ExportPageStatusEventRow,
  type ExportPageSyncStateRow,
} from "@/lib/db/exportPageRead.repo";
import {
  resolveExportBundle,
  resolveExportDateRange,
} from "@/lib/resolvers/export.resolver";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import {
  normalizeRecurrenceRule,
  recurrenceDefaultsFromRule,
  normalizeScheduledTime,
  summarizeRecurrenceRule,
} from "@/lib/services/behavior-form";
import { ensureUserOccurrencesFresh } from "@/lib/services/occurrence.service";
import {
  compareScheduleSlots,
  formatScheduleSlotsSummary,
  formatOccurrenceScheduleLabel,
  toScheduleSlotView,
} from "@/lib/services/schedule";
import { createStoredZip } from "@/lib/services/zip";
import { createClient } from "@/lib/supabase/server";
import {
  readCachedProfileTimezone,
  readCachedUserBehaviors,
} from "@/lib/cache/stable-user-data.cache";
import type {
  ExportBehaviorInput,
  ExportBundle,
  ExportCategoryInput,
  ExportOccurrenceInput,
  ExportOccurrenceStatus,
  ExportReminderDeliveryChannel,
  ExportReminderDeliveryInput,
  ExportReminderDeliveryStatus,
  ExportStatusEventInput,
} from "@/lib/types/export";
import type { OccurrenceSyncState } from "@/lib/types/database";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";
import type {
  BehaviorScheduleView,
  ScheduleKind,
  TimeRangePreset,
} from "@/lib/types/schedule";

export type ExportOptions = {
  now?: Temporal.Instant;
  range?: string | number | null;
  includeArchived?: boolean;
  includeNotes?: boolean;
};

export type ExportDownloadFormat = "jsonl" | "csv" | "json" | "behaviorlog";

export type ExportDownload = {
  content: BodyInit;
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
    case "behaviorlog": {
      const zipBytes = Uint8Array.from(createStoredZip(bundle.behaviorLog.files));

      return {
        content: new Blob([zipBytes], { type: "application/zip" }),
        contentType: "application/zip",
        fileName: bundle.behaviorLog.fileName,
      };
    }
  }
}

async function getUserExportBundle(
  options: ExportOptions,
): Promise<ExportBundle> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const now = options.now ?? Temporal.Now.instant();
  const [profileTimezone, cachedBehaviors] = await Promise.all([
    readCachedProfileTimezone(supabase, userId),
    readCachedUserBehaviors(supabase, userId),
  ]);
  const timezone = profileTimezone ?? DEFAULT_TIMEZONE;
  const range = resolveExportDateRange({
    now,
    timezone,
    range: options.range,
  });
  const initialRead = await readExportPageBundle(supabase, {
    startLocalDate: range.startLocalDate,
    endLocalDate: range.endLocalDate,
  });

  const syncResult = await ensureUserOccurrencesFresh(supabase, userId, {
    now,
    behaviors: cachedBehaviors,
    timezone,
    horizonDays: 0,
    syncState: toSyncState(initialRead.syncState, userId),
  });
  const exportRead = syncResult.synced
    ? await readExportPageBundle(supabase, {
        startLocalDate: range.startLocalDate,
        endLocalDate: range.endLocalDate,
      })
    : initialRead;

  return resolveExportBundle({
    profile: {
      timezone,
      subjectId: pseudonymousSubjectId(userId),
      locale: "en-US",
      producerName: "Cadence Tracker",
      producerVersion: "0.1.0",
    },
    categories: exportRead.categories.map(toExportCategoryInput),
    behaviors: cachedBehaviors.map(toExportBehaviorInput),
    occurrences: exportRead.occurrences.map(toExportOccurrenceInput),
    statusEvents: exportRead.statusEvents.map(toExportStatusEventInput),
    reminderDeliveries: exportRead.reminderDeliveries.map(
      toExportReminderDeliveryInput,
    ),
    now,
    timezone,
    range: range.key,
    includeArchived: options.includeArchived,
    includeNotes: options.includeNotes,
  });
}

function toExportReminderDeliveryInput(
  delivery: ExportPageReminderDeliveryRow,
): ExportReminderDeliveryInput {
  return {
    id: delivery.id,
    occurrenceId: delivery.occurrence_id,
    channel: normalizeReminderChannel(delivery.channel),
    scheduledSendAt: delivery.scheduled_send_at,
    sentAt: delivery.sent_at,
    status: normalizeReminderDeliveryStatus(delivery.status),
    error: delivery.error,
    processingStartedAt: delivery.processing_started_at,
    createdAt: delivery.created_at,
    updatedAt: delivery.updated_at,
  };
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  void supabase;

  try {
    return await requireCurrentUserId("Sign in again before exporting data.");
  } catch {
    throw new ExportAuthError();
  }
}

function toExportCategoryInput(category: ExportPageCategoryRow): ExportCategoryInput {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sort_order,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  };
}

function toExportBehaviorInput(behavior: BehaviorWithCategory): ExportBehaviorInput {
  const recurrenceRule = normalizeRecurrenceRule(behavior.recurrence_rule);
  const scheduledTime = normalizeScheduledTime(behavior.scheduled_time);
  const schedules = toExportBehaviorSchedules(
    behavior,
    recurrenceRule,
    scheduledTime,
  );

  return {
    id: behavior.id,
    categoryId: behavior.category_id,
    categoryName: behavior.category?.name ?? null,
    title: behavior.title,
    description: behavior.description,
    recurrenceRule,
    scheduledTime,
    schedules,
    scheduleSlots: schedules.flatMap((schedule) => schedule.timeEntries),
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

function toExportBehaviorSchedules(
  behavior: BehaviorWithCategory,
  fallbackRecurrenceRule: ExportBehaviorInput["recurrenceRule"],
  fallbackScheduledTime: string,
): BehaviorScheduleView[] {
  const schedules = behavior.schedules ?? [];

  if (schedules.length > 0) {
    return schedules
      .map((schedule) => {
        const recurrenceRule = normalizeRecurrenceRule(schedule.recurrence_rule);
        const timeEntries = schedule.schedule_slots
          .map((slot) =>
            toScheduleSlotView({
              id: slot.id,
              scheduleId: slot.behavior_schedule_id ?? schedule.id,
              kind: normalizeScheduleKind(slot.kind),
              preset: normalizeSchedulePreset(slot.preset),
              startTime: slot.start_time,
              endTime: slot.end_time,
              sortOrder: slot.sort_order,
            }),
          )
          .sort(compareScheduleSlots);

        return {
          id: schedule.id,
          recurrenceRule,
          recurrenceSummary: summarizeRecurrenceRule(recurrenceRule),
          recurrenceDefaults: recurrenceDefaultsFromRule(recurrenceRule),
          timeEntries,
          timeSummary: formatScheduleSlotsSummary(timeEntries),
          sortOrder: schedule.sort_order,
        };
      })
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  const timeEntries =
    behavior.schedule_slots.length > 0
      ? behavior.schedule_slots
          .map((slot) =>
            toScheduleSlotView({
              id: slot.id,
              scheduleId: slot.behavior_schedule_id,
              kind: normalizeScheduleKind(slot.kind),
              preset: normalizeSchedulePreset(slot.preset),
              startTime: slot.start_time,
              endTime: slot.end_time,
              sortOrder: slot.sort_order,
            }),
          )
          .sort(compareScheduleSlots)
      : [
          toScheduleSlotView({
            id: "",
            scheduleId: null,
            kind: "exact",
            preset: null,
            startTime: fallbackScheduledTime,
            endTime: null,
            sortOrder: 0,
          }),
        ];

  return [
    {
      id: "",
      recurrenceRule: fallbackRecurrenceRule,
      recurrenceSummary: summarizeRecurrenceRule(fallbackRecurrenceRule),
      recurrenceDefaults: recurrenceDefaultsFromRule(fallbackRecurrenceRule),
      timeEntries,
      timeSummary: formatScheduleSlotsSummary(timeEntries),
      sortOrder: 0,
    },
  ];
}

function toExportOccurrenceInput(
  occurrence: ExportPageOccurrenceRow,
): ExportOccurrenceInput {
  return {
    id: occurrence.id,
    behaviorId: occurrence.behavior_id,
    behaviorScheduleSlotId: occurrence.behavior_schedule_slot_id,
    scheduledFor: occurrence.scheduled_for,
    scheduledTimeLabel: formatOccurrenceScheduleLabel({
      scheduleKind: normalizeScheduleKind(occurrence.schedule_kind),
      schedulePreset: normalizeSchedulePreset(occurrence.schedule_preset),
      scheduleStartTime: normalizeScheduledTime(occurrence.schedule_start_time),
      scheduleEndTime: occurrence.schedule_end_time
        ? normalizeScheduledTime(occurrence.schedule_end_time)
        : null,
    }),
    scheduleKind: normalizeScheduleKind(occurrence.schedule_kind),
    schedulePreset: normalizeSchedulePreset(occurrence.schedule_preset),
    scheduleStartTime: normalizeScheduledTime(occurrence.schedule_start_time),
    scheduleEndTime: occurrence.schedule_end_time
      ? normalizeScheduledTime(occurrence.schedule_end_time)
      : null,
    localDate: occurrence.local_date,
    status: normalizeOccurrenceStatus(occurrence.status),
    completedAt: occurrence.completed_at,
    statusMarkedAt: occurrence.status_marked_at,
    note: occurrence.note,
    createdAt: occurrence.created_at,
    updatedAt: occurrence.updated_at,
  };
}

function toExportStatusEventInput(
  event: ExportPageStatusEventRow,
): ExportStatusEventInput {
  return {
    id: event.id,
    occurrenceId: event.occurrence_id,
    behaviorId: event.behavior_id,
    previousStatus: normalizeNullableOccurrenceStatus(event.previous_status),
    status: normalizeOccurrenceStatus(event.status),
    statusSemantics: normalizeStatusSemantics(event.status_semantics),
    recordedAt: event.recorded_at,
    effectiveAt: event.effective_at,
    localDate: event.local_date,
    timezone: event.timezone || DEFAULT_TIMEZONE,
    sourceCaptureMethod: normalizeSourceCaptureMethod(
      event.source_capture_method,
    ),
    sourceConfidence: normalizeSourceConfidence(event.source_confidence),
    revisesEventId: event.revises_event_id,
    reasonCode: event.reason_code,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

function normalizeScheduleKind(value: string): ScheduleKind {
  if (value === "exact" || value === "range") {
    return value;
  }

  throw new Error(`Unsupported schedule kind: ${value}.`);
}

function normalizeSchedulePreset(value: string | null): TimeRangePreset | null {
  if (
    value === null ||
    value === "morning" ||
    value === "afternoon" ||
    value === "evening" ||
    value === "night"
  ) {
    return value;
  }

  throw new Error(`Unsupported schedule preset: ${value}.`);
}

function normalizeOccurrenceStatus(value: string): ExportOccurrenceStatus {
  if (value === "unresolved" || value === "completed" || value === "not_completed") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}

function normalizeNullableOccurrenceStatus(
  value: string | null,
): ExportOccurrenceStatus | null {
  return value ? normalizeOccurrenceStatus(value) : null;
}

function normalizeStatusSemantics(
  value: string,
): ExportStatusEventInput["statusSemantics"] {
  if (
    value === "explicit_user_mark" ||
    value === "explicit_user_correction" ||
    value === "imported_explicit" ||
    value === "system_rule_declared" ||
    value === "ambiguous_import"
  ) {
    return value;
  }

  throw new Error(`Unsupported status semantics: ${value}.`);
}

function normalizeSourceCaptureMethod(
  value: string,
): ExportStatusEventInput["sourceCaptureMethod"] {
  if (
    value === "manual_tap" ||
    value === "manual_text" ||
    value === "system_generated" ||
    value === "imported" ||
    value === "inferred" ||
    value === "derived" ||
    value === "ai_generated" ||
    value === "unknown"
  ) {
    return value;
  }

  throw new Error(`Unsupported source capture method: ${value}.`);
}

function normalizeSourceConfidence(
  value: string,
): ExportStatusEventInput["sourceConfidence"] {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "ambiguous" ||
    value === "unknown"
  ) {
    return value;
  }

  throw new Error(`Unsupported source confidence: ${value}.`);
}

function normalizeReminderChannel(value: string): ExportReminderDeliveryChannel {
  if (value === "browser_push" || value === "email") {
    return value;
  }

  throw new Error(`Unsupported reminder channel: ${value}.`);
}

function normalizeReminderDeliveryStatus(
  value: string,
): ExportReminderDeliveryStatus {
  if (
    value === "pending" ||
    value === "sent" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new Error(`Unsupported reminder delivery status: ${value}.`);
}

function pseudonymousSubjectId(userId: string): string {
  return `subject_${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;
}

function toSyncState(
  syncState: ExportPageSyncStateRow | null,
  userId: string,
): OccurrenceSyncState | null {
  return syncState ? { ...syncState, user_id: userId } : null;
}
