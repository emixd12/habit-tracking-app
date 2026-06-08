import type { RecurrenceRule } from "@/lib/types/recurrence";

export type ExportOccurrenceStatus = "unresolved" | "done" | "not_done";

export type ExportRangeKey = "7" | "30" | "90" | "all";

export type ExportRangeOption = {
  key: ExportRangeKey;
  label: string;
};

export type ExportProfileInput = {
  timezone: string;
};

export type ExportCategoryInput = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ExportBehaviorInput = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  description: string | null;
  recurrenceRule: RecurrenceRule;
  scheduledTime: string;
  timezone: string;
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  active: boolean;
  archivedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ExportOccurrenceInput = {
  id: string;
  behaviorId: string;
  scheduledFor: string;
  localDate: string;
  status: ExportOccurrenceStatus;
  completedAt: string | null;
  statusMarkedAt: string | null;
  note: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ExportDateRange = {
  key: ExportRangeKey;
  label: string;
  startLocalDate: string | null;
  endLocalDate: string;
  summaryLabel: string;
};

export type ExportStatusCounts = {
  doneCount: number;
  notDoneCount: number;
  unresolvedCount: number;
  resolvedCount: number;
  totalCount: number;
};

export type ExportJsonBackup = {
  exported_at: string;
  profile: {
    timezone: string;
  };
  categories: ExportJsonCategory[];
  behaviors: ExportJsonBehavior[];
  occurrences: ExportJsonOccurrence[];
};

export type ExportJsonCategory = {
  id: string;
  name: string;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ExportJsonBehavior = {
  id: string;
  category_id: string | null;
  category: string | null;
  title: string;
  description: string | null;
  recurrence_rule: RecurrenceRule;
  scheduled_time: string;
  timezone: string;
  browser_reminder_enabled: boolean;
  email_reminder_enabled: boolean;
  reminder_offset_minutes: number;
  active: boolean;
  archived_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ExportJsonOccurrence = {
  id: string;
  behavior_id: string;
  behavior_title: string;
  category: string | null;
  scheduled_for: string;
  local_date: string;
  status: ExportOccurrenceStatus;
  completed_at: string | null;
  status_marked_at: string | null;
  note: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ExportBundle = {
  timezone: string;
  exportedAt: string;
  includeArchived: boolean;
  range: ExportDateRange;
  rangeOptions: ExportRangeOption[];
  categoryCount: number;
  behaviorCount: number;
  occurrenceCount: number;
  overallCounts: ExportStatusCounts;
  overallAdherenceLabel: string;
  jsonl: string;
  csv: string;
  jsonBackup: ExportJsonBackup;
  json: string;
  markdownSummary: string;
  fileBaseName: string;
  markdownFileName: string;
};
