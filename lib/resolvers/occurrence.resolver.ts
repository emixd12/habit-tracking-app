import { Temporal } from "@js-temporal/polyfill";

import { resolveOccurrenceSchedule } from "@/lib/resolvers/recurrence.resolver";
import type { OccurrenceStatus } from "@/lib/types/database";
import { DEFAULT_TIMEZONE, type RecurrenceRule } from "@/lib/types/recurrence";
import type {
  ScheduleKind,
  TimeRangePreset,
} from "@/lib/types/schedule";

export const DEFAULT_OCCURRENCE_HORIZON_DAYS = 30;

export type OccurrenceGenerationBehavior = {
  id: string;
  userId: string;
  recurrenceRule: RecurrenceRule;
  scheduleSlots: OccurrenceGenerationScheduleSlot[];
  timezone?: string;
  active: boolean;
  createdAt: string;
  anchorDate?: string;
};

export type OccurrenceGenerationScheduleSlot = {
  id: string | null;
  kind: ScheduleKind;
  preset: TimeRangePreset | null;
  startTime: string;
  endTime: string | null;
  sortOrder: number;
};

export type ExistingOccurrenceForGeneration = {
  id: string;
  scheduledFor: string;
  localDate: string;
  status: OccurrenceStatus;
  scheduleSlotId: string | null;
  scheduleKind: ScheduleKind;
  schedulePreset: TimeRangePreset | null;
  scheduleStartTime: string;
  scheduleEndTime: string | null;
};

export type PlannedOccurrenceInsert = {
  userId: string;
  behaviorId: string;
  scheduledFor: string;
  localDate: string;
  status: "unresolved";
  scheduleSlotId: string | null;
  scheduleKind: ScheduleKind;
  schedulePreset: TimeRangePreset | null;
  scheduleStartTime: string;
  scheduleEndTime: string | null;
};

export type PlannedOccurrenceScheduleUpdate = Omit<
  PlannedOccurrenceInsert,
  "userId" | "behaviorId" | "status"
> & {
  id: string;
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
  updateUnresolved: PlannedOccurrenceScheduleUpdate[];
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
    ? resolveDesiredOccurrences({
        behavior: input.behavior,
        timezone,
        generationWindow,
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
  const desiredByScheduledKey = new Map(
    desiredOccurrences.map((occurrence) => [
      occurrence.scheduledFor.toString(),
      occurrence,
    ]),
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
        scheduleSlotId: occurrence.scheduleSlotId,
        scheduleKind: occurrence.scheduleKind,
        schedulePreset: occurrence.schedulePreset,
        scheduleStartTime: occurrence.scheduleStartTime,
        scheduleEndTime: occurrence.scheduleEndTime,
      })),
    updateUnresolved: input.existingOccurrences
      .filter(
        (occurrence) =>
          occurrence.status === "unresolved" &&
          isAtOrAfter(
            normalizeInstant(occurrence.scheduledFor),
            generationWindow.rangeStart,
          ),
      )
      .flatMap((occurrence) => {
        const desired = desiredByScheduledKey.get(
          normalizeInstantString(occurrence.scheduledFor),
        );

        if (!desired || snapshotsMatch(occurrence, desired)) {
          return [];
        }

        return [
          {
            id: occurrence.id,
            scheduledFor: desired.scheduledFor.toString(),
            localDate: desired.localDate,
            scheduleSlotId: desired.scheduleSlotId,
            scheduleKind: desired.scheduleKind,
            schedulePreset: desired.schedulePreset,
            scheduleStartTime: desired.scheduleStartTime,
            scheduleEndTime: desired.scheduleEndTime,
          },
        ];
      }),
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

function resolveDesiredOccurrences(input: {
  behavior: OccurrenceGenerationBehavior;
  timezone: string;
  generationWindow: OccurrenceGenerationWindow;
}): Array<{
  scheduledFor: Temporal.Instant;
  localDate: string;
  scheduleSlotId: string | null;
  scheduleKind: ScheduleKind;
  schedulePreset: TimeRangePreset | null;
  scheduleStartTime: string;
  scheduleEndTime: string | null;
}> {
  return input.behavior.scheduleSlots
    .flatMap((slot) =>
      resolveOccurrenceSchedule({
        recurrenceRule: input.behavior.recurrenceRule,
        scheduledTime: slot.startTime,
        timezone: input.timezone,
        anchorDate: resolveAnchorDate(input.behavior, input.timezone),
        rangeStart: input.generationWindow.rangeStart,
        rangeEnd: input.generationWindow.rangeEnd,
      }).map((occurrence) => ({
        ...occurrence,
        scheduleSlotId: slot.id,
        scheduleKind: slot.kind,
        schedulePreset: slot.preset,
        scheduleStartTime: slot.startTime,
        scheduleEndTime: slot.endTime,
      })),
    )
    .sort((left, right) =>
      Temporal.Instant.compare(left.scheduledFor, right.scheduledFor),
    );
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

function snapshotsMatch(
  existing: ExistingOccurrenceForGeneration,
  desired: {
    scheduleSlotId: string | null;
    scheduleKind: ScheduleKind;
    schedulePreset: TimeRangePreset | null;
    scheduleStartTime: string;
    scheduleEndTime: string | null;
    localDate: string;
  },
): boolean {
  return (
    existing.localDate === desired.localDate &&
    existing.scheduleSlotId === desired.scheduleSlotId &&
    existing.scheduleKind === desired.scheduleKind &&
    existing.schedulePreset === desired.schedulePreset &&
    existing.scheduleStartTime === desired.scheduleStartTime &&
    existing.scheduleEndTime === desired.scheduleEndTime
  );
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
