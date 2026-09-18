import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { ProviderCallTimeoutError } from "../lib/services/provider-call-timeout";
import {
  adaptGoogleCalendarItem,
  GoogleCalendarProviderError,
  readGoogleCalendarCalendars,
  readGoogleCalendarEvents,
  sanitizeGoogleCalendarText,
  type GoogleCalendarFetch,
  type GoogleCalendarReadInput,
} from "../lib/services/google-calendar-provider";

const firstPageUrl = new URL("./fixtures/google-calendar/events-page-1.json", import.meta.url);
const secondPageUrl = new URL("./fixtures/google-calendar/events-page-2.json", import.meta.url);

describe("Google Calendar provider adapter", () => {
  it("accepts empty presentation strings without treating coverage as incomplete", () => {
    expect(adaptGoogleCalendarItem({ id: "empty-details", summary: "", description: "", location: "",
      start: { dateTime: "2026-09-16T10:00:00Z" }, end: { dateTime: "2026-09-16T11:00:00Z" } }, {
      calendar: { id: "work", name: "Work", timezone: "UTC", primary: true, selected: true, accessRole: "owner" },
      requestTimezone: "UTC",
    })).toMatchObject({ kind: "event", event: { title: "", description: "", location: "" } });
  });

  it("lists every readable calendar page with strict normalized metadata", async () => {
    const fetcher: GoogleCalendarFetch = vi.fn(async (request, init) => {
      const url = new URL(request.toString());
      expect(init?.headers).toEqual({ authorization: "Bearer calendar-token" });
      expect(url.searchParams.get("showHidden")).toBe("true");
      expect(url.searchParams.get("minAccessRole")).toBe("reader");
      if (!url.searchParams.has("pageToken")) {
        return Response.json({
          nextPageToken: "second",
          items: [
            { id: "work", summary: "Work", timeZone: "America/New_York", primary: true, selected: true, accessRole: "owner" },
            { id: "busy-only", summary: "Busy only", timeZone: "UTC", accessRole: "freeBusyReader" },
          ],
        });
      }
      return Response.json({
        items: [
          { id: "home", summary: "Home", timeZone: "UTC", accessRole: "reader" },
        ],
      });
    });

    await expect(readGoogleCalendarCalendars({
      accessToken: "calendar-token",
      fetch: fetcher,
    })).resolves.toEqual([
      { id: "home", name: "Home", timezone: "UTC", primary: false, selected: false, accessRole: "reader" },
      { id: "work", name: "Work", timezone: "America/New_York", primary: true, selected: true, accessRole: "owner" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed calendar metadata with a typed provider error", async () => {
    const promise = readGoogleCalendarCalendars({
      accessToken: "calendar-token",
      fetch: async () => Response.json({
        items: [{ id: "bad", summary: "Bad", timeZone: "not-a-zone", accessRole: "reader" }],
      }),
    });

    await expect(promise).rejects.toBeInstanceOf(GoogleCalendarProviderError);
    await expect(promise).rejects.toMatchObject({
      failure: { code: "malformed_provider_response", retryable: false },
    });
  });

  it("reads bounded pages into a complete safe snapshot with recurrence and tombstones", async () => {
    const [firstPage, secondPage] = await Promise.all([
      fixture(firstPageUrl),
      fixture(secondPageUrl),
    ]);
    const requests: URL[] = [];
    const fetcher: GoogleCalendarFetch = vi.fn(async (request, init) => {
      const url = new URL(request.toString());
      requests.push(url);
      expect(init?.headers).toEqual({ authorization: "Bearer secret-token" });
      return Response.json(url.searchParams.get("pageToken") ? secondPage : firstPage);
    });

    const result = await readGoogleCalendarEvents(readInput(fetcher));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requests).toHaveLength(2);
    expect(requests[0]?.searchParams.get("timeMin")).toBe("2026-11-01T04:00:00Z");
    expect(requests[0]?.searchParams.get("timeMax")).toBe("2026-11-04T05:00:00Z");
    expect(requests[0]?.searchParams.get("showDeleted")).toBe("true");
    expect(requests[0]?.searchParams.get("singleEvents")).toBe("true");
    expect(result.snapshot).toMatchObject({
      completeness: "complete",
      freshness: { state: "current", canAssertNoOverlap: true },
      coverage: [{ paginationComplete: true, itemCount: 4 }],
    });
    expect(JSON.stringify(result.snapshot)).not.toContain("secret-token");

    const moved = result.snapshot.events.find((event) => event.providerEventId === "moved-dst-instance")!;
    expect(moved).toMatchObject({
      sourceTimezone: "America/New_York",
      sourceTimezoneFallback: "none",
      availability: "busy",
      currentUserResponse: "tentative",
      description: "Review & notes",
      recurrence: {
        seriesId: "series-1",
        originalStart: { kind: "timed", startAt: "2026-11-01T05:00:00Z" },
      },
      duration: { kind: "known", seconds: 3_600 },
    });
    expect(moved.description).not.toContain("ignore");
    expect(result.snapshot.events.find((event) => event.providerEventId === "all-day-two-days"))
      .toMatchObject({ availability: "free", duration: { kind: "calendar_days", days: 2 } });
    expect(result.snapshot.events.find((event) => event.providerEventId === "unknown-end"))
      .toMatchObject({ duration: { kind: "unknown", reason: "end_unspecified" } });
    expect(result.snapshot.tombstones).toEqual([
      expect.objectContaining({
        providerEventId: "cancelled-instance",
        recurrence: {
          seriesId: "series-2",
          originalStart: { kind: "timed", startAt: "2026-11-02T16:00:00Z" },
        },
      }),
    ]);
  });

  it("returns an honest incomplete snapshot when pagination exceeds its bound", async () => {
    const firstPage = await fixture(firstPageUrl);
    const result = await readGoogleCalendarEvents({
      ...readInput(async () => Response.json(firstPage)),
      maxPagesPerCalendar: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("incomplete_pagination");
    expect(result.partialSnapshot).toMatchObject({
      completeness: "incomplete",
      freshness: { state: "incomplete", canAssertNoOverlap: false },
      coverage: [{ paginationComplete: false, itemCount: 2 }],
    });
    expect(result.partialSnapshot.events).toHaveLength(2);
  });

  it("quarantines malformed event links instead of claiming a complete empty calendar", async () => {
    const result = await readGoogleCalendarEvents(readInput(async () => Response.json({
      items: [{
        id: "bad-link",
        status: "confirmed",
        htmlLink: "javascript:alert(1)",
        start: { dateTime: "2026-11-01T12:00:00Z" },
        end: { dateTime: "2026-11-01T13:00:00Z" },
      }],
    })));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("malformed_provider_response");
    expect(result.partialSnapshot.events).toEqual([]);
    expect(result.partialSnapshot.coverage[0]?.paginationComplete).toBe(false);
  });

  it("bounds rate-limit retries and honors Retry-After", async () => {
    const sleeps: number[] = [];
    const fetcher = vi.fn<GoogleCalendarFetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    const result = await readGoogleCalendarEvents({
      ...readInput(fetcher),
      maxRetries: 1,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    });

    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2_000]);
  });

  it("retains partial coverage facts when a later page stays rate limited", async () => {
    const firstPage = await fixture(firstPageUrl);
    const fetcher = vi.fn<GoogleCalendarFetch>()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const result = await readGoogleCalendarEvents({
      ...readInput(fetcher),
      maxRetries: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("rate_limited");
    expect(result.partialSnapshot).toMatchObject({
      completeness: "incomplete",
      freshness: { refreshedAt: null, canAssertNoOverlap: false },
      coverage: [{ paginationComplete: false, itemCount: 2 }],
    });
    expect(result.partialSnapshot.events).toHaveLength(2);
  });

  it("reports an exhausted provider timeout without claiming empty coverage", async () => {
    const result = await readGoogleCalendarEvents({
      ...readInput(async () => { throw new ProviderCallTimeoutError(1); }),
      maxRetries: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("timeout");
    expect(result.partialSnapshot.coverage).toEqual([
      expect.objectContaining({ paginationComplete: false, itemCount: 0 }),
    ]);
  });

  it("sanitizes provider HTML and handles an identity-only cancellation", () => {
    expect(sanitizeGoogleCalendarText("<p>Hello&nbsp;world</p><style>bad</style>", 100, true))
      .toBe("Hello world");
    expect(adaptGoogleCalendarItem({ id: "deleted", status: "cancelled" }, {
      calendar: {
        id: "calendar-1",
        name: "Work",
        timezone: "UTC",
        primary: false,
        selected: true,
        accessRole: "reader",
      },
      requestTimezone: "UTC",
    })).toMatchObject({
      kind: "tombstone",
      tombstone: {
        providerEventId: "deleted",
        recurrence: null,
        revision: { availability: "unavailable" },
      },
    });
  });
});

function readInput(fetcher: GoogleCalendarFetch): GoogleCalendarReadInput {
  return {
    accessToken: "secret-token",
    accountId: "account-1",
    connectionGeneration: 1,
    calendars: [{
      id: "calendar-1",
      name: "Work",
      timezone: "America/New_York",
      primary: true,
      selected: true,
      accessRole: "reader",
    }],
    range: {
      startLocalDate: "2026-11-01",
      endLocalDate: "2026-11-03",
      timezone: "America/New_York",
      selectedCalendarIds: ["calendar-1"],
    },
    fetchedAt: "2026-11-01T13:00:00Z",
    fetch: fetcher,
  };
}

async function fixture(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, "utf8"));
}
