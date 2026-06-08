import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type {
  NewReminderDelivery,
  ReminderDelivery,
  ReminderDeliveryUpdate,
} from "@/lib/types/database";

const MAX_ERROR_LENGTH = 2000;

export async function createMissingReminderDeliveries(
  supabase: AppSupabaseClient,
  deliveries: NewReminderDelivery[],
): Promise<void> {
  if (deliveries.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("reminder_deliveries")
    .upsert(deliveries, {
      onConflict: "occurrence_id,channel,scheduled_send_at",
      ignoreDuplicates: true,
    });

  if (error) {
    throw error;
  }
}

export async function cancelPendingReminderDeliveriesForOccurrence(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("reminder_deliveries")
    .update({
      status: "cancelled",
      error: null,
    })
    .eq("user_id", userId)
    .eq("occurrence_id", occurrenceId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }
}

export async function listDuePendingEmailReminderDeliveries(
  supabase: AppSupabaseClient,
  options: {
    dueAt: string;
    limit: number;
  },
): Promise<ReminderDelivery[]> {
  const { data, error } = await supabase
    .from("reminder_deliveries")
    .select("*")
    .eq("channel", "email")
    .eq("status", "pending")
    .is("processing_started_at", null)
    .lte("scheduled_send_at", options.dueAt)
    .order("scheduled_send_at", { ascending: true })
    .limit(options.limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function claimPendingEmailReminderDelivery(
  supabase: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
    dueAt: string;
    processingStartedAt: string;
  },
): Promise<ReminderDelivery | null> {
  const { data, error } = await supabase
    .from("reminder_deliveries")
    .update({
      processing_started_at: input.processingStartedAt,
    })
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .eq("channel", "email")
    .eq("status", "pending")
    .is("processing_started_at", null)
    .lte("scheduled_send_at", input.dueAt)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function cancelPendingReminderDeliveryById(
  supabase: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
  },
): Promise<void> {
  await updateReminderDeliveryById(supabase, input, {
    status: "cancelled",
    error: null,
  });
}

export async function markReminderDeliverySent(
  supabase: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
    sentAt: string;
  },
): Promise<void> {
  await updateReminderDeliveryById(supabase, input, {
    status: "sent",
    sent_at: input.sentAt,
    error: null,
  });
}

export async function markReminderDeliveryFailed(
  supabase: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
    error: string;
  },
): Promise<void> {
  await updateReminderDeliveryById(supabase, input, {
    status: "failed",
    sent_at: null,
    error: truncateError(input.error),
  });
}

async function updateReminderDeliveryById(
  supabase: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
  },
  update: ReminderDeliveryUpdate,
): Promise<void> {
  const { error } = await supabase
    .from("reminder_deliveries")
    .update(update)
    .eq("id", input.id)
    .eq("user_id", input.userId);

  if (error) {
    throw error;
  }
}

function truncateError(value: string): string {
  return value.length > MAX_ERROR_LENGTH
    ? `${value.slice(0, MAX_ERROR_LENGTH - 3)}...`
    : value;
}

export async function cancelPendingReminderDeliveriesForOccurrences(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceIds: string[],
): Promise<void> {
  if (occurrenceIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("reminder_deliveries")
    .update({
      status: "cancelled",
      error: null,
    })
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("occurrence_id", occurrenceIds);

  if (error) {
    throw error;
  }
}
