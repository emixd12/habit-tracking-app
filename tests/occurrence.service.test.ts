import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listBehaviorScheduleSlots,
  listUserBehaviors,
} from "@/lib/db/behaviors.repo";
import {
  createMissingOccurrences,
  deleteUnresolvedOccurrencesById,
  getOccurrenceWithBehaviorTimezoneById,
  listBehaviorOccurrencesFrom,
  updateOccurrenceById,
  updateUnresolvedOccurrenceScheduleById,
} from "@/lib/db/occurrences.repo";
import {
  applyOccurrenceStatusTransitionRpc,
  getLatestOccurrenceStatusEventForOccurrence,
} from "@/lib/db/occurrenceStatusEvents.repo";
import { listProfileOccurrenceSyncTargets } from "@/lib/db/profiles.repo";
import {
  markOccurrenceSyncFreshForPlans,
  markOccurrenceSyncStale,
  readOccurrenceSyncState,
} from "@/lib/services/occurrence-sync-state.service";
import {
  applyOccurrenceStatusTransition,
  ensureUserOccurrencesFresh,
  processOccurrenceSyncHorizons,
  syncUserOccurrences,
  updateOccurrenceNote,
} from "@/lib/services/occurrence.service";
import { syncReminderDeliveriesForBehaviors } from "@/lib/services/reminder.service";
import type {
  Behavior,
  BehaviorScheduleSlot,
  Category,
  Occurrence,
  OccurrenceSyncState,
  OccurrenceStatusEvent,
} from "@/lib/types/database";

vi.mock("@/lib/db/behaviors.repo", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/db/behaviors.repo")>();

  return {
    ...actual,
    listBehaviorScheduleSlots: vi.fn(),
    listUserBehaviors: vi.fn(),
  };
});

vi.mock("@/lib/db/profiles.repo", () => ({
  listProfileOccurrenceSyncTargets: vi.fn(),
}));

vi.mock("@/lib/db/occurrences.repo", () => ({
  createMissingOccurrences: vi.fn(),
  deleteUnresolvedOccurrencesById: vi.fn(),
  getOccurrenceById: vi.fn(),
  getOccurrenceWithBehaviorTimezoneById: vi.fn(),
  listBehaviorOccurrencesFrom: vi.fn(),
  updateOccurrenceById: vi.fn(),
  updateUnresolvedOccurrenceScheduleById: vi.fn(),
}));

vi.mock("@/lib/db/occurrenceStatusEvents.repo", () => ({
  applyOccurrenceStatusTransitionRpc: vi.fn(),
  getLatestOccurrenceStatusEventForOccurrence: vi.fn(),
}));

vi.mock("@/lib/services/reminder.service", () => ({
  syncReminderDeliveriesForBehavior: vi.fn(),
  syncReminderDeliveriesForBehaviors: vi.fn(),
}));

vi.mock(
  "@/lib/services/occurrence-sync-state.service",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/services/occurrence-sync-state.service")
      >();

    return {
      ...actual,
      markOccurrenceSyncFreshForPlans: vi.fn(),
      markOccurrenceSyncStale: vi.fn(),
      readOccurrenceSyncState: vi.fn(),
    };
  },
);

const NOW = Temporal.Instant.from("2026-06-08T14:30:00Z");
const SUPABASE = { kind: "supabase" } as never;
const CATEGORY: Pick<Category, "id" | "name"> = {
  id: "category-1",
  name: "General",
};

