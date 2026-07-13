import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

import { BehaviorForm } from "../components/behaviors/BehaviorForm";
import { BehaviorList } from "../components/behaviors/BehaviorList";
import { StatusButtons } from "../components/timeline/StatusButtons";
import type { AnalyticsView } from "../lib/types/analytics";
import type {
  BehaviorActionState,
  BehaviorFormAction,
  BehaviorView,
} from "../lib/types/behavior";
import type {
  OccurrenceActionState,
  OccurrenceFormAction,
} from "../lib/types/timeline";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

const behaviorAction: BehaviorFormAction = async (
  state: BehaviorActionState,
) => state;

const occurrenceAction: OccurrenceFormAction = async (
  state: OccurrenceActionState,
) => state;

describe("behavior date review UI", () => {
  it("renders weekday checkboxes only for weekly recurrence", () => {
    const dailyBehavior = behaviorView();
    const dailyHtml = renderToStaticMarkup(
      <BehaviorForm
        mode="edit"
        action={behaviorAction}
        categories={[{ id: "category-1", name: "Health" }]}
        behavior={dailyBehavior}
      />,
    );
    const weeklyBehavior: BehaviorView = {
      ...dailyBehavior,
      recurrenceDefaults: {
        ...dailyBehavior.recurrenceDefaults,
        kind: "weekly",
        weeklyDays: ["monday", "wednesday"],
      },
    };
    const weeklyHtml = renderToStaticMarkup(
      <BehaviorForm
        mode="edit"
        action={behaviorAction}
        categories={[{ id: "category-1", name: "Health" }]}
        behavior={weeklyBehavior}
      />,
    );

    expect(dailyHtml).not.toContain('name="schedule_0_weekly_days"');
    expect(weeklyHtml.match(/name="schedule_0_weekly_days"/g)).toHaveLength(7);
  });

  it("gives actionable heatmap days review scent and names the selected-day panel", () => {
    const behavior = behaviorView();
    const analytics = analyticsView(behavior);
    const html = renderToStaticMarkup(
      <BehaviorList
        activeBehaviors={[behavior]}
        archivedBehaviors={[]}
        categories={[{ id: "category-1", name: "Health" }]}
        analytics={analytics}
        updateAction={behaviorAction}
        archiveAction={behaviorAction}
        restoreAction={behaviorAction}
        statusAction={occurrenceAction}
        noteAction={occurrenceAction}
      />,
    );

    expect(html).toContain("Friday, June 5; Full; 1 Completed");
    expect(html).toContain("open day review");
    expect(html).toContain("Review selected day");
    expect(html).toContain("Date of behavior");
    expect(html).toContain("Change status");
    expect(html).toContain("Clear decision");
    expect(html).toContain('name="status" value="unresolved"');
  });

  it("does not render Clear decision for an unresolved selected-day occurrence", () => {
    const behavior = behaviorView();
    const analytics = analyticsView(behavior, "unresolved");
    const html = renderToStaticMarkup(
      <BehaviorList
        activeBehaviors={[behavior]}
        archivedBehaviors={[]}
        categories={[{ id: "category-1", name: "Health" }]}
        analytics={analytics}
        updateAction={behaviorAction}
        archiveAction={behaviorAction}
        restoreAction={behaviorAction}
        statusAction={occurrenceAction}
        noteAction={occurrenceAction}
      />,
    );

    expect(html).not.toContain("Clear decision");
  });

  it("uses Unmark for Timeline status controls that include unresolved", () => {
    const html = renderToStaticMarkup(
      <StatusButtons
        occurrenceId="occurrence-1"
        currentStatus="completed"
        action={occurrenceAction}
        includeUnresolved
        compact
      />,
    );

    expect(html).toContain("Unmark");
    expect(html).not.toContain("Clear decision");
    expect(html).toContain('name="status" value="unresolved"');
  });
});

