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
  schedules?: OccurrenceGenerationSchedule[];
  scheduleSlots: OccurrenceGenerationScheduleSlot[];
  timezone?: string;
  active: boolean;
  createdAt: string;
  anchorDate?: string;
};

export type OccurrenceGenerationSchedule = {
  id: string | null;
  recurrenceRule: RecurrenceRule;
  timeEntries: OccurrenceGenerationScheduleSlot[];
  sortOrder: number;
  anchorDate?: string;
};

export type OccurrenceGenerationScheduleSlot = {
  id: string | null;
  scheduleId?: string | null;
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

export type PlanOccurrenceRepairInput = PlanOccurrenceGenerationInput & {
  repairStartLocalDate: string;
};

export type OccurrenceScheduleNormalizationResult =
  | {
      status: "valid";
      source: "persisted" | "legacy_compatibility";
      schedules: OccurrenceGenerationSchedule[];
    }
  | {
      status: "repairable";
      reason: "single_empty_schedule";
      repairedSchedule: OccurrenceGenerationSchedule;
    }
  | {
      status: "invalid";
      reason:
        | "missing_schedule"
        | "ambiguous_empty_schedule"
        | "malformed_schedule_graph";
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

  return planOccurrenceGenerationForWindow(input, generationWindow);
}

export function planOccurrenceRepair(
  input: PlanOccurrenceRepairInput,
): OccurrenceGenerationPlan {
  const timezone = input.behavior.timezone || DEFAULT_TIMEZONE;
  const horizonDays = validateHorizonDays(
    input.horizonDays ?? DEFAULT_OCCURRENCE_HORIZON_DAYS,
  );
  const generationWindow = resolveRepairGenerationWindow({
    now: input.now,
    timezone,
    horizonDays,
    repairStartLocalDate: input.repairStartLocalDate,
  });

  return planOccurrenceGenerationForWindow(input, generationWindow);
}

export function normalizeOccurrenceScheduleGraph(input: {
  schedules: OccurrenceGenerationSchedule[];
  compatibilitySchedule: OccurrenceGenerationSchedule;
}): OccurrenceScheduleNormalizationResult {
  if (input.schedules.length === 0) {
    return isWellFormedSchedule(input.compatibilitySchedule)
      ? {
          status: "valid",
          source: "legacy_compatibility",
          schedules: [input.compatibilitySchedule],
        }
      : {
          status: "invalid",
          reason: "missing_schedule",
        };
  }

  if (hasDuplicateScheduleIds(input.schedules)) {
    return { status: "invalid", reason: "malformed_schedule_graph" };
  }

  const emptySchedules = input.schedules.filter(
    (schedule) => schedule.timeEntries.length === 0,
  );

  if (emptySchedules.length > 0) {
    if (
      input.schedules.length === 1 &&
      emptySchedules.length === 1 &&
      input.compatibilitySchedule.timeEntries.length === 1 &&
      isWellFormedSchedule(input.compatibilitySchedule)
    ) {
      const emptySchedule = emptySchedules[0];

      return {
        status: "repairable",
        reason: "single_empty_schedule",
        repairedSchedule: {
          ...emptySchedule,
          timeEntries: input.compatibilitySchedule.timeEntries.map((entry) => ({
            ...entry,
            scheduleId: emptySchedule.id,
          })),
        },
      };
    }

    return {
      status: "invalid",
      reason: "ambiguous_empty_schedule",
    };
  }

  if (!input.schedules.every(isWellFormedSchedule)) {
    return { status: "invalid", reason: "malformed_schedule_graph" };
  }

  return {
    status: "valid",
    source: "persisted",
    schedules: input.schedules,
  };
}

function planOccurrenceGenerationForWindow(
  input: PlanOccurrenceGenerationInput,
  generationWindow: OccurrenceGenerationWindow,
): OccurrenceGenerationPlan {
  const timezone = input.behavior.timezone || DEFAULT_TIMEZONE;
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
          isWithinGenerationWindow(
            normalizeInstant(occurrence.scheduledFor),
            generationWindow,
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
          isWithinGenerationWindow(
            normalizeInstant(occurrence.scheduledFor),
            generationWindow,
          ) &&
          !desiredScheduledKeys.has(normalizeInstantString(occurrence.scheduledFor)),
      )
      .map((occurrence) => occurrence.id),
    generationWindow,
  };
}

