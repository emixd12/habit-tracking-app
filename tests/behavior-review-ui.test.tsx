import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

import {
  BehaviorForm,
  resetBehaviorScheduleDraft,
} from "../components/behaviors/BehaviorForm";
import {
  BehaviorActionResultAnnouncement,
  BehaviorList,
} from "../components/behaviors/BehaviorList";
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

  it("restores every controlled schedule value to the initial edit draft", () => {
    const behavior = behaviorViewWithSchedules();
    const dirtyDraft = resetBehaviorScheduleDraft([], behavior);

    dirtyDraft[0]!.recurrenceKind = "daily";
    dirtyDraft[0]!.timeEntries[0] = {
      ...dirtyDraft[0]!.timeEntries[0]!,
      kind: "exact",
      exactTime: "09:15",
      rangePreset: null,
    };
    dirtyDraft.splice(1, 1);

    expect(resetBehaviorScheduleDraft(dirtyDraft, behavior)).toMatchObject([
      {
        id: "schedule-monthly",
        recurrenceKind: "monthly",
        recurrenceDefaults: {
          kind: "monthly",
          monthlyInterval: 2,
          monthlyDay: 31,
        },
        timeEntries: [
          {
            id: "slot-evening",
            kind: "range",
            rangeStart: "18:00",
            rangeEnd: "00:00",
            rangePreset: "evening",
          },
          {
            id: "slot-late",
            kind: "exact",
            exactTime: "22:30",
          },
        ],
      },
      {
        id: "schedule-weekly",
        recurrenceKind: "weekly",
        timeEntries: [
          {
            id: "slot-morning",
            kind: "exact",
            exactTime: "07:00",
          },
        ],
      },
    ]);
  });

  it("names every repeated time-mode control by schedule and time row", () => {
    const html = renderToStaticMarkup(
      <BehaviorForm
        mode="edit"
        action={behaviorAction}
        categories={[{ id: "category-1", name: "Health" }]}
        behavior={behaviorViewWithSchedules()}
      />,
    );

    expect(html).toContain('aria-label="Schedule 1, time 1 mode"');
    expect(html).toContain('aria-label="Schedule 1, time 2 mode"');
    expect(html).toContain('aria-label="Schedule 2, time 1 mode"');
    expect(html).toContain('<button type="reset"');
    expect(html).toContain('name="email_reminder" checked=""');
    expect(html).toContain(
      '<option value="1440" selected="">1 day before</option>',
    );
  });

  it("keeps archive and restore results above moving rows with status and alert semantics", () => {
    const source = readFileSync(
      new URL("../components/behaviors/BehaviorList.tsx", import.meta.url),
      "utf8",
    );
    const parentStart = source.indexOf("export function BehaviorList(");
    const announcementStart = source.indexOf(
      "export function BehaviorActionResultAnnouncement(",
    );
    const rowFormStart = source.indexOf("function BehaviorStateForm(");
    const rowButtonStart = source.indexOf("function BehaviorStateButton(");
    const parentSource = source.slice(parentStart, announcementStart);
    const rowFormSource = source.slice(rowFormStart, rowButtonStart);
    const archivedHtml = renderToStaticMarkup(
      <BehaviorActionResultAnnouncement
        result={{ status: "success", message: "Behavior archived." }}
      />,
    );
    const restoreFailureHtml = renderToStaticMarkup(
      <BehaviorActionResultAnnouncement
        result={{ status: "error", message: "Behavior could not be restored." }}
      />,
    );

    expect(parentSource.match(/useActionState\(/g)).toHaveLength(1);
    expect(parentSource).toContain('intent === "archive" ? archiveAction : restoreAction');
    expect(rowFormSource).not.toContain("useActionState(");
    expect(archivedHtml).toContain('role="status"');
    expect(archivedHtml).toContain("Behavior archived.");
    expect(restoreFailureHtml).toContain('role="alert"');
    expect(restoreFailureHtml).toContain("Behavior could not be restored.");
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

function behaviorViewWithSchedules(): BehaviorView {
  return {
    ...behaviorView(),
    browserReminderEnabled: false,
    emailReminderEnabled: true,
    reminderOffsetMinutes: 1440,
    schedules: [
      {
        id: "schedule-monthly",
        recurrenceRule: {
          frequency: "monthly",
          interval: 2,
          dayOfMonth: 31,
        },
        recurrenceSummary: "Every 2 months on day 31",
        recurrenceDefaults: {
          kind: "monthly",
          dailyInterval: 1,
          everyDays: 2,
          weeklyInterval: 1,
          weeklyDays: ["monday"],
          monthlyInterval: 2,
          monthlyDay: 31,
        },
        timeEntries: [
          {
            id: "slot-evening",
            kind: "range",
            preset: "evening",
            startTime: "18:00",
            endTime: "00:00",
            sortOrder: 0,
            label: "Evening",
          },
          {
            id: "slot-late",
            kind: "exact",
            preset: null,
            startTime: "22:30",
            endTime: null,
            sortOrder: 1,
            label: "10:30 PM",
          },
        ],
        timeSummary: "Evening, 10:30 PM",
        sortOrder: 0,
      },
      {
        id: "schedule-weekly",
        recurrenceRule: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: ["monday", "wednesday"],
        },
        recurrenceSummary: "Weekly on Monday and Wednesday",
        recurrenceDefaults: {
          kind: "weekly",
          dailyInterval: 1,
          everyDays: 2,
          weeklyInterval: 1,
          weeklyDays: ["monday", "wednesday"],
          monthlyInterval: 1,
          monthlyDay: 1,
        },
        timeEntries: [
          {
            id: "slot-morning",
            kind: "exact",
            preset: null,
            startTime: "07:00",
            endTime: null,
            sortOrder: 0,
            label: "7:00 AM",
          },
        ],
        timeSummary: "7:00 AM",
        sortOrder: 1,
      },
    ],
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
