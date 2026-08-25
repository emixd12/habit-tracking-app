import {
  getBehaviorById,
  listUserBehaviors,
  type AppSupabaseClient,
  type BehaviorScheduleWithSlots,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import {
  createBehaviorWithAtomicScheduleGraph,
  updateBehaviorWithAtomicScheduleGraph,
  type BehaviorScheduleGraphMutation,
} from "@/lib/db/behaviorDefinitionEvents.repo";
import { createClient } from "@/lib/supabase/server";
import { syncUserOccurrencesAndReminders } from "@/lib/services/occurrence.service";
import { reportMonitoringError } from "@/lib/monitoring/privacy-safe-events";
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
import type { Behavior, BehaviorUpdate, NewBehavior } from "@/lib/types/database";
import {
  planBehaviorDefinitionChangeEvent,
  planInitialBehaviorDefinitionEvent,
  normalizeBehaviorDefinition,
} from "@/lib/resolvers/behavior-definition.resolver";
import {
  planBehaviorConfigurationChangeEvent,
  planInitialBehaviorConfigurationEvent,
} from "@/lib/resolvers/behavior-configuration.resolver";
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
  const recordedAt = new Date().toISOString();

  const initialDefinitionEvent = planInitialBehaviorDefinitionEvent({
    definition: {
      title: behavior.title,
      description: behavior.description ?? null,
    },
    recordedAt,
    source: "manual",
  });
  const schedules = input.schedules.map(toBehaviorScheduleMutation);
  const initialConfigurationEvent = planInitialBehaviorConfigurationEvent({
    configuration: toBehaviorConfigurationSnapshot(behavior, schedules),
    recordedAt,
    effectiveAt: recordedAt,
    source: "manual",
    reasonCode: "behavior_created",
  });
  const createdBehavior = await createBehaviorWithAtomicScheduleGraph(supabase, {
    behavior: {
      ...behavior,
      title: initialDefinitionEvent.nextTitle,
      description: initialDefinitionEvent.nextDescription,
    },
    definitionEventPlan: initialDefinitionEvent,
    configurationEventPlan: initialConfigurationEvent,
    schedules,
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
  await syncBehaviorGraphForUser(supabase, userId, "create");

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

  const previousDefinition = normalizeBehaviorDefinition({
    title: existingBehavior.title,
    description: existingBehavior.description,
  });
  const nextDefinition = normalizeBehaviorDefinition({
    title: input.title,
    description: input.description,
  });
  const recordedAt = new Date().toISOString();
  const definitionEvent = planBehaviorDefinitionChangeEvent({
    previousDefinition,
    nextDefinition,
    recordedAt,
    source: "manual",
  });
  const behavior: BehaviorUpdate = {
    category_id: input.categoryId,
    title: definitionEvent?.nextTitle ?? existingBehavior.title,
    description:
      definitionEvent?.nextDescription ?? existingBehavior.description,
    recurrence_rule: recurrenceRuleToJson(input.recurrenceRule),
    scheduled_time: input.scheduledTime,
    browser_reminder_enabled: input.browserReminderEnabled,
    email_reminder_enabled: input.emailReminderEnabled,
    reminder_offset_minutes: input.reminderOffsetMinutes,
    active: input.active,
    archived_at: resolveArchiveTimestamp(existingBehavior, input.active),
    timezone: existingBehavior.timezone,
  };
  const schedules = input.schedules.map(toBehaviorScheduleMutation);
  const configurationEvent = planBehaviorConfigurationChangeEvent({
    previousConfiguration: toBehaviorConfigurationSnapshot(
      existingBehavior,
      toStoredBehaviorScheduleGraph(existingBehavior),
    ),
    nextConfiguration: toBehaviorConfigurationSnapshot(
      {
        ...existingBehavior,
        ...behavior,
      },
      schedules,
    ),
    recordedAt,
    effectiveAt: recordedAt,
    source: "manual",
    reasonCode: "behavior_edited",
  });
  const updatedBehavior = await updateBehaviorWithAtomicScheduleGraph(supabase, {
    behaviorId: input.behaviorId,
    behavior,
    expectedDefinition: {
      title: existingBehavior.title,
      description: existingBehavior.description,
    },
    expectedNormalizedDefinition: previousDefinition,
    expectedScheduleGraph: toStoredBehaviorScheduleGraph(existingBehavior),
    expectedUpdatedAt: existingBehavior.updated_at,
    definitionEventPlan: definitionEvent,
    configurationEventPlan: configurationEvent,
    schedules,
  });

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }

  invalidateBehaviorData(userId);
  await syncBehaviorGraphForUser(
    supabase,
    userId,
    "update",
  );
}

export async function archiveBehaviorFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const behaviorId = getBehaviorIdForArchive(formData);
  const existingBehavior = await requireBehaviorForLifecycleChange(
    supabase,
    userId,
    behaviorId,
  );

  const updatedBehavior = await updateBehaviorLifecycleStateAtomically(
    supabase,
    existingBehavior,
    false,
  );

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }

  invalidateBehaviorData(userId);
  await syncBehaviorGraphForUser(
    supabase,
    userId,
    "archive",
  );
}

