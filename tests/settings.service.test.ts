import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listUserBehaviors,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { getProfileSettings } from "@/lib/db/profiles.repo";
import { updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents } from "@/lib/db/behaviorConfigurationEvents.repo";
import {
  getSettingsPageData,
  normalizeTimezoneInput,
  TimezoneSettingsUserError,
  updateCurrentUserTimezoneFromFormData,
} from "@/lib/services/settings.service";
import { syncUserOccurrencesAndReminders } from "@/lib/services/occurrence.service";
import { createClient } from "@/lib/supabase/server";
import { clearUserReadCache } from "@/lib/cache/user-read-cache";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/db/profiles.repo", () => ({
  getProfileSettings: vi.fn(),
}));

vi.mock("@/lib/db/behaviors.repo", () => ({
  listUserBehaviors: vi.fn(),
}));

vi.mock("@/lib/db/behaviorConfigurationEvents.repo", () => ({
  updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents: vi.fn(),
}));

vi.mock("@/lib/services/occurrence.service", () => ({
  syncUserOccurrencesAndReminders: vi.fn(),
}));

const getClaims = vi.fn();
const SUPABASE = {
  auth: {
    getClaims,
  },
} as never;

const ACTIVE_BEHAVIOR = {
  id: "behavior-1",
  user_id: "user-1",
  category_id: null,
  title: "Drink water",
  description: null,
  recurrence_rule: { frequency: "daily", interval: 1 },
  scheduled_time: "09:00:00",
  timezone: "America/Los_Angeles",
  browser_reminder_enabled: true,
  email_reminder_enabled: false,
  reminder_offset_minutes: 0,
  active: true,
  archived_at: null,
  current_configuration_event_id: "configuration-event-1",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  category: null,
  schedule_slots: [],
} satisfies BehaviorWithCategory;

let storedBehaviorTimezone = "America/New_York";

function timezoneForm(timezone: string): FormData {
  const formData = new FormData();
  formData.set("timezone", timezone);
  return formData;
}

describe("normalizeTimezoneInput", () => {
  it("canonicalizes valid IANA aliases", () => {
    expect(normalizeTimezoneInput(" us/eastern ")).toBe("America/New_York");
  });

  it("rejects empty or invalid timezone values", () => {
    expect(() => normalizeTimezoneInput(null)).toThrow(
      TimezoneSettingsUserError,
    );
    expect(() => normalizeTimezoneInput("Mars/Base")).toThrow(
      TimezoneSettingsUserError,
    );
  });
});

describe("getSettingsPageData", () => {
  beforeEach(() => {
    clearUserReadCache();
    vi.clearAllMocks();

    vi.mocked(createClient).mockResolvedValue(SUPABASE);
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "user-1",
          email: "user@example.com",
        },
      },
      error: null,
    });
  });

  it("uses profile settings while keeping the auth email for delete confirmation", async () => {
    vi.mocked(getProfileSettings).mockResolvedValue({
      email: "profile@example.com",
      timezone: "America/Los_Angeles",
    });

    await expect(getSettingsPageData()).resolves.toMatchObject({
      email: "profile@example.com",
      timezone: "America/Los_Angeles",
      deleteConfirmationLabel: "user@example.com",
    });

    expect(getProfileSettings).toHaveBeenCalledWith(SUPABASE, "user-1");
  });

  it("falls back to the auth email when the profile email is unavailable", async () => {
    vi.mocked(getProfileSettings).mockResolvedValue(null);

    await expect(getSettingsPageData()).resolves.toMatchObject({
      email: "user@example.com",
      timezone: "America/New_York",
      deleteConfirmationLabel: "user@example.com",
    });
  });
});

