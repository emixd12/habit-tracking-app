import { Temporal } from "@js-temporal/polyfill";

import {
  PROVIDER_CALL_TIMEOUT_MS,
  ProviderCallTimeoutError,
  runProviderCallWithTimeout,
} from "@/lib/services/provider-call-timeout";
import type { CalendarListEntry } from "@/lib/types/google-calendar";
import { validateExternalEventSnapshot } from "@cadence/core/services/external-event-validation";
import type {
  ExternalEventAvailability,
  ExternalEventField,
  ExternalEventFieldAvailability,
  ExternalEventOriginalStart,
  ExternalEventResponseStatus,
  ExternalEventRevision,
  ExternalEventSourceTimezoneFallback,
  NormalizedExternalEvent,
} from "@cadence/core/types/day-progress";
import {
  EXTERNAL_EVENT_ADAPTER_VERSION,
  EXTERNAL_EVENT_MAX_CALENDARS,
  EXTERNAL_EVENT_MAX_RANGE_DAYS,
  EXTERNAL_EVENT_SCHEMA_VERSION,
  type ExternalEventCancellationTombstone,
  type ExternalEventCapabilities,
  type ExternalEventErrorCode,
  type ExternalEventFailure,
  type ExternalEventRequestedRange,
  type ExternalEventSnapshotV1,
} from "@cadence/core/types/external-event";

const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars";
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_MAX_RETRIES = 2;
const MAX_CONFERENCE_ENTRY_POINTS = 10;
const EVENT_FIELDS = "nextPageToken,items(id,status,iCalUID,summary,description,location,htmlLink,start,end,endTimeUnspecified,transparency,updated,etag,visibility,organizer,attendees,attendeesOmitted,conferenceData,hangoutLink,recurringEventId,originalStartTime,attachments)";

export type GoogleCalendarReadCalendar = CalendarListEntry;

export type GoogleCalendarAdapterContext = Readonly<{
  calendar: GoogleCalendarReadCalendar;
  requestTimezone: string;
}>;

export type GoogleCalendarAdaptedItem =
  | Readonly<{ kind: "event"; event: NormalizedExternalEvent }>
  | Readonly<{ kind: "tombstone"; tombstone: ExternalEventCancellationTombstone }>;

export type GoogleCalendarReadError = ExternalEventFailure;

export type GoogleCalendarReadResult =
  | Readonly<{ ok: true; snapshot: ExternalEventSnapshotV1 }>
  | Readonly<{
      ok: false;
      error: GoogleCalendarReadError;
      partialSnapshot: ExternalEventSnapshotV1;
    }>;

export type GoogleCalendarFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type GoogleCalendarReadInput = Readonly<{
  accessToken: string;
  accountId: string;
  connectionGeneration: number;
  calendars: GoogleCalendarReadCalendar[];
  range: ExternalEventRequestedRange;
  fetchedAt: string;
  fetch?: GoogleCalendarFetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxPagesPerCalendar?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}>;

export type GoogleCalendarListInput = Readonly<{
  accessToken: string;
  fetch?: GoogleCalendarFetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxPages?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}>;

export class GoogleCalendarProviderError extends Error {
  constructor(public readonly failure: GoogleCalendarReadError) {
    super(failure.message);
    this.name = "GoogleCalendarProviderError";
  }
}

class GoogleCalendarItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleCalendarItemError";
  }
}

class GoogleCalendarRequestError extends Error {
  constructor(
    public readonly failure: GoogleCalendarReadError,
    public readonly pageItems: number,
  ) {
    super(failure.message);
    this.name = "GoogleCalendarRequestError";
  }
}

