import {
  createBehavior,
  createBehaviorScheduleSlots,
  getBehaviorById,
  getProfileTimezone,
  listBehaviorCategories,
  listUserBehaviors,
  replaceBehaviorScheduleSlots,
  updateBehavior,
  type AppSupabaseClient,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { createClient } from "@/lib/supabase/server";
import { markOccurrenceSyncStale } from "@/lib/services/occurrence-sync-state.service";
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
import type { ScheduleKind, TimeRangePreset } from "@/lib/types/schedule";

export { behaviorErrorToActionState };

export async function getBehaviorPageData(): Promise<BehaviorPageData> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const [categories, behaviors, profileTimezone] = await Promise.all([
    listBehaviorCategories(supabase, userId),
    listUserBehaviors(supabase, userId),
    getProfileTimezone(supabase, userId),
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
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const timezone =
    getTimezoneFromFormData(formData) ??
    (await getProfileTimezone(supabase, userId)) ??
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
  await createBehaviorScheduleSlots(
    supabase,
    input.scheduleSlots.map((slot) => ({
      ...toBehaviorScheduleSlotMutation(slot),
      user_id: userId,
      behavior_id: createdBehavior.id,
    })),
  );
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

  await replaceBehaviorScheduleSlots(supabase, {
    userId,
    behaviorId: updatedBehavior.id,
    slots: input.scheduleSlots.map(toBehaviorScheduleSlotMutation),
  });
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
}

function toBehaviorView(behavior: BehaviorWithCategory): BehaviorView {
  const recurrenceRule = normalizeRecurrenceRule(behavior.recurrence_rule);
  const scheduledTime = normalizeScheduledTime(behavior.scheduled_time);
  const scheduledTimeLabel = formatScheduledTimeLabel(scheduledTime);
  const scheduleSlots =
    behavior.schedule_slots.length > 0
      ? behavior.schedule_slots
          .map((slot) =>
            toScheduleSlotView({
              id: slot.id,
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
            id: `${behavior.id}-scheduled-time`,
            kind: "exact",
            preset: null,
            startTime: scheduledTime,
            endTime: null,
            sortOrder: 0,
          }),
        ];

  return {
    id: behavior.id,
    title: behavior.title,
    description: behavior.description ?? "",
    categoryId: behavior.category_id ?? "",
    categoryName: behavior.category?.name ?? "No category",
    recurrenceSummary: summarizeRecurrenceRule(recurrenceRule),
    recurrenceDefaults: recurrenceDefaultsFromRule(recurrenceRule),
    scheduledTime,
    scheduledTimeLabel,
    scheduleSlots,
    scheduleSummary: formatScheduleSlotsSummary(scheduleSlots) || scheduledTimeLabel,
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

function toBehaviorScheduleSlotMutation(
  slot: ReturnType<typeof parseBehaviorFormData>["scheduleSlots"][number],
) {
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
