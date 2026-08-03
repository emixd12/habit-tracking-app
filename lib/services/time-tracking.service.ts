import { Temporal } from "@js-temporal/polyfill";

import { requireCurrentUserId } from "@/lib/auth/current-user";
import { getBehaviorById } from "@/lib/db/behaviors.repo";
import { getOccurrenceById } from "@/lib/db/occurrences.repo";
import {
  createRunningTimeSession,
  deleteTimeSessionsForOccurrence,
  listTimeSessionsForOccurrence,
  stopRunningTimeSession,
} from "@/lib/db/timeSessions.repo";
import {
  resolveOccurrenceTimeTracking,
  resolveResetTimeTracking,
  resolveStartTimeTracking,
  resolveStopTimeTracking,
} from "@/lib/resolvers/time-tracking.resolver";
import { createClient } from "@/lib/supabase/server";
import type { OccurrenceTimeSession } from "@/lib/types/database";
import type {
  OccurrenceTimeTracking,
  TimeSession,
} from "@/lib/types/time-tracking";

const SIGN_IN_MESSAGE = "Sign in again before tracking time.";
const MISSING_OCCURRENCE_MESSAGE = "This occurrence is no longer available.";
const INELIGIBLE_START_MESSAGE =
  "Time tracking is available for active behaviors scheduled today.";

export type TimeTrackingActionResult = Readonly<{
  tracking: OccurrenceTimeTracking;
  changed: boolean;
}>;

export async function startOccurrenceTimeTracking(
  occurrenceId: string,
  options: Readonly<{ now?: Temporal.Instant }> = {},
): Promise<TimeTrackingActionResult> {
  const supabase = await createClient();
  const userId = await requireCurrentUserId(SIGN_IN_MESSAGE);
  const now = options.now ?? Temporal.Now.instant();
  const { occurrence, behavior } = await requireStartEligibility({
    supabase,
    userId,
    occurrenceId,
    now,
  });
  const sessions = await listSessions(supabase, userId, occurrenceId);
  const plan = resolveStartTimeTracking({ sessions, now });

  if (plan.kind === "already_running") {
    return { tracking: resolveOccurrenceTimeTracking(sessions), changed: false };
  }

  const created = await createRunningTimeSession(supabase, {
    user_id: userId,
    occurrence_id: occurrence.id,
    behavior_id: behavior.id,
    started_at: plan.startedAt,
  });
  const persistedSessions = created
    ? [...sessions, toTimeSession(created)]
    : await listSessions(supabase, userId, occurrenceId);

  return {
    tracking: resolveOccurrenceTimeTracking(persistedSessions),
    changed: created !== null,
  };
}

export async function stopOccurrenceTimeTracking(
  occurrenceId: string,
  options: Readonly<{ now?: Temporal.Instant }> = {},
): Promise<TimeTrackingActionResult> {
  const supabase = await createClient();
  const userId = await requireCurrentUserId(SIGN_IN_MESSAGE);
  const now = options.now ?? Temporal.Now.instant();
  await requireOwnedOccurrence(supabase, userId, occurrenceId);
  const sessions = await listSessions(supabase, userId, occurrenceId);
  const plan = resolveStopTimeTracking({ sessions, now });

  if (plan.kind === "already_stopped") {
    return { tracking: resolveOccurrenceTimeTracking(sessions), changed: false };
  }

  const stopped = await stopRunningTimeSession(supabase, {
    userId,
    occurrenceId,
    sessionId: plan.sessionId,
    stoppedAt: plan.stoppedAt,
  });
  const persistedSessions = stopped
    ? sessions.map((session) =>
        session.id === stopped.id ? toTimeSession(stopped) : session,
      )
    : await listSessions(supabase, userId, occurrenceId);

  return {
    tracking: resolveOccurrenceTimeTracking(persistedSessions),
    changed: stopped !== null,
  };
}

export async function resetOccurrenceTimeTracking(
  occurrenceId: string,
): Promise<TimeTrackingActionResult> {
  const supabase = await createClient();
  const userId = await requireCurrentUserId(SIGN_IN_MESSAGE);
  await requireOwnedOccurrence(supabase, userId, occurrenceId);
  const sessions = await listSessions(supabase, userId, occurrenceId);
  const plan = resolveResetTimeTracking(sessions);

  if (!plan.hasSessions) {
    return { tracking: resolveOccurrenceTimeTracking([]), changed: false };
  }

  const deletedIds = await deleteTimeSessionsForOccurrence(supabase, {
    userId,
    occurrenceId,
  });

  return {
    tracking: resolveOccurrenceTimeTracking([]),
    changed: deletedIds.length > 0,
  };
}

async function requireStartEligibility(input: Readonly<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  occurrenceId: string;
  now: Temporal.Instant;
}>) {
  const occurrence = await requireOwnedOccurrence(
    input.supabase,
    input.userId,
    input.occurrenceId,
  );
  const behavior = await getBehaviorById(
    input.supabase,
    input.userId,
    occurrence.behavior_id,
  );

  if (!behavior) {
    throw new Error(MISSING_OCCURRENCE_MESSAGE);
  }

  const todayLocalDate = input.now
    .toZonedDateTimeISO(behavior.timezone)
    .toPlainDate()
    .toString();

  if (!behavior.active || occurrence.local_date !== todayLocalDate) {
    throw new Error(INELIGIBLE_START_MESSAGE);
  }

  return { occurrence, behavior };
}

async function requireOwnedOccurrence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  occurrenceId: string,
) {
  const occurrence = await getOccurrenceById(supabase, userId, occurrenceId);

  if (!occurrence) {
    throw new Error(MISSING_OCCURRENCE_MESSAGE);
  }

  return occurrence;
}

async function listSessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  occurrenceId: string,
): Promise<TimeSession[]> {
  const sessions = await listTimeSessionsForOccurrence(supabase, {
    userId,
    occurrenceId,
  });

  return sessions.map(toTimeSession);
}

export function toTimeSession(session: OccurrenceTimeSession): TimeSession {
  return {
    id: session.id,
    userId: session.user_id,
    occurrenceId: session.occurrence_id,
    behaviorId: session.behavior_id,
    startedAt: session.started_at,
    stoppedAt: session.stopped_at,
  };
}
