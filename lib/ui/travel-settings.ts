import type { TravelMode, TravelNavigationPreference, TravelSettings } from "@cadence/core/types/travel";

export type TravelSettingsUpdate = Readonly<{
  enabled: boolean;
  baseLocationText: string | null;
  mode: TravelMode | null;
  navigationPreference: TravelNavigationPreference | null;
  expectedUpdatedAt: string;
  acceptRoutingDisclosure: boolean;
}>;
export type TravelSettingsClient = Readonly<{
  load: () => Promise<TravelSettings>;
  save: (input: TravelSettingsUpdate) => Promise<TravelSettings>;
}>;

async function request(init: RequestInit = {}): Promise<TravelSettings> {
  const response = await fetch("/api/travel/settings", { ...init, cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error("Travel settings unavailable.");
  return response.json();
}
export const webTravelSettingsClient: TravelSettingsClient = {
  load: () => request(),
  save: (input) => request({ method: "PUT", body: JSON.stringify(input) }),
};


/** No settings or locations enter the cross-tab notification. */
export function notifyTravelSettingsChanged(): void {
  window.dispatchEvent(new Event("cadence:travel-changed"));
  if (typeof window.BroadcastChannel === "function") {
    const channel = new BroadcastChannel("cadence-travel");
    channel.postMessage("changed");
    channel.close();
  }
}
