import { Temporal } from "@js-temporal/polyfill";

import {
  listUserBehaviors,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents } from "@/lib/db/behaviorConfigurationEvents.repo";
import {
  getCurrentUserClaims,
  requireCurrentUserId,
} from "@/lib/auth/current-user";
import { syncUserOccurrencesAndReminders } from "@/lib/services/occurrence.service";
import { planBehaviorConfigurationChangeEvent } from "@/lib/resolvers/behavior-configuration.resolver";
import {
  invalidateBehaviorData,
  invalidateProfileData,
  readCachedProfileSettings,
} from "@/lib/cache/stable-user-data.cache";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";
import type { TimezoneActionState } from "@/lib/types/settings";

export type SettingsPageData = {
  email: string;
  timezone: string;
  vapidPublicKey: string;
  deleteConfirmationLabel: string;
};

export type TimezoneUpdateResult = {
  timezone: string;
  activeBehaviorCount: number;
  changed: boolean;
};

export class TimezoneSettingsUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimezoneSettingsUserError";
  }
}

export async function getSettingsPageData(): Promise<SettingsPageData> {
  const supabase = await createClient();
  const { userId, email: claimsEmail, error } = await getCurrentUserClaims();

  if (error || !userId) {
    throw new Error("Sign in again before opening settings.");
  }

  const profile = await readCachedProfileSettings(supabase, userId);
  const email = profile?.email ?? claimsEmail ?? "Signed in";

  return {
    email,
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
    vapidPublicKey: normalizePublicVapidKey(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ),
    deleteConfirmationLabel: claimsEmail?.trim() || "DELETE",
  };
}

export async function updateCurrentUserTimezoneFromFormData(
  formData: FormData,
): Promise<TimezoneUpdateResult> {
  const supabase = await createClient();
  const userId = await requireTimezoneUserId(
    "Sign in again before changing timezone.",
  );

  const timezone = normalizeTimezoneInput(formData.get("timezone"));
  const profile = await readCachedProfileSettings(supabase, userId);
  const currentTimezone = profile?.timezone ?? DEFAULT_TIMEZONE;
  const changed = currentTimezone !== timezone;
  const beforeBehaviors = (await listUserBehaviors(supabase, userId)).filter(
    (behavior) => behavior.active,
  );
  const effectiveAt = Temporal.Now.instant().toString();

  await updateProfileAndActiveBehaviorTimezonesWithConfigurationEvents(
    supabase,
    {
      timezone,
      expectedProfileTimezone: currentTimezone,
      behaviorChanges: beforeBehaviors.map((behavior) => ({
        behaviorId: behavior.id,
        expectedUpdatedAt: behavior.updated_at,
        configurationEventPlan: planBehaviorConfigurationChangeEvent({
          previousConfiguration: toBehaviorConfigurationSnapshot(behavior),
          nextConfiguration: {
            ...toBehaviorConfigurationSnapshot(behavior),
            timezone,
          },
          recordedAt: effectiveAt,
          effectiveAt,
          source: "manual",
          reasonCode: "timezone_changed",
        }),
      })),
    },
  );

  invalidateProfileData(userId);
  invalidateBehaviorData(userId);
  const activeBehaviors = (await listUserBehaviors(supabase, userId)).filter(
    (behavior) => behavior.active,
  );
  const now = Temporal.Instant.from(effectiveAt);

  await syncUserOccurrencesAndReminders(supabase, userId, {
    behaviors: activeBehaviors,
    now,
    timezone,
  });

  return {
    timezone,
    activeBehaviorCount: activeBehaviors.length,
    changed,
  };
}

function toBehaviorConfigurationSnapshot(behavior: BehaviorWithCategory) {
  return {
    categoryId: behavior.category_id,
    scheduleGraph: (behavior.schedules ?? []).map((schedule) => ({
      recurrenceRule: schedule.recurrence_rule,
      sortOrder: schedule.sort_order,
      timeEntries: schedule.schedule_slots.map((slot) => ({
        kind: slot.kind,
        preset: slot.preset,
        startTime: slot.start_time,
        endTime: slot.end_time,
        sortOrder: slot.sort_order,
      })),
    })),
    browserReminderEnabled: behavior.browser_reminder_enabled,
    emailReminderEnabled: behavior.email_reminder_enabled,
    reminderOffsetMinutes: behavior.reminder_offset_minutes,
    active: behavior.active,
    timezone: behavior.timezone,
  };
}

async function requireTimezoneUserId(message: string): Promise<string> {
  try {
    return await requireCurrentUserId(message);
  } catch {
    throw new TimezoneSettingsUserError(message);
  }
}

export function timezoneErrorToActionState(
  error: unknown,
): TimezoneActionState {
  return {
    status: "error",
    message:
      error instanceof Error ? error.message : "Unable to save timezone.",
    timezone: null,
    activeBehaviorCount: 0,
  };
}

export function normalizeTimezoneInput(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TimezoneSettingsUserError("Enter an IANA timezone.");
  }

  return canonicalizeTimezone(value.trim());
}

function normalizePublicVapidKey(value: string | undefined): string {
  return value?.trim() ?? "";
}

function canonicalizeTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone })
      .resolvedOptions()
      .timeZone;
  } catch {
    throw new TimezoneSettingsUserError("Enter a valid IANA timezone.");
  }
}
