"use client";

import { useEffect, useRef, useState } from "react";
import type { TravelEvidenceResult, TravelMode, TravelNavigationPreference } from "@cadence/core/types/travel";
import type { NormalizedExternalEvent } from "@cadence/core/types/day-progress";
import type { TimelineView } from "@/lib/types/timeline";
import type { TravelSettingsClient } from "./travel-settings";
import { webTravelSettingsClient } from "./travel-settings";
import { readBrowserForegroundLocation, type ForegroundLocation } from "./foreground-location";

export type TravelCorrection = Readonly<{ eventId: string; revision: string; attendance: "physical" | "remote"; locationText: string | null }>;
export type TravelRoutesInput = Readonly<{
  startLocalDate: string; endLocalDate: string;
  device: Readonly<{ latitude: number; longitude: number; accuracyMeters: number; sampledAt: string }> | null;
  corrections?: readonly TravelCorrection[];
}>;
export type TravelRoutesView = Readonly<{
  accountId: string; mode: TravelMode | null; navigationPreference: TravelNavigationPreference | null;
  settingsRevision: string | null; expiresAt: string | null; evidence: Omit<TravelEvidenceResult, "modelProjection"> | null;
}>;
export type TravelClient = Readonly<{
  settings: TravelSettingsClient;
  configured: (signal: AbortSignal) => Promise<boolean>;
  routes: (input: TravelRoutesInput, signal: AbortSignal) => Promise<TravelRoutesView>;
  readLocation: (requestPermission: boolean) => Promise<ForegroundLocation>;
}>;
export type TravelClientErrorCode = "quota_exceeded" | "context_changed" | "provider_unavailable" | "provider_clearance_required" | "unauthenticated" | "unknown";
export class TravelClientError extends Error {
  code: TravelClientErrorCode;
  retryAfterSeconds: number | null;
  constructor(code: TravelClientErrorCode, retryAfterSeconds: number | null = null) {
    super("Travel unavailable.");
    this.name = "TravelClientError"; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Maps a failed /api/travel/routes response to a client error code. */
export async function travelClientErrorFromResponse(response: Response): Promise<TravelClientError> {
  let body: { error?: unknown; retryAfterSeconds?: unknown } = {};
  try { body = await response.json() as typeof body; } catch { /* Error bodies are optional. */ }
  const retryAfterSeconds = typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : null;
  if (response.status === 429 || body.error === "quota_exceeded") return new TravelClientError("quota_exceeded", retryAfterSeconds);
  if (response.status === 409 || body.error === "context_changed") return new TravelClientError("context_changed", retryAfterSeconds);
  if (response.status === 503) return new TravelClientError(body.error === "provider_clearance_required" || body.error === "not_configured" ? "provider_clearance_required" : "provider_unavailable", retryAfterSeconds);
  if (response.status === 401) return new TravelClientError("unauthenticated");
  return new TravelClientError("unknown");
}

/** Performs a travel routes fetch and converts every failure to a TravelClientError. */
export async function travelRouteFetch(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, init); }
  catch (error) { if (init.signal?.aborted) throw error; throw new TravelClientError("unknown"); }
  if (!response.ok) throw await travelClientErrorFromResponse(response);
  try { return await response.json(); } catch { throw new TravelClientError("unknown"); }
}

async function routeRequest(init: RequestInit): Promise<unknown> {
  return travelRouteFetch("/api/travel/routes", { ...init, cache: "no-store", redirect: "error",
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(50_000)]) : AbortSignal.timeout(50_000),
    headers: { "Content-Type": "application/json" } });
}

const QUOTA_MESSAGE = "Today’s travel refresh limit is reached. Estimates return tomorrow.";
const UNAVAILABLE_MESSAGE = "Travel estimates are unavailable right now. Tracking and Calendar still work.";
export const TRAVEL_CLEARANCE_MESSAGE = "Travel estimates await this deployment’s provider review.";
const CLEARANCE_MESSAGE = TRAVEL_CLEARANCE_MESSAGE;
function travelErrorMessage(error: unknown): string {
  const code = error instanceof TravelClientError ? error.code : "unknown";
  if (code === "quota_exceeded") return QUOTA_MESSAGE;
  if (code === "provider_clearance_required") return CLEARANCE_MESSAGE;
  return UNAVAILABLE_MESSAGE;
}
export const webTravelClient: TravelClient = {
  settings: webTravelSettingsClient,
  configured: async (signal) => (await routeRequest({ signal }) as { configured: boolean }).configured === true,
  routes: async (input, signal) => await routeRequest({ method: "POST", body: JSON.stringify(input), signal }) as TravelRoutesView,
  readLocation: readBrowserForegroundLocation,
};

