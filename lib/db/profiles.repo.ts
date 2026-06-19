import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { Profile } from "@/lib/types/database";

export type ProfileSettings = Pick<Profile, "email" | "timezone">;

export async function getProfileSettings(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ProfileSettings | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function updateProfileTimezone(
  supabase: AppSupabaseClient,
  userId: string,
  timezone: string,
): Promise<ProfileSettings | null> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ timezone })
    .eq("id", userId)
    .select("email, timezone")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
