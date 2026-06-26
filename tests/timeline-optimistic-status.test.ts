import { describe, expect, it } from "vitest";

import {
  beginOptimisticStatus,
  confirmOptimisticStatus,
  EMPTY_OPTIMISTIC_STATUS_STATE,
  resolveOptimisticOccurrenceView,
  rollbackOptimisticStatus,
} from "../components/timeline/optimistic-status";
import type { TimelineOccurrenceView } from "../lib/types/timeline";

describe("Timeline optimistic status state", () => {
  it("projects an unresolved row into a pending Completed state while keeping actions mounted", () => {
    const result = resolveOptimisticOccurrenceView(
      unresolvedOccurrence(),
      beginOptimisticStatus("completed"),
    );

    expect(result.isPending).toBe(true);
    expect(result.showPrimaryStatusActions).toBe(true);
    expect(result.occurrence.status).toBe("completed");
    expect(result.occurrence.statusLabel).toBe("Completed");
    expect(result.occurrence.visualTone).toBe("completed");
    expect(result.occurrence.showDecisionActions).toBe(false);
    expect(result.occurrence.showCollapsedStatusLabel).toBe(true);
  });

  it("hides primary actions after a confirmed optimistic Not Completed status", () => {
    const result = resolveOptimisticOccurrenceView(
      unresolvedOccurrence(),
      confirmOptimisticStatus("not_completed"),
    );

    expect(result.isPending).toBe(false);
    expect(result.showPrimaryStatusActions).toBe(false);
    expect(result.occurrence.status).toBe("not_completed");
    expect(result.occurrence.statusLabel).toBe("Not Completed");
    expect(result.occurrence.visualTone).toBe("not_completed");
  });

  it("rolls back to the server occurrence view after an action error", () => {
    const result = resolveOptimisticOccurrenceView(
      unresolvedOccurrence(),
      rollbackOptimisticStatus(),
    );

    expect(result).toEqual({
      occurrence: unresolvedOccurrence(),
      isPending: false,
      showPrimaryStatusActions: true,
    });
  });

  it("leaves the server view unchanged when no optimistic state exists", () => {
    const result = resolveOptimisticOccurrenceView(
      completedOccurrence(),
      EMPTY_OPTIMISTIC_STATUS_STATE,
    );

    expect(result).toEqual({
      occurrence: completedOccurrence(),
      isPending: false,
      showPrimaryStatusActions: false,
    });
  });
});

function unresolvedOccurrence(): TimelineOccurrenceView {
  return {
    id: "occurrence-1",
    behaviorId: "behavior-1",
    title: "Write log",
    scheduledFor: "2026-06-26T13:00:00Z",
    scheduledTimeLabel: "9:00 AM",
    localDate: "2026-06-26",
    status: "unresolved",
    statusMarkedAt: null,
    statusLabel: "Unresolved",
    statusDetail: "Awaiting decision",
    expandedStatusActionLabel: "Set status",
    visualTone: "default",
    isVisibleInNeedsDecision: false,
    showDecisionActions: true,
    showCollapsedStatusLabel: false,
    description: "",
    categoryName: "Personal",
    scheduleSummary: "Daily",
    note: "",
  };
}

function completedOccurrence(): TimelineOccurrenceView {
  return {
    ...unresolvedOccurrence(),
    status: "completed",
    statusMarkedAt: "2026-06-26T13:01:00Z",
    statusLabel: "Completed",
    statusDetail: "Resolved as Completed",
    expandedStatusActionLabel: "Change status",
    visualTone: "completed",
    showDecisionActions: false,
    showCollapsedStatusLabel: true,
  };
}
