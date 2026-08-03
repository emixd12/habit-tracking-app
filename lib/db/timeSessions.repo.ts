import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type {
  NewOccurrenceTimeSession,
  OccurrenceTimeSession,
} from "@/lib/types/database";

export async function listTimeSessionsByOccurrenceIds(
  supabase: AppSupabaseClient,
  input: Readonly<{ userId: string; occurrenceIds: string[] }>,
): Promise<OccurrenceTimeSession[]> {
  if (input.occurrenceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("occurrence_time_sessions")
    .select("*")
    .eq("user_id", input.userId)
    .in("occurrence_id", input.occurrenceIds)
    .order("started_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listTimeSessionsForOccurrence(
  supabase: AppSupabaseClient,
  input: Readonly<{ userId: string; occurrenceId: string }>,
): Promise<OccurrenceTimeSession[]> {
  return listTimeSessionsByOccurrenceIds(supabase, {
    userId: input.userId,
    occurrenceIds: [input.occurrenceId],
  });
}

export async function createRunningTimeSession(
  supabase: AppSupabaseClient,
  session: NewOccurrenceTimeSession,
): Promise<OccurrenceTimeSession | null> {
  const { data, error } = await supabase
    .from("occurrence_time_sessions")
    .insert(session)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return null;
    }

    throw error;
  }

  return data;
}

export async function stopRunningTimeSession(
  supabase: AppSupabaseClient,
  input: Readonly<{
    userId: string;
    occurrenceId: string;
    sessionId: string;
    stoppedAt: string;
  }>,
): Promise<OccurrenceTimeSession | null> {
  const { data, error } = await supabase
    .from("occurrence_time_sessions")
    .update({ stopped_at: input.stoppedAt })
    .eq("user_id", input.userId)
    .eq("occurrence_id", input.occurrenceId)
    .eq("id", input.sessionId)
    .is("stopped_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteTimeSessionsForOccurrence(
  supabase: AppSupabaseClient,
  input: Readonly<{ userId: string; occurrenceId: string }>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("occurrence_time_sessions")
    .delete()
    .eq("user_id", input.userId)
    .eq("occurrence_id", input.occurrenceId)
    .select("id");

  if (error) {
    throw error;
  }

  return (data ?? []).map((session) => session.id);
}
