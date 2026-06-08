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
import { resolveGenerationWindow } from "@/lib/resolvers/occurrence.resolver";
import {
  TIMELINE_MAX_FUTURE_DAYS,
  resolveTimeline,
} from "@/lib/resolvers/timeline.resolver";
import {
  formatScheduledTimeLabel,
  normalizeRecurrenceRule,
  normalizeScheduledTime,
  summarizeRecurrenceRule,
} from "@/lib/services/behavior-form";
import { syncUserOccurrences } from "@/lib/services/occurrence.service";
import { createClient } from "@/lib/supabase/server";
import type { Occurrence } from "@/lib/types/database";
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

export async function getTimelinePageData(
  options: GetTimelinePageDataOptions = {},
): Promise<TimelineView> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const now = options.now ?? Temporal.Now.instant();

  await syncUserOccurrences(supabase, userId, { now });

  const profileTimezone = await getProfileTimezone(supabase, userId);
  const timezone = profileTimezone ?? DEFAULT_TIMEZONE;
  const timelineWindow = resolveGenerationWindow({
    now,
    timezone,
    horizonDays: TIMELINE_MAX_FUTURE_DAYS,
  });
  const [behaviors, priorUnresolvedOccurrences, forwardOccurrences] =
    await Promise.all([
      listUserBehaviors(supabase, userId),
      listUnresolvedOccurrencesBeforeLocalDate(
        supabase,
        userId,
        timelineWindow.startLocalDate,
      ),
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
  const occurrences = [...priorUnresolvedOccurrences, ...forwardOccurrences]
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
    futureDays: options.futureDays,
  });
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Sign in again before viewing the timeline.");
  }

  return user.id;
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
  const scheduledTime = normalizeScheduledTime(behavior.scheduled_time);

  return {
    id: occurrence.id,
    behaviorId: occurrence.behavior_id,
    title: behavior.title,
    description: behavior.description ?? "",
    categoryName: behavior.category?.name ?? "No category",
    scheduleSummary: summarizeRecurrenceRule(recurrenceRule),
    scheduledFor: occurrence.scheduled_for,
    scheduledTimeLabel: formatScheduledTimeLabel(scheduledTime),
    localDate: occurrence.local_date,
    status: normalizeTimelineStatus(occurrence.status),
    note: occurrence.note ?? "",
  };
}

function normalizeTimelineStatus(value: string): TimelineStatus {
  if (value === "unresolved" || value === "done" || value === "not_done") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}