export async function readGoogleCalendarEvents(
  input: GoogleCalendarReadInput,
): Promise<GoogleCalendarReadResult> {
  validateReadInput(input);
  const fetcher = input.fetch ?? fetch;
  const sleep = input.sleep ?? wait;
  const random = input.random ?? Math.random;
  const maxPages = boundedInteger(input.maxPagesPerCalendar, DEFAULT_MAX_PAGES, 1, DEFAULT_MAX_PAGES);
  const maxRetries = boundedInteger(input.maxRetries, DEFAULT_MAX_RETRIES, 0, 4);
  const events = new Map<string, NormalizedExternalEvent>();
  const tombstones = new Map<string, ExternalEventCancellationTombstone>();
  const coverage: ExternalEventSnapshotV1["coverage"][number][] = [];

  for (const calendar of input.calendars) {
    let pageToken: string | null = null;
    const seenPageTokens = new Set<string>();
    let itemCount = 0;

    try {
      for (let page = 0; page < maxPages; page += 1) {
        if (pageToken && seenPageTokens.has(pageToken)) {
          throw requestError("incomplete_pagination", calendar.id, false, null, "Google Calendar repeated a page token.", itemCount);
        }
        if (pageToken) seenPageTokens.add(pageToken);
        const response = await requestPage({
          fetcher,
          accessToken: input.accessToken,
          calendar,
          range: input.range,
          pageToken,
          signal: input.signal,
          timeoutMs: input.timeoutMs,
          maxRetries,
          sleep,
          random,
        });
        const providerPage = parseProviderPage(response, calendar.id);
        itemCount += providerPage.items.length;
        for (const rawItem of providerPage.items) {
          let adapted: GoogleCalendarAdaptedItem;
          try {
            adapted = adaptGoogleCalendarItem(rawItem, {
              calendar,
              requestTimezone: input.range.timezone,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Google Calendar returned a malformed event.";
            throw requestError("malformed_provider_response", calendar.id, false, null, message, itemCount);
          }
          if (adapted.kind === "event") {
            events.set(adapted.event.id, adapted.event);
            tombstones.delete(adapted.event.id);
          } else {
            tombstones.set(adapted.tombstone.id, adapted.tombstone);
            events.delete(adapted.tombstone.id);
          }
        }
        pageToken = providerPage.nextPageToken;
        if (!pageToken) {
          coverage.push(coverageFor(calendar.id, input.range, true, itemCount));
          break;
        }
        if (page === maxPages - 1) {
          throw requestError(
            "incomplete_pagination",
            calendar.id,
            false,
            null,
            `Google Calendar exceeded the ${maxPages}-page read limit.`,
            itemCount,
          );
        }
      }
    } catch (error) {
      const requestFailure = error instanceof GoogleCalendarRequestError
        ? error
        : requestError(
            input.signal?.aborted ? "timeout" : "provider_unavailable",
            calendar.id,
            !input.signal?.aborted,
            null,
            "Google Calendar event retrieval failed.",
            itemCount,
          );
      coverage.push(coverageFor(
        calendar.id,
        input.range,
        false,
        Math.max(itemCount, requestFailure.pageItems),
      ));
      const failure = requestFailure.failure;
      const partialSnapshot = snapshot({
        input,
        completeness: "incomplete",
        coverage,
        failures: [failure],
        events: [...events.values()],
        tombstones: [...tombstones.values()],
      });
      return { ok: false, error: failure, partialSnapshot };
    }
  }

  return {
    ok: true,
    snapshot: snapshot({
      input,
      completeness: "complete",
      coverage,
      failures: [],
      events: [...events.values()],
      tombstones: [...tombstones.values()],
    }),
  };
}

export async function readGoogleCalendarCalendars(
  input: GoogleCalendarListInput,
): Promise<CalendarListEntry[]> {
  if (!input.accessToken) throw new TypeError("Google Calendar listing requires an access token.");
  const fetcher = input.fetch ?? fetch;
  const sleep = input.sleep ?? wait;
  const random = input.random ?? Math.random;
  const maxPages = boundedInteger(input.maxPages, DEFAULT_MAX_PAGES, 1, DEFAULT_MAX_PAGES);
  const maxRetries = boundedInteger(input.maxRetries, DEFAULT_MAX_RETRIES, 0, 4);
  const calendars = new Map<string, CalendarListEntry>();
  const seenPageTokens = new Set<string>();
  let pageToken: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    if (pageToken && seenPageTokens.has(pageToken)) {
      throw new GoogleCalendarProviderError(failure(
        "incomplete_pagination", null, false, null,
        "Google Calendar repeated a calendar-list page token.",
      ));
    }
    if (pageToken) seenPageTokens.add(pageToken);
    const body = await requestCalendarListPage({
      fetcher,
      accessToken: input.accessToken,
      pageToken,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      maxRetries,
      sleep,
      random,
    });
    let providerPage: Record<string, unknown>;
    try {
      providerPage = record(body, "calendarList");
      const items = providerPage.items === undefined ? [] : array(providerPage.items, "calendarList.items");
      for (let index = 0; index < items.length; index += 1) {
        const calendar = adaptGoogleCalendarListEntry(items[index], index);
        if (calendar) calendars.set(calendar.id, calendar);
      }
      pageToken = providerPage.nextPageToken === undefined
        ? null
        : requiredString(providerPage.nextPageToken, "calendarList.nextPageToken");
    } catch (error) {
      throw new GoogleCalendarProviderError(failure(
        "malformed_provider_response",
        null,
        false,
        null,
        error instanceof Error ? error.message : "Google Calendar returned a malformed calendar list.",
      ));
    }
    if (!pageToken) return [...calendars.values()].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    if (page === maxPages - 1) {
      throw new GoogleCalendarProviderError(failure(
        "incomplete_pagination", null, false, null,
        `Google Calendar exceeded the ${maxPages}-page calendar-list limit.`,
      ));
    }
  }
  throw new GoogleCalendarProviderError(failure(
    "incomplete_pagination", null, false, null,
    "Google Calendar calendar-list pagination did not complete.",
  ));
}

export function adaptGoogleCalendarItem(
  value: unknown,
  context: GoogleCalendarAdapterContext,
): GoogleCalendarAdaptedItem {
  const item = record(value, "event");
  const providerEventId = requiredString(item.id, "event.id");
  const id = normalizedId(context.calendar.id, providerEventId);
  const revision = adaptRevision(item);
  const recurrence = adaptRecurrence(item);
  const logicalInstanceId = logicalId(item, recurrence, context.calendar.id, providerEventId);

  if (item.status === "cancelled") {
    return {
      kind: "tombstone",
      tombstone: {
        id,
        providerEventId,
        logicalInstanceId,
        calendarId: context.calendar.id,
        source: "google_calendar",
        recurrence,
        revision,
      },
    };
  }

  const start = record(item.start, "event.start");
  const end = record(item.end, "event.end");
  const timed = start.dateTime !== undefined || end.dateTime !== undefined;
  const allDay = start.date !== undefined || end.date !== undefined;
  if (timed === allDay) {
    throw new GoogleCalendarItemError("event start/end must be consistently timed or all-day");
  }
  const { timezone, fallback } = sourceTimezone(start, end, context);
  const restricted = item.visibility === "private" &&
    context.calendar.accessRole !== "owner" && context.calendar.accessRole !== "writer";
  const attendeesOmitted = optionalBoolean(item.attendeesOmitted, "event.attendeesOmitted") ?? false;
  const attendees = adaptAttendees(item.attendees);
  const organizer = adaptOrganizer(item.organizer);
  const conference = adaptConference(item);
  const attachments = adaptAttachments(item.attachments);
  const sourceUrl = optionalHttpsUrl(item.htmlLink, "event.htmlLink");
  const description = item.description === undefined
    ? ""
    : sanitizeGoogleCalendarText(textString(item.description, "event.description"), 16_384, true);
  const fieldAvailability: Partial<Record<ExternalEventField, ExternalEventFieldAvailability>> = {};
  availability(fieldAvailability, "title", item.summary, restricted);
  availability(fieldAvailability, "description", item.description, restricted);
  availability(fieldAvailability, "location", item.location, restricted);
  availability(fieldAvailability, "source_url", item.htmlLink, restricted);
  availability(fieldAvailability, "organizer", item.organizer, restricted);
  availability(fieldAvailability, "attendees", item.attendees, restricted, attendeesOmitted);
  availability(fieldAvailability, "conference", item.conferenceData ?? item.hangoutLink, restricted);
  availability(fieldAvailability, "recurrence", item.recurringEventId, false);
  availability(fieldAvailability, "attachments", item.attachments, restricted);
  const detailCompleteness: NormalizedExternalEvent["detailCompleteness"] = {};
  if (attendeesOmitted) detailCompleteness.attendees = "provider_omitted";
  else if (attendees) detailCompleteness.attendees = "complete";
  else if (restricted) detailCompleteness.attendees = "restricted";
  if (conference) {
    const providerCount = conferenceProviderEntryCount(item);
    detailCompleteness.conference_entry_points = providerCount > MAX_CONFERENCE_ENTRY_POINTS
      ? "client_truncated"
      : "complete";
  } else if (restricted) detailCompleteness.conference_entry_points = "restricted";
  if (attachments) detailCompleteness.attachments = "complete";
  else if (restricted) detailCompleteness.attachments = "restricted";

  const base = {
    id,
    providerEventId,
    logicalInstanceId,
    calendarId: context.calendar.id,
    source: "google_calendar" as const,
    calendarName: context.calendar.name,
    sourceTimezone: timezone,
    sourceTimezoneFallback: fallback,
    state: eventState(item.status),
    availability: eventAvailability(item.transparency),
    currentUserResponse: currentUserResponse(attendees),
    revision,
    title: item.summary === undefined
      ? ""
      : sanitizeGoogleCalendarText(textString(item.summary, "event.summary"), 1_024, false),
    description,
    location: item.location === undefined
      ? ""
      : sanitizeGoogleCalendarText(textString(item.location, "event.location"), 2_048, false),
    sourceUrl,
    fieldAvailability,
    detailCompleteness,
    organizer,
    attendees,
    attendeesOmitted,
    conference,
    recurrence,
    attachments,
  };

  if (timed) {
    const startAt = instantString(start.dateTime, "event.start.dateTime");
    const endAt = instantString(end.dateTime, "event.end.dateTime");
    const startInstant = Temporal.Instant.from(startAt);
    const endInstant = Temporal.Instant.from(endAt);
    if (Temporal.Instant.compare(endInstant, startInstant) <= 0) {
      throw new GoogleCalendarItemError("event.end.dateTime must follow event.start.dateTime");
    }
    const endUnspecified = optionalBoolean(item.endTimeUnspecified, "event.endTimeUnspecified") ?? false;
    return {
      kind: "event",
      event: {
        ...base,
        kind: "timed",
        startAt,
        endAt,
        endUnspecified,
        duration: endUnspecified
          ? { kind: "unknown", reason: "end_unspecified" }
          : { kind: "known", seconds: startInstant.until(endInstant).total({ unit: "seconds" }) },
      },
    };
  }

  const startLocalDate = dateString(start.date, "event.start.date");
  const endLocalDate = dateString(end.date, "event.end.date");
  const days = Temporal.PlainDate.from(startLocalDate).until(Temporal.PlainDate.from(endLocalDate)).days;
  if (days <= 0) throw new GoogleCalendarItemError("event.end.date must follow event.start.date");
  return {
    kind: "event",
    event: {
      ...base,
      kind: "all_day",
      startLocalDate,
      endLocalDate,
      duration: { kind: "calendar_days", days },
    },
  };
}

export function sanitizeGoogleCalendarText(
  value: string,
  maximumLength = 16_384,
  html = true,
): string {
  let text = value;
  if (html) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(?:nbsp|#160);/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/&#(\d+);/g, (_, digits: string) => safeCodePoint(Number(digits)))
      .replace(/&#x([\da-f]+);/gi, (_, digits: string) => safeCodePoint(Number.parseInt(digits, 16)));
  }
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximumLength);
}

async function requestPage(input: Readonly<{
  fetcher: GoogleCalendarFetch;
  accessToken: string;
  calendar: GoogleCalendarReadCalendar;
  range: ExternalEventRequestedRange;
  pageToken: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries: number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
}>): Promise<unknown> {
  for (let attempt = 0; attempt <= input.maxRetries; attempt += 1) {
    let response: Response;
    const providerSignal = input.signal
      ? AbortSignal.any([
          input.signal,
          AbortSignal.timeout(input.timeoutMs ?? PROVIDER_CALL_TIMEOUT_MS),
        ])
      : undefined;
    try {
      response = await runProviderCallWithTimeout(
        (signal) => input.fetcher(providerUrl(input), {
          method: "GET",
          headers: { authorization: `Bearer ${input.accessToken}` },
          signal,
        }),
        { timeoutMs: input.timeoutMs, signal: providerSignal },
      );
    } catch (error) {
      const timedOut = error instanceof ProviderCallTimeoutError || input.signal?.aborted;
      if (attempt < input.maxRetries && !input.signal?.aborted) {
        await input.sleep(backoffMilliseconds(attempt, null, input.random), input.signal);
        continue;
      }
      throw requestError(
        timedOut ? "timeout" : "provider_unavailable",
        input.calendar.id,
        !input.signal?.aborted,
        null,
        timedOut ? "Google Calendar request timed out." : "Google Calendar request failed.",
        0,
      );
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw requestError("malformed_provider_response", input.calendar.id, false, null, "Google Calendar returned invalid JSON.", 0);
      }
    }

    const retryAfter = retryAfterSeconds(response.headers.get("retry-after"));
    const failure = httpFailure(response.status, input.calendar.id, retryAfter);
    if (failure.retryable && attempt < input.maxRetries) {
      await input.sleep(backoffMilliseconds(attempt, retryAfter, input.random), input.signal);
      continue;
    }
    throw new GoogleCalendarRequestError(failure, 0);
  }
  throw requestError("provider_unavailable", input.calendar.id, true, null, "Google Calendar retry budget ended.", 0);
}

