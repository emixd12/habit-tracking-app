import type { SupabaseClient } from "@supabase/supabase-js";
import { TravelClientError, travelRouteFetch, type TravelClient, type TravelRoutesView } from "@/lib/ui/travel";
import { readMacForegroundLocation } from "./foreground-location";
import { createLocalTravelSettingsClient } from "./local-travel-settings.service";
import { readDesktopCalendarBrokerOrigin } from "./calendar/google-calendar";

export function createDesktopTravelClient(client: SupabaseClient, origin = readDesktopCalendarBrokerOrigin()): TravelClient | null {
  if (!origin) return null;
  const request = async (signal: AbortSignal, init: RequestInit = {}) => {
    const session = (await client.auth.getSession()).data.session;
    if (!session) throw new TravelClientError("unauthenticated");
    return await travelRouteFetch(`${origin}/api/travel/routes`, { ...init, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(50_000)]),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } }) as { configured?: boolean };
  };
  return {
    settings: createLocalTravelSettingsClient(),
    configured: async (signal) => (await request(signal)).configured === true,
    routes: async (input, signal) => await request(signal, { method: "POST", body: JSON.stringify(input) }) as TravelRoutesView,
    readLocation: readMacForegroundLocation,
  };
}
