import type { BehaviorGraphRecord, BehaviorInput } from "../../packages/core/src/behavior-store";

export const recordedAt = "2026-08-30T16:00:00.000Z";
const schedule = {
  id: "schedule", user_id: "owner", behavior_id: "behavior",
  recurrence_rule: { frequency: "daily", interval: 1 }, sort_order: 0,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  schedule_slots: [{
    id: "slot", user_id: "owner", behavior_id: "behavior", behavior_schedule_id: "schedule",
    kind: "exact", preset: null, start_time: "09:00", end_time: null, sort_order: 0,
    created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  }],
};
export const stored: BehaviorGraphRecord = {
  id: "behavior", user_id: "owner", category_id: null, title: "Read",
  description: "A chapter", recurrence_rule: { frequency: "daily", interval: 1 },
  scheduled_time: "09:00", timezone: "America/New_York", browser_reminder_enabled: true,
  email_reminder_enabled: false, reminder_offset_minutes: 0, active: true, archived_at: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-29T00:00:00Z",
  current_configuration_event_id: "configuration", category: null,
  schedules: [schedule], schedule_slots: schedule.schedule_slots,
};
export const values: BehaviorInput = {
  title: "Read", description: "A chapter", categoryId: null,
  recurrenceRule: { frequency: "daily", interval: 1 }, scheduledTime: "09:00",
  browserReminderEnabled: true, emailReminderEnabled: false, reminderOffsetMinutes: 0, active: true,
  schedules: [{
    id: "schedule", recurrenceRule: { frequency: "daily", interval: 1 }, sortOrder: 0,
    timeEntries: [{ id: "slot", kind: "exact", preset: null, startTime: "09:00", endTime: null, sortOrder: 0 }],
  }],
};
