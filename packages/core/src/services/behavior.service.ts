import type {
  BehaviorDataStore, BehaviorFields, BehaviorGraphRecord, BehaviorInput,
  BehaviorScheduleGraphMutation,
} from "../behavior-store";
import {
  normalizeBehaviorDefinition, planBehaviorDefinitionChangeEvent,
  planInitialBehaviorDefinitionEvent,
} from "../resolvers/behavior-definition.resolver";
import {
  planBehaviorConfigurationChangeEvent, planInitialBehaviorConfigurationEvent,
} from "../resolvers/behavior-configuration.resolver";
import type { Json } from "../types/json";
import type { BehaviorScheduleInput } from "../types/schedule";

export async function createBehavior(
  store: BehaviorDataStore,
  input: { values: BehaviorInput; userId: string; timezone: string; recordedAt: string },
): Promise<BehaviorGraphRecord> {
  const values = input.values;
  const behavior: BehaviorFields & { user_id: string } = {
    user_id: input.userId,
    category_id: values.categoryId,
    title: values.title,
    description: values.description,
    recurrence_rule: values.recurrenceRule as Json,
    scheduled_time: values.scheduledTime,
    timezone: input.timezone,
    browser_reminder_enabled: values.browserReminderEnabled,
    email_reminder_enabled: values.emailReminderEnabled,
    reminder_offset_minutes: values.reminderOffsetMinutes,
    active: true,
    archived_at: null,
  };
  const definitionEventPlan = planInitialBehaviorDefinitionEvent({
    definition: { title: behavior.title, description: behavior.description },
    recordedAt: input.recordedAt,
    source: "manual",
  });
  const schedules = values.schedules.map(toBehaviorScheduleMutation);
  const configurationEventPlan = planInitialBehaviorConfigurationEvent({
    configuration: toBehaviorConfigurationSnapshot(behavior, schedules),
    recordedAt: input.recordedAt,
    effectiveAt: input.recordedAt,
    source: "manual",
    reasonCode: "behavior_created",
  });
  const created = await store.createBehaviorWithAtomicScheduleGraph({
    behavior: {
      ...behavior,
      title: definitionEventPlan.nextTitle,
      description: definitionEventPlan.nextDescription,
    },
    definitionEventPlan,
    configurationEventPlan,
    schedules,
  });
  const confirmed = await store.getBehaviorById(created.id);
  if (!confirmed) throw new Error("Behavior not found after create.");
  return confirmed;
}

export async function updateBehavior(
  store: BehaviorDataStore,
  input: { behaviorId: string; expectedUpdatedAt: string; values: BehaviorInput; recordedAt: string },
) {
  if (!input.expectedUpdatedAt) throw new Error("Reload this behavior before saving changes.");
  const existing = await requireBehavior(store, input.behaviorId);
  const previousDefinition = normalizeBehaviorDefinition(existing);
  const definitionEventPlan = planBehaviorDefinitionChangeEvent({
    previousDefinition,
    nextDefinition: normalizeBehaviorDefinition(input.values),
    recordedAt: input.recordedAt,
    source: "manual",
  });
  const values = input.values;
  const behavior: BehaviorFields = {
    category_id: values.categoryId,
    title: definitionEventPlan?.nextTitle ?? existing.title,
    description: definitionEventPlan ? definitionEventPlan.nextDescription : existing.description,
    recurrence_rule: values.recurrenceRule as Json,
    scheduled_time: values.scheduledTime,
    browser_reminder_enabled: values.browserReminderEnabled,
    email_reminder_enabled: values.emailReminderEnabled,
    reminder_offset_minutes: values.reminderOffsetMinutes,
    active: values.active,
    archived_at: values.active ? null : existing.archived_at ?? input.recordedAt,
    timezone: existing.timezone,
  };
  const expectedScheduleGraph = toStoredBehaviorScheduleGraph(existing);
  const schedules = values.schedules.map(toBehaviorScheduleMutation);
  const configurationEventPlan = planBehaviorConfigurationChangeEvent({
    previousConfiguration: toBehaviorConfigurationSnapshot(existing, expectedScheduleGraph),
    nextConfiguration: toBehaviorConfigurationSnapshot(behavior, schedules),
    recordedAt: input.recordedAt,
    effectiveAt: input.recordedAt,
    source: "manual",
    reasonCode: "behavior_edited",
  });
  const updated = await store.updateBehaviorWithAtomicScheduleGraph({
    behaviorId: input.behaviorId,
    behavior,
    expectedDefinition: { title: existing.title, description: existing.description },
    expectedNormalizedDefinition: previousDefinition,
    expectedScheduleGraph,
    expectedUpdatedAt: input.expectedUpdatedAt,
    definitionEventPlan,
    configurationEventPlan,
    schedules,
  });
  if (!updated) throw new Error("Behavior not found.");
  return updated;
}