export type TravelBehaviorRevision = Readonly<{ id: string; locationText: string | null; updatedAt: string }>;
/** Travel inputs only: visible events, occurrence schedule/status, owning Behavior location revisions and duration estimates. */
export function travelSourceKey(events: readonly NormalizedExternalEvent[], timeline: Pick<TimelineView, "daySections" | "durationEstimates">, behaviors: readonly TravelBehaviorRevision[] = []): string {
  const byId = new Map(behaviors.map((behavior) => [behavior.id, [behavior.locationText, behavior.updatedAt]]));
  return JSON.stringify([events.map((event) => [event.id, event.revision, event.location,
    event.kind === "timed" ? [event.startAt, event.endAt] : null]), timeline.daySections.map((section) => section.occurrences.map((occurrence) => [occurrence.id, occurrence.status, occurrence.scheduledFor, byId.get(occurrence.behaviorId) ?? null])), timeline.durationEstimates]);
}

type TravelCacheEntry = Readonly<{ view: TravelRoutesView | null; message: string | null; at: number }>;
const TRAVEL_CACHE_CAP = 32;
const FAILURE_REUSE_MS = 5 * 60 * 1000;
/** Page-session memory only: survives Timeline remounts, never persisted. */
const travelViewCache = new Map<string, TravelCacheEntry>();
/** Page-session memory only: routes calls in flight by state key, so an immediate remount joins them instead of spending another quota slot. */
const travelInFlight = new Map<string, Promise<TravelRoutesView>>();
/** Per-account invalidation counter; a settings change advances it so requests started earlier neither cache nor share their results. */
const travelEpochs = new Map<string, number>();
const travelEpoch = (accountId: string): number => travelEpochs.get(accountId) ?? 0;
function cacheTravel(key: string, entry: TravelCacheEntry): void {
  travelViewCache.delete(key);
  travelViewCache.set(key, entry);
  while (travelViewCache.size > TRAVEL_CACHE_CAP) travelViewCache.delete(travelViewCache.keys().next().value!);
}
function clearTravelCacheForAccount(accountId: string): void {
  travelEpochs.set(accountId, travelEpoch(accountId) + 1);
  for (const key of [...travelViewCache.keys()]) if ((JSON.parse(key) as unknown[])[0] === accountId) travelViewCache.delete(key);
  for (const key of [...travelInFlight.keys()]) if ((JSON.parse(key) as unknown[])[0] === accountId) travelInFlight.delete(key);
}
/** Test-only reset of the in-memory travel view cache. */
export function resetTravelViewCacheForTest(): void { travelViewCache.clear(); travelInFlight.clear(); travelEpochs.clear(); }

export type TravelState = Readonly<{
  view: TravelRoutesView | null; message: string | null;
  stale: boolean; pending: boolean; observedAt: string | null;
  refresh: () => void;
}>;
type StoredTravel = Readonly<{ key: string; view: TravelRoutesView | null; message: string | null; stale: boolean; pending: boolean; observedAt: string | null }>;

function earliestObservedAt(view: TravelRoutesView, fallback: string): string {
  const times = (view.evidence?.legs ?? []).flatMap((item) => item.estimate?.observedAt ? [item.estimate.observedAt] : []);
  return times.length ? times.reduce((left, right) => Date.parse(left) <= Date.parse(right) ? left : right) : fallback;
}

/**
 * Requests automatically only on the first Timeline open of a local date, or when the
 * travel inputs or settings change. Focus and visibility never request; refresh() does.
 * Leaving the foreground cancels a request only before its routes call. Once that call
 * has started the server may have admitted quota, so the request finishes even if the
 * window blurs, hides or unmounts, and its result is cached for the page session.
 */
