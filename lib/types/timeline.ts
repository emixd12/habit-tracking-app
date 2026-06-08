export type TimelineStatus = "unresolved" | "done" | "not_done";

export type TimelineOccurrenceInput = {
  id: string;
  behaviorId: string;
  title: string;
  description: string;
  categoryName: string;
  scheduleSummary: string;
  scheduledFor: string;
  scheduledTimeLabel: string;
  localDate: string;
  status: TimelineStatus;
  note: string;
};

export type TimelineVisualTone =
  | "default"
  | "needs_decision"
  | "done"
  | "not_done";

export type TimelineOccurrenceView = {
  id: string;
  behaviorId: string;
  title: string;
  scheduledFor: string;
  scheduledTimeLabel: string;
  localDate: string;
  status: TimelineStatus;
  statusLabel: string;
  statusDetail: string;
  visualTone: TimelineVisualTone;
  showDecisionActions: boolean;
  description: string;
  categoryName: string;
  scheduleSummary: string;
  note: string;
};

export type TimelineDaySectionKind = "today" | "future" | "needs_decision_day";

export type TimelineDaySection = {
  key: string;
  kind: TimelineDaySectionKind;
  localDate: string;
  label: string;
  relativeLabel: string;
  emptyMessage: string;
  occurrences: TimelineOccurrenceView[];
};

export type TimelineNeedsDecisionGroup = {
  title: string;
  emptyMessage: string;
  occurrenceCount: number;
  daySections: TimelineDaySection[];
};

export type TimelineView = {
  timezone: string;
  todayLocalDate: string;
  visibleFutureDays: number;
  maxFutureDays: number;
  nextFutureDays: number | null;
  needsDecision: TimelineNeedsDecisionGroup;
  daySections: TimelineDaySection[];
};
