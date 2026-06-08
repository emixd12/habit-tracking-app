import { getProfileSettings } from "@/lib/db/profiles.repo";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

export type SettingsPageData = {
  email: string;
  timezone: string;
  vapidPublicKey: string;
};

export async function getSettingsPageData(): Promise<SettingsPageData> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Sign in again before opening settings.");
  }

  const profile = await getProfileSettings(supabase, user.id);

  return {
    email: profile?.email ?? user.email ?? "Signed in",
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
    vapidPublicKey: normalizePublicVapidKey(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ),
  };
}

function normalizePublicVapidKey(value: string | undefined): string {
  return value?.trim() ?? "";
}
