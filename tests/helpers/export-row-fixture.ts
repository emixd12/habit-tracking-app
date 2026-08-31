export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";

export function storedBehavior() {
  return {
    id: BEHAVIOR_ID,
    user_id: USER_ID,
    category_id: null,
    title: "Brush teeth",
    description: "Night brushing",
    recurrence_rule: { frequency: "daily", interval: 1 },
    scheduled_time: "22:00",
    timezone: "America/New_York",
    browser_reminder_enabled: true,
    email_reminder_enabled: false,
    reminder_offset_minutes: 0,
    active: true,
    archived_at: null,
    current_configuration_event_id: "configuration-1",
    created_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-01T12:00:00Z",
    category: null,
    schedules: [],
    schedule_slots: [],
  };
}

export function storedExportPageBehavior() {
  return {
    ...storedBehavior(),
    category: null,
    schedule_slots: [],
  };
}

export function storedConfigurationEvent() {
  return {
    id: "configuration-1",
    user_id: USER_ID,
    behavior_id: BEHAVIOR_ID,
    event_kind: "baseline",
    previous_configuration: null,
    next_configuration: {
      category_id: null,
      schedule_graph: [
        {
          recurrence_rule: { frequency: "daily", interval: 1 },
          sort_order: 0,
          time_entries: [
            {
              kind: "exact",
              preset: null,
              start_time: "22:00:00",
              end_time: null,
              sort_order: 0,
            },
          ],
        },
      ],
      browser_reminder_enabled: true,
      email_reminder_enabled: false,
      reminder_offset_minutes: 0,
      active: true,
      timezone: "America/New_York",
    },
    changed_fields: [
      "category_id",
      "schedule_graph",
      "browser_reminder_enabled",
      "email_reminder_enabled",
      "reminder_offset_minutes",
      "active",
      "timezone",
    ],
    recorded_at: "2026-05-01T12:00:00Z",
    effective_at: "2026-05-01T12:00:00Z",
    effective_local_date: "2026-05-01",
    timezone: "America/New_York",
    source: "system",
    reason_code: "history_capture_started",
    created_at: "2026-05-01T12:00:00Z",
  };
}

export function storedExportOccurrence() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    behavior_id: BEHAVIOR_ID,
    behavior_schedule_slot_id: null,
    behavior_configuration_event_id: "configuration-1",
    scheduled_for: "2026-05-01T22:00:00Z",
    local_date: "2026-05-01",
    schedule_kind: "exact",
    schedule_preset: null,
    schedule_start_time: "22:00:00",
    schedule_end_time: null,
    status: "unresolved",
    completed_at: null,
    status_marked_at: null,
    note: null,
    created_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-01T12:00:00Z",
  };
}

export function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
