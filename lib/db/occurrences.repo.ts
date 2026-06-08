import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type {
  NewOccurrence,
  Occurrence,
  OccurrenceUpdate,
} from "@/lib/types/database";

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

export async function listUnresolvedOccurrencesBeforeLocalDate(
  supabase: AppSupabaseClient,
  userId: string,
  localDate: string,
): Promise<Occurrence[]> {
  const { data, error } = await supabase
    .from("occurrences")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "unresolved")
    .lt("local_date", localDate)
    .order("local_date", { ascending: false })
    .order("scheduled_for", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listOccurrencesBetweenLocalDates(
  supabase: AppSupabaseClient,
  userId: string,
  startLocalDate: string,
  endLocalDate: string,
): Promise<Occurrence[]> {
  const { data, error } = await supabase
    .from("occurrences")
    .select("*")
    .eq("user_id", userId)
    .gte("local_date", startLocalDate)
    .lte("local_date", endLocalDate)
    .order("local_date", { ascending: true })
    .order("scheduled_for", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listOccurrencesThroughLocalDate(
  supabase: AppSupabaseClient,
  userId: string,
  endLocalDate: string,
): Promise<Occurrence[]> {
  const { data, error } = await supabase
    .from("occurrences")
    .select("*")
    .eq("user_id", userId)
    .lte("local_date", endLocalDate)
    .order("local_date", { ascending: true })
    .order("scheduled_for", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getOccurrenceById(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceId: string,
): Promise<Occurrence | null> {
  const { data, error } = await supabase
    .from("occurrences")
    .select("*")
    .eq("user_id", userId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
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

export async function updateOccurrenceById(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceId: string,
  occurrence: OccurrenceUpdate,
): Promise<Occurrence | null> {
  const { data, error } = await supabase
    .from("occurrences")
    .update(occurrence)
    .eq("user_id", userId)
    .eq("id", occurrenceId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
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
