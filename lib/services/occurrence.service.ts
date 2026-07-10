import { Temporal } from "@js-temporal/polyfill";

import {
  type AppSupabaseClient,
  type BehaviorWithCategory,
  listBehaviorScheduleSlots,
  listUserBehaviors,
} from "@/lib/db/behaviors.repo";
import {
  createMissingOccurrences,
  deleteUnresolvedOccurrencesById,
  getOccurrenceWithBehaviorTimezoneById,
  listBehaviorOccurrencesFrom,
  updateUnresolvedOccurrenceScheduleById,
  updateOccurrenceById,
  type OccurrenceWithBehaviorTimezone,
} from "@/lib/db/occurrences.repo";
import {
  applyOccurrenceStatusTransitionRpc,
  getLatestOccurrenceStatusEventForOccurrence,
  type ApplyOccurrenceStatusTransitionRpcResult,
} from "@/lib/db/occurrenceStatusEvents.repo";
import {
  DEFAULT_OCCURRENCE_HORIZON_DAYS,
  planOccurrenceGeneration,
  resolveGenerationWindow,
  type ExistingOccurrenceForGeneration,
  type OccurrenceGenerationSchedule,
  type OccurrenceGenerationScheduleSlot,
  type OccurrenceGenerationPlan,
} from "@/lib/resolvers/occurrence.resolver";
import { resolveReminderDeliveryCancellation } from "@/lib/resolvers/reminder.resolver";
import { listProfileOccurrenceSyncTargets } from "@/lib/db/profiles.repo";
import {
  resolveNoteUpdate,
  resolveStatusEvent,
  resolveStatusTransition,
  type StatusResolverOccurrence,
} from "@/lib/resolvers/status.resolver";
import {
  normalizeRecurrenceRule,
  normalizeScheduledTime,
} from "@/lib/services/behavior-form";
import {
  compareScheduleSlots,
  toScheduleSlotView,
} from "@/lib/services/schedule";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import {
  syncReminderDeliveriesForBehaviors,
  syncReminderDeliveriesForBehavior,
} from "@/lib/services/reminder.service";
import {
  decideOccurrenceSyncCoverage,
  markOccurrenceSyncFreshForPlans,
  markOccurrenceSyncStale,
  readOccurrenceSyncState,
  type OccurrenceSyncCoverageDecision,
} from "@/lib/services/occurrence-sync-state.service";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Behavior,
  NewOccurrence,
  Occurrence,
  OccurrenceSyncState,
  OccurrenceStatus,
} from "@/lib/types/database";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";
import type { ScheduleKind, TimeRangePreset } from "@/lib/types/schedule";
import type { OccurrenceActionState } from "@/lib/types/timeline";

export type SyncBehaviorOccurrencesOptions = {
  now?: Temporal.Instant;
  horizonDays?: number;
};

export type SyncUserOccurrencesOptions = SyncBehaviorOccurrencesOptions & {
  behaviors?: BehaviorWithCategory[];
  timezone?: string | null;
  planReminderDeliveries?: boolean;
};

export type EnsureUserOccurrencesFreshOptions = SyncUserOccurrencesOptions & {
  syncState?: OccurrenceSyncState | null;
};

export type EnsureUserOccurrencesFreshResult = {
  synced: boolean;
  coverage: OccurrenceSyncCoverageDecision;
  startLocalDate: string;
  endLocalDate: string;
  horizonDays: number;
  plans: OccurrenceGenerationPlan[];
};

export type ProcessOccurrenceSyncHorizonsOptions = {
  now?: Temporal.Instant;
  horizonDays?: number;
  limit?: number;
  supabase?: AppSupabaseClient;
};

export type ProcessOccurrenceSyncHorizonsResult = {
  checked: number;
  synced: number;
  skipped: number;
  failed: number;
};