export async function restoreBehaviorFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const behaviorId = getBehaviorIdForArchive(formData);
  const existingBehavior = await requireBehaviorForLifecycleChange(
    supabase,
    userId,
    behaviorId,
  );

  const updatedBehavior = await updateBehaviorLifecycleStateAtomically(
    supabase,
    existingBehavior,
    true,
  );

  if (!updatedBehavior) {
    throw new Error("Behavior not found.");
  }

  invalidateBehaviorData(userId);
  await syncBehaviorGraphForUser(
    supabase,
    userId,
    "restore",
  );
}

async function requireBehaviorForLifecycleChange(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
): Promise<BehaviorWithCategory> {
  const behavior = await getBehaviorById(supabase, userId, behaviorId);

  if (!behavior) {
    throw new Error("Behavior not found.");
  }

  return behavior;
}

async function updateBehaviorLifecycleStateAtomically(
  supabase: AppSupabaseClient,
  existingBehavior: BehaviorWithCategory,
  active: boolean,
): Promise<Behavior | null> {
  const expectedScheduleGraph =
    toStoredBehaviorScheduleGraph(existingBehavior);
  const expectedDefinition = {
    title: existingBehavior.title,
    description: existingBehavior.description,
  };
  const recordedAt = new Date().toISOString();
  const nextBehavior: BehaviorUpdate = {
    category_id: existingBehavior.category_id,
    title: existingBehavior.title,
    description: existingBehavior.description,
    recurrence_rule: existingBehavior.recurrence_rule,
    scheduled_time: existingBehavior.scheduled_time,
    timezone: existingBehavior.timezone,
    browser_reminder_enabled: existingBehavior.browser_reminder_enabled,
    email_reminder_enabled: existingBehavior.email_reminder_enabled,
    reminder_offset_minutes: existingBehavior.reminder_offset_minutes,
    active,
    archived_at: active ? null : existingBehavior.archived_at ?? recordedAt,
  };
  const configurationEvent = planBehaviorConfigurationChangeEvent({
    previousConfiguration: toBehaviorConfigurationSnapshot(
      existingBehavior,
      expectedScheduleGraph,
    ),
    nextConfiguration: toBehaviorConfigurationSnapshot(
      { ...existingBehavior, ...nextBehavior },
      expectedScheduleGraph,
    ),
    recordedAt,
    effectiveAt: recordedAt,
    source: "manual",
    reasonCode: active ? "behavior_restored" : "behavior_archived",
  });

  return updateBehaviorWithAtomicScheduleGraph(supabase, {
    behaviorId: existingBehavior.id,
    behavior: nextBehavior,
    expectedDefinition,
    expectedNormalizedDefinition:
      normalizeBehaviorDefinition(expectedDefinition),
    expectedScheduleGraph,
    expectedUpdatedAt: existingBehavior.updated_at,
    definitionEventPlan: null,
    configurationEventPlan: configurationEvent,
    schedules: expectedScheduleGraph,
  });
}

