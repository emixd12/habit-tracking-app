import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  decideOccurrenceSyncCoverage,
  markOccurrenceSyncFresh,
  summarizeOccurrenceSyncPlans,
} from "@/lib/services/occurrence-sync-state.service";
import type {
  OccurrenceGenerationWindow,
} from "@/lib/resolvers/occurrence.resolver";
import type { OccurrenceSyncState } from "@/lib/types/database";

const WINDOW: OccurrenceGenerationWindow = {
  rangeStart: Temporal.Instant.from("2026-06-08T04:00:00Z"),
  rangeEnd: Temporal.Instant.from("2026-06-11T04:00:00Z"),
  startLocalDate: "2026-06-08",
  endLocalDate: "2026-06-10",
  timezone: "America/New_York",
};

describe("occurrence sync freshness decisions", () => {
  it("requires a non-stale state with matching timezone and full horizon coverage", () => {
    const state = buildState({
      last_synced_local_date: "2026-06-08",
      synced_through_local_date: "2026-06-10",
      timezone: "America/New_York",
    });

    expect(
      decideOccurrenceSyncCoverage(state, {
        timezone: "America/New_York",
        startLocalDate: "2026-06-08",
        endLocalDate: "2026-06-10",
      }),
    ).toEqual({ covered: true, reason: "covered" });
    expect(
      decideOccurrenceSyncCoverage(null, {
        timezone: "America/New_York",
        startLocalDate: "2026-06-08",
        endLocalDate: "2026-06-10",
      }),
    ).toEqual({ covered: false, reason: "missing_state" });
    expect(
      decideOccurrenceSyncCoverage(
        buildState({
          stale: true,
          stale_reason: "behavior_changed",
        }),
        {
          timezone: "America/New_York",
          startLocalDate: "2026-06-08",
          endLocalDate: "2026-06-10",
        },
      ),
    ).toEqual({ covered: false, reason: "stale" });
    expect(
      decideOccurrenceSyncCoverage(state, {
        timezone: "America/Los_Angeles",
        startLocalDate: "2026-06-08",
        endLocalDate: "2026-06-10",
      }),
    ).toEqual({ covered: false, reason: "timezone_mismatch" });
    expect(
      decideOccurrenceSyncCoverage(state, {
        timezone: "America/New_York",
        startLocalDate: "2026-06-07",
        endLocalDate: "2026-06-10",
      }),
    ).toEqual({ covered: false, reason: "starts_after_horizon" });
    expect(
      decideOccurrenceSyncCoverage(state, {
        timezone: "America/New_York",
        startLocalDate: "2026-06-08",
        endLocalDate: "2026-06-11",
      }),
    ).toEqual({ covered: false, reason: "ends_before_horizon" });
  });

  it("summarizes sync plans into horizon and observability counts", () => {
    const summary = summarizeOccurrenceSyncPlans({
      plans: [
        {
          generationWindow: WINDOW,
          create: [
            {
              userId: "user-1",
              behaviorId: "behavior-1",
              scheduledFor: "2026-06-08T13:00:00Z",
              localDate: "2026-06-08",
              status: "unresolved",
              scheduleSlotId: "slot-1",
              scheduleKind: "exact",
              schedulePreset: null,
              scheduleStartTime: "09:00:00",
              scheduleEndTime: null,
              behaviorConfigurationEventId: "configuration-event-1",
            },
          ],
          updateUnresolved: [
            {
              id: "occurrence-1",
              scheduledFor: "2026-06-09T13:00:00Z",
              localDate: "2026-06-09",
              scheduleSlotId: "slot-1",
              scheduleKind: "exact",
              schedulePreset: null,
              scheduleStartTime: "09:00:00",
              scheduleEndTime: null,
              behaviorConfigurationEventId: "configuration-event-1",
            },
          ],
          deleteUnresolved: [
            {
              id: "occurrence-2",
              scheduledFor: "2026-06-10T13:00:00Z",
              localDate: "2026-06-10",
              scheduleSlotId: "slot-1",
              scheduleKind: "exact",
              schedulePreset: null,
              scheduleStartTime: "09:00:00",
              scheduleEndTime: null,
              behaviorConfigurationEventId: "configuration-event-1",
            },
          ],
        },
      ],
      fallbackWindow: WINDOW,
    });

    expect(summary).toEqual({
      timezone: "America/New_York",
      lastSyncedLocalDate: "2026-06-08",
      syncedThroughLocalDate: "2026-06-10",
      behaviorCount: 1,
      createdCount: 1,
      updatedCount: 1,
      deletedCount: 1,
    });
  });

  it("uses the fallback window when a sync has no behaviors", () => {
    expect(
      summarizeOccurrenceSyncPlans({
        plans: [],
        fallbackWindow: WINDOW,
        timezone: "America/New_York",
      }),
    ).toEqual({
      timezone: "America/New_York",
      lastSyncedLocalDate: "2026-06-08",
      syncedThroughLocalDate: "2026-06-10",
      behaviorCount: 0,
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
    });
  });

  it("rejects invalid fresh sync summaries before writing state", async () => {
    await expect(
      markOccurrenceSyncFresh({} as never, {
        userId: "user-1",
        timezone: "America/New_York",
        lastSyncedLocalDate: "2026-06-10",
        syncedThroughLocalDate: "2026-06-08",
        lastSuccessfulSyncAt: "2026-06-08T14:30:00Z",
        behaviorCount: 0,
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 0,
      }),
    ).rejects.toThrow("lastSyncedLocalDate");
  });
});

function buildState(
  overrides: Partial<OccurrenceSyncState> = {},
): OccurrenceSyncState {
  return {
    user_id: "user-1",
    timezone: "America/New_York",
    last_synced_local_date: "2026-06-08",
    synced_through_local_date: "2026-06-10",
    last_successful_sync_at: "2026-06-08T14:30:00Z",
    stale: false,
    stale_reason: null,
    state_version: 0,
    last_sync_behavior_count: 1,
    last_sync_created_count: 0,
    last_sync_updated_count: 0,
    last_sync_deleted_count: 0,
    created_at: "2026-06-08T14:30:00Z",
    updated_at: "2026-06-08T14:30:00Z",
    ...overrides,
  };
}