export async function setBehaviorActive(
  store: BehaviorDataStore,
  input: { behaviorId: string; active: boolean; recordedAt: string },
) {
  const existing = await requireBehavior(store, input.behaviorId);
  const schedules = toStoredBehaviorScheduleGraph(existing);
  const expectedDefinition = { title: existing.title, description: existing.description };
  const behavior: BehaviorFields = {
    category_id: existing.category_id,
    title: existing.title,
    description: existing.description,
    recurrence_rule: existing.recurrence_rule,
    scheduled_time: existing.scheduled_time,
    timezone: existing.timezone,
    browser_reminder_enabled: existing.browser_reminder_enabled,
    email_reminder_enabled: existing.email_reminder_enabled,
    reminder_offset_minutes: existing.reminder_offset_minutes,
    active: input.active,
    archived_at: input.active ? null : existing.archived_at ?? input.recordedAt,
  };
  const configurationEventPlan = planBehaviorConfigurationChangeEvent({
    previousConfiguration: toBehaviorConfigurationSnapshot(existing, schedules),
    nextConfiguration: toBehaviorConfigurationSnapshot(behavior, schedules),
    recordedAt: input.recordedAt,
    effectiveAt: input.recordedAt,
    source: "manual",
    reasonCode: input.active ? "behavior_restored" : "behavior_archived",
  });
  const updated = await store.updateBehaviorWithAtomicScheduleGraph({
    behaviorId: existing.id,
    behavior,
    expectedDefinition,
    expectedNormalizedDefinition: normalizeBehaviorDefinition(expectedDefinition),
    expectedScheduleGraph: schedules,
    expectedUpdatedAt: existing.updated_at,
    definitionEventPlan: null,
    configurationEventPlan,
    schedules,
  });
  if (!updated) throw new Error("Behavior not found.");
  return updated;
}

async function requireBehavior(store: BehaviorDataStore, behaviorId: string) {
  const behavior = await store.getBehaviorById(behaviorId);
  if (!behavior) throw new Error("Behavior not found.");
  return behavior;
}

function toBehaviorScheduleMutation(schedule: BehaviorScheduleInput): BehaviorScheduleGraphMutation {
  return {
    id: schedule.id ?? undefined,
    recurrence_rule: schedule.recurrenceRule as Json,
    sort_order: schedule.sortOrder,
    slots: schedule.timeEntries.map((slot) => ({
      id: slot.id ?? undefined,
      kind: slot.kind,
      preset: slot.preset,
      start_time: slot.startTime,
      end_time: slot.endTime,
      sort_order: slot.sortOrder,
    })),
  };
}

export function toStoredBehaviorScheduleGraph(behavior: BehaviorGraphRecord): BehaviorScheduleGraphMutation[] {
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

export function toBehaviorConfigurationSnapshot(behavior: BehaviorFields, schedules: BehaviorScheduleGraphMutation[]) {
  return {
    categoryId: behavior.category_id,
    scheduleGraph: schedules.map((schedule) => ({
      recurrenceRule: schedule.recurrence_rule,
      sortOrder: schedule.sort_order,
      timeEntries: schedule.slots.map((slot) => ({
        kind: slot.kind, preset: slot.preset, startTime: slot.start_time,
        endTime: slot.end_time, sortOrder: slot.sort_order,
      })),
    })),
    browserReminderEnabled: behavior.browser_reminder_enabled,
    emailReminderEnabled: behavior.email_reminder_enabled,
    reminderOffsetMinutes: behavior.reminder_offset_minutes,
    active: behavior.active,
    timezone: behavior.timezone,
  };
}
