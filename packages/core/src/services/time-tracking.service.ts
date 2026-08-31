import type { Temporal } from "@js-temporal/polyfill";
import type { OccurrenceRecord } from "../data-store";
import type { OccurrenceStatus } from "../types/database";
import type { OccurrenceTimeTracking, TimeSession } from "../types/time-tracking";
import {
  canStartOccurrenceTimeTracking,
  resolveOccurrenceTimeTracking,
  resolveResetTimeTracking,
  resolveStartTimeTracking,
  resolveStopTimeTracking,
} from "../resolvers/time-tracking.resolver";

export type TimeTrackingDataStore = {
  readOccurrence(id: string): Promise<OccurrenceRecord | null>;
  readBehavior(id: string): Promise<{ id: string; active: boolean; timezone: string } | null>;
  listSessions(occurrenceId: string): Promise<TimeSession[]>;
  createRunningSession(input: {
    occurrenceId: string; behaviorId: string; startedAt: string;
  }): Promise<TimeSession | null>;
  stopRunningSession(input: {
    occurrenceId: string; sessionId: string; stoppedAt: string;
  }): Promise<TimeSession | null>;
  resetSessions(occurrenceId: string, expectedSessions: TimeSession[]): Promise<string[]>;
};

const MISSING_OCCURRENCE_MESSAGE = "This occurrence is no longer available.";
const INELIGIBLE_START_MESSAGE =
  "Time tracking is available for active behaviors on today's Timeline or in Needs decision.";

export type TimeTrackingActionResult = Readonly<{
  tracking: OccurrenceTimeTracking;
  changed: boolean;
}>;

export async function startOccurrenceTimeTracking(
  store: TimeTrackingDataStore,
  occurrenceId: string,
  now: Temporal.Instant,
): Promise<TimeTrackingActionResult> {
  const { occurrence, behavior } = await requireStartEligibility({
    store,
    occurrenceId,
    now,
  });
  const sessions = await store.listSessions(occurrenceId);
  const plan = resolveStartTimeTracking({ sessions, now });

  if (plan.kind === "already_running") {
    return { tracking: resolveOccurrenceTimeTracking(sessions), changed: false };
  }

  const created = await store.createRunningSession({
    occurrenceId: occurrence.id,
    behaviorId: behavior.id,
    startedAt: plan.startedAt,
  });
  const persistedSessions = created
    ? [...sessions, created]
    : await store.listSessions(occurrenceId);

  return {
    tracking: resolveOccurrenceTimeTracking(persistedSessions),
    changed: created !== null,
  };
}

export async function stopOccurrenceTimeTracking(
  store: TimeTrackingDataStore,
  occurrenceId: string,
  now: Temporal.Instant,
): Promise<TimeTrackingActionResult> {
  await requireOwnedOccurrence(store, occurrenceId);
  const sessions = await store.listSessions(occurrenceId);
  const plan = resolveStopTimeTracking({ sessions, now });

  if (plan.kind === "already_stopped") {
    return { tracking: resolveOccurrenceTimeTracking(sessions), changed: false };
  }

  const stopped = await store.stopRunningSession({
    occurrenceId,
    sessionId: plan.sessionId,
    stoppedAt: plan.stoppedAt,
  });
  const persistedSessions = stopped
    ? sessions.map((session) =>
        session.id === stopped.id ? stopped : session,
      )
    : await store.listSessions(occurrenceId);

  return {
    tracking: resolveOccurrenceTimeTracking(persistedSessions),
    changed: stopped !== null,
  };
}

export async function resetOccurrenceTimeTracking(
  store: TimeTrackingDataStore,
  occurrenceId: string,
): Promise<TimeTrackingActionResult> {
  await requireOwnedOccurrence(store, occurrenceId);
  const sessions = await store.listSessions(occurrenceId);
  const plan = resolveResetTimeTracking(sessions);

  if (!plan.hasSessions) {
    return { tracking: resolveOccurrenceTimeTracking([]), changed: false };
  }

  const deletedIds = await store.resetSessions(occurrenceId, sessions);

  return {
    tracking: resolveOccurrenceTimeTracking([]),
    changed: deletedIds.length > 0,
  };
}

async function requireStartEligibility(input: Readonly<{
  store: TimeTrackingDataStore;
  occurrenceId: string;
  now: Temporal.Instant;
}>) {
  const occurrence = await requireOwnedOccurrence(
    input.store,
    input.occurrenceId,
  );
  const behavior = await input.store.readBehavior(occurrence.behavior_id);

  if (!behavior) {
    throw new Error(MISSING_OCCURRENCE_MESSAGE);
  }

  if (!canStartOccurrenceTimeTracking({
    behaviorActive: behavior.active,
    occurrenceLocalDate: occurrence.local_date,
    occurrenceStatus: normalizeOccurrenceStatus(occurrence.status),
    statusMarkedAt: occurrence.status_marked_at,
    now: input.now,
    timezone: behavior.timezone,
  })) {
    throw new Error(INELIGIBLE_START_MESSAGE);
  }

  return { occurrence, behavior };
}

function normalizeOccurrenceStatus(value: string): OccurrenceStatus {
  if (
    value === "unresolved" ||
    value === "completed" ||
    value === "not_completed"
  ) {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}`);
}

async function requireOwnedOccurrence(
  store: TimeTrackingDataStore,
  occurrenceId: string,
) {
  const occurrence = await store.readOccurrence(occurrenceId);

  if (!occurrence) {
    throw new Error(MISSING_OCCURRENCE_MESSAGE);
  }

  return occurrence;
}
