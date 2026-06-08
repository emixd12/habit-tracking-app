import { Temporal } from "@js-temporal/polyfill";

import type {
  AppSupabaseClient,
  BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { getBehaviorById } from "@/lib/db/behaviors.repo";
import {
  cancelPendingReminderDeliveryById,
  cancelPendingReminderDeliveriesForOccurrence,
  cancelPendingReminderDeliveriesForOccurrences,
  claimPendingEmailReminderDelivery,
  createMissingReminderDeliveries,
  listDuePendingEmailReminderDeliveries,
  markReminderDeliveryFailed,
  markReminderDeliverySent,
} from "@/lib/db/reminderDeliveries.repo";
import {
  getOccurrenceById,
  listBehaviorOccurrencesFrom,
} from "@/lib/db/occurrences.repo";
import { getProfileSettings } from "@/lib/db/profiles.repo";
import {
  resolveReminderDeliveries,
  resolveReminderDeliveryCancellation,
  type ReminderResolverBehavior,
  type ReminderResolverOccurrence,
} from "@/lib/resolvers/reminder.resolver";
import {
  createSequenzyReminderEmailSender,
  type SequenzyReminderEmailInput,
} from "@/lib/services/sequenzy.service";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type {
  Behavior,
  NewReminderDelivery,
  Occurrence,
  OccurrenceStatus,
  ReminderDelivery,
} from "@/lib/types/database";

export type ReminderEmailSender = (
  input: SequenzyReminderEmailInput,
) => Promise<unknown>;

export type ProcessDueEmailRemindersOptions = {
  now?: Temporal.Instant;
  limit?: number;
  supabase?: AppSupabaseClient;
  sendEmail?: ReminderEmailSender;
};

export type ProcessDueEmailRemindersResult = {
  checked: number;
  claimed: number;
  skipped: number;
  sent: number;
  failed: number;
  cancelled: number;
};

const DEFAULT_PROCESS_LIMIT = 25;
const MAX_PROCESS_LIMIT = 100;

export async function syncReminderDeliveriesForBehavior(
  supabase: AppSupabaseClient,
  userId: string,
  behavior: Behavior | BehaviorWithCategory,
  options: { scheduledFrom: string },
): Promise<void> {
  const occurrences = await listBehaviorOccurrencesFrom(
    supabase,
    userId,
    behavior.id,
    options.scheduledFrom,
  );

  if (!behavior.active) {
    await cancelPendingReminderDeliveriesForOccurrences(
      supabase,
      userId,
      occurrences.map((occurrence) => occurrence.id),
    );
    return;
  }

  const resolverBehavior = toReminderResolverBehavior(behavior, userId);
  const deliveries = occurrences.flatMap((occurrence) =>
    resolveReminderDeliveries({
      behavior: resolverBehavior,
      occurrence: toReminderResolverOccurrence(occurrence),
    }),
  );

  await createMissingReminderDeliveries(
    supabase,
    deliveries.map(toNewReminderDelivery),
  );
}

export async function cancelReminderDeliveriesForResolvedOccurrence(
  supabase: AppSupabaseClient,
  userId: string,
  occurrence: Occurrence,
): Promise<void> {
  const cancellation = resolveReminderDeliveryCancellation({
    occurrence: toReminderResolverOccurrence(occurrence),
  });

  if (!cancellation.cancelPending) {
    return;
  }

  await cancelPendingReminderDeliveriesForOccurrence(
    supabase,
    userId,
    occurrence.id,
  );
}

export async function processDueEmailReminders(
  options: ProcessDueEmailRemindersOptions = {},
): Promise<ProcessDueEmailRemindersResult> {
  const now = options.now ?? Temporal.Now.instant();
  const dueAt = now.toString();
  const processingStartedAt = dueAt;
  const limit = normalizeProcessLimit(options.limit);
  const sendEmail = options.sendEmail ?? createSequenzyReminderEmailSender();
  const supabase = options.supabase ?? createServiceRoleClient();
  const dueDeliveries = await listDuePendingEmailReminderDeliveries(supabase, {
    dueAt,
    limit,
  });
  const result: ProcessDueEmailRemindersResult = {
    checked: dueDeliveries.length,
    claimed: 0,
    skipped: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const delivery of dueDeliveries) {
    const claimedDelivery = await claimPendingEmailReminderDelivery(supabase, {
      id: delivery.id,
      userId: delivery.user_id,
      dueAt,
      processingStartedAt,
    });

    if (!claimedDelivery) {
      result.skipped += 1;
      continue;
    }

    result.claimed += 1;

    const outcome = await processClaimedEmailReminder({
      supabase,
      delivery: claimedDelivery,
      sendEmail,
      processedAt: dueAt,
    });

    result[outcome] += 1;
  }

  return result;
}

async function processClaimedEmailReminder(input: {
  supabase: AppSupabaseClient;
  delivery: ReminderDelivery;
  sendEmail: ReminderEmailSender;
  processedAt: string;
}): Promise<"sent" | "failed" | "cancelled"> {
  const occurrence = await getOccurrenceById(
    input.supabase,
    input.delivery.user_id,
    input.delivery.occurrence_id,
  );

  if (!occurrence) {
    await cancelPendingReminderDeliveryById(input.supabase, {
      id: input.delivery.id,
      userId: input.delivery.user_id,
    });
    return "cancelled";
  }

  const [behavior, profile] = await Promise.all([
    getBehaviorById(input.supabase, input.delivery.user_id, occurrence.behavior_id),
    getProfileSettings(input.supabase, input.delivery.user_id),
  ]);

  if (
    !behavior ||
    !behavior.active ||
    !isCurrentExpectedEmailDelivery(input.delivery, behavior, occurrence)
  ) {
    await cancelPendingReminderDeliveryById(input.supabase, {
      id: input.delivery.id,
      userId: input.delivery.user_id,
    });
    return "cancelled";
  }

  const recipientEmail = profile?.email.trim();

  if (!recipientEmail) {
    await markReminderDeliveryFailed(input.supabase, {
      id: input.delivery.id,
      userId: input.delivery.user_id,
      error: "Profile email is missing for email reminder delivery.",
    });
    return "failed";
  }

  try {
    await input.sendEmail(
      toSequenzyReminderEmailInput({
        delivery: input.delivery,
        behavior,
        occurrence,
        recipientEmail,
      }),
    );
  } catch (error) {
    await markReminderDeliveryFailed(input.supabase, {
      id: input.delivery.id,
      userId: input.delivery.user_id,
      error: errorToMessage(error),
    });
    return "failed";
  }

  await markReminderDeliverySent(input.supabase, {
    id: input.delivery.id,
    userId: input.delivery.user_id,
    sentAt: input.processedAt,
  });
  return "sent";
}

function isCurrentExpectedEmailDelivery(
  delivery: ReminderDelivery,
  behavior: Behavior | BehaviorWithCategory,
  occurrence: Occurrence,
): boolean {
  return resolveReminderDeliveries({
    behavior: toReminderResolverBehavior(behavior, delivery.user_id),
    occurrence: toReminderResolverOccurrence(occurrence),
  }).some(
    (expectedDelivery) =>
      expectedDelivery.channel === "email" &&
      expectedDelivery.scheduledSendAt === delivery.scheduled_send_at,
  );
}

function toSequenzyReminderEmailInput(input: {
  delivery: ReminderDelivery;
  behavior: Behavior | BehaviorWithCategory;
  occurrence: Occurrence;
  recipientEmail: string;
}): SequenzyReminderEmailInput {
  return {
    to: input.recipientEmail,
    subscriberExternalId: input.behavior.user_id,
    variables: {
      BEHAVIOR_ID: input.behavior.id,
      BEHAVIOR_TITLE: input.behavior.title,
      BEHAVIOR_DESCRIPTION: input.behavior.description ?? "",
      OCCURRENCE_ID: input.occurrence.id,
      OCCURRENCE_LOCAL_DATE: input.occurrence.local_date,
      OCCURRENCE_SCHEDULED_FOR: input.occurrence.scheduled_for,
      REMINDER_SCHEDULED_SEND_AT: input.delivery.scheduled_send_at,
      SCHEDULED_TIME: input.behavior.scheduled_time,
      TIMEZONE: input.behavior.timezone,
      TIMELINE_URL: buildTimelineUrl(),
    },
  };
}

function toReminderResolverBehavior(
  behavior: Behavior | BehaviorWithCategory,
  userId: string,
): ReminderResolverBehavior {
  return {
    id: behavior.id,
    userId,
    browserReminderEnabled: behavior.browser_reminder_enabled,
    emailReminderEnabled: behavior.email_reminder_enabled,
    reminderOffsetMinutes: behavior.reminder_offset_minutes,
  };
}

function toReminderResolverOccurrence(
  occurrence: Occurrence,
): ReminderResolverOccurrence {
  return {
    id: occurrence.id,
    userId: occurrence.user_id,
    scheduledFor: occurrence.scheduled_for,
    status: normalizeOccurrenceStatus(occurrence.status),
  };
}

function toNewReminderDelivery(
  delivery: ReturnType<typeof resolveReminderDeliveries>[number],
): NewReminderDelivery {
  return {
    user_id: delivery.userId,
    occurrence_id: delivery.occurrenceId,
    channel: delivery.channel,
    scheduled_send_at: delivery.scheduledSendAt,
    status: delivery.status,
    sent_at: null,
    error: null,
  };
}

function normalizeOccurrenceStatus(value: string): OccurrenceStatus {
  if (value === "unresolved" || value === "done" || value === "not_done") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}

function normalizeProcessLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PROCESS_LIMIT;
  }

  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_PROCESS_LIMIT;
  }

  return Math.min(value, MAX_PROCESS_LIMIT);
}

function buildTimelineUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!siteUrl) {
    return "/timeline";
  }

  try {
    return new URL("/timeline", siteUrl).toString();
  } catch {
    return "/timeline";
  }
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Email reminder send failed.";
}
