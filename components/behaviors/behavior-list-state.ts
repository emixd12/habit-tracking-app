import type { BehaviorView } from "@/lib/types/behavior";

export function upsertBehaviorView(
  behaviors: BehaviorView[],
  behavior: BehaviorView,
): BehaviorView[] {
  return [...behaviors.filter((item) => item.id !== behavior.id), behavior].sort(
    compareBehaviorViews,
  );
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
