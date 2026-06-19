import { listBehaviorLogImportRuns } from "@/lib/db/behaviorLogImports.repo";
import {
  getProfileTimezone,
  listUserBehaviors,
  type AppSupabaseClient,
} from "@/lib/db/behaviors.repo";
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

  return {
    hasAnyBehavior: behaviors.length > 0,
    hasImportRuns: importRuns.length > 0,
    timezone: profileTimezone ?? DEFAULT_TIMEZONE,
    vapidPublicKey: normalizePublicVapidKey(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ),
  };
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Sign in again before viewing onboarding.");
  }

  return user.id;
}

function normalizePublicVapidKey(value: string | undefined): string {
  return value?.trim() ?? "";
}
