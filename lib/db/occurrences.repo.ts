import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
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
  return measurePerformanceSpan(
    {
      span: "db.list_behavior_occurrences_from",
      counts: (occurrences) => ({ occurrences: occurrences.length }),
    },
    async () => {
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
    },
  );
}

export async function listUnresolvedOccurrencesBeforeLocalDate(
  supabase: AppSupabaseClient,
  userId: string,
  localDate: string,
): Promise<Occurrence[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_unresolved_occurrences_before_local_date",
      counts: (occurrences) => ({ occurrences: occurrences.length }),
    },
    async () => {
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
    },
  );
}

export async function listResolvedOccurrencesBeforeLocalDateMarkedBetween(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    localDate: string;
    statusMarkedFrom: string;
    statusMarkedBefore: string;
  },
): Promise<Occurrence[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_resolved_occurrences_before_local_date_marked_between",
      counts: (occurrences) => ({ occurrences: occurrences.length }),
    },
    async () => {
      const { data, error } = await supabase
        .from("occurrences")
        .select("*")
        .eq("user_id", input.userId)
        .in("status", ["completed", "not_completed"])
        .lt("local_date", input.localDate)
        .gte("status_marked_at", input.statusMarkedFrom)
        .lt("status_marked_at", input.statusMarkedBefore)
        .order("local_date", { ascending: false })
        .order("scheduled_for", { ascending: true });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  );
}

export async function listOccurrencesBetweenLocalDates(
  supabase: AppSupabaseClient,
  userId: string,
  startLocalDate: string,
  endLocalDate: string,
): Promise<Occurrence[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_occurrences_between_local_dates",
      counts: (occurrences) => ({ occurrences: occurrences.length }),
    },
    async () => {
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
    },
  );
}

export async function listOccurrencesThroughLocalDate(
  supabase: AppSupabaseClient,
  userId: string,
  endLocalDate: string,
): Promise<Occurrence[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_occurrences_through_local_date",
      counts: (occurrences) => ({ occurrences: occurrences.length }),
    },
    async () => {
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
    },
  );
}

export async function listUserOccurrences(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<Occurrence[]> {
  const { data, error } = await supabase
    .from("occurrences")
    .select("*")
    .eq("user_id", userId)
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

export async function getOccurrenceByBehaviorAndScheduledFor(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    behaviorId: string;
    scheduledFor: string;
  },
): Promise<Occurrence | null> {
  const { data, error } = await supabase
    .from("occurrences")
    .select("*")
    .eq("user_id", input.userId)
    .eq("behavior_id", input.behaviorId)
    .eq("scheduled_for", input.scheduledFor)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function createOccurrenceForImport(
  supabase: AppSupabaseClient,
  occurrence: NewOccurrence,
): Promise<Occurrence> {
  const { data, error } = await supabase
    .from("occurrences")
    .insert(occurrence)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
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

export async function updateOccurrenceNoteIfEmpty(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    occurrenceId: string;
    note: string;
  },
): Promise<Occurrence | null> {
  const occurrence = await getOccurrenceById(
    supabase,
    input.userId,
    input.occurrenceId,
  );

  if (!occurrence || !isEmptyOccurrenceNote(occurrence.note)) {
    return null;
  }

  return updateOccurrenceById(supabase, input.userId, input.occurrenceId, {
    note: input.note,
  });
}

export async function updateUnresolvedOccurrenceScheduleById(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    occurrenceId: string;
    occurrence: Pick<
      OccurrenceUpdate,
      | "behavior_schedule_slot_id"
      | "schedule_kind"
      | "schedule_preset"
      | "schedule_start_time"
      | "schedule_end_time"
      | "local_date"
    >;
  },
): Promise<void> {
  const { error } = await supabase
    .from("occurrences")
    .update(input.occurrence)
    .eq("user_id", input.userId)
    .eq("id", input.occurrenceId)
    .eq("status", "unresolved");

  if (error) {
    throw error;
  }
}

function isEmptyOccurrenceNote(note: string | null): boolean {
  return (note?.trim() ?? "").length === 0;
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
