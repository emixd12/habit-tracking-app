import { Temporal } from "@js-temporal/polyfill";

import type { OccurrenceStatus } from "@/lib/types/database";

export type StatusResolverOccurrence = {
  status: OccurrenceStatus;
  completedAt: string | null;
  statusMarkedAt: string | null;
  note: string | null;
};

export type ResolveStatusTransitionInput = {
  occurrence: StatusResolverOccurrence;
  nextStatus: OccurrenceStatus;
  now: Temporal.Instant;
};

export type OccurrenceStatusUpdatePlan = {
  status: OccurrenceStatus;
  completedAt: string | null;
  statusMarkedAt: string | null;
};

export type ResolveNoteUpdateInput = {
  note: string;
};

export type OccurrenceNoteUpdatePlan = {
  note: string | null;
};

export function resolveStatusTransition(
  input: ResolveStatusTransitionInput,
): OccurrenceStatusUpdatePlan {
  if (input.nextStatus === "unresolved") {
    return {
      status: "unresolved",
      completedAt: null,
      statusMarkedAt: null,
    };
  }

  const now = input.now.toString();
  const statusChanged = input.occurrence.status !== input.nextStatus;
  const needsStatusMarkedAt =
    statusChanged || input.occurrence.statusMarkedAt === null;
  const needsCompletedAt =
    input.nextStatus === "done" &&
    (statusChanged || input.occurrence.completedAt === null);

  return {
    status: input.nextStatus,
    completedAt:
      input.nextStatus === "done"
        ? needsCompletedAt
          ? now
          : input.occurrence.completedAt
        : null,
    statusMarkedAt: needsStatusMarkedAt
      ? now
      : input.occurrence.statusMarkedAt,
  };
}

export function resolveNoteUpdate(
  input: ResolveNoteUpdateInput,
): OccurrenceNoteUpdatePlan {
  const note = input.note.replace(/\r\n/g, "\n").trim();

  return {
    note: note.length > 0 ? note : null,
  };
}
