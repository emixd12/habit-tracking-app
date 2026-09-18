import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { projectExternalEventSchedulingFacts } from "../packages/core/src/services/external-event-projection";
import {
  ExternalEventValidationError,
  validateExternalEventSnapshot,
} from "../packages/core/src/services/external-event-validation";
import {
  EXTERNAL_EVENT_ADAPTER_VERSION,
  EXTERNAL_EVENT_SCHEMA_VERSION,
} from "../packages/core/src/types/external-event";

const fixtureUrl = new URL("./fixtures/external-event-snapshot.valid.json", import.meta.url);
const schemaUrl = new URL("../packages/core/src/external-event.schema.json", import.meta.url);

describe("external event contract", () => {
  it("validates the versioned fixture and projects only scheduling facts", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const snapshot = validateExternalEventSnapshot(fixture);
    const projection = projectExternalEventSchedulingFacts(snapshot);

    expect(snapshot.schemaVersion).toBe(EXTERNAL_EVENT_SCHEMA_VERSION);
    expect(snapshot.adapterVersion).toBe(EXTERNAL_EVENT_ADAPTER_VERSION);
    expect(snapshot.events[0]).toMatchObject({
      duration: { kind: "known", seconds: 3_600 },
      recurrence: {
        seriesId: "series-1",
        originalStart: { kind: "timed", startAt: "2026-11-01T05:00:00Z" },
      },
    });
    expect(snapshot.events[1]).toMatchObject({
      duration: { kind: "calendar_days", days: 2 },
    });
    expect(projection.events[0]).not.toHaveProperty("title");
    expect(projection.events[0]).not.toHaveProperty("description");
    expect(projection.events[0]).not.toHaveProperty("attendees");
    expect(projection).toMatchObject({
      completeness: "complete",
      freshness: { state: "current", canAssertNoOverlap: true },
    });
  });

  it("keeps the JSON Schema version and top-level shape aligned with the runtime contract", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as Record<string, unknown>;
    const schema = JSON.parse(await readFile(schemaUrl, "utf8")) as {
      properties: Record<string, { const?: string }>;
      required: string[];
      $defs: Record<string, {
        required?: string[];
        allOf?: Array<{ required?: string[] }>;
        enum?: string[];
      }>;
    };

    expect(schema.properties.schemaVersion?.const).toBe(EXTERNAL_EVENT_SCHEMA_VERSION);
    expect(schema.properties.adapterVersion?.const).toBe(EXTERNAL_EVENT_ADAPTER_VERSION);
    expect(new Set(schema.required)).toEqual(new Set(Object.keys(fixture)));
    expect(schema.$defs).toHaveProperty("timedEvent");
    expect(schema.$defs).toHaveProperty("allDayEvent");
    expect(schema.$defs).toHaveProperty("tombstone");
    const base = schema.$defs.eventBase?.required ?? [];
    const timed = schema.$defs.timedEvent?.allOf?.flatMap((part) => part.required ?? []) ?? [];
    const allDay = schema.$defs.allDayEvent?.allOf?.flatMap((part) => part.required ?? []) ?? [];
    expect(new Set([...base, ...timed])).toEqual(new Set(Object.keys((fixture.events as object[])[0]!)));
    expect(new Set([...base, ...allDay])).toEqual(new Set(Object.keys((fixture.events as object[])[1]!)));
    expect(schema.$defs.fieldAvailabilityValue?.enum).toEqual([
      "not_provided", "restricted", "provider_omitted", "unsupported", "unknown",
    ]);
    expect(schema.$defs.detailCompletenessValue?.enum).toEqual([
      "complete", "provider_omitted", "client_truncated", "restricted", "unsupported", "unknown",
    ]);
  });

  it("rejects unsupported versions, mismatched durations, reversed spans, and false completeness", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

    expect(() => validateExternalEventSnapshot({ ...fixture, schemaVersion: "2.0.0" }))
      .toThrow(ExternalEventValidationError);
    expect(() => validateExternalEventSnapshot({ ...fixture, unexpected: true }))
      .toThrow("must contain exactly");
    expect(() => validateExternalEventSnapshot({
      ...fixture,
      events: [{ ...fixture.events[0], duration: { kind: "known", seconds: 0 } }],
    })).toThrow("duration.seconds");
    expect(() => validateExternalEventSnapshot({
      ...fixture,
      events: [{
        ...fixture.events[0],
        startAt: fixture.events[0].endAt,
        endAt: fixture.events[0].startAt,
      }],
    })).toThrow("endAt");
    expect(() => validateExternalEventSnapshot({
      ...fixture,
      coverage: [{ ...fixture.coverage[0], paginationComplete: false }],
    })).toThrow("complete snapshots");
    expect(() => validateExternalEventSnapshot({
      ...fixture,
      events: [{
        ...fixture.events[0],
        endUnspecified: true,
        duration: { kind: "known", seconds: 3_600 },
      }],
    })).toThrow("duration");
  });
});
