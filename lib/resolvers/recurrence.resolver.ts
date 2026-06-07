import { Temporal } from "@js-temporal/polyfill";

import {
  DEFAULT_TIMEZONE,
  type RecurrenceRule,
  type Weekday,
} from "@/lib/types/recurrence";

export type ResolveOccurrenceScheduleInput = {
  recurrenceRule: RecurrenceRule;
  scheduledTime: string;
  timezone?: string;
  rangeStart: Date;
  rangeEnd: Date;
  anchorDate?: string;
};

export type ScheduledOccurrence = {
  scheduledFor: Temporal.Instant;
  localDate: string;
};

const WEEKDAY_NUMBER_BY_NAME: Record<Weekday, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const SCHEDULED_TIME_PATTERN =
  /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;
const PLAIN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveOccurrenceSchedule(
  input: ResolveOccurrenceScheduleInput,
): ScheduledOccurrence[] {
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const recurrenceRule = validateRecurrenceRule(input.recurrenceRule);
  const scheduledTime = parseScheduledTime(input.scheduledTime);
  const rangeStart = dateToInstant(input.rangeStart, "rangeStart");
  const rangeEnd = dateToInstant(input.rangeEnd, "rangeEnd");

  if (Temporal.Instant.compare(rangeStart, rangeEnd) > 0) {
    return [];
  }

  const rangeStartLocalDate = rangeStart
    .toZonedDateTimeISO(timezone)
    .toPlainDate();
  const rangeEndLocalDate = rangeEnd.toZonedDateTimeISO(timezone).toPlainDate();
  const anchorDate = input.anchorDate
    ? parsePlainDate(input.anchorDate, "anchorDate")
    : rangeStartLocalDate;

  const occurrences: ScheduledOccurrence[] = [];

  for (
    let localDate = rangeStartLocalDate;
    Temporal.PlainDate.compare(localDate, rangeEndLocalDate) <= 0;
    localDate = localDate.add({ days: 1 })
  ) {
    if (!matchesRecurrenceRule(localDate, recurrenceRule, anchorDate)) {
      continue;
    }

    const scheduledAt = localDate
      .toPlainDateTime(scheduledTime)
      .toZonedDateTime(timezone, { disambiguation: "compatible" });
    const scheduledFor = scheduledAt.toInstant();

    if (
      Temporal.Instant.compare(scheduledFor, rangeStart) < 0 ||
      Temporal.Instant.compare(scheduledFor, rangeEnd) > 0
    ) {
      continue;
    }

    occurrences.push({
      scheduledFor,
      localDate: scheduledAt.toPlainDate().toString(),
    });
  }

  return occurrences;
}

function matchesRecurrenceRule(
  localDate: Temporal.PlainDate,
  recurrenceRule: RecurrenceRule,
  anchorDate: Temporal.PlainDate,
): boolean {
  switch (recurrenceRule.frequency) {
    case "daily":
      return matchesDayInterval(localDate, anchorDate, recurrenceRule.interval);

    case "interval_days":
      return matchesDayInterval(
        localDate,
        anchorDate,
        recurrenceRule.intervalDays,
      );

    case "weekly":
      return (
        recurrenceRule.daysOfWeek.some(
          (weekday) => WEEKDAY_NUMBER_BY_NAME[weekday] === localDate.dayOfWeek,
        ) &&
        matchesWeekInterval(localDate, anchorDate, recurrenceRule.interval)
      );

    case "monthly":
      return matchesMonthInterval(localDate, anchorDate, recurrenceRule);
  }
}

function matchesDayInterval(
  localDate: Temporal.PlainDate,
  anchorDate: Temporal.PlainDate,
  interval: number,
): boolean {
  const daysFromAnchor = daysBetween(anchorDate, localDate);

  return daysFromAnchor >= 0 && daysFromAnchor % interval === 0;
}

function matchesWeekInterval(
  localDate: Temporal.PlainDate,
  anchorDate: Temporal.PlainDate,
  interval: number,
): boolean {
  const weeksFromAnchor =
    daysBetween(startOfIsoWeek(anchorDate), startOfIsoWeek(localDate)) / 7;

  return weeksFromAnchor >= 0 && weeksFromAnchor % interval === 0;
}