describe("syncUserOccurrences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMissingOccurrences).mockResolvedValue();
    vi.mocked(deleteUnresolvedOccurrencesById).mockResolvedValue();
    vi.mocked(markOccurrenceSyncFreshForPlans).mockResolvedValue({} as never);
    vi.mocked(markOccurrenceSyncStale).mockResolvedValue({} as never);
    vi.mocked(readOccurrenceSyncState).mockResolvedValue(null);
    vi.mocked(syncReminderDeliveriesForBehaviors).mockResolvedValue();
  });

  it("uses parallel occurrence reads and one grouped reminder sync", async () => {
    const behaviors = [
      buildBehavior({
        id: "behavior-1",
        title: "Morning behavior",
        scheduledTime: "10:00:00",
      }),
      buildBehavior({
        id: "behavior-2",
        title: "Afternoon behavior",
        scheduledTime: "15:00:00",
      }),
    ];
    const occurrences = [
      buildOccurrence({
        id: "occurrence-1",
        behaviorId: "behavior-1",
        scheduledFor: "2026-06-08T14:00:00Z",
        startTime: "10:00:00",
      }),
      buildOccurrence({
        id: "occurrence-2",
        behaviorId: "behavior-2",
        scheduledFor: "2026-06-08T19:00:00Z",
        startTime: "15:00:00",
      }),
    ];

    vi.mocked(listBehaviorOccurrencesFrom)
      .mockResolvedValueOnce([occurrences[0]])
      .mockResolvedValueOnce([occurrences[1]]);

    await syncUserOccurrences(SUPABASE, "user-1", {
      behaviors,
      now: NOW,
      horizonDays: 0,
    });

    expect(listBehaviorOccurrencesFrom).toHaveBeenCalledTimes(2);
    expect(listBehaviorOccurrencesFrom).toHaveBeenNthCalledWith(
      1,
      SUPABASE,
      "user-1",
      "behavior-1",
      "2026-06-08T04:00:00Z",
    );
    expect(listBehaviorOccurrencesFrom).toHaveBeenNthCalledWith(
      2,
      SUPABASE,
      "user-1",
      "behavior-2",
      "2026-06-08T04:00:00Z",
    );
    expect(listBehaviorScheduleSlots).not.toHaveBeenCalled();
    expect(createMissingOccurrences).toHaveBeenCalledWith(SUPABASE, []);
    expect(updateUnresolvedOccurrenceScheduleById).not.toHaveBeenCalled();
    expect(deleteUnresolvedOccurrencesById).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      [],
    );
    expect(syncReminderDeliveriesForBehaviors).toHaveBeenCalledOnce();
    expect(syncReminderDeliveriesForBehaviors).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      [
        { behavior: behaviors[0], occurrences: [occurrences[0]] },
        { behavior: behaviors[1], occurrences: [occurrences[1]] },
      ],
    );
    expect(markOccurrenceSyncFreshForPlans).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      plans: expect.any(Array),
      fallbackWindow: expect.objectContaining({
        startLocalDate: "2026-06-08",
        endLocalDate: "2026-06-08",
        timezone: "America/New_York",
      }),
      syncedAt: NOW.toString(),
      timezone: "America/New_York",
    });
  });

  it("fails an ambiguous schedule graph before occurrence writes and keeps sync stale", async () => {
    const behavior = {
      ...buildBehavior({
        id: "behavior-1",
        title: "Friday behavior",
        scheduledTime: "11:30:00",
      }),
      schedules: [
        buildSchedule({
          id: "schedule-valid",
          behaviorId: "behavior-1",
          startTime: "11:30:00",
        }),
        buildSchedule({
          id: "schedule-empty",
          behaviorId: "behavior-1",
          startTime: null,
          sortOrder: 1,
        }),
      ],
    };

    await expect(
      syncUserOccurrences(SUPABASE, "user-1", {
        behaviors: [behavior],
        now: NOW,
        horizonDays: 0,
      }),
    ).rejects.toThrow("schedule needs repair");

    expect(listBehaviorOccurrencesFrom).not.toHaveBeenCalled();
    expect(createMissingOccurrences).not.toHaveBeenCalled();
    expect(markOccurrenceSyncFreshForPlans).not.toHaveBeenCalled();
    expect(markOccurrenceSyncStale).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      reason: "sync_failed",
      timezone: "America/New_York",
    });
  });
});

describe("ensureUserOccurrencesFresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMissingOccurrences).mockResolvedValue();
    vi.mocked(deleteUnresolvedOccurrencesById).mockResolvedValue();
    vi.mocked(markOccurrenceSyncFreshForPlans).mockResolvedValue({} as never);
    vi.mocked(markOccurrenceSyncStale).mockResolvedValue({} as never);
    vi.mocked(syncReminderDeliveriesForBehaviors).mockResolvedValue();
  });

  it("skips occurrence sync when the stored freshness state covers the route horizon", async () => {
    vi.mocked(readOccurrenceSyncState).mockResolvedValue(
      buildSyncState({
        last_synced_local_date: "2026-06-08",
        synced_through_local_date: "2026-07-08",
      }),
    );

    const result = await ensureUserOccurrencesFresh(SUPABASE, "user-1", {
      behaviors: [
        buildBehavior({
          id: "behavior-1",
          title: "Morning behavior",
          scheduledTime: "10:00:00",
        }),
      ],
      now: NOW,
      timezone: "America/New_York",
      horizonDays: 30,
    });

    expect(result.synced).toBe(false);
    expect(result.coverage).toEqual({ covered: true, reason: "covered" });
    expect(listBehaviorOccurrencesFrom).not.toHaveBeenCalled();
    expect(markOccurrenceSyncFreshForPlans).not.toHaveBeenCalled();
  });

  it("does not trust covered freshness when an active schedule has no persisted time entry", async () => {
    const behavior = {
      ...buildBehavior({
        id: "behavior-1",
        title: "Friday behavior",
        scheduledTime: "11:30:00",
      }),
      schedules: [
        buildSchedule({
          id: "schedule-empty",
          behaviorId: "behavior-1",
          startTime: null,
        }),
      ],
    };
    vi.mocked(readOccurrenceSyncState).mockResolvedValue(
      buildSyncState({
        last_synced_local_date: "2026-06-08",
        synced_through_local_date: "2026-07-08",
      }),
    );

    await expect(
      ensureUserOccurrencesFresh(SUPABASE, "user-1", {
        behaviors: [behavior],
        now: NOW,
        timezone: "America/New_York",
        horizonDays: 30,
      }),
    ).rejects.toThrow("schedule needs repair");

    expect(markOccurrenceSyncFreshForPlans).not.toHaveBeenCalled();
    expect(markOccurrenceSyncStale).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      reason: "sync_failed",
      timezone: "America/New_York",
    });
  });

  it("uses caller-provided freshness state instead of reading it again", async () => {
    const result = await ensureUserOccurrencesFresh(SUPABASE, "user-1", {
      behaviors: [],
      now: NOW,
      timezone: "America/New_York",
      horizonDays: 30,
      syncState: buildSyncState({
        last_synced_local_date: "2026-06-08",
        synced_through_local_date: "2026-07-08",
      }),
    });

    expect(result.synced).toBe(false);
    expect(result.coverage).toEqual({ covered: true, reason: "covered" });
    expect(readOccurrenceSyncState).not.toHaveBeenCalled();
    expect(listBehaviorOccurrencesFrom).not.toHaveBeenCalled();
    expect(markOccurrenceSyncFreshForPlans).not.toHaveBeenCalled();
  });

  it("runs occurrence sync when the stored horizon is stale or insufficient", async () => {
    const behavior = buildBehavior({
      id: "behavior-1",
      title: "Morning behavior",
      scheduledTime: "10:00:00",
    });

    vi.mocked(readOccurrenceSyncState).mockResolvedValue(
      buildSyncState({
        stale: true,
        stale_reason: "behavior_changed",
      }),
    );
    vi.mocked(listBehaviorOccurrencesFrom).mockResolvedValue([]);

    const result = await ensureUserOccurrencesFresh(SUPABASE, "user-1", {
      behaviors: [behavior],
      now: NOW,
      timezone: "America/New_York",
      horizonDays: 0,
    });

    expect(result.synced).toBe(true);
    expect(result.coverage).toEqual({ covered: false, reason: "stale" });
    expect(listBehaviorOccurrencesFrom).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      "behavior-1",
      "2026-06-08T04:00:00Z",
    );
    expect(markOccurrenceSyncFreshForPlans).toHaveBeenCalledOnce();
    expect(syncReminderDeliveriesForBehaviors).not.toHaveBeenCalled();
  });

  it("can explicitly plan reminders when repairing an insufficient horizon", async () => {
    const behavior = buildBehavior({
      id: "behavior-1",
      title: "Morning behavior",
      scheduledTime: "10:00:00",
    });
    const occurrence = buildOccurrence({
      id: "occurrence-1",
      behaviorId: "behavior-1",
      scheduledFor: "2026-06-08T14:00:00Z",
      startTime: "10:00:00",
    });

    vi.mocked(readOccurrenceSyncState).mockResolvedValue(null);
    vi.mocked(listBehaviorOccurrencesFrom).mockResolvedValue([occurrence]);

    await expect(
      ensureUserOccurrencesFresh(SUPABASE, "user-1", {
        behaviors: [behavior],
        now: NOW,
        timezone: "America/New_York",
        horizonDays: 0,
        planReminderDeliveries: true,
      }),
    ).resolves.toMatchObject({
      synced: true,
    });

    expect(syncReminderDeliveriesForBehaviors).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      [{ behavior, occurrences: [occurrence] }],
    );
  });

  it("marks freshness stale on sync failure and rethrows the original error", async () => {
    const failure = new Error("write failed");

    vi.mocked(readOccurrenceSyncState).mockResolvedValue(null);
    vi.mocked(listBehaviorOccurrencesFrom).mockResolvedValue([]);
    vi.mocked(createMissingOccurrences).mockRejectedValue(failure);

    await expect(
      ensureUserOccurrencesFresh(SUPABASE, "user-1", {
        behaviors: [
          buildBehavior({
            id: "behavior-1",
            title: "Morning behavior",
            scheduledTime: "10:00:00",
          }),
        ],
        now: NOW,
        timezone: "America/New_York",
        horizonDays: 0,
      }),
    ).rejects.toThrow(failure);

    expect(markOccurrenceSyncStale).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      reason: "sync_failed",
      timezone: "America/New_York",
    });
  });
});