async function requestCalendarListPage(input: Readonly<{
  fetcher: GoogleCalendarFetch;
  accessToken: string;
  pageToken: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries: number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
}>): Promise<unknown> {
  const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
  url.searchParams.set("maxResults", "250");
  url.searchParams.set("showHidden", "true");
  url.searchParams.set("minAccessRole", "reader");
  url.searchParams.set("fields", "nextPageToken,items(id,summary,timeZone,primary,selected,accessRole)");
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);

  for (let attempt = 0; attempt <= input.maxRetries; attempt += 1) {
    let response: Response;
    const providerSignal = input.signal
      ? AbortSignal.any([
          input.signal,
          AbortSignal.timeout(input.timeoutMs ?? PROVIDER_CALL_TIMEOUT_MS),
        ])
      : undefined;
    try {
      response = await runProviderCallWithTimeout(
        (signal) => input.fetcher(url, {
          method: "GET",
          headers: { authorization: `Bearer ${input.accessToken}` },
          signal,
        }),
        { timeoutMs: input.timeoutMs, signal: providerSignal },
      );
    } catch (error) {
      const timedOut = error instanceof ProviderCallTimeoutError || input.signal?.aborted;
      if (attempt < input.maxRetries && !input.signal?.aborted) {
        await input.sleep(backoffMilliseconds(attempt, null, input.random), input.signal);
        continue;
      }
      throw new GoogleCalendarProviderError(failure(
        timedOut ? "timeout" : "provider_unavailable",
        null,
        !input.signal?.aborted,
        null,
        timedOut ? "Google Calendar list request timed out." : "Google Calendar list request failed.",
      ));
    }
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new GoogleCalendarProviderError(failure(
          "malformed_provider_response", null, false, null,
          "Google Calendar returned invalid calendar-list JSON.",
        ));
      }
    }
    const retryAfter = retryAfterSeconds(response.headers.get("retry-after"));
    const readFailure = httpFailure(response.status, null, retryAfter);
    if (readFailure.retryable && attempt < input.maxRetries) {
      await input.sleep(backoffMilliseconds(attempt, retryAfter, input.random), input.signal);
      continue;
    }
    throw new GoogleCalendarProviderError(readFailure);
  }
  throw new GoogleCalendarProviderError(failure(
    "provider_unavailable", null, true, null,
    "Google Calendar calendar-list retry budget ended.",
  ));
}

