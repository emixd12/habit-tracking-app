import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(), calendar: vi.fn(), events: vi.fn(), quota: vi.fn(),
  occurrences: vi.fn(), behaviors: vi.fn(), timezone: vi.fn(), geocode: vi.fn(), route: vi.fn(),
  historySessions: vi.fn(),
}));

vi.mock("@/lib/services/travel-settings.service", () => ({ readTravelRouteSource: mocks.source }));
vi.mock("@/lib/services/google-calendar.service", () => ({ getCalendarConnection: mocks.calendar, getCalendarEvents: mocks.events }));
vi.mock("@/lib/db/travelRouteQuota.repo", () => ({ consumeTravelRouteQuota: mocks.quota }));
vi.mock("@/lib/db/occurrences.repo", () => ({ listOccurrencesBetweenLocalDates: mocks.occurrences }));
vi.mock("@/lib/db/timeSessions.repo", () => ({ listTimeSessionHistory: mocks.historySessions }));
vi.mock("@/lib/db/behaviors.repo", () => ({ listUserBehaviors: mocks.behaviors, getProfileTimezone: mocks.timezone }));
vi.mock("@/lib/services/travel-provider", async (load) => ({
  ...(await load<typeof import("@/lib/services/travel-provider")>()),
  geocodeGoogleAddress: mocks.geocode,
}));
vi.mock("@/lib/services/travel-routing.service", async (load) => ({
  ...(await load<typeof import("@/lib/services/travel-routing.service")>()),
  routeTravelLegs: mocks.route,
}));

import { refreshTravelRoutes, setBaseGeocodeReuseForTest } from "@/lib/services/travel-route-refresh.service";

const now = Temporal.Instant.from("2026-09-22T08:00:00Z");
const source = {
  settings: { enabled: true, mode: "walking" as const, routingConsentAt: "2026-09-20T00:00:00Z", baseLocationText: "1 Base St", navigationPreference: "google_maps" as const },
  settingsRevision: "settings-1", behaviors: [
    { id: "behavior-1", locationText: "2 Habit St", updatedAt: "2026-09-20T00:00:00Z" },
    { id: "behavior-2", locationText: null, updatedAt: "2026-09-20T00:00:00Z" },
  ],
};

