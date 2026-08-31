import type { Temporal } from "@js-temporal/polyfill";
import type { BehaviorGraphRecord } from "../behavior-store";
import type { OccurrenceRecord } from "../data-store";
import type { TimelineOccurrenceInput } from "../types/timeline";
import type { TimeSession } from "../types/time-tracking";
import { resolveTimeline, resolveTimelineOccurrence } from "../resolvers/timeline.resolver";
import { resolveOccurrenceTimeTracking } from "../resolvers/time-tracking.resolver";
import { normalizeRecurrenceRule, normalizeScheduledTime, summarizeRecurrenceRule } from "./behavior-values";
import { formatCompactOccurrenceScheduleLabel } from "./schedule";
import { normalizeScheduleKind, normalizeSchedulePreset } from "./occurrence-generation";
import { normalizeOccurrenceStatus } from "./occurrence.service";

export function resolvePersistedTimeline(input: {
  behaviors: BehaviorGraphRecord[];
  occurrences: OccurrenceRecord[];
  timeSessions: TimeSession[];
  now: Temporal.Instant;
  timezone: string;
  futureDays?: number;
}) {
  const activeBehaviorById = new Map(input.behaviors.filter((row) => row.active).map((row) => [row.id, row]));
  const sessionsByOccurrence = new Map<string, TimeSession[]>();
  for (const session of input.timeSessions) {
    const sessions = sessionsByOccurrence.get(session.occurrenceId) ?? [];
    sessions.push(session);
    sessionsByOccurrence.set(session.occurrenceId, sessions);
  }
  const occurrences = input.occurrences.map((row) => toTimelineOccurrenceInput(
    row, activeBehaviorById, sessionsByOccurrence.get(row.id) ?? [],
  )).filter((row): row is TimelineOccurrenceInput => row !== null);
  return resolveTimeline({ occurrences, now: input.now, timezone: input.timezone, futureDays: input.futureDays });
}

export function resolvePersistedTimelineOccurrence(input: {
  behavior: BehaviorGraphRecord;
  occurrence: OccurrenceRecord;
  timeSessions: TimeSession[];
  now: Temporal.Instant;
  timezone: string;
}) {
  const occurrence = toTimelineOccurrenceInput(
    input.occurrence,
    new Map([[input.behavior.id, input.behavior]]),
    input.timeSessions,
  );
  return occurrence ? resolveTimelineOccurrence({ occurrence, now: input.now, timezone: input.timezone }) : null;
}

function toTimelineOccurrenceInput(
  occurrence: OccurrenceRecord,
  activeBehaviorById: Map<string, BehaviorGraphRecord>,
  timeSessions: TimeSession[],
): TimelineOccurrenceInput | null {
  const behavior = activeBehaviorById.get(occurrence.behavior_id);

  if (!behavior) {
    return null;
  }

  const recurrenceRule = normalizeRecurrenceRule(behavior.recurrence_rule);
  const tracking = resolveOccurrenceTimeTracking(timeSessions);

  return {
    id: occurrence.id,
    behaviorId: occurrence.behavior_id,
    title: behavior.title,
    description: behavior.description ?? "",
    categoryName: behavior.category?.name ?? "No category",
    scheduleSummary: summarizeRecurrenceRule(recurrenceRule),
    scheduledFor: occurrence.scheduled_for,
    scheduledTimeLabel: formatCompactOccurrenceScheduleLabel({
      scheduleKind: normalizeScheduleKind(occurrence.schedule_kind),
      schedulePreset: normalizeSchedulePreset(occurrence.schedule_preset),
      scheduleStartTime: normalizeScheduledTime(occurrence.schedule_start_time),
      scheduleEndTime: occurrence.schedule_end_time
        ? normalizeScheduledTime(occurrence.schedule_end_time)
        : null,
    }),
    localDate: occurrence.local_date,
    status: normalizeOccurrenceStatus(occurrence.status),
    statusMarkedAt: occurrence.status_marked_at,
    note: occurrence.note ?? "",
    timeTracking: {
      recordedSeconds: tracking.recordedSeconds,
      runningStartedAt: tracking.runningSession?.startedAt ?? null,
    },
    canStartTimeTracking: behavior.active,
  };
}
