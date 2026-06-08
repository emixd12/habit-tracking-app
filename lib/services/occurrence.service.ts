import { Temporal } from "@js-temporal/polyfill";

import {
  type AppSupabaseClient,
  type BehaviorWithCategory,
  listUserBehaviors,
} from "@/lib/db/behaviors.repo";
import {
  createMissingOccurrences,
  deleteUnresolvedOccurrencesById,
  listBehaviorOccurrencesFrom,
} from "@/lib/db/occurrences.repo";
import {
  planOccurrenceGeneration,
  resolveGenerationWindow,
  type ExistingOccurrenceForGeneration,
  type OccurrenceGenerationPlan,
} from "@/lib/resolvers/occurrence.resolver";
import { normalizeRecurrenceRule, normalizeScheduledTime } from "@/lib/services/behavior-form";
import type {
  Behavior,
  NewOccurrence,
  Occurrence,
  OccurrenceStatus,
} from "@/lib/types/database";

export type SyncBehaviorOccurrencesOptions = {
  now?: Temporal.Instant;
  horizonDays?: number;
};

export async function syncUserOccurrences(
  supabase: AppSupabaseClient,
  userId: string,
  options: SyncBehaviorOccurrencesOptions = {},
): Promise<OccurrenceGenerationPlan[]> {
  const behaviors = await listUserBehaviors(supabase, userId);
  const plans: OccurrenceGenerationPlan[] = [];

  for (const behavior of behaviors) {
    plans.push(
      await syncBehaviorOccurrences(supabase, userId, behavior, options),
    );
  }

  return plans;
}

export async function syncBehaviorOccurrences(
  supabase: AppSupabaseClient,
  userId: string,
  behavior: Behavior | BehaviorWithCategory,
  options: SyncBehaviorOccurrencesOptions = {},
): Promise<OccurrenceGenerationPlan> {
  const now = options.now ?? Temporal.Now.instant();
  const generationWindow = resolveGenerationWindow({
    now,
    timezone: behavior.timezone,
    horizonDays: options.horizonDays,
  });
  const existingOccurrences = await listBehaviorOccurrencesFrom(
    supabase,
    userId,
    behavior.id,
    generationWindow.rangeStart.toString(),
  );
  const plan = planOccurrenceGeneration({
    behavior: {
      id: behavior.id,
      userId,
      recurrenceRule: normalizeRecurrenceRule(behavior.recurrence_rule),
      scheduledTime: normalizeScheduledTime(behavior.scheduled_time),
      timezone: behavior.timezone,
      active: behavior.active,
      createdAt: behavior.created_at,
    },
    existingOccurrences: existingOccurrences.map(toExistingOccurrenceForGeneration),
    now,
    horizonDays: options.horizonDays,
  });

  await createMissingOccurrences(supabase, plan.create.map(toNewOccurrence));
  await deleteUnresolvedOccurrencesById(
    supabase,
    userId,
    plan.deleteUnresolvedIds,
  );

  return plan;
}

function toExistingOccurrenceForGeneration(
  occurrence: Occurrence,
): ExistingOccurrenceForGeneration {
  return {
    id: occurrence.id,
    scheduledFor: occurrence.scheduled_for,
    localDate: occurrence.local_date,
    status: normalizeOccurrenceStatus(occurrence.status),
  };
}

function toNewOccurrence(occurrence: {
  userId: string;
  behaviorId: string;
  scheduledFor: string;
  localDate: string;
  status: "unresolved";
}): NewOccurrence {
  return {
    user_id: occurrence.userId,
    behavior_id: occurrence.behaviorId,
    scheduled_for: occurrence.scheduledFor,
    local_date: occurrence.localDate,
    status: occurrence.status,
  };
}

function normalizeOccurrenceStatus(value: string): OccurrenceStatus {
  if (value === "unresolved" || value === "done" || value === "not_done") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
