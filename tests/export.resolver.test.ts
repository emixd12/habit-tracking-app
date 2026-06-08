import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  normalizeExportRangeKey,
  resolveExportBundle,
  resolveExportDateRange,
} from "../lib/resolvers/export.resolver";
import type {
  ExportBehaviorInput,
  ExportCategoryInput,
  ExportOccurrenceInput,
} from "../lib/types/export";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

const NOW = Temporal.Instant.from("2026-06-08T16:00:00Z");

const categories: ExportCategoryInput[] = [
  {
    id: "category-grooming",
    name: "Grooming",
    sortOrder: 2,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
  },
  {
    id: "category-food",
    name: "Food / Drink",
    sortOrder: 1,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
  },
];

function behavior(
  overrides: Partial<ExportBehaviorInput> & Pick<ExportBehaviorInput, "id">,
): ExportBehaviorInput {
  return {
    categoryId: "category-grooming",
    categoryName: "Grooming",
    title: "Brush teeth",
    description: "Night brushing",
    recurrenceRule: {
      frequency: "daily",
      interval: 1,
    },
    scheduledTime: "22:00",
    timezone: DEFAULT_TIMEZONE,
    browserReminderEnabled: true,
    emailReminderEnabled: false,
    reminderOffsetMinutes: 0,
    active: true,
    archivedAt: null,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
    ...overrides,
  };
}

function occurrence(
  overrides: Partial<ExportOccurrenceInput> &
    Pick<ExportOccurrenceInput, "id">,
): ExportOccurrenceInput {
  return {
    behaviorId: "behavior-brush",
    scheduledFor: "2026-06-08T13:00:00Z",
    localDate: "2026-06-08",
    status: "done",
    completedAt: "2026-06-08T13:05:00Z",
    statusMarkedAt: "2026-06-08T13:05:00Z",
    note: null,
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T13:05:00Z",
    ...overrides,
  };
}

function resolve(overrides: {
  behaviors?: ExportBehaviorInput[];
  occurrences?: ExportOccurrenceInput[];
  range?: string | number | null;
  includeArchived?: boolean;
} = {}) {
  return resolveExportBundle({
    profile: {
      timezone: DEFAULT_TIMEZONE,
    },
    categories,
    behaviors: overrides.behaviors ?? [behavior({ id: "behavior-brush" })],
    occurrences: overrides.occurrences ?? [occurrence({ id: "occurrence-1" })],
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    range: overrides.range,
    includeArchived: overrides.includeArchived,
  });
}

describe("resolveExportDateRange", () => {
  it("defaults to the last 30 local days ending today", () => {
    expect(
      resolveExportDateRange({
        now: NOW,
        timezone: DEFAULT_TIMEZONE,
      }),
    ).toEqual({
      key: "30",
      label: "30 days",
      startLocalDate: "2026-05-10",
      endLocalDate: "2026-06-08",
      summaryLabel: "2026-05-10 to 2026-06-08",
    });
  });

  it("accepts only documented export range options", () => {
    expect(normalizeExportRangeKey("7")).toBe("7");
    expect(normalizeExportRangeKey(30)).toBe("30");
    expect(normalizeExportRangeKey("90")).toBe("90");
    expect(normalizeExportRangeKey("all")).toBe("all");
    expect(normalizeExportRangeKey("14")).toBe("30");
    expect(normalizeExportRangeKey(Number.NaN)).toBe("30");
  });
});

