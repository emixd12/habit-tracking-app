import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  resolveNoteUpdate,
  resolveStatusTransition,
  type StatusResolverOccurrence,
} from "../lib/resolvers/status.resolver";

const NOW = Temporal.Instant.from("2026-06-08T14:35:00Z");

function occurrence(
  overrides: Partial<StatusResolverOccurrence> = {},
): StatusResolverOccurrence {
  return {
    status: "unresolved",
    completedAt: null,
    statusMarkedAt: null,
    note: null,
    ...overrides,
  };
}

describe("resolveStatusTransition", () => {
  it("marks an unresolved occurrence Completed with status and completion timestamps", () => {
    const update = resolveStatusTransition({
      occurrence: occurrence(),
      nextStatus: "done",
      now: NOW,
    });

    expect(update).toEqual({
      status: "done",
      completedAt: "2026-06-08T14:35:00Z",
      statusMarkedAt: "2026-06-08T14:35:00Z",
    });
  });

  it("marks an unresolved occurrence Not Completed without a completion timestamp", () => {
    const update = resolveStatusTransition({
      occurrence: occurrence(),
      nextStatus: "not_done",
      now: NOW,
    });

    expect(update).toEqual({
      status: "not_done",
      completedAt: null,
      statusMarkedAt: "2026-06-08T14:35:00Z",
    });
  });

  it("lets a Completed occurrence be changed to Not Completed later", () => {
    const update = resolveStatusTransition({
      occurrence: occurrence({
        status: "done",
        completedAt: "2026-06-07T12:00:00Z",
        statusMarkedAt: "2026-06-07T12:00:00Z",
      }),
      nextStatus: "not_done",
      now: NOW,
    });

    expect(update).toEqual({
      status: "not_done",
      completedAt: null,
      statusMarkedAt: "2026-06-08T14:35:00Z",
    });
  });

  it("lets a Not Completed occurrence be changed to Completed later", () => {
    const update = resolveStatusTransition({
      occurrence: occurrence({
        status: "not_done",
        completedAt: null,
        statusMarkedAt: "2026-06-07T12:00:00Z",
      }),
      nextStatus: "done",
      now: NOW,
    });

    expect(update).toEqual({
      status: "done",
      completedAt: "2026-06-08T14:35:00Z",
      statusMarkedAt: "2026-06-08T14:35:00Z",
    });
  });

  it("keeps existing timestamps when reapplying the same resolved status", () => {
    const update = resolveStatusTransition({
      occurrence: occurrence({
        status: "done",
        completedAt: "2026-06-07T12:00:00Z",
        statusMarkedAt: "2026-06-07T12:00:00Z",
      }),
      nextStatus: "done",
      now: NOW,
    });

    expect(update).toEqual({
      status: "done",
      completedAt: "2026-06-07T12:00:00Z",
      statusMarkedAt: "2026-06-07T12:00:00Z",
    });
  });

  it("can return an occurrence to unresolved without creating a missed state", () => {
    const update = resolveStatusTransition({
      occurrence: occurrence({
        status: "not_done",
        completedAt: null,
        statusMarkedAt: "2026-06-07T12:00:00Z",
      }),
      nextStatus: "unresolved",
      now: NOW,
    });

    expect(update).toEqual({
      status: "unresolved",
      completedAt: null,
      statusMarkedAt: null,
    });
  });
});

describe("resolveNoteUpdate", () => {
  it("normalizes multiline occurrence notes", () => {
    expect(resolveNoteUpdate({ note: "  First line\r\nSecond line  " })).toEqual({
      note: "First line\nSecond line",
    });
  });

  it("stores blank occurrence notes as null", () => {
    expect(resolveNoteUpdate({ note: " \n\t " })).toEqual({
      note: null,
    });
  });
});
