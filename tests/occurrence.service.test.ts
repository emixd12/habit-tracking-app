import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listBehaviorScheduleSlots } from "@/lib/db/behaviors.repo";
import {
  createMissingOccurrences,
  deleteUnresolvedOccurrencesById,
  listBehaviorOccurrencesFrom,
  updateUnresolvedOccurrenceScheduleById,
} from "@/lib/db/occurrences.repo";
import { syncUserOccurrences } from "@/lib/services/occurrence.service";
import { syncReminderDeliveriesForBehaviors } from "@/lib/services/reminder.service";
import type {
  Behavior,
  BehaviorScheduleSlot,
  Category,
  Occurrence,
} from "@/lib/types/database";

vi.mock("@/lib/db/behaviors.repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/behaviors.repo")>();

  return {
    ...actual,
    listBehaviorScheduleSlots: vi.fn(),
    listUserBehaviors: vi.fn(),
  };
});

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