describe("resolveExportBundle", () => {
  it("emits valid JSONL with one category, behavior, or occurrence per line", () => {
    const bundle = resolve();
    const records = bundle.jsonl.split("\n").map((line) => JSON.parse(line));

    expect(records).toHaveLength(4);
    expect(records.map((record) => record.type)).toEqual([
      "category",
      "category",
      "behavior",
      "occurrence",
    ]);
    expect(records[0]).toMatchObject({
      type: "category",
      name: "Food / Drink",
      sort_order: 1,
    });
    expect(records[2]).toMatchObject({
      type: "behavior",
      behavior_title: "Brush teeth",
      recurrence_rule: {
        frequency: "daily",
        interval: 1,
      },
    });
    expect(records[3]).toMatchObject({
      type: "occurrence",
      behavior_title: "Brush teeth",
      local_date: "2026-06-08",
      scheduled_for: "2026-06-08T09:00:00-04:00",
      status: "done",
      note: null,
    });
  });

  it("escapes commas, quotes, and newlines in CSV cells", () => {
    const bundle = resolve({
      behaviors: [
        behavior({
          id: "behavior-brush",
          title: 'Brush, "teeth"',
          categoryName: "Grooming\nCare",
        }),
      ],
      occurrences: [
        occurrence({
          id: "csv-row",
          note: 'Line one\nLine "two", more',
        }),
      ],
    });

    expect(bundle.csv).toBe(
      [
        "local_date,scheduled_for,behavior_title,category,status,status_marked_at,note",
        '2026-06-08,2026-06-08T09:00:00-04:00,"Brush, ""teeth""","Grooming\nCare",done,2026-06-08T09:05:00-04:00,"Line one\nLine ""two"", more"',
      ].join("\n"),
    );
  });

  it("includes profile timezone, categories, behaviors, occurrences, and exported_at in full JSON", () => {
    const bundle = resolve();

    expect(bundle.jsonBackup).toMatchObject({
      exported_at: "2026-06-08T12:00:00-04:00",
      profile: {
        timezone: DEFAULT_TIMEZONE,
      },
      categories: [
        {
          id: "category-food",
          name: "Food / Drink",
        },
        {
          id: "category-grooming",
          name: "Grooming",
        },
      ],
      behaviors: [
        {
          id: "behavior-brush",
          title: "Brush teeth",
        },
      ],
      occurrences: [
        {
          id: "occurrence-1",
          behavior_title: "Brush teeth",
          note: null,
        },
      ],
    });
    expect(JSON.parse(bundle.json)).toEqual(bundle.jsonBackup);
  });

  it("calculates Markdown adherence with unresolved excluded", () => {
    const bundle = resolve({
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
          completedAt: null,
          statusMarkedAt: "2026-06-08T15:03:00Z",
        }),
        occurrence({
          id: "unresolved-1",
          status: "unresolved",
          scheduledFor: "2026-06-08T16:00:00Z",
          completedAt: null,
          statusMarkedAt: null,
        }),
      ],
    });

    expect(bundle.markdownSummary).toContain(
      "- Default adherence: 2 / (2 + 1) = 66.7%",
    );
    expect(bundle.markdownSummary).toContain(
      "- Brush teeth: 2 done, 1 not done, 1 unresolved, 66.7% adherence",
    );
    expect(bundle.overallCounts).toMatchObject({
      doneCount: 2,
      notDoneCount: 1,
      unresolvedCount: 1,
      resolvedCount: 3,
      totalCount: 4,
    });
  });

  it("excludes archived behaviors and their occurrences by default", () => {
    const bundle = resolve({
      behaviors: [
        behavior({ id: "behavior-active", title: "Active behavior" }),
        behavior({
          id: "behavior-archived",
          title: "Archived behavior",
          active: false,
          archivedAt: "2026-06-01T12:00:00Z",
        }),
      ],
      occurrences: [
        occurrence({
          id: "active-occurrence",
          behaviorId: "behavior-active",
        }),
        occurrence({
          id: "archived-occurrence",
          behaviorId: "behavior-archived",
        }),
      ],
    });

    expect(bundle.behaviorCount).toBe(1);
    expect(bundle.occurrenceCount).toBe(1);
    expect(bundle.json).toContain("Active behavior");
    expect(bundle.json).not.toContain("Archived behavior");
  });

  it("includes archived behaviors and their occurrences when selected", () => {
    const bundle = resolve({
      includeArchived: true,
      behaviors: [
        behavior({ id: "behavior-active", title: "Active behavior" }),
        behavior({
          id: "behavior-archived",
          title: "Archived behavior",
          active: false,
          archivedAt: "2026-06-01T12:00:00Z",
        }),
      ],
      occurrences: [
        occurrence({
          id: "active-occurrence",
          behaviorId: "behavior-active",
        }),
        occurrence({
          id: "archived-occurrence",
          behaviorId: "behavior-archived",
        }),
      ],
    });

    expect(bundle.behaviorCount).toBe(2);
    expect(bundle.occurrenceCount).toBe(2);
    expect(bundle.json).toContain("Archived behavior");
  });

  it("filters occurrences by local-date range and excludes future rows", () => {
    const bundle = resolve({
      range: "7",
      occurrences: [
        occurrence({
          id: "too-old",
          localDate: "2026-05-31",
          scheduledFor: "2026-05-31T13:00:00Z",
        }),
        occurrence({
          id: "inside-range",
          localDate: "2026-06-02",
          scheduledFor: "2026-06-02T13:00:00Z",
        }),
        occurrence({
          id: "future",
          localDate: "2026-06-09",
          scheduledFor: "2026-06-09T13:00:00Z",
        }),
      ],
    });

    expect(bundle.range).toMatchObject({
      key: "7",
      startLocalDate: "2026-06-02",
      endLocalDate: "2026-06-08",
    });
    expect(bundle.jsonBackup.occurrences.map((row) => row.id)).toEqual([
      "inside-range",
    ]);
  });
});
