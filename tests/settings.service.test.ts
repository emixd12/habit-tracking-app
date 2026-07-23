import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  updateActiveBehaviorTimezones,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import {
  getProfileSettings,
  updateProfileTimezone,
} from "@/lib/db/profiles.repo";
import {
  getSettingsPageData,
  normalizeTimezoneInput,
  TimezoneSettingsUserError,
  updateCurrentUserTimezoneFromFormData,
} from "@/lib/services/settings.service";
import { syncUserOccurrencesAndReminders } from "@/lib/services/occurrence.service";
import { markOccurrenceSyncStale } from "@/lib/services/occurrence-sync-state.service";
import { createClient } from "@/lib/supabase/server";
import { clearUserReadCache } from "@/lib/cache/user-read-cache";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/db/profiles.repo", () => ({
  getProfileSettings: vi.fn(),
  updateProfileTimezone: vi.fn(),
}));

vi.mock("@/lib/db/behaviors.repo", () => ({
  updateActiveBehaviorTimezones: vi.fn(),
}));

vi.mock("@/lib/services/occurrence.service", () => ({
  syncUserOccurrencesAndReminders: vi.fn(),
}));

vi.mock("@/lib/services/occurrence-sync-state.service", () => ({
  markOccurrenceSyncStale: vi.fn(),
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
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  category: null,
  schedule_slots: [],
} satisfies BehaviorWithCategory;

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
    vi.mocked(updateProfileTimezone).mockResolvedValue({
      email: "user@example.com",
      timezone: "America/Los_Angeles",
    });
    vi.mocked(updateActiveBehaviorTimezones).mockResolvedValue([
      ACTIVE_BEHAVIOR,
    ]);
    vi.mocked(markOccurrenceSyncStale).mockResolvedValue({} as never);
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

    expect(updateProfileTimezone).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      "America/Los_Angeles",
    );
    expect(updateActiveBehaviorTimezones).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      "America/Los_Angeles",
    );
    expect(markOccurrenceSyncStale).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      reason: "timezone_changed",
      timezone: "America/Los_Angeles",
    });
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      {
        behaviors: [ACTIVE_BEHAVIOR],
        now: expect.any(Object),
        timezone: "America/Los_Angeles",
      },
    );
  });

  it("repairs active behavior timezones and occurrence coverage when the profile timezone is already saved", async () => {
    await expect(
      updateCurrentUserTimezoneFromFormData(timezoneForm("America/New_York")),
    ).resolves.toEqual({
      timezone: "America/New_York",
      activeBehaviorCount: 1,
      changed: false,
    });

    expect(updateProfileTimezone).not.toHaveBeenCalled();
    expect(updateActiveBehaviorTimezones).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      "America/New_York",
    );
    expect(markOccurrenceSyncStale).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      reason: "timezone_changed",
      timezone: "America/New_York",
    });
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledWith(SUPABASE, "user-1", {
      behaviors: [ACTIVE_BEHAVIOR],
      now: expect.any(Object),
      timezone: "America/New_York",
    });
  });

  it("repairs a partial save when the profile write succeeded before behavior propagation failed", async () => {
    vi.mocked(updateActiveBehaviorTimezones)
      .mockRejectedValueOnce(new Error("behavior timezone write failed"))
      .mockResolvedValueOnce([ACTIVE_BEHAVIOR]);

    await expect(
      updateCurrentUserTimezoneFromFormData(
        timezoneForm("America/Los_Angeles"),
      ),
    ).rejects.toThrow("behavior timezone write failed");

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

    expect(updateProfileTimezone).toHaveBeenCalledTimes(1);
    expect(updateActiveBehaviorTimezones).toHaveBeenCalledTimes(2);
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledOnce();
  });

  it("repairs a partial save when occurrence and reminder synchronization failed", async () => {
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

    expect(updateProfileTimezone).toHaveBeenCalledTimes(1);
    expect(updateActiveBehaviorTimezones).toHaveBeenCalledTimes(2);
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledTimes(2);
  });
});
