import type {
  TimelineOccurrenceView,
  TimelineStatus,
  TimelineVisualTone,
} from "@/lib/types/timeline";

export type TimelineStatusActionStatus = Extract<
  TimelineStatus,
  "completed" | "not_completed"
>;

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
  return {
    ...occurrence,
    status,
    statusLabel: statusLabel(status),
    statusDetail: statusDetail(status),
    expandedStatusActionLabel: "Change status",
    visualTone: visualTone(status),
    showDecisionActions: false,
    showCollapsedStatusLabel: true,
  };
}

function statusLabel(status: TimelineStatusActionStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "not_completed":
      return "Not Completed";
  }
}

function statusDetail(status: TimelineStatusActionStatus): string {
  switch (status) {
    case "completed":
      return "Resolved as Completed";
    case "not_completed":
      return "Resolved as Not Completed";
  }
}

function visualTone(status: TimelineStatusActionStatus): TimelineVisualTone {
  switch (status) {
    case "completed":
      return "completed";
    case "not_completed":
      return "not_completed";
  }
}
