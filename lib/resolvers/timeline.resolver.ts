import { Temporal } from "@js-temporal/polyfill";

import type {
  TimelineDaySection,
  TimelineOccurrenceInput,
  TimelineOccurrenceView,
  TimelineStatus,
  TimelineView,
  TimelineVisualTone,
} from "@/lib/types/timeline";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

export const TIMELINE_DEFAULT_FUTURE_DAYS = 7;
export const TIMELINE_MAX_FUTURE_DAYS = 30;
export const TIMELINE_FUTURE_DAYS_STEP = 7;
export const EMPTY_DAY_MESSAGE = "No behaviors on this day";

export type ResolveTimelineInput = {
  occurrences: TimelineOccurrenceInput[];
  now: Temporal.Instant;
  timezone?: string;
  futureDays?: number;
};

export function resolveTimeline(input: ResolveTimelineInput): TimelineView {
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const today = input.now.toZonedDateTimeISO(timezone).toPlainDate();
  const todayLocalDate = today.toString();
  const visibleFutureDays = normalizeFutureDays(input.futureDays);
  const occurrences = input.occurrences.map((occurrence) =>
    toOccurrenceView(occurrence, todayLocalDate),
  );

  return {
    timezone,
    todayLocalDate,
    visibleFutureDays,
    maxFutureDays: TIMELINE_MAX_FUTURE_DAYS,
    nextFutureDays:
      visibleFutureDays < TIMELINE_MAX_FUTURE_DAYS
        ? Math.min(
            visibleFutureDays + TIMELINE_FUTURE_DAYS_STEP,
            TIMELINE_MAX_FUTURE_DAYS,
          )
        : null,
    needsDecision: resolveNeedsDecision(occurrences, todayLocalDate),
    daySections: resolveForwardDaySections({
      occurrences,
      today,
      visibleFutureDays,
    }),
  };
}

function resolveNeedsDecision(
  occurrences: TimelineOccurrenceView[],
  todayLocalDate: string,
): TimelineView["needsDecision"] {
  const priorUnresolved = occurrences
    .filter(
      (occurrence) =>
        occurrence.status === "unresolved" &&
        compareLocalDate(occurrence.localDate, todayLocalDate) < 0,
    )
    .sort(compareOccurrencesForNeedsDecision);
  const daySections = groupNeedsDecisionDays(priorUnresolved);

  return {
    title: "Needs decision",
    emptyMessage: "No prior unresolved occurrences.",
    occurrenceCount: priorUnresolved.length,
    daySections,
  };
}

function resolveForwardDaySections(input: {
  occurrences: TimelineOccurrenceView[];
  today: Temporal.PlainDate;
  visibleFutureDays: number;
}): TimelineDaySection[] {
  const sections: TimelineDaySection[] = [];

  for (let offset = 0; offset <= input.visibleFutureDays; offset += 1) {
    const date = input.today.add({ days: offset });
    const localDate = date.toString();
    const dayOccurrences = input.occurrences
      .filter((occurrence) => occurrence.localDate === localDate)
      .sort(compareOccurrencesByScheduledTime);

    sections.push({
      key: `day-${localDate}`,
      kind: offset === 0 ? "today" : "future",
      localDate,
      label: formatDateLabel(date),
      relativeLabel: relativeDayLabel(offset),
      emptyMessage: EMPTY_DAY_MESSAGE,
      occurrences: dayOccurrences,
    });
  }

  return sections;
}

function groupNeedsDecisionDays(
  occurrences: TimelineOccurrenceView[],
): TimelineDaySection[] {
  const grouped = new Map<string, TimelineOccurrenceView[]>();

  for (const occurrence of occurrences) {
    const dayOccurrences = grouped.get(occurrence.localDate) ?? [];
    dayOccurrences.push(occurrence);
    grouped.set(occurrence.localDate, dayOccurrences);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => compareLocalDate(right, left))
    .map(([localDate, dayOccurrences]) => {
      const date = Temporal.PlainDate.from(localDate);

      return {
        key: `needs-${localDate}`,
        kind: "needs_decision_day",
        localDate,
        label: formatDateLabel(date),
        relativeLabel: "Prior unresolved",
        emptyMessage: EMPTY_DAY_MESSAGE,
        occurrences: [...dayOccurrences].sort(compareOccurrencesByScheduledTime),
      };
    });
}

function toOccurrenceView(
  occurrence: TimelineOccurrenceInput,
  todayLocalDate: string,
): TimelineOccurrenceView {
  const isPriorUnresolved =
    occurrence.status === "unresolved" &&
    compareLocalDate(occurrence.localDate, todayLocalDate) < 0;
  const isTodayUnresolved =
    occurrence.status === "unresolved" &&
    occurrence.localDate === todayLocalDate;

  return {
    ...occurrence,
    statusLabel: statusLabel(occurrence.status),
    statusDetail: statusDetail(occurrence.status),
    visualTone: visualTone(occurrence.status, isPriorUnresolved),
    showDecisionActions: isPriorUnresolved || isTodayUnresolved,
  };
}

function statusLabel(status: TimelineStatus): string {
  switch (status) {
    case "done":
      return "Completed";
    case "not_done":
      return "Not Completed";
    case "unresolved":
      return "Unresolved";
  }
}

function statusDetail(status: TimelineStatus): string {
  switch (status) {
    case "done":
      return "Resolved as Completed";
    case "not_done":
      return "Resolved as Not Completed";
    case "unresolved":
      return "Awaiting decision";
  }
}

function visualTone(
  status: TimelineStatus,
  isPriorUnresolved: boolean,
): TimelineVisualTone {
  if (isPriorUnresolved) {
    return "needs_decision";
  }

  switch (status) {
    case "done":
      return "done";
    case "not_done":
      return "not_done";
    case "unresolved":
      return "default";
  }
}

function compareOccurrencesForNeedsDecision(
  left: TimelineOccurrenceView,
  right: TimelineOccurrenceView,
): number {
  const dayComparison = compareLocalDate(right.localDate, left.localDate);

  if (dayComparison !== 0) {
    return dayComparison;
  }

  return compareOccurrencesByScheduledTime(left, right);
}

function compareOccurrencesByScheduledTime(
  left: TimelineOccurrenceView,
  right: TimelineOccurrenceView,
): number {
  const instantComparison = Temporal.Instant.compare(
    Temporal.Instant.from(left.scheduledFor),
    Temporal.Instant.from(right.scheduledFor),
  );

  if (instantComparison !== 0) {
    return instantComparison;
  }

  return left.title.localeCompare(right.title);
}

function compareLocalDate(left: string, right: string): number {
  return Temporal.PlainDate.compare(
    Temporal.PlainDate.from(left),
    Temporal.PlainDate.from(right),
  );
}

function normalizeFutureDays(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return TIMELINE_DEFAULT_FUTURE_DAYS;
  }

  return Math.min(
    TIMELINE_MAX_FUTURE_DAYS,
    Math.max(0, Math.trunc(value)),
  );
}

function relativeDayLabel(offset: number): string {
  if (offset === 0) {
    return "Current day";
  }

  if (offset === 1) {
    return "Tomorrow";
  }

  return `In ${offset} days`;
}

const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatDateLabel(date: Temporal.PlainDate): string {
  return `${WEEKDAY_LABELS[date.dayOfWeek - 1]}, ${
    MONTH_LABELS[date.month - 1]
  } ${date.day}`;
}
