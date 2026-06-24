export type AnalyticsStatus = "unresolved" | "completed" | "not_completed";

export type AnalyticsRangeDays = 7 | 30 | 90;

export type AnalyticsOccurrenceInput = {
  id: string;
  behaviorId: string;
  behaviorTitle: string;
  behaviorActive?: boolean;
  behaviorCreatedAt: string;
  categoryName: string;
  scheduledFor: string;
  scheduledTimeLabel: string;
  localDate: string;
  status: AnalyticsStatus;
  note: string;
  timezone: string;
};

export type AnalyticsStatusCounts = {
  completedCount: number;
  notCompletedCount: number;
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
  | "partial"
  | "not_completed"
  | "unresolved";

export type AnalyticsBehaviorDayState =
  | "empty"
  | "full"
  | "partial"
  | "not_completed"
  | "unresolved";

export type AnalyticsDayCell = {
  key: string;
  localDate: string;
  label: string;
  shortLabel: string;
  isSelected: boolean;
  state: AnalyticsOverallDayState;
  stateLabel: string;
  completionRate: number | null;
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
  isSelected: boolean;
  isTrackingStart: boolean;
  counts: AnalyticsStatusCounts;
  ariaLabel: string;
};

export type AnalyticsBehaviorSummary = AnalyticsStatusCounts &
  AnalyticsAdherence & {
    behaviorId: string;
    title: string;
    categoryName: string;
    trackingStartLocalDate: string;
    trackingStartLabel: string;
    dailyCells: AnalyticsBehaviorDayCell[];
  };

export type AnalyticsCategorySummary = AnalyticsStatusCounts &
  AnalyticsAdherence & {
    categoryName: string;
  };

export type AnalyticsSelectedDayOccurrence = {
  id: string;
  behaviorId: string;
  title: string;
  categoryName: string;
  scheduledFor: string;
  scheduledTimeLabel: string;
  status: AnalyticsStatus;
  statusLabel: string;
  note: string;
};

export type AnalyticsSelectedBehaviorDay = {
  behaviorId: string;
  behaviorTitle: string;
  localDate: string;
  label: string;
  occurrences: AnalyticsSelectedDayOccurrence[];
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
  selectedBehaviorDay: AnalyticsSelectedBehaviorDay | null;
};
