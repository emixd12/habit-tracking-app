import { describe, expect, it } from "vitest";
import { buildTravelNavigationLink } from "@cadence/core/services/travel-navigation";
import { validateForegroundLocation } from "@/lib/ui/foreground-location";

describe("travel navigation and device boundary", () => {
  it("encodes hostile source text as search data, never a destination URL", () => {
    const link = buildTravelNavigationLink({ locationText: "javascript:alert(1)&api=evil" })!;
    const url = new URL(link.href);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("query")).toBe("javascript:alert(1)&api=evil");
    expect(link.label).toBe("Search in Google Maps");
    expect(buildTravelNavigationLink({ locationText: "\n" })).toBeNull();
  });
  it("maps all supported Google modes and discloses Apple cycling limits", () => {
    for (const mode of ["walking", "cycling", "transit", "driving"] as const) {
      const link = buildTravelNavigationLink({ locationText: "Source address", mode, resolved: true })!;
      expect(new URL(link.href).searchParams.get("travelmode")).toBe(mode === "cycling" ? "bicycling" : mode);
    }
    expect(buildTravelNavigationLink({ locationText: "Source address", preference: "apple_maps", mode: "cycling", resolved: true })?.modeNotice).toContain("Choose cycling");
  });
  it("rejects stale, coarse, invalid and future samples without retaining coordinates", () => {
    const sample = { state: "available", latitude: 10, longitude: 20, accuracyMeters: 20, sampledAt: 1000 };
    expect(validateForegroundLocation(sample, 1000)).toEqual(sample);
    expect(validateForegroundLocation(sample, 61001)).toEqual({ state: "stale" });
    expect(validateForegroundLocation({ ...sample, accuracyMeters: 101 }, 1000)).toEqual({ state: "inaccurate" });
    expect(validateForegroundLocation({ ...sample, latitude: NaN }, 1000)).toEqual({ state: "unavailable" });
    expect(validateForegroundLocation(sample, 999)).toEqual({ state: "unavailable" });
  });
});