function resolveRepairGenerationWindow(input: {
  now: Temporal.Instant;
  timezone: string;
  horizonDays: number;
  repairStartLocalDate: string;
}): OccurrenceGenerationWindow {
  const startDate = Temporal.PlainDate.from(input.repairStartLocalDate);
  const today = input.now.toZonedDateTimeISO(input.timezone).toPlainDate();
  const endDate = today.add({ days: input.horizonDays });

  if (Temporal.PlainDate.compare(startDate, endDate) > 0) {
    throw new RangeError(
      "repairStartLocalDate must be on or before the repair horizon.",
    );
  }

  return {
    rangeStart: startOfLocalDay(startDate, input.timezone),
    rangeEnd: startOfLocalDay(endDate.add({ days: 1 }), input.timezone).subtract({
      nanoseconds: 1,
    }),
    startLocalDate: startDate.toString(),
    endLocalDate: endDate.toString(),
    timezone: input.timezone,
  };
}

function hasDuplicateScheduleIds(
  schedules: OccurrenceGenerationSchedule[],
): boolean {
  const ids = schedules
    .map((schedule) => schedule.id)
    .filter((id): id is string => id !== null);

  return new Set(ids).size !== ids.length;
}

function isWellFormedSchedule(
  schedule: OccurrenceGenerationSchedule,
): boolean {
  if (schedule.timeEntries.length === 0) {
    return false;
  }

  const startTimes = schedule.timeEntries.map((entry) => entry.startTime);

  if (new Set(startTimes).size !== startTimes.length) {
    return false;
  }

  return schedule.timeEntries.every((entry) => {
    if (entry.scheduleId && schedule.id && entry.scheduleId !== schedule.id) {
      return false;
    }

    if (entry.kind === "exact") {
      return entry.preset === null && entry.endTime === null;
    }

    return entry.endTime !== null && entry.endTime !== entry.startTime;
  });
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
  return dedupeDesiredOccurrences(
    resolveGenerationSchedules(input.behavior).flatMap((schedule) =>
      schedule.timeEntries.flatMap((slot) =>
        resolveOccurrenceSchedule({
          recurrenceRule: schedule.recurrenceRule,
          scheduledTime: slot.startTime,
          timezone: input.timezone,
          anchorDate:
            schedule.anchorDate ?? resolveAnchorDate(input.behavior, input.timezone),
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
      ),
    ),
  ).sort((left, right) =>
    Temporal.Instant.compare(left.scheduledFor, right.scheduledFor),
  );
}

function resolveGenerationSchedules(
  behavior: OccurrenceGenerationBehavior,
): OccurrenceGenerationSchedule[] {
  if (behavior.schedules && behavior.schedules.length > 0) {
    return [...behavior.schedules].sort((left, right) => {
      const sortComparison = left.sortOrder - right.sortOrder;

      if (sortComparison !== 0) {
        return sortComparison;
      }

      return (left.id ?? "").localeCompare(right.id ?? "");
    });
  }

  return [
    {
      id: null,
      recurrenceRule: behavior.recurrenceRule,
      timeEntries: behavior.scheduleSlots,
      sortOrder: 0,
      anchorDate: behavior.anchorDate,
    },
  ];
}

function dedupeDesiredOccurrences<T extends {
  localDate: string;
  scheduleKind: ScheduleKind;
  scheduleStartTime: string;
  scheduleEndTime: string | null;
}>(occurrences: T[]): T[] {
  const occurrencesByKey = new Map<string, T>();

  for (const occurrence of occurrences) {
    const key = [
      occurrence.localDate,
      occurrence.scheduleKind,
      occurrence.scheduleStartTime,
      occurrence.scheduleEndTime ?? "",
    ].join("|");

    if (!occurrencesByKey.has(key)) {
      occurrencesByKey.set(key, occurrence);
    }
  }

  return Array.from(occurrencesByKey.values());
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

function isAtOrBefore(
  candidate: Temporal.Instant,
  ceiling: Temporal.Instant,
): boolean {
  return Temporal.Instant.compare(candidate, ceiling) <= 0;
}

function isWithinGenerationWindow(
  candidate: Temporal.Instant,
  generationWindow: OccurrenceGenerationWindow,
): boolean {
  return (
    isAtOrAfter(candidate, generationWindow.rangeStart) &&
    isAtOrBefore(candidate, generationWindow.rangeEnd)
  );
}

function validateHorizonDays(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError("horizonDays must be a non-negative integer.");
  }

  return value;
}
