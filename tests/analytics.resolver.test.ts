import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  ANALYTICS_DEFAULT_RANGE_DAYS,
  normalizeAnalyticsRangeDays,
  resolveAnalytics,
  resolveAnalyticsDateRange,
} from "../lib/resolvers/analytics.resolver";
import type { AnalyticsOccurrenceInput } from "../lib/types/analytics";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

const NOW = Temporal.Instant.from("2026-06-08T16:00:00Z");

function occurrence(
  overrides: Partial<AnalyticsOccurrenceInput> &
    Pick<AnalyticsOccurrenceInput, "id">,
): AnalyticsOccurrenceInput {
  return {
    behaviorId: "behavior-a",
    behaviorTitle: "Brush teeth",
    categoryName: "Grooming",
    scheduledFor: "2026-06-08T13:00:00Z",
    localDate: "2026-06-08",
    status: "done",
    note: "",
    timezone: DEFAULT_TIMEZONE,
    ...overrides,
  };
}

describe("resolveAnalyticsDateRange", () => {
  it("defaults to the last 30 local days ending today", () => {
    expect(
      resolveAnalyticsDateRange({
        now: NOW,
        timezone: DEFAULT_TIMEZONE,
      }),
    ).toEqual({
      timezone: DEFAULT_TIMEZONE,
      rangeDays: ANALYTICS_DEFAULT_RANGE_DAYS,
      startLocalDate: "2026-05-10",
      endLocalDate: "2026-06-08",
    });
  });

  it("accepts only the documented range options", () => {
    expect(normalizeAnalyticsRangeDays(7)).toBe(7);
    expect(normalizeAnalyticsRangeDays(30)).toBe(30);
    expect(normalizeAnalyticsRangeDays(90)).toBe(90);
    expect(normalizeAnalyticsRangeDays(14)).toBe(30);
    expect(normalizeAnalyticsRangeDays(Number.NaN)).toBe(30);
  });
});

