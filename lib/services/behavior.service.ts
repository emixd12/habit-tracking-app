import {
  createBehavior,
  getBehaviorById,
  replaceBehaviorSchedules,
  updateBehavior,
  type AppSupabaseClient,
  type BehaviorScheduleWithSlots,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { createClient } from "@/lib/supabase/server";
import { markOccurrenceSyncStale } from "@/lib/services/occurrence-sync-state.service";
import {
  invalidateBehaviorData,
  readCachedBehaviorCategories,
  readCachedProfileTimezone,
  readCachedUserBehaviors,
} from "@/lib/cache/stable-user-data.cache";
import type {
  BehaviorPageData,
  BehaviorView,
  CategoryOption,
} from "@/lib/types/behavior";
import type { BehaviorUpdate, NewBehavior } from "@/lib/types/database";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";
import {
  behaviorErrorToActionState,
  formatScheduledTimeLabel,
  normalizeRecurrenceRule,
  normalizeScheduledTime,
  parseBehaviorFormData,
  recurrenceDefaultsFromRule,
  recurrenceRuleToJson,
  summarizeRecurrenceRule,
  summarizeReminders,
} from "@/lib/services/behavior-form";
import {
  compareScheduleSlots,
  formatScheduleSlotsSummary,
  toScheduleSlotView,
} from "@/lib/services/schedule";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import type {
  BehaviorScheduleInput,
  BehaviorScheduleView,
  ScheduleKind,
  TimeRangePreset,
} from "@/lib/types/schedule";

export { behaviorErrorToActionState };

export async function getBehaviorPageData(): Promise<BehaviorPageData> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const [categories, behaviors, profileTimezone] = await Promise.all([
    readCachedBehaviorCategories(supabase, userId),
    readCachedUserBehaviors(supabase, userId),
    readCachedProfileTimezone(supabase, userId),
  ]);

  const categoryOptions = categories.map(toCategoryOption);
  const behaviorViews = behaviors.map(toBehaviorView);

  return {
    categories: categoryOptions,
    activeBehaviors: behaviorViews.filter((behavior) => behavior.active),
    archivedBehaviors: behaviorViews.filter((behavior) => !behavior.active),
    defaultTimezone: profileTimezone ?? DEFAULT_TIMEZONE,
  };
}

export async function createBehaviorFromFormData(
  formData: FormData,
): Promise<BehaviorView> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const timezone =
    getTimezoneFromFormData(formData) ??
    (await readCachedProfileTimezone(supabase, userId)) ??
    DEFAULT_TIMEZONE;
  const input = parseBehaviorFormData(formData, {
    mode: "create",
  });
  const behavior: NewBehavior = {
    user_id: userId,
    category_id: input.categoryId,
    title: input.title,
    description: input.description,
    recurrence_rule: recurrenceRuleToJson(input.recurrenceRule),
    scheduled_time: input.scheduledTime,
    timezone,
    browser_reminder_enabled: input.browserReminderEnabled,
    email_reminder_enabled: input.emailReminderEnabled,
    reminder_offset_minutes: input.reminderOffsetMinutes,
    active: true,
    archived_at: null,
  };

  const [createdBehavior] = await Promise.all([
    createBehavior(supabase, behavior),
    markOccurrenceSyncStale(supabase, {
      userId,
      reason: "behavior_changed",
      timezone: behavior.timezone,
    }),
  ]);
  await replaceBehaviorSchedules(supabase, {
    userId,
    behaviorId: createdBehavior.id,
    schedules: input.schedules.map(toBehaviorScheduleMutation),
  });
  const confirmedBehavior = await getBehaviorById(
    supabase,
    userId,
    createdBehavior.id,
  );

  if (!confirmedBehavior) {
    throw new Error("Behavior not found after create.");
  }

  invalidateBehaviorData(userId);

  return toBehaviorView(confirmedBehavior);
}

