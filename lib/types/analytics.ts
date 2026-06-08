export type AnalyticsStatus = "unresolved" | "done" | "not_done";

export type AnalyticsRangeDays = 7 | 30 | 90;

export type AnalyticsOccurrenceInput = {
  id: string;
  behaviorId: string;
  behaviorTitle: string;
  categoryName: string;
  scheduledFor: string;
  localDate: string;
  status: AnalyticsStatus;
  note: string;
  timezone: string;
};

export type AnalyticsStatusCounts = {
  doneCount: number;
  notDoneCount: number;
  unresolvedCount: number;
  resolvedCount: number;
  totalCount: number;
};

export type AnalyticsAdherence = {
  rate: number | null;
  percentLabel: string;
  detailLabel: string;
};

export type AnalyticsSummary = AnalyticsStatusCounts & AnalyticsAdherence;

export type AnalyticsOverallDayState =
  | "empty"
  | "completed"
  | "not_completed"
  | "unresolved";

export type AnalyticsBehaviorDayState =
  | "empty"
  | "full"
  | "partial"
  | "not_done"
  | "unresolved";

export type AnalyticsDayCell = {
  key: string;
  localDate: string;
  label: string;
  shortLabel: string;
  isSelected: boolean;
  state: AnalyticsOverallDayState;
  stateLabel: string;
  counts: AnalyticsStatusCounts;
  ariaLabel: string;
};

export type AnalyticsBehaviorDayCell = {
  key: string;
  localDate: string;
  label: string;
  shortLabel: string;
  state: AnalyticsBehaviorDayState;
  stateLabel: string;
  counts: AnalyticsStatusCounts;
  ariaLabel: string;
};

export type AnalyticsBehaviorSummary = AnalyticsStatusCounts &
  AnalyticsAdherence & {
    behaviorId: string;
    title: string;
    categoryName: string;
    dailyCells: AnalyticsBehaviorDayCell[];
  };

export type AnalyticsCategorySummary = AnalyticsStatusCounts &
  AnalyticsAdherence & {
    categoryName: string;
  };

export type AnalyticsNotDoneOccurrence = {
  id: string;
  behaviorId: string;
  title: string;
  categoryName: string;
  scheduledFor: string;
  scheduledTimeLabel: string;
  note: string;
};

export type AnalyticsSelectedDay = {
  localDate: string;
  label: string;
  notDoneOccurrences: AnalyticsNotDoneOccurrence[];
  emptyMessage: string;
};

export type AnalyticsView = {
  timezone: string;
  rangeDays: AnalyticsRangeDays;
  rangeOptions: AnalyticsRangeDays[];
  rangeStartLocalDate: string;
  rangeEndLocalDate: string;
  rangeLabel: string;
  summary: AnalyticsSummary;
  overallHeatmap: AnalyticsDayCell[];
  behaviorSummaries: AnalyticsBehaviorSummary[];
  categorySummaries: AnalyticsCategorySummary[];
  selectedDay: AnalyticsSelectedDay;
};
