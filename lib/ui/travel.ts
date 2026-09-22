"use client";

import { useEffect, useState } from "react";
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
async function routeRequest(init: RequestInit): Promise<unknown> {
  const response = await fetch("/api/travel/routes", { ...init, cache: "no-store", redirect: "error",
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(50_000)]) : AbortSignal.timeout(50_000),
    headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error("Travel unavailable.");
  return response.json();
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
  const state: TravelState = stored.key === stateKey ? stored : { view: null, message: null };
  useEffect(() => {
    if (!input.enabled || !input.accountId || !client) return;
    const setState = (value: TravelState) => setStored({ ...value, key: stateKey });
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
    const refresh = () => {
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
          if (!configured) { setState({ view: null, message: "Travel estimates await this deployment’s provider review." }); return; }
          const position = await client.readLocation(false);
          if (!valid()) return;
          const device = position.state === "available" ? { latitude: position.latitude, longitude: position.longitude,
            accuracyMeters: position.accuracyMeters, sampledAt: new Date(position.sampledAt).toISOString() } : null;
          const view = await client.routes({ startLocalDate: input.localDate, endLocalDate: input.localDate,
            device, corrections: JSON.parse(correctionsKey) as TravelCorrection[] }, signal);
          if (!valid() || view.accountId !== input.accountId || view.settingsRevision !== settings.updatedAt) return;
          const remaining = view.expiresAt ? Date.parse(view.expiresAt) - Date.now() : 0;
          if (view.evidence && (!Number.isFinite(remaining) || remaining <= 0)) return;
          setState({ view, message: view.evidence ? "Travel estimates are separate from today’s Daily Brief. Changes do not regenerate the briefing." : null });
          if (view.evidence) expiry = setTimeout(() => {
            if (valid()) setState({ view: null, message: "Travel estimates expired. Return to this window to refresh them." });
          }, Math.min(remaining, 2_147_483_647));
        } catch {
          if (valid()) setState({ view: null, message: "Travel estimates are unavailable. Tracking and Calendar still work." });
        }
      }, 350);
    };
    const channel = typeof window.BroadcastChannel === "function" ? new BroadcastChannel("cadence-travel") : null;
    if (channel) channel.onmessage = refresh;
    const visibility = () => { if (document.hidden) invalidate(); else refresh(); };
    const revoked = () => { if (permission?.state !== "granted") { invalidate(); refresh(); } };
    if (typeof navigator.permissions?.query === "function") {
      void navigator.permissions.query({ name: "geolocation" }).then((value) => {
        if (!active) return;
        permission = value; permission.addEventListener("change", revoked);
      }).catch(() => undefined);
    }
    window.addEventListener("focus", refresh);
    window.addEventListener("blur", invalidate);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", invalidate);
    window.addEventListener("cadence:travel-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    refresh();
    return () => {
      channel?.close();
      active = false; generation++; controller?.abort(); clearTimeout(timer); clearTimeout(expiry);
      permission?.removeEventListener("change", revoked);
      window.removeEventListener("focus", refresh); window.removeEventListener("blur", invalidate); window.removeEventListener("online", refresh);
      window.removeEventListener("offline", invalidate); window.removeEventListener("cadence:travel-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [client, input.accountId, input.enabled, input.localDate, input.sourceKey, correctionsKey, stateKey]);
  return input.enabled && state.view?.accountId === input.accountId ? state
    : { view: null, message: input.enabled && !state.view ? state.message : null };
}
