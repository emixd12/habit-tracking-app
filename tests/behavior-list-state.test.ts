import { describe, expect, it } from "vitest";

import {
  removeBehaviorView,
  upsertBehaviorView,
} from "../components/behaviors/behavior-list-state";
import type { BehaviorView } from "../lib/types/behavior";

describe("behavior list state", () => {
  it("inserts a server-confirmed behavior in visible list order", () => {
    const created = behaviorView({
      id: "created",
      title: "Brush teeth",
      scheduledTime: "07:00",
    });
    const result = upsertBehaviorView(
      [
        behaviorView({
          id: "later",
          title: "Evening reset",
          scheduledTime: "21:00",
        }),
        behaviorView({
          id: "same-time-later-title",
          title: "Read",
          scheduledTime: "07:00",
        }),
      ],
      created,
    );

    expect(result.map((behavior) => behavior.id)).toEqual([
      "created",
      "same-time-later-title",
      "later",
    ]);
  });

  it("replaces an existing behavior instead of duplicating it", () => {
    const result = upsertBehaviorView(
      [
        behaviorView({
          id: "existing",
          title: "Old title",
          scheduledTime: "10:00",
        }),
      ],
      behaviorView({
        id: "existing",
        title: "New title",
        scheduledTime: "09:00",
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("New title");
  });

  it("removes a behavior by id", () => {
    const result = removeBehaviorView(
      [behaviorView({ id: "keep" }), behaviorView({ id: "remove" })],
      "remove",
    );

    expect(result.map((behavior) => behavior.id)).toEqual(["keep"]);
  });
});

function behaviorView(
  overrides: Partial<BehaviorView> & Pick<BehaviorView, "id">,
): BehaviorView {
  return {
    id: overrides.id,
    title: overrides.title ?? "Behavior",
    description: overrides.description ?? "",
    categoryId: overrides.categoryId ?? "",
    categoryName: overrides.categoryName ?? "No category",
    recurrenceSummary: overrides.recurrenceSummary ?? "Daily",
    recurrenceDefaults: overrides.recurrenceDefaults ?? {
      kind: "daily",
      dailyInterval: 1,
      everyDays: 2,
      weeklyInterval: 1,
      weeklyDays: ["monday"],
      monthlyInterval: 1,
      monthlyDay: 1,
    },
    scheduledTime: overrides.scheduledTime ?? "09:00",
    scheduledTimeLabel: overrides.scheduledTimeLabel ?? "9:00 AM",
    scheduleSlots: overrides.scheduleSlots ?? [
      {
        id: `${overrides.id}-slot`,
        kind: "exact",
        preset: null,
        startTime: overrides.scheduledTime ?? "09:00",
        endTime: null,
        label: overrides.scheduledTimeLabel ?? "9:00 AM",
        sortOrder: 0,
      },
    ],
    scheduleSummary: overrides.scheduleSummary ?? "9:00 AM",
    timezone: overrides.timezone ?? "America/New_York",
    browserReminderEnabled: overrides.browserReminderEnabled ?? true,
    emailReminderEnabled: overrides.emailReminderEnabled ?? false,
    reminderOffsetMinutes: overrides.reminderOffsetMinutes ?? 0,
    reminderSummary: overrides.reminderSummary ?? "Browser notifications on",
    active: overrides.active ?? true,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-06-26T12:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-26T12:00:00Z",
  };
}
