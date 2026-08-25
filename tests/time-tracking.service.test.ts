import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireCurrentUserId } from "@/lib/auth/current-user";
import { getBehaviorById } from "@/lib/db/behaviors.repo";
import { getOccurrenceById } from "@/lib/db/occurrences.repo";
import {
  createRunningTimeSession,
  deleteTimeSessionsForOccurrence,
  listTimeSessionsForOccurrence,
  stopRunningTimeSession,
} from "@/lib/db/timeSessions.repo";
import {
  resetOccurrenceTimeTracking,
  startOccurrenceTimeTracking,
  stopOccurrenceTimeTracking,
} from "@/lib/services/time-tracking.service";
import { createClient } from "@/lib/supabase/server";
import type {
  BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import type { Occurrence, OccurrenceTimeSession } from "@/lib/types/database";

vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUserId: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/behaviors.repo", () => ({ getBehaviorById: vi.fn() }));
vi.mock("@/lib/db/occurrences.repo", () => ({ getOccurrenceById: vi.fn() }));
vi.mock("@/lib/db/timeSessions.repo", () => ({
  createRunningTimeSession: vi.fn(),
  deleteTimeSessionsForOccurrence: vi.fn(),
  listTimeSessionsForOccurrence: vi.fn(),
  stopRunningTimeSession: vi.fn(),
}));

const NOW = Temporal.Instant.from("2026-08-02T14:30:00Z");
const SUPABASE = { kind: "supabase" } as never;

describe("time tracking service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(SUPABASE);
    vi.mocked(requireCurrentUserId).mockResolvedValue("user-1");
    vi.mocked(getOccurrenceById).mockResolvedValue(occurrence());
    vi.mocked(getBehaviorById).mockResolvedValue(behavior());
    vi.mocked(listTimeSessionsForOccurrence).mockResolvedValue([]);
    vi.mocked(createRunningTimeSession).mockResolvedValue(session({ stopped_at: null }));
    vi.mocked(stopRunningTimeSession).mockResolvedValue(null);
    vi.mocked(deleteTimeSessionsForOccurrence).mockResolvedValue([]);
  });

  it("starts a current-local-day occurrence for an active behavior", async () => {
    await expect(
      startOccurrenceTimeTracking("occurrence-1", { now: NOW }),
    ).resolves.toMatchObject({ changed: true, tracking: { recordedSeconds: 0 } });

    expect(createRunningTimeSession).toHaveBeenCalledWith(SUPABASE, {
      user_id: "user-1",
      occurrence_id: "occurrence-1",
      behavior_id: "behavior-1",
      started_at: NOW.toString(),
    });
  });

  it("starts prior unresolved and same-day retained Needs decision occurrences", async () => {
    vi.mocked(getOccurrenceById).mockResolvedValueOnce(
      occurrence({ local_date: "2026-08-01" }),
    );
    await expect(
      startOccurrenceTimeTracking("occurrence-1", { now: NOW }),
    ).resolves.toMatchObject({ changed: true });

    vi.mocked(getOccurrenceById).mockResolvedValueOnce(
      occurrence({
        local_date: "2026-08-01",
        status: "completed",
        status_marked_at: "2026-08-02T14:00:00Z",
      }),
    );
    await expect(
      startOccurrenceTimeTracking("occurrence-1", { now: NOW }),
    ).resolves.toMatchObject({ changed: true });
  });

  it("rejects future, archived, expired resolved, and missing occurrences before inserting", async () => {
    const ineligibleMessage =
      "Time tracking is available for active behaviors on today's Timeline or in Needs decision.";

    vi.mocked(getOccurrenceById).mockResolvedValueOnce(
      occurrence({ local_date: "2026-08-03" }),
    );
    await expect(startOccurrenceTimeTracking("occurrence-1", { now: NOW })).rejects.toThrow(
      ineligibleMessage,
    );

    vi.mocked(getOccurrenceById).mockResolvedValueOnce(
      occurrence({
        local_date: "2026-08-01",
        status: "completed",
        status_marked_at: "2026-08-01T14:00:00Z",
      }),
    );
    await expect(startOccurrenceTimeTracking("occurrence-1", { now: NOW })).rejects.toThrow(
      ineligibleMessage,
    );

    vi.mocked(getBehaviorById).mockResolvedValueOnce(behavior({ active: false }));
    await expect(startOccurrenceTimeTracking("occurrence-1", { now: NOW })).rejects.toThrow(
      ineligibleMessage,
    );

    vi.mocked(getOccurrenceById).mockResolvedValueOnce(null);
    await expect(startOccurrenceTimeTracking("other-user-occurrence", { now: NOW })).rejects.toThrow(
      "This occurrence is no longer available.",
    );
    expect(createRunningTimeSession).toHaveBeenCalledTimes(0);
  });

  it("returns an existing running session after a duplicate start race", async () => {
    const running = session({ stopped_at: null });
    vi.mocked(createRunningTimeSession).mockResolvedValueOnce(null);
    vi.mocked(listTimeSessionsForOccurrence)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([running]);

    await expect(
      startOccurrenceTimeTracking("occurrence-1", { now: NOW }),
    ).resolves.toMatchObject({
      changed: false,
      tracking: { runningSession: { id: running.id } },
    });
  });

  it("stops a running session without reading or writing occurrence status state", async () => {
    const running = session({ stopped_at: null, started_at: "2026-08-02T14:00:00Z" });
    const stopped = session({ stopped_at: NOW.toString(), started_at: running.started_at });
    vi.mocked(listTimeSessionsForOccurrence).mockResolvedValue([running]);
    vi.mocked(stopRunningTimeSession).mockResolvedValue(stopped);

    await expect(
      stopOccurrenceTimeTracking("occurrence-1", { now: NOW }),
    ).resolves.toMatchObject({
      changed: true,
      tracking: { recordedSeconds: 1800, runningSession: null },
    });

    expect(stopRunningTimeSession).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      occurrenceId: "occurrence-1",
      sessionId: running.id,
      stoppedAt: NOW.toString(),
    });
  });

  it("stops and resets idempotently, including after midnight", async () => {
    const stopped = session({ stopped_at: "2026-08-02T14:10:00Z" });
    vi.mocked(listTimeSessionsForOccurrence).mockResolvedValue([stopped]);

    await expect(
      stopOccurrenceTimeTracking("occurrence-1", {
        now: Temporal.Instant.from("2026-08-03T04:30:00Z"),
      }),
    ).resolves.toMatchObject({ changed: false, tracking: { runningSession: null } });

    await expect(resetOccurrenceTimeTracking("occurrence-1")).resolves.toMatchObject({
      changed: false,
      tracking: { sessions: [] },
    });

    vi.mocked(deleteTimeSessionsForOccurrence).mockResolvedValueOnce([stopped.id]);
    await expect(resetOccurrenceTimeTracking("occurrence-1")).resolves.toMatchObject({
      changed: true,
      tracking: { sessions: [] },
    });
    expect(deleteTimeSessionsForOccurrence).toHaveBeenCalledWith(SUPABASE, {
      userId: "user-1",
      occurrenceId: "occurrence-1",
    });
  });
});

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: "occurrence-1",
    user_id: "user-1",
    behavior_id: "behavior-1",
    behavior_schedule_slot_id: "slot-1",
    behavior_configuration_event_id: null,
    scheduled_for: "2026-08-02T14:00:00Z",
    local_date: "2026-08-02",
    schedule_kind: "exact",
    schedule_preset: null,
    schedule_start_time: "10:00:00",
    schedule_end_time: null,
    status: "unresolved",
    completed_at: null,
    status_marked_at: null,
    note: null,
    created_at: "2026-08-02T10:00:00Z",
    updated_at: "2026-08-02T10:00:00Z",
    ...overrides,
  };
}

function behavior(overrides: Partial<BehaviorWithCategory> = {}): BehaviorWithCategory {
  return {
    id: "behavior-1",
    user_id: "user-1",
    category_id: null,
    title: "Walk",
    description: null,
    recurrence_rule: { type: "daily" },
    scheduled_time: "10:00:00",
    timezone: "America/New_York",
    browser_reminder_enabled: true,
    email_reminder_enabled: false,
    reminder_offset_minutes: 0,
    active: true,
    archived_at: null,
    current_configuration_event_id: "configuration-event-1",
    created_at: "2026-08-02T10:00:00Z",
    updated_at: "2026-08-02T10:00:00Z",
    category: null,
    schedule_slots: [],
    ...overrides,
  };
}

function session(
  overrides: Partial<OccurrenceTimeSession> = {},
): OccurrenceTimeSession {
  return {
    id: "session-1",
    user_id: "user-1",
    occurrence_id: "occurrence-1",
    behavior_id: "behavior-1",
    started_at: "2026-08-02T14:00:00Z",
    stopped_at: "2026-08-02T14:05:00Z",
    created_at: "2026-08-02T14:00:00Z",
    updated_at: "2026-08-02T14:00:00Z",
    ...overrides,
  };
}
