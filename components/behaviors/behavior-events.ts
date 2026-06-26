"use client";

import type { BehaviorView } from "@/lib/types/behavior";

export const BEHAVIOR_CREATED_EVENT = "cadence:behavior-created";

type BehaviorCreatedEventDetail = {
  behavior: BehaviorView;
};

export type BehaviorCreatedEvent = CustomEvent<BehaviorCreatedEventDetail>;

export function dispatchBehaviorCreated(behavior: BehaviorView): void {
  window.dispatchEvent(
    new CustomEvent<BehaviorCreatedEventDetail>(BEHAVIOR_CREATED_EVENT, {
      detail: { behavior },
    }),
  );
}

export function isBehaviorCreatedEvent(
  event: Event,
): event is BehaviorCreatedEvent {
  return (
    event.type === BEHAVIOR_CREATED_EVENT &&
    "detail" in event &&
    isBehaviorView((event as CustomEvent<unknown>).detail)
  );
}

function isBehaviorView(value: unknown): value is BehaviorCreatedEventDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const detail = value as Partial<BehaviorCreatedEventDetail>;

  return typeof detail.behavior?.id === "string";
}
