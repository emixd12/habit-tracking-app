import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_OCCURRENCE_HORIZON_DAYS,
  planOccurrenceGeneration,
  type ExistingOccurrenceForGeneration,
  type OccurrenceGenerationBehavior,
} from "../lib/resolvers/occurrence.resolver";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

const BASE_BEHAVIOR: OccurrenceGenerationBehavior = {
  id: "behavior-1",
  userId: "user-1",
  recurrenceRule: { frequency: "daily", interval: 1 },
  scheduleSlots: [
    {
      id: null,
      kind: "exact",
      preset: null,
      startTime: "09:00",
      endTime: null,
      sortOrder: 0,
    },
  ],
  timezone: DEFAULT_TIMEZONE,
  active: true,
  createdAt: "2026-01-01T14:00:00Z",
};

const NOW = Temporal.Instant.from("2026-01-02T16:00:00Z");

function summarizeCreate(
  plan: ReturnType<typeof planOccurrenceGeneration>,
): Array<{ scheduledFor: string; localDate: string }> {
  return plan.create.map((occurrence) => ({
    scheduledFor: occurrence.scheduledFor,
    localDate: occurrence.localDate,
  }));
}

function existingOccurrence(
  id: string,
  scheduledFor: string,
  localDate: string,
  status: ExistingOccurrenceForGeneration["status"] = "unresolved",
): ExistingOccurrenceForGeneration {
  return {
    id,
    scheduledFor,
    localDate,
    status,
    scheduleSlotId: null,
    scheduleKind: "exact",
    schedulePreset: null,
    scheduleStartTime: "09:00",
    scheduleEndTime: null,
  };
}

