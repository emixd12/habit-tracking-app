import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import {
  readAllPostgrestRows,
  USER_SCOPED_READ_ABSOLUTE_CEILING,
} from "@/lib/db/paginated-read";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import type {
  NewReminderDelivery,
  ReminderDelivery,
  ReminderDeliveryUpdate,
} from "@/lib/types/database";

const MAX_ERROR_LENGTH = 2000;
const REMINDER_ID_FILTER_BATCH_SIZE = 100;
const REMINDER_DELIVERY_CEILING_ERROR =
  "Reminder deliveries exceed Cadence's absolute read ceiling of 100,000 rows.";

export async function createMissingReminderDeliveries(
  supabase: AppSupabaseClient,
  deliveries: NewReminderDelivery[],
): Promise<void> {
  if (deliveries.length === 0) {
    return;
  }

  await measurePerformanceSpan(
    {
      span: "db.create_missing_reminder_deliveries",
      counts: {
        reminders_planned: deliveries.length,
      },
    },
    async () => {
      const { error } = await supabase
        .from("reminder_deliveries")
        .upsert(deliveries, {
          onConflict: "occurrence_id,channel,scheduled_send_at",
          ignoreDuplicates: true,
        });

      if (error) {
        throw error;
      }
    },
  );
}

export async function attachImportProvenanceToPendingReminderDelivery(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    occurrenceId: string;
    channel: string;
    scheduledSendAt: string;
    importRunId: string;
    importedInterventionId: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("reminder_deliveries")
    .update({
      import_run_id: input.importRunId,
      imported_intervention_id: input.importedInterventionId,
    })
    .eq("user_id", input.userId)
    .eq("occurrence_id", input.occurrenceId)
    .eq("channel", input.channel)
    .eq("scheduled_send_at", input.scheduledSendAt)
    .eq("status", "pending")
    .is("processing_started_at", null)
    .is("imported_intervention_id", null);

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

export async function cancelUnclaimedPendingReminderDeliveriesById(
  supabase: AppSupabaseClient,
  userId: string,
  deliveryIds: string[],
): Promise<void> {
  if (deliveryIds.length === 0) {
    return;
  }

  for (const deliveryIdBatch of reminderIdBatches(deliveryIds)) {
    const { error } = await supabase
      .from("reminder_deliveries")
      .update({
        status: "cancelled",
        error: null,
      })
      .eq("user_id", userId)
      .eq("status", "pending")
      .is("processing_started_at", null)
      .in("id", deliveryIdBatch);

    if (error) {
      throw error;
    }
  }
}

export async function reactivateCancelledReminderDeliveriesById(
  supabase: AppSupabaseClient,
  userId: string,
  deliveryIds: string[],
): Promise<void> {
  if (deliveryIds.length === 0) {
    return;
  }

  for (const deliveryIdBatch of reminderIdBatches(deliveryIds)) {
    const { error } = await supabase
      .from("reminder_deliveries")
      .update({
        status: "pending",
        sent_at: null,
        processing_started_at: null,
        error: null,
      })
      .eq("user_id", userId)
      .eq("status", "cancelled")
      .in("id", deliveryIdBatch);

    if (error) {
      throw error;
    }
  }
}

export async function listDuePendingEmailReminderDeliveries(
  supabase: AppSupabaseClient,
  options: {
    dueAt: string;
    reclaimBefore: string;
    limit: number;
  },
): Promise<ReminderDelivery[]> {
  const { data, error } = await supabase
    .from("reminder_deliveries")
    .select("*")
    .eq("channel", "email")
    .eq("status", "pending")
    .or(reclaimableClaimPredicate(options.reclaimBefore))
    .lte("scheduled_send_at", options.dueAt)
    .order("scheduled_send_at", { ascending: true })
    .limit(options.limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listDuePendingBrowserPushReminderDeliveries(
  supabase: AppSupabaseClient,
  options: {
    dueAt: string;
    reclaimBefore: string;
    limit: number;
  },
): Promise<ReminderDelivery[]> {
  const { data, error } = await supabase
    .from("reminder_deliveries")
    .select("*")
    .eq("channel", "browser_push")
    .eq("status", "pending")
    .or(reclaimableClaimPredicate(options.reclaimBefore))
    .lte("scheduled_send_at", options.dueAt)
    .order("scheduled_send_at", { ascending: true })
    .limit(options.limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listReminderDeliveriesByOccurrenceIds(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceIds: string[],
): Promise<ReminderDelivery[]> {
  const occurrenceIdBatches = reminderIdBatches(occurrenceIds);

  if (occurrenceIdBatches.length === 0) {
    return [];
  }

  return measurePerformanceSpan(
    {
      span: "db.list_reminder_deliveries_by_occurrence_ids",
      counts: (deliveries) => ({
        reminders: deliveries.length,
        occurrences: occurrenceIdBatches.reduce(
          (count, batch) => count + batch.length,
          0,
        ),
      }),
    },
    async () => {
      const deliveries: ReminderDelivery[] = [];

      for (const occurrenceIdBatch of occurrenceIdBatches) {
        deliveries.push(
          ...(await readAllPostgrestRows<ReminderDelivery>({
            label: "Reminder delivery rows",
            absoluteCeiling:
              USER_SCOPED_READ_ABSOLUTE_CEILING - deliveries.length,
            absoluteCeilingError: REMINDER_DELIVERY_CEILING_ERROR,
            getRowKey: (delivery) => delivery.id,
            createQuery: () =>
              supabase
                .from("reminder_deliveries")
                .select("*")
                .eq("user_id", userId)
                .in("occurrence_id", occurrenceIdBatch)
                .order("scheduled_send_at", { ascending: true })
                .order("id", { ascending: true }),
          })),
        );
      }

      return deliveries.sort(compareReminderDeliveries);
    },
  );
}

export async function claimPendingEmailReminderDelivery(
  supabase: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
    dueAt: string;
    reclaimBefore: string;
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
    .or(reclaimableClaimPredicate(input.reclaimBefore))
    .lte("scheduled_send_at", input.dueAt)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function claimPendingBrowserPushReminderDelivery(
  supabase: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
    dueAt: string;
    reclaimBefore: string;
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
    .eq("channel", "browser_push")
    .eq("status", "pending")
    .or(reclaimableClaimPredicate(input.reclaimBefore))
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
): Promise<boolean> {
  const { data, error } = await supabase
    .from("reminder_deliveries")
    .update({
      status: "sent",
      sent_at: input.sentAt,
      error: null,
    })
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
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

function reclaimableClaimPredicate(reclaimBefore: string): string {
  return `processing_started_at.is.null,processing_started_at.lt.${reclaimBefore}`;
}

export async function cancelPendingReminderDeliveriesForOccurrences(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceIds: string[],
): Promise<void> {
  if (occurrenceIds.length === 0) {
    return;
  }

  await measurePerformanceSpan(
    {
      span: "db.cancel_pending_reminder_deliveries_for_occurrences",
      counts: {
        occurrences: occurrenceIds.length,
      },
    },
    async () => {
      for (const occurrenceIdBatch of reminderIdBatches(occurrenceIds)) {
        const { error } = await supabase
          .from("reminder_deliveries")
          .update({
            status: "cancelled",
            error: null,
          })
          .eq("user_id", userId)
          .eq("status", "pending")
          .in("occurrence_id", occurrenceIdBatch);

        if (error) {
          throw error;
        }
      }
    },
  );
}

function reminderIdBatches(ids: string[]): string[][] {
  const uniqueIds = [...new Set(ids)];
  const batches: string[][] = [];

  for (
    let start = 0;
    start < uniqueIds.length;
    start += REMINDER_ID_FILTER_BATCH_SIZE
  ) {
    batches.push(uniqueIds.slice(start, start + REMINDER_ID_FILTER_BATCH_SIZE));
  }

  return batches;
}

function compareReminderDeliveries(
  left: ReminderDelivery,
  right: ReminderDelivery,
): number {
  const scheduledOrder =
    Date.parse(left.scheduled_send_at) - Date.parse(right.scheduled_send_at);

  return scheduledOrder || left.id.localeCompare(right.id);
}
