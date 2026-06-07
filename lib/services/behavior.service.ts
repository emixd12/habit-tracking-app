import {
  createBehavior,
  getBehaviorById,
  getProfileTimezone,
  listBehaviorCategories,
  listUserBehaviors,
  updateBehavior,
  type AppSupabaseClient,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { createClient } from "@/lib/supabase/server";
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
  const [categories, profileTimezone] = await Promise.all([
    listBehaviorCategories(supabase, userId),
    getProfileTimezone(supabase, userId),
  ]);
  const input = parseBehaviorFormData(formData, {
    mode: "create",
    categories: categories.map(toCategoryOption),
  });
  const behavior: NewBehavior = {
    user_id: userId,
    category_id: input.categoryId,
    title: input.title,
    description: input.description,
    recurrence_rule: recurrenceRuleToJson(input.recurrenceRule),
    scheduled_time: input.scheduledTime,
    timezone: profileTimezone ?? DEFAULT_TIMEZONE,
    browser_reminder_enabled: input.browserReminderEnabled,
    email_reminder_enabled: input.emailReminderEnabled,
    reminder_offset_minutes: input.reminderOffsetMinutes,
    active: true,
    archived_at: null,
  };

  await createBehavior(supabase, behavior);
}

export async function updateBehaviorFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const categories = await listBehaviorCategories(supabase, userId);
  const input = parseBehaviorFormData(formData, {
    mode: "update",
    categories: categories.map(toCategoryOption),
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
  const updatedBehavior = await updateBehavior(
    supabase,
    userId,
    input.behaviorId,
    behavior,
  );

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }
}

export async function archiveBehaviorFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const behaviorId = getBehaviorIdForArchive(formData);
  const updatedBehavior = await updateBehavior(supabase, userId, behaviorId, {
    active: false,
    archived_at: new Date().toISOString(),
  });

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }
}

function toBehaviorView(behavior: BehaviorWithCategory): BehaviorView {
  const recurrenceRule = normalizeRecurrenceRule(behavior.recurrence_rule);
  const scheduledTime = normalizeScheduledTime(behavior.scheduled_time);

  return {
    id: behavior.id,
    title: behavior.title,
    description: behavior.description ?? "",
    categoryId: behavior.category_id ?? "",
    categoryName: behavior.category?.name ?? "No category",
    recurrenceSummary: summarizeRecurrenceRule(recurrenceRule),
    recurrenceDefaults: recurrenceDefaultsFromRule(recurrenceRule),
    scheduledTime,
    scheduledTimeLabel: formatScheduledTimeLabel(scheduledTime),
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

function toCategoryOption(category: { id: string; name: string }): CategoryOption {
  return {
    id: category.id,
    name: category.name,
  };
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Sign in again before saving behaviors.");
  }

  return user.id;
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
