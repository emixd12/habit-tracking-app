import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  formatTrackedDuration,
  resolveOccurrenceTimeTracking,
  resolveResetTimeTracking,
  resolveStartTimeTracking,
  resolveStopTimeTracking,
} from "@/lib/resolvers/time-tracking.resolver";
import type { TimeSession } from "@/lib/types/time-tracking";

const NOW = Temporal.Instant.from("2026-08-02T14:30:45Z");

describe("time tracking resolver", () => {
  it("plans one start and is idempotent while an occurrence already runs", () => {
    expect(resolveStartTimeTracking({ sessions: [], now: NOW })).toEqual({
      kind: "start",
      startedAt: NOW.toString(),
    });

    const running = session({ stoppedAt: null });

    expect(resolveStartTimeTracking({ sessions: [running], now: NOW })).toEqual({
      kind: "already_running",
      session: running,
    });
  });

  it("plans stop from persisted instants and repeats as a stable no-op", () => {
    const running = session({ startedAt: "2026-08-02T14:00:00Z", stoppedAt: null });
    const stopped = session({
      id: "session-2",
      startedAt: "2026-08-02T13:30:00Z",
      stoppedAt: "2026-08-02T13:45:00Z",
    });

    expect(
      resolveStopTimeTracking({ sessions: [stopped, running], now: NOW }),
    ).toEqual({
      kind: "stop",
      sessionId: running.id,
      stoppedAt: NOW.toString(),
      durationSeconds: 1845,
    });
    expect(resolveStopTimeTracking({ sessions: [stopped], now: NOW })).toEqual({
      kind: "already_stopped",
      session: stopped,
    });
  });

  it("sums only stopped sessions and restores a running session", () => {
    const stoppedFirst = session({
      id: "session-1",
      startedAt: "2026-08-02T10:00:00Z",
      stoppedAt: "2026-08-02T10:01:30Z",
    });
    const stoppedSecond = session({
      id: "session-2",
      startedAt: "2026-08-02T11:00:00Z",
      stoppedAt: "2026-08-02T11:02:00Z",
    });
    const running = session({
      id: "session-3",
      startedAt: "2026-08-02T14:00:00Z",
      stoppedAt: null,
    });

    expect(
      resolveOccurrenceTimeTracking([stoppedFirst, stoppedSecond, running]),
    ).toEqual({
      sessions: [stoppedFirst, stoppedSecond, running],
      runningSession: running,
      recordedSeconds: 210,
    });
  });

  it("formats elapsed time as HH:MM:SS without rounding up", () => {
    expect(formatTrackedDuration(0)).toBe("00:00:00");
    expect(formatTrackedDuration(3661.9)).toBe("01:01:01");
    expect(formatTrackedDuration(100 * 60 * 60)).toBe("100:00:00");
  });

  it("rejects invalid and backwards persisted timestamps", () => {
    expect(() =>
      resolveOccurrenceTimeTracking([
        session({ startedAt: "not-an-instant", stoppedAt: null }),
      ]),
    ).toThrow("invalid started_at");
    expect(() =>
      resolveOccurrenceTimeTracking([
        session({
          startedAt: "2026-08-02T14:00:00Z",
          stoppedAt: "2026-08-02T13:59:59Z",
        }),
      ]),
    ).toThrow("before started_at");
  });

  it("plans idempotent reset over every stopped and running session", () => {
    const stopped = session({ stoppedAt: "2026-08-02T14:10:00Z" });
    const running = session({ id: "session-2", stoppedAt: null });

    expect(resolveResetTimeTracking([stopped, running])).toEqual({
      sessionIds: ["session-1", "session-2"],
      hasSessions: true,
    });
    expect(resolveResetTimeTracking([])).toEqual({
      sessionIds: [],
      hasSessions: false,
    });
  });
});

function session(overrides: Partial<TimeSession> = {}): TimeSession {
  return {
    id: "session-1",
    userId: "user-1",
    occurrenceId: "occurrence-1",
    behaviorId: "behavior-1",
    startedAt: "2026-08-02T14:00:00Z",
    stoppedAt: "2026-08-02T14:05:00Z",
    ...overrides,
  };
}