function adaptGoogleCalendarListEntry(value: unknown, index: number): CalendarListEntry | null {
  const item = record(value, `calendarList.items[${index}]`);
  const accessRole = requiredString(item.accessRole, `calendarList.items[${index}].accessRole`);
  if (accessRole === "freeBusyReader" || accessRole === "none") return null;
  if (accessRole !== "reader" && accessRole !== "writer" && accessRole !== "owner") {
    throw new GoogleCalendarItemError(`calendarList.items[${index}].accessRole is unsupported`);
  }
  const id = requiredString(item.id, `calendarList.items[${index}].id`);
  if (id.length > 1_024) throw new GoogleCalendarItemError(`calendarList.items[${index}].id is too long`);
  const name = sanitizeGoogleCalendarText(
    requiredString(item.summary, `calendarList.items[${index}].summary`),
    1_024,
    false,
  );
  if (!name) throw new GoogleCalendarItemError(`calendarList.items[${index}].summary is empty`);
  const timezone = requiredString(item.timeZone, `calendarList.items[${index}].timeZone`);
  Temporal.Instant.from("2026-01-01T00:00:00Z").toZonedDateTimeISO(timezone);
  return {
    id,
    name,
    timezone,
    primary: optionalBoolean(item.primary, `calendarList.items[${index}].primary`) ?? false,
    selected: optionalBoolean(item.selected, `calendarList.items[${index}].selected`) ?? false,
    accessRole,
  };
}

