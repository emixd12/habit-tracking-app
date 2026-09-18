import type { NormalizedExternalEvent } from "../types/day-progress";
import type {
  ExternalEventSchedulingFact,
  ExternalEventSchedulingProjection,
  ExternalEventSnapshotV1,
} from "../types/external-event";
import { validateExternalEventSnapshot } from "./external-event-validation";

export function projectExternalEventSchedulingFacts(
  value: ExternalEventSnapshotV1 | unknown,
): ExternalEventSchedulingProjection {
  const snapshot = validateExternalEventSnapshot(value);
  const events = snapshot.events.map(projectExternalEventSchedulingEvent);

  return {
    schemaVersion: snapshot.schemaVersion,
    accountId: snapshot.accountId,
    requestedRange: snapshot.requestedRange,
    completeness: snapshot.completeness,
    freshness: snapshot.freshness,
    coverage: snapshot.coverage,
    events,
    tombstones: snapshot.tombstones,
  };
}

export function projectExternalEventSchedulingEvent(event: NormalizedExternalEvent): ExternalEventSchedulingFact {
  return {
    id: event.id,
    providerEventId: event.providerEventId,
    logicalInstanceId: event.logicalInstanceId,
    calendarId: event.calendarId,
    interval: event.kind === "timed"
      ? {
          kind: "timed",
          startAt: event.startAt,
          endAt: event.endAt,
          duration: event.duration,
        }
      : {
          kind: "all_day",
          startLocalDate: event.startLocalDate,
          endLocalDate: event.endLocalDate,
          duration: event.duration,
        },
    sourceTimezone: event.sourceTimezone,
    sourceTimezoneFallback: event.sourceTimezoneFallback,
    state: event.state,
    availability: event.availability,
    currentUserResponse: event.currentUserResponse,
    recurrence: event.recurrence,
    revision: event.revision,
  };
}