describe("processOccurrenceSyncHorizons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMissingOccurrences).mockResolvedValue();
    vi.mocked(deleteUnresolvedOccurrencesById).mockResolvedValue();
    vi.mocked(markOccurrenceSyncFreshForPlans).mockResolvedValue({} as never);
    vi.mocked(markOccurrenceSyncStale).mockResolvedValue({} as never);
    vi.mocked(syncReminderDeliveriesForBehaviors).mockResolvedValue();
  });

  it("checks profile sync targets and skips users whose horizon is already covered", async () => {
    const behavior = buildBehavior({
      id: "behavior-1",
      title: "Morning behavior",
      scheduledTime: "10:00:00",
    });

    vi.mocked(listProfileOccurrenceSyncTargets).mockResolvedValue([
      {
        id: "user-1",
        timezone: "America/New_York",
      },
    ]);
    vi.mocked(listUserBehaviors).mockResolvedValue([behavior]);
    vi.mocked(readOccurrenceSyncState).mockResolvedValue(
      buildSyncState({
        last_synced_local_date: "2026-06-08",
        synced_through_local_date: "2026-07-08",
      }),
    );

    await expect(
      processOccurrenceSyncHorizons({
        supabase: SUPABASE,
        now: NOW,
        horizonDays: 30,
        limit: 5,
      }),
    ).resolves.toEqual({
      checked: 1,
      synced: 0,
      skipped: 1,
      failed: 0,
    });
    expect(listProfileOccurrenceSyncTargets).toHaveBeenCalledWith(SUPABASE, {
      limit: 5,
    });
    expect(listUserBehaviors).toHaveBeenCalledWith(SUPABASE, "user-1");
    expect(listBehaviorOccurrencesFrom).not.toHaveBeenCalled();
  });

  it("uses the background horizon process to plan reminder deliveries after occurrence sync", async () => {
    const behavior = buildBehavior({
      id: "behavior-1",
      title: "Morning behavior",
      scheduledTime: "10:00:00",
    });
    const occurrence = buildOccurrence({
      id: "occurrence-1",
      behaviorId: "behavior-1",
      scheduledFor: "2026-06-08T14:00:00Z",
      startTime: "10:00:00",
    });

    vi.mocked(listProfileOccurrenceSyncTargets).mockResolvedValue([
      {
        id: "user-1",
        timezone: "America/New_York",
      },
    ]);
    vi.mocked(listUserBehaviors).mockResolvedValue([behavior]);
    vi.mocked(readOccurrenceSyncState).mockResolvedValue(
      buildSyncState({
        synced_through_local_date: "2026-06-07",
      }),
    );
    vi.mocked(listBehaviorOccurrencesFrom).mockResolvedValue([occurrence]);

    await expect(
      processOccurrenceSyncHorizons({
        supabase: SUPABASE,
        now: NOW,
        horizonDays: 0,
        limit: 5,
      }),
    ).resolves.toEqual({
      checked: 1,
      synced: 1,
      skipped: 0,
      failed: 0,
    });
    expect(syncReminderDeliveriesForBehaviors).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      [{ behavior, occurrences: [occurrence] }],
    );
  });
});