describe("refreshTravelRoutes", () => {
  beforeEach(() => vi.clearAllMocks());
  it("bounds a full source window to 19 geocodes with no retries", async () => {
    const behaviors = Array.from({ length: 9 }, (_, index) => ({ id: `b${index}`, locationText: `${index} Test St`, updatedAt: "revision" }));
    mocks.source.mockResolvedValue({ ...source, behaviors });
    mocks.calendar.mockResolvedValue({ status: "connected", generation: 1, selectionRevision: 1 });
    mocks.events.mockResolvedValue({ requestedRange: { timezone: "America/New_York" }, events: Array.from({ length: 9 }, (_, index) => ({
      id: `event${index}`, kind: "timed", state: "confirmed", currentUserResponse: "accepted",
      startAt: "2026-09-22T10:00:00Z", endAt: "2026-09-22T10:30:00Z",
      endUnspecified: false, location: `${index} Calendar St`, conference: null,
      revision: { providerEtag: `revision${index}`, providerUpdatedAt: null },
    })) });
    mocks.quota.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.behaviors.mockResolvedValue(behaviors.map(({ id }) => ({ id, default_duration_minutes: 30 })));
    mocks.historySessions.mockResolvedValue([]);
    mocks.occurrences.mockResolvedValue(behaviors.map(({ id }) => ({
      id: `o${id}`, behavior_id: id, local_date: "2026-09-22", scheduled_for: "2026-09-22T11:00:00Z",
      schedule_kind: "exact", schedule_end_time: null, updated_at: "revision", status: "unresolved",
    })));
    mocks.geocode.mockResolvedValue({ kind: "resolved", point: { kind: "place_id", placeId: "place" } });
    mocks.route.mockResolvedValue([]);

    await refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never },
      { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22" }, { cleared: true, apiKey: "key" }, now);

    expect(mocks.geocode).toHaveBeenCalledTimes(19);
    for (const [, options] of mocks.geocode.mock.calls) expect(options.maxRetries).toBe(0);
    expect(mocks.quota).toHaveBeenCalledOnce();
    expect(mocks.quota.mock.invocationCallOrder[0]).toBeLessThan(mocks.geocode.mock.invocationCallOrder[0]!);
  });

  const located = () => {
    mocks.calendar.mockResolvedValue({ status: "disconnected", generation: 0, selectionRevision: 0 });
    mocks.timezone.mockResolvedValue("America/New_York");
    mocks.historySessions.mockResolvedValue([]);
    mocks.behaviors.mockResolvedValue([{ id: "behavior-1", default_duration_minutes: 30 }]);
    mocks.occurrences.mockImplementation(async (_client: unknown, _userId: unknown, start: string) => start === "2026-09-22"
      ? [{ id: "occurrence-1", behavior_id: "behavior-1", local_date: "2026-09-22", scheduled_for: "2026-09-22T10:00:00Z", schedule_kind: "exact", schedule_end_time: null, updated_at: "2026-09-20T00:00:00Z", status: "unresolved" }]
      : []);
    mocks.geocode.mockResolvedValue({ kind: "resolved", point: { kind: "place_id", placeId: "place" } });
    mocks.route.mockResolvedValue([]);
  };

  it("does not consume quota or call the provider when nothing is geocodable", async () => {
    located();
    mocks.source.mockResolvedValue({ ...source, settings: { ...source.settings, baseLocationText: null }, behaviors: [{ id: "behavior-1", locationText: null, updatedAt: "2026-09-20T00:00:00Z" }] });
    const result = await refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never },
      { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22" }, { cleared: true, apiKey: "key" }, now);
    expect(result.evidence).not.toBeNull();
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.route).not.toHaveBeenCalled();
  });

  it("consumes exactly one admission across multiple geocodes", async () => {
    located();
    mocks.source.mockResolvedValue(source);
    mocks.quota.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    await refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never },
      { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22" }, { cleared: true, apiKey: "key" }, now);
    expect(mocks.geocode).toHaveBeenCalledTimes(2);
    expect(mocks.quota).toHaveBeenCalledOnce();
    expect(mocks.route.mock.calls[0]?.[0].quotaAlreadyConsumed).toBe(true);
  });

  it("makes no provider call when the initial allowance is exhausted", async () => {
    located();
    mocks.source.mockResolvedValue(source);
    mocks.quota.mockResolvedValue({ allowed: false, retryAfterSeconds: 86400 });
    await expect(refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never },
      { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22" }, { cleared: true, apiKey: "key" }, now))
      .rejects.toMatchObject({ failure: { code: "quota_exceeded" } });
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.route).not.toHaveBeenCalled();
  });

  it("keeps inbound travel when a located exact Behavior has no known duration", async () => {
    mocks.source.mockResolvedValue(source);
    mocks.calendar.mockResolvedValue({ status: "disconnected", generation: 0, selectionRevision: 0 });
    mocks.quota.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.timezone.mockResolvedValue("America/New_York");
    mocks.historySessions.mockResolvedValue([]);
    mocks.behaviors.mockResolvedValue([{ id: "behavior-1", default_duration_minutes: null }]);
    mocks.occurrences.mockResolvedValue([
      { id: "occurrence-1", behavior_id: "behavior-1", local_date: "2026-09-22", scheduled_for: "2026-09-22T10:00:00Z", schedule_kind: "exact", schedule_end_time: null, updated_at: "2026-09-20T00:00:00Z", status: "unresolved" },
    ]);
    mocks.geocode.mockResolvedValue({ kind: "resolved", point: { kind: "place_id", placeId: "place" } });
    mocks.route.mockImplementation(async ({ routes }: { routes: { id: string }[] }) => routes.map((route) => ({ id: route.id, estimate: { durationSeconds: 600, departureAt: "2026-09-22T09:50:00Z", arrivalAt: "2026-09-22T10:00:00Z", warnings: [], fallback: false, attribution: "Google Maps", observedAt: now.toString(), expiresAt: "2026-09-22T08:05:00Z" }, failure: null })));

    const result = await refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never }, { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22" }, { cleared: true, apiKey: "key" }, now);

    expect(result.evidence?.legs).toHaveLength(1);
    expect(result.evidence?.legs[0]?.leg).toMatchObject({ role: "outbound", destinationCommitmentRef: "occurrence-1" });
    expect(result.evidence?.completeTrip).toBe(false);
    expect(result.evidence?.finalAvailabilityAt).toBeNull();
  });

  it("routes a known-duration Behavior without a Calendar connection and returns its occurrence ref", async () => {
    mocks.source.mockResolvedValue(source);
    mocks.calendar.mockResolvedValue({ status: "disconnected", generation: 0, selectionRevision: 0 });
    mocks.quota.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.timezone.mockResolvedValue("America/New_York");
    mocks.historySessions.mockResolvedValue([]);
    mocks.behaviors.mockResolvedValue([{ id: "behavior-1", default_duration_minutes: 30 }, { id: "behavior-2", default_duration_minutes: 30 }]);
    mocks.occurrences.mockResolvedValue([
      { id: "occurrence-1", behavior_id: "behavior-1", local_date: "2026-09-22", scheduled_for: "2026-09-22T10:00:00Z", schedule_kind: "exact", schedule_end_time: null, updated_at: "2026-09-20T00:00:00Z", status: "unresolved" },
      { id: "occurrence-2", behavior_id: "behavior-2", local_date: "2026-09-22", scheduled_for: "2026-09-22T09:55:00Z", schedule_kind: "exact", schedule_end_time: null, updated_at: "2026-09-20T00:00:00Z", status: "unresolved" },
    ]);
    mocks.geocode.mockResolvedValue({ kind: "resolved", point: { kind: "place_id", placeId: "place" } });
    mocks.route.mockImplementation(async ({ routes }: { routes: { id: string }[] }) => routes.map((route) => ({ id: route.id, estimate: { durationSeconds: 600, departureAt: "2026-09-22T09:50:00Z", arrivalAt: "2026-09-22T10:00:00Z", warnings: [], fallback: false, attribution: "Google Maps", observedAt: now.toString(), expiresAt: "2026-09-22T08:05:00Z" }, failure: null })));

    const result = await refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never }, { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22", device: { latitude: 40, longitude: -74, accuracyMeters: 10, sampledAt: "2026-09-22T08:00:00Z" } }, { cleared: true, apiKey: "key" }, now);

    expect(result.accountId).toBe("owner");
    expect(result.evidence).not.toBeNull();
    if (!result.evidence) throw new Error("Expected travel evidence.");
    expect(result.evidence.legs[0]?.leg.destinationCommitmentRef).toBe("occurrence-1");
    expect(result.evidence.collisions.some((collision) => collision.candidateRef === "occurrence-2")).toBe(true);
    expect(mocks.geocode).toHaveBeenCalledTimes(2);
    expect(mocks.events).not.toHaveBeenCalled();
  });

  it("uses completed stopped-session history when no Behavior default duration exists", async () => {
    mocks.source.mockResolvedValue(source);
    mocks.calendar.mockResolvedValue({ status: "disconnected", generation: 0, selectionRevision: 0 });
    mocks.quota.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.timezone.mockResolvedValue("America/New_York");
    mocks.behaviors.mockResolvedValue([{ id: "behavior-1", default_duration_minutes: null }, { id: "behavior-2", default_duration_minutes: null }]);
    mocks.occurrences.mockImplementation(async (_client: unknown, _userId: unknown, start: string) => start === "2026-06-24"
      ? ["a", "b", "c"].map((id, index) => ({ id, behavior_id: "behavior-1", local_date: `2026-0${7 + index}-01`, scheduled_for: `2026-0${7 + index}-01T10:00:00Z`, schedule_kind: "exact", schedule_end_time: null, updated_at: "2026-09-01T00:00:00Z", status: "completed" }))
      : [{ id: "occurrence-1", behavior_id: "behavior-1", local_date: "2026-09-22", scheduled_for: "2026-09-22T10:00:00Z", schedule_kind: "exact", schedule_end_time: null, updated_at: "2026-09-20T00:00:00Z", status: "unresolved" }]);
    mocks.historySessions.mockResolvedValue(["a", "b", "c"].map((occurrenceId, index) => ({ id: `s${index}`, user_id: "owner", occurrence_id: occurrenceId, behavior_id: "behavior-1", started_at: `2026-0${7 + index}-01T10:00:00Z`, stopped_at: `2026-0${7 + index}-01T10:10:00Z` })));
    mocks.geocode.mockResolvedValue({ kind: "resolved", point: { kind: "place_id", placeId: "place" } });
    mocks.route.mockImplementation(async ({ routes }: { routes: { id: string }[] }) => routes.map((route) => ({ id: route.id, estimate: { durationSeconds: 600, departureAt: "2026-09-22T09:50:00Z", arrivalAt: "2026-09-22T10:00:00Z", warnings: [], fallback: false, attribution: "Google Maps", observedAt: now.toString(), expiresAt: "2026-09-22T08:05:00Z" }, failure: null })));

    await refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never }, { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22", device: { latitude: 40, longitude: -74, accuracyMeters: 10, sampledAt: "2026-09-22T08:00:00Z" } }, { cleared: true, apiKey: "key" }, now);

    expect(mocks.route.mock.calls.at(-1)![0].routes.some((route: { request: { timing: { at: string } } }) => route.request.timing.at === "2026-09-22T10:10:00Z")).toBe(true);
  });

  describe("saved base geocode reuse", () => {
    const baseCalls = () => mocks.geocode.mock.calls.filter(([text]) => text === "1 Base St").length;
    const run = () => refreshTravelRoutes({ client: {} as never, user: { id: "owner" } as never },
      { startLocalDate: "2026-09-22", endLocalDate: "2026-09-22" }, { cleared: true, apiKey: "key" }, now);

    it("geocodes the base on every refresh while reuse is disabled", async () => {
      setBaseGeocodeReuseForTest(false);
      located();
      mocks.source.mockResolvedValue(source);
      mocks.quota.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
      await run(); await run();
      expect(baseCalls()).toBe(2);
      expect(mocks.geocode).toHaveBeenCalledTimes(4);
    });

    it("skips admission and geocode on a reuse hit when enabled", async () => {
      setBaseGeocodeReuseForTest(true);
      try {
        located();
        mocks.source.mockResolvedValue(source);
        mocks.quota.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
        await run();
        expect(baseCalls()).toBe(1);
        await run();
        expect(baseCalls()).toBe(1);
        expect(mocks.geocode).toHaveBeenCalledTimes(3);
      } finally { setBaseGeocodeReuseForTest(false); }
    });
  });
});
