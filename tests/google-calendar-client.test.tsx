// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reloadWebTimelineConnectors, useWebGoogleCalendarTimeline, webGoogleCalendarCoordinator, type CalendarEventRange } from "@/lib/ui/google-calendar";

const range: CalendarEventRange = { startLocalDate: "2026-09-16", endLocalDate: "2026-09-17" };

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function connection(accountId = "web-cache-account", generation = 4) {
  return { accountId, status: "connected", generation, selectionRevision: 9,
    preferences: { selectedCalendarIds: ["primary"], hiddenCalendarIds: [], visible: true, showAllDay: true } };
}

function snapshot(overrides: Partial<ReturnType<typeof connection>> & Readonly<{ range?: CalendarEventRange }> = {}) {
  const capability = { support: "supported", permission: "granted", availability: "available" } as const;
  const requestRange = overrides.range ?? range;
  return {
    schemaVersion: "1.0.0", adapterVersion: "google-calendar-v1", accountId: overrides.accountId ?? "web-cache-account", connectionGeneration: overrides.generation ?? 4, source: "google_calendar",
    requestedRange: { startLocalDate: requestRange.startLocalDate, endLocalDate: requestRange.endLocalDate, timezone: requestRange.timezone ?? "America/New_York", selectedCalendarIds: ["primary"] },
    fetchedAt: "2099-09-16T14:00:00Z", completeness: "complete",
    freshness: { state: "current", refreshedAt: "2099-09-16T14:00:00Z", label: "Calendar current", canAssertNoOverlap: true },
    capabilities: { calendar_listing: capability, timed_events: capability, all_day_events: capability, recurrence: capability, details: capability, source_links: capability },
    coverage: [{ calendarId: "primary", startLocalDate: requestRange.startLocalDate, endLocalDate: requestRange.endLocalDate, paginationComplete: true, itemCount: 0 }],
    failures: [], events: [], tombstones: [],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("web Google Calendar coordinator", () => {
  it("coalesces matching event requests and validates the response before caching", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      return response(path.startsWith("/api/google-calendar/connection") ? connection() : snapshot());
    });
    vi.stubGlobal("fetch", fetcher);

    const [first, second] = await Promise.all([
      webGoogleCalendarCoordinator.refreshEvents(range),
      webGoogleCalendarCoordinator.refreshEvents(range),
    ]);

    expect(first).toEqual(second);
    expect(fetcher.mock.calls.filter(([input]) => String(input).startsWith("/api/google-calendar/events"))).toHaveLength(1);
  });

  it("does not reuse an old generation or timezone cache entry", async () => {
    const accountId = "web-generation-account";
    let generation = 1;
    let timezone = "America/New_York";
    const requestRange: CalendarEventRange = { ...range, timezone };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      return response(path.startsWith("/api/google-calendar/connection")
        ? connection(accountId, generation)
        : snapshot({ accountId, generation, range: { ...requestRange, timezone } }));
    });
    vi.stubGlobal("fetch", fetcher);

    await webGoogleCalendarCoordinator.refreshEvents(requestRange);
    generation = 2;
    await webGoogleCalendarCoordinator.refreshEvents(requestRange);
    timezone = "America/Chicago";
    await webGoogleCalendarCoordinator.refreshEvents({ ...requestRange, timezone });

    expect(fetcher.mock.calls.filter(([input]) => String(input).startsWith("/api/google-calendar/events"))).toHaveLength(3);
  });

  it("ignores a late range response after the visible Timeline changes range", async () => {
    let root: Root | null = null;
    const container = document.createElement("div");
    document.body.append(container);
    let releaseFirst!: () => void;
    const first = new Promise<Response>((resolve) => { releaseFirst = () => resolve(response(snapshot({ accountId: "web-range-race", generation: 1, range }))); });
    const secondRange: CalendarEventRange = { startLocalDate: "2026-09-18", endLocalDate: "2026-09-19", timezone: "America/New_York" };
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith("/api/google-calendar/connection")) return Promise.resolve(response(connection("web-range-race", 1)));
      return path.includes("start=2026-09-16")
        ? first
        : Promise.resolve(response(snapshot({ accountId: "web-range-race", generation: 1, range: secondRange })));
    });
    vi.stubGlobal("fetch", fetcher);
    const View = ({ dates }: Readonly<{ dates: readonly string[] }>) => {
      const state = useWebGoogleCalendarTimeline({ enabled: true, localDates: dates, timezone: "America/New_York" });
      return <output>{state.snapshot?.requestedRange.startLocalDate ?? "pending"}</output>;
    };
    root = createRoot(container);
    await act(async () => { root.render(<View dates={[range.startLocalDate, range.endLocalDate]} />); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await vi.waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input).includes("start=2026-09-16"))).toBe(true));
    await act(async () => { root!.render(<View dates={[secondRange.startLocalDate, secondRange.endLocalDate]} />); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await vi.waitFor(() => expect(container.textContent).toBe(secondRange.startLocalDate));
    await act(async () => { releaseFirst(); await Promise.resolve(); });
    expect(container.textContent).toBe(secondRange.startLocalDate);
    await act(() => root!.unmount());
    container.remove();
  });

  it("forces the mounted Timeline connector past its fresh in-memory cache", async () => {
    const accountId = "web-manual-reload";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      return response(path.startsWith("/api/google-calendar/connection")
        ? connection(accountId)
        : snapshot({ accountId }));
    });
    vi.stubGlobal("fetch", fetcher);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const View = () => {
      const state = useWebGoogleCalendarTimeline({ enabled: true, localDates: [range.startLocalDate, range.endLocalDate], timezone: "America/New_York" });
      return <output>{state.state}</output>;
    };
    await act(async () => { root.render(<View />); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await vi.waitFor(() => expect(container.textContent).toBe("empty"));
    fetcher.mockClear();

    await expect(reloadWebTimelineConnectors()).resolves.toBe(true);
    expect(fetcher.mock.calls.filter(([input]) => String(input).startsWith("/api/google-calendar/events"))).toHaveLength(1);

    await act(() => root.unmount());
    container.remove();
  });

  it("does not report a reconnect-required connector as reloaded", async () => {
    const accountId = "web-reconnect-required";
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...connection(accountId), status: "reconnect_required" })));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const View = () => {
      const state = useWebGoogleCalendarTimeline({ enabled: true, localDates: [range.startLocalDate, range.endLocalDate], timezone: "America/New_York" });
      return <output>{state.state}</output>;
    };
    await act(async () => { root.render(<View />); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await vi.waitFor(() => expect(container.textContent).toBe("disconnected"));
    await expect(reloadWebTimelineConnectors()).resolves.toBe(false);
    await act(() => root.unmount());
    container.remove();
  });
});