function behaviorView(): BehaviorView {
  return {
    id: "behavior-1",
    title: "Walk",
    description: "Evening walk",
    categoryId: "category-1",
    categoryName: "Health",
    recurrenceSummary: "Daily",
    recurrenceDefaults: {
      kind: "daily",
      dailyInterval: 1,
      everyDays: 2,
      weeklyInterval: 1,
      weeklyDays: ["monday"],
      monthlyInterval: 1,
      monthlyDay: 5,
    },
    scheduledTime: "18:00",
    scheduledTimeLabel: "6:00 PM",
    schedules: [],
    scheduleSlots: [
      {
        id: "slot-1",
        kind: "exact",
        preset: null,
        startTime: "18:00",
        endTime: null,
        sortOrder: 0,
        label: "6:00 PM",
      },
    ],
    scheduleSummary: "6:00 PM",
    timezone: "America/New_York",
    browserReminderEnabled: true,
    emailReminderEnabled: false,
    reminderOffsetMinutes: 0,
    reminderSummary: "Browser reminders",
    active: true,
    archivedAt: null,
    createdAt: "2026-06-01T12:00:00Z",
    updatedAt: "2026-06-01T12:00:00Z",
  };
}

function analyticsView(
  behavior: BehaviorView,
  selectedOccurrenceStatus: "completed" | "unresolved" = "completed",
): AnalyticsView {
  const counts = {
    completedCount: 1,
    notCompletedCount: 0,
    unresolvedCount: 0,
    resolvedCount: 1,
    totalCount: 1,
  };
  const emptyCounts = {
    completedCount: 0,
    notCompletedCount: 0,
    unresolvedCount: 0,
    resolvedCount: 0,
    totalCount: 0,
  };

  return {
    timezone: "America/New_York",
    rangeDays: 30,
    rangeOptions: [7, 30, 90],
    rangeStartLocalDate: "2026-05-07",
    rangeEndLocalDate: "2026-06-05",
    rangeLabel: "Last 30 days",
    summary: {
      ...counts,
      rate: 1,
      percentLabel: "100%",
      detailLabel: "1 / 1",
    },
    overallHeatmap: [
      {
        key: "overall-2026-06-05",
        localDate: "2026-06-05",
        label: "Friday, June 5",
        shortLabel: "Jun 5",
        isSelected: true,
        state: "completed",
        stateLabel: "Completed",
        completionRate: 1,
        counts,
        ariaLabel: "Friday, June 5: Completed; 1 Completed",
      },
    ],
    behaviorSummaries: [
      {
        behaviorId: behavior.id,
        title: behavior.title,
        categoryName: behavior.categoryName,
        trackingStartLocalDate: "2026-06-01",
        trackingStartLabel: "Jun 1",
        dailyCells: [
          {
            key: "behavior-1-2026-06-05",
            localDate: "2026-06-05",
            label: "Friday, June 5",
            shortLabel: "Jun 5",
            state: "full",
            stateLabel: "Full",
            isSelected: true,
            isTrackingStart: false,
            counts,
            ariaLabel: "Friday, June 5; Full; 1 Completed",
          },
          {
            key: "behavior-1-2026-06-04",
            localDate: "2026-06-04",
            label: "Thursday, June 4",
            shortLabel: "Jun 4",
            state: "empty",
            stateLabel: "Empty",
            isSelected: false,
            isTrackingStart: false,
            counts: emptyCounts,
            ariaLabel: "Thursday, June 4; Empty",
          },
        ],
        ...counts,
        rate: 1,
        percentLabel: "100%",
        detailLabel: "1 / 1",
      },
    ],
    categorySummaries: [],
    selectedBehaviorDay: {
      behaviorId: behavior.id,
      behaviorTitle: behavior.title,
      localDate: "2026-06-05",
      label: "Friday, June 5",
      occurrences: [
        {
          id: "occurrence-1",
          behaviorId: behavior.id,
          title: behavior.title,
          categoryName: behavior.categoryName,
          scheduledFor: "2026-06-05T22:00:00Z",
          scheduledTimeLabel: "6:00 PM",
          status: selectedOccurrenceStatus,
          statusLabel:
            selectedOccurrenceStatus === "completed" ? "Completed" : "Unresolved",
          note: "",
        },
      ],
    },
  };
}