function providerUrl(input: Readonly<{
  calendar: GoogleCalendarReadCalendar;
  range: ExternalEventRequestedRange;
  pageToken: string | null;
}>): URL {
  const start = Temporal.PlainDate.from(input.range.startLocalDate)
    .toZonedDateTime(input.range.timezone)
    .toInstant();
  const end = Temporal.PlainDate.from(input.range.endLocalDate)
    .add({ days: 1 })
    .toZonedDateTime(input.range.timezone)
    .toInstant();
  const url = new URL(`${GOOGLE_EVENTS_URL}/${encodeURIComponent(input.calendar.id)}/events`);
  url.searchParams.set("timeMin", start.toString());
  url.searchParams.set("timeMax", end.toString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeZone", input.range.timezone);
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("maxAttendees", "100");
  url.searchParams.set("fields", EVENT_FIELDS);
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  return url;
}

function parseProviderPage(value: unknown, calendarId: string): Readonly<{
  items: unknown[];
  nextPageToken: string | null;
}> {
  try {
    const page = record(value, "page");
    const items = page.items === undefined ? [] : array(page.items, "page.items");
    const nextPageToken = page.nextPageToken === undefined
      ? null
      : requiredString(page.nextPageToken, "page.nextPageToken");
    return { items, nextPageToken };
  } catch (error) {
    throw requestError(
      "malformed_provider_response",
      calendarId,
      false,
      null,
      error instanceof Error ? error.message : "Google Calendar returned a malformed page.",
      0,
    );
  }
}

function snapshot(input: Readonly<{
  input: GoogleCalendarReadInput;
  completeness: "complete" | "incomplete";
  coverage: ExternalEventSnapshotV1["coverage"];
  failures: ExternalEventFailure[];
  events: NormalizedExternalEvent[];
  tombstones: ExternalEventCancellationTombstone[];
}>): ExternalEventSnapshotV1 {
  const complete = input.completeness === "complete";
  return validateExternalEventSnapshot({
    schemaVersion: EXTERNAL_EVENT_SCHEMA_VERSION,
    adapterVersion: EXTERNAL_EVENT_ADAPTER_VERSION,
    accountId: input.input.accountId,
    connectionGeneration: input.input.connectionGeneration,
    source: "google_calendar",
    requestedRange: input.input.range,
    fetchedAt: input.input.fetchedAt,
    completeness: input.completeness,
    freshness: {
      state: complete ? "current" : "incomplete",
      refreshedAt: complete ? input.input.fetchedAt : null,
      label: complete ? "Calendar current" : "Calendar data incomplete",
      canAssertNoOverlap: complete,
    },
    capabilities: capabilities(complete, input.failures),
    coverage: input.coverage,
    failures: input.failures,
    events: input.events.sort(compareIdentity),
    tombstones: input.tombstones.sort(compareIdentity),
  });
}

function capabilities(
  complete: boolean,
  failures: ExternalEventFailure[],
): ExternalEventCapabilities {
  const permission = failures.some((item) => item.code === "permission_denied")
    ? "denied" as const
    : failures.some((item) => item.code === "reconnect_required")
      ? "unknown" as const
      : "granted" as const;
  const capability = {
    support: "supported" as const,
    permission,
    availability: complete ? "available" as const : "degraded" as const,
  };
  return {
    calendar_listing: capability,
    timed_events: capability,
    all_day_events: capability,
    recurrence: capability,
    details: capability,
    source_links: capability,
  };
}

function coverageFor(
  calendarId: string,
  range: ExternalEventRequestedRange,
  paginationComplete: boolean,
  itemCount: number,
): ExternalEventSnapshotV1["coverage"][number] {
  return {
    calendarId,
    startLocalDate: range.startLocalDate,
    endLocalDate: range.endLocalDate,
    paginationComplete,
    itemCount,
  };
}

function validateReadInput(input: GoogleCalendarReadInput): void {
  if (!input.accessToken || !input.accountId || !Number.isSafeInteger(input.connectionGeneration) || input.connectionGeneration < 1) {
    throw new TypeError("Google Calendar reads require a token, account, and positive connection generation.");
  }
  Temporal.Instant.from(input.fetchedAt);
  const start = Temporal.PlainDate.from(input.range.startLocalDate);
  const end = Temporal.PlainDate.from(input.range.endLocalDate);
  start.toZonedDateTime(input.range.timezone);
  if (start.until(end).days < 0 || start.until(end).days + 1 > EXTERNAL_EVENT_MAX_RANGE_DAYS) {
    throw new RangeError(`Google Calendar reads must cover 1-${EXTERNAL_EVENT_MAX_RANGE_DAYS} days.`);
  }
  if (input.calendars.length < 1 || input.calendars.length > EXTERNAL_EVENT_MAX_CALENDARS) {
    throw new RangeError(`Google Calendar reads require 1-${EXTERNAL_EVENT_MAX_CALENDARS} calendars.`);
  }
  const ids = input.calendars.map((calendar) => calendar.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new TypeError("Google Calendar IDs must be non-empty and unique.");
  }
  if (ids.length !== input.range.selectedCalendarIds.length || ids.some((id) => !input.range.selectedCalendarIds.includes(id))) {
    throw new TypeError("Google Calendar input must match the selected calendar set.");
  }
  input.calendars.forEach((calendar) => {
    if (!calendar.name || !["reader", "writer", "owner"].includes(calendar.accessRole)) {
      throw new TypeError("Google Calendar metadata is invalid or not readable.");
    }
    if (calendar.timezone) Temporal.Instant.from("2026-01-01T00:00:00Z").toZonedDateTimeISO(calendar.timezone);
  });
}

function availability(
  target: Partial<Record<ExternalEventField, ExternalEventFieldAvailability>>,
  field: ExternalEventField,
  value: unknown,
  restricted: boolean,
  omitted = false,
): void {
  if (value !== undefined && value !== null) return;
  target[field] = omitted ? "provider_omitted" : restricted ? "restricted" : "not_provided";
}

function sourceTimezone(
  start: Record<string, unknown>,
  end: Record<string, unknown>,
  context: GoogleCalendarAdapterContext,
): Readonly<{ timezone: string; fallback: ExternalEventSourceTimezoneFallback }> {
  const providerTimezone = optionalString(start.timeZone, "event.start.timeZone")
    ?? optionalString(end.timeZone, "event.end.timeZone");
  const timezone = providerTimezone ?? context.calendar.timezone ?? context.requestTimezone;
  Temporal.Instant.from("2026-01-01T00:00:00Z").toZonedDateTimeISO(timezone);
  return {
    timezone,
    fallback: providerTimezone ? "none" : context.calendar.timezone ? "calendar" : "request",
  };
}

function adaptRevision(item: Record<string, unknown>): ExternalEventRevision {
  const providerUpdatedAt = item.updated === undefined ? null : instantString(item.updated, "event.updated");
  const providerEtag = optionalString(item.etag, "event.etag");
  return {
    availability: providerUpdatedAt || providerEtag ? "available" : "unavailable",
    providerUpdatedAt,
    providerEtag,
  };
}

function adaptRecurrence(item: Record<string, unknown>): NormalizedExternalEvent["recurrence"] {
  if (item.recurringEventId === undefined) return null;
  const seriesId = requiredString(item.recurringEventId, "event.recurringEventId");
  if (item.originalStartTime === undefined || item.originalStartTime === null) return null;
  const rawOriginal = record(item.originalStartTime, "event.originalStartTime");
  let originalStart: ExternalEventOriginalStart;
  if (rawOriginal.dateTime !== undefined) {
    originalStart = { kind: "timed", startAt: instantString(rawOriginal.dateTime, "event.originalStartTime.dateTime") };
  } else if (rawOriginal.date !== undefined) {
    originalStart = { kind: "all_day", startLocalDate: dateString(rawOriginal.date, "event.originalStartTime.date") };
  } else {
    throw new GoogleCalendarItemError("event.originalStartTime requires dateTime or date");
  }
  return { seriesId, originalStart };
}

function adaptOrganizer(value: unknown): NormalizedExternalEvent["organizer"] {
  if (value === undefined || value === null) return null;
  const organizer = record(value, "event.organizer");
  return {
    displayName: nullablePlainText(organizer.displayName, "event.organizer.displayName", 512),
    email: optionalString(organizer.email, "event.organizer.email"),
    self: optionalBoolean(organizer.self, "event.organizer.self") ?? false,
  };
}

function adaptAttendees(value: unknown): NormalizedExternalEvent["attendees"] {
  if (value === undefined || value === null) return null;
  const values = array(value, "event.attendees");
  if (values.length > 100) throw new GoogleCalendarItemError("event.attendees cannot exceed 100 entries");
  return values.map((entry, index) => {
    const attendee = record(entry, `event.attendees[${index}]`);
    return {
      displayName: nullablePlainText(attendee.displayName, `event.attendees[${index}].displayName`, 512),
      email: optionalString(attendee.email, `event.attendees[${index}].email`),
      responseStatus: responseStatus(attendee.responseStatus),
      optional: optionalBoolean(attendee.optional, `event.attendees[${index}].optional`) ?? false,
      organizer: optionalBoolean(attendee.organizer, `event.attendees[${index}].organizer`) ?? false,
      self: optionalBoolean(attendee.self, `event.attendees[${index}].self`) ?? false,
    };
  });
}

function adaptConference(item: Record<string, unknown>): NormalizedExternalEvent["conference"] {
  if (item.conferenceData === undefined && item.hangoutLink === undefined) return null;
  const data = item.conferenceData === undefined ? {} : record(item.conferenceData, "event.conferenceData");
  const solution = data.conferenceSolution === undefined ? null : record(data.conferenceSolution, "event.conferenceData.conferenceSolution");
  const name = solution?.name === undefined ? null : nullablePlainText(solution.name, "event.conferenceData.conferenceSolution.name", 512);
  const rawEntries = data.entryPoints === undefined ? [] : array(data.entryPoints, "event.conferenceData.entryPoints");
  const entryPoints = rawEntries.slice(0, MAX_CONFERENCE_ENTRY_POINTS).map((value, index) => {
    const entry = record(value, `event.conferenceData.entryPoints[${index}]`);
    const type: "video" | "phone" | "sip" | "more" | "unknown" = entry.entryPointType === "video" || entry.entryPointType === "phone" || entry.entryPointType === "sip" || entry.entryPointType === "more"
      ? entry.entryPointType
      : "unknown";
    return {
      type,
      uri: conferenceUri(entry.uri, type, `event.conferenceData.entryPoints[${index}].uri`),
      label: nullablePlainText(entry.label, `event.conferenceData.entryPoints[${index}].label`, 512),
    };
  });
  if (entryPoints.length === 0 && item.hangoutLink !== undefined) {
    entryPoints.push({
      type: "video",
      uri: requiredHttpsUrl(item.hangoutLink, "event.hangoutLink"),
      label: null,
    });
  }
  const notes = data.notes === undefined
    ? null
    : sanitizeGoogleCalendarText(textString(data.notes, "event.conferenceData.notes"), 8_192, true);
  return { name, entryPoints, notes };
}

function adaptAttachments(value: unknown): NormalizedExternalEvent["attachments"] {
  if (value === undefined || value === null) return null;
  const attachments = array(value, "event.attachments");
  if (attachments.length > 25) throw new GoogleCalendarItemError("event.attachments cannot exceed 25 entries");
  return attachments.map((value, index) => {
    const attachment = record(value, `event.attachments[${index}]`);
    return {
      title: nullablePlainText(attachment.title, `event.attachments[${index}].title`, 1_024),
      mimeType: optionalString(attachment.mimeType, `event.attachments[${index}].mimeType`),
      url: requiredHttpsUrl(attachment.fileUrl, `event.attachments[${index}].fileUrl`),
    };
  });
}

function eventState(value: unknown): NormalizedExternalEvent["state"] {
  if (value === undefined || value === "confirmed") return "confirmed";
  if (value === "tentative") return "tentative";
  if (typeof value !== "string") throw new GoogleCalendarItemError("event.status must be a string");
  return "unknown";
}

function eventAvailability(value: unknown): ExternalEventAvailability {
  if (value === undefined || value === "opaque") return "busy";
  if (value === "transparent") return "free";
  if (typeof value !== "string") throw new GoogleCalendarItemError("event.transparency must be a string");
  return "unknown";
}

function currentUserResponse(attendees: NormalizedExternalEvent["attendees"]): ExternalEventResponseStatus | null {
  return attendees?.find((attendee) => attendee.self)?.responseStatus ?? null;
}

function responseStatus(value: unknown): ExternalEventResponseStatus {
  if (value === "needsAction") return "needs_action";
  if (value === "declined" || value === "tentative" || value === "accepted") return value;
  if (value !== undefined && typeof value !== "string") throw new GoogleCalendarItemError("attendee responseStatus must be a string");
  return "unknown";
}

function logicalId(
  item: Record<string, unknown>,
  recurrence: NormalizedExternalEvent["recurrence"],
  calendarId: string,
  eventId: string,
): string {
  const iCalUid = optionalString(item.iCalUID, "event.iCalUID");
  if (!iCalUid) return normalizedId(calendarId, eventId);
  const original = recurrence?.originalStart;
  const occurrence = original?.kind === "timed"
    ? original.startAt
    : original?.kind === "all_day"
      ? original.startLocalDate
      : item.start === undefined
        ? eventId
        : startIdentity(item);
  return `google_calendar/${encodeURIComponent(iCalUid)}/${encodeURIComponent(occurrence)}`;
}

function startIdentity(item: Record<string, unknown>): string {
  const start = record(item.start, "event.start");
  if (start.dateTime !== undefined) return instantString(start.dateTime, "event.start.dateTime");
  if (start.date !== undefined) return dateString(start.date, "event.start.date");
  throw new GoogleCalendarItemError("event.start requires dateTime or date");
}

function normalizedId(calendarId: string, eventId: string): string {
  return `google_calendar/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}`;
}

function conferenceProviderEntryCount(item: Record<string, unknown>): number {
  if (item.conferenceData === undefined) return item.hangoutLink === undefined ? 0 : 1;
  const data = record(item.conferenceData, "event.conferenceData");
  return data.entryPoints === undefined ? (item.hangoutLink === undefined ? 0 : 1) : array(data.entryPoints, "event.conferenceData.entryPoints").length;
}

function conferenceUri(value: unknown, type: string, path: string): string {
  const uri = requiredString(value, path);
  const protocol = type === "phone" ? "tel:" : type === "sip" ? "sip:" : "https:";
  if (!uri.startsWith(protocol)) throw new GoogleCalendarItemError(`${path} must use ${protocol}`);
  if (protocol === "https:") requiredHttpsUrl(uri, path);
  return uri;
}

function requiredHttpsUrl(value: unknown, path: string): string {
  const text = requiredString(value, path);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new GoogleCalendarItemError(`${path} must be a valid HTTPS URL`);
  }
}

