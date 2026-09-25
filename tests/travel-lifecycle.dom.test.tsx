// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TravelClientError, travelClientErrorFromResponse, resetTravelViewCacheForTest, useTravelContext, type TravelClient, type TravelState, type TravelRoutesView } from "@/lib/ui/travel";

const settings = { enabled: true, mode: "walking" as const, baseLocationText: null, navigationPreference: "google_maps" as const,
  routingConsentAt: "2026-09-21T12:00:00Z", onboardingCompletedAt: null, updatedAt: "revision" };
const view = (accountId: string): TravelRoutesView => ({ accountId, mode: "walking", navigationPreference: "google_maps", settingsRevision: "revision",
  expiresAt: new Date(Date.now() + 300_000).toISOString(), evidence: { version: "1.0", journeyRef: accountId,
    legs: [], segments: [], occupiedSpans: [], collisions: [], completeTrip: false, finalAvailabilityAt: null } });
const capture = vi.fn<(state: TravelState) => void>();
const latest = () => capture.mock.lastCall![0];
function Probe({ client, accountId, sourceKey = "source" }: { client: TravelClient; accountId: string; sourceKey?: string }) {
  const state = useTravelContext({ enabled: true, accountId, sourceKey, localDate: "2026-09-21", client });
  capture(state);
  return <p>{state.view?.evidence?.journeyRef ?? state.message ?? "empty"}</p>;
}
beforeEach(() => { resetTravelViewCacheForTest(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("gates device reads, shows provider review, and rejects late account responses", async () => {
  vi.useFakeTimers();
  const focused = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  const configured = vi.fn(async () => false);
  const readLocation = vi.fn(async () => ({ state: "denied" as const }));
  let resolveOld!: (value: TravelRoutesView) => void;
  const routes = vi.fn().mockImplementationOnce(() => new Promise<TravelRoutesView>((resolve) => { resolveOld = resolve; }))
    .mockImplementation(async () => view("account-b"));
  const client: TravelClient = { settings: { load: async () => settings, save: async () => settings }, configured, readLocation, routes };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(() => root.render(<Probe client={client} accountId="account-a" />));
    await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(350); });
    expect(configured).toHaveBeenCalledTimes(1);
    expect(readLocation).not.toHaveBeenCalled();
    expect(host.textContent).toContain("provider review");
    configured.mockResolvedValue(true);
    await act(async () => { latest().refresh(); await vi.advanceTimersByTimeAsync(350); });
    expect(readLocation).toHaveBeenCalledWith(false);
    await act(() => root.render(<Probe client={client} accountId="account-b" />));
    await act(async () => { resolveOld(view("account-a")); await vi.advanceTimersByTimeAsync(350); });
    expect(host.textContent).toBe("account-b");
    await act(() => root.render(<Probe client={client} accountId="account-b" sourceKey="changed" />));
    expect(host.textContent).toBe("empty");
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(host.textContent).toBe("account-b");
    await act(() => window.dispatchEvent(new Event("offline")));
    expect(host.textContent).toBe("account-b");
    focused.mockReturnValue(false);
    const readsBeforeBlur = readLocation.mock.calls.length;
    await act(() => root.render(<Probe client={client} accountId="account-b" sourceKey="background-change" />));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(readLocation).toHaveBeenCalledTimes(readsBeforeBlur);
  } finally { await act(() => root.unmount()); host.remove(); }
});

async function mount(routes: TravelClient["routes"]) {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  const client: TravelClient = { settings: { load: async () => settings, save: async () => settings },
    configured: async () => true, readLocation: async () => ({ state: "denied" as const }), routes };
  const host = document.createElement("div"); document.body.append(host);
  let root = createRoot(host);
  const render = (sourceKey = "source") => act(() => root.render(<Probe client={client} accountId="account-a" sourceKey={sourceKey} />));
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(350));
  const remount = async () => {
    await act(() => root.unmount()); root = createRoot(host);
    await render(); await act(async () => vi.advanceTimersByTimeAsync(350));
  };
  return { host, render, remount, unmount: async () => { await act(() => root.unmount()); host.remove(); } };
}
const focusAndWait = (ms = 350) => act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(ms); });

it("requests once on page load and not on focus", async () => {
  const routes = vi.fn(async () => view("account-a"));
  const { host, unmount } = await mount(routes);
  try {
    expect(routes).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("account-a");
    await act(() => window.dispatchEvent(new Event("blur")));
    await focusAndWait();
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(350); });
    expect(routes).toHaveBeenCalledTimes(1);
  } finally { await unmount(); }
});

it("reuses a fresh cached view on remount without a request", async () => {
  const routes = vi.fn(async () => view("account-a"));
  const { host, remount, unmount } = await mount(routes);
  try {
    await remount();
    expect(routes).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("account-a");
  } finally { await unmount(); }
});

it("shows a recent cached failure on remount without a request, and requests after 5 minutes", async () => {
  const routes = vi.fn(async () => { throw new TravelClientError("provider_unavailable"); });
  const { host, remount, unmount } = await mount(routes);
  try {
    await remount();
    expect(routes).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("unavailable");
    await act(async () => vi.advanceTimersByTimeAsync(300_000));
    await remount();
    expect(routes).toHaveBeenCalledTimes(2);
  } finally { await unmount(); }
});

it("clears the cache and requests on a settings change", async () => {
  const routes = vi.fn(async () => view("account-a"));
  const { remount, unmount } = await mount(routes);
  try {
    await act(async () => { window.dispatchEvent(new Event("cadence:travel-changed")); await vi.advanceTimersByTimeAsync(350); });
    expect(routes).toHaveBeenCalledTimes(2);
    await remount();
    expect(routes).toHaveBeenCalledTimes(2);
  } finally { await unmount(); }
});