const DEFAULT_OCCURRENCE_SYNC_PROCESS_LIMIT = 25;
const MAX_OCCURRENCE_SYNC_PROCESS_LIMIT = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function syncUserOccurrences(
  supabase: AppSupabaseClient,
  userId: string,
  options: SyncUserOccurrencesOptions = {},
): Promise<OccurrenceGenerationPlan[]> {
  return measurePerformanceSpan(
    {
      span: "service.sync_user_occurrences",
      counts: (plans) => countGenerationPlans(plans),
    },
    async () => {
      const behaviors = await measurePerformanceSpan(
        {
          span: "occurrence_sync.behavior_list_reuse",
          counts: (resolvedBehaviors) => ({
            behaviors: resolvedBehaviors.length,
            reused_behavior_list: options.behaviors ? 1 : 0,
          }),
        },
        async () => options.behaviors ?? listUserBehaviors(supabase, userId),
      );
      const now = options.now ?? Temporal.Now.instant();
      const syncTimezone = resolveUserSyncTimezone(behaviors, options.timezone);
      const fallbackWindow = resolveGenerationWindow({
        now,
        timezone: syncTimezone ?? DEFAULT_TIMEZONE,
        horizonDays: options.horizonDays,
      });

      if (behaviors.length === 0) {
        await markOccurrenceSyncFreshForPlans(supabase, {
          userId,
          plans: [],
          fallbackWindow,
          syncedAt: now.toString(),
          timezone: syncTimezone,
        });

        return [];
      }

      const behaviorWindows = behaviors.map((behavior) => ({
        behavior,
        generationWindow: resolveGenerationWindow({
          now,
          timezone: behavior.timezone,
          horizonDays: options.horizonDays,
        }),
      }));
      const existingOccurrencesByBehaviorId = await measurePerformanceSpan(
        {
          span: "occurrence_sync.existing_occurrence_reads",
          counts: (occurrencesByBehaviorId) => ({
            behaviors: occurrencesByBehaviorId.size,
            occurrences: countMapValues(occurrencesByBehaviorId),
          }),
        },
        () =>
          listExistingOccurrencesForBehaviorWindows(
            supabase,
            userId,
            behaviorWindows,
          ),
      );
      const schedulesByBehaviorId = await measurePerformanceSpan(
        {
          span: "occurrence_sync.schedule_slot_resolution",
          counts: (resolvedSchedulesByBehaviorId) => ({
            behaviors: resolvedSchedulesByBehaviorId.size,
            schedules: countMapValues(resolvedSchedulesByBehaviorId),
            schedule_slots: Array.from(
              resolvedSchedulesByBehaviorId.values(),
            ).reduce(
              (sum, schedules) =>
                sum +
                schedules.reduce(
                  (scheduleSum, schedule) =>
                    scheduleSum + schedule.timeEntries.length,
                  0,
                ),
              0,
            ),
          }),
        },
        async () =>
          new Map(
            await Promise.all(
              behaviorWindows.map(
                async ({ behavior }) =>
                  [
                    behavior.id,
                    await resolveBehaviorSchedulesForGeneration(
                      supabase,
                      userId,
                      behavior,
                    ),
                  ] as const,
              ),
            ),
          ),
      );
      const plans = await measurePerformanceSpan(
        {
          span: "occurrence_sync.generation_planning",
          counts: (resolvedPlans) => countGenerationPlans(resolvedPlans),
        },
        async () =>
          Promise.all(
            behaviorWindows.map(async ({ behavior, generationWindow }) => {
              const schedules = schedulesByBehaviorId.get(behavior.id) ?? [];
              const behaviorOccurrences = occurrencesFromWindowStart(
                existingOccurrencesByBehaviorId.get(behavior.id) ?? [],
                generationWindow.rangeStart,
              );

              return planOccurrenceGeneration({
                behavior: {
                  id: behavior.id,
                  userId,
                  recurrenceRule: normalizeRecurrenceRule(
                    behavior.recurrence_rule,
                  ),
                  schedules,
                  scheduleSlots: schedules.flatMap(
                    (schedule) => schedule.timeEntries,
                  ),
                  timezone: behavior.timezone,
                  active: behavior.active,
                  createdAt: behavior.created_at,
                },
                existingOccurrences: behaviorOccurrences.map(
                  toExistingOccurrenceForGeneration,
                ),
                now,
                horizonDays: options.horizonDays,
              });
            }),
          ),
      );
      const createdOccurrences = plans.flatMap((plan) =>
        plan.create.map(toNewOccurrence),
      );
      const scheduleUpdates = plans.flatMap((plan) => plan.updateUnresolved);
      const deleteIds = plans.flatMap((plan) => plan.deleteUnresolvedIds);

      await measurePerformanceSpan(
        {
          span: "occurrence_sync.occurrence_writes",
          counts: {
            created: createdOccurrences.length,
            updated: scheduleUpdates.length,
            deleted: deleteIds.length,
          },
        },
        async () => {
          await createMissingOccurrences(supabase, createdOccurrences);
          await Promise.all(
            scheduleUpdates.map((occurrence) =>
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
          await deleteUnresolvedOccurrencesById(supabase, userId, deleteIds);
        },
      );

      const mutatedOccurrences =
        createdOccurrences.length > 0 ||
        scheduleUpdates.length > 0 ||
        deleteIds.length > 0;
      if (options.planReminderDeliveries !== false) {
        const reminderOccurrences = mutatedOccurrences
          ? await measurePerformanceSpan(
              {
                span: "occurrence_sync.reminder_occurrence_refresh",
                counts: (occurrencesByBehaviorId) => ({
                  behaviors: occurrencesByBehaviorId.size,
                  occurrences: countMapValues(occurrencesByBehaviorId),
                }),
              },
              () =>
                listExistingOccurrencesForBehaviorWindows(
                  supabase,
                  userId,
                  behaviorWindows,
                ),
            )
          : existingOccurrencesByBehaviorId;
        const reminderOccurrencesByBehaviorId = reminderOccurrences;

        const reminderInputs = behaviorWindows.map(
          ({ behavior, generationWindow }) => ({
            behavior,
            occurrences: occurrencesFromWindowStart(
              reminderOccurrencesByBehaviorId.get(behavior.id) ?? [],
              generationWindow.rangeStart,
            ),
          }),
        );

        await measurePerformanceSpan(
          {
            span: "occurrence_sync.reminder_planning_writes",
            counts: {
              behaviors: reminderInputs.length,
              occurrences: reminderInputs.reduce(
                (sum, input) => sum + input.occurrences.length,
                0,
              ),
            },
          },
          () =>
            syncReminderDeliveriesForBehaviors(
              supabase,
              userId,
              reminderInputs,
            ),
        );
      }

      await markOccurrenceSyncFreshForPlans(supabase, {
        userId,
        plans,
        fallbackWindow,
        syncedAt: now.toString(),
        timezone: syncTimezone,
      });

      return plans;
    },
  );
}

export async function ensureUserOccurrencesFresh(
  supabase: AppSupabaseClient,
  userId: string,
  options: EnsureUserOccurrencesFreshOptions = {},
): Promise<EnsureUserOccurrencesFreshResult> {
  const now = options.now ?? Temporal.Now.instant();
  const timezone =
    options.timezone ??
    resolveUserSyncTimezone(options.behaviors ?? [], null) ??
    DEFAULT_TIMEZONE;
  const horizonDays = options.horizonDays ?? DEFAULT_OCCURRENCE_HORIZON_DAYS;
  const requiredWindow = resolveGenerationWindow({
    now,
    timezone,
    horizonDays,
  });

  return measurePerformanceSpan(
    {
      span: "service.ensure_user_occurrences_fresh",
      counts: (result) => ({
        covered: result.coverage.covered ? 1 : 0,
        synced: result.synced ? 1 : 0,
        horizon_days: result.horizonDays,
        behaviors: result.plans.length,
        created: result.plans.reduce(
          (sum, plan) => sum + plan.create.length,
          0,
        ),
        updated: result.plans.reduce(
          (sum, plan) => sum + plan.updateUnresolved.length,
          0,
        ),
        deleted: result.plans.reduce(
          (sum, plan) => sum + plan.deleteUnresolvedIds.length,
          0,
        ),
      }),
    },
    async () => {
      const state = hasPreloadedSyncState(options)
        ? (options.syncState ?? null)
        : await readOccurrenceSyncState(supabase, userId);
      const coverage = decideOccurrenceSyncCoverage(state, {
        timezone,
        startLocalDate: requiredWindow.startLocalDate,
        endLocalDate: requiredWindow.endLocalDate,
      });

      if (coverage.covered) {
        return {
          synced: false,
          coverage,
          startLocalDate: requiredWindow.startLocalDate,
          endLocalDate: requiredWindow.endLocalDate,
          horizonDays,
          plans: [],
        };
      }

      try {
        const plans = await syncUserOccurrences(supabase, userId, {
          behaviors: options.behaviors,
          horizonDays,
          now,
          planReminderDeliveries: options.planReminderDeliveries ?? false,
          timezone,
        });

        return {
          synced: true,
          coverage,
          startLocalDate: requiredWindow.startLocalDate,
          endLocalDate: requiredWindow.endLocalDate,
          horizonDays,
          plans,
        };
      } catch (error) {
        await markSyncFailedWithoutMaskingError(supabase, {
          userId,
          timezone,
        });

        throw error;
      }
    },
  );
}

function hasPreloadedSyncState(
  options: EnsureUserOccurrencesFreshOptions,
): options is EnsureUserOccurrencesFreshOptions & {
  syncState: OccurrenceSyncState | null;
} {
  return options.syncState !== undefined;
}

export async function processOccurrenceSyncHorizons(
  options: ProcessOccurrenceSyncHorizonsOptions = {},
): Promise<ProcessOccurrenceSyncHorizonsResult> {
  const supabase = options.supabase ?? createServiceRoleClient();
  const now = options.now ?? Temporal.Now.instant();
  const horizonDays = options.horizonDays ?? DEFAULT_OCCURRENCE_HORIZON_DAYS;
  const targets = await listProfileOccurrenceSyncTargets(supabase, {
    limit: normalizeOccurrenceSyncProcessLimit(options.limit),
  });
  const result: ProcessOccurrenceSyncHorizonsResult = {
    checked: targets.length,
    synced: 0,
    skipped: 0,
    failed: 0,
  };

  return measurePerformanceSpan(
    {
      span: "service.process_occurrence_sync_horizons",
      counts: (resolvedResult) => ({
        users: resolvedResult.checked,
        synced: resolvedResult.synced,
        skipped: resolvedResult.skipped,
        failed: resolvedResult.failed,
        horizon_days: horizonDays,
      }),
    },
    async () => {
      for (const target of targets) {
        try {
          const behaviors = await listUserBehaviors(supabase, target.id);
          const syncResult = await ensureUserOccurrencesFresh(
            supabase,
            target.id,
            {
              now,
              horizonDays,
              planReminderDeliveries: true,
              timezone: target.timezone || DEFAULT_TIMEZONE,
              behaviors,
            },
          );

          if (syncResult.synced) {
            result.synced += 1;
          } else {
            result.skipped += 1;
          }
        } catch {
          result.failed += 1;
        }
      }

      return result;
    },
  );
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
  const [existingOccurrences, schedules] = await Promise.all([
    listBehaviorOccurrencesFrom(
      supabase,
      userId,
      behavior.id,
      generationWindow.rangeStart.toString(),
    ),
    resolveBehaviorSchedulesForGeneration(supabase, userId, behavior),
  ]);
  const plan = planOccurrenceGeneration({
    behavior: {
      id: behavior.id,
      userId,
      recurrenceRule: normalizeRecurrenceRule(behavior.recurrence_rule),
      schedules,
      scheduleSlots: schedules.flatMap((schedule) => schedule.timeEntries),
      timezone: behavior.timezone,
      active: behavior.active,
      createdAt: behavior.created_at,
    },
    existingOccurrences: existingOccurrences.map(
      toExistingOccurrenceForGeneration,
    ),
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
  const mutatedOccurrences =
    plan.create.length > 0 ||
    plan.updateUnresolved.length > 0 ||
    plan.deleteUnresolvedIds.length > 0;

  await syncReminderDeliveriesForBehavior(supabase, userId, behavior, {
    scheduledFrom: generationWindow.rangeStart.toString(),
    occurrences: mutatedOccurrences ? undefined : existingOccurrences,
  });

  return plan;
}

export async function markOccurrenceStatusFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  await applyOccurrenceStatusTransition(supabase, userId, {
    occurrenceId: getOccurrenceIdFromFormData(formData),
    nextStatus: getStatusFromFormData(formData),
    now: Temporal.Now.instant(),
  });
}

export async function applyOccurrenceStatusTransition(
  supabase: AppSupabaseClient,
  userId: string,
  input: {
    occurrenceId: string;
    nextStatus: OccurrenceStatus;
    now: Temporal.Instant;
  },
): Promise<ApplyOccurrenceStatusTransitionRpcResult> {
  const [occurrence, latestStatusEvent] = await Promise.all([
    getRequiredOccurrenceWithBehaviorTimezone(
      supabase,
      userId,
      input.occurrenceId,
    ),
    getLatestOccurrenceStatusEventForOccurrence(
      supabase,
      userId,
      input.occurrenceId,
    ),
  ]);
  const statusOccurrence = toStatusResolverOccurrence(occurrence);
  const update = resolveStatusTransition({
    occurrence: statusOccurrence,
    nextStatus: input.nextStatus,
    now: input.now,
  });
  const eventPlan = resolveStatusEvent({
    occurrence: statusOccurrence,
    nextStatus: input.nextStatus,
    now: input.now,
    hasPriorStatusEvent: latestStatusEvent !== null,
    update,
  });
  const reminderCancellation = resolveReminderDeliveryCancellation({
    occurrence: { status: update.status },
  });
  const result = await applyOccurrenceStatusTransitionRpc(supabase, {
    occurrenceId: occurrence.id,
    expectedStatus: statusOccurrence.status,
    expectedLatestEventId: latestStatusEvent?.id ?? null,
    status: update.status,
    completedAt: update.completedAt,
    statusMarkedAt: update.statusMarkedAt,
    cancelPendingReminders: reminderCancellation.cancelPending,
    event: eventPlan,
  });

  return result;
}

export async function updateOccurrenceNoteFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  await updateOccurrenceNote(supabase, userId, {
    occurrenceId: getOccurrenceIdFromFormData(formData),
    note: getNoteFromFormData(formData),
  });
}

export async function updateOccurrenceNote(
  supabase: AppSupabaseClient,
  userId: string,
  input: {
    occurrenceId: string;
    note: string;
  },
): Promise<Occurrence> {
  const update = resolveNoteUpdate({
    note: input.note,
  });
  const updatedOccurrence = await updateOccurrenceById(
    supabase,
    userId,
    input.occurrenceId,
    update,
  );

  if (!updatedOccurrence) {
    throw new Error("Occurrence not found.");
  }

  return updatedOccurrence;
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

async function listExistingOccurrencesForBehaviorWindows(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorWindows: Array<{
    behavior: BehaviorWithCategory;
    generationWindow: ReturnType<typeof resolveGenerationWindow>;
  }>,
): Promise<Map<string, Occurrence[]>> {
  return new Map(
    await Promise.all(
      behaviorWindows.map(
        async ({ behavior, generationWindow }) =>
          [
            behavior.id,
            await listBehaviorOccurrencesFrom(
              supabase,
              userId,
              behavior.id,
              generationWindow.rangeStart.toString(),
            ),
          ] as const,
      ),
    ),
  );
}

function occurrencesFromWindowStart(
  occurrences: Occurrence[],
  rangeStart: Temporal.Instant,
): Occurrence[] {
  return occurrences.filter(
    (occurrence) =>
      Temporal.Instant.compare(
        Temporal.Instant.from(occurrence.scheduled_for),
        rangeStart,
      ) >= 0,
  );
}

function countMapValues<T>(valuesByKey: Map<string, T[]>): number {
  let count = 0;

  for (const values of valuesByKey.values()) {
    count += values.length;
  }

  return count;
}

function countGenerationPlans(plans: OccurrenceGenerationPlan[]) {
  return {
    behaviors: plans.length,
    created: plans.reduce((sum, plan) => sum + plan.create.length, 0),
    updated: plans.reduce((sum, plan) => sum + plan.updateUnresolved.length, 0),
    deleted: plans.reduce(
      (sum, plan) => sum + plan.deleteUnresolvedIds.length,
      0,
    ),
  };
}

function resolveUserSyncTimezone(
  behaviors: BehaviorWithCategory[],
  explicitTimezone?: string | null,
): string | null {
  if (explicitTimezone) {
    return explicitTimezone;
  }

  const timezoneSource = behaviors.some((behavior) => behavior.active)
    ? behaviors.filter((behavior) => behavior.active)
    : behaviors;
  const timezones = new Set(
    timezoneSource.map((behavior) => behavior.timezone),
  );

  if (timezones.size === 1) {
    return [...timezones][0] ?? DEFAULT_TIMEZONE;
  }

  if (timezones.size === 0) {
    return DEFAULT_TIMEZONE;
  }

  return null;
}

async function markSyncFailedWithoutMaskingError(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    timezone: string;
  },
): Promise<void> {
  try {
    await markOccurrenceSyncStale(supabase, {
      userId: input.userId,
      reason: "sync_failed",
      timezone: input.timezone,
    });
  } catch {
    // Preserve the sync failure as the error surfaced to the route.
  }
}

function normalizeOccurrenceSyncProcessLimit(
  value: number | undefined,
): number {
  if (value === undefined) {
    return DEFAULT_OCCURRENCE_SYNC_PROCESS_LIMIT;
  }

  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_OCCURRENCE_SYNC_PROCESS_LIMIT;
  }

  return Math.min(value, MAX_OCCURRENCE_SYNC_PROCESS_LIMIT);
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
): Promise<OccurrenceGenerationScheduleSlot[]> {
  const scheduleSlots =
    "schedule_slots" in behavior && Array.isArray(behavior.schedule_slots)
      ? behavior.schedule_slots
      : await listBehaviorScheduleSlots(supabase, userId, behavior.id);

  if (scheduleSlots.length === 0) {
    return [
      {
        id: null,
        scheduleId: null,
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
        scheduleId: slot.behavior_schedule_id,
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
      scheduleId: slot.scheduleId,
      kind: slot.kind,
      preset: slot.preset,
      startTime: slot.startTime,
      endTime: slot.endTime,
      sortOrder: slot.sortOrder,
    }));
}

async function resolveBehaviorSchedulesForGeneration(
  supabase: AppSupabaseClient,
  userId: string,
  behavior: Behavior | BehaviorWithCategory,
): Promise<OccurrenceGenerationSchedule[]> {
  if (
    "schedules" in behavior &&
    Array.isArray(behavior.schedules) &&
    behavior.schedules.length > 0
  ) {
    return behavior.schedules
      .map((schedule) => {
        const timeEntries = schedule.schedule_slots
          .map((slot) =>
            toScheduleSlotView({
              id: slot.id,
              scheduleId: slot.behavior_schedule_id ?? schedule.id,
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
            scheduleId: slot.scheduleId,
            kind: slot.kind,
            preset: slot.preset,
            startTime: slot.startTime,
            endTime: slot.endTime,
            sortOrder: slot.sortOrder,
          }));

        return {
          id: schedule.id,
          recurrenceRule: normalizeRecurrenceRule(schedule.recurrence_rule),
          timeEntries,
          sortOrder: schedule.sort_order,
        };
      })
      .filter((schedule) => schedule.timeEntries.length > 0);
  }

  return [
    {
      id: null,
      recurrenceRule: normalizeRecurrenceRule(behavior.recurrence_rule),
      timeEntries: await resolveBehaviorScheduleSlots(
        supabase,
        userId,
        behavior,
      ),
      sortOrder: 0,
    },
  ];
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
  void supabase;

  return requireCurrentUserId("Sign in again before updating occurrences.");
}

async function getRequiredOccurrenceWithBehaviorTimezone(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceId: string,
): Promise<OccurrenceWithBehaviorTimezone> {
  const occurrence = await getOccurrenceWithBehaviorTimezoneById(
    supabase,
    userId,
    occurrenceId,
  );

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

  if (
    value === "unresolved" ||
    value === "completed" ||
    value === "not_completed"
  ) {
    return value;
  }

  throw new Error("Choose a valid occurrence status.");
}

function getNoteFromFormData(formData: FormData): string {
  const value = formData.get("note");

  if (typeof value !== "string") {
    throw new Error("Enter a note before saving.");
  }

  return value;
}

function normalizeOccurrenceStatus(value: string): OccurrenceStatus {
  if (
    value === "unresolved" ||
    value === "completed" ||
    value === "not_completed"
  ) {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
