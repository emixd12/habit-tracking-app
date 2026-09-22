import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { resolveDayProgressLayout } from "@cadence/core/resolvers/day-progress.resolver";
import { resolveTimelineOccurrenceContext } from "@cadence/core/resolvers/timeline-context.resolver";
import type { TravelEvidenceResult, TravelOccupiedSegment } from "@cadence/core/types/travel";

const segments: TravelOccupiedSegment[] = [
  { id: "out", kind: "route", startAt: "2026-09-21T13:30:00Z", endAt: "2026-09-21T14:30:00Z", sourceRefs: ["event"], legId: "out" },
  { id: "return", kind: "route", startAt: "2026-09-21T16:30:00Z", endAt: "2026-09-21T18:30:00Z", sourceRefs: ["event"], legId: "return" },
];
const travel: TravelEvidenceResult = { version: "1.0", journeyRef: "day", segments, occupiedSpans: [], legs: [], collisions: [], completeTrip: false, finalAvailabilityAt: null, modelProjection: null };

describe("shared Timeline travel occupancy", () => {
  it("maps separate known spans without filling free gaps", () => {
    const day = resolveDayProgressLayout({ timezone: "UTC", days: [{ localDate: "2026-09-21", top: 0, bottom: 1440, rows: [] }], travelSegments: segments }).days[0]!;
    expect(day.travelSpans.map((span) => [span.startPosition, span.endPosition])).toEqual([[810, 870], [990, 1110]]);
    expect(day.timedEventSpans).toEqual([]);
  });
  it("keeps outbound collisions with no known return, uses half-open boundaries, and never asserts free time", () => {
    const resolve = (scheduledFor: string) => resolveTimelineOccurrenceContext({ occurrenceId: "behavior", scheduledFor,
      runningStartedAt: null, estimate: { kind: "known", seconds: 900, durationLabel: "15 minutes", sampleCount: 0, lookbackDays: 90, provenance: "behavior_default" },
      events: [], freshness: { state: "current", refreshedAt: "2026-09-21T12:00:00Z", label: "Calendar current", canAssertNoOverlap: true },
      now: Temporal.Instant.from("2026-09-21T12:00:00Z"), travel });
    expect(resolve("2026-09-21T13:45:00Z")).toMatchObject({ overlappingEventIds: ["event"], overlapLabel: "Possible travel overlap" });
    expect(resolve("2026-09-21T18:30:00Z")).toMatchObject({ overlappingEventIds: [], overlapAssessment: "unknown", overlapLabel: "Travel timing incomplete" });
  });
  it("clips overnight travel against actual DST day boundaries", () => {
    const layout = resolveDayProgressLayout({ timezone: "America/New_York", days: [
      { localDate: "2026-10-31", top: 0, bottom: 240, rows: [] },
      { localDate: "2026-11-01", top: 240, bottom: 490, rows: [] },
    ], travelSegments: [{ ...segments[0]!, startAt: "2026-11-01T03:30:00Z", endAt: "2026-11-01T06:30:00Z" }] });
    expect(layout.days[0]!.travelSpans[0]!.endPosition).toBe(240);
    expect(layout.days[1]!.travelSpans[0]).toMatchObject({ startPosition: 240, endPosition: 265 });
  });
});
