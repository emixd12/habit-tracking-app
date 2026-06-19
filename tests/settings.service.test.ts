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
  normalizeTimezoneInput,
  TimezoneSettingsUserError,
  updateCurrentUserTimezoneFromFormData,
} from "@/lib/services/settings.service";
import { syncBehaviorOccurrences } from "@/lib/services/occurrence.service";
import { createClient } from "@/lib/supabase/server";

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
  syncBehaviorOccurrences: vi.fn(),
}));

const getUser = vi.fn();
const SUPABASE = {
  auth: {
    getUser,
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

describe("updateCurrentUserTimezoneFromFormData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createClient).mockResolvedValue(SUPABASE);
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
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
    vi.mocked(syncBehaviorOccurrences).mockResolvedValue({} as never);
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
    expect(syncBehaviorOccurrences).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      ACTIVE_BEHAVIOR,
      {
        now: expect.any(Object),
      },
    );
  });

  it("does not mutate behaviors when the timezone is already saved", async () => {
    await expect(
      updateCurrentUserTimezoneFromFormData(timezoneForm("America/New_York")),
    ).resolves.toEqual({
      timezone: "America/New_York",
      activeBehaviorCount: 0,
      changed: false,
    });

    expect(updateProfileTimezone).not.toHaveBeenCalled();
    expect(updateActiveBehaviorTimezones).not.toHaveBeenCalled();
    expect(syncBehaviorOccurrences).not.toHaveBeenCalled();
  });
});
