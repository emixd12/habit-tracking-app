import { Temporal } from "@js-temporal/polyfill";

import {
  type AppSupabaseClient,
  type BehaviorWithCategory,
  getBehaviorById,
  listBehaviorScheduleSlots,
  listUserBehaviors,
} from "@/lib/db/behaviors.repo";
import {
  createMissingOccurrences,
  deleteUnresolvedOccurrencesById,
  getOccurrenceById,
  listBehaviorOccurrencesFrom,
  updateUnresolvedOccurrenceScheduleById,
  updateOccurrenceById,
} from "@/lib/db/occurrences.repo";
import {
  createOccurrenceStatusEvent,
  getLatestOccurrenceStatusEventForOccurrence,
} from "@/lib/db/occurrenceStatusEvents.repo";
import {
  planOccurrenceGeneration,
  resolveGenerationWindow,
  type ExistingOccurrenceForGeneration,
  type OccurrenceGenerationPlan,
} from "@/lib/resolvers/occurrence.resolver";
import {
  resolveNoteUpdate,
  resolveStatusEvent,
  resolveStatusTransition,
  type StatusResolverOccurrence,
} from "@/lib/resolvers/status.resolver";
import { normalizeRecurrenceRule, normalizeScheduledTime } from "@/lib/services/behavior-form";
import { compareScheduleSlots, toScheduleSlotView } from "@/lib/services/schedule";
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
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";
import type { ScheduleKind, TimeRangePreset } from "@/lib/types/schedule";
import type { OccurrenceActionState } from "@/lib/types/timeline";

export type SyncBehaviorOccurrencesOptions = {
  now?: Temporal.Instant;
  horizonDays?: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const scheduleSlots = await resolveBehaviorScheduleSlots(
    supabase,
    userId,
    behavior,
  );
  const plan = planOccurrenceGeneration({
    behavior: {
      id: behavior.id,
      userId,
      recurrenceRule: normalizeRecurrenceRule(behavior.recurrence_rule),
      scheduleSlots,
      timezone: behavior.timezone,
      active: behavior.active,
      createdAt: behavior.created_at,
    },
    existingOccurrences: existingOccurrences.map(toExistingOccurrenceForGeneration),
    now,
    horizonDays: options.horizonDays,
  });

  await createMissingOccurrences(supabase, plan.create.map(toNewOccurrence));
  await Promise.all(
    plan.updateUnresolved.map((occurrence) =>
      updateUnresolvedOccurrenceScheduleById(supabase, {
        userId,
        occurrenceId: occurrence.id,
        occurrence: {
          behavior_schedule_slot_id: occurrence.scheduleSlotId,
          schedule_kind: occurrence.scheduleKind,
          schedule_preset: occurrence.schedulePreset,
          schedule_start_time: occurrence.scheduleStartTime,
          schedule_end_time: occurrence.scheduleEndTime,
          local_date: occurrence.localDate,
        },
      }),
    ),
  );
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
  const statusOccurrence = toStatusResolverOccurrence(occurrence);
  const now = Temporal.Now.instant();
  const update = resolveStatusTransition({
    occurrence: statusOccurrence,
    nextStatus,
    now,
  });
  const eventPlan = resolveStatusEvent({
    occurrence: statusOccurrence,
    nextStatus,
    now,
    update,
  });
  const latestStatusEvent =
    eventPlan?.statusSemantics === "explicit_user_correction"
      ? await getLatestOccurrenceStatusEventForOccurrence(
          supabase,
          userId,
          occurrence.id,
        )
      : null;
  const updatedOccurrence = await updateOccurrenceById(
    supabase,
    userId,
    occurrenceId,
    toOccurrenceStatusUpdate(update),
  );

  if (!updatedOccurrence) {
    throw new Error("Occurrence not found.");
  }

  if (eventPlan) {
    const behavior = await getBehaviorById(
      supabase,
      userId,
      updatedOccurrence.behavior_id,
    );

    await createOccurrenceStatusEvent(supabase, {
      user_id: userId,
      occurrence_id: updatedOccurrence.id,
      behavior_id: updatedOccurrence.behavior_id,
      previous_status: eventPlan.previousStatus,
      status: eventPlan.status,
      status_semantics: eventPlan.statusSemantics,
      recorded_at: eventPlan.recordedAt,
      effective_at: eventPlan.effectiveAt,
      local_date: updatedOccurrence.local_date,
      timezone: behavior?.timezone || DEFAULT_TIMEZONE,
      source_capture_method: eventPlan.sourceCaptureMethod,
      source_confidence: eventPlan.sourceConfidence,
      revises_event_id: latestStatusEvent?.id ?? null,
      reason_code: null,
    });
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
    scheduleSlotId: occurrence.behavior_schedule_slot_id,
    scheduleKind: normalizeScheduleKind(occurrence.schedule_kind),
    schedulePreset: normalizeSchedulePreset(occurrence.schedule_preset),
    scheduleStartTime: normalizeScheduledTime(occurrence.schedule_start_time),
    scheduleEndTime: occurrence.schedule_end_time
      ? normalizeScheduledTime(occurrence.schedule_end_time)
      : null,
  };
}

