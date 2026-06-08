import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { NewOccurrence, Occurrence } from "@/lib/types/database";

export async function listBehaviorOccurrencesFrom(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
  scheduledFrom: string,
): Promise<Occurrence[]> {
  const { data, error } = await supabase
    .from("occurrences")
    .select("*")
    .eq("user_id", userId)
    .eq("behavior_id", behaviorId)
    .gte("scheduled_for", scheduledFrom)
    .order("scheduled_for", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createMissingOccurrences(
  supabase: AppSupabaseClient,
  occurrences: NewOccurrence[],
): Promise<void> {
  if (occurrences.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("occurrences")
    .upsert(occurrences, {
      onConflict: "behavior_id,scheduled_for",
      ignoreDuplicates: true,
    });

  if (error) {
    throw error;
  }
}

export async function deleteUnresolvedOccurrencesById(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceIds: string[],
): Promise<void> {
  if (occurrenceIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("occurrences")
    .delete()
    .eq("user_id", userId)
    .eq("status", "unresolved")
    .in("id", occurrenceIds);

  if (error) {
    throw error;
  }
}