describe("planOccurrenceGeneration", () => {
  it("plans today plus the next 30 local days by default", () => {
    const plan = planOccurrenceGeneration({
      behavior: BASE_BEHAVIOR,
      existingOccurrences: [],
      now: NOW,
    });

    expect(plan.generationWindow.startLocalDate).toBe("2026-01-02");
    expect(plan.generationWindow.endLocalDate).toBe("2026-02-01");
    expect(plan.create).toHaveLength(DEFAULT_OCCURRENCE_HORIZON_DAYS + 1);
    expect(summarizeCreate(plan).at(0)).toEqual({
      scheduledFor: "2026-01-02T14:00:00Z",
      localDate: "2026-01-02",
    });
    expect(summarizeCreate(plan).at(-1)).toEqual({
      scheduledFor: "2026-02-01T14:00:00Z",
      localDate: "2026-02-01",
    });
  });

  it("does not plan duplicate inserts for already generated occurrences", () => {
    const plan = planOccurrenceGeneration({
      behavior: BASE_BEHAVIOR,
      existingOccurrences: [
        existingOccurrence("existing-1", "2026-01-02T14:00:00+00:00", "2026-01-02"),
        existingOccurrence("existing-2", "2026-01-03T14:00:00+00:00", "2026-01-03"),
      ],
      now: NOW,
      horizonDays: 1,
    });

    expect(plan.create).toEqual([]);
    expect(plan.deleteUnresolvedIds).toEqual([]);
  });

  it("detects missing occurrences inside the generation window", () => {
    const plan = planOccurrenceGeneration({
      behavior: BASE_BEHAVIOR,
      existingOccurrences: [
        existingOccurrence("existing-1", "2026-01-02T14:00:00Z", "2026-01-02"),
        existingOccurrence("existing-3", "2026-01-04T14:00:00Z", "2026-01-04"),
      ],
      now: NOW,
      horizonDays: 2,
    });

    expect(summarizeCreate(plan)).toEqual([
      {
        scheduledFor: "2026-01-03T14:00:00Z",
        localDate: "2026-01-03",
      },
    ]);
    expect(plan.deleteUnresolvedIds).toEqual([]);
  });

  it("plans one occurrence per schedule slot on each matching day", () => {
    const plan = planOccurrenceGeneration({
      behavior: {
        ...BASE_BEHAVIOR,
        scheduleSlots: [
          {
            id: "slot-morning",
            kind: "range",
            preset: "morning",
            startTime: "06:00",
            endTime: "12:00",
            sortOrder: 0,
          },
          {
            id: "slot-evening",
            kind: "exact",
            preset: null,
            startTime: "21:30",
            endTime: null,
            sortOrder: 1,
          },
        ],
      },
      existingOccurrences: [],
      now: NOW,
      horizonDays: 0,
    });

    expect(plan.create).toEqual([
      expect.objectContaining({
        scheduledFor: "2026-01-02T11:00:00Z",
        localDate: "2026-01-02",
        scheduleSlotId: "slot-morning",
        scheduleKind: "range",
        schedulePreset: "morning",
        scheduleStartTime: "06:00",
        scheduleEndTime: "12:00",
      }),
      expect.objectContaining({
        scheduledFor: "2026-01-03T02:30:00Z",
        localDate: "2026-01-02",
        scheduleSlotId: "slot-evening",
        scheduleKind: "exact",
        schedulePreset: null,
        scheduleStartTime: "21:30",
        scheduleEndTime: null,
      }),
    ]);
  });

  it("plans nested schedules with independent recurrence rules", () => {
    const plan = planOccurrenceGeneration({
      behavior: {
        ...BASE_BEHAVIOR,
        schedules: [
          {
            id: "schedule-daily",
            recurrenceRule: { frequency: "daily", interval: 1 },
            sortOrder: 0,
            timeEntries: [
              {
                id: "slot-morning",
                scheduleId: "schedule-daily",
                kind: "exact",
                preset: null,
                startTime: "09:00",
                endTime: null,
                sortOrder: 0,
              },
            ],
          },
          {
            id: "schedule-friday",
            recurrenceRule: {
              frequency: "weekly",
              interval: 1,
              daysOfWeek: ["friday"],
            },
            sortOrder: 1,
            timeEntries: [
              {
                id: "slot-friday",
                scheduleId: "schedule-friday",
                kind: "range",
                preset: null,
                startTime: "17:00",
                endTime: "17:30",
                sortOrder: 0,
              },
            ],
          },
        ],
        scheduleSlots: [],
      },
      existingOccurrences: [],
      now: NOW,
      horizonDays: 2,
    });

    expect(
      plan.create.map((occurrence) => ({
        scheduledFor: occurrence.scheduledFor,
        localDate: occurrence.localDate,
        scheduleSlotId: occurrence.scheduleSlotId,
        scheduleKind: occurrence.scheduleKind,
        scheduleStartTime: occurrence.scheduleStartTime,
        scheduleEndTime: occurrence.scheduleEndTime,
      })),
    ).toEqual([
      {
        scheduledFor: "2026-01-02T14:00:00Z",
        localDate: "2026-01-02",
        scheduleSlotId: "slot-morning",
        scheduleKind: "exact",
        scheduleStartTime: "09:00",
        scheduleEndTime: null,
      },
      {
        scheduledFor: "2026-01-02T22:00:00Z",
        localDate: "2026-01-02",
        scheduleSlotId: "slot-friday",
        scheduleKind: "range",
        scheduleStartTime: "17:00",
        scheduleEndTime: "17:30",
      },
      {
        scheduledFor: "2026-01-03T14:00:00Z",
        localDate: "2026-01-03",
        scheduleSlotId: "slot-morning",
        scheduleKind: "exact",
        scheduleStartTime: "09:00",
        scheduleEndTime: null,
      },
      {
        scheduledFor: "2026-01-04T14:00:00Z",
        localDate: "2026-01-04",
        scheduleSlotId: "slot-morning",
        scheduleKind: "exact",
        scheduleStartTime: "09:00",
        scheduleEndTime: null,
      },
    ]);
  });

  it("merges duplicate generated occurrences from overlapping schedules", () => {
    const plan = planOccurrenceGeneration({
      behavior: {
        ...BASE_BEHAVIOR,
        schedules: [
          {
            id: "schedule-daily",
            recurrenceRule: { frequency: "daily", interval: 1 },
            sortOrder: 0,
            timeEntries: [
              {
                id: "slot-daily",
                scheduleId: "schedule-daily",
                kind: "exact",
                preset: null,
                startTime: "23:00",
                endTime: null,
                sortOrder: 0,
              },
            ],
          },
          {
            id: "schedule-every-two-days",
            recurrenceRule: { frequency: "interval_days", intervalDays: 2 },
            sortOrder: 1,
            timeEntries: [
              {
                id: "slot-every-two-days",
                scheduleId: "schedule-every-two-days",
                kind: "exact",
                preset: null,
                startTime: "23:00",
                endTime: null,
                sortOrder: 0,
              },
            ],
          },
        ],
        scheduleSlots: [],
      },
      existingOccurrences: [],
      now: NOW,
      horizonDays: 2,
    });

    expect(
      plan.create.map((occurrence) => ({
        scheduledFor: occurrence.scheduledFor,
        localDate: occurrence.localDate,
        scheduleSlotId: occurrence.scheduleSlotId,
      })),
    ).toEqual([
      {
        scheduledFor: "2026-01-03T04:00:00Z",
        localDate: "2026-01-02",
        scheduleSlotId: "slot-daily",
      },
      {
        scheduledFor: "2026-01-04T04:00:00Z",
        localDate: "2026-01-03",
        scheduleSlotId: "slot-daily",
      },
      {
        scheduledFor: "2026-01-05T04:00:00Z",
        localDate: "2026-01-04",
        scheduleSlotId: "slot-daily",
      },
    ]);
  });

  it("uses the behavior creation date as the interval anchor", () => {
    const plan = planOccurrenceGeneration({
      behavior: {
        ...BASE_BEHAVIOR,
        recurrenceRule: { frequency: "interval_days", intervalDays: 2 },
      },
      existingOccurrences: [],
      now: NOW,
      horizonDays: 4,
    });

    expect(summarizeCreate(plan)).toEqual([
      {
        scheduledFor: "2026-01-03T14:00:00Z",
        localDate: "2026-01-03",
      },
      {
        scheduledFor: "2026-01-05T14:00:00Z",
        localDate: "2026-01-05",
      },
    ]);
  });

  it("plans deletion only for stale future unresolved occurrences", () => {
    const plan = planOccurrenceGeneration({
      behavior: BASE_BEHAVIOR,
      existingOccurrences: [
        existingOccurrence("past-unresolved", "2026-01-01T15:00:00Z", "2026-01-01"),
        existingOccurrence("future-unresolved", "2026-01-02T15:00:00Z", "2026-01-02"),
        existingOccurrence("future-completed", "2026-01-03T15:00:00Z", "2026-01-03", "completed"),
        existingOccurrence("beyond-window-unresolved", "2026-01-05T15:00:00Z", "2026-01-05"),
      ],
      now: NOW,
      horizonDays: 1,
    });

    expect(plan.deleteUnresolvedIds).toEqual(["future-unresolved"]);
  });

  it("plans schedule snapshot updates for matching future unresolved rows", () => {
    const plan = planOccurrenceGeneration({
      behavior: {
        ...BASE_BEHAVIOR,
        scheduleSlots: [
          {
            id: "slot-morning",
            kind: "range",
            preset: "morning",
            startTime: "06:00",
            endTime: "12:00",
            sortOrder: 0,
          },
        ],
      },
      existingOccurrences: [
        {
          ...existingOccurrence(
            "future-unresolved",
            "2026-01-02T11:00:00Z",
            "2026-01-02",
          ),
          scheduleSlotId: null,
          scheduleKind: "exact",
          schedulePreset: null,
          scheduleStartTime: "06:00",
          scheduleEndTime: null,
        },
      ],
      now: NOW,
      horizonDays: 0,
    });

    expect(plan.create).toEqual([]);
    expect(plan.deleteUnresolvedIds).toEqual([]);
    expect(plan.updateUnresolved).toEqual([
      {
        id: "future-unresolved",
        scheduledFor: "2026-01-02T11:00:00Z",
        localDate: "2026-01-02",
        scheduleSlotId: "slot-morning",
        scheduleKind: "range",
        schedulePreset: "morning",
        scheduleStartTime: "06:00",
        scheduleEndTime: "12:00",
      },
    ]);
  });

  it("does not create occurrences for archived behaviors and removes future unresolved rows", () => {
    const plan = planOccurrenceGeneration({
      behavior: {
        ...BASE_BEHAVIOR,
        active: false,
      },
      existingOccurrences: [
        existingOccurrence("future-unresolved", "2026-01-02T14:00:00Z", "2026-01-02"),
        existingOccurrence("future-completed", "2026-01-03T14:00:00Z", "2026-01-03", "completed"),
      ],
      now: NOW,
      horizonDays: 1,
    });

    expect(plan.create).toEqual([]);
    expect(plan.deleteUnresolvedIds).toEqual(["future-unresolved"]);
  });
});
