import { describe, expect, it } from "vitest";

import {
  planBehaviorDefinitionChangeEvent,
  planInitialBehaviorDefinitionEvent,
} from "../lib/resolvers/behavior-definition.resolver";

const RECORDED_AT = "2026-07-09T18:30:00Z";

describe("planInitialBehaviorDefinitionEvent", () => {
  it("captures a complete initial definition", () => {
    expect(
      planInitialBehaviorDefinitionEvent({
        definition: {
          title: "  Brush teeth  ",
          description: "  Evening routine  ",
        },
        recordedAt: RECORDED_AT,
        source: "manual",
      }),
    ).toEqual({
      previousTitle: null,
      nextTitle: "Brush teeth",
      previousDescription: null,
      nextDescription: "Evening routine",
      changedFields: ["title", "description"],
      recordedAt: RECORDED_AT,
      source: "manual",
      reason: null,
    });
  });

  it("marks only title as changed when the initial description is null", () => {
    expect(
      planInitialBehaviorDefinitionEvent({
        definition: {
          title: "Brush teeth",
          description: null,
        },
        recordedAt: RECORDED_AT,
        source: "system",
        reason: "baseline_backfill",
      }),
    ).toMatchObject({
      previousTitle: null,
      nextTitle: "Brush teeth",
      previousDescription: null,
      nextDescription: null,
      changedFields: ["title"],
      source: "system",
      reason: "baseline_backfill",
    });
  });
});

describe("planBehaviorDefinitionChangeEvent", () => {
  it("captures full previous and next definitions while naming only changed fields", () => {
    expect(
      planBehaviorDefinitionChangeEvent({
        previousDefinition: {
          title: "Brush teeth",
          description: "Evening routine",
        },
        nextDefinition: {
          title: "Brush and floss",
          description: "Evening routine",
        },
        recordedAt: RECORDED_AT,
        source: "manual",
      }),
    ).toEqual({
      previousTitle: "Brush teeth",
      nextTitle: "Brush and floss",
      previousDescription: "Evening routine",
      nextDescription: "Evening routine",
      changedFields: ["title"],
      recordedAt: RECORDED_AT,
      source: "manual",
      reason: null,
    });
  });

  it("plans description removal as a definition change", () => {
    expect(
      planBehaviorDefinitionChangeEvent({
        previousDefinition: {
          title: "Brush teeth",
          description: "Evening routine",
        },
        nextDefinition: {
          title: "Brush teeth",
          description: "   ",
        },
        recordedAt: RECORDED_AT,
        source: "manual",
      }),
    ).toMatchObject({
      previousDescription: "Evening routine",
      nextDescription: null,
      changedFields: ["description"],
    });
  });

  it("returns null when title and description are unchanged after normalization", () => {
    expect(
      planBehaviorDefinitionChangeEvent({
        previousDefinition: {
          title: "Brush teeth",
          description: "Evening routine",
        },
        nextDefinition: {
          title: "  Brush teeth  ",
          description: " Evening routine ",
        },
        recordedAt: RECORDED_AT,
        source: "manual",
      }),
    ).toBeNull();
  });

  it("normalizes tabs and ECMAScript Unicode edge whitespace consistently", () => {
    expect(
      planBehaviorDefinitionChangeEvent({
        previousDefinition: {
          title: "\t\u00a0Brush teeth\u3000",
          description: "\u2003Evening routine\u202f",
        },
        nextDefinition: {
          title: "Brush teeth",
          description: "Evening routine",
        },
        recordedAt: RECORDED_AT,
        source: "manual",
      }),
    ).toBeNull();
  });
});
