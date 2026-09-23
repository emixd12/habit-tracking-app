// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TravelClientError, travelClientErrorFromResponse, useTravelContext, type TravelClient, type TravelRoutesView } from "@/lib/ui/travel";

const settings = { enabled: true, mode: "walking" as const, baseLocationText: null, navigationPreference: "google_maps" as const,
  routingConsentAt: "2026-09-21T12:00:00Z", onboardingCompletedAt: null, updatedAt: "revision" };
const view = (accountId: string): TravelRoutesView => ({ accountId, mode: "walking", navigationPreference: "google_maps", settingsRevision: "revision",
  expiresAt: new Date(Date.now() + 300_000).toISOString(), evidence: { version: "1.0", journeyRef: accountId,
    legs: [], segments: [], occupiedSpans: [], collisions: [], completeTrip: false, finalAvailabilityAt: null } });
function Probe({ client, accountId, sourceKey = "source" }: { client: TravelClient; accountId: string; sourceKey?: string }) {
  const state = useTravelContext({ enabled: true, accountId, sourceKey, localDate: "2026-09-21", client });
  return <p>{state.view?.evidence?.journeyRef ?? state.message ?? "empty"}</p>;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("coalesces foreground changes, gates device reads, and rejects late account responses", async () => {
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
    await act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(350); });
    expect(readLocation).toHaveBeenCalledWith(false);
    await act(() => root.render(<Probe client={client} accountId="account-b" />));
    await act(async () => { resolveOld(view("account-a")); await vi.advanceTimersByTimeAsync(350); });
    expect(host.textContent).toBe("account-b");
    await act(() => root.render(<Probe client={client} accountId="account-b" sourceKey="changed" />));
    expect(host.textContent).toBe("empty");
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(host.textContent).toBe("account-b");
    await act(() => window.dispatchEvent(new Event("offline")));
    expect(host.textContent).toBe("empty");
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
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(() => root.render(<Probe client={client} accountId="account-a" />));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  return { host, unmount: async () => { await act(() => root.unmount()); host.remove(); } };
}
const focusAndWait = (ms = 350) => act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(ms); });

it("reuses a fresh view on focus and re-requests after expiry", async () => {
  const routes = vi.fn(async () => view("account-a"));
  const { host, unmount } = await mount(routes);
  try {
    expect(routes).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("account-a");
    await act(() => window.dispatchEvent(new Event("blur")));
    await focusAndWait();
    expect(routes).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("account-a");
    await act(async () => vi.advanceTimersByTimeAsync(300_000));
    expect(host.textContent).toContain("expired");
    await focusAndWait();
    expect(routes).toHaveBeenCalledTimes(2);
  } finally { await unmount(); }
});

it("shows the quota message for a 429", async () => {
  const error = await travelClientErrorFromResponse(new Response(JSON.stringify({ error: "quota_exceeded", retryAfterSeconds: 60 }), { status: 429 }));
  expect(error).toMatchObject({ code: "quota_exceeded", retryAfterSeconds: 60 });
  const { host, unmount } = await mount(vi.fn(async () => { throw error; }));
  try { expect(host.textContent).toBe("Today’s travel refresh limit is reached. Estimates return tomorrow."); } finally { await unmount(); }
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
