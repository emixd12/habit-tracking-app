import { describe, expect, it } from "vitest";

import { projectTravelRouteDisplay } from "@/lib/services/travel-display.service";

describe("travel route display projection", () => {
  it("removes route request coordinates and place IDs", () => {
    const result = projectTravelRouteDisplay({
      version: "1.0", journeyRef: "journey", segments: [], occupiedSpans: [], collisions: [], completeTrip: false, finalAvailabilityAt: null, modelProjection: null,
      legs: [{ state: "current", reason: null, estimate: { durationSeconds: 60, departureAt: "2026-09-22T12:00:00Z", arrivalAt: "2026-09-22T12:01:00Z", warnings: [], fallback: false, attribution: "Google Maps", observedAt: "2026-09-22T12:00:00Z", expiresAt: "2026-09-22T12:05:00Z" }, leg: {
        id: "leg", role: "outbound", journeyRef: "journey", originCommitmentRef: null, destinationCommitmentRef: "event", mode: "walking", readyAt: "2026-09-22T12:00:00Z",
        provenance: { originRef: "device", originSource: "device", originRevision: "one", destinationRef: "event", destinationSource: "calendar", destinationRevision: "two", grantRevision: "three" },
      } }],
    });
    expect(JSON.stringify(result)).not.toContain("latitude");
    expect(JSON.stringify(result)).not.toContain("placeId");
  });
});
