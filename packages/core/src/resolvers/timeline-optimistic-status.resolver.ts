import type {
  TimelineOccurrenceView,
  TimelineStatus,
  TimelineVisualTone,
} from "../types/timeline";

export type TimelineStatusActionStatus = TimelineStatus;

export type OptimisticTimelineStatusState = Readonly<{
  pendingStatus: TimelineStatusActionStatus | null;
  confirmedStatus: TimelineStatusActionStatus | null;
}>;

export type OptimisticOccurrenceViewState = Readonly<{
  occurrence: TimelineOccurrenceView;
  isPending: boolean;
  showPrimaryStatusActions: boolean;
}>;

export const EMPTY_OPTIMISTIC_STATUS_STATE: OptimisticTimelineStatusState = {
  pendingStatus: null,
  confirmedStatus: null,
};

export function beginOptimisticStatus(
  nextStatus: TimelineStatusActionStatus,
): OptimisticTimelineStatusState {
  return {
    pendingStatus: nextStatus,
    confirmedStatus: null,
  };
}

export function confirmOptimisticStatus(
  nextStatus: TimelineStatusActionStatus | null,
): OptimisticTimelineStatusState {
  return {
    pendingStatus: null,
    confirmedStatus: nextStatus,
  };
}

export function rollbackOptimisticStatus(): OptimisticTimelineStatusState {
  return EMPTY_OPTIMISTIC_STATUS_STATE;
}

export function resolveOptimisticOccurrenceView(
  occurrence: TimelineOccurrenceView,
  state: OptimisticTimelineStatusState,
): OptimisticOccurrenceViewState {
  const optimisticStatus = state.pendingStatus ?? state.confirmedStatus;
  const isPending = Boolean(state.pendingStatus);

  if (!optimisticStatus) {
    return {
      occurrence,
      isPending,
      showPrimaryStatusActions: occurrence.showDecisionActions,
    };
  }

  const optimisticOccurrence = projectOccurrenceStatus(
    occurrence,
    optimisticStatus,
  );

  return {
    occurrence: optimisticOccurrence,
    isPending,
    showPrimaryStatusActions: isPending
      ? occurrence.showDecisionActions
      : optimisticOccurrence.showDecisionActions,
  };
}

function projectOccurrenceStatus(
  occurrence: TimelineOccurrenceView,
  status: TimelineStatusActionStatus,
): TimelineOccurrenceView {
  const isUnresolved = status === "unresolved";

  return {
    ...occurrence,
    status,
    statusLabel: statusLabel(status),
    statusDetail: statusDetail(status),
    expandedStatusActionLabel: isUnresolved ? "Set status" : "Change status",
    visualTone: visualTone(status, occurrence),
    showDecisionActions:
      isUnresolved && occurrence.canShowDecisionActionsWhenUnresolved,
    showCollapsedStatusLabel: !isUnresolved,
  };
}

function statusLabel(status: TimelineStatusActionStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "not_completed":
      return "Not Completed";
    case "unresolved":
      return "Unresolved";
  }
}

function statusDetail(status: TimelineStatusActionStatus): string {
  switch (status) {
    case "completed":
      return "Resolved as Completed";
    case "not_completed":
      return "Resolved as Not Completed";
    case "unresolved":
      return "Awaiting decision";
  }
}

function visualTone(
  status: TimelineStatusActionStatus,
  occurrence: TimelineOccurrenceView,
): TimelineVisualTone {
  switch (status) {
    case "completed":
      return "completed";
    case "not_completed":
      return "not_completed";
    case "unresolved":
      return occurrence.isVisibleInNeedsDecision ? "needs_decision" : "default";
  }
}
