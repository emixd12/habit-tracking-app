import { Temporal } from "@js-temporal/polyfill";
import type { TravelMode, TravelNavigationPreference, TravelSettings } from "../types/travel";

export type TravelSettingsSaveInput = Readonly<{
  enabled: boolean;
  baseLocationText: string | null;
  mode: TravelMode | null;
  navigationPreference: TravelNavigationPreference | null;
  expectedUpdatedAt: string;
  acceptRoutingDisclosure: boolean;
}>;

export function planTravelSettingsSave(
  current: TravelSettings,
  input: TravelSettingsSaveInput,
  now: string,
): TravelSettings {
  instant(input.expectedUpdatedAt, "Reload travel settings before saving changes.");
  instant(now, "The travel settings timestamp is invalid.");
  if (input.expectedUpdatedAt !== current.updatedAt) {
    throw new Error("Travel settings changed after they were loaded.");
  }
  const baseLocationText = normalizeUserAuthoredLocation(input.baseLocationText);
  if (input.mode !== null && !["walking", "cycling", "transit", "driving"].includes(input.mode)) {
    throw new Error("Choose a supported travel mode.");
  }
  if (input.navigationPreference !== null && !["google_maps", "apple_maps"].includes(input.navigationPreference)) {
    throw new Error("Choose a supported navigation app.");
  }
  if (input.enabled && !input.mode) throw new Error("Choose a travel mode before enabling travel.");
  if (input.enabled && !input.acceptRoutingDisclosure) {
    throw new Error("Accept the routing disclosure before enabling travel.");
  }
  return {
    enabled: input.enabled,
    baseLocationText,
    mode: input.mode,
    navigationPreference: input.navigationPreference,
    routingConsentAt: input.enabled ? now : null,
    onboardingCompletedAt: current.onboardingCompletedAt ?? now,
    updatedAt: now,
  };
}

export function normalizeUserAuthoredLocation(value: string | null | undefined): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > 500) throw new Error("Keep the saved base to 500 characters or fewer.");
  if (normalized && /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error("Saved locations cannot contain control characters.");
  }
  return normalized;
}

export function canonicalTravelInstant(value: string): string {
  return Temporal.Instant.from(value)
    .round({ smallestUnit: "microsecond", roundingMode: "halfEven" })
    .toString({ fractionalSecondDigits: 6 });
}

function instant(value: string, message: string): void {
  try { Temporal.Instant.from(value); }
  catch { throw new Error(message); }
}