describe("resolveAnalytics", () => {
  it("excludes unresolved occurrences from default adherence", () => {
    const analytics = resolveAnalytics({
      now: NOW,
      timezone: DEFAULT_TIMEZONE,
      rangeDays: 30,
      occurrences: [
        occurrence({ id: "done-1", status: "done" }),
        occurrence({
          id: "done-2",
          status: "done",
          scheduledFor: "2026-06-08T14:00:00Z",
        }),
        occurrence({
          id: "not-done-1",
          status: "not_done",
          scheduledFor: "2026-06-08T15:00:00Z",
        }),
        occurrence({
          id: "unresolved-1",
          status: "unresolved",
          scheduledFor: "2026-06-08T16:00:00Z",
        }),
      ],
    });

    expect(analytics.summary).toMatchObject({
      doneCount: 2,
      notDoneCount: 1,
      unresolvedCount: 1,
      resolvedCount: 3,
      totalCount: 4,
      percentLabel: "66.7%",
      detailLabel: "2 of 3 resolved Completed",
    });
  });

  it("returns behavior and category completion counts", () => {
    const analytics = resolveAnalytics({
      now: NOW,
      timezone: DEFAULT_TIMEZONE,
      rangeDays: 7,
      occurrences: [
        occurrence({
          id: "brush-done",
          behaviorId: "brush",
          behaviorTitle: "Brush teeth",
          categoryName: "Grooming",
          status: "done",
        }),
        occurrence({
          id: "brush-not-done",
          behaviorId: "brush",
          behaviorTitle: "Brush teeth",
          categoryName: "Grooming",
          status: "not_done",
          scheduledFor: "2026-06-07T13:00:00Z",
          localDate: "2026-06-07",
        }),
        occurrence({
          id: "water-unresolved",
          behaviorId: "water",
          behaviorTitle: "Drink water",
          categoryName: "Food / Drink",
          status: "unresolved",
        }),
      ],
    });

    expect(analytics.behaviorSummaries).toMatchObject([
      {
        behaviorId: "brush",
        title: "Brush teeth",
        categoryName: "Grooming",
        doneCount: 1,
        notDoneCount: 1,
        unresolvedCount: 0,
        percentLabel: "50%",
      },
      {
        behaviorId: "water",
        title: "Drink water",
        categoryName: "Food / Drink",
        doneCount: 0,
        notDoneCount: 0,
        unresolvedCount: 1,
        percentLabel: "No resolved occurrences",
      },
    ]);
    expect(analytics.categorySummaries).toMatchObject([
      {
        categoryName: "Food / Drink",
        unresolvedCount: 1,
      },
      {
        categoryName: "Grooming",
        doneCount: 1,
        notDoneCount: 1,
      },
    ]);
  });

  it("builds an overall binary heatmap with unresolved shown separately", () => {
    const analytics = resolveAnalytics({
      now: NOW,
      timezone: DEFAULT_TIMEZONE,
      rangeDays: 7,
      selectedDayLocalDate: "2026-06-07",
      occurrences: [
        occurrence({
          id: "completed-day",
          localDate: "2026-06-06",
          scheduledFor: "2026-06-06T13:00:00Z",
          status: "done",
        }),
        occurrence({
          id: "not-completed-day",
          localDate: "2026-06-07",
          scheduledFor: "2026-06-07T13:00:00Z",
          status: "not_done",
        }),
        occurrence({
          id: "unresolved-day",
          localDate: "2026-06-08",
          status: "unresolved",
        }),
      ],
    });

    expect(
      analytics.overallHeatmap.map((cell) => ({
        localDate: cell.localDate,
        state: cell.state,
        isSelected: cell.isSelected,
      })),
    ).toEqual([
      { localDate: "2026-06-02", state: "empty", isSelected: false },
      { localDate: "2026-06-03", state: "empty", isSelected: false },
      { localDate: "2026-06-04", state: "empty", isSelected: false },
      { localDate: "2026-06-05", state: "empty", isSelected: false },
      { localDate: "2026-06-06", state: "completed", isSelected: false },
      { localDate: "2026-06-07", state: "not_completed", isSelected: true },
      { localDate: "2026-06-08", state: "unresolved", isSelected: false },
    ]);
  });

  it("represents full, partial, not completed, and unresolved behavior day states", () => {
    const analytics = resolveAnalytics({
      now: NOW,
      timezone: DEFAULT_TIMEZONE,
      rangeDays: 7,
      occurrences: [
        occurrence({
          id: "full-1",
          localDate: "2026-06-05",
          scheduledFor: "2026-06-05T13:00:00Z",
          status: "done",
        }),
        occurrence({
          id: "full-2",
          localDate: "2026-06-05",
          scheduledFor: "2026-06-05T22:00:00Z",
          status: "done",
        }),
        occurrence({
          id: "partial-1",
          localDate: "2026-06-06",
          scheduledFor: "2026-06-06T13:00:00Z",
          status: "done",
        }),
        occurrence({
          id: "partial-2",
          localDate: "2026-06-06",
          scheduledFor: "2026-06-06T22:00:00Z",
          status: "not_done",
        }),
        occurrence({
          id: "not-done",
          localDate: "2026-06-07",
          scheduledFor: "2026-06-07T13:00:00Z",
          status: "not_done",
        }),
        occurrence({
          id: "unresolved",
          localDate: "2026-06-08",
          status: "unresolved",
        }),
      ],
    });

    const behavior = analytics.behaviorSummaries[0];

    expect(
      behavior?.dailyCells
        .filter((cell) => cell.state !== "empty")
        .map((cell) => ({
          localDate: cell.localDate,
          state: cell.state,
          doneCount: cell.counts.doneCount,
          notDoneCount: cell.counts.notDoneCount,
          unresolvedCount: cell.counts.unresolvedCount,
        })),
    ).toEqual([
      {
        localDate: "2026-06-05",
        state: "full",
        doneCount: 2,
        notDoneCount: 0,
        unresolvedCount: 0,
      },
      {
        localDate: "2026-06-06",
        state: "partial",
        doneCount: 1,
        notDoneCount: 1,
        unresolvedCount: 0,
      },
      {
        localDate: "2026-06-07",
        state: "not_done",
        doneCount: 0,
        notDoneCount: 1,
        unresolvedCount: 0,
      },
      {
        localDate: "2026-06-08",
        state: "unresolved",
        doneCount: 0,
        notDoneCount: 0,
        unresolvedCount: 1,
      },
    ]);
  });

  it("returns Not Completed occurrences for the selected day", () => {
    const analytics = resolveAnalytics({
      now: NOW,
      timezone: DEFAULT_TIMEZONE,
      rangeDays: 7,
      selectedDayLocalDate: "2026-06-07",
      occurrences: [
        occurrence({
          id: "selected-later",
          behaviorId: "workout",
          behaviorTitle: "Workout",
          categoryName: "Fitness",
          localDate: "2026-06-07",
          scheduledFor: "2026-06-07T22:30:00Z",
          status: "not_done",
          note: "Skipped after travel.",
        }),
        occurrence({
          id: "selected-earlier",
          behaviorId: "brush",
          behaviorTitle: "Brush teeth",
          categoryName: "Grooming",
          localDate: "2026-06-07",
          scheduledFor: "2026-06-07T13:00:00Z",
          status: "not_done",
        }),
        occurrence({
          id: "selected-done",
          localDate: "2026-06-07",
          scheduledFor: "2026-06-07T14:00:00Z",
          status: "done",
        }),
      ],
    });

    expect(analytics.selectedDay).toMatchObject({
      localDate: "2026-06-07",
      label: "Sunday, June 7",
      notDoneOccurrences: [
        {
          id: "selected-earlier",
          title: "Brush teeth",
          categoryName: "Grooming",
          scheduledTimeLabel: "9:00 AM",
          note: "",
        },
        {
          id: "selected-later",
          title: "Workout",
          categoryName: "Fitness",
          scheduledTimeLabel: "6:30 PM",
          note: "Skipped after travel.",
        },
      ],
    });
  });

  it("falls back to the range end when the selected day is invalid or outside the range", () => {
    const invalidDay = resolveAnalytics({
      now: NOW,
      timezone: DEFAULT_TIMEZONE,
      rangeDays: 7,
      selectedDayLocalDate: "not-a-day",
      occurrences: [],
    });
    const outsideRange = resolveAnalytics({
      now: NOW,
      timezone: DEFAULT_TIMEZONE,
      rangeDays: 7,
      selectedDayLocalDate: "2026-05-01",
      occurrences: [],
    });

    expect(invalidDay.selectedDay.localDate).toBe("2026-06-08");
    expect(outsideRange.selectedDay.localDate).toBe("2026-06-08");
  });
});
