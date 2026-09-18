import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  DAY_PROGRESS_MAX_ICON_LANES,
  resolveDayProgressLayout,
} from "../packages/core/src/resolvers/day-progress.resolver";
import type {
  NormalizedAllDayExternalEvent,
  NormalizedTimedExternalEvent,
} from "../packages/core/src/types/day-progress";

describe("resolveDayProgressLayout", () => {
  it("keeps unchanged chronological rows and brackets equal-time peers at the first row", () => {
    const layout = resolveDayProgressLayout({
      timezone: "UTC",
      days: [{
        localDate: "2026-09-16",
        top: 0,
        bottom: 600,
        rows: [
          row("first", "2026-09-16T09:00:00Z", 120),
          row("peer", "2026-09-16T09:00:00Z", 180),
          row("close", "2026-09-16T09:05:00Z", 260),
          row("long-gap", "2026-09-16T20:00:00Z", 500),
        ],
      }],
    }).days[0]!;

    expect(layout.rowLayouts.map((item) => item.occurrenceId)).toEqual([
      "first",
      "peer",
      "close",
      "long-gap",
    ]);
    expect(layout.rowLayouts[1]).toMatchObject({
      actualPosition: 120,
      displayPosition: 180,
      displacement: 60,
    });
    expect(layout.sameTimeBrackets).toEqual([{
      actualAt: "2026-09-16T09:00:00Z",
      anchorOccurrenceId: "first",
      peerOccurrenceIds: ["peer"],
      top: 120,
      bottom: 180,
    }]);
    expect(layout.positionAnchors.map((anchor) => anchor.position)).toEqual([
      0, 120, 260, 500, 600,
    ]);
  });

  it("uses the first midnight row as the day-start anchor and keeps midnight peers displaced", () => {
    const layout = resolveDayProgressLayout({
      timezone: "UTC",
      now: Temporal.Instant.from("2026-09-16T00:00:00Z"),
      days: [{
        localDate: "2026-09-16",
        top: 0,
        bottom: 500,
        rows: [
          row("midnight", "2026-09-16T00:00:00Z", 30),
          row("midnight-peer", "2026-09-16T00:00:00Z", 70),
        ],
      }],
    }).days[0]!;

    expect(layout.positionAnchors[0]).toEqual({
      kind: "day_start",
      actualAt: "2026-09-16T00:00:00Z",
      position: 30,
      occurrenceId: "midnight",
    });
    expect(layout.rowLayouts[1]).toMatchObject({
      actualPosition: 30,
      displayPosition: 70,
      displacement: 40,
    });
    expect(layout.movingDot?.displayPosition).toBe(30);
  });

  it("maps 23- and 25-hour local days from their true Temporal boundaries", () => {
    const layout = resolveDayProgressLayout({
      timezone: "America/New_York",
      days: [
        { localDate: "2026-03-08", top: 0, bottom: 230, rows: [] },
      ],
    }).days[0]!;
    const fall = resolveDayProgressLayout({
      timezone: "America/New_York",
      days: [
        { localDate: "2026-11-01", top: 0, bottom: 250, rows: [] },
      ],
    }).days[0]!;

    expect(Temporal.Instant.from(layout.dayStart).until(layout.dayEnd).total({ unit: "hours" })).toBe(23);
    expect(Temporal.Instant.from(fall.dayStart).until(fall.dayEnd).total({ unit: "hours" })).toBe(25);
  });

  it("groups only exact original starts and keeps nearby and clipped overnight starts separate", () => {
    const events = [
      timedEvent("overnight-earlier", "2026-09-15T22:00:00Z", "2026-09-16T01:00:00Z"),
      timedEvent("overnight-later", "2026-09-15T23:00:00Z", "2026-09-16T01:00:00Z"),
      timedEvent("exact-z", "2026-09-16T09:00:00Z", "2026-09-16T10:00:00Z"),
      timedEvent("exact-offset", "2026-09-16T05:00:00-04:00", "2026-09-16T06:00:00-04:00"),
      timedEvent("exact-third", "2026-09-16T11:00:00+02:00", "2026-09-16T12:00:00+02:00"),
      timedEvent("nearby", "2026-09-16T09:01:00Z", "2026-09-16T10:00:00Z"),
      {
        ...timedEvent("unknown-end", "2026-09-16T12:00:00Z", "2026-09-16T13:00:00Z"),
        endUnspecified: true,
        duration: { kind: "unknown" as const, reason: "end_unspecified" as const },
      },
      allDayEvent("all-day", "2026-09-16", "2026-09-17"),
    ];
    const layout = resolveDayProgressLayout({
      timezone: "UTC",
      events,
      days: [{ localDate: "2026-09-16", top: 0, bottom: 400, rows: [] }],
    }).days[0]!;

    expect(DAY_PROGRESS_MAX_ICON_LANES).toBe(1);
    expect(layout.timedEventSpans.find((span) => span.eventId === "overnight-earlier")).toMatchObject({
      clippedStart: "2026-09-16T00:00:00Z",
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(layout.allDayEventIds).toEqual(["all-day"]);
    expect(layout.timedEventSpans.find((span) => span.eventId === "unknown-end")).toMatchObject({
      actualEnd: null,
      clippedEnd: null,
      endPosition: null,
      endUnspecified: true,
    });
    expect(layout.timedEventSpans
      .filter((span) => span.eventId.startsWith("overnight"))
      .map((span) => span.startPosition)).toEqual([0, 0]);
    expect(layout.timedEventSpans
      .filter((span) => span.eventId.startsWith("overnight"))
      .map((span) => span.overflowGroupId)).toEqual([null, null]);
    expect(layout.iconOverflowGroups).toEqual([{
      id: "exact-start-2026-09-16-1",
      position: expect.any(Number),
      iconLane: 0,
      eventIds: ["exact-offset", "exact-third", "exact-z"],
      count: 3,
    }]);
    expect(layout.timedEventSpans.find((span) => span.eventId === "nearby")).toMatchObject({
      iconLane: 0,
      overflowGroupId: null,
    });
  });

  it("places one marker per event across midnight, including events already underway at range start", () => {
    const events = [timedEvent("overnight", "2026-09-16T23:30:00Z", "2026-09-18T02:00:00Z")];
    const days = [16, 17, 18].map((day, index) => ({ localDate: `2026-09-${day}`, top: index * 200, bottom: (index + 1) * 200, rows: [] }));
    const layout = resolveDayProgressLayout({ timezone: "UTC", events, days });
    expect(layout.days.map((day) => day.timedEventSpans[0]!.iconLane)).toEqual([0, null, null]);
    expect(layout.days.map((day) => day.requiredIconHeight)).toEqual([88, 0, 0]);
    const clipped = resolveDayProgressLayout({ timezone: "UTC", events, days: days.slice(1) });
    expect(clipped.days.map((day) => day.timedEventSpans[0]!.iconLane)).toEqual([0, null]);
    const separatelyMeasured = resolveDayProgressLayout({ timezone: "UTC", events, firstVisibleDate: "2026-09-16", days: days.slice(1, 2) });
    expect(separatelyMeasured.days[0]!.timedEventSpans[0]!.iconLane).toBeNull();
    expect(separatelyMeasured.days[0]!.timedEventSpans[0]!.continuesAfter).toBe(true);
    expect(() => resolveDayProgressLayout({ timezone: "UTC", events, firstVisibleDate: "2026-09-19", days })).toThrow("First visible date");
  });

  it("packs dense distinct starts 44 pixels apart and reports the height needed before grouping", () => {
    const events = [
      timedEvent("one", "2026-09-16T09:00:00Z", "2026-09-16T10:00:00Z"),
      timedEvent("two", "2026-09-16T09:01:00Z", "2026-09-16T10:00:00Z"),
      timedEvent("three", "2026-09-16T09:02:00Z", "2026-09-16T10:00:00Z"),
      timedEvent("four", "2026-09-16T09:03:00Z", "2026-09-16T10:00:00Z"),
    ];
    const fitting = resolveDayProgressLayout({
      timezone: "UTC",
      maxIconLanes: 2,
      events,
      days: [{ localDate: "2026-09-16", top: 0, bottom: 220, rows: [] }],
    }).days[0]!;
    const positions = fitting.timedEventSpans.map((span) => span.iconPosition);

    expect(fitting.requiredIconHeight).toBe(220);
    expect(fitting.iconLayoutOverflow).toBe(false);
    expect(fitting.iconOverflowGroups).toEqual([]);
    expect(positions[0]).toBeGreaterThanOrEqual(44);
    expect(positions.at(-1)).toBeLessThanOrEqual(176);
    expect(positions.slice(1).map((position, index) => position - positions[index]!))
      .toEqual([44, 44, 44]);

    const centered = resolveDayProgressLayout({
      timezone: "UTC",
      events: events.slice(0, 2),
      days: [{ localDate: "2026-09-16", top: 0, bottom: 480, rows: [] }],
    }).days[0]!.timedEventSpans;
    expect(centered[1]!.iconPosition - centered[0]!.iconPosition).toBe(44);
    expect((centered[0]!.iconPosition + centered[1]!.iconPosition) / 2)
      .toBeCloseTo((centered[0]!.startPosition + centered[1]!.startPosition) / 2);

    const overflowing = resolveDayProgressLayout({
      timezone: "UTC",
      events,
      days: [{ localDate: "2026-09-16", top: 0, bottom: 175, rows: [] }],
    }).days[0]!;
    expect(overflowing.requiredIconHeight).toBe(220);
    expect(overflowing.iconLayoutOverflow).toBe(true);
    expect(overflowing.iconOverflowGroups).toEqual([]);
    expect(overflowing.timedEventSpans.map((span) => span.iconPosition))
      .toEqual([44, 88, 132, 176]);
  });

  it("accepts empty and expanded days and rejects invalid geometry, time order, and event intervals", () => {
    expect(resolveDayProgressLayout({
      timezone: "UTC",
      days: [
        { localDate: "2026-09-16", top: 0, bottom: 100, rows: [] },
        { localDate: "2026-09-17", top: 100, bottom: 500, rows: [row("expanded", "2026-09-17T12:00:00Z", 350)] },
      ],
    }).days).toHaveLength(2);

    expect(() => resolveDayProgressLayout({
      timezone: "UTC",
      days: [{ localDate: "2026-09-16", top: 0, bottom: 100, rows: [
        row("later", "2026-09-16T10:00:00Z", 20),
        row("earlier", "2026-09-16T09:00:00Z", 40),
      ] }],
    })).toThrow("chronological");
    expect(() => resolveDayProgressLayout({
      timezone: "UTC",
      days: [{ localDate: "2026-09-16", top: 100, bottom: 100, rows: [] }],
    })).toThrow("finite top and bottom");
    expect(() => resolveDayProgressLayout({
      timezone: "UTC",
      events: [timedEvent("zero", "2026-09-16T10:00:00Z", "2026-09-16T10:00:00Z")],
      days: [{ localDate: "2026-09-16", top: 0, bottom: 100, rows: [] }],
    })).toThrow("end after");
  });
});

function row(occurrenceId: string, scheduledFor: string, center: number) {
  return { occurrenceId, scheduledFor, center };
}

function timedEvent(id: string, startAt: string, endAt: string): NormalizedTimedExternalEvent {
  return {
    ...eventBase(id),
    kind: "timed",
    startAt,
    endAt,
    endUnspecified: false,
    duration: {
      kind: "known",
      seconds: Temporal.Instant.from(startAt).until(Temporal.Instant.from(endAt)).total({ unit: "seconds" }),
    },
  };
}

function allDayEvent(
  id: string,
  startLocalDate: string,
  endLocalDate: string,
): NormalizedAllDayExternalEvent {
  return {
    ...eventBase(id),
    kind: "all_day",
    startLocalDate,
    endLocalDate,
    duration: {
      kind: "calendar_days",
      days: Temporal.PlainDate.from(startLocalDate).until(Temporal.PlainDate.from(endLocalDate)).days,
    },
  };
}

function eventBase(id: string) {
  return {
    id,
    providerEventId: id,
    logicalInstanceId: `logical-${id}`,
    calendarId: "calendar-1",
    source: "google_calendar" as const,
    calendarName: "Work",
    sourceTimezone: "UTC",
    sourceTimezoneFallback: "request" as const,
    state: "confirmed" as const,
    availability: "busy" as const,
    currentUserResponse: null,
    revision: { availability: "unavailable" as const, providerUpdatedAt: null, providerEtag: null },
    title: id,
    description: "",
    location: "",
    sourceUrl: null,
    fieldAvailability: {},
    detailCompleteness: {},
    organizer: null,
    attendees: null,
    attendeesOmitted: false,
    conference: null,
    recurrence: null,
    attachments: null,
  };
}
