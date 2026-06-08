import { Temporal } from "@js-temporal/polyfill";

import { resolveOccurrenceSchedule } from "@/lib/resolvers/recurrence.resolver";
import type { OccurrenceStatus } from "@/lib/types/database";
import { DEFAULT_TIMEZONE, type RecurrenceRule } from "@/lib/types/recurrence";

export const DEFAULT_OCCURRENCE_HORIZON_DAYS = 30;

export type OccurrenceGenerationBehavior = {
  id: string;
  userId: string;
  recurrenceRule: RecurrenceRule;
  scheduledTime: string;
  timezone?: string;
  active: boolean;
  createdAt: string;
  anchorDate?: string;
};

export type ExistingOccurrenceForGeneration = {
  id: string;
  scheduledFor: string;
  localDate: string;
  status: OccurrenceStatus;
};

export type PlannedOccurrenceInsert = {
  userId: string;
  behaviorId: string;
  scheduledFor: string;
  localDate: string;
  status: "unresolved";
};

export type OccurrenceGenerationWindow = {
  rangeStart: Temporal.Instant;
  rangeEnd: Temporal.Instant;
  startLocalDate: string;
  endLocalDate: string;
  timezone: string;
};

export type OccurrenceGenerationPlan = {
  create: PlannedOccurrenceInsert[];
  deleteUnresolvedIds: string[];
  generationWindow: OccurrenceGenerationWindow;
};

export type PlanOccurrenceGenerationInput = {
  behavior: OccurrenceGenerationBehavior;
  existingOccurrences: ExistingOccurrenceForGeneration[];
  now: Temporal.Instant;
  horizonDays?: number;
};

export function planOccurrenceGeneration(
  input: PlanOccurrenceGenerationInput,
): OccurrenceGenerationPlan {
  const timezone = input.behavior.timezone || DEFAULT_TIMEZONE;
  const horizonDays = validateHorizonDays(
    input.horizonDays ?? DEFAULT_OCCURRENCE_HORIZON_DAYS,
  );
  const generationWindow = resolveGenerationWindow({
    now: input.now,
    timezone,
    horizonDays,
  });
  const desiredOccurrences = input.behavior.active
    ? resolveOccurrenceSchedule({
        recurrenceRule: input.behavior.recurrenceRule,
        scheduledTime: input.behavior.scheduledTime,
        timezone,
        anchorDate: resolveAnchorDate(input.behavior, timezone),
        rangeStart: generationWindow.rangeStart,
        rangeEnd: generationWindow.rangeEnd,
      })
    : [];
  const existingScheduledKeys = new Set(
    input.existingOccurrences.map((occurrence) =>
      normalizeInstantString(occurrence.scheduledFor),
    ),
  );
  const desiredScheduledKeys = new Set(
    desiredOccurrences.map((occurrence) => occurrence.scheduledFor.toString()),
  );

  return {
    create: desiredOccurrences
      .filter(
        (occurrence) =>
          !existingScheduledKeys.has(occurrence.scheduledFor.toString()),
      )
      .map((occurrence) => ({
        userId: input.behavior.userId,
        behaviorId: input.behavior.id,
        scheduledFor: occurrence.scheduledFor.toString(),
        localDate: occurrence.localDate,
        status: "unresolved",
      })),
    deleteUnresolvedIds: input.existingOccurrences
      .filter(
        (occurrence) =>
          occurrence.status === "unresolved" &&
          isAtOrAfter(
            normalizeInstant(occurrence.scheduledFor),
            generationWindow.rangeStart,
          ) &&
          !desiredScheduledKeys.has(normalizeInstantString(occurrence.scheduledFor)),
      )
      .map((occurrence) => occurrence.id),
    generationWindow,
  };
}

export function resolveGenerationWindow(input: {
  now: Temporal.Instant;
  timezone?: string;
  horizonDays?: number;
}): OccurrenceGenerationWindow {
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const horizonDays = validateHorizonDays(
    input.horizonDays ?? DEFAULT_OCCURRENCE_HORIZON_DAYS,
  );
  const today = input.now.toZonedDateTimeISO(timezone).toPlainDate();
  const endDate = today.add({ days: horizonDays });
  const rangeStart = startOfLocalDay(today, timezone);
  const rangeEnd = startOfLocalDay(endDate.add({ days: 1 }), timezone).subtract({
    nanoseconds: 1,
  });

  return {
    rangeStart,
    rangeEnd,
    startLocalDate: today.toString(),
    endLocalDate: endDate.toString(),
    timezone,
  };
}

function resolveAnchorDate(
  behavior: OccurrenceGenerationBehavior,
  timezone: string,
): string {
  if (behavior.anchorDate) {
    return behavior.anchorDate;
  }

  return Temporal.Instant.from(behavior.createdAt)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

function startOfLocalDay(
  localDate: Temporal.PlainDate,
  timezone: string,
): Temporal.Instant {
  return localDate
    .toPlainDateTime(Temporal.PlainTime.from("00:00"))
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant();
}

function normalizeInstant(value: string): Temporal.Instant {
  return Temporal.Instant.from(value);
}

function normalizeInstantString(value: string): string {
  return normalizeInstant(value).toString();
}

function isAtOrAfter(
  candidate: Temporal.Instant,
  floor: Temporal.Instant,
): boolean {
  return Temporal.Instant.compare(candidate, floor) >= 0;
}

function validateHorizonDays(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError("horizonDays must be a non-negative integer.");
  }

  return value;
}
