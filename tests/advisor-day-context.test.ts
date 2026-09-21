import { readFile } from "node:fs/promises";

import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  projectAdvisorCalendarConnector,
  validateAdvisorDayContextRequest,
  validateAdvisorDayContext,
} from "../packages/core/src/services/advisor-day-context";
import { validateExternalEventSnapshot } from "../packages/core/src/services/external-event-validation";

const contextFixture = new URL("./fixtures/advisor-day-context.valid.json", import.meta.url);
const calendarFixture = new URL("./fixtures/external-event-snapshot.valid.json", import.meta.url);

describe("advisor day-context contract", () => {
  it("validates only the versioned one-day request shape", () => {
    expect(validateAdvisorDayContextRequest({ version: "1.0", localDate: "2026-11-01", connectors: ["google_calendar"] })).toEqual({ version: "1.0", localDate: "2026-11-01", connectors: ["google_calendar"] });
    expect(() => validateAdvisorDayContextRequest({ version: "1.0", localDate: null, connectors: ["other"] })).toThrow("connectors");
  });

  it("validates the minimized DST-day fixture", async () => {
    const fixture = JSON.parse(await readFile(contextFixture, "utf8"));
    const context = validateAdvisorDayContext(fixture);

    expect(Temporal.Instant.from(context.dayStartAt).until(Temporal.Instant.from(context.dayEndAt)).total({ unit: "hours" })).toBe(25);
    expect(context.cadence.occurrences[0]).not.toHaveProperty("note");
    expect(context.cadence.history).toMatchObject({
      lookbackDays: 90,
      startLocalDate: "2026-08-03",
      endLocalDateExclusive: "2026-11-01",
      completeness: "complete",
    });
    expect(context.connectors[0]).not.toHaveProperty("calendarId");
  });

  it("rejects rich fields, inconsistent bounds, duplicate refs, and incomplete empty-calendar claims", async () => {
    const fixture = JSON.parse(await readFile(contextFixture, "utf8"));
    expect(() => validateAdvisorDayContext({ ...fixture, rawAccountId: "owner" })).toThrow("exactly");
    expect(() => validateAdvisorDayContext({ ...fixture, dayEndAt: "2026-11-02T04:00:00Z" })).toThrow("day bounds");
    expect(() => validateAdvisorDayContext({
      ...fixture,
      cadence: { ...fixture.cadence, occurrences: [...fixture.cadence.occurrences, fixture.cadence.occurrences[0]] },
    })).toThrow("unique");
    expect(() => validateAdvisorDayContext({
      ...fixture,
      status: "partial",
      connectors: [{ ...fixture.connectors[0], state: "incomplete", complete: false, events: [] }],
    })).toThrow("requires a failure");
    expect(() => validateAdvisorDayContext({
      ...fixture,
      connectors: [{ ...fixture.connectors[0], events: [{ ...fixture.connectors[0].events[0], title: "Private" }] }],
    })).toThrow("exactly");
    expect(() => validateAdvisorDayContext({
      ...fixture,
      cadence: {
        ...fixture.cadence,
        history: { ...fixture.cadence.history, completeness: "unknown", reason: "history_limit_exceeded" },
      },
    })).toThrow("must be null");
  });

  it("projects opaque scheduling facts while removing provider IDs and rich metadata", async () => {
    const snapshot = validateExternalEventSnapshot(JSON.parse(await readFile(calendarFixture, "utf8")));
    const connector = projectAdvisorCalendarConnector({
      snapshot,
      selectionRevision: 2,
      now: Temporal.Instant.from(snapshot.fetchedAt),
      makeOpaqueRef: (kind, value) => `${kind}:${value.length}`,
    });

    expect(connector.events[0]).not.toHaveProperty("providerEventId");
    expect(connector.events[0]).not.toHaveProperty("title");
    expect(connector.events[0]).not.toHaveProperty("sourceUrl");
    expect(connector).toMatchObject({ complete: true, state: "current", selectionRevision: 2 });
  });

  it("preserves unknown-end, declined, tentative, free, and all-day scheduling facts", async () => {
    const fixture = JSON.parse(await readFile(calendarFixture, "utf8"));
    fixture.events[0] = {
      ...fixture.events[0],
      state: "tentative",
      availability: "busy",
      currentUserResponse: "declined",
      endUnspecified: true,
      duration: { kind: "unknown", reason: "end_unspecified" },
    };
    const connector = projectAdvisorCalendarConnector({
      snapshot: fixture,
      selectionRevision: 2,
      now: Temporal.Instant.from(fixture.fetchedAt),
      makeOpaqueRef: (kind, value) => `${kind}:${value.length}`,
    });
    expect(connector.events[0]).toMatchObject({ state: "tentative", availability: "busy", currentUserResponse: "declined", interval: { duration: { kind: "unknown", reason: "end_unspecified" } } });
    expect(connector.events[1]).toMatchObject({ state: "tentative", availability: "free", interval: { kind: "all_day", duration: { kind: "calendar_days", days: 2 } } });
  });

  it("turns incomplete pagination into an explicit failure with no usable events", async () => {
    const fixture = JSON.parse(await readFile(calendarFixture, "utf8"));
    fixture.completeness = "incomplete";
    fixture.freshness = { state: "incomplete", refreshedAt: fixture.fetchedAt, label: "Calendar data incomplete", canAssertNoOverlap: false };
    fixture.coverage[0].paginationComplete = false;
    fixture.failures = [{ code: "incomplete_pagination", calendarId: "calendar-1", retryable: false, retryAfterSeconds: null, message: "Synthetic partial page" }];
    const connector = projectAdvisorCalendarConnector({
      snapshot: fixture,
      selectionRevision: 2,
      now: Temporal.Instant.from(fixture.fetchedAt),
      makeOpaqueRef: (kind, value) => `${kind}:${value.length}`,
    });
    expect(connector).toMatchObject({ state: "incomplete", complete: false, failure: { code: "incomplete_pagination" }, events: [] });
  });
});