export async function updateBehaviorFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const input = parseBehaviorFormData(formData, {
    mode: "update",
  });
  const existingBehavior = await getBehaviorById(
    supabase,
    userId,
    input.behaviorId,
  );

  if (!existingBehavior) {
    throw new Error("Behavior not found.");
  }

  const behavior: BehaviorUpdate = {
    category_id: input.categoryId,
    title: input.title,
    description: input.description,
    recurrence_rule: recurrenceRuleToJson(input.recurrenceRule),
    scheduled_time: input.scheduledTime,
    browser_reminder_enabled: input.browserReminderEnabled,
    email_reminder_enabled: input.emailReminderEnabled,
    reminder_offset_minutes: input.reminderOffsetMinutes,
    active: input.active,
    archived_at: resolveArchiveTimestamp(existingBehavior, input.active),
  };
  const [updatedBehavior] = await Promise.all([
    updateBehavior(supabase, userId, input.behaviorId, behavior),
    markOccurrenceSyncStale(supabase, {
      userId,
      reason: "behavior_changed",
      timezone: existingBehavior.timezone,
    }),
  ]);

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }

  await replaceBehaviorSchedules(supabase, {
    userId,
    behaviorId: updatedBehavior.id,
    schedules: input.schedules.map(toBehaviorScheduleMutation),
  });
  invalidateBehaviorData(userId);
}

export async function archiveBehaviorFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const behaviorId = getBehaviorIdForArchive(formData);
  const [updatedBehavior] = await Promise.all([
    updateBehavior(supabase, userId, behaviorId, {
      active: false,
      archived_at: new Date().toISOString(),
    }),
    markOccurrenceSyncStale(supabase, {
      userId,
      reason: "behavior_changed",
    }),
  ]);

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }

  invalidateBehaviorData(userId);
}

export async function restoreBehaviorFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const behaviorId = getBehaviorIdForArchive(formData);
  const [updatedBehavior] = await Promise.all([
    updateBehavior(supabase, userId, behaviorId, {
      active: true,
      archived_at: null,
    }),
    markOccurrenceSyncStale(supabase, {
      userId,
      reason: "behavior_changed",
    }),
  ]);

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }

  invalidateBehaviorData(userId);
}

function toBehaviorView(behavior: BehaviorWithCategory): BehaviorView {
  const recurrenceRule = normalizeRecurrenceRule(behavior.recurrence_rule);
  const scheduledTime = normalizeScheduledTime(behavior.scheduled_time);
  const scheduledTimeLabel = formatScheduledTimeLabel(scheduledTime);
  const schedules = toBehaviorScheduleViews(behavior, recurrenceRule, scheduledTime);
  const scheduleSlots = schedules.flatMap((schedule) => schedule.timeEntries);

  return {
    id: behavior.id,
    title: behavior.title,
    description: behavior.description ?? "",
    categoryId: behavior.category_id ?? "",
    categoryName: behavior.category?.name ?? "No category",
    recurrenceSummary:
      schedules.length === 1
        ? schedules[0]?.recurrenceSummary ?? summarizeRecurrenceRule(recurrenceRule)
        : `${schedules.length} schedules`,
    recurrenceDefaults: recurrenceDefaultsFromRule(recurrenceRule),
    scheduledTime,
    scheduledTimeLabel,
    schedules,
    scheduleSlots,
    scheduleSummary:
      formatBehaviorScheduleSummary(schedules) ||
      formatScheduleSlotsSummary(scheduleSlots) ||
      scheduledTimeLabel,
    timezone: behavior.timezone,
    browserReminderEnabled: behavior.browser_reminder_enabled,
    emailReminderEnabled: behavior.email_reminder_enabled,
    reminderOffsetMinutes: behavior.reminder_offset_minutes,
    reminderSummary: summarizeReminders({
      browserReminderEnabled: behavior.browser_reminder_enabled,
      emailReminderEnabled: behavior.email_reminder_enabled,
      reminderOffsetMinutes: behavior.reminder_offset_minutes,
    }),
    active: behavior.active,
    archivedAt: behavior.archived_at,
    createdAt: behavior.created_at,
    updatedAt: behavior.updated_at,
  };
}