describe("updateCurrentUserTimezoneFromFormData", () => {
  beforeEach(() => {
    clearUserReadCache();
    vi.clearAllMocks();

    vi.mocked(createClient).mockResolvedValue(SUPABASE);
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "user-1",
          email: "user@example.com",
        },
      },
      error: null,
    });
    vi.mocked(getProfileSettings).mockResolvedValue({
      email: "user@example.com",
      timezone: "America/New_York",
    });
    storedBehaviorTimezone = "America/New_York";
    vi.mocked(listUserBehaviors).mockImplementation(async () => [
      { ...ACTIVE_BEHAVIOR, timezone: storedBehaviorTimezone },
    ]);
    vi.mocked(
      updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents,
    ).mockImplementation(async (_supabase, input) => {
      storedBehaviorTimezone = input.timezone;
      return {
        activeBehaviorCount: 1,
        changedBehaviorCount: input.behaviorChanges.filter(
          (change) => change.configurationEventPlan !== null,
        ).length,
        profileChanged: true,
      };
    });
    vi.mocked(syncUserOccurrencesAndReminders).mockResolvedValue([]);
  });

  it("updates the profile, active behavior timezones, and resyncs active occurrences", async () => {
    await expect(
      updateCurrentUserTimezoneFromFormData(
        timezoneForm("America/Los_Angeles"),
      ),
    ).resolves.toEqual({
      timezone: "America/Los_Angeles",
      activeBehaviorCount: 1,
      changed: true,
    });

    expect(
      updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents,
    ).toHaveBeenCalledWith(
      SUPABASE,
      expect.objectContaining({
        timezone: "America/Los_Angeles",
        expectedProfileTimezone: "America/New_York",
        behaviorChanges: [
          expect.objectContaining({
            behaviorId: "behavior-1",
            expectedUpdatedAt: "2026-06-01T00:00:00Z",
            configurationEventPlan: expect.objectContaining({
              changedFields: ["timezone"],
              source: "manual",
            }),
          }),
        ],
      }),
    );
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      {
        behaviors: [
          { ...ACTIVE_BEHAVIOR, timezone: "America/Los_Angeles" },
        ],
        now: expect.any(Object),
        timezone: "America/Los_Angeles",
      },
    );
    expect(
      updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents,
    ).toHaveBeenCalledTimes(1);
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledTimes(1);
  });

  it("repairs active behavior timezones and occurrence coverage when the profile timezone is already saved", async () => {
    await expect(
      updateCurrentUserTimezoneFromFormData(timezoneForm("America/New_York")),
    ).resolves.toEqual({
      timezone: "America/New_York",
      activeBehaviorCount: 1,
      changed: false,
    });

    expect(
      updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents,
    ).toHaveBeenCalledWith(
      SUPABASE,
      expect.objectContaining({
        behaviorChanges: [
          expect.objectContaining({ configurationEventPlan: null }),
        ],
      }),
    );
  });

  it("does not run follow-on synchronization when the atomic owner write fails", async () => {
    vi.mocked(
      updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents,
    ).mockRejectedValueOnce(new Error("atomic timezone write failed"));

    await expect(
      updateCurrentUserTimezoneFromFormData(
        timezoneForm("America/Los_Angeles"),
      ),
    ).rejects.toThrow("atomic timezone write failed");

    expect(syncUserOccurrencesAndReminders).not.toHaveBeenCalled();
  });

  it("retries occurrence synchronization after the atomic timezone commit remains stale", async () => {
    vi.mocked(syncUserOccurrencesAndReminders)
      .mockRejectedValueOnce(new Error("occurrence sync failed"))
      .mockResolvedValueOnce([]);

    await expect(
      updateCurrentUserTimezoneFromFormData(
        timezoneForm("America/Los_Angeles"),
      ),
    ).rejects.toThrow("occurrence sync failed");

    vi.mocked(getProfileSettings).mockResolvedValue({
      email: "user@example.com",
      timezone: "America/Los_Angeles",
    });

    await expect(
      updateCurrentUserTimezoneFromFormData(
        timezoneForm("America/Los_Angeles"),
      ),
    ).resolves.toEqual({
      timezone: "America/Los_Angeles",
      activeBehaviorCount: 1,
      changed: false,
    });

    expect(
      updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents,
    ).toHaveBeenCalledTimes(2);
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledTimes(2);
  });
});
