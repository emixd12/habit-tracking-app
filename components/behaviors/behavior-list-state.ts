import type { BehaviorView } from "@/lib/types/behavior";

export function upsertBehaviorView(
  behaviors: BehaviorView[],
  behavior: BehaviorView,
): BehaviorView[] {
  return [...behaviors.filter((item) => item.id !== behavior.id), behavior].sort(
    compareBehaviorViews,
  );
}

export function reconcileCreatedBehaviorViews(
  createdBehaviorRows: BehaviorView[],
  activeBehaviors: readonly BehaviorView[],
  archivedBehaviors: readonly BehaviorView[],
): BehaviorView[] {
  if (createdBehaviorRows.length === 0) {
    return createdBehaviorRows;
  }

  const serverBehaviorIds = new Set([
    ...activeBehaviors.map((behavior) => behavior.id),
    ...archivedBehaviors.map((behavior) => behavior.id),
  ]);
  const pendingCreatedRows = createdBehaviorRows.filter(
    (behavior) => !serverBehaviorIds.has(behavior.id),
  );

  return pendingCreatedRows.length === createdBehaviorRows.length
    ? createdBehaviorRows
    : pendingCreatedRows;
}

export function removeBehaviorView(
  behaviors: BehaviorView[],
  behaviorId: string,
): BehaviorView[] {
  return behaviors.filter((behavior) => behavior.id !== behaviorId);
}

function compareBehaviorViews(left: BehaviorView, right: BehaviorView): number {
  const timeComparison = left.scheduledTime.localeCompare(right.scheduledTime);

  if (timeComparison !== 0) {
    return timeComparison;
  }

  const titleComparison = left.title.localeCompare(right.title);

  if (titleComparison !== 0) {
    return titleComparison;
  }

  return left.id.localeCompare(right.id);
}
