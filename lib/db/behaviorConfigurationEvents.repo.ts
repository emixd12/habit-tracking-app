import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { Json } from "@/lib/db/database.types";
import {
  POSTGREST_PAGE_SIZE,
  USER_SCOPED_READ_ABSOLUTE_CEILING,
} from "@/lib/db/paginated-read";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import type { BehaviorConfigurationEventPlan } from "@/lib/types/behavior-configuration-event";
import type { BehaviorConfigurationEvent } from "@/lib/types/database";

export type TimezoneBehaviorConfigurationChange = {
  behaviorId: string;
  expectedUpdatedAt: string;
  configurationEventPlan: BehaviorConfigurationEventPlan | null;
};

const HISTORY_EXPORT_CEILING_ERROR =
  "Configuration history exceeds Cadence's 100,000-event export ceiling.";
const HISTORY_HIGH_WATER_ERROR =
  "Behavior configuration history pagination ended before the captured high-water event.";

export async function listBehaviorConfigurationEvents(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<BehaviorConfigurationEvent[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_behavior_configuration_events",
      counts: (events) => ({
        behavior_configuration_events: events.length,
      }),
    },
    async () => {
      const { data: highWaterRows, error: highWaterError } = await supabase
        .from("behavior_configuration_events")
        .select("id, recorded_at")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);

      if (highWaterError) {
        throw highWaterError;
      }

      const highWater = highWaterRows?.[0];

      if (!highWater) {
        return [];
      }

      const events: BehaviorConfigurationEvent[] = [];
      const eventIds = new Set<string>();
      let cursor: Pick<BehaviorConfigurationEvent, "id" | "recorded_at"> | null =
        null;

      for (;;) {
        let query = supabase
          .from("behavior_configuration_events")
          .select("*")
          .eq("user_id", userId)
          .lte("recorded_at", highWater.recorded_at)
          .order("recorded_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(POSTGREST_PAGE_SIZE);

        if (cursor) {
          query = query.or(
            `recorded_at.gt.${cursor.recorded_at},and(recorded_at.eq.${cursor.recorded_at},id.gt.${cursor.id})`,
          );
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        const page = (data ?? []).filter(
          (event) =>
            event.recorded_at !== highWater.recorded_at ||
            event.id.localeCompare(highWater.id) <= 0,
        );

        let previous = cursor;

        for (const event of page) {
          if (
            eventIds.has(event.id) ||
            (previous !== null && compareHistoryRows(event, previous) <= 0)
          ) {
            throw new Error(
              "Behavior configuration history pagination did not advance.",
            );
          }

          eventIds.add(event.id);
          previous = event;
        }

        if (
          events.length + page.length >
          USER_SCOPED_READ_ABSOLUTE_CEILING
        ) {
          throw new Error(HISTORY_EXPORT_CEILING_ERROR);
        }

        events.push(...page);

        const last = page.at(-1);

        if (!last) {
          throw new Error(HISTORY_HIGH_WATER_ERROR);
        }

        if (
          last.recorded_at === highWater.recorded_at &&
          last.id === highWater.id
        ) {
          return events;
        }

        if (events.length === USER_SCOPED_READ_ABSOLUTE_CEILING) {
          throw new Error(HISTORY_EXPORT_CEILING_ERROR);
        }

        cursor = last;
      }
    },
  );
}

function compareHistoryRows(
  left: Pick<BehaviorConfigurationEvent, "id" | "recorded_at">,
  right: Pick<BehaviorConfigurationEvent, "id" | "recorded_at">,
): number {
  if (left.recorded_at < right.recorded_at) {
    return -1;
  }

  if (left.recorded_at > right.recorded_at) {
    return 1;
  }

  return left.id.localeCompare(right.id);
}

export async function updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents(
  supabase: AppSupabaseClient,
  input: {
    timezone: string;
    expectedProfileTimezone: string;
    behaviorChanges: TimezoneBehaviorConfigurationChange[];
  },
): Promise<{
  activeBehaviorCount: number;
  changedBehaviorCount: number;
  profileChanged: boolean;
}> {
  const { data, error } = await supabase.rpc(
    "update_profile_and_behavior_timezones_with_config_events",
    {
      target_timezone: input.timezone,
      expected_profile_timezone: input.expectedProfileTimezone,
      behavior_changes: input.behaviorChanges.map((change) => ({
        behavior_id: change.behaviorId,
        expected_updated_at: change.expectedUpdatedAt,
        configuration_event_plan: change.configurationEventPlan
          ? toBehaviorConfigurationEventPlanPayload(
              change.configurationEventPlan,
            )
          : null,
      })),
    },
  );

  if (error) {
    throw error;
  }

  const result = data as unknown as Record<string, unknown>;

  return {
    activeBehaviorCount: readCount(result.active_behavior_count),
    changedBehaviorCount: readCount(result.changed_behavior_count),
    profileChanged: result.profile_changed === true,
  };
}

export function toBehaviorConfigurationEventPlanPayload(
  plan: BehaviorConfigurationEventPlan,
): Json {
  return {
    event_kind: plan.eventKind,
    previous_configuration: plan.previousConfiguration
      ? toBehaviorConfigurationSnapshotPayload(plan.previousConfiguration)
      : null,
    next_configuration: toBehaviorConfigurationSnapshotPayload(
      plan.nextConfiguration,
    ),
    changed_fields: plan.changedFields,
    recorded_at: plan.recordedAt,
    effective_at: plan.effectiveAt,
    effective_local_date: plan.effectiveLocalDate,
    timezone: plan.timezone,
    source: plan.source,
    reason_code: plan.reasonCode,
  };
}

function toBehaviorConfigurationSnapshotPayload(
  snapshot: BehaviorConfigurationEventPlan["nextConfiguration"],
): Json {
  return {
    category_id: snapshot.categoryId,
    schedule_graph: snapshot.scheduleGraph.map((schedule) => ({
      recurrence_rule: schedule.recurrenceRule,
      sort_order: schedule.sortOrder,
      time_entries: schedule.timeEntries.map((entry) => ({
        kind: entry.kind,
        preset: entry.preset,
        start_time: entry.startTime,
        end_time: entry.endTime,
        sort_order: entry.sortOrder,
      })),
    })),
    browser_reminder_enabled: snapshot.browserReminderEnabled,
    email_reminder_enabled: snapshot.emailReminderEnabled,
    reminder_offset_minutes: snapshot.reminderOffsetMinutes,
    active: snapshot.active,
    timezone: snapshot.timezone,
  };
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}