describe("applyOccurrenceStatusTransition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestOccurrenceStatusEventForOccurrence).mockResolvedValue(
      null,
    );
  });

  it("atomically applies a first Completed mark and its explicit-mark event", async () => {
    const occurrence = buildOccurrence({
      id: "occurrence-1",
      behaviorId: "behavior-1",
      scheduledFor: "2026-06-08T14:00:00Z",
      startTime: "10:00:00",
    });
    const updatedOccurrence = {
      ...occurrence,
      status: "completed" as const,
      completed_at: NOW.toString(),
      status_marked_at: NOW.toString(),
    };
    const statusEvent = buildStatusEvent({
      previousStatus: "unresolved",
      status: "completed",
      semantics: "explicit_user_mark",
      effectiveAt: NOW.toString(),
    });

    vi.mocked(getOccurrenceWithBehaviorTimezoneById).mockResolvedValue({
      ...occurrence,
      behavior: { timezone: "America/New_York" },
    });
    vi.mocked(applyOccurrenceStatusTransitionRpc).mockResolvedValue({
      statusChanged: true,
      concurrentDuplicate: false,
      occurrence: updatedOccurrence,
      statusEvent,
    });

    await expect(
      applyOccurrenceStatusTransition(SUPABASE, "user-1", {
        occurrenceId: occurrence.id,
        nextStatus: "completed",
        now: NOW,
      }),
    ).resolves.toEqual({
      statusChanged: true,
      concurrentDuplicate: false,
      occurrence: updatedOccurrence,
      statusEvent,
    });

    expect(applyOccurrenceStatusTransitionRpc).toHaveBeenCalledWith(SUPABASE, {
      occurrenceId: occurrence.id,
      expectedStatus: "unresolved",
      expectedLatestEventId: null,
      status: "completed",
      completedAt: NOW.toString(),
      statusMarkedAt: NOW.toString(),
      cancelPendingReminders: true,
      event: {
        previousStatus: "unresolved",
        status: "completed",
        statusSemantics: "explicit_user_mark",
        recordedAt: NOW.toString(),
        effectiveAt: NOW.toString(),
        sourceCaptureMethod: "manual_tap",
        sourceConfidence: "high",
      },
    });
    expect(updateOccurrenceById).not.toHaveBeenCalled();
    expect(getLatestOccurrenceStatusEventForOccurrence).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      occurrence.id,
    );
  });

  it("plans a correction from Completed to Not Completed for the transactional RPC", async () => {
    const occurrence = {
      ...buildOccurrence({
        id: "occurrence-1",
        behaviorId: "behavior-1",
        scheduledFor: "2026-06-08T14:00:00Z",
        startTime: "10:00:00",
      }),
      status: "completed" as const,
      completed_at: "2026-06-07T12:00:00Z",
      status_marked_at: "2026-06-07T12:00:00Z",
    };
    const updatedOccurrence = {
      ...occurrence,
      status: "not_completed" as const,
      completed_at: null,
      status_marked_at: NOW.toString(),
    };

    vi.mocked(getOccurrenceWithBehaviorTimezoneById).mockResolvedValue({
      ...occurrence,
      behavior: { timezone: "America/New_York" },
    });
    vi.mocked(getLatestOccurrenceStatusEventForOccurrence).mockResolvedValue(
      buildStatusEvent({
        previousStatus: "unresolved",
        status: "completed",
        semantics: "explicit_user_mark",
        effectiveAt: "2026-06-07T12:00:00Z",
      }),
    );
    vi.mocked(applyOccurrenceStatusTransitionRpc).mockResolvedValue({
      statusChanged: true,
      concurrentDuplicate: false,
      occurrence: updatedOccurrence,
      statusEvent: buildStatusEvent({
        previousStatus: "completed",
        status: "not_completed",
        semantics: "explicit_user_correction",
        effectiveAt: NOW.toString(),
      }),
    });

    await applyOccurrenceStatusTransition(SUPABASE, "user-1", {
      occurrenceId: occurrence.id,
      nextStatus: "not_completed",
      now: NOW,
    });

    expect(applyOccurrenceStatusTransitionRpc).toHaveBeenCalledWith(SUPABASE, {
      occurrenceId: occurrence.id,
      expectedStatus: "completed",
      expectedLatestEventId: "status-event-1",
      status: "not_completed",
      completedAt: null,
      statusMarkedAt: NOW.toString(),
      cancelPendingReminders: true,
      event: expect.objectContaining({
        previousStatus: "completed",
        status: "not_completed",
        statusSemantics: "explicit_user_correction",
        recordedAt: NOW.toString(),
        effectiveAt: NOW.toString(),
      }),
    });
  });

  it("allows a legacy resolved snapshot without an event to start real correction history", async () => {
    const occurrence = {
      ...buildOccurrence({
        id: "occurrence-1",
        behaviorId: "behavior-1",
        scheduledFor: "2026-06-08T14:00:00Z",
        startTime: "10:00:00",
      }),
      status: "completed" as const,
      completed_at: "2026-06-07T12:00:00Z",
      status_marked_at: "2026-06-07T12:00:00Z",
    };
    const updatedOccurrence = {
      ...occurrence,
      status: "not_completed" as const,
      completed_at: null,
      status_marked_at: NOW.toString(),
    };
    const correctionEvent = {
      ...buildStatusEvent({
        previousStatus: "completed",
        status: "not_completed",
        semantics: "explicit_user_correction",
        effectiveAt: NOW.toString(),
      }),
      revises_event_id: null,
    };

    vi.mocked(getOccurrenceWithBehaviorTimezoneById).mockResolvedValue({
      ...occurrence,
      behavior: { timezone: "America/New_York" },
    });
    vi.mocked(applyOccurrenceStatusTransitionRpc).mockResolvedValue({
      statusChanged: true,
      concurrentDuplicate: false,
      occurrence: updatedOccurrence,
      statusEvent: correctionEvent,
    });

    await expect(
      applyOccurrenceStatusTransition(SUPABASE, "user-1", {
        occurrenceId: occurrence.id,
        nextStatus: "not_completed",
        now: NOW,
      }),
    ).resolves.toMatchObject({ statusEvent: { revises_event_id: null } });

    expect(applyOccurrenceStatusTransitionRpc).toHaveBeenCalledWith(
      SUPABASE,
      expect.objectContaining({
        expectedStatus: "completed",
        expectedLatestEventId: null,
        cancelPendingReminders: true,
        event: expect.objectContaining({
          statusSemantics: "explicit_user_correction",
        }),
      }),
    );
  });

  it("plans a correction back to Unresolved without status timestamps", async () => {
    const occurrence = {
      ...buildOccurrence({
        id: "occurrence-1",
        behaviorId: "behavior-1",
        scheduledFor: "2026-06-08T14:00:00Z",
        startTime: "10:00:00",
      }),
      status: "not_completed" as const,
      status_marked_at: "2026-06-07T12:00:00Z",
    };
    const updatedOccurrence = {
      ...occurrence,
      status: "unresolved" as const,
      completed_at: null,
      status_marked_at: null,
    };

    vi.mocked(getOccurrenceWithBehaviorTimezoneById).mockResolvedValue({
      ...occurrence,
      behavior: { timezone: "America/New_York" },
    });
    vi.mocked(getLatestOccurrenceStatusEventForOccurrence).mockResolvedValue(
      buildStatusEvent({
        previousStatus: "unresolved",
        status: "not_completed",
        semantics: "explicit_user_mark",
        effectiveAt: "2026-06-07T12:00:00Z",
      }),
    );
    vi.mocked(applyOccurrenceStatusTransitionRpc).mockResolvedValue({
      statusChanged: true,
      concurrentDuplicate: false,
      occurrence: updatedOccurrence,
      statusEvent: buildStatusEvent({
        previousStatus: "not_completed",
        status: "unresolved",
        semantics: "explicit_user_correction",
        effectiveAt: null,
      }),
    });

    await applyOccurrenceStatusTransition(SUPABASE, "user-1", {
      occurrenceId: occurrence.id,
      nextStatus: "unresolved",
      now: NOW,
    });

    expect(applyOccurrenceStatusTransitionRpc).toHaveBeenCalledWith(SUPABASE, {
      occurrenceId: occurrence.id,
      expectedStatus: "not_completed",
      expectedLatestEventId: "status-event-1",
      status: "unresolved",
      completedAt: null,
      statusMarkedAt: null,
      cancelPendingReminders: false,
      event: expect.objectContaining({
        statusSemantics: "explicit_user_correction",
        recordedAt: NOW.toString(),
        effectiveAt: null,
      }),
    });
  });

  it("treats resolution after a cleared decision as a correction", async () => {
    const occurrence = buildOccurrence({
      id: "occurrence-1",
      behaviorId: "behavior-1",
      scheduledFor: "2026-06-08T14:00:00Z",
      startTime: "10:00:00",
    });

    vi.mocked(getOccurrenceWithBehaviorTimezoneById).mockResolvedValue({
      ...occurrence,
      behavior: { timezone: "America/New_York" },
    });
    vi.mocked(getLatestOccurrenceStatusEventForOccurrence).mockResolvedValue(
      buildStatusEvent({
        previousStatus: "completed",
        status: "unresolved",
        semantics: "explicit_user_correction",
        effectiveAt: null,
      }),
    );
    vi.mocked(applyOccurrenceStatusTransitionRpc).mockResolvedValue({
      statusChanged: true,
      concurrentDuplicate: false,
      occurrence: {
        ...occurrence,
        status: "completed",
        completed_at: NOW.toString(),
        status_marked_at: NOW.toString(),
      },
      statusEvent: buildStatusEvent({
        previousStatus: "unresolved",
        status: "completed",
        semantics: "explicit_user_correction",
        effectiveAt: NOW.toString(),
      }),
    });

    await applyOccurrenceStatusTransition(SUPABASE, "user-1", {
      occurrenceId: occurrence.id,
      nextStatus: "completed",
      now: NOW,
    });

    expect(applyOccurrenceStatusTransitionRpc).toHaveBeenCalledWith(
      SUPABASE,
      expect.objectContaining({
        expectedStatus: "unresolved",
        expectedLatestEventId: "status-event-1",
        event: expect.objectContaining({
          statusSemantics: "explicit_user_correction",
        }),
      }),
    );
  });

  it("keeps a repeated status mark event-free and idempotent", async () => {
    const occurrence = {
      ...buildOccurrence({
        id: "occurrence-1",
        behaviorId: "behavior-1",
        scheduledFor: "2026-06-08T14:00:00Z",
        startTime: "10:00:00",
      }),
      status: "completed" as const,
      completed_at: "2026-06-07T12:00:00Z",
      status_marked_at: "2026-06-07T12:00:00Z",
    };

    vi.mocked(getOccurrenceWithBehaviorTimezoneById).mockResolvedValue({
      ...occurrence,
      behavior: { timezone: "America/New_York" },
    });
    vi.mocked(getLatestOccurrenceStatusEventForOccurrence).mockResolvedValue(
      buildStatusEvent({
        previousStatus: "unresolved",
        status: "completed",
        semantics: "explicit_user_mark",
        effectiveAt: "2026-06-07T12:00:00Z",
      }),
    );
    vi.mocked(applyOccurrenceStatusTransitionRpc).mockResolvedValue({
      statusChanged: false,
      concurrentDuplicate: false,
      occurrence,
      statusEvent: null,
    });

    await expect(
      applyOccurrenceStatusTransition(SUPABASE, "user-1", {
        occurrenceId: occurrence.id,
        nextStatus: "completed",
        now: NOW,
      }),
    ).resolves.toMatchObject({
      statusChanged: false,
      concurrentDuplicate: false,
      statusEvent: null,
    });

    expect(applyOccurrenceStatusTransitionRpc).toHaveBeenCalledWith(SUPABASE, {
      occurrenceId: occurrence.id,
      expectedStatus: "completed",
      expectedLatestEventId: "status-event-1",
      status: "completed",
      completedAt: "2026-06-07T12:00:00Z",
      statusMarkedAt: "2026-06-07T12:00:00Z",
      cancelPendingReminders: true,
      event: null,
    });
  });

  it("keeps resolver-planned reminder cancellation inside a failing status RPC", async () => {
    const occurrence = buildOccurrence({
      id: "occurrence-1",
      behaviorId: "behavior-1",
      scheduledFor: "2026-06-08T14:00:00Z",
      startTime: "10:00:00",
    });
    const failure = new Error("status event insert failed");

    vi.mocked(getOccurrenceWithBehaviorTimezoneById).mockResolvedValue({
      ...occurrence,
      behavior: { timezone: "America/New_York" },
    });
    vi.mocked(applyOccurrenceStatusTransitionRpc).mockRejectedValue(failure);

    await expect(
      applyOccurrenceStatusTransition(SUPABASE, "user-1", {
        occurrenceId: occurrence.id,
        nextStatus: "completed",
        now: NOW,
      }),
    ).rejects.toThrow(failure);

    expect(applyOccurrenceStatusTransitionRpc).toHaveBeenCalledWith(
      SUPABASE,
      expect.objectContaining({
        expectedLatestEventId: null,
        cancelPendingReminders: true,
      }),
    );
    expect(updateOccurrenceById).not.toHaveBeenCalled();
  });
});

