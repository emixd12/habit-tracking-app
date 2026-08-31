import { Temporal } from "@js-temporal/polyfill";
import {
  startOccurrenceTimeTracking as startSharedTimeTracking,
  stopOccurrenceTimeTracking as stopSharedTimeTracking,
  resetOccurrenceTimeTracking as resetSharedTimeTracking,
  type TimeTrackingDataStore,
  type TimeTrackingActionResult,
} from "@cadence/core/services/time-tracking.service";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { getBehaviorById } from "@/lib/db/behaviors.repo";
import { getOccurrenceById } from "@/lib/db/occurrences.repo";
import {
  createRunningTimeSession,
  deleteTimeSessionsForOccurrence,
  listTimeSessionsForOccurrence,
  stopRunningTimeSession,
  type OccurrenceTimeSessionReadRow,
} from "@/lib/db/timeSessions.repo";
import { createClient } from "@/lib/supabase/server";
import type { TimeSession } from "@/lib/types/time-tracking";

export type { TimeTrackingActionResult } from "@cadence/core/services/time-tracking.service";

export async function startOccurrenceTimeTracking(
  occurrenceId: string,
  options: Readonly<{ now?: Temporal.Instant }> = {},
): Promise<TimeTrackingActionResult> {
  const store = await createWebTimeTrackingStore();
  return startSharedTimeTracking(store, occurrenceId, options.now ?? Temporal.Now.instant());
}

export async function stopOccurrenceTimeTracking(
  occurrenceId: string,
  options: Readonly<{ now?: Temporal.Instant }> = {},
): Promise<TimeTrackingActionResult> {
  const store = await createWebTimeTrackingStore();
  return stopSharedTimeTracking(store, occurrenceId, options.now ?? Temporal.Now.instant());
}

export async function resetOccurrenceTimeTracking(occurrenceId: string): Promise<TimeTrackingActionResult> {
  return resetSharedTimeTracking(await createWebTimeTrackingStore(), occurrenceId);
}

async function createWebTimeTrackingStore(): Promise<TimeTrackingDataStore> {
  const supabase = await createClient();
  const userId = await requireCurrentUserId("Sign in again before tracking time.");
  return {
    readOccurrence: (id) => getOccurrenceById(supabase, userId, id),
    readBehavior: (id) => getBehaviorById(supabase, userId, id),
    listSessions: async (occurrenceId) =>
      (await listTimeSessionsForOccurrence(supabase, { userId, occurrenceId })).map(toTimeSession),
    async createRunningSession(input) {
      const session = await createRunningTimeSession(supabase, {
        user_id: userId, occurrence_id: input.occurrenceId,
        behavior_id: input.behaviorId, started_at: input.startedAt,
      });
      return session ? toTimeSession(session) : null;
    },
    async stopRunningSession(input) {
      const session = await stopRunningTimeSession(supabase, { userId, ...input });
      return session ? toTimeSession(session) : null;
    },
    resetSessions: (occurrenceId) => deleteTimeSessionsForOccurrence(supabase, { userId, occurrenceId }),
  };
}

export function toTimeSession(session: OccurrenceTimeSessionReadRow): TimeSession {
  return {
    id: session.id,
    userId: session.user_id,
    occurrenceId: session.occurrence_id,
    behaviorId: session.behavior_id,
    startedAt: session.started_at,
    stoppedAt: session.stopped_at,
  };
}
