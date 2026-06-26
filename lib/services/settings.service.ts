import { Temporal } from "@js-temporal/polyfill";

import { updateActiveBehaviorTimezones } from "@/lib/db/behaviors.repo";
import {
  getProfileSettings,
  updateProfileTimezone,
} from "@/lib/db/profiles.repo";
import {
  getCurrentUserClaims,
  requireCurrentUserId,
} from "@/lib/auth/current-user";
import { syncUserOccurrences } from "@/lib/services/occurrence.service";
import { markOccurrenceSyncStale } from "@/lib/services/occurrence-sync-state.service";
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

  const profile = await getProfileSettings(supabase, userId);
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
  const profile = await getProfileSettings(supabase, userId);
  const currentTimezone = profile?.timezone ?? DEFAULT_TIMEZONE;

  if (currentTimezone === timezone) {
    return {
      timezone,
      activeBehaviorCount: 0,
      changed: false,
    };
  }

  await markOccurrenceSyncStale(supabase, {
    userId,
    reason: "timezone_changed",
    timezone,
  });
  await updateProfileTimezone(supabase, userId, timezone);
  const activeBehaviors = await updateActiveBehaviorTimezones(
    supabase,
    userId,
    timezone,
  );
  const now = Temporal.Now.instant();

  await syncUserOccurrences(supabase, userId, {
    behaviors: activeBehaviors,
    now,
    timezone,
  });

  return {
    timezone,
    activeBehaviorCount: activeBehaviors.length,
    changed: true,
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
