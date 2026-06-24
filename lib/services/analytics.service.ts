import { Temporal } from "@js-temporal/polyfill";

import {
  getProfileTimezone,
  listUserBehaviors,
  type AppSupabaseClient,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import {
  listOccurrencesBetweenLocalDates,
  listUnresolvedOccurrencesBeforeLocalDate,
} from "@/lib/db/occurrences.repo";
import {
  resolveAnalytics,
  resolveAnalyticsDateRange,
} from "@/lib/resolvers/analytics.resolver";
import { formatOccurrenceScheduleLabel } from "@/lib/services/schedule";
import { syncUserOccurrences } from "@/lib/services/occurrence.service";
import { createClient } from "@/lib/supabase/server";
import type { AnalyticsOccurrenceInput, AnalyticsView } from "@/lib/types/analytics";
import type { Occurrence, OccurrenceStatus } from "@/lib/types/database";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

export type GetAnalyticsPageDataOptions = {
  now?: Temporal.Instant;
  rangeDays?: number;
  selectedBehaviorId?: string | null;
  selectedDayLocalDate?: string | null;
};

export async function getAnalyticsPageData(
  options: GetAnalyticsPageDataOptions = {},
): Promise<AnalyticsView> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const now = options.now ?? Temporal.Now.instant();
  const profileTimezone = await getProfileTimezone(supabase, userId);
  const timezone = profileTimezone ?? DEFAULT_TIMEZONE;
  const dateRange = resolveAnalyticsDateRange({
    now,
    timezone,
    rangeDays: options.rangeDays,
  });

  await syncUserOccurrences(supabase, userId, { now });

  const [behaviors, occurrences, needsDecisionOccurrences] = await Promise.all([
    listUserBehaviors(supabase, userId),
    listOccurrencesBetweenLocalDates(
      supabase,
      userId,
      dateRange.startLocalDate,
      dateRange.endLocalDate,
    ),
    listUnresolvedOccurrencesBeforeLocalDate(
      supabase,
      userId,
      dateRange.endLocalDate,
    ),
  ]);
  const behaviorById = new Map(
    behaviors.map((behavior) => [behavior.id, behavior]),
  );

  return resolveAnalytics({
    occurrences: occurrences
      .map((occurrence) => toAnalyticsOccurrenceInput(occurrence, behaviorById))
      .filter((occurrence): occurrence is AnalyticsOccurrenceInput =>
        Boolean(occurrence),
      ),
    needsDecisionOccurrences: needsDecisionOccurrences
      .map((occurrence) => toAnalyticsOccurrenceInput(occurrence, behaviorById))
      .filter((occurrence): occurrence is AnalyticsOccurrenceInput =>
        Boolean(occurrence),
      ),
    now,
    timezone,
    rangeDays: dateRange.rangeDays,
    selectedBehaviorId: options.selectedBehaviorId,
    selectedDayLocalDate: options.selectedDayLocalDate,
  });
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Sign in again before viewing analytics.");
  }

  return user.id;
}

function toAnalyticsOccurrenceInput(
  occurrence: Occurrence,
  behaviorById: Map<string, BehaviorWithCategory>,
): AnalyticsOccurrenceInput | null {
  const behavior = behaviorById.get(occurrence.behavior_id);

  if (!behavior) {
    return null;
  }

  return {
    id: occurrence.id,
    behaviorId: occurrence.behavior_id,
    behaviorTitle: behavior.title,
    behaviorActive: behavior.active,
    behaviorCreatedAt: behavior.created_at,
    categoryName: behavior.category?.name ?? "No category",
    scheduledFor: occurrence.scheduled_for,
    scheduledTimeLabel: formatOccurrenceScheduleLabel({
      scheduleKind: normalizeScheduleKind(occurrence.schedule_kind),
      schedulePreset: normalizeSchedulePreset(occurrence.schedule_preset),
      scheduleStartTime: occurrence.schedule_start_time,
      scheduleEndTime: occurrence.schedule_end_time,
    }),
    localDate: occurrence.local_date,
    status: normalizeOccurrenceStatus(occurrence.status),
    note: occurrence.note ?? "",
    timezone: behavior.timezone || DEFAULT_TIMEZONE,
  };
}

function normalizeScheduleKind(value: string): "exact" | "range" {
  if (value === "exact" || value === "range") {
    return value;
  }

  throw new Error(`Unsupported schedule kind: ${value}.`);
}

function normalizeSchedulePreset(
  value: string | null,
): "morning" | "afternoon" | "evening" | "night" | null {
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

function normalizeOccurrenceStatus(value: string): OccurrenceStatus {
  if (value === "unresolved" || value === "completed" || value === "not_completed") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
