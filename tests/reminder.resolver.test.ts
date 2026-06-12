import { describe, expect, it } from "vitest";

import {
  resolveReminderDeliveries,
  resolveReminderDeliveryCancellation,
  type ReminderResolverBehavior,
  type ReminderResolverOccurrence,
} from "../lib/resolvers/reminder.resolver";

const BASE_BEHAVIOR: ReminderResolverBehavior = {
  id: "behavior-1",
  userId: "user-1",
  browserReminderEnabled: true,
  emailReminderEnabled: false,
  reminderOffsetMinutes: 0,
};

const BASE_OCCURRENCE: ReminderResolverOccurrence = {
  id: "occurrence-1",
  userId: "user-1",
  scheduledFor: "2026-06-08T14:30:00Z",
  status: "unresolved",
};

describe("resolveReminderDeliveries", () => {
  it("generates a browser delivery when browser reminders are enabled", () => {
    expect(
      resolveReminderDeliveries({
        behavior: BASE_BEHAVIOR,
        occurrence: BASE_OCCURRENCE,
      }),
    ).toEqual([
      {
        userId: "user-1",
        occurrenceId: "occurrence-1",
        channel: "browser_push",
        scheduledSendAt: "2026-06-08T14:30:00Z",
        status: "pending",
      },
    ]);
  });

  it("generates email only when email reminders are enabled", () => {
    expect(
      resolveReminderDeliveries({
        behavior: {
          ...BASE_BEHAVIOR,
          browserReminderEnabled: false,
          emailReminderEnabled: false,
        },
        occurrence: BASE_OCCURRENCE,
      }),
    ).toEqual([]);

    expect(
      resolveReminderDeliveries({
        behavior: {
          ...BASE_BEHAVIOR,
          browserReminderEnabled: false,
          emailReminderEnabled: true,
        },
        occurrence: BASE_OCCURRENCE,
      }),
    ).toEqual([
      {
        userId: "user-1",
        occurrenceId: "occurrence-1",
        channel: "email",
        scheduledSendAt: "2026-06-08T14:30:00Z",
        status: "pending",
      },
    ]);
  });

  it("applies the reminder offset to every generated channel", () => {
    expect(
      resolveReminderDeliveries({
        behavior: {
          ...BASE_BEHAVIOR,
          emailReminderEnabled: true,
          reminderOffsetMinutes: 60,
        },
        occurrence: BASE_OCCURRENCE,
      }),
    ).toEqual([
      {
        userId: "user-1",
        occurrenceId: "occurrence-1",
        channel: "browser_push",
        scheduledSendAt: "2026-06-08T13:30:00Z",
        status: "pending",
      },
      {
        userId: "user-1",
        occurrenceId: "occurrence-1",
        channel: "email",
        scheduledSendAt: "2026-06-08T13:30:00Z",
        status: "pending",
      },
    ]);
  });

  it("does not generate deliveries for resolved occurrences", () => {
    expect(
      resolveReminderDeliveries({
        behavior: BASE_BEHAVIOR,
        occurrence: {
          ...BASE_OCCURRENCE,
          status: "completed",
        },
      }),
    ).toEqual([]);
  });

  it("rejects cross-user reminder planning", () => {
    expect(() =>
      resolveReminderDeliveries({
        behavior: BASE_BEHAVIOR,
        occurrence: {
          ...BASE_OCCURRENCE,
          userId: "user-2",
        },
      }),
    ).toThrow("same user");
  });
});

describe("resolveReminderDeliveryCancellation", () => {
  it("keeps pending reminders for unresolved occurrences", () => {
    expect(
      resolveReminderDeliveryCancellation({
        occurrence: { status: "unresolved" },
      }),
    ).toEqual({
      cancelPending: false,
      reason: null,
    });
  });

  it("cancels pending reminders when an occurrence is resolved", () => {
    expect(
      resolveReminderDeliveryCancellation({
        occurrence: { status: "not_completed" },
      }),
    ).toEqual({
      cancelPending: true,
      reason: "occurrence_resolved",
    });
  });
});
