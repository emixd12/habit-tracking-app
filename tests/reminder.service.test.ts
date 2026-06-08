import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBehaviorById } from "@/lib/db/behaviors.repo";
import { getOccurrenceById } from "@/lib/db/occurrences.repo";
import { getProfileSettings } from "@/lib/db/profiles.repo";
import {
  cancelPendingReminderDeliveryById,
  claimPendingEmailReminderDelivery,
  listDuePendingEmailReminderDeliveries,
  markReminderDeliveryFailed,
  markReminderDeliverySent,
} from "@/lib/db/reminderDeliveries.repo";
import { processDueEmailReminders } from "@/lib/services/reminder.service";
import type {
  Behavior,
  Occurrence,
  ReminderDelivery,
} from "@/lib/types/database";

vi.mock("@/lib/db/behaviors.repo", () => ({
  getBehaviorById: vi.fn(),
}));

vi.mock("@/lib/db/occurrences.repo", () => ({
  getOccurrenceById: vi.fn(),
  listBehaviorOccurrencesFrom: vi.fn(),
}));

vi.mock("@/lib/db/profiles.repo", () => ({
  getProfileSettings: vi.fn(),
}));

vi.mock("@/lib/db/reminderDeliveries.repo", () => ({
  cancelPendingReminderDeliveryById: vi.fn(),
  cancelPendingReminderDeliveriesForOccurrence: vi.fn(),
  cancelPendingReminderDeliveriesForOccurrences: vi.fn(),
  claimPendingEmailReminderDelivery: vi.fn(),
  createMissingReminderDeliveries: vi.fn(),
  listDuePendingEmailReminderDeliveries: vi.fn(),
  markReminderDeliveryFailed: vi.fn(),
  markReminderDeliverySent: vi.fn(),
}));

const NOW = Temporal.Instant.from("2026-06-08T14:00:00Z");
const NOW_STRING = NOW.toString();
const SUPABASE = { kind: "supabase" } as never;

const BASE_DELIVERY: ReminderDelivery = {
  id: "delivery-1",
  user_id: "user-1",
  occurrence_id: "occurrence-1",
  channel: "email",
  scheduled_send_at: "2026-06-08T14:00:00Z",
  sent_at: null,
  processing_started_at: null,
  status: "pending",
  error: null,
  created_at: "2026-06-08T00:00:00Z",
  updated_at: "2026-06-08T00:00:00Z",
};

const BASE_OCCURRENCE: Occurrence = {
  id: "occurrence-1",
  user_id: "user-1",
  behavior_id: "behavior-1",
  scheduled_for: "2026-06-08T14:00:00Z",
  local_date: "2026-06-08",
  status: "unresolved",
  completed_at: null,
  status_marked_at: null,
  note: null,
  created_at: "2026-06-08T00:00:00Z",
  updated_at: "2026-06-08T00:00:00Z",
};

