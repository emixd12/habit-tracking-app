import { Temporal } from "@js-temporal/polyfill";

import {
  type AppSupabaseClient,
  type BehaviorWithCategory,
  listUserBehaviors,
} from "@/lib/db/behaviors.repo";
import {
  createMissingOccurrences,
  deleteUnresolvedOccurrencesById,
  getOccurrenceById,
  listBehaviorOccurrencesFrom,
  updateOccurrenceById,
} from "@/lib/db/occurrences.repo";
import {
  planOccurrenceGeneration,
  resolveGenerationWindow,
  type ExistingOccurrenceForGeneration,
  type OccurrenceGenerationPlan,
} from "@/lib/resolvers/occurrence.resolver";
import {
  resolveNoteUpdate,
  resolveStatusTransition,
  type StatusResolverOccurrence,
} from "@/lib/resolvers/status.resolver";
import { normalizeRecurrenceRule, normalizeScheduledTime } from "@/lib/services/behavior-form";
import {
  cancelReminderDeliveriesForResolvedOccurrence,
  syncReminderDeliveriesForBehavior,
} from "@/lib/services/reminder.service";
import { createClient } from "@/lib/supabase/server";
import type {
  Behavior,
  NewOccurrence,
  Occurrence,
  OccurrenceStatus,
  OccurrenceUpdate,
} from "@/lib/types/database";
import type { OccurrenceActionState } from "@/lib/types/timeline";

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
  await syncReminderDeliveriesForBehavior(supabase, userId, behavior, {
    scheduledFrom: generationWindow.rangeStart.toString(),
  });

  return plan;
}

export async function markOccurrenceStatusFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const occurrenceId = getOccurrenceIdFromFormData(formData);
  const nextStatus = getStatusFromFormData(formData);
  const occurrence = await getRequiredOccurrence(supabase, userId, occurrenceId);
  const update = resolveStatusTransition({
    occurrence: toStatusResolverOccurrence(occurrence),
    nextStatus,
    now: Temporal.Now.instant(),
  });
  const updatedOccurrence = await updateOccurrenceById(
    supabase,
    userId,
    occurrenceId,
    toOccurrenceStatusUpdate(update),
  );

  if (!updatedOccurrence) {
    throw new Error("Occurrence not found.");
  }

  await cancelReminderDeliveriesForResolvedOccurrence(
    supabase,
    userId,
    updatedOccurrence,
  );
}

export async function updateOccurrenceNoteFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const occurrenceId = getOccurrenceIdFromFormData(formData);
  const update = resolveNoteUpdate({
    note: getNoteFromFormData(formData),
  });
  const existingOccurrence = await getRequiredOccurrence(
    supabase,
    userId,
    occurrenceId,
  );
  const updatedOccurrence = await updateOccurrenceById(
    supabase,
    userId,
    existingOccurrence.id,
    update,
  );

  if (!updatedOccurrence) {
    throw new Error("Occurrence not found.");
  }
}

export function occurrenceErrorToActionState(
  error: unknown,
): OccurrenceActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to update this occurrence.",
  };
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

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Sign in again before updating occurrences.");
  }

  return user.id;
}

async function getRequiredOccurrence(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceId: string,
): Promise<Occurrence> {
  const occurrence = await getOccurrenceById(supabase, userId, occurrenceId);

  if (!occurrence) {
    throw new Error("Occurrence not found.");
  }

  return occurrence;
}

function toStatusResolverOccurrence(
  occurrence: Occurrence,
): StatusResolverOccurrence {
  return {
    status: normalizeOccurrenceStatus(occurrence.status),
    completedAt: occurrence.completed_at,
    statusMarkedAt: occurrence.status_marked_at,
    note: occurrence.note,
  };
}

function toOccurrenceStatusUpdate(
  update: ReturnType<typeof resolveStatusTransition>,
): OccurrenceUpdate {
  return {
    status: update.status,
    completed_at: update.completedAt,
    status_marked_at: update.statusMarkedAt,
  };
}

function getOccurrenceIdFromFormData(formData: FormData): string {
  const value = formData.get("occurrence_id");

  if (typeof value !== "string" || !value) {
    throw new Error("Choose an occurrence to update.");
  }

  return value;
}

function getStatusFromFormData(formData: FormData): OccurrenceStatus {
  const value = formData.get("status");

  if (value === "done" || value === "not_done") {
    return value;
  }

  throw new Error("Choose Completed or Not Completed.");
}

function getNoteFromFormData(formData: FormData): string {
  const value = formData.get("note");

  if (typeof value !== "string") {
    throw new Error("Enter a note before saving.");
  }

  return value;
}

function normalizeOccurrenceStatus(value: string): OccurrenceStatus {
  if (value === "unresolved" || value === "done" || value === "not_done") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
