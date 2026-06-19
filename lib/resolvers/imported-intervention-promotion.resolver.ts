import { Temporal } from "@js-temporal/polyfill";

import {
  resolveReminderDeliveries,
  type ReminderResolverBehavior,
  type ReminderResolverOccurrence,
} from "@/lib/resolvers/reminder.resolver";
import type {
  ReminderChannel,
  ReminderDeliveryStatus,
} from "@/lib/types/database";

export type ImportedInterventionPromotionBehavior = ReminderResolverBehavior & {
  active: boolean;
};

export type ImportedInterventionPromotionOccurrence =
  ReminderResolverOccurrence & {
    behaviorId: string;
  };

export type ImportedInterventionPromotionRecord = {
  id: string;
  userId: string;
  importRunId: string;
  behaviorId: string | null;
  occurrenceId: string | null;
  interventionType: string | null;
  channel: string;
  deliveryStatus: string;
  scheduledSendAt: string;
  sourceConfidence: string;
};

export type ExistingReminderDeliveryForPromotion = {
  id: string;
  userId: string;
  occurrenceId: string;
  channel: string;
  scheduledSendAt: string;
  status: string;
  processingStartedAt: string | null;
  importedInterventionId: string | null;
};

export type ImportedInterventionPromotionCandidate = {
  importedIntervention: ImportedInterventionPromotionRecord;
  behavior: ImportedInterventionPromotionBehavior | null;
  occurrence: ImportedInterventionPromotionOccurrence | null;
};

export type ImportedInterventionPromotionIneligibleReason =
  | "selection_required"
  | "confirmation_required"
  | "imported_intervention_not_found"
  | "unresolved_parent"
  | "cross_user_parent"
  | "not_reminder"
  | "not_pending_status"
  | "ambiguous_source"
  | "invalid_scheduled_send_at"
  | "historical"
  | "resolved_occurrence"
  | "inactive_behavior"
  | "disabled_channel"
  | "mismatched_current_reminder_settings"
  | "duplicate_selection"
  | "existing_delivery_not_pending"
  | "existing_delivery_claimed"
  | "existing_delivery_has_different_import_source";

export type ImportedInterventionPromotionDecision =
  | {
      importedInterventionId: string;
      eligible: true;
      reason: null;
      reminderDeliveryKey: string;
      existingReminderDeliveryId: string | null;
    }
  | {
      importedInterventionId: string;
      eligible: false;
      reason: ImportedInterventionPromotionIneligibleReason;
      reminderDeliveryKey: string | null;
      existingReminderDeliveryId: string | null;
    };

export type ImportedInterventionPromotionPlan = {
  userId: string;
  occurrenceId: string;
  channel: ReminderChannel;
  scheduledSendAt: string;
  status: Extract<ReminderDeliveryStatus, "pending">;
  importRunId: string;
  importedInterventionId: string;
  existingReminderDeliveryId: string | null;
};

export type ImportedInterventionPromotionResult = {
  confirmed: boolean;
  selectedImportedInterventionIds: string[];
  decisions: ImportedInterventionPromotionDecision[];
  deliveryPlans: ImportedInterventionPromotionPlan[];
};

