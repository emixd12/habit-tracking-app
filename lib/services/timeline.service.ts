import { Temporal } from "@js-temporal/polyfill";

import { listBehaviorLogImportRuns } from "@/lib/db/behaviorLogImports.repo";
import {
  getProfileTimezone,
  listUserBehaviors,
  type AppSupabaseClient,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import {
  listOccurrencesBetweenLocalDates,
  listResolvedOccurrencesBeforeLocalDateMarkedBetween,
  listUnresolvedOccurrencesBeforeLocalDate,
} from "@/lib/db/occurrences.repo";
import { resolveGenerationWindow } from "@/lib/resolvers/occurrence.resolver";
import {
  TIMELINE_MAX_FUTURE_DAYS,
  resolveTimeline,
} from "@/lib/resolvers/timeline.resolver";
import {
  normalizeRecurrenceRule,
  normalizeScheduledTime,
  summarizeRecurrenceRule,
} from "@/lib/services/behavior-form";
import { formatCompactOccurrenceScheduleLabel } from "@/lib/services/schedule";
import { createFirstRunOnboardingState } from "@/lib/services/onboarding.service";
import { ensureUserOccurrencesFresh } from "@/lib/services/occurrence.service";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type { Occurrence } from "@/lib/types/database";
import type { FirstRunOnboardingState } from "@/lib/types/onboarding";
import type {
  TimelineOccurrenceInput,
  TimelineStatus,
  TimelineView,
} from "@/lib/types/timeline";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

export type GetTimelinePageDataOptions = {
  now?: Temporal.Instant;
  futureDays?: number;
};

export type TimelinePageBundle = {
  timeline: TimelineView;
  onboarding: FirstRunOnboardingState;
};

export async function getTimelinePageBundle(
  options: GetTimelinePageDataOptions = {},
): Promise<TimelinePageBundle> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const now = options.now ?? Temporal.Now.instant();
  const [profileTimezone, behaviors, importRuns] = await Promise.all([
    getProfileTimezone(supabase, userId),
    listUserBehaviors(supabase, userId),
    listBehaviorLogImportRuns(supabase, userId, 1),
  ]);
  const timeline = await getTimelineViewForUser({
    supabase,
    userId,
    now,
    futureDays: options.futureDays,
    profileTimezone,
    behaviors,
  });

  return {
    timeline,
    onboarding: createFirstRunOnboardingState({
      hasAnyBehavior: behaviors.length > 0,
      hasImportRuns: importRuns.length > 0,
      timezone: profileTimezone,
    }),
  };
}

export async function getTimelinePageData(
  options: GetTimelinePageDataOptions = {},
): Promise<TimelineView> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const now = options.now ?? Temporal.Now.instant();
  const [profileTimezone, behaviors] = await Promise.all([
    getProfileTimezone(supabase, userId),
    listUserBehaviors(supabase, userId),
  ]);

  return getTimelineViewForUser({
    supabase,
    userId,
    now,
    futureDays: options.futureDays,
    profileTimezone,
    behaviors,
  });
}

async function getTimelineViewForUser(input: {
  supabase: AppSupabaseClient;
  userId: string;
  now: Temporal.Instant;
  futureDays?: number;
  profileTimezone: string | null;
  behaviors: BehaviorWithCategory[];
}): Promise<TimelineView> {
  const { supabase, userId, now, behaviors } = input;
  const timezone = input.profileTimezone ?? DEFAULT_TIMEZONE;

  await ensureUserOccurrencesFresh(supabase, userId, {
    now,
    behaviors,
    timezone,
    horizonDays: TIMELINE_MAX_FUTURE_DAYS,
  });

  const timelineWindow = resolveGenerationWindow({
    now,
    timezone,
    horizonDays: TIMELINE_MAX_FUTURE_DAYS,
  });
  const retentionWindow = resolveLocalDayInstantWindow(
    timelineWindow.startLocalDate,
    timezone,
  );
  const [
    priorUnresolvedOccurrences,
    retainedPriorOccurrences,
    forwardOccurrences,
  ] = await Promise.all([
    listUnresolvedOccurrencesBeforeLocalDate(
      supabase,
      userId,
      timelineWindow.startLocalDate,
    ),
    listResolvedOccurrencesBeforeLocalDateMarkedBetween(supabase, {
      userId,
      localDate: timelineWindow.startLocalDate,
      statusMarkedFrom: retentionWindow.startInclusive,
      statusMarkedBefore: retentionWindow.endExclusive,
    }),
    listOccurrencesBetweenLocalDates(
      supabase,
      userId,
      timelineWindow.startLocalDate,
      timelineWindow.endLocalDate,
    ),
  ]);
  const activeBehaviorById = new Map(
    behaviors
      .filter((behavior) => behavior.active)
      .map((behavior) => [behavior.id, behavior]),
  );
  const occurrences = [
    ...dedupeOccurrences([
      ...priorUnresolvedOccurrences,
      ...retainedPriorOccurrences,
    ]),
    ...forwardOccurrences,
  ]
    .map((occurrence) =>
      toTimelineOccurrenceInput(occurrence, activeBehaviorById),
    )
    .filter((occurrence): occurrence is TimelineOccurrenceInput =>
      Boolean(occurrence),
    );

  return resolveTimeline({
    occurrences,
    now,
    timezone,
    futureDays: input.futureDays,
  });
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  void supabase;

  return requireCurrentUserId("Sign in again before viewing the timeline.");
}

function toTimelineOccurrenceInput(
  occurrence: Occurrence,
  activeBehaviorById: Map<string, BehaviorWithCategory>,
): TimelineOccurrenceInput | null {
  const behavior = activeBehaviorById.get(occurrence.behavior_id);

  if (!behavior) {
    return null;
  }

  const recurrenceRule = normalizeRecurrenceRule(behavior.recurrence_rule);

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
    status: normalizeTimelineStatus(occurrence.status),
    statusMarkedAt: occurrence.status_marked_at,
    note: occurrence.note ?? "",
  };
}

function resolveLocalDayInstantWindow(
  localDate: string,
  timezone: string,
): { startInclusive: string; endExclusive: string } {
  const startDate = Temporal.PlainDate.from(localDate);
  const start = startDate.toZonedDateTime({
    timeZone: timezone,
    plainTime: Temporal.PlainTime.from("00:00"),
  });
  const end = start.add({ days: 1 });

  return {
    startInclusive: start.toInstant().toString(),
    endExclusive: end.toInstant().toString(),
  };
}

function dedupeOccurrences(occurrences: Occurrence[]): Occurrence[] {
  const occurrenceById = new Map<string, Occurrence>();

  for (const occurrence of occurrences) {
    occurrenceById.set(occurrence.id, occurrence);
  }

  return Array.from(occurrenceById.values());
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

function normalizeTimelineStatus(value: string): TimelineStatus {
  if (value === "unresolved" || value === "completed" || value === "not_completed") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
