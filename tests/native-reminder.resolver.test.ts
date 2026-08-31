import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  assessNativeReminderCoverage,
  selectNativeReminderRequests,
  type NativeReminderRequest,
} from "../lib/resolvers/native-reminder.resolver";

const NOW = Temporal.Instant.from("2026-08-30T12:00:00Z");
const THROUGH = Temporal.Instant.from("2026-08-30T12:03:00Z");

function request(id: string, fireAt: string): NativeReminderRequest {
  return { id, title: `Title ${id}`, body: `Body ${id}`, fireAt };
}

describe("native reminder planning and coverage", () => {
  it("selects the nearest 100 of 128 requests and reports the remaining horizon gap", () => {
    const requests = Array.from({ length: 128 }, (_, index) => {
      const second = index + 1;
      return request(
        `r${second}`,
        `2026-08-30T12:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}Z`,
      );
    }).reverse();
    const before = structuredClone(requests);
    const selected = selectNativeReminderRequests({
      requests, now: NOW, targetThrough: THROUGH, capacity: 100,
    });

    expect(selected.map(({ id }) => id)).toEqual(
      Array.from({ length: 100 }, (_, index) => `r${index + 1}`),
    );
    expect(requests).toEqual(before);
    expect(assessNativeReminderCoverage({
      requests, pending: selected, now: NOW, targetThrough: THROUGH,
    })).toEqual({
      status: "limited",
      scheduledThrough: "2026-08-30T12:01:40Z",
      firstUnscheduledAt: "2026-08-30T12:01:41Z",
      expectedCount: 128,
      scheduledCount: 100,
      missingIds: Array.from({ length: 28 }, (_, index) => `r${index + 101}`),
    });
    expect(selectNativeReminderRequests({
      requests, now: NOW, targetThrough: THROUGH, capacity: 0,
    })).toEqual([]);
    expect(selectNativeReminderRequests({
      requests, now: NOW, targetThrough: THROUGH, capacity: 200,
    })).toHaveLength(128);
  });

  it("rounds future instants upward to seconds without reviving past requests or exceeding the horizon", () => {
    const requests = [
      request("past", "2026-08-30T12:00:00.1Z"),
      request("now", "2026-08-30T12:00:00.5Z"),
      request("b", "2026-08-30T12:00:00.501Z"),
      request("a", "2026-08-30T08:00:01-04:00"),
      request("boundary", "2026-08-30T12:00:02Z"),
      request("rounds-outside", "2026-08-30T12:00:02.25Z"),
      request("outside", "2026-08-30T12:00:03Z"),
    ];
    const selected = selectNativeReminderRequests({
      requests,
      now: Temporal.Instant.from("2026-08-30T12:00:00.5Z"),
      targetThrough: Temporal.Instant.from("2026-08-30T12:00:02.5Z"),
      capacity: 10,
    });

    expect(selected).toEqual([
      request("a", "2026-08-30T12:00:01Z"),
      request("b", "2026-08-30T12:00:01Z"),
      request("boundary", "2026-08-30T12:00:02Z"),
    ]);
  });

  it("stops coverage before a hole or a partially retained same-time group", () => {
    const first = request("first", "2026-08-30T12:00:10Z");
    const secondA = request("second-a", "2026-08-30T12:00:20Z");
    const secondB = request("second-b", "2026-08-30T12:00:20Z");
    const last = request("last", "2026-08-30T12:00:30Z");
    const requests = [last, secondB, first, secondA];

    expect(assessNativeReminderCoverage({
      requests, pending: [first, secondA, last], now: NOW, targetThrough: THROUGH,
    })).toEqual({
      status: "limited", scheduledThrough: first.fireAt,
      firstUnscheduledAt: secondB.fireAt, expectedCount: 4,
      scheduledCount: 3, missingIds: ["second-b"],
    });
    expect(assessNativeReminderCoverage({
      requests, pending: [secondA, secondB, last], now: NOW, targetThrough: THROUGH,
    })).toMatchObject({
      scheduledThrough: NOW.toString(), firstUnscheduledAt: first.fireAt,
      scheduledCount: 3, missingIds: ["first"],
    });
    expect(assessNativeReminderCoverage({
      requests: [secondA, secondB], pending: [secondA], now: NOW, targetThrough: THROUGH,
    }).scheduledThrough).toBe(NOW.toString());
  });

  it("requires the exact instant and content while accepting equivalent timezone representations", () => {
    const requests = ["correct", "time", "title", "body", "unknown-time"].map(
      (id) => request(id, "2026-08-30T12:01:00Z"),
    );
    const pending = [
      { ...requests[0]!, fireAt: "2026-08-30T08:01:00-04:00" },
      { ...requests[1]!, fireAt: "2026-08-30T12:01:00.001Z" },
      { ...requests[2]!, title: "Old title" },
      { ...requests[3]!, body: "Old body" },
      { ...requests[4]!, fireAt: null },
      request("unrelated", "2026-08-30T12:02:00Z"),
    ];

    expect(assessNativeReminderCoverage({
      requests, pending, now: NOW, targetThrough: THROUGH,
    })).toEqual({
      status: "limited", scheduledThrough: NOW.toString(),
      firstUnscheduledAt: "2026-08-30T12:01:00Z", expectedCount: 5,
      scheduledCount: 1, missingIds: ["body", "time", "title", "unknown-time"],
    });
    const fractional = request("fractional", "2026-08-30T12:00:00.1Z");
    expect(assessNativeReminderCoverage({
      requests: [fractional],
      pending: [{ ...fractional, fireAt: "2026-08-30T12:00:01Z" }],
      now: NOW, targetThrough: THROUGH,
    }).status).toBe("complete");
  });

  it("distinguishes verified empty coverage from unknown readback, even without expected requests", () => {
    const expected = request("one", "2026-08-30T12:01:00Z");
    expect(assessNativeReminderCoverage({
      requests: [expected], pending: [expected], now: NOW, targetThrough: THROUGH,
    })).toEqual({
      status: "complete", scheduledThrough: THROUGH.toString(),
      firstUnscheduledAt: null, expectedCount: 1, scheduledCount: 1, missingIds: [],
    });
    expect(assessNativeReminderCoverage({
      requests: [], pending: [], now: NOW, targetThrough: THROUGH,
    })).toMatchObject({ status: "complete", scheduledThrough: THROUGH.toString() });
    expect(assessNativeReminderCoverage({
      requests: [expected], pending: [], now: NOW, targetThrough: THROUGH,
    })).toEqual({
      status: "limited", scheduledThrough: NOW.toString(),
      firstUnscheduledAt: expected.fireAt, expectedCount: 1,
      scheduledCount: 0, missingIds: ["one"],
    });
    for (const requests of [[], [expected]]) {
      expect(assessNativeReminderCoverage({
        requests, pending: null, now: NOW, targetThrough: THROUGH,
      })).toMatchObject({
        status: "unverified", scheduledThrough: NOW.toString(), scheduledCount: 0,
        missingIds: requests.map(({ id }) => id),
      });
    }
  });

  it("rejects invalid capacities, duplicate IDs, invalid times, and reversed horizons", () => {
    const valid = request("one", "2026-08-30T12:01:00Z");
    for (const capacity of [-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => selectNativeReminderRequests({
        requests: [valid], now: NOW, targetThrough: THROUGH, capacity,
      })).toThrow(/capacity/i);
    }
    for (const requests of [
      [valid, { ...valid, fireAt: "2026-08-30T12:02:00Z" }],
      [request("", valid.fireAt)],
      [request("bad", "not-an-instant")],
      [request("local-date", "2026-08-30")],
    ]) {
      expect(() => selectNativeReminderRequests({
        requests, now: NOW, targetThrough: THROUGH, capacity: 10,
      })).toThrow();
      expect(() => assessNativeReminderCoverage({
        requests, pending: null, now: NOW, targetThrough: THROUGH,
      })).toThrow();
    }
    for (const pending of [[valid, valid], [request("bad", "invalid")]]) {
      expect(() => assessNativeReminderCoverage({
        requests: [valid], pending, now: NOW, targetThrough: THROUGH,
      })).toThrow();
    }
    const beforeNow = NOW.subtract({ seconds: 1 });
    expect(() => selectNativeReminderRequests({
      requests: [], now: NOW, targetThrough: beforeNow, capacity: 0,
    })).toThrow(/horizon/i);
    expect(() => assessNativeReminderCoverage({
      requests: [], pending: [], now: NOW, targetThrough: beforeNow,
    })).toThrow(/horizon/i);
  });
});

