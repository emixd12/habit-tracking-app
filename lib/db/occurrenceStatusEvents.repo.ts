import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type {
  NewOccurrenceStatusEvent,
  OccurrenceStatusEvent,
} from "@/lib/types/database";

export async function createOccurrenceStatusEvent(
  supabase: AppSupabaseClient,
  event: NewOccurrenceStatusEvent,
): Promise<OccurrenceStatusEvent> {
  const { data, error } = await supabase
    .from("occurrence_status_events")
    .insert(event)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getOccurrenceStatusEventByImportFingerprint(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    occurrenceId: string;
    recordedAt: string;
    status: string;
  },
): Promise<OccurrenceStatusEvent | null> {
  const { data, error } = await supabase
    .from("occurrence_status_events")
    .select("*")
    .eq("user_id", input.userId)
    .eq("occurrence_id", input.occurrenceId)
    .eq("recorded_at", input.recordedAt)
    .eq("status", input.status)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listOccurrenceStatusEventsByOccurrenceIds(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceIds: string[],
): Promise<OccurrenceStatusEvent[]> {
  if (occurrenceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("occurrence_status_events")
    .select("*")
    .eq("user_id", userId)
    .in("occurrence_id", occurrenceIds)
    .order("recorded_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getLatestOccurrenceStatusEventForOccurrence(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceId: string,
): Promise<OccurrenceStatusEvent | null> {
  const { data, error } = await supabase
    .from("occurrence_status_events")
    .select("*")
    .eq("user_id", userId)
    .eq("occurrence_id", occurrenceId)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