const BASE_BEHAVIOR: Behavior = {
  id: "behavior-1",
  user_id: "user-1",
  category_id: null,
  title: "Drink water",
  description: "Morning glass",
  recurrence_rule: { type: "daily", interval: 1 },
  scheduled_time: "10:00:00",
  timezone: "America/New_York",
  browser_reminder_enabled: true,
  email_reminder_enabled: true,
  reminder_offset_minutes: 0,
  active: true,
  archived_at: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

describe("processDueEmailReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(listDuePendingEmailReminderDeliveries).mockResolvedValue([
      BASE_DELIVERY,
    ]);
    vi.mocked(claimPendingEmailReminderDelivery).mockResolvedValue({
      ...BASE_DELIVERY,
      processing_started_at: NOW_STRING,
    });
    vi.mocked(getOccurrenceById).mockResolvedValue(BASE_OCCURRENCE);
    vi.mocked(getBehaviorById).mockResolvedValue({
      ...BASE_BEHAVIOR,
      category: null,
    });
    vi.mocked(getProfileSettings).mockResolvedValue({
      email: "user@example.com",
      timezone: "America/New_York",
    });
  });

  it("claims a due email reminder before sending and marks it sent", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ jobId: "job-1" });

    await expect(
      processDueEmailReminders({
        supabase: SUPABASE,
        now: NOW,
        limit: 2,
        sendEmail,
      }),
    ).resolves.toEqual({
      checked: 1,
      claimed: 1,
      skipped: 0,
      sent: 1,
      failed: 0,
      cancelled: 0,
    });

    expect(listDuePendingEmailReminderDeliveries).toHaveBeenCalledWith(SUPABASE, {
      dueAt: NOW_STRING,
      limit: 2,
    });
    expect(claimPendingEmailReminderDelivery).toHaveBeenCalledWith(SUPABASE, {
      id: "delivery-1",
      userId: "user-1",
      dueAt: NOW_STRING,
      processingStartedAt: NOW_STRING,
    });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      subscriberExternalId: "user-1",
      variables: expect.objectContaining({
        BEHAVIOR_TITLE: "Drink water",
        OCCURRENCE_ID: "occurrence-1",
        REMINDER_SCHEDULED_SEND_AT: "2026-06-08T14:00:00Z",
      }),
    });
    expect(markReminderDeliverySent).toHaveBeenCalledWith(SUPABASE, {
      id: "delivery-1",
      userId: "user-1",
      sentAt: NOW_STRING,
    });
    expect(markReminderDeliveryFailed).not.toHaveBeenCalled();
  });

  it("skips a delivery already claimed by another process", async () => {
    vi.mocked(claimPendingEmailReminderDelivery).mockResolvedValue(null);
    const sendEmail = vi.fn();

    await expect(
      processDueEmailReminders({
        supabase: SUPABASE,
        now: NOW,
        sendEmail,
      }),
    ).resolves.toMatchObject({
      checked: 1,
      claimed: 0,
      skipped: 1,
      sent: 0,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(markReminderDeliverySent).not.toHaveBeenCalled();
  });

  it("cancels stale pending email deliveries when email is disabled", async () => {
    vi.mocked(getBehaviorById).mockResolvedValue({
      ...BASE_BEHAVIOR,
      email_reminder_enabled: false,
      category: null,
    });
    const sendEmail = vi.fn();

    await expect(
      processDueEmailReminders({
        supabase: SUPABASE,
        now: NOW,
        sendEmail,
      }),
    ).resolves.toMatchObject({
      sent: 0,
      failed: 0,
      cancelled: 1,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(cancelPendingReminderDeliveryById).toHaveBeenCalledWith(SUPABASE, {
      id: "delivery-1",
      userId: "user-1",
    });
  });

  it("cancels stale pending email deliveries when the offset no longer matches", async () => {
    vi.mocked(getBehaviorById).mockResolvedValue({
      ...BASE_BEHAVIOR,
      reminder_offset_minutes: 60,
      category: null,
    });
    const sendEmail = vi.fn();

    await expect(
      processDueEmailReminders({
        supabase: SUPABASE,
        now: NOW,
        sendEmail,
      }),
    ).resolves.toMatchObject({
      sent: 0,
      failed: 0,
      cancelled: 1,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(cancelPendingReminderDeliveryById).toHaveBeenCalledWith(SUPABASE, {
      id: "delivery-1",
      userId: "user-1",
    });
  });

  it("logs provider failures on the delivery", async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error("Template disabled"));

    await expect(
      processDueEmailReminders({
        supabase: SUPABASE,
        now: NOW,
        sendEmail,
      }),
    ).resolves.toMatchObject({
      sent: 0,
      failed: 1,
      cancelled: 0,
    });

    expect(markReminderDeliveryFailed).toHaveBeenCalledWith(SUPABASE, {
      id: "delivery-1",
      userId: "user-1",
      error: "Template disabled",
    });
    expect(markReminderDeliverySent).not.toHaveBeenCalled();
  });
});
