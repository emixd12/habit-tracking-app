import type { OccurrenceStatus } from "@/lib/types/database";

export type BehaviorLogImportFile = {
  path: string;
  content: string;
  mediaType?: string | null;
};

export type BehaviorLogImportSeverity = "error" | "warning";

export type BehaviorLogImportIssue = {
  severity: BehaviorLogImportSeverity;
  code: string;
  message: string;
  file?: string;
  row?: number;
  path?: string;
};

export type BehaviorLogUnsupportedField = {
  file: string;
  row: number;
  recordType: string;
  recordId: string | null;
  fields: string[];
};

export type BehaviorLogImportConflict = {
  code: string;
  message: string;
  importedRecordType:
    | "behavior"
    | "schedule"
    | "occurrence"
    | "status_event"
    | "note";
  importedId: string;
  existingId?: string;
  localDate?: string;
  timezone?: string;
};

export type BehaviorLogImportPlanAction = "create" | "skip";

export type BehaviorLogSourceConfidence =
  | "high"
  | "medium"
  | "low"
  | "ambiguous"
  | "unknown";

export type BehaviorLogSourceCaptureMethod =
  | "manual_tap"
  | "manual_text"
  | "system_generated"
  | "imported"
  | "inferred"
  | "derived"
  | "ai_generated"
  | "unknown";

export type BehaviorLogStatusSemantics =
  | "explicit_user_mark"
  | "explicit_user_correction"
  | "imported_explicit"
  | "system_rule_declared"
  | "ambiguous_import";

export type BehaviorLogExistingBehavior = {
  id: string;
  title: string;
  category?: string | null;
  archivedAt?: string | null;
};

export type BehaviorLogExistingOccurrence = {
  id: string;
  behaviorId: string;
  behaviorTitle?: string | null;
  scheduledForUtc: string;
  localDate: string;
  timezone: string;
  status: OccurrenceStatus;
};

export type BehaviorLogExistingStatusEvent = {
  id: string;
  occurrenceId: string;
  behaviorId: string;
  recordedAtUtc: string;
  status: OccurrenceStatus;
};

export type BehaviorLogExistingRecords = {
  behaviors?: BehaviorLogExistingBehavior[];
  occurrences?: BehaviorLogExistingOccurrence[];
  statusEvents?: BehaviorLogExistingStatusEvent[];
};

export type BehaviorLogImportBehaviorPlan = {
  action: BehaviorLogImportPlanAction;
  skipReasons: string[];
  externalId: string;
  title: string;
  category: string;
  description: string | null;
  archivedAtUtc: string | null;
  sourceConfidence: BehaviorLogSourceConfidence;
};

export type BehaviorLogImportSchedulePlan = {
  action: BehaviorLogImportPlanAction;
  skipReasons: string[];
  externalId: string;
  behaviorExternalId: string;
  recurrenceProfile: string;
  recurrence: Record<string, unknown>;
  timezone: string;
  localTime: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  activeFromLocalDate: string;
  activeUntilLocalDate: string | null;
  sourceConfidence: BehaviorLogSourceConfidence;
};

export type BehaviorLogImportOccurrencePlan = {
  action: BehaviorLogImportPlanAction;
  skipReasons: string[];
  externalId: string;
  behaviorExternalId: string;
  scheduleExternalId: string;
  scheduledForUtc: string;
  localDate: string;
  timezone: string;
  localTime: string | null;
  currentStatus: OccurrenceStatus;
  sourceConfidence: BehaviorLogSourceConfidence;
};

export type BehaviorLogImportStatusEventPlan = {
  action: BehaviorLogImportPlanAction;
  skipReasons: string[];
  externalId: string;
  occurrenceExternalId: string;
  behaviorExternalId: string;
  previousStatus: OccurrenceStatus | null;
  status: OccurrenceStatus;
  statusSemantics: BehaviorLogStatusSemantics;
  recordedAtUtc: string;
  effectiveAtUtc: string | null;
  localDate: string;
  timezone: string;
  sourceCaptureMethod: BehaviorLogSourceCaptureMethod;
  sourceConfidence: BehaviorLogSourceConfidence;
  revisesEventId: string | null;
  reasonCode: string | null;
};

export type BehaviorLogImportNotePlan = {
  action: BehaviorLogImportPlanAction;
  skipReasons: string[];
  externalId: string;
  attachedToType: "behavior" | "occurrence" | "status_event" | "review";
  attachedToId: string;
  bodyMarkdown: string;
  noteRole: "user" | "imported" | "system" | "ai_generated";
  createdAtUtc: string;
  updatedAtUtc: string | null;
  sourceConfidence: BehaviorLogSourceConfidence;
};

export type BehaviorLogImportPlan = {
  behaviors: BehaviorLogImportBehaviorPlan[];
  schedules: BehaviorLogImportSchedulePlan[];
  occurrences: BehaviorLogImportOccurrencePlan[];
  statusEvents: BehaviorLogImportStatusEventPlan[];
  notes: BehaviorLogImportNotePlan[];
};

export type BehaviorLogImportDayGroup = {
  localDate: string;
  timezone: string;
  occurrenceCount: number;
  statusEventCount: number;
  noteCount: number;
  conflictCount: number;
};

export type BehaviorLogImportSummary = {
  schemaVersion: string | null;
  fileCount: number;
  behaviorCount: number;
  scheduleCount: number;
  occurrenceCount: number;
  statusEventCount: number;
  noteCount: number;
  createCount: number;
  skipCount: number;
  errorCount: number;
  warningCount: number;
  conflictCount: number;
  unsupportedFieldCount: number;
  dayGroups: BehaviorLogImportDayGroup[];
};

export type BehaviorLogImportPreview = {
  valid: boolean;
  summary: BehaviorLogImportSummary;
  errors: BehaviorLogImportIssue[];
  warnings: BehaviorLogImportIssue[];
  conflicts: BehaviorLogImportConflict[];
  unsupportedFields: BehaviorLogUnsupportedField[];
  plan: BehaviorLogImportPlan;
};
