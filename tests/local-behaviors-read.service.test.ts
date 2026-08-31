import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, expect, it, vi } from "vitest";
import { getLocalBehaviorsPageData } from "../apps/desktop/src/local-behaviors-read.service";
import { stored } from "./helpers/behavior-graph-fixture";
import type { OccurrenceRecord } from "@cadence/core/data-store";
import type { Profile } from "../lib/types/database";

const mocks = vi.hoisted(() => ({ command: vi.fn(), fresh: vi.fn() }));
vi.mock("../apps/desktop/src/local-store", () => ({ localCommand: mocks.command }));
vi.mock("../apps/desktop/src/local-generation.service", async (original) => ({
  ...await original<typeof import("../apps/desktop/src/local-generation.service")>(), ensureLocalOccurrencesFresh: mocks.fresh,
}));
const now = Temporal.Instant.from("2026-08-30T16:00:00Z");
const profile = { id: "owner", timezone: "America/New_York" } as Profile;
const occurrence = (id: string, localDate: string, status: OccurrenceRecord["status"]): OccurrenceRecord => ({
  id, user_id: "owner", behavior_id: "behavior", behavior_configuration_event_id: "configuration",
  behavior_schedule_slot_id: "slot", scheduled_for: `${localDate}T13:00:00Z`, local_date: localDate,
  status, note: `Note ${id}`, schedule_kind: "range", schedule_preset: "morning", schedule_start_time: "06:00:00",
  schedule_end_time: "12:00:00", schedule_range_identity: 43_200_000_000,
  completed_at: status === "completed" ? `${localDate}T14:00:00Z` : null,
  status_marked_at: status === "unresolved" ? null : `${localDate}T14:00:00Z`,
  created_at: `${localDate}T00:00:00Z`, updated_at: `${localDate}T14:00:00Z`,
});

beforeEach(() => {
  vi.resetAllMocks();
  const { category, schedules, schedule_slots, ...behavior } = stored;
  void category;
  mocks.command.mockImplementation(async (operation: string,
    input?: { startLocalDate?: string; endLocalDate?: string; status?: string }) => {
    if (operation === "readBehaviorGraphs") return [{ behavior, revision: 17, slots: schedule_slots,
      schedules: schedules!.map(({ schedule_slots: entries, ...row }) => { void entries; return row; }) }];
    if (operation === "readCategories") return [];
    if (operation === "readOccurrences") {
      const rows = [occurrence("completed", "2026-08-30", "completed"),
        occurrence("no", "2026-08-30", "not_completed"), occurrence("open", "2026-08-30", "unresolved"),
        occurrence("old", "2026-08-01", "unresolved"), occurrence("excluded", "2026-08-01", "completed")];
      return rows.filter((row) => row.local_date >= input!.startLocalDate! && row.local_date <= input!.endLocalDate!
        && (input?.status === undefined || row.status === input.status));
    }
    if (operation === "readOccurrenceHistory") return { statusEvents: [], timeSessions: [
      { id: "timer", user_id: "owner", occurrence_id: "completed", behavior_id: "behavior",
        started_at: "2026-08-30T14:00:00Z", stopped_at: "2026-08-30T14:02:00Z" },
      { id: "future", user_id: "owner", occurrence_id: "completed", behavior_id: "behavior",
        started_at: "2026-08-30T17:00:00Z", stopped_at: "2026-08-30T18:00:00Z" },
    ] };
    throw new Error(operation);
  });
});

it("refreshes first and preserves selected-day statuses, notes, schedule snapshots and fixed-time session totals", async () => {
  const result = await getLocalBehaviorsPageData(profile, { now, rangeDays: 7,
    selectedBehaviorId: "behavior", selectedDayLocalDate: "2026-08-30" });
  expect(mocks.fresh).toHaveBeenCalledWith(profile, now);
  expect(mocks.fresh.mock.invocationCallOrder[0]).toBeLessThan(mocks.command.mock.invocationCallOrder[0]!);
  expect(result.behaviors.activeBehaviors[0]).toMatchObject({ id: "behavior", title: "Read", scheduleSummary: "9:00 AM" });
  expect(result.analytics.rangeDays).toBe(7);
  expect(result.analytics.summary).toMatchObject({ completedCount: 1, notCompletedCount: 1, unresolvedCount: 1, rate: 0.5 });
  expect(result.analytics.selectedBehaviorDay?.occurrences).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "completed", status: "completed", note: "Note completed",
      scheduledTimeLabel: "Morning (6:00 AM-Noon)", trackedTime: expect.objectContaining({ recordedSeconds: 120 }) }),
    expect.objectContaining({ id: "no", status: "not_completed" }),
    expect.objectContaining({ id: "open", status: "unresolved" }),
  ]));
  expect(result.analytics.selectedBehaviorDay?.occurrences).toHaveLength(3);
  expect(mocks.command).toHaveBeenCalledWith("readOccurrenceHistory", {
    profileId: "owner", occurrenceIds: ["completed", "no", "open"],
  });
});

it.each([30, 90])("uses the existing %s-day range and counts all in-range rows", async (rangeDays) => {
  const result = await getLocalBehaviorsPageData(profile, { now, rangeDays });
  expect(result.analytics.rangeDays).toBe(rangeDays);
  expect(result.analytics.summary).toMatchObject({ completedCount: 2, notCompletedCount: 1, unresolvedCount: 1 });
});

it("propagates a failed freshness repair instead of returning a partial analytics view", async () => {
  mocks.fresh.mockRejectedValueOnce(new Error("stale generation"));
  await expect(getLocalBehaviorsPageData(profile, { now })).rejects.toThrow("stale generation");
  expect(mocks.command).not.toHaveBeenCalled();
});
