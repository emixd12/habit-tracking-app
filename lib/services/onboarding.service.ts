import { listBehaviorLogImportRuns } from "@/lib/db/behaviorLogImports.repo";
import {
  getProfileTimezone,
  listUserBehaviors,
  type AppSupabaseClient,
} from "@/lib/db/behaviors.repo";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";
import type { FirstRunOnboardingState } from "@/lib/types/onboarding";

export async function getFirstRunOnboardingState(): Promise<FirstRunOnboardingState> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const [behaviors, importRuns, profileTimezone] = await Promise.all([
    listUserBehaviors(supabase, userId),
    listBehaviorLogImportRuns(supabase, userId, 1),
    getProfileTimezone(supabase, userId),
  ]);

  return createFirstRunOnboardingState({
    hasAnyBehavior: behaviors.length > 0,
    hasImportRuns: importRuns.length > 0,
    timezone: profileTimezone,
  });
}

export function createFirstRunOnboardingState(input: {
  hasAnyBehavior: boolean;
  hasImportRuns: boolean;
  timezone: string | null;
}): FirstRunOnboardingState {
  return {
    hasAnyBehavior: input.hasAnyBehavior,
    hasImportRuns: input.hasImportRuns,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    vapidPublicKey: normalizePublicVapidKey(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ),
  };
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  void supabase;

  return requireCurrentUserId("Sign in again before viewing onboarding.");
}

function normalizePublicVapidKey(value: string | undefined): string {
  return value?.trim() ?? "";
}
