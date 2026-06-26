import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listBehaviorScheduleSlots,
  listUserBehaviors,
} from "@/lib/db/behaviors.repo";
import {
  createMissingOccurrences,
  deleteUnresolvedOccurrencesById,
  listBehaviorOccurrencesFrom,
  updateUnresolvedOccurrenceScheduleById,
} from "@/lib/db/occurrences.repo";
import { listProfileOccurrenceSyncTargets } from "@/lib/db/profiles.repo";
import {
  markOccurrenceSyncFreshForPlans,
  markOccurrenceSyncStale,
  readOccurrenceSyncState,
} from "@/lib/services/occurrence-sync-state.service";
import {
  ensureUserOccurrencesFresh,
  processOccurrenceSyncHorizons,
  syncUserOccurrences,
} from "@/lib/services/occurrence.service";
import { syncReminderDeliveriesForBehaviors } from "@/lib/services/reminder.service";
import type {
  Behavior,
  BehaviorScheduleSlot,
  Category,
  Occurrence,
  OccurrenceSyncState,
} from "@/lib/types/database";

vi.mock("@/lib/db/behaviors.repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/behaviors.repo")>();

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
  listBehaviorOccurrencesFrom: vi.fn(),
  updateOccurrenceById: vi.fn(),
  updateUnresolvedOccurrenceScheduleById: vi.fn(),
}));

vi.mock("@/lib/db/occurrenceStatusEvents.repo", () => ({
  createOccurrenceStatusEvent: vi.fn(),
  getLatestOccurrenceStatusEventForOccurrence: vi.fn(),
}));

vi.mock("@/lib/services/reminder.service", () => ({
  cancelReminderDeliveriesForResolvedOccurrence: vi.fn(),
  syncReminderDeliveriesForBehavior: vi.fn(),
  syncReminderDeliveriesForBehaviors: vi.fn(),
}));

vi.mock("@/lib/services/occurrence-sync-state.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/occurrence-sync-state.service")>();

  return {
    ...actual,
    markOccurrenceSyncFreshForPlans: vi.fn(),
    markOccurrenceSyncStale: vi.fn(),
    readOccurrenceSyncState: vi.fn(),
  };
});

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