it("requests when the sourceKey changes after a successful view", async () => {
  const routes = vi.fn(async () => view("account-a"));
  const { render, unmount } = await mount(routes);
  try {
    await render("changed");
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(routes).toHaveBeenCalledTimes(2);
  } finally { await unmount(); }
});

it("refreshes manually once and ignores calls while pending", async () => {
  const routes = vi.fn(async () => view("account-a"));
  const { unmount } = await mount(routes);
  try {
    await act(async () => { latest().refresh(); });
    expect(latest().pending).toBe(true);
    await act(async () => { latest().refresh(); latest().refresh(); await vi.advanceTimersByTimeAsync(350); });
    expect(routes).toHaveBeenCalledTimes(2);
    expect(latest().pending).toBe(false);
  } finally { await unmount(); }
});

it("keeps an expired view as stale evidence without requesting", async () => {
  const routes = vi.fn(async () => view("account-a"));
  const { host, unmount } = await mount(routes);
  try {
    expect(latest().stale).toBe(false);
    expect(latest().observedAt).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(300_000));
    expect(host.textContent).toBe("account-a");
    expect(latest().stale).toBe(true);
    await focusAndWait();
    expect(routes).toHaveBeenCalledTimes(1);
  } finally { await unmount(); }
});

it("shows the quota message for a 429", async () => {
  const error = await travelClientErrorFromResponse(new Response(JSON.stringify({ error: "quota_exceeded", retryAfterSeconds: 60 }), { status: 429 }));
  expect(error).toMatchObject({ code: "quota_exceeded", retryAfterSeconds: 60 });
  const { host, unmount } = await mount(vi.fn(async () => { throw error; }));
  try {
    expect(host.textContent).toBe("Today’s travel refresh limit is reached. Estimates return tomorrow.");
  } finally { await unmount(); }
});

it("retries one context change and shows the view", async () => {
  const routes = vi.fn().mockRejectedValueOnce(new TravelClientError("context_changed")).mockImplementation(async () => view("account-a"));
  const { host, unmount } = await mount(routes);
  try {
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(routes).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe("account-a");
  } finally { await unmount(); }
});

it("shows the unavailable message after two context changes", async () => {
  const routes = vi.fn(async () => { throw await travelClientErrorFromResponse(new Response(JSON.stringify({ error: "context_changed" }), { status: 409 })); });
  const { host, unmount } = await mount(routes);
  try {
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(routes).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe("Travel estimates are unavailable right now. Tracking and Calendar still work.");
  } finally { await unmount(); }
});

it("finishes an admitted request while hidden and does not request again on return", async () => {
  let resolveRoutes!: (value: TravelRoutesView) => void;
  const routes = vi.fn(() => new Promise<TravelRoutesView>((resolve) => { resolveRoutes = resolve; }));
  const { host, unmount } = await mount(routes);
  try {
    expect(routes).toHaveBeenCalledTimes(1);
    expect(latest().pending).toBe(true);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await act(async () => { window.dispatchEvent(new Event("blur")); document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(latest().pending).toBe(true);
    await act(async () => { resolveRoutes(view("account-a")); await vi.advanceTimersByTimeAsync(0); });
    expect(host.textContent).toBe("account-a");
    expect(latest().pending).toBe(false);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(350); });
    expect(routes).toHaveBeenCalledTimes(1);
  } finally { await unmount(); }
});

it("cancels a request that has not reached the routes call when hidden, and restarts it on return", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  let resolveConfigured!: (value: boolean) => void;
  const configured = vi.fn(() => new Promise<boolean>((resolve) => { resolveConfigured = resolve; }));
  const routes = vi.fn(async () => view("account-a"));
  const client: TravelClient = { settings: { load: async () => settings, save: async () => settings }, configured, readLocation: async () => ({ state: "denied" as const }), routes };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(() => root.render(<Probe client={client} accountId="account-a" />));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(configured).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(latest().pending).toBe(false);
    await act(async () => { resolveConfigured(true); await vi.advanceTimersByTimeAsync(350); });
    expect(routes).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(350); });
    expect(configured).toHaveBeenCalledTimes(2);
    await act(async () => { resolveConfigured(true); await vi.advanceTimersByTimeAsync(350); });
    expect(routes).toHaveBeenCalledTimes(1);
  } finally { await act(() => root.unmount()); host.remove(); }
});

it("caches an admitted request's view across unmount and reuses it on remount", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  let resolveRoutes!: (value: TravelRoutesView) => void;
  const routes = vi.fn(() => new Promise<TravelRoutesView>((resolve) => { resolveRoutes = resolve; }));
  const client: TravelClient = { settings: { load: async () => settings, save: async () => settings }, configured: async () => true, readLocation: async () => ({ state: "denied" as const }), routes };
  const host = document.createElement("div"); document.body.append(host);
  let root = createRoot(host);
  try {
    await act(() => root.render(<Probe client={client} accountId="account-a" />));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(routes).toHaveBeenCalledTimes(1);
    await act(() => root.unmount());
    await act(async () => { resolveRoutes(view("account-a")); await vi.advanceTimersByTimeAsync(0); });
    root = createRoot(host);
    await act(() => root.render(<Probe client={client} accountId="account-a" />));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(routes).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("account-a");
  } finally { await act(() => root.unmount()); host.remove(); }
});