function optionalHttpsUrl(value: unknown, path: string): string | null {
  return value === undefined || value === null ? null : requiredHttpsUrl(value, path);
}

function instantString(value: unknown, path: string): string {
  try {
    return Temporal.Instant.from(requiredString(value, path)).toString();
  } catch (error) {
    if (error instanceof GoogleCalendarItemError) throw error;
    throw new GoogleCalendarItemError(`${path} must be a valid instant`);
  }
}

function dateString(value: unknown, path: string): string {
  try {
    const source = requiredString(value, path);
    const parsed = Temporal.PlainDate.from(source).toString();
    if (parsed !== source) throw new Error();
    return parsed;
  } catch (error) {
    if (error instanceof GoogleCalendarItemError) throw error;
    throw new GoogleCalendarItemError(`${path} must be a valid date`);
  }
}

function nullablePlainText(value: unknown, path: string, maximumLength: number): string | null {
  return value === undefined || value === null
    ? null
    : sanitizeGoogleCalendarText(textString(value, path), maximumLength, false);
}

function optionalString(value: unknown, path: string): string | null {
  return value === undefined || value === null ? null : requiredString(value, path);
}

function textString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new GoogleCalendarItemError(`${path} must be a string`);
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new GoogleCalendarItemError(`${path} must be a non-empty string`);
  return value;
}

