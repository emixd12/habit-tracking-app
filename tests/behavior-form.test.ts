import { describe, expect, it } from "vitest";

import {
  BehaviorValidationError,
  normalizeRecurrenceRule,
  parseBehaviorFormData,
  recurrenceDefaultsFromRule,
  summarizeRecurrenceRule,
} from "../lib/services/behavior-form";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";
const categories = [{ id: CATEGORY_ID, name: "Grooming" }];

function formData(entries: Array<[string, string]>): FormData {
  const form = new FormData();

  for (const [key, value] of entries) {
    form.append(key, value);
  }

  return form;
}

describe("parseBehaviorFormData", () => {
  it("maps create form fields into a behavior mutation with reminder defaults", () => {
    const result = parseBehaviorFormData(
      formData([
        ["title", " Brush teeth "],
        ["description", " Evening routine "],
        ["category_id", CATEGORY_ID],
        ["scheduled_time", "22:00"],
        ["recurrence_kind", "daily"],
        ["daily_interval", "1"],
        ["reminder_offset", "0"],
        ["browser_reminder", "on"],
      ]),
      { mode: "create", categories },
    );

    expect(result).toEqual({
      behaviorId: "",
      title: "Brush teeth",
      description: "Evening routine",
      categoryId: CATEGORY_ID,
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "22:00",
      browserReminderEnabled: true,
      emailReminderEnabled: false,
      reminderOffsetMinutes: 0,
      active: true,
    });
  });

  it("maps weekly selections and email reminders", () => {
    const result = parseBehaviorFormData(
      formData([
        ["behavior_id", BEHAVIOR_ID],
        ["title", "Workout"],
        ["category_id", CATEGORY_ID],
        ["scheduled_time", "07:30"],
        ["recurrence_kind", "weekly"],
        ["weekly_interval", "2"],
        ["weekly_days", "monday"],
        ["weekly_days", "friday"],
        ["reminder_offset", "60"],
        ["email_reminder", "on"],
        ["active", "on"],
      ]),
      { mode: "update", categories },
    );

    expect(result.recurrenceRule).toEqual({
      frequency: "weekly",
      interval: 2,
      daysOfWeek: ["monday", "friday"],
    });
    expect(result.emailReminderEnabled).toBe(true);
    expect(result.active).toBe(true);
  });

  it("requires a weekday for weekly recurrence", () => {
    expect(() =>
      parseBehaviorFormData(
        formData([
          ["title", "Laundry"],
          ["scheduled_time", "10:00"],
          ["recurrence_kind", "weekly"],
          ["weekly_interval", "1"],
          ["reminder_offset", "0"],
        ]),
        { mode: "create", categories },
      ),
    ).toThrow(BehaviorValidationError);

    try {
      parseBehaviorFormData(
        formData([
          ["title", "Laundry"],
          ["scheduled_time", "10:00"],
          ["recurrence_kind", "weekly"],
          ["weekly_interval", "1"],
          ["reminder_offset", "0"],
        ]),
        { mode: "create", categories },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BehaviorValidationError);
      expect((error as BehaviorValidationError).fieldErrors.recurrence).toBe(
        "Choose at least one weekday.",
      );
    }
  });

  it("marks an update inactive when the active checkbox is absent", () => {
    const result = parseBehaviorFormData(
      formData([
        ["behavior_id", BEHAVIOR_ID],
        ["title", "Archived behavior"],
        ["scheduled_time", "09:00"],
        ["recurrence_kind", "monthly"],
        ["monthly_interval", "1"],
        ["monthly_day", "31"],
        ["reminder_offset", "1440"],
      ]),
      { mode: "update", categories },
    );

    expect(result.active).toBe(false);
    expect(result.recurrenceRule).toEqual({
      frequency: "monthly",
      interval: 1,
      dayOfMonth: 31,
    });
  });

  it("rejects a category that is not owned by the current user", () => {
    expect(() =>
      parseBehaviorFormData(
        formData([
          ["title", "Matcha"],
          ["category_id", "33333333-3333-4333-8333-333333333333"],
          ["scheduled_time", "11:00"],
          ["recurrence_kind", "daily"],
          ["daily_interval", "1"],
          ["reminder_offset", "0"],
        ]),
        { mode: "create", categories },
      ),
    ).toThrow(BehaviorValidationError);
  });
});

describe("stored recurrence helpers", () => {
  it("normalizes stored monthly rules for form defaults and summaries", () => {
    const recurrenceRule = normalizeRecurrenceRule({
      frequency: "monthly",
      interval: 2,
      dayOfMonth: 31,
    });

    expect(recurrenceDefaultsFromRule(recurrenceRule)).toMatchObject({
      kind: "monthly",
      monthlyInterval: 2,
      monthlyDay: 31,
    });
    expect(summarizeRecurrenceRule(recurrenceRule)).toBe(
      "Every 2 months on day 31",
    );
  });
});
