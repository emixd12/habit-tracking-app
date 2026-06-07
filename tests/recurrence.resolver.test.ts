import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { resolveOccurrenceSchedule } from "../lib/resolvers/recurrence.resolver";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

type ExpectedOccurrence = {
  instant: string;
  localDate: string;
};

const RANGE_END_TIME = "23:59:59.999";

function localInstant(
  localDate: string,
  localTime: string,
  timezone = DEFAULT_TIMEZONE,
): Date {
  const scheduledAt = Temporal.PlainDate.from(localDate)
    .toPlainDateTime(Temporal.PlainTime.from(localTime))
    .toZonedDateTime(timezone, { disambiguation: "compatible" });

  return new Date(scheduledAt.toInstant().epochMilliseconds);
}

function summarizeSchedule(
  schedule: ReturnType<typeof resolveOccurrenceSchedule>,
): ExpectedOccurrence[] {
  return schedule.map((occurrence) => ({
    instant: occurrence.scheduledFor.toString(),
    localDate: occurrence.localDate,
  }));
}

describe("resolveOccurrenceSchedule", () => {
  it("generates one daily occurrence per local day at 10 PM", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "22:00",
      timezone: DEFAULT_TIMEZONE,
      rangeStart: localInstant("2026-01-01", "00:00"),
      rangeEnd: localInstant("2026-01-03", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-01-02T03:00:00Z", localDate: "2026-01-01" },
      { instant: "2026-01-03T03:00:00Z", localDate: "2026-01-02" },
      { instant: "2026-01-04T03:00:00Z", localDate: "2026-01-03" },
    ]);
    expect(
      schedule.every((occurrence) => occurrence.scheduledFor instanceof Temporal.Instant),
    ).toBe(true);
  });

  it("generates every N days from an injected local anchor date", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "interval_days", intervalDays: 3 },
      scheduledTime: "09:30",
      timezone: DEFAULT_TIMEZONE,
      anchorDate: "2026-01-01",
      rangeStart: localInstant("2026-01-01", "00:00"),
      rangeEnd: localInstant("2026-01-10", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-01-01T14:30:00Z", localDate: "2026-01-01" },
      { instant: "2026-01-04T14:30:00Z", localDate: "2026-01-04" },
      { instant: "2026-01-07T14:30:00Z", localDate: "2026-01-07" },
      { instant: "2026-01-10T14:30:00Z", localDate: "2026-01-10" },
    ]);
  });

  it("supports daily rules with an interval greater than one", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 2 },
      scheduledTime: "08:00",
      timezone: DEFAULT_TIMEZONE,
      anchorDate: "2026-01-02",
      rangeStart: localInstant("2026-01-01", "00:00"),
      rangeEnd: localInstant("2026-01-07", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-01-02T13:00:00Z", localDate: "2026-01-02" },
      { instant: "2026-01-04T13:00:00Z", localDate: "2026-01-04" },
      { instant: "2026-01-06T13:00:00Z", localDate: "2026-01-06" },
    ]);
  });

  it("generates weekly occurrences only on selected Fridays", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: ["friday"],
      },
      scheduledTime: "09:00",
      timezone: DEFAULT_TIMEZONE,
      anchorDate: "2026-01-01",
      rangeStart: localInstant("2026-01-01", "00:00"),
      rangeEnd: localInstant("2026-01-15", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-01-02T14:00:00Z", localDate: "2026-01-02" },
      { instant: "2026-01-09T14:00:00Z", localDate: "2026-01-09" },
    ]);
  });

  it("generates every other Sunday using week intervals", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: {
        frequency: "weekly",
        interval: 2,
        daysOfWeek: ["sunday"],
      },
      scheduledTime: "20:15",
      timezone: DEFAULT_TIMEZONE,
      anchorDate: "2026-01-04",
      rangeStart: localInstant("2026-01-01", "00:00"),
      rangeEnd: localInstant("2026-02-01", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-01-05T01:15:00Z", localDate: "2026-01-04" },
      { instant: "2026-01-19T01:15:00Z", localDate: "2026-01-18" },
      { instant: "2026-02-02T01:15:00Z", localDate: "2026-02-01" },
    ]);
  });

  it("supports multiple weekdays in one weekly rule", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: ["monday", "wednesday"],
      },
      scheduledTime: "07:45",
      timezone: DEFAULT_TIMEZONE,
      anchorDate: "2026-01-05",
      rangeStart: localInstant("2026-01-05", "00:00"),
      rangeEnd: localInstant("2026-01-11", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-01-05T12:45:00Z", localDate: "2026-01-05" },
      { instant: "2026-01-07T12:45:00Z", localDate: "2026-01-07" },
    ]);
  });

  it("falls back to the last local day for monthly day 31", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "monthly", interval: 1, dayOfMonth: 31 },
      scheduledTime: "22:00",
      timezone: DEFAULT_TIMEZONE,
      anchorDate: "2026-01-31",
      rangeStart: localInstant("2026-01-01", "00:00"),
      rangeEnd: localInstant("2026-05-01", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-02-01T03:00:00Z", localDate: "2026-01-31" },
      { instant: "2026-03-01T03:00:00Z", localDate: "2026-02-28" },
      { instant: "2026-04-01T02:00:00Z", localDate: "2026-03-31" },
      { instant: "2026-05-01T02:00:00Z", localDate: "2026-04-30" },
    ]);
  });

  it("uses America/New_York as the default timezone", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "00:30",
      rangeStart: localInstant("2026-06-01", "00:00"),
      rangeEnd: localInstant("2026-06-01", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-06-01T04:30:00Z", localDate: "2026-06-01" },
    ]);
  });

  it("respects a non-default behavior timezone", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "22:00",
      timezone: "America/Los_Angeles",
      rangeStart: localInstant("2026-06-01", "00:00", "America/Los_Angeles"),
      rangeEnd: localInstant(
        "2026-06-01",
        RANGE_END_TIME,
        "America/Los_Angeles",
      ),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-06-02T05:00:00Z", localDate: "2026-06-01" },
    ]);
  });

  it("includes occurrences exactly at local midnight and excludes prior days", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "00:00",
      timezone: DEFAULT_TIMEZONE,
      rangeStart: localInstant("2026-01-02", "00:00"),
      rangeEnd: localInstant("2026-01-02", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-01-02T05:00:00Z", localDate: "2026-01-02" },
    ]);
  });

  it("moves nonexistent spring-forward local times to the next valid time", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "02:30",
      timezone: DEFAULT_TIMEZONE,
      rangeStart: localInstant("2026-03-07", "00:00"),
      rangeEnd: localInstant("2026-03-09", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-03-07T07:30:00Z", localDate: "2026-03-07" },
      { instant: "2026-03-08T07:30:00Z", localDate: "2026-03-08" },
      { instant: "2026-03-09T06:30:00Z", localDate: "2026-03-09" },
    ]);
  });

  it("chooses the earlier instant for repeated fall-back local times", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "01:30",
      timezone: DEFAULT_TIMEZONE,
      rangeStart: localInstant("2026-10-31", "00:00"),
      rangeEnd: localInstant("2026-11-02", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-10-31T05:30:00Z", localDate: "2026-10-31" },
      { instant: "2026-11-01T05:30:00Z", localDate: "2026-11-01" },
      { instant: "2026-11-02T06:30:00Z", localDate: "2026-11-02" },
    ]);
  });

  it("keeps weekly schedules aligned across a DST boundary", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: ["friday"],
      },
      scheduledTime: "09:00",
      timezone: DEFAULT_TIMEZONE,
      anchorDate: "2026-03-06",
      rangeStart: localInstant("2026-03-01", "00:00"),
      rangeEnd: localInstant("2026-03-15", RANGE_END_TIME),
    });

    expect(summarizeSchedule(schedule)).toEqual([
      { instant: "2026-03-06T14:00:00Z", localDate: "2026-03-06" },
      { instant: "2026-03-13T13:00:00Z", localDate: "2026-03-13" },
    ]);
  });

  it("returns an empty schedule for an empty instant range", () => {
    const schedule = resolveOccurrenceSchedule({
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "22:00",
      timezone: DEFAULT_TIMEZONE,
      rangeStart: localInstant("2026-01-03", "00:00"),
      rangeEnd: localInstant("2026-01-01", "00:00"),
    });

    expect(schedule).toEqual([]);
  });
});
