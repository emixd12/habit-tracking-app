"use client";

import { useEffect, useRef, useState } from "react";
import type { TravelEvidenceResult, TravelMode, TravelNavigationPreference } from "@cadence/core/types/travel";
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
const CLEARANCE_MESSAGE = "Travel estimates await this deployment’s provider review.";
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

type TravelState = Readonly<{ view: TravelRoutesView | null; message: string | null }>;

/** Foreground changes coalesce. A deadline clears evidence; it never schedules a polling loop. */
export function useTravelContext(input: Readonly<{
  enabled: boolean; accountId: string | null; localDate: string; sourceKey: string;
  client?: TravelClient | null; corrections?: readonly TravelCorrection[];
}>): TravelState {
  const client = input.client === undefined ? webTravelClient : input.client;
  const correctionsKey = JSON.stringify(input.corrections ?? []);
  const stateKey = JSON.stringify([input.accountId, input.localDate, input.sourceKey, correctionsKey]);
  const [stored, setStored] = useState<TravelState & { key: string }>({ key: "", view: null, message: null });
  const storedRef = useRef(stored);
  const state: TravelState = stored.key === stateKey ? stored : { view: null, message: null };
  useEffect(() => {
    if (!input.enabled || !input.accountId || !client) return;
    const setState = (value: TravelState) => { const next = { ...value, key: stateKey }; storedRef.current = next; setStored(next); };
    /** A fresh view for this exact key is reused until it expires. */
    const reusable = () => {
      const current = storedRef.current;
      return current.key === stateKey && !!current.view?.evidence && !!current.view.expiresAt && Date.parse(current.view.expiresAt) > Date.now();
    };
    let generation = 0;
    let active = true;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let permission: PermissionStatus | null = null;
    const invalidate = () => {
      generation++; controller?.abort(); clearTimeout(timer); clearTimeout(expiry);
      setState({ view: null, message: null });
    };
    // Losing focus or visibility stops in-flight work but keeps a fresh view for reuse on return.
    const suspend = () => { if (reusable()) { generation++; controller?.abort(); clearTimeout(timer); } else invalidate(); };
    const refresh = () => {
      if (reusable()) return;
      invalidate();
      if (!active || document.hidden || !document.hasFocus() || !navigator.onLine) return;
      const current = generation;
      timer = setTimeout(async () => {
        controller = new AbortController();
        const signal = controller.signal;
        const valid = () => active && current === generation && !signal.aborted && !document.hidden && document.hasFocus();
        try {
          const settings = await client.settings.load();
          if (!valid()) return;
          if (!settings.enabled || !settings.routingConsentAt || !settings.mode) return;
          const configured = await client.configured(signal);
          if (!valid()) return;
          if (!configured) { setState({ view: null, message: CLEARANCE_MESSAGE }); return; }
          const position = await client.readLocation(false);
          if (!valid()) return;
          const device = position.state === "available" ? { latitude: position.latitude, longitude: position.longitude,
            accuracyMeters: position.accuracyMeters, sampledAt: new Date(position.sampledAt).toISOString() } : null;
          const routesInput = { startLocalDate: input.localDate, endLocalDate: input.localDate,
            device, corrections: JSON.parse(correctionsKey) as TravelCorrection[] };
          let view: TravelRoutesView;
          try { view = await client.routes(routesInput, signal); }
          catch (error) {
            if (!(error instanceof TravelClientError && error.code === "context_changed") || !valid()) throw error;
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (!valid()) return;
            try { view = await client.routes(routesInput, signal); }
            catch (retryError) {
              throw retryError instanceof TravelClientError && retryError.code === "context_changed" ? new TravelClientError("provider_unavailable") : retryError;
            }
          }
          if (!valid() || view.accountId !== input.accountId || view.settingsRevision !== settings.updatedAt) return;
          const remaining = view.expiresAt ? Date.parse(view.expiresAt) - Date.now() : 0;
          if (view.evidence && (!Number.isFinite(remaining) || remaining <= 0)) return;
          setState({ view, message: view.evidence ? "Travel estimates are separate from today’s Daily Brief. Changes do not regenerate the briefing." : null });
          if (view.evidence) expiry = setTimeout(() => {
            if (active && storedRef.current.view === view) setState({ view: null, message: "Travel estimates expired. Return to this window to refresh them." });
          }, Math.min(remaining, 2_147_483_647));
        } catch (error) {
          if (valid()) setState({ view: null, message: travelErrorMessage(error) });
        }
      }, 350);
    };
    const channel = typeof window.BroadcastChannel === "function" ? new BroadcastChannel("cadence-travel") : null;
    if (channel) channel.onmessage = refresh;
    const visibility = () => { if (document.hidden) suspend(); else refresh(); };
    const revoked = () => { if (permission?.state !== "granted") { invalidate(); refresh(); } };
    if (typeof navigator.permissions?.query === "function") {
      void navigator.permissions.query({ name: "geolocation" }).then((value) => {
        if (!active) return;
        permission = value; permission.addEventListener("change", revoked);
      }).catch(() => undefined);
    }
    window.addEventListener("focus", refresh);
    window.addEventListener("blur", suspend);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", invalidate);
    // Settings changes on this window always replace the view.
    const changed = () => { invalidate(); refresh(); };
    window.addEventListener("cadence:travel-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    refresh();
    return () => {
      channel?.close();
      active = false; generation++; controller?.abort(); clearTimeout(timer); clearTimeout(expiry);
      permission?.removeEventListener("change", revoked);
      window.removeEventListener("focus", refresh); window.removeEventListener("blur", suspend); window.removeEventListener("online", refresh);
      window.removeEventListener("offline", invalidate); window.removeEventListener("cadence:travel-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [client, input.accountId, input.enabled, input.localDate, input.sourceKey, correctionsKey, stateKey]);
  return input.enabled && state.view?.accountId === input.accountId ? state
    : { view: null, message: input.enabled && !state.view ? state.message : null };
}
