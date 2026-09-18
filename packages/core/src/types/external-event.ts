import type {
  ExternalEventAvailability,
  ExternalEventFreshness,
  ExternalEventOriginalStart,
  ExternalEventResponseStatus,
  ExternalEventRevision,
  ExternalEventState,
  NormalizedExternalEvent,
} from "./day-progress";

export const EXTERNAL_EVENT_SCHEMA_VERSION = "1.0.0" as const;
export const EXTERNAL_EVENT_ADAPTER_VERSION = "google-calendar-v1" as const;
export const EXTERNAL_EVENT_MAX_CALENDARS = 32;
export const EXTERNAL_EVENT_MAX_RANGE_DAYS = 31;

export const EXTERNAL_EVENT_CAPABILITIES = [
  "calendar_listing",
  "timed_events",
  "all_day_events",
  "recurrence",
  "details",
  "source_links",
] as const;

export type ExternalEventCapabilityName =
  (typeof EXTERNAL_EVENT_CAPABILITIES)[number];

export type ExternalEventCapability = Readonly<{
  support: "supported" | "unsupported" | "unknown";
  permission: "granted" | "denied" | "unknown";
  availability: "available" | "degraded" | "unavailable" | "unknown";
}>;

export type ExternalEventCapabilities = Readonly<
  Record<ExternalEventCapabilityName, ExternalEventCapability>
>;

export type ExternalEventRequestedRange = Readonly<{
  startLocalDate: string;
  endLocalDate: string;
  timezone: string;
  selectedCalendarIds: string[];
}>;

export type ExternalEventCoverage = Readonly<{
  calendarId: string;
  startLocalDate: string;
  endLocalDate: string;
  paginationComplete: boolean;
  itemCount: number;
}>;

export type ExternalEventErrorCode =
  | "unauthenticated"
  | "not_connected"
  | "permission_denied"
  | "wrong_account"
  | "reconnect_required"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "malformed_provider_response"
  | "incomplete_pagination"
  | "invalid_request"
  | "unsupported_schema_version";

export type ExternalEventFailure = Readonly<{
  code: ExternalEventErrorCode;
  calendarId: string | null;
  retryable: boolean;
  retryAfterSeconds: number | null;
  message: string;
}>;

export type ExternalEventCancellationTombstone = Readonly<{
  id: string;
  providerEventId: string;
  logicalInstanceId: string;
  calendarId: string;
  source: "google_calendar";
  recurrence: Readonly<{
    seriesId: string;
    originalStart: ExternalEventOriginalStart;
  }> | null;
  revision: ExternalEventRevision;
}>;

export type ExternalEventSnapshotV1 = Readonly<{
  schemaVersion: typeof EXTERNAL_EVENT_SCHEMA_VERSION;
  adapterVersion: typeof EXTERNAL_EVENT_ADAPTER_VERSION;
  accountId: string;
  connectionGeneration: number;
  source: "google_calendar";
  requestedRange: ExternalEventRequestedRange;
  fetchedAt: string;
  completeness: "complete" | "incomplete";
  freshness: ExternalEventFreshness;
  capabilities: ExternalEventCapabilities;
  coverage: ExternalEventCoverage[];
  failures: ExternalEventFailure[];
  events: NormalizedExternalEvent[];
  tombstones: ExternalEventCancellationTombstone[];
}>;

export type ExternalEventSchedulingFact = Readonly<{
  id: string;
  providerEventId: string;
  logicalInstanceId: string;
  calendarId: string;
  interval:
    | Readonly<{
        kind: "timed";
        startAt: string;
        endAt: string;
        duration:
          | Readonly<{ kind: "known"; seconds: number }>
          | Readonly<{ kind: "unknown"; reason: "end_unspecified" }>;
      }>
    | Readonly<{
        kind: "all_day";
        startLocalDate: string;
        endLocalDate: string;
        duration: Readonly<{ kind: "calendar_days"; days: number }>;
      }>;
  sourceTimezone: string;
  sourceTimezoneFallback: "none" | "calendar" | "request";
  state: ExternalEventState;
  availability: ExternalEventAvailability;
  currentUserResponse: ExternalEventResponseStatus | null;
  recurrence: Readonly<{
    seriesId: string;
    originalStart: ExternalEventOriginalStart;
  }> | null;
  revision: ExternalEventRevision;
}>;

export type ExternalEventSchedulingProjection = Readonly<{
  schemaVersion: typeof EXTERNAL_EVENT_SCHEMA_VERSION;
  accountId: string;
  requestedRange: ExternalEventRequestedRange;
  completeness: "complete" | "incomplete";
  freshness: ExternalEventFreshness;
  coverage: ExternalEventCoverage[];
  events: ExternalEventSchedulingFact[];
  tombstones: ExternalEventCancellationTombstone[];
}>;