export function useTravelContext(input: Readonly<{
  enabled: boolean; accountId: string | null; localDate: string; sourceKey: string;
  client?: TravelClient | null; corrections?: readonly TravelCorrection[];
}>): TravelState {
  const client = input.client === undefined ? webTravelClient : input.client;
  const correctionsKey = JSON.stringify(input.corrections ?? []);
  const stateKey = JSON.stringify([input.accountId, input.localDate, input.sourceKey, correctionsKey]);
  const empty: Omit<StoredTravel, "key"> = { view: null, message: null, stale: false, pending: false, observedAt: null };
  const [stored, setStored] = useState<StoredTravel>({ key: "", ...empty });
  const storedRef = useRef(stored);
  const manual = useRef<() => void>(() => undefined);
  const [refresh] = useState(() => () => manual.current());
  const state = stored.key === stateKey ? stored : { key: stateKey, ...empty };
  useEffect(() => {
    if (!input.enabled || !input.accountId || !client) return;
    const accountId = input.accountId;
    const setState = (value: Omit<StoredTravel, "key">) => { const next = { ...value, key: stateKey }; storedRef.current = next; setStored(next); };
    const current = () => storedRef.current.key === stateKey ? storedRef.current : { key: stateKey, ...empty };
    const patch = (value: Partial<Omit<StoredTravel, "key">>) => setState({ ...current(), ...value });
    let generation = 0;
    let active = true;
    let inFlight = false;
    let deferred = false;
    let committed = false; // A routes call has started; the server may already have admitted quota.
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let permission: PermissionStatus | null = null;
    const foreground = () => !document.hidden && document.hasFocus() && navigator.onLine;
    const stop = () => { generation++; committed = false; controller?.abort(); clearTimeout(timer); if (inFlight) { inFlight = false; patch({ pending: false }); } };
    const showView = (view: TravelRoutesView, at: number, extra: Partial<Omit<StoredTravel, "key">> = {}) => {
      const remaining = view.expiresAt ? Date.parse(view.expiresAt) - Date.now() : 0;
      const stale = !!view.evidence && (!Number.isFinite(remaining) || remaining <= 0);
      patch({ ...extra, view, message: null, stale, observedAt: view.evidence ? earliestObservedAt(view, new Date(at).toISOString()) : null });
      clearTimeout(expiry);
      if (view.evidence && !stale) expiry = setTimeout(() => {
        if (active && storedRef.current.view === view) patch({ stale: true });
      }, Math.min(remaining, 2_147_483_647));
    };
    const request = () => {
      if (!active || inFlight) return;
      if (!foreground()) { deferred = true; return; }
      deferred = false; inFlight = true; generation++;
      patch({ pending: true });
      const run = generation;
      timer = setTimeout(async () => {
        const epoch = travelEpoch(accountId);
        const current = () => travelEpoch(accountId) === epoch;
        controller = new AbortController();
        const signal = controller.signal;
        const valid = () => active && run === generation && !signal.aborted && !document.hidden && document.hasFocus();
        // After the routes call only explicit invalidation (settings change, revoked permission, offline) stops the request.
        const live = () => run === generation && !signal.aborted;
        const settle = (value: Partial<Omit<StoredTravel, "key">>) => { inFlight = false; committed = false; if (active) patch({ ...value, pending: false }); };
        try {
          const settings = await client.settings.load();
          if (!valid()) return;
          if (!settings.enabled || !settings.routingConsentAt || !settings.mode) { settle({ view: null, message: null, stale: false, observedAt: null }); return; }
          const configured = await client.configured(signal);
          if (!valid()) return;
          if (!configured) { if (current()) cacheTravel(stateKey, { view: null, message: CLEARANCE_MESSAGE, at: Date.now() }); settle({ view: null, message: CLEARANCE_MESSAGE, stale: false, observedAt: null }); return; }
          // Device position is read only inside a request.
          const position = await client.readLocation(false);
          if (!valid()) return;
          const device = position.state === "available" ? { latitude: position.latitude, longitude: position.longitude,
            accuracyMeters: position.accuracyMeters, sampledAt: new Date(position.sampledAt).toISOString() } : null;
          const routesInput = { startLocalDate: input.localDate, endLocalDate: input.localDate,
            device, corrections: JSON.parse(correctionsKey) as TravelCorrection[] };
          committed = true;
          // Join a routes call already in flight for this key (an immediate remount); otherwise start one and register it.
          const callRoutes = (): Promise<TravelRoutesView> => {
            const shared = travelInFlight.get(stateKey);
            if (shared) return shared;
            const own = client.routes(routesInput, signal);
            travelInFlight.set(stateKey, own);
            void own.finally(() => { if (travelInFlight.get(stateKey) === own) travelInFlight.delete(stateKey); }).catch(() => undefined);
            return own;
          };
          let view: TravelRoutesView;
          try { view = await callRoutes(); }
          catch (error) {
            if (!(error instanceof TravelClientError && error.code === "context_changed") || !live()) throw error;
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (!live()) return;
            try { view = await callRoutes(); }
            catch (retryError) {
              throw retryError instanceof TravelClientError && retryError.code === "context_changed" ? new TravelClientError("provider_unavailable") : retryError;
            }
          }
          if (!live()) return;
          if (view.accountId !== accountId || view.settingsRevision !== settings.updatedAt) { settle({}); return; }
          if (current()) cacheTravel(stateKey, { view, message: null, at: Date.now() });
          inFlight = false; committed = false;
          if (active) showView(view, Date.now(), { pending: false });
        } catch (error) {
          if (committed ? !live() : !valid()) return;
          if (current()) cacheTravel(stateKey, { view: null, message: travelErrorMessage(error), at: Date.now() });
          settle({ view: null, message: travelErrorMessage(error), stale: false, observedAt: null });
        }
      }, 350);
    };
    manual.current = () => {
      if (!active || inFlight) return;
      if (!navigator.onLine) { patch({ message: UNAVAILABLE_MESSAGE }); return; }
      if (document.hidden || !document.hasFocus()) return;
      request();
    };
    // Returning to the window resumes only an automatic request that could not start.
    const resume = () => { if (deferred) request(); else setStored((value) => ({ ...value })); };
    // Leaving the foreground cancels a request only before its routes call; an admitted request finishes and is cached.
    const suspend = () => { if (inFlight && !committed) { stop(); deferred = true; } };
    const offline = () => { if (inFlight) { stop(); deferred = true; } };
    const channel = typeof window.BroadcastChannel === "function" ? new BroadcastChannel("cadence-travel") : null;
    if (channel) channel.onmessage = () => setStored((value) => ({ ...value }));
    const visibility = () => { if (document.hidden) suspend(); else resume(); };
    const revoked = () => { if (permission?.state !== "granted") { stop(); clearTimeout(expiry); setState({ ...empty }); } };
    if (typeof navigator.permissions?.query === "function") {
      void navigator.permissions.query({ name: "geolocation" }).then((value) => {
        if (!active) return;
        permission = value; permission.addEventListener("change", revoked);
      }).catch(() => undefined);
    }
    // Settings changes on this window always replace the view.
    const changed = () => { clearTravelCacheForAccount(accountId); stop(); clearTimeout(expiry); setState({ ...empty }); request(); };
    window.addEventListener("focus", resume);
    window.addEventListener("blur", suspend);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    window.addEventListener("cadence:travel-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    const cached = travelViewCache.get(stateKey);
    const freshView = !!cached?.view && (!cached.view.evidence || (!!cached.view.expiresAt && Date.parse(cached.view.expiresAt) > Date.now()));
    if (cached?.view && freshView) showView(cached.view, cached.at);
    else if (cached && !cached.view && cached.message && Date.now() - cached.at < FAILURE_REUSE_MS) patch({ message: cached.message });
    else request();
    return () => {
      channel?.close();
      active = false;
      // A committed request finishes and caches its result for remount; anything earlier is cancelled.
      if (!committed) { generation++; controller?.abort(); }
      clearTimeout(timer); clearTimeout(expiry);
      manual.current = () => undefined;
      permission?.removeEventListener("change", revoked);
      window.removeEventListener("focus", resume); window.removeEventListener("blur", suspend); window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline); window.removeEventListener("cadence:travel-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stateKey covers localDate, sourceKey and corrections.
  }, [client, input.accountId, input.enabled, stateKey]);
  const visible = input.enabled && (!state.view || state.view.accountId === input.accountId);
  return visible
    ? { view: state.view, message: state.message, stale: state.stale, pending: state.pending, observedAt: state.observedAt, refresh }
    : { view: null, message: null, stale: false, pending: false, observedAt: null, refresh };
}