export function resolveImportedInterventionPromotion(input: {
  now: Temporal.Instant;
  selectedImportedInterventionIds: string[];
  confirmPromotion: boolean;
  candidates: ImportedInterventionPromotionCandidate[];
  existingReminderDeliveries?: ExistingReminderDeliveryForPromotion[];
}): ImportedInterventionPromotionResult {
  const selectedIds = normalizeSelectedIds(input.selectedImportedInterventionIds);

  if (selectedIds.length === 0) {
    return {
      confirmed: input.confirmPromotion,
      selectedImportedInterventionIds: [],
      decisions: [
        ineligibleDecision({
          importedInterventionId: "",
          reason: "selection_required",
        }),
      ],
      deliveryPlans: [],
    };
  }

  const candidatesById = new Map(
    input.candidates.map((candidate) => [
      candidate.importedIntervention.id,
      candidate,
    ]),
  );
  const existingDeliveriesByKey = new Map(
    (input.existingReminderDeliveries ?? []).map((delivery) => [
      reminderDeliveryKey({
        occurrenceId: delivery.occurrenceId,
        channel: delivery.channel,
        scheduledSendAt: normalizeInstantString(delivery.scheduledSendAt),
      }),
      delivery,
    ]),
  );
  const plannedKeys = new Set<string>();
  const decisions: ImportedInterventionPromotionDecision[] = [];
  const deliveryPlans: ImportedInterventionPromotionPlan[] = [];

  for (const selectedId of selectedIds) {
    const candidate = candidatesById.get(selectedId);

    if (!candidate) {
      decisions.push(
        ineligibleDecision({
          importedInterventionId: selectedId,
          reason: "imported_intervention_not_found",
        }),
      );
      continue;
    }

    if (!input.confirmPromotion) {
      decisions.push(
        ineligibleDecision({
          importedInterventionId: selectedId,
          reason: "confirmation_required",
        }),
      );
      continue;
    }

    const decision = resolveCandidatePromotion({
      candidate,
      now: input.now,
      existingDeliveriesByKey,
      plannedKeys,
    });
    decisions.push(decision.decision);

    if (decision.plan) {
      deliveryPlans.push(decision.plan);
    }
  }

  return {
    confirmed: input.confirmPromotion,
    selectedImportedInterventionIds: selectedIds,
    decisions,
    deliveryPlans,
  };
}

function resolveCandidatePromotion(input: {
  candidate: ImportedInterventionPromotionCandidate;
  now: Temporal.Instant;
  existingDeliveriesByKey: Map<string, ExistingReminderDeliveryForPromotion>;
  plannedKeys: Set<string>;
}): {
  decision: ImportedInterventionPromotionDecision;
  plan: ImportedInterventionPromotionPlan | null;
} {
  const importedIntervention = input.candidate.importedIntervention;
  const behavior = input.candidate.behavior;
  const occurrence = input.candidate.occurrence;

  if (!isReminderIntervention(importedIntervention.interventionType)) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "not_reminder",
      }),
      plan: null,
    };
  }

  if (importedIntervention.deliveryStatus !== "pending") {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "not_pending_status",
      }),
      plan: null,
    };
  }

  if (isAmbiguousSource(importedIntervention.sourceConfidence)) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "ambiguous_source",
      }),
      plan: null,
    };
  }

  let scheduledSendAt: Temporal.Instant;

  try {
    scheduledSendAt = Temporal.Instant.from(importedIntervention.scheduledSendAt);
  } catch {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "invalid_scheduled_send_at",
      }),
      plan: null,
    };
  }

  if (Temporal.Instant.compare(scheduledSendAt, input.now) <= 0) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "historical",
      }),
      plan: null,
    };
  }

  const normalizedScheduledSendAt = scheduledSendAt.toString();

  if (!behavior || !occurrence) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "unresolved_parent",
      }),
      plan: null,
    };
  }

  if (
    behavior.userId !== importedIntervention.userId ||
    occurrence.userId !== importedIntervention.userId ||
    behavior.id !== importedIntervention.behaviorId ||
    occurrence.id !== importedIntervention.occurrenceId ||
    occurrence.behaviorId !== behavior.id
  ) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "cross_user_parent",
      }),
      plan: null,
    };
  }

  if (occurrence.status !== "unresolved") {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "resolved_occurrence",
      }),
      plan: null,
    };
  }

  if (!behavior.active) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "inactive_behavior",
      }),
      plan: null,
    };
  }

  if (!isReminderChannel(importedIntervention.channel)) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "disabled_channel",
      }),
      plan: null,
    };
  }

  if (isChannelDisabled(importedIntervention.channel, behavior)) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "disabled_channel",
      }),
      plan: null,
    };
  }

  const expectedDelivery = resolveReminderDeliveries({
    behavior,
    occurrence,
  }).find(
    (delivery) =>
      delivery.channel === importedIntervention.channel &&
      delivery.scheduledSendAt === normalizedScheduledSendAt,
  );

  if (!expectedDelivery) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "mismatched_current_reminder_settings",
      }),
      plan: null,
    };
  }

  const key = reminderDeliveryKey({
    occurrenceId: expectedDelivery.occurrenceId,
    channel: expectedDelivery.channel,
    scheduledSendAt: expectedDelivery.scheduledSendAt,
  });

  if (input.plannedKeys.has(key)) {
    return {
      decision: ineligibleDecision({
        importedInterventionId: importedIntervention.id,
        reason: "duplicate_selection",
        reminderDeliveryKey: key,
      }),
      plan: null,
    };
  }

  const existingDelivery = input.existingDeliveriesByKey.get(key);

  if (existingDelivery) {
    if (existingDelivery.status !== "pending") {
      return {
        decision: ineligibleDecision({
          importedInterventionId: importedIntervention.id,
          reason: "existing_delivery_not_pending",
          reminderDeliveryKey: key,
          existingReminderDeliveryId: existingDelivery.id,
        }),
        plan: null,
      };
    }

    if (existingDelivery.processingStartedAt) {
      return {
        decision: ineligibleDecision({
          importedInterventionId: importedIntervention.id,
          reason: "existing_delivery_claimed",
          reminderDeliveryKey: key,
          existingReminderDeliveryId: existingDelivery.id,
        }),
        plan: null,
      };
    }

    if (
      existingDelivery.importedInterventionId &&
      existingDelivery.importedInterventionId !== importedIntervention.id
    ) {
      return {
        decision: ineligibleDecision({
          importedInterventionId: importedIntervention.id,
          reason: "existing_delivery_has_different_import_source",
          reminderDeliveryKey: key,
          existingReminderDeliveryId: existingDelivery.id,
        }),
        plan: null,
      };
    }
  }

  input.plannedKeys.add(key);

  const plan = {
    userId: expectedDelivery.userId,
    occurrenceId: expectedDelivery.occurrenceId,
    channel: expectedDelivery.channel,
    scheduledSendAt: expectedDelivery.scheduledSendAt,
    status: expectedDelivery.status,
    importRunId: importedIntervention.importRunId,
    importedInterventionId: importedIntervention.id,
    existingReminderDeliveryId: existingDelivery?.id ?? null,
  } satisfies ImportedInterventionPromotionPlan;

  return {
    decision: {
      importedInterventionId: importedIntervention.id,
      eligible: true,
      reason: null,
      reminderDeliveryKey: key,
      existingReminderDeliveryId: existingDelivery?.id ?? null,
    },
    plan,
  };
}