function toNewOccurrence(occurrence: {
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
}): NewOccurrence {
  return {
    user_id: occurrence.userId,
    behavior_id: occurrence.behaviorId,
    scheduled_for: occurrence.scheduledFor,
    local_date: occurrence.localDate,
    status: occurrence.status,
    behavior_schedule_slot_id: occurrence.scheduleSlotId,
    schedule_kind: occurrence.scheduleKind,
    schedule_preset: occurrence.schedulePreset,
    schedule_start_time: occurrence.scheduleStartTime,
    schedule_end_time: occurrence.scheduleEndTime,
  };
}

async function resolveBehaviorScheduleSlots(
  supabase: AppSupabaseClient,
  userId: string,
  behavior: Behavior | BehaviorWithCategory,
): Promise<
  Array<{
    id: string | null;
    kind: "exact" | "range";
    preset: "morning" | "afternoon" | "evening" | "night" | null;
    startTime: string;
    endTime: string | null;
    sortOrder: number;
  }>
> {
  const scheduleSlots =
    "schedule_slots" in behavior && Array.isArray(behavior.schedule_slots)
      ? behavior.schedule_slots
      : await listBehaviorScheduleSlots(supabase, userId, behavior.id);

  if (scheduleSlots.length === 0) {
    return [
      {
        id: null,
        kind: "exact",
        preset: null,
        startTime: normalizeScheduledTime(behavior.scheduled_time),
        endTime: null,
        sortOrder: 0,
      },
    ];
  }

  return scheduleSlots
    .map((slot) =>
      toScheduleSlotView({
        id: slot.id,
        kind: normalizeScheduleKind(slot.kind),
        preset: normalizeSchedulePreset(slot.preset),
        startTime: slot.start_time,
        endTime: slot.end_time,
        sortOrder: slot.sort_order,
      }),
    )
    .sort(compareScheduleSlots)
    .map((slot) => ({
      id: slot.id,
      kind: slot.kind,
      preset: slot.preset,
      startTime: slot.startTime,
      endTime: slot.endTime,
      sortOrder: slot.sortOrder,
    }));
}

function normalizeScheduleKind(value: string): ScheduleKind {
  if (value === "exact" || value === "range") {
    return value;
  }

  throw new Error(`Unsupported schedule kind: ${value}.`);
}

function normalizeSchedulePreset(value: string | null): TimeRangePreset | null {
  if (
    value === null ||
    value === "morning" ||
    value === "afternoon" ||
    value === "evening" ||
    value === "night"
  ) {
    return value;
  }

  throw new Error(`Unsupported schedule preset: ${value}.`);
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

  if (!UUID_PATTERN.test(value)) {
    throw new Error("Choose a valid occurrence to update.");
  }

  return value;
}

function getStatusFromFormData(formData: FormData): OccurrenceStatus {
  const value = formData.get("status");

  if (value === "completed" || value === "not_completed") {
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
  if (value === "unresolved" || value === "completed" || value === "not_completed") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
