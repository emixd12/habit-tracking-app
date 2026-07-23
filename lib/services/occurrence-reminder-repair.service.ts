import { Temporal } from "@js-temporal/polyfill";

import {
  type AppSupabaseClient,
  listUserBehaviors,
} from "@/lib/db/behaviors.repo";
import { getProfileSettings } from "@/lib/db/profiles.repo";
import { reportMonitoringError } from "@/lib/monitoring/privacy-safe-events";
import { syncUserOccurrencesAndReminders } from "@/lib/services/occurrence.service";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

export type OccurrenceReminderRepairOperation =
  | "behaviorlog_import_create_missing"
  | "behaviorlog_import_merge"
  | "behaviorlog_restore";

/**
 * Repairs derived occurrence and reminder rows after the product graph has
 * already committed. This function intentionally never rejects: the durable
 * stale marker remains available for the background repair path.
 */
export async function repairUserOccurrenceReminderGraphBestEffort(
  supabase: AppSupabaseClient,
  userId: string,
  options: {
    operation: OccurrenceReminderRepairOperation;
    now?: Temporal.Instant;
  },
): Promise<boolean> {
  try {
    const [behaviors, profile] = await Promise.all([
      listUserBehaviors(supabase, userId),
      getProfileSettings(supabase, userId),
    ]);

    await syncUserOccurrencesAndReminders(supabase, userId, {
      behaviors,
      timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
      now: options.now,
    });

    return true;
  } catch (error) {
    reportMonitoringError(
      "occurrence_reminder_post_apply_repair_failed",
      error,
      { operation: options.operation },
    );
    return false;
  }
}