function optionalBoolean(value: unknown, path: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new GoogleCalendarItemError(`${path} must be a boolean`);
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GoogleCalendarItemError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new GoogleCalendarItemError(`${path} must be an array`);
  return value;
}

function compareIdentity(
  left: { calendarId: string; providerEventId: string },
  right: { calendarId: string; providerEventId: string },
): number {
  return left.calendarId.localeCompare(right.calendarId) || left.providerEventId.localeCompare(right.providerEventId);
}

function httpFailure(status: number, calendarId: string | null, retryAfter: number | null): GoogleCalendarReadError {
  if (status === 401) return failure("reconnect_required", calendarId, false, null, "Google Calendar requires reconnection.");
  if (status === 403 || status === 429) return failure("rate_limited", calendarId, true, retryAfter, "Google Calendar rate limited the read.");
  if (status >= 500) return failure("provider_unavailable", calendarId, true, retryAfter, "Google Calendar is unavailable.");
  if (status === 400) return failure("invalid_request", calendarId, false, null, "Google Calendar rejected the bounded read.");
  return failure("permission_denied", calendarId, false, null, "Google Calendar denied the read.");
}

function requestError(
  code: ExternalEventErrorCode,
  calendarId: string | null,
  retryable: boolean,
  retryAfterSeconds: number | null,
  message: string,
  pageItems: number,
): GoogleCalendarRequestError {
  return new GoogleCalendarRequestError(failure(code, calendarId, retryable, retryAfterSeconds, message), pageItems);
}

function failure(
  code: ExternalEventErrorCode,
  calendarId: string | null,
  retryable: boolean,
  retryAfterSeconds: number | null,
  message: string,
): GoogleCalendarReadError {
  return { code, calendarId, retryable, retryAfterSeconds, message };
}

function retryAfterSeconds(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Math.min(Number(value), 300);
}

function backoffMilliseconds(attempt: number, retryAfter: number | null, random: () => number): number {
  if (retryAfter !== null) return retryAfter * 1_000;
  return Math.min(5_000, 250 * (2 ** attempt) + Math.floor(random() * 100));
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`Value must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function safeCodePoint(value: number): string {
  try {
    return value > 0 && value <= 0x10FFFF ? String.fromCodePoint(value) : "";
  } catch {
    return "";
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}