describe("updateOccurrenceNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates only the normalized note without appending a status event", async () => {
    const occurrence = {
      ...buildOccurrence({
        id: "occurrence-1",
        behaviorId: "behavior-1",
        scheduledFor: "2026-06-08T14:00:00Z",
        startTime: "10:00:00",
      }),
      status: "completed" as const,
      completed_at: "2026-06-07T12:00:00Z",
      status_marked_at: "2026-06-07T12:00:00Z",
      note: "First line\nSecond line",
    };

    vi.mocked(updateOccurrenceById).mockResolvedValue(occurrence);

    await expect(
      updateOccurrenceNote(SUPABASE, "user-1", {
        occurrenceId: occurrence.id,
        note: "  First line\r\nSecond line  ",
      }),
    ).resolves.toEqual(occurrence);

    expect(updateOccurrenceById).toHaveBeenCalledWith(
      SUPABASE,
      "user-1",
      occurrence.id,
      { note: "First line\nSecond line" },
    );
    expect(applyOccurrenceStatusTransitionRpc).not.toHaveBeenCalled();
    expect(getLatestOccurrenceStatusEventForOccurrence).not.toHaveBeenCalled();
  });
});

function buildBehavior(input: {
  id: string;
  title: string;
  scheduledTime: string;
}): Behavior & {
  category: Pick<Category, "id" | "name"> | null;
  schedule_slots: BehaviorScheduleSlot[];
} {
  return {
    id: input.id,
    user_id: "user-1",
    category_id: CATEGORY.id,
    category: CATEGORY,
    title: input.title,
    description: null,
    recurrence_rule: { frequency: "daily", interval: 1 },
    scheduled_time: input.scheduledTime,
    timezone: "America/New_York",
    browser_reminder_enabled: true,
    email_reminder_enabled: false,
    reminder_offset_minutes: 0,
    active: true,
    archived_at: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    schedule_slots: [
      {
        id: `${input.id}-slot-1`,
        user_id: "user-1",
        behavior_id: input.id,
        behavior_schedule_id: null,
        kind: "exact",
        preset: null,
        start_time: input.scheduledTime,
        end_time: null,
        sort_order: 0,
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ],
  };
}

function buildSchedule(input: {
  id: string;
  behaviorId: string;
  startTime: string | null;
  sortOrder?: number;
}) {
  return {
    id: input.id,
    user_id: "user-1",
    behavior_id: input.behaviorId,
    recurrence_rule: {
      frequency: "weekly",
      interval: 1,
      daysOfWeek: ["friday"],
    },
    sort_order: input.sortOrder ?? 0,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    schedule_slots: input.startTime
      ? [
          {
            id: `${input.id}-slot-1`,
            user_id: "user-1",
            behavior_id: input.behaviorId,
            behavior_schedule_id: input.id,
            kind: "exact",
            preset: null,
            start_time: input.startTime,
            end_time: null,
            sort_order: 0,
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-01T00:00:00Z",
          },
        ]
      : [],
  };
}

function buildOccurrence(input: {
  id: string;
  behaviorId: string;
  scheduledFor: string;
  startTime: string;
}): Occurrence {
  return {
    id: input.id,
    user_id: "user-1",
    behavior_id: input.behaviorId,
    behavior_schedule_slot_id: `${input.behaviorId}-slot-1`,
    scheduled_for: input.scheduledFor,
    local_date: "2026-06-08",
    schedule_kind: "exact",
    schedule_preset: null,
    schedule_start_time: input.startTime,
    schedule_end_time: null,
    status: "unresolved",
    completed_at: null,
    status_marked_at: null,
    note: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  };
}

function buildStatusEvent(input: {
  previousStatus: "unresolved" | "completed" | "not_completed";
  status: "unresolved" | "completed" | "not_completed";
  semantics: "explicit_user_mark" | "explicit_user_correction";
  effectiveAt: string | null;
}): OccurrenceStatusEvent {
  return {
    id: "status-event-1",
    user_id: "user-1",
    occurrence_id: "occurrence-1",
    behavior_id: "behavior-1",
    previous_status: input.previousStatus,
    status: input.status,
    status_semantics: input.semantics,
    recorded_at: NOW.toString(),
    effective_at: input.effectiveAt,
    local_date: "2026-06-08",
    timezone: "America/New_York",
    source_capture_method: "manual_tap",
    source_confidence: "high",
    revises_event_id:
      input.semantics === "explicit_user_correction" ? "status-event-0" : null,
    reason_code: null,
    created_at: NOW.toString(),
    updated_at: NOW.toString(),
  };
}

function buildSyncState(
  overrides: Partial<OccurrenceSyncState> = {},
): OccurrenceSyncState {
  return {
    user_id: "user-1",
    timezone: "America/New_York",
    last_synced_local_date: "2026-06-08",
    synced_through_local_date: "2026-06-08",
    last_successful_sync_at: "2026-06-08T14:30:00Z",
    stale: false,
    stale_reason: null,
    last_sync_behavior_count: 1,
    last_sync_created_count: 0,
    last_sync_updated_count: 0,
    last_sync_deleted_count: 0,
    created_at: "2026-06-08T14:30:00Z",
    updated_at: "2026-06-08T14:30:00Z",
    ...overrides,
  };
}
