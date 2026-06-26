import type { RecurrenceRule } from "@/lib/types/recurrence";
import type {
  BehaviorScheduleView,
  ScheduleKind,
  ScheduleSlotView,
  TimeRangePreset,
} from "@/lib/types/schedule";

export type ExportOccurrenceStatus = "unresolved" | "completed" | "not_completed";
export type ExportReminderDeliveryChannel = "browser_push" | "email";
export type ExportReminderDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "cancelled";

export type ExportRangeKey = "7" | "30" | "90" | "all";

export type ExportRangeOption = {
  key: ExportRangeKey;
  label: string;
};

export type ExportProfileInput = {
  timezone: string;
  subjectId: string;
  locale?: string;
  producerName?: string;
  producerVersion?: string;
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
  schedules?: BehaviorScheduleView[];
  scheduleSlots: ScheduleSlotView[];
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
  behaviorScheduleSlotId: string | null;
  scheduledFor: string;
  scheduledTimeLabel: string;
  scheduleKind: ScheduleKind;
  schedulePreset: TimeRangePreset | null;
  scheduleStartTime: string;
  scheduleEndTime: string | null;
  localDate: string;
  status: ExportOccurrenceStatus;
  completedAt: string | null;
  statusMarkedAt: string | null;
  note: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ExportStatusEventInput = {
  id: string;
  occurrenceId: string;
  behaviorId: string;
  previousStatus: ExportOccurrenceStatus | null;
  status: ExportOccurrenceStatus;
  statusSemantics:
    | "explicit_user_mark"
    | "explicit_user_correction"
    | "imported_explicit"
    | "system_rule_declared"
    | "ambiguous_import";
  recordedAt: string;
  effectiveAt: string | null;
  localDate: string;
  timezone: string;
  sourceCaptureMethod:
    | "manual_tap"
    | "manual_text"
    | "system_generated"
    | "imported"
    | "inferred"
    | "derived"
    | "ai_generated"
    | "unknown";
  sourceConfidence: "high" | "medium" | "low" | "ambiguous" | "unknown";
  revisesEventId: string | null;
  reasonCode: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ExportReminderDeliveryInput = {
  id: string;
  occurrenceId: string;
  channel: ExportReminderDeliveryChannel;
  scheduledSendAt: string;
  sentAt: string | null;
  status: ExportReminderDeliveryStatus;
  error: string | null;
  processingStartedAt?: string | null;
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
  completedCount: number;
  notCompletedCount: number;
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
  schedules: BehaviorScheduleView[];
  schedule_slots: ScheduleSlotView[];
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
  behavior_schedule_slot_id: string | null;
  behavior_title: string;
  category: string | null;
  scheduled_for: string;
  schedule: string;
  schedule_kind: ScheduleKind;
  schedule_preset: TimeRangePreset | null;
  schedule_start_time: string;
  schedule_end_time: string | null;
  local_date: string;
  timezone: string;
  status: ExportOccurrenceStatus;
  completed_at: string | null;
  status_marked_at: string | null;
  note: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BehaviorLogFile = {
  path: string;
  mediaType: string;
  content: string;
};

export type BehaviorLogBundle = {
  fileName: string;
  files: BehaviorLogFile[];
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
  behaviorLog: BehaviorLogBundle;
};