async function syncBehaviorGraphForUser(
  supabase: AppSupabaseClient,
  userId: string,
  operation: "create" | "update" | "archive" | "restore",
): Promise<void> {
  const syncTimezone = await readAuthoritativeProfileTimezone(
    supabase,
    userId,
    operation,
  );

  if (!syncTimezone) {
    return;
  }

  try {
    const behaviors = await listUserBehaviors(supabase, userId);

    await syncUserOccurrencesAndReminders(supabase, userId, {
      behaviors,
      timezone: syncTimezone,
    });
  } catch (error) {
    reportBehaviorGraphErrorSafely(
      "behavior_graph_post_write_sync_failed",
      error,
      operation,
    );
  }
}

async function readAuthoritativeProfileTimezone(
  supabase: AppSupabaseClient,
  userId: string,
  operation: "create" | "update" | "archive" | "restore",
): Promise<string | null> {
  try {
    const timezone = await readCachedProfileTimezone(supabase, userId);

    if (!timezone) {
      reportBehaviorGraphErrorSafely(
        "behavior_graph_profile_timezone_missing",
        new Error("Profile timezone is unavailable for behavior graph repair."),
        operation,
      );
      return null;
    }

    return timezone;
  } catch (error) {
    reportBehaviorGraphErrorSafely(
      "behavior_graph_profile_timezone_read_failed",
      error,
      operation,
    );
    return null;
  }
}

function reportBehaviorGraphErrorSafely(
  name: string,
  error: unknown,
  operation: "create" | "update" | "archive" | "restore",
): void {
  try {
    reportMonitoringError(name, error, { operation });
  } catch {
    // Monitoring must never change the result of a product write.
  }
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

function toBehaviorScheduleMutation(
  schedule: BehaviorScheduleInput,
): BehaviorScheduleGraphMutation {
  return {
    id: schedule.id ?? undefined,
    recurrence_rule: recurrenceRuleToJson(schedule.recurrenceRule),
    sort_order: schedule.sortOrder,
    slots: schedule.timeEntries.map(toBehaviorScheduleSlotMutation),
  };
}

function toStoredBehaviorScheduleGraph(
  behavior: BehaviorWithCategory,
): BehaviorScheduleGraphMutation[] {
  return (behavior.schedules ?? []).map((schedule) => ({
    id: schedule.id,
    recurrence_rule: schedule.recurrence_rule,
    sort_order: schedule.sort_order,
    slots: schedule.schedule_slots.map((slot) => ({
      id: slot.id,
      kind: slot.kind,
      preset: slot.preset,
      start_time: slot.start_time,
      end_time: slot.end_time,
      sort_order: slot.sort_order,
    })),
  }));
}

function toBehaviorConfigurationSnapshot(
  behavior: {
    category_id?: string | null;
    browser_reminder_enabled?: boolean;
    email_reminder_enabled?: boolean;
    reminder_offset_minutes?: number;
    active?: boolean;
    timezone?: string;
  },
  schedules: BehaviorScheduleGraphMutation[],
) {
  return {
    categoryId: behavior.category_id ?? null,
    scheduleGraph: schedules.map((schedule) => ({
      recurrenceRule: schedule.recurrence_rule,
      sortOrder: schedule.sort_order,
      timeEntries: schedule.slots.map((slot) => ({
        kind: slot.kind,
        preset: slot.preset,
        startTime: slot.start_time,
        endTime: slot.end_time,
        sortOrder: slot.sort_order,
      })),
    })),
    browserReminderEnabled: behavior.browser_reminder_enabled ?? true,
    emailReminderEnabled: behavior.email_reminder_enabled ?? false,
    reminderOffsetMinutes: behavior.reminder_offset_minutes ?? 0,
    active: behavior.active ?? true,
    timezone: behavior.timezone ?? DEFAULT_TIMEZONE,
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
