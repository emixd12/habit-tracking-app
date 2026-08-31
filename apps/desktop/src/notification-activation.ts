import type { Temporal } from "@js-temporal/polyfill";
import type { BehaviorGraphRecord } from "@cadence/core/behavior-store";
import type { TimelineOccurrenceView } from "@cadence/core/types/timeline";
import { resolvePersistedTimelineOccurrence } from "@cadence/core/services/timeline.service";
import type { NativeEvent } from "./native-spike";
import { localCommand } from "./local-store";
import { toTimeSession } from "./local-occurrence.service";

export type NotificationTarget = { requestKey: number } & (
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "available"; occurrence: TimelineOccurrenceView }
);

export function notificationOccurrenceId(id: unknown): string | null {
  if (typeof id !== "string" || !id.startsWith("cadence.local.")) return null;
  const occurrenceId = id.slice("cadence.local.".length);
  return occurrenceId.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(occurrenceId)
    ? occurrenceId.toLowerCase() : null;
}

export function latestNotificationOccurrenceId(events: NativeEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== "notificationActivated") continue;
    const id = notificationOccurrenceId(event.id);
    if (id) return id;
  }
  return null;
}

export async function loadNotificationOccurrence(input: {
  occurrenceId: string;
  profile: { id: string; timezone: string };
  behaviors: BehaviorGraphRecord[];
  now: Temporal.Instant;
}): Promise<TimelineOccurrenceView | null> {
  // Do not constrain this direct lookup to the feed, reminder horizon, or active Behaviors.
  const occurrence = await localCommand("readOccurrence", {
    profileId: input.profile.id, occurrenceId: input.occurrenceId,
  });
  if (!occurrence) return null;
  const behavior = input.behaviors.find((row) => row.id === occurrence.behavior_id);
  if (!behavior) return null;
  const history = await localCommand("readOccurrenceHistory", {
    profileId: input.profile.id, occurrenceIds: [occurrence.id],
  });
  return resolvePersistedTimelineOccurrence({
    occurrence, behavior, timeSessions: history.timeSessions.map(toTimeSession),
    now: input.now, timezone: input.profile.timezone,
  });
}
