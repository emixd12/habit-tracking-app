import type {
  BehaviorLogExistingRecords,
  BehaviorLogImportIssue,
  BehaviorLogImportPreview,
  BehaviorLogImportRecordType,
  BehaviorLogNoteSensitivity,
} from "@/lib/types/behaviorlog-import";

export type BehaviorLogRestoreRecordType =
  | BehaviorLogImportRecordType
  | "intervention_rule"
  | "inline_occurrence_note";

export type BehaviorLogRestoreActionKind =
  | "create"
  | "replace"
  | "archive"
  | "delete"
  | "keep"
  | "skip";

export type BehaviorLogRestoreAction = {
  recordType: BehaviorLogRestoreRecordType;
  action: BehaviorLogRestoreActionKind;
  destructive: boolean;
  externalId: string | null;
  localId: string | null;
  reasons: string[];
  relatedExternalIds?: Record<string, string | null>;
  metadata?: Record<string, unknown>;
};

export type BehaviorLogRestoreStatusHistoryPolicy =
  | "preserve_append_only_history"
  | "replace_status_history";

export type BehaviorLogRestoreNonRestorableField = {
  field: string;
  reason: string;
};

export type BehaviorLogRestoreSummary = {
  actionCounts: Record<BehaviorLogRestoreActionKind, number>;
  destructiveActionCount: number;
  createdCount: number;
  replacedCount: number;
  archivedCount: number;
  deletedCount: number;
  keptCount: number;
  skippedCount: number;
  highOrRestrictedNoteCount: number;
  redactedInterventionFieldCount: number;
  unsupportedActionCount: number;
};

export type BehaviorLogRestorePreview = {
  mode: "restore_preview";
  valid: boolean;
  previewFingerprint: string;
  localDataFingerprint: string;
  bundleFingerprint: string;
  statusHistoryPolicy: {
    selected: BehaviorLogRestoreStatusHistoryPolicy;
    default: "preserve_append_only_history";
    available: BehaviorLogRestoreStatusHistoryPolicy[];
    applySupportedInThisTicket: boolean;
  };
  semantics: {
    jsonlAuthoritative: true;
    csvIgnoredForRestore: true;
    statusEventsAuthoritative: true;
    currentStatusIsSnapshotOnly: true;
    unresolvedIsFailure: false;
    behaviorLogIsNotAccountImage: true;
    providerSideEffects: false;
    reminderDeliverySideEffects: false;
  };
  summary: BehaviorLogRestoreSummary;
  nonRestorableFields: BehaviorLogRestoreNonRestorableField[];
  sensitivity: {
    highOrRestrictedNotesPresent: boolean;
    noteSensitivities: BehaviorLogNoteSensitivity[];
    redactedInterventionFieldsPresent: boolean;
  };
  errors: BehaviorLogImportIssue[];
  warnings: BehaviorLogImportIssue[];
  actions: {
    behaviors: BehaviorLogRestoreAction[];
    schedules: BehaviorLogRestoreAction[];
    occurrences: BehaviorLogRestoreAction[];
    statusEvents: BehaviorLogRestoreAction[];
    definitionEvents?: BehaviorLogRestoreAction[];
    timeSessions?: BehaviorLogRestoreAction[];
    interventionRules?: BehaviorLogRestoreAction[];
    inlineOccurrenceNotes: BehaviorLogRestoreAction[];
    importedNotes: BehaviorLogRestoreAction[];
    importedInterventions: BehaviorLogRestoreAction[];
  };
};

export type ResolveBehaviorLogRestorePreviewInput = {
  importPreview: BehaviorLogImportPreview;
  existing?: BehaviorLogExistingRecords;
  statusHistoryPolicy?: BehaviorLogRestoreStatusHistoryPolicy;
};