it("uses existing status and advance-offset rules without enabling email delivery", async () => {
  const { planNativeReminderRequests } = await import("../lib/resolvers/native-reminder.resolver");
  const { storedBehavior, storedExportOccurrence } = await import("./helpers/export-row-fixture");
  const behavior = { ...storedBehavior(), reminder_offset_minutes: 60, email_reminder_enabled: true };
  const occurrence = { ...storedExportOccurrence(), user_id: behavior.user_id, schedule_range_identity: -1,
    scheduled_for: "2026-08-30T13:01:00Z" };
  const input = { behaviors: [behavior], occurrences: [occurrence], now: NOW, targetThrough: THROUGH };
  expect(planNativeReminderRequests(input)).toEqual([{ id: `cadence.local.${occurrence.id}`,
    title: "Brush teeth", body: "Scheduled for 10:00 PM.", fireAt: "2026-08-30T12:01:00Z" }]);
  expect(planNativeReminderRequests({ ...input, behaviors: [{ ...behavior, browser_reminder_enabled: false }] })).toEqual([]);
  expect(planNativeReminderRequests({ ...input, behaviors: [{ ...behavior, active: false }] })).toEqual([]);
  expect(planNativeReminderRequests({ ...input, occurrences: [{ ...occurrence, status: "completed" }] })).toEqual([]);
  expect(() => planNativeReminderRequests({ ...input, occurrences: [{ ...occurrence, user_id: "other-owner" }] })).toThrow("same user");
});

it("generates beyond the reminder target for advance offsets while keeping tracking available at the planning ceiling", async () => {
  const { resolveNativeReminderGenerationHorizon } = await import("../lib/resolvers/native-reminder.resolver");
  const { storedBehavior } = await import("./helpers/export-row-fixture");
  expect(resolveNativeReminderGenerationHorizon([{ ...storedBehavior(), reminder_offset_minutes: 4320 }]))
    .toEqual({ horizonDays: 34, unsupportedOffset: false });
  for (const offset of [-1, 0.5, NaN, Infinity, 600_000]) {
    expect(resolveNativeReminderGenerationHorizon([{ ...storedBehavior(), reminder_offset_minutes: offset }]))
      .toEqual({ horizonDays: 31, unsupportedOffset: true });
  }
});