function toBehaviorScheduleViews(
  behavior: BehaviorWithCategory,
  fallbackRecurrenceRule: ReturnType<typeof normalizeRecurrenceRule>,
  fallbackScheduledTime: string,
): BehaviorScheduleView[] {
  const schedules = behavior.schedules ?? [];

  if (schedules.length > 0) {
    return schedules
      .map((schedule) => toBehaviorScheduleView(schedule, fallbackScheduledTime))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  const legacySlots =
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
      timeEntries: legacySlots,
      timeSummary: formatScheduleSlotsSummary(legacySlots),
      sortOrder: 0,
    },
  ];
}

function toBehaviorScheduleView(
  schedule: BehaviorScheduleWithSlots,
  fallbackScheduledTime: string,
): BehaviorScheduleView {
  const recurrenceRule = normalizeRecurrenceRule(schedule.recurrence_rule);
  const timeEntries =
    schedule.schedule_slots.length > 0
      ? schedule.schedule_slots
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
          .sort(compareScheduleSlots)
      : [
          toScheduleSlotView({
            id: "",
            scheduleId: schedule.id,
            kind: "exact",
            preset: null,
            startTime: fallbackScheduledTime,
            endTime: null,
            sortOrder: 0,
          }),
        ];

  return {
    id: schedule.id,
    recurrenceRule,
    recurrenceSummary: summarizeRecurrenceRule(recurrenceRule),
    recurrenceDefaults: recurrenceDefaultsFromRule(recurrenceRule),
    timeEntries,
    timeSummary: formatScheduleSlotsSummary(timeEntries),
    sortOrder: schedule.sort_order,
  };
}

function formatBehaviorScheduleSummary(schedules: BehaviorScheduleView[]): string {
  if (schedules.length === 0) {
    return "";
  }

  if (schedules.length === 1) {
    return schedules[0]?.timeSummary ?? "";
  }

  return schedules
    .map(
      (schedule, index) =>
        `Schedule ${index + 1}: ${schedule.recurrenceSummary}, ${schedule.timeSummary}`,
    )
    .join("; ");
}

function toBehaviorScheduleMutation(schedule: BehaviorScheduleInput) {
  return {
    id: schedule.id ?? undefined,
    recurrence_rule: recurrenceRuleToJson(schedule.recurrenceRule),
    sort_order: schedule.sortOrder,
    slots: schedule.timeEntries.map(toBehaviorScheduleSlotMutation),
  };
}

function toBehaviorScheduleSlotMutation(slot: BehaviorScheduleInput["timeEntries"][number]) {
  return {
    id: slot.id ?? undefined,
    kind: slot.kind,
    preset: slot.preset,
    start_time: slot.startTime,
    end_time: slot.endTime,
    sort_order: slot.sortOrder,
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

function toCategoryOption(category: { id: string; name: string }): CategoryOption {
  return {
    id: category.id,
    name: category.name,
  };
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  void supabase;

  return requireCurrentUserId("Sign in again before saving behaviors.");
}

function resolveArchiveTimestamp(
  behavior: BehaviorWithCategory,
  isActive: boolean,
): string | null {
  if (isActive) {
    return null;
  }

  return behavior.archived_at ?? new Date().toISOString();
}

function getBehaviorIdForArchive(formData: FormData): string {
  const value = formData.get("behavior_id");

  if (typeof value !== "string" || !value) {
    throw new Error("Choose an existing behavior to archive.");
  }

  return value;
}

function getTimezoneFromFormData(formData: FormData): string | null {
  const value = formData.get("timezone");

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return canonicalizeTimezone(value.trim());
}

function canonicalizeTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone })
      .resolvedOptions()
      .timeZone;
  } catch {
    throw new Error("Behavior timezone is invalid.");
  }
}
