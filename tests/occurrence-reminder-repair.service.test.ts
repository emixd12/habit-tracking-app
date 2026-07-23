import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listUserBehaviors } from "@/lib/db/behaviors.repo";
import { getProfileSettings } from "@/lib/db/profiles.repo";
import { reportMonitoringError } from "@/lib/monitoring/privacy-safe-events";
import { syncUserOccurrencesAndReminders } from "@/lib/services/occurrence.service";
import { repairUserOccurrenceReminderGraphBestEffort } from "@/lib/services/occurrence-reminder-repair.service";

vi.mock("@/lib/db/behaviors.repo", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/db/behaviors.repo")>();

  return {
    ...actual,
    listUserBehaviors: vi.fn(),
  };
});

vi.mock("@/lib/db/profiles.repo", () => ({
  getProfileSettings: vi.fn(),
}));

vi.mock("@/lib/services/occurrence.service", () => ({
  syncUserOccurrencesAndReminders: vi.fn(),
}));

vi.mock("@/lib/monitoring/privacy-safe-events", () => ({
  reportMonitoringError: vi.fn(),
}));

const SUPABASE = { kind: "supabase" } as never;
const NOW = Temporal.Instant.from("2026-07-22T16:00:00Z");
const BEHAVIORS = [{ id: "behavior-1" }] as never;

describe("repairUserOccurrenceReminderGraphBestEffort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listUserBehaviors).mockResolvedValue(BEHAVIORS);
    vi.mocked(getProfileSettings).mockResolvedValue({
      email: "synthetic@example.test",
      timezone: "America/Chicago",
    });
    vi.mocked(syncUserOccurrencesAndReminders).mockResolvedValue([]);
  });

  it("loads the committed graph and repairs occurrences and reminders without provider sends", async () => {
    await expect(
      repairUserOccurrenceReminderGraphBestEffort(SUPABASE, "user-1", {
        operation: "behaviorlog_import_merge",
        now: NOW,
      }),
    ).resolves.toBe(true);

    expect(listUserBehaviors).toHaveBeenCalledWith(SUPABASE, "user-1");
    expect(getProfileSettings).toHaveBeenCalledWith(SUPABASE, "user-1");
    expect(syncUserOccurrencesAndReminders).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      {
        behaviors: BEHAVIORS,
        timezone: "America/Chicago",
        now: NOW,
      },
    );
  });

  it("reports a privacy-safe event and resolves false when repair fails", async () => {
    const failure = new Error("derived graph write failed");
    vi.mocked(syncUserOccurrencesAndReminders).mockRejectedValueOnce(failure);

    await expect(
      repairUserOccurrenceReminderGraphBestEffort(SUPABASE, "user-1", {
        operation: "behaviorlog_restore",
        now: NOW,
      }),
    ).resolves.toBe(false);
    expect(reportMonitoringError).toHaveBeenCalledWith(
      "occurrence_reminder_post_apply_repair_failed",
      failure,
      { operation: "behaviorlog_restore" },
    );
  });
});