function normalizeSelectedIds(ids: string[]): string[] {
  return Array.from(
    new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
}

function isReminderIntervention(value: string | null): boolean {
  return value?.trim().toLowerCase() === "reminder";
}

function isAmbiguousSource(value: string): boolean {
  return value === "ambiguous" || value === "unknown";
}

function isReminderChannel(value: string): value is ReminderChannel {
  return value === "browser_push" || value === "email";
}

function isChannelDisabled(
  channel: ReminderChannel,
  behavior: ImportedInterventionPromotionBehavior,
): boolean {
  if (channel === "browser_push") {
    return !behavior.browserReminderEnabled;
  }

  return !behavior.emailReminderEnabled;
}

function reminderDeliveryKey(input: {
  occurrenceId: string;
  channel: string;
  scheduledSendAt: string;
}): string {
  return `${input.occurrenceId}:${input.channel}:${input.scheduledSendAt}`;
}

function normalizeInstantString(value: string): string {
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    return value;
  }
}

function ineligibleDecision(input: {
  importedInterventionId: string;
  reason: ImportedInterventionPromotionIneligibleReason;
  reminderDeliveryKey?: string | null;
  existingReminderDeliveryId?: string | null;
}): ImportedInterventionPromotionDecision {
  return {
    importedInterventionId: input.importedInterventionId,
    eligible: false,
    reason: input.reason,
    reminderDeliveryKey: input.reminderDeliveryKey ?? null,
    existingReminderDeliveryId: input.existingReminderDeliveryId ?? null,
  };
}
