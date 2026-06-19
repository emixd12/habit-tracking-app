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
  claimPendingBrowserPushReminderDelivery,
  claimPendingEmailReminderDelivery,
  createMissingReminderDeliveries,
  listDuePendingBrowserPushReminderDeliveries,
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
  deactivatePushSubscriptionById,
  listActivePushSubscriptionsForUser,
} from "@/lib/db/pushSubscriptions.repo";
import {
  resolveReminderDeliveries,
  resolveReminderDeliveryCancellation,
  type ReminderResolverBehavior,
  type ReminderResolverOccurrence,
} from "@/lib/resolvers/reminder.resolver";
import { formatOccurrenceScheduleLabel } from "@/lib/services/schedule";
import {
  createSequenzyReminderEmailSender,
  type SequenzyReminderEmailInput,
} from "@/lib/services/sequenzy.service";
import {
  BrowserPushConfigurationError,
  BrowserPushSubscriptionExpiredError,
  createWebPushReminderSender,
  type BrowserPushReminderPayload,
  type BrowserPushReminderSender,
} from "@/lib/services/web-push.service";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type {
  Behavior,
  NewReminderDelivery,
  Occurrence,
  OccurrenceStatus,
  PushSubscription,
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

export type ProcessDueRemindersOptions = ProcessDueEmailRemindersOptions & {
  sendBrowserPush?: BrowserPushReminderSender;
};

export type ProcessDueRemindersResult = {
  checked: number;
  claimed: number;
  skipped: number;
  sent: number;
  failed: number;
  cancelled: number;
};

export type ProcessDueEmailRemindersResult = ProcessDueRemindersResult;

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

export async function processDueReminders(
  options: ProcessDueRemindersOptions = {},
): Promise<ProcessDueRemindersResult> {
  const now = options.now ?? Temporal.Now.instant();
  const supabase = options.supabase ?? createServiceRoleClient();
  const emailResult = await processDueEmailReminders({
    ...options,
    now,
    supabase,
  });
  const browserPushResult = await processDueBrowserPushReminders({
    ...options,
    now,
    supabase,
  });

  return mergeProcessResults(emailResult, browserPushResult);
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

export async function processDueBrowserPushReminders(
  options: ProcessDueRemindersOptions = {},
): Promise<ProcessDueRemindersResult> {
  const now = options.now ?? Temporal.Now.instant();
  const dueAt = now.toString();
  const processingStartedAt = dueAt;
  const limit = normalizeProcessLimit(options.limit);
  const supabase = options.supabase ?? createServiceRoleClient();
  const dueDeliveries = await listDuePendingBrowserPushReminderDeliveries(
    supabase,
    {
      dueAt,
      limit,
    },
  );
  const result: ProcessDueRemindersResult = {
    checked: dueDeliveries.length,
    claimed: 0,
    skipped: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
  };

  if (dueDeliveries.length === 0) {
    return result;
  }

  let sendBrowserPush: BrowserPushReminderSender;

  try {
    sendBrowserPush = options.sendBrowserPush ?? createWebPushReminderSender();
  } catch (error) {
    if (!(error instanceof BrowserPushConfigurationError)) {
      throw error;
    }

    for (const delivery of dueDeliveries) {
      const claimedDelivery = await claimPendingBrowserPushReminderDelivery(
        supabase,
        {
          id: delivery.id,
          userId: delivery.user_id,
          dueAt,
          processingStartedAt,
        },
      );

      if (!claimedDelivery) {
        result.skipped += 1;
        continue;
      }

      result.claimed += 1;
      result.failed += 1;
      await markReminderDeliveryFailed(supabase, {
        id: claimedDelivery.id,
        userId: claimedDelivery.user_id,
        error: error.message,
      });
    }

    return result;
  }

  for (const delivery of dueDeliveries) {
    const claimedDelivery = await claimPendingBrowserPushReminderDelivery(
      supabase,
      {
        id: delivery.id,
        userId: delivery.user_id,
        dueAt,
        processingStartedAt,
      },
    );

    if (!claimedDelivery) {
      result.skipped += 1;
      continue;
    }

    result.claimed += 1;

    const outcome = await processClaimedBrowserPushReminder({
      supabase,
      delivery: claimedDelivery,
      sendBrowserPush,
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

async function processClaimedBrowserPushReminder(input: {
  supabase: AppSupabaseClient;
  delivery: ReminderDelivery;
  sendBrowserPush: BrowserPushReminderSender;
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

  const behavior = await getBehaviorById(
    input.supabase,
    input.delivery.user_id,
    occurrence.behavior_id,
  );

  if (
    !behavior ||
    !behavior.active ||
    !isCurrentExpectedBrowserPushDelivery(input.delivery, behavior, occurrence)
  ) {
    await cancelPendingReminderDeliveryById(input.supabase, {
      id: input.delivery.id,
      userId: input.delivery.user_id,
    });
    return "cancelled";
  }

  const subscriptions = await listActivePushSubscriptionsForUser(
    input.supabase,
    input.delivery.user_id,
  );

  if (subscriptions.length === 0) {
    await markReminderDeliveryFailed(input.supabase, {
      id: input.delivery.id,
      userId: input.delivery.user_id,
      error: "No active browser push subscription is available.",
    });
    return "failed";
  }

  const sendResult = await sendBrowserPushToSubscriptions({
    supabase: input.supabase,
    userId: input.delivery.user_id,
    subscriptions,
    sendBrowserPush: input.sendBrowserPush,
    payload: toBrowserPushReminderPayload({
      behavior,
      occurrence,
    }),
  });

  if (sendResult.sent > 0) {
    await markReminderDeliverySent(input.supabase, {
      id: input.delivery.id,
      userId: input.delivery.user_id,
      sentAt: input.processedAt,
    });
    return "sent";
  }

  await markReminderDeliveryFailed(input.supabase, {
    id: input.delivery.id,
    userId: input.delivery.user_id,
    error: sendResult.error ?? "Browser push reminder could not be sent.",
  });
  return "failed";
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
      sameInstant(expectedDelivery.scheduledSendAt, delivery.scheduled_send_at),
  );
}

function isCurrentExpectedBrowserPushDelivery(
  delivery: ReminderDelivery,
  behavior: Behavior | BehaviorWithCategory,
  occurrence: Occurrence,
): boolean {
  return resolveReminderDeliveries({
    behavior: toReminderResolverBehavior(behavior, delivery.user_id),
    occurrence: toReminderResolverOccurrence(occurrence),
  }).some(
    (expectedDelivery) =>
      expectedDelivery.channel === "browser_push" &&
      sameInstant(expectedDelivery.scheduledSendAt, delivery.scheduled_send_at),
  );
}

function sameInstant(first: string, second: string): boolean {
  try {
    return Temporal.Instant.compare(first, second) === 0;
  } catch {
    return first === second;
  }
}

async function sendBrowserPushToSubscriptions(input: {
  supabase: AppSupabaseClient;
  userId: string;
  subscriptions: PushSubscription[];
  sendBrowserPush: BrowserPushReminderSender;
  payload: BrowserPushReminderPayload;
}): Promise<{ sent: number; error: string | null }> {
  let sent = 0;
  let error: string | null = null;

  for (const subscription of input.subscriptions) {
    try {
      await input.sendBrowserPush({
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        payload: input.payload,
      });
      sent += 1;
    } catch (sendError) {
      if (sendError instanceof BrowserPushSubscriptionExpiredError) {
        await deactivatePushSubscriptionById(input.supabase, {
          userId: input.userId,
          subscriptionId: subscription.id,
        });
      }

      error = errorToMessage(sendError, "Browser push reminder could not be sent.");
    }
  }

  return {
    sent,
    error,
  };
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
      SCHEDULED_TIME: formatOccurrenceScheduleLabel({
        scheduleKind: normalizeScheduleKind(input.occurrence.schedule_kind),
        schedulePreset: normalizeSchedulePreset(input.occurrence.schedule_preset),
        scheduleStartTime: input.occurrence.schedule_start_time,
        scheduleEndTime: input.occurrence.schedule_end_time,
      }),
      TIMEZONE: input.behavior.timezone,
      TIMELINE_URL: buildTimelineUrl(),
    },
  };
}

function toBrowserPushReminderPayload(input: {
  behavior: Behavior | BehaviorWithCategory;
  occurrence: Occurrence;
}): BrowserPushReminderPayload {
  const scheduleLabel = formatOccurrenceScheduleLabel({
    scheduleKind: normalizeScheduleKind(input.occurrence.schedule_kind),
    schedulePreset: normalizeSchedulePreset(input.occurrence.schedule_preset),
    scheduleStartTime: input.occurrence.schedule_start_time,
    scheduleEndTime: input.occurrence.schedule_end_time,
  });

  return {
    title: "Behavior reminder",
    body: `${input.behavior.title} is scheduled for ${scheduleLabel}.`,
    tag: `cadence-reminder-${input.occurrence.id}`,
    url: buildTimelineUrl(),
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
  if (value === "unresolved" || value === "completed" || value === "not_completed") {
    return value;
  }

  throw new Error(`Unsupported occurrence status: ${value}.`);
}

function normalizeScheduleKind(value: string): "exact" | "range" {
  if (value === "exact" || value === "range") {
    return value;
  }

  throw new Error(`Unsupported schedule kind: ${value}.`);
}

function normalizeSchedulePreset(
  value: string | null,
): "morning" | "afternoon" | "evening" | "night" | null {
  if (
    value === null ||
    value === "morning" ||
    value === "afternoon" ||
    value === "evening" ||
    value === "night"
  ) {
    return value;
  }

  throw new Error(`Unsupported schedule preset: ${value}.`);
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

function mergeProcessResults(
  first: ProcessDueRemindersResult,
  second: ProcessDueRemindersResult,
): ProcessDueRemindersResult {
  return {
    checked: first.checked + second.checked,
    claimed: first.claimed + second.claimed,
    skipped: first.skipped + second.skipped,
    sent: first.sent + second.sent,
    failed: first.failed + second.failed,
    cancelled: first.cancelled + second.cancelled,
  };
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

function errorToMessage(
  error: unknown,
  fallback = "Email reminder send failed.",
): string {
  return error instanceof Error ? error.message : fallback;
}