function matchesMonthInterval(
  localDate: Temporal.PlainDate,
  anchorDate: Temporal.PlainDate,
  recurrenceRule: Extract<RecurrenceRule, { frequency: "monthly" }>,
): boolean {
  const monthsFromAnchor = monthsBetween(anchorDate, localDate);
  const scheduledDay = Math.min(
    recurrenceRule.dayOfMonth,
    localDate.daysInMonth,
  );

  return (
    monthsFromAnchor >= 0 &&
    monthsFromAnchor % recurrenceRule.interval === 0 &&
    localDate.day === scheduledDay
  );
}

function validateRecurrenceRule(recurrenceRule: RecurrenceRule): RecurrenceRule {
  switch (recurrenceRule.frequency) {
    case "daily":
      validatePositiveInteger(recurrenceRule.interval, "recurrenceRule.interval");
      return recurrenceRule;

    case "interval_days":
      validatePositiveInteger(
        recurrenceRule.intervalDays,
        "recurrenceRule.intervalDays",
      );
      return recurrenceRule;

    case "weekly":
      validatePositiveInteger(recurrenceRule.interval, "recurrenceRule.interval");
      if (recurrenceRule.daysOfWeek.length === 0) {
        throw new RangeError("recurrenceRule.daysOfWeek must not be empty.");
      }

      for (const weekday of recurrenceRule.daysOfWeek) {
        if (!(weekday in WEEKDAY_NUMBER_BY_NAME)) {
          throw new RangeError(
            `recurrenceRule.daysOfWeek contains an unsupported weekday: ${weekday}.`,
          );
        }
      }

      return recurrenceRule;

    case "monthly":
      validatePositiveInteger(recurrenceRule.interval, "recurrenceRule.interval");
      validateIntegerInRange(
        recurrenceRule.dayOfMonth,
        "recurrenceRule.dayOfMonth",
        1,
        31,
      );
      return recurrenceRule;
  }
}

function parseScheduledTime(value: string): Temporal.PlainTime {
  const match = SCHEDULED_TIME_PATTERN.exec(value);

  if (!match) {
    throw new RangeError(
      "scheduledTime must use HH:MM, HH:MM:SS, or HH:MM:SS.fffffffff.",
    );
  }

  const [, hourValue, minuteValue, secondValue = "0", fractionValue = ""] =
    match;
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const fraction = fractionValue.padEnd(9, "0");
  const millisecond = Number(fraction.slice(0, 3));
  const microsecond = Number(fraction.slice(3, 6));
  const nanosecond = Number(fraction.slice(6, 9));

  validateIntegerInRange(hour, "scheduledTime hour", 0, 23);
  validateIntegerInRange(minute, "scheduledTime minute", 0, 59);
  validateIntegerInRange(second, "scheduledTime second", 0, 59);

  return Temporal.PlainTime.from({
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond,
  });
}

function parsePlainDate(
  value: string,
  fieldName: string,
): Temporal.PlainDate {
  if (!PLAIN_DATE_PATTERN.test(value)) {
    throw new RangeError(`${fieldName} must use YYYY-MM-DD.`);
  }

  return Temporal.PlainDate.from(value);
}

function dateToInstant(value: Date, fieldName: string): Temporal.Instant {
  const epochMilliseconds = value.getTime();

  if (!Number.isFinite(epochMilliseconds)) {
    throw new RangeError(`${fieldName} must be a valid Date.`);
  }

  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds);
}

function daysBetween(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): number {
  return start.until(end, { largestUnit: "days" }).days;
}

function monthsBetween(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): number {
  return (end.year - start.year) * 12 + end.month - start.month;
}

function startOfIsoWeek(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.subtract({ days: date.dayOfWeek - 1 });
}

function validatePositiveInteger(value: number, fieldName: string): void {
  validateIntegerInRange(value, fieldName, 1, Number.MAX_SAFE_INTEGER);
}

function validateIntegerInRange(
  value: number,
  fieldName: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
}
