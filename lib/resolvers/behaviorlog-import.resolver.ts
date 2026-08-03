import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";

import type {
  BehaviorLogExistingRecords,
  BehaviorLogInterventionChannel,
  BehaviorLogInterventionDeliveryStatus,
  BehaviorLogImportBehaviorPlan,
  BehaviorLogImportConflict,
  BehaviorLogImportDayGroup,
  BehaviorLogImportFile,
  BehaviorLogImportInterventionPreviewPlan,
  BehaviorLogImportIssue,
  BehaviorLogImportMergeConflict,
  BehaviorLogImportMergePreview,
  BehaviorLogImportMergePreviewResult,
  BehaviorLogImportMergeRecordAction,
  BehaviorLogNoteSensitivity,
  BehaviorLogImportNotePlan,
  BehaviorLogImportOccurrencePlan,
  BehaviorLogImportPlan,
  BehaviorLogImportPreview,
  BehaviorLogImportRecordType,
  BehaviorLogImportSchedulePlan,
  BehaviorLogImportStatusEventPlan,
  BehaviorLogSourceCaptureMethod,
  BehaviorLogSourceConfidence,
  BehaviorLogStatusSemantics,
  BehaviorLogUnsupportedField,
} from "@/lib/types/behaviorlog-import";
import type { OccurrenceStatus } from "@/lib/types/database";

const BEHAVIORLOG_FORMAT = "behaviorlog.bundle";
const BEHAVIORLOG_SUPPORTED_SCHEMA_VERSIONS = ["0.1.0-draft"] as const;
const BEHAVIORLOG_EXTENSION_NAMESPACE = "app.cadence";
const CADENCE_TIME_SESSIONS_PATH =
  "raw/cadence/occurrence_time_sessions.jsonl";
const TIMEZONE_VALIDATION_INSTANT = Temporal.Instant.from(
  "2000-01-01T00:00:00Z",
);

const CADENCE_RANGE_PRESETS = [
  {
    preset: "morning",
    start: "06:00",
    end: "12:00",
  },
  {
    preset: "afternoon",
    start: "12:00",
    end: "18:00",
  },
  {
    preset: "evening",
    start: "18:00",
    end: "00:00",
  },
  {
    preset: "night",
    start: "00:00",
    end: "06:00",
  },
] as const;

const REQUIRED_PATHS = [
  "manifest.json",
  "schema.json",
  "README.md",
  "AGENTS.md",
  "data/behaviors.jsonl",
  "data/schedules.jsonl",
  "data/occurrences.jsonl",
  "data/status_events.jsonl",
] as const;

const JSONL_FILES = {
  behaviors: "data/behaviors.jsonl",
  schedules: "data/schedules.jsonl",
  occurrences: "data/occurrences.jsonl",
  statusEvents: "data/status_events.jsonl",
  notes: "data/notes.jsonl",
  interventions: "data/interventions.jsonl",
} as const;

const BEHAVIOR_FIELDS = new Set([
  "record_type",
  "behavior_id",
  "title",
  "description",
  "category",
  "success_definition",
  "expected_duration_minutes",
  "created_at_utc",
  "archived_at_utc",
  "source",
  "sensitivity",
  "extensions",
]);

const SCHEDULE_FIELDS = new Set([
  "record_type",
  "schedule_id",
  "behavior_id",
  "recurrence_profile",
  "recurrence",
  "timezone",
  "local_time",
  "window_start_local",
  "window_end_local",
  "active_from_local_date",
  "active_until_local_date",
  "source",
  "extensions",
]);

const OCCURRENCE_FIELDS = new Set([
  "record_type",
  "occurrence_id",
  "behavior_id",
  "schedule_id",
  "scheduled_for_utc",
  "local_date",
  "local_time",
  "timezone",
  "utc_offset_at_event",
  "due_window_start_utc",
  "due_window_end_utc",
  "generated_at_utc",
  "generation_rule_id",
  "occurrence_state",
  "current_status",
  "source",
  "extensions",
]);

const STATUS_EVENT_FIELDS = new Set([
  "record_type",
  "event_id",
  "occurrence_id",
  "behavior_id",
  "previous_status",
  "status",
  "status_semantics",
  "recorded_at_utc",
  "effective_at_utc",
  "local_date",
  "timezone",
  "utc_offset_at_event",
  "actor",
  "source",
  "note_id",
  "revises_event_id",
  "reason_code",
  "extensions",
]);

const NOTE_FIELDS = new Set([
  "record_type",
  "note_id",
  "attached_to_type",
  "attached_to_id",
  "body_markdown",
  "note_role",
  "created_at_utc",
  "updated_at_utc",
  "sensitivity",
  "source",
  "extensions",
]);

const INTERVENTION_FIELDS = new Set([
  "record_type",
  "intervention_id",
  "behavior_id",
  "occurrence_id",
  "intervention_type",
  "channel",
  "scheduled_send_at_utc",
  "sent_at_utc",
  "delivery_status",
  "failure_reason",
  "source",
  "extensions",
  "message_body",
  "body",
  "email_body",
  "push_payload",
  "payload",
  "endpoint",
  "raw_endpoint",
  "provider_id",
  "provider_identifier",
  "provider_message_id",
  "provider_delivery_id",
  "provider_secret",
  "api_key",
  "secret",
  "token",
  "subscription",
  "subscription_key",
  "subscription_keys",
  "p256dh",
  "auth",
  "recipient",
  "recipient_id",
  "recipient_email",
  "email",
  "phone",
  "address",
  "to",
]);

type JsonRecord = Record<string, unknown>;

type ParsedJsonlRecord = {
  file: string;
  row: number;
  record: JsonRecord;
};

export type ResolveBehaviorLogImportPreviewInput = {
  files: BehaviorLogImportFile[];
  existing?: BehaviorLogExistingRecords;
  supportedSchemaVersions?: readonly string[];
};

export type ResolveBehaviorLogImportMergePreviewInput = Omit<
  ResolveBehaviorLogImportPreviewInput,
  "existing"
> & {
  existing?: BehaviorLogExistingRecords;
};

export function resolveBehaviorLogImportPreview(
  input: ResolveBehaviorLogImportPreviewInput,
): BehaviorLogImportPreview {
  const errors: BehaviorLogImportIssue[] = [];
  const warnings: BehaviorLogImportIssue[] = [];
  const conflicts: BehaviorLogImportConflict[] = [];
  const unsupportedFields: BehaviorLogUnsupportedField[] = [];
  const fileMap = buildFileMap(input.files, errors);
  const manifest = parseJsonFile("manifest.json", fileMap, errors);
  const schemaVersion = readManifestSchemaVersion(manifest);

  validateRequiredFiles(fileMap, errors);
  validateManifest({
    manifest,
    fileMap,
    errors,
    warnings,
    supportedSchemaVersions:
      input.supportedSchemaVersions ?? BEHAVIORLOG_SUPPORTED_SCHEMA_VERSIONS,
  });
  validateCadenceTimeSessions({
    manifest,
    fileMap,
    errors,
    warnings,
  });
  parseJsonFile("schema.json", fileMap, errors);

  const behaviorRows = parseJsonlFile({
    file: JSONL_FILES.behaviors,
    expectedRecordType: "behavior",
    allowedFields: BEHAVIOR_FIELDS,
    fileMap,
    errors,
    unsupportedFields,
  });
  const scheduleRows = parseJsonlFile({
    file: JSONL_FILES.schedules,
    expectedRecordType: "schedule",
    allowedFields: SCHEDULE_FIELDS,
    fileMap,
    errors,
    unsupportedFields,
  });
  const occurrenceRows = parseJsonlFile({
    file: JSONL_FILES.occurrences,
    expectedRecordType: "occurrence",
    allowedFields: OCCURRENCE_FIELDS,
    fileMap,
    errors,
    unsupportedFields,
  });
  const statusEventRows = parseJsonlFile({
    file: JSONL_FILES.statusEvents,
    expectedRecordType: "status_event",
    allowedFields: STATUS_EVENT_FIELDS,
    fileMap,
    errors,
    unsupportedFields,
  });
  const noteRows = fileMap.has(JSONL_FILES.notes)
    ? parseJsonlFile({
        file: JSONL_FILES.notes,
        expectedRecordType: "note",
        allowedFields: NOTE_FIELDS,
        fileMap,
        errors,
        unsupportedFields,
      })
    : [];
  const interventionRows = fileMap.has(JSONL_FILES.interventions)
    ? parseJsonlFile({
        file: JSONL_FILES.interventions,
        expectedRecordType: "intervention",
        allowedFields: INTERVENTION_FIELDS,
        fileMap,
        errors,
        unsupportedFields,
      })
    : [];
  const plan: BehaviorLogImportPlan = {
    behaviors: behaviorRows
      .map((row) => toBehaviorPlan(row, errors))
      .filter((record): record is BehaviorLogImportBehaviorPlan =>
        Boolean(record),
      ),
    schedules: scheduleRows
      .map((row) => toSchedulePlan(row, errors))
      .filter((record): record is BehaviorLogImportSchedulePlan =>
        Boolean(record),
      ),
    occurrences: occurrenceRows
      .map((row) => toOccurrencePlan(row, errors))
      .filter((record): record is BehaviorLogImportOccurrencePlan =>
        Boolean(record),
      ),
    statusEvents: statusEventRows
      .map((row) => toStatusEventPlan(row, errors))
      .filter((record): record is BehaviorLogImportStatusEventPlan =>
        Boolean(record),
      ),
    notes: noteRows
      .map((row) => toNotePlan(row, errors))
      .filter((record): record is BehaviorLogImportNotePlan =>
        Boolean(record),
      ),
    interventions: interventionRows
      .map((row) => toInterventionPlan(row, errors, warnings))
      .filter((record): record is BehaviorLogImportInterventionPreviewPlan =>
        Boolean(record),
      ),
  };

  validateCrossReferences({ plan, errors, warnings });
  validateNoteImportPolicy({ plan, warnings });
  validateSupportedSchedules({ plan, warnings });
  markConflicts({ plan, existing: input.existing, conflicts });
  warnAboutSnapshotHistory({ plan, warnings });

  return {
    valid: errors.length === 0,
    summary: summarizePreview({
      schemaVersion,
      fileCount: fileMap.size,
      plan,
      errors,
      warnings,
      conflicts,
      unsupportedFields,
    }),
    errors,
    warnings,
    conflicts,
    unsupportedFields,
    plan,
  };
}

export function resolveBehaviorLogImportMergePreview(
  input: ResolveBehaviorLogImportMergePreviewInput,
): BehaviorLogImportMergePreviewResult {
  const preview = resolveBehaviorLogImportPreview({
    files: input.files,
    supportedSchemaVersions: input.supportedSchemaVersions,
  });
  const mergePreview = buildMergePreview({
    plan: preview.plan,
    existing: input.existing,
    privacy: readPrivacySummary(input.files),
    interventions: preview.plan.interventions,
  });
  const bundleFingerprint = createBehaviorLogImportBundleFingerprint(input.files);
  const localDataFingerprint = createBehaviorLogImportLocalDataFingerprint(
    input.existing,
  );
  const previewFingerprint = sha256(
    stableStringify({
      bundleFingerprint,
      localDataFingerprint,
      mergePreview,
      semanticsVersion: 1,
    }),
  );

  return {
    ...preview,
    mergePreview,
    bundleFingerprint,
    localDataFingerprint,
    previewFingerprint,
  };
}

function buildFileMap(
  files: BehaviorLogImportFile[],
  errors: BehaviorLogImportIssue[],
): Map<string, BehaviorLogImportFile> {
  const map = new Map<string, BehaviorLogImportFile>();

  for (const file of files) {
    if (!file.path || file.path.trim().length === 0) {
      errors.push({
        severity: "error",
        code: "file_path_missing",
        message: "A bundle file has no path.",
      });
      continue;
    }

    if (map.has(file.path)) {
      errors.push({
        severity: "error",
        code: "duplicate_file",
        message: `Bundle includes duplicate file path ${file.path}.`,
        file: file.path,
      });
      continue;
    }

    map.set(file.path, file);
  }

  return map;
}

function validateRequiredFiles(
  fileMap: Map<string, BehaviorLogImportFile>,
  errors: BehaviorLogImportIssue[],
): void {
  for (const path of REQUIRED_PATHS) {
    if (!fileMap.has(path)) {
      errors.push({
        severity: "error",
        code: "required_file_missing",
        message: `Required BehaviorLog file is missing: ${path}.`,
        file: path,
      });
    }
  }
}

function validateManifest(input: {
  manifest: JsonRecord | null;
  fileMap: Map<string, BehaviorLogImportFile>;
  errors: BehaviorLogImportIssue[];
  warnings: BehaviorLogImportIssue[];
  supportedSchemaVersions: readonly string[];
}): void {
  if (!input.manifest) {
    return;
  }

  const format = input.manifest.format;
  const schemaVersion = input.manifest.schema_version;

  if (format !== BEHAVIORLOG_FORMAT) {
    input.errors.push({
      severity: "error",
      code: "unsupported_format",
      message: `Unsupported BehaviorLog format: ${String(format)}.`,
      file: "manifest.json",
    });
  }

  if (
    typeof schemaVersion !== "string" ||
    !input.supportedSchemaVersions.includes(schemaVersion)
  ) {
    input.errors.push({
      severity: "error",
      code: "unsupported_schema_version",
      message: `Unsupported BehaviorLog schema version: ${String(
        schemaVersion,
      )}.`,
      file: "manifest.json",
    });
  }

  if (!Array.isArray(input.manifest.files)) {
    input.errors.push({
      severity: "error",
      code: "manifest_files_invalid",
      message: "manifest.json must include a files array.",
      file: "manifest.json",
    });
    return;
  }

  const listedPaths = new Set<string>();

  for (const [index, entry] of input.manifest.files.entries()) {
    if (!isRecord(entry)) {
      input.errors.push({
        severity: "error",
        code: "manifest_file_invalid",
        message: `manifest.json files[${index}] must be an object.`,
        file: "manifest.json",
      });
      continue;
    }

    const path = entry.path;

    if (typeof path !== "string" || path.length === 0) {
      input.errors.push({
        severity: "error",
        code: "manifest_file_path_invalid",
        message: `manifest.json files[${index}].path must be a non-empty string.`,
        file: "manifest.json",
      });
      continue;
    }

    listedPaths.add(path);

    const file = input.fileMap.get(path);

    if (!file) {
      input.errors.push({
        severity: "error",
        code: "manifest_listed_file_missing",
        message: `manifest.json lists ${path}, but the file is absent.`,
        file: "manifest.json",
        path,
      });
      continue;
    }

    if (typeof entry.sha256 !== "string") {
      input.errors.push({
        severity: "error",
        code: "manifest_hash_missing",
        message: `manifest.json entry for ${path} must include sha256.`,
        file: "manifest.json",
        path,
      });
      continue;
    }

    const actualHash = sha256(file.content);

    if (entry.sha256.toLowerCase() !== actualHash) {
      input.errors.push({
        severity: "error",
        code: "manifest_hash_mismatch",
        message: `SHA-256 mismatch for ${path}.`,
        file: "manifest.json",
        path,
      });
    }
  }

  for (const requiredPath of REQUIRED_PATHS) {
    if (requiredPath === "manifest.json") {
      continue;
    }

    if (!listedPaths.has(requiredPath)) {
      input.errors.push({
        severity: "error",
        code: "required_file_not_listed",
        message: `manifest.json must list required file ${requiredPath}.`,
        file: "manifest.json",
        path: requiredPath,
      });
    }
  }

  for (const path of input.fileMap.keys()) {
    if (path !== "manifest.json" && !listedPaths.has(path)) {
      input.warnings.push({
        severity: "warning",
        code: "file_not_listed",
        message: `${path} is present but not listed in manifest.json.`,
        file: path,
      });
    }
  }
}

function validateCadenceTimeSessions(input: {
  manifest: JsonRecord | null;
  fileMap: Map<string, BehaviorLogImportFile>;
  errors: BehaviorLogImportIssue[];
  warnings: BehaviorLogImportIssue[];
}): void {
  const cadence = isRecord(input.manifest?.extensions)
    ? input.manifest.extensions[BEHAVIORLOG_EXTENSION_NAMESPACE]
    : null;
  const declaration = isRecord(cadence)
    ? cadence.occurrence_time_sessions
    : null;
  const file = input.fileMap.get(CADENCE_TIME_SESSIONS_PATH);
  const isManifestListed = Array.isArray(input.manifest?.files)
    ? input.manifest.files.some(
        (entry) =>
          isRecord(entry) && entry.path === CADENCE_TIME_SESSIONS_PATH,
      )
    : false;

  if (!declaration && !file) {
    return;
  }

  if (file && !isManifestListed) {
    input.errors.push({
      severity: "error",
      code: "cadence_time_sessions_not_listed",
      message:
        "Cadence time-session export files must be listed in manifest.json so their SHA-256 hash is verified.",
      file: "manifest.json",
      path: CADENCE_TIME_SESSIONS_PATH,
    });
  }

  if (!isRecord(declaration)) {
    input.errors.push({
      severity: "error",
      code: "cadence_time_sessions_extension_invalid",
      message:
        "Cadence time-session exports must declare occurrence_time_sessions in manifest.extensions.app.cadence.",
      file: "manifest.json",
    });
    return;
  }

  if (declaration.path !== CADENCE_TIME_SESSIONS_PATH || !file) {
    input.errors.push({
      severity: "error",
      code: "cadence_time_sessions_file_invalid",
      message:
        "Cadence time-session export metadata must reference raw/cadence/occurrence_time_sessions.jsonl.",
      file: "manifest.json",
      path: CADENCE_TIME_SESSIONS_PATH,
    });
    return;
  }

  const rows = parseCadenceTimeSessionRows(file, input.errors);

  const recordCount = declaration.record_count;

  if (
    typeof recordCount !== "number" ||
    !Number.isInteger(recordCount) ||
    recordCount < 0 ||
    recordCount !== rows.length
  ) {
    input.errors.push({
      severity: "error",
      code: "cadence_time_sessions_count_invalid",
      message:
        "Cadence time-session export metadata must match the optional file record count.",
      file: "manifest.json",
      path: CADENCE_TIME_SESSIONS_PATH,
    });
  }

  if (declaration.import_restore_support !== "export_only") {
    input.errors.push({
      severity: "error",
      code: "cadence_time_sessions_support_invalid",
      message:
        "Cadence time-session exports must declare export_only import and restore support.",
      file: "manifest.json",
      path: CADENCE_TIME_SESSIONS_PATH,
    });
  }

  if (
    !Array.isArray(declaration.ordering) ||
    declaration.ordering.length !== 2 ||
    declaration.ordering[0] !== "started_at" ||
    declaration.ordering[1] !== "session_id"
  ) {
    input.errors.push({
      severity: "error",
      code: "cadence_time_sessions_ordering_invalid",
      message:
        "Cadence time-session export metadata must declare started_at and session_id ordering.",
      file: "manifest.json",
      path: CADENCE_TIME_SESSIONS_PATH,
    });
  }

  input.warnings.push({
    severity: "warning",
    code: "cadence_time_sessions_export_only",
    message:
      "Cadence validated the optional time-session export file, but import and restore do not replay timing sessions.",
    file: CADENCE_TIME_SESSIONS_PATH,
  });
}

function parseCadenceTimeSessionRows(
  file: BehaviorLogImportFile,
  errors: BehaviorLogImportIssue[],
): JsonRecord[] {
  const rows: JsonRecord[] = [];

  for (const [index, line] of file.content.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    try {
      const record = JSON.parse(line);

      if (!isRecord(record) || record.record_type !== "occurrence_time_session") {
        throw new Error("must be an occurrence_time_session record");
      }
      if (
        typeof record.session_id !== "string" ||
        typeof record.occurrence_id !== "string" ||
        typeof record.behavior_id !== "string" ||
        typeof record.started_at !== "string"
      ) {
        throw new Error("requires session_id, occurrence_id, behavior_id, and started_at strings");
      }
      const startedAt = Temporal.Instant.from(record.started_at);
      const stoppedAt =
        record.stopped_at === null
          ? null
          : typeof record.stopped_at === "string"
            ? Temporal.Instant.from(record.stopped_at)
            : null;

      if (record.stopped_at !== null && stoppedAt === null) {
        throw new Error("stopped_at must be an ISO instant or null");
      }
      if (
        stoppedAt &&
        Temporal.Instant.compare(stoppedAt, startedAt) < 0
      ) {
        throw new Error("stopped_at cannot be before started_at");
      }
      if (
        (stoppedAt === null && record.duration_seconds !== null) ||
        (stoppedAt !== null &&
          (typeof record.duration_seconds !== "number" ||
            record.duration_seconds < 0))
      ) {
        throw new Error("duration_seconds must be null for running sessions and nonnegative for stopped sessions");
      }
      rows.push(record);
    } catch (error) {
      errors.push({
        severity: "error",
        code: "cadence_time_session_invalid",
        message: `${CADENCE_TIME_SESSIONS_PATH} row ${index + 1} ${errorMessage(error)}.`,
        file: CADENCE_TIME_SESSIONS_PATH,
        row: index + 1,
      });
    }
  }

  return rows;
}

function parseJsonFile(
  path: string,
  fileMap: Map<string, BehaviorLogImportFile>,
  errors: BehaviorLogImportIssue[],
): JsonRecord | null {
  const file = fileMap.get(path);

  if (!file) {
    return null;
  }

  try {
    const parsed = JSON.parse(file.content);

    if (!isRecord(parsed)) {
      errors.push({
        severity: "error",
        code: "json_object_expected",
        message: `${path} must contain one JSON object.`,
        file: path,
      });
      return null;
    }

    return parsed;
  } catch (error) {
    errors.push({
      severity: "error",
      code: "json_parse_error",
      message: `${path} could not be parsed: ${errorMessage(error)}.`,
      file: path,
    });
    return null;
  }
}

function readManifestSchemaVersion(manifest: JsonRecord | null): string | null {
  return typeof manifest?.schema_version === "string"
    ? manifest.schema_version
    : null;
}

function parseJsonlFile(input: {
  file: string;
  expectedRecordType: string;
  allowedFields: Set<string>;
  fileMap: Map<string, BehaviorLogImportFile>;
  errors: BehaviorLogImportIssue[];
  unsupportedFields: BehaviorLogUnsupportedField[];
}): ParsedJsonlRecord[] {
  const file = input.fileMap.get(input.file);

  if (!file) {
    return [];
  }

  return file.content.split(/\r?\n/).flatMap((line, index) => {
    const row = index + 1;

    if (line.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(line);

      if (!isRecord(parsed)) {
        input.errors.push({
          severity: "error",
          code: "jsonl_record_invalid",
          message: `${input.file} row ${row} must be a JSON object.`,
          file: input.file,
          row,
        });
        return [];
      }

      if (parsed.record_type !== input.expectedRecordType) {
        input.errors.push({
          severity: "error",
          code: "record_type_invalid",
          message: `${input.file} row ${row} must have record_type '${input.expectedRecordType}'.`,
          file: input.file,
          row,
        });
        return [];
      }

      const extraFields = Object.keys(parsed).filter(
        (field) => !input.allowedFields.has(field),
      );

      if (extraFields.length > 0) {
        input.unsupportedFields.push({
          file: input.file,
          row,
          recordType: input.expectedRecordType,
          recordId: recordIdForUnsupportedField(parsed),
          fields: extraFields,
        });
        input.errors.push({
          severity: "error",
          code: "unsupported_top_level_field",
          message: `${input.file} row ${row} includes unsupported top-level field(s): ${extraFields.join(
            ", ",
          )}. Put custom fields under extensions.`,
          file: input.file,
          row,
        });
      }

      return [{ file: input.file, row, record: parsed }];
    } catch (error) {
      input.errors.push({
        severity: "error",
        code: "jsonl_parse_error",
        message: `${input.file} row ${row} could not be parsed: ${errorMessage(
          error,
        )}.`,
        file: input.file,
        row,
      });
      return [];
    }
  });
}

function toBehaviorPlan(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
): BehaviorLogImportBehaviorPlan | null {
  const id = readRequiredString(row, "behavior_id", errors);
  const title = readRequiredString(row, "title", errors);
  const category = readRequiredString(row, "category", errors);
  const createdAtUtc = readOptionalInstant(row, "created_at_utc", errors);
  const archivedAtUtc = readOptionalInstant(row, "archived_at_utc", errors);
  const source = readSource(row, errors, false);
  const cadence = readCadenceExtension(row.record);

  if (!id || !title || !category) {
    return null;
  }

  return {
    action: "create",
    skipReasons: [],
    externalId: id,
    title,
    category,
    cadenceCategoryName: readExtensionString(cadence, "category_name"),
    description: readOptionalString(row, "description", errors),
    createdAtUtc,
    archivedAtUtc,
    cadenceActive: readExtensionBoolean(cadence, "active"),
    cadenceBrowserReminderEnabled: readExtensionBoolean(
      cadence,
      "browser_reminder_enabled",
    ),
    cadenceEmailReminderEnabled: readExtensionBoolean(
      cadence,
      "email_reminder_enabled",
    ),
    cadenceReminderOffsetMinutes: readExtensionInteger(
      cadence,
      "reminder_offset_minutes",
    ),
    sourceOriginalId: source.originalId,
    sourceConfidence: source.confidence,
  };
}

function toSchedulePlan(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
): BehaviorLogImportSchedulePlan | null {
  const id = readRequiredString(row, "schedule_id", errors);
  const behaviorId = readRequiredString(row, "behavior_id", errors);
  const recurrenceProfile = readRequiredString(
    row,
    "recurrence_profile",
    errors,
  );
  const recurrence = readRequiredObject(row, "recurrence", errors);
  const timezone = readRequiredTimezone(row, "timezone", errors);
  const activeFromLocalDate = readRequiredLocalDate(
    row,
    "active_from_local_date",
    errors,
  );
  const source = readSource(row, errors, false);
  const cadence = readCadenceExtension(row.record);

  if (
    !id ||
    !behaviorId ||
    !recurrenceProfile ||
    !recurrence ||
    !timezone ||
    !activeFromLocalDate
  ) {
    return null;
  }

  return {
    action: "create",
    skipReasons: [],
    externalId: id,
    behaviorExternalId: behaviorId,
    recurrenceProfile,
    recurrence,
    timezone,
    localTime: readOptionalLocalTime(row, "local_time", errors),
    windowStartLocal: readOptionalLocalTime(row, "window_start_local", errors),
    windowEndLocal: readOptionalLocalTime(row, "window_end_local", errors),
    cadenceScheduleKind: readExtensionScheduleKind(cadence, "schedule_kind"),
    cadenceSchedulePreset: readExtensionSchedulePreset(
      cadence,
      "schedule_preset",
    ),
    activeFromLocalDate,
    activeUntilLocalDate: readOptionalLocalDate(
      row,
      "active_until_local_date",
      errors,
    ),
    sourceOriginalId: source.originalId,
    sourceConfidence: source.confidence,
  };
}

function toOccurrencePlan(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
): BehaviorLogImportOccurrencePlan | null {
  const id = readRequiredString(row, "occurrence_id", errors);
  const behaviorId = readRequiredString(row, "behavior_id", errors);
  const scheduleId = readRequiredString(row, "schedule_id", errors);
  const scheduledForUtc = readRequiredInstant(row, "scheduled_for_utc", errors);
  const localDate = readRequiredLocalDate(row, "local_date", errors);
  const timezone = readRequiredTimezone(row, "timezone", errors);
  const currentStatus = readRequiredStatus(row, "current_status", errors);
  const generatedAtUtc = readOptionalInstant(row, "generated_at_utc", errors);
  const source = readSource(row, errors, false);

  if (
    !id ||
    !behaviorId ||
    !scheduleId ||
    !scheduledForUtc ||
    !localDate ||
    !timezone ||
    !currentStatus
  ) {
    return null;
  }

  return {
    action: "create",
    skipReasons: [],
    externalId: id,
    behaviorExternalId: behaviorId,
    scheduleExternalId: scheduleId,
    scheduledForUtc,
    localDate,
    timezone,
    localTime: readOptionalLocalTime(row, "local_time", errors),
    generatedAtUtc,
    currentStatus,
    sourceOriginalId: source.originalId,
    sourceConfidence: source.confidence,
  };
}

function toStatusEventPlan(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
): BehaviorLogImportStatusEventPlan | null {
  const id = readRequiredString(row, "event_id", errors);
  const occurrenceId = readRequiredString(row, "occurrence_id", errors);
  const behaviorId = readRequiredString(row, "behavior_id", errors);
  const status = readRequiredStatus(row, "status", errors);
  const statusSemantics = readRequiredStatusSemantics(
    row,
    "status_semantics",
    errors,
  );
  const recordedAtUtc = readRequiredInstant(row, "recorded_at_utc", errors);
  const localDate = readRequiredLocalDate(row, "local_date", errors);
  const timezone = readRequiredTimezone(row, "timezone", errors);
  const source = readSource(row, errors, true);

  if (
    !id ||
    !occurrenceId ||
    !behaviorId ||
    !status ||
    !statusSemantics ||
    !recordedAtUtc ||
    !localDate ||
    !timezone
  ) {
    return null;
  }

  return {
    action: "create",
    skipReasons: [],
    externalId: id,
    occurrenceExternalId: occurrenceId,
    behaviorExternalId: behaviorId,
    previousStatus: readOptionalStatus(row, "previous_status", errors),
    status,
    statusSemantics,
    recordedAtUtc,
    effectiveAtUtc: readOptionalInstant(row, "effective_at_utc", errors),
    localDate,
    timezone,
    sourceCaptureMethod: source.captureMethod,
    sourceConfidence: source.confidence,
    revisesEventId: readOptionalString(row, "revises_event_id", errors),
    reasonCode: readOptionalString(row, "reason_code", errors),
    sourceOriginalId: source.originalId,
  };
}

function toNotePlan(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
): BehaviorLogImportNotePlan | null {
  const id = readRequiredString(row, "note_id", errors);
  const attachedToType = readRequiredAttachedToType(
    row,
    "attached_to_type",
    errors,
  );
  const attachedToId = readRequiredString(row, "attached_to_id", errors);
  const bodyMarkdown = readRequiredString(row, "body_markdown", errors);
  const noteRole = readRequiredNoteRole(row, "note_role", errors);
  const createdAtUtc = readRequiredInstant(row, "created_at_utc", errors);
  const sensitivity = readOptionalNoteSensitivity(row, "sensitivity", errors);
  const source = readSource(row, errors, false);

  if (
    !id ||
    !attachedToType ||
    !attachedToId ||
    !bodyMarkdown ||
    !noteRole ||
    !createdAtUtc
  ) {
    return null;
  }

  return {
    action: "create",
    skipReasons: [],
    externalId: id,
    attachedToType,
    attachedToId,
    bodyMarkdown,
    noteRole,
    createdAtUtc,
    updatedAtUtc: readOptionalInstant(row, "updated_at_utc", errors),
    sensitivity,
    sourceOriginalId: source.originalId,
    sourceCaptureMethod: source.captureMethod,
    sourceConfidence: source.confidence,
  };
}

function toInterventionPlan(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
  warnings: BehaviorLogImportIssue[],
): BehaviorLogImportInterventionPreviewPlan | null {
  const id = readRequiredString(row, "intervention_id", errors);
  const behaviorId = readRequiredString(row, "behavior_id", errors);
  const occurrenceId = readRequiredString(row, "occurrence_id", errors);
  const channel = readRequiredInterventionChannel(row, "channel", errors);
  const scheduledSendAtUtc = readRequiredInstant(
    row,
    "scheduled_send_at_utc",
    errors,
  );
  const deliveryStatus = readRequiredInterventionDeliveryStatus(
    row,
    "delivery_status",
    errors,
  );
  const source = readSource(row, errors, false);
  const sensitivePaths = collectSensitiveInterventionPaths(row.record);
  const failureReason = readOptionalString(row, "failure_reason", errors);
  const redactedFields = interventionRedactedFields({
    failureReason,
    sourceOriginalId: source.originalId,
    sensitivePaths,
  });

  warnAboutSensitiveInterventionPayload(row, warnings, sensitivePaths);

  if (
    !id ||
    !behaviorId ||
    !occurrenceId ||
    !channel ||
    !scheduledSendAtUtc ||
    !deliveryStatus
  ) {
    return null;
  }

  return {
    action: "preview_only",
    previewOnly: true,
    externalId: id,
    behaviorExternalId: behaviorId,
    occurrenceExternalId: occurrenceId,
    interventionType: readOptionalString(row, "intervention_type", errors),
    channel,
    deliveryStatus,
    scheduledSendAtUtc,
    sentAtUtc: readOptionalInstant(row, "sent_at_utc", errors),
    failureReason: sanitizeInterventionFailureReason(
      failureReason,
      sensitivePaths,
    ),
    sourceOriginalId: sanitizeInterventionSourceOriginalId(
      source.originalId,
      sensitivePaths,
    ),
    sourceCaptureMethod: source.captureMethod,
    sourceConfidence: source.confidence,
    storageDecision: {
      decision: "store_passive_history",
      storedFields: interventionStoredFields(redactedFields),
      droppedSensitiveFields: sensitivePaths.filter(
        (path) => !redactedFields.includes(path),
      ),
      redactedFields,
      rawMessageBodyStored: false,
      rawEndpointStored: false,
      recipientIdentifiersStored: false,
      reminderDeliverySideEffects: false,
      providerSideEffects: false,
    },
  };
}

function warnAboutSensitiveInterventionPayload(
  row: ParsedJsonlRecord,
  warnings: BehaviorLogImportIssue[],
  paths: string[],
): void {
  if (paths.length === 0) {
    return;
  }

  const interventionId =
    typeof row.record.intervention_id === "string"
      ? row.record.intervention_id
      : `row ${row.row}`;

  warnings.push({
    severity: "warning",
    code: "intervention_sensitive_payload_present",
    message: `Intervention ${interventionId} contains sensitive delivery payload field(s): ${paths.join(
      ", ",
    )}. These values will be dropped or redacted before passive intervention history storage and must not be imported into reminders.`,
    file: row.file,
    row: row.row,
  });
}

function interventionRedactedFields(input: {
  failureReason: string | null;
  sourceOriginalId: string | null;
  sensitivePaths: string[];
}): string[] {
  const redactedFields: string[] = [];

  if (
    input.failureReason &&
    (input.sensitivePaths.includes("failure_reason") ||
      looksLikeSensitiveDeliveryValue(input.failureReason))
  ) {
    redactedFields.push("failure_reason");
  }

  if (
    input.sourceOriginalId &&
    (input.sensitivePaths.includes("source.original_id") ||
      looksLikeSensitiveDeliveryValue(input.sourceOriginalId))
  ) {
    redactedFields.push("source.original_id");
  }

  return redactedFields;
}

function sanitizeInterventionFailureReason(
  value: string | null,
  sensitivePaths: string[],
): string | null {
  if (!value) {
    return null;
  }

  if (
    sensitivePaths.includes("failure_reason") ||
    looksLikeSensitiveDeliveryValue(value)
  ) {
    return "Redacted sensitive delivery detail.";
  }

  return value;
}

function sanitizeInterventionSourceOriginalId(
  value: string | null,
  sensitivePaths: string[],
): string | null {
  if (!value) {
    return null;
  }

  if (
    sensitivePaths.includes("source.original_id") ||
    looksLikeSensitiveDeliveryValue(value)
  ) {
    return null;
  }

  return value;
}

function interventionStoredFields(redactedFields: string[]): string[] {
  const fields = [
    "intervention_id",
    "behavior_id",
    "occurrence_id",
    "intervention_type",
    "channel",
    "delivery_status",
    "scheduled_send_at_utc",
    "sent_at_utc",
    "failure_reason",
    "source.original_id",
    "source.capture_method",
    "source.confidence",
  ];

  return fields.map((field) =>
    redactedFields.includes(field) ? `${field} (redacted)` : field,
  );
}

function collectSensitiveInterventionPaths(
  value: unknown,
  path = "",
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectSensitiveInterventionPaths(entry, `${path}[${index}]`),
    );
  }

  if (!isRecord(value)) {
    if (typeof value === "string" && looksLikeSensitiveDeliveryValue(value)) {
      return [path || "value"];
    }

    return [];
  }

  const paths: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;

    if (isSensitiveInterventionFieldName(key)) {
      paths.push(childPath);
    }

    paths.push(...collectSensitiveInterventionPaths(child, childPath));
  }

  return [...new Set(paths)].sort();
}

function isSensitiveInterventionFieldName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    normalized === "messagebody" ||
    normalized === "emailbody" ||
    normalized === "pushpayload" ||
    normalized === "payload" ||
    normalized === "body" ||
    normalized.includes("endpoint") ||
    normalized.includes("subscription") ||
    normalized === "p256dh" ||
    normalized === "auth" ||
    normalized.includes("apikey") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("authorization") ||
    normalized.includes("credential") ||
    (normalized.includes("provider") &&
      (normalized.includes("id") ||
        normalized.includes("identifier") ||
        normalized.includes("message") ||
        normalized.includes("delivery") ||
        normalized.includes("secret") ||
        normalized.includes("token"))) ||
    normalized.includes("recipient") ||
    normalized === "email" ||
    normalized.includes("emailaddress") ||
    normalized === "phone" ||
    normalized === "address" ||
    normalized === "to"
  );
}

function looksLikeSensitiveDeliveryValue(value: string): boolean {
  return (
    /https?:\/\/\S+/i.test(value) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /\b(p256dh|auth|token|secret|api[_-]?key|authorization)\s*[:=]/i.test(
      value,
    )
  );
}

function validateCrossReferences(input: {
  plan: BehaviorLogImportPlan;
  errors: BehaviorLogImportIssue[];
  warnings: BehaviorLogImportIssue[];
}): void {
  const behaviorIds = new Set(
    input.plan.behaviors.map((behavior) => behavior.externalId),
  );
  const scheduleIds = new Set(
    input.plan.schedules.map((schedule) => schedule.externalId),
  );
  const occurrenceIds = new Set(
    input.plan.occurrences.map((occurrence) => occurrence.externalId),
  );
  const statusEventIds = new Set(
    input.plan.statusEvents.map((event) => event.externalId),
  );

  for (const schedule of input.plan.schedules) {
    if (!behaviorIds.has(schedule.behaviorExternalId)) {
      input.errors.push({
        severity: "error",
        code: "schedule_behavior_missing",
        message: `Schedule ${schedule.externalId} references missing behavior ${schedule.behaviorExternalId}.`,
        file: JSONL_FILES.schedules,
      });
      skip(schedule, "missing_behavior");
    }
  }

  for (const occurrence of input.plan.occurrences) {
    if (!behaviorIds.has(occurrence.behaviorExternalId)) {
      input.errors.push({
        severity: "error",
        code: "occurrence_behavior_missing",
        message: `Occurrence ${occurrence.externalId} references missing behavior ${occurrence.behaviorExternalId}.`,
        file: JSONL_FILES.occurrences,
      });
      skip(occurrence, "missing_behavior");
    }

    if (!scheduleIds.has(occurrence.scheduleExternalId)) {
      input.errors.push({
        severity: "error",
        code: "occurrence_schedule_missing",
        message: `Occurrence ${occurrence.externalId} references missing schedule ${occurrence.scheduleExternalId}.`,
        file: JSONL_FILES.occurrences,
      });
      skip(occurrence, "missing_schedule");
    }
  }

  for (const event of input.plan.statusEvents) {
    if (!occurrenceIds.has(event.occurrenceExternalId)) {
      input.errors.push({
        severity: "error",
        code: "status_event_occurrence_missing",
        message: `Status event ${event.externalId} references missing occurrence ${event.occurrenceExternalId}.`,
        file: JSONL_FILES.statusEvents,
      });
      skip(event, "missing_occurrence");
    }

    if (!behaviorIds.has(event.behaviorExternalId)) {
      input.errors.push({
        severity: "error",
        code: "status_event_behavior_missing",
        message: `Status event ${event.externalId} references missing behavior ${event.behaviorExternalId}.`,
        file: JSONL_FILES.statusEvents,
      });
      skip(event, "missing_behavior");
    }

    if (event.revisesEventId && !statusEventIds.has(event.revisesEventId)) {
      input.warnings.push({
        severity: "warning",
        code: "status_event_revision_target_missing",
        message: `Status event ${event.externalId} revises ${event.revisesEventId}, which is not in this bundle.`,
        file: JSONL_FILES.statusEvents,
      });
    }
  }

  for (const note of input.plan.notes) {
    const targetExists =
      (note.attachedToType === "behavior" &&
        behaviorIds.has(note.attachedToId)) ||
      (note.attachedToType === "occurrence" &&
        occurrenceIds.has(note.attachedToId)) ||
      (note.attachedToType === "status_event" &&
        statusEventIds.has(note.attachedToId)) ||
      note.attachedToType === "review";

    if (!targetExists) {
      input.warnings.push({
        severity: "warning",
        code: "note_target_missing",
        message: `Note ${note.externalId} references missing ${note.attachedToType} ${note.attachedToId}.`,
        file: JSONL_FILES.notes,
      });
      skip(note, "missing_attachment");
    }
  }

  for (const intervention of input.plan.interventions) {
    if (!behaviorIds.has(intervention.behaviorExternalId)) {
      input.errors.push({
        severity: "error",
        code: "intervention_behavior_missing",
        message: `Intervention ${intervention.externalId} references missing behavior ${intervention.behaviorExternalId}.`,
        file: JSONL_FILES.interventions,
      });
    }

    if (!occurrenceIds.has(intervention.occurrenceExternalId)) {
      input.errors.push({
        severity: "error",
        code: "intervention_occurrence_missing",
        message: `Intervention ${intervention.externalId} references missing occurrence ${intervention.occurrenceExternalId}.`,
        file: JSONL_FILES.interventions,
      });
    }
  }
}

function validateNoteImportPolicy(input: {
  plan: BehaviorLogImportPlan;
  warnings: BehaviorLogImportIssue[];
}): void {
  for (const note of input.plan.notes) {
    if (note.noteRole === "ai_generated") {
      input.warnings.push({
        severity: "warning",
        code: "ai_generated_note_skipped",
        message: `Note ${note.externalId} is AI-generated and will not be imported into Cadence notes.`,
        file: JSONL_FILES.notes,
      });
      skip(note, "ai_generated_note");
    }

    if (note.sensitivity === "high" || note.sensitivity === "restricted") {
      input.warnings.push({
        severity: "warning",
        code:
          note.sensitivity === "restricted"
            ? "restricted_note_present"
            : "high_sensitivity_note_present",
        message: `Note ${note.externalId} is labeled ${note.sensitivity} sensitivity; review it before accepting any note import action.`,
        file: JSONL_FILES.notes,
      });
    }
  }
}

function validateSupportedSchedules(input: {
  plan: BehaviorLogImportPlan;
  warnings: BehaviorLogImportIssue[];
}): void {
  for (const schedule of input.plan.schedules) {
    if (schedule.action === "skip") {
      continue;
    }

    if (schedule.recurrenceProfile !== "behaviorlog.calendar_simple.v1") {
      input.warnings.push({
        severity: "warning",
        code: "unsupported_recurrence_profile",
        message: `Schedule ${schedule.externalId} uses unsupported recurrence_profile ${schedule.recurrenceProfile}.`,
        file: JSONL_FILES.schedules,
      });
      skip(schedule, "unsupported_recurrence_profile");
      continue;
    }

    if (!isSupportedRecurrence(schedule.recurrence)) {
      input.warnings.push({
        severity: "warning",
        code: "unsupported_recurrence",
        message: `Schedule ${schedule.externalId} uses a recurrence payload Cadence cannot import in create-only mode.`,
        file: JSONL_FILES.schedules,
      });
      skip(schedule, "unsupported_recurrence");
      continue;
    }

    if (!isSupportedScheduleSlot(schedule)) {
      input.warnings.push({
        severity: "warning",
        code: "unsupported_schedule_window",
        message: `Schedule ${schedule.externalId} does not fit Cadence exact-time or preset time-range slots.`,
        file: JSONL_FILES.schedules,
      });
      skip(schedule, "unsupported_schedule_window");
    }
  }
}

function markConflicts(input: {
  plan: BehaviorLogImportPlan;
  existing: BehaviorLogExistingRecords | undefined;
  conflicts: BehaviorLogImportConflict[];
}): void {
  markDuplicateIds(input.plan.behaviors, "behavior", input.conflicts);
  markDuplicateIds(input.plan.schedules, "schedule", input.conflicts);
  markDuplicateIds(input.plan.occurrences, "occurrence", input.conflicts);
  markDuplicateIds(input.plan.statusEvents, "status_event", input.conflicts);
  markDuplicateIds(input.plan.notes, "note", input.conflicts);

  const existing = input.existing ?? {};
  const existingBehaviorById = new Map(
    (existing.behaviors ?? []).map((behavior) => [behavior.id, behavior]),
  );
  const existingBehaviorByIdentity = new Map(
    (existing.behaviors ?? []).map((behavior) => [
      behaviorIdentity(behavior.title, behavior.category ?? null),
      behavior,
    ]),
  );

  for (const behavior of input.plan.behaviors) {
    const existingById = existingBehaviorById.get(behavior.externalId);
    const existingByIdentity = existingBehaviorByIdentity.get(
      behaviorIdentity(behavior.title, behavior.category),
    );

    if (existingById) {
      addConflict(input.conflicts, {
        code: "existing_behavior_id",
        message: `Behavior ${behavior.externalId} already exists locally.`,
        importedRecordType: "behavior",
        importedId: behavior.externalId,
        existingId: existingById.id,
      });
      skip(behavior, "existing_behavior_id");
      continue;
    }

    if (existingByIdentity) {
      addConflict(input.conflicts, {
        code: "likely_existing_behavior",
        message: `Behavior ${behavior.title} looks like an existing local behavior.`,
        importedRecordType: "behavior",
        importedId: behavior.externalId,
        existingId: existingByIdentity.id,
      });
      skip(behavior, "likely_existing_behavior");
    }
  }

  const behaviorById = new Map(
    input.plan.behaviors.map((behavior) => [behavior.externalId, behavior]),
  );

  for (const schedule of input.plan.schedules) {
    if (behaviorById.get(schedule.behaviorExternalId)?.action === "skip") {
      skip(schedule, "parent_behavior_skipped");
    }
  }

  const scheduleById = new Map(
    input.plan.schedules.map((schedule) => [schedule.externalId, schedule]),
  );
  const existingOccurrenceById = new Map(
    (existing.occurrences ?? []).map((occurrence) => [occurrence.id, occurrence]),
  );
  const existingOccurrenceByExactTime = new Map(
    (existing.occurrences ?? []).map((occurrence) => [
      `${occurrence.behaviorId}|${occurrence.scheduledForUtc}`,
      occurrence,
    ]),
  );
  const existingOccurrenceByLikelyTime = new Map(
    (existing.occurrences ?? [])
      .filter((occurrence) => occurrence.behaviorTitle)
      .map((occurrence) => [
        occurrenceIdentity({
          behaviorTitle: occurrence.behaviorTitle ?? "",
          scheduledForUtc: occurrence.scheduledForUtc,
          localDate: occurrence.localDate,
          timezone: occurrence.timezone,
        }),
        occurrence,
      ]),
  );

  for (const occurrence of input.plan.occurrences) {
    const parentBehavior = behaviorById.get(occurrence.behaviorExternalId);

    if (!parentBehavior || parentBehavior.action === "skip") {
      skip(occurrence, "parent_behavior_skipped");
    }

    if (scheduleById.get(occurrence.scheduleExternalId)?.action === "skip") {
      skip(occurrence, "parent_schedule_skipped");
    }

    const existingById = existingOccurrenceById.get(occurrence.externalId);
    const existingByExactTime = existingOccurrenceByExactTime.get(
      `${occurrence.behaviorExternalId}|${occurrence.scheduledForUtc}`,
    );
    const existingByLikelyTime =
      parentBehavior &&
      existingOccurrenceByLikelyTime.get(
        occurrenceIdentity({
          behaviorTitle: parentBehavior.title,
          scheduledForUtc: occurrence.scheduledForUtc,
          localDate: occurrence.localDate,
          timezone: occurrence.timezone,
        }),
      );

    if (existingById) {
      addOccurrenceConflict(
        input.conflicts,
        occurrence,
        "existing_occurrence_id",
        `Occurrence ${occurrence.externalId} already exists locally.`,
        existingById.id,
      );
      skip(occurrence, "existing_occurrence_id");
      continue;
    }

    if (existingByExactTime || existingByLikelyTime) {
      addOccurrenceConflict(
        input.conflicts,
        occurrence,
        "likely_existing_occurrence",
        `Occurrence ${occurrence.externalId} looks like an existing local occurrence.`,
        (existingByExactTime || existingByLikelyTime)?.id,
      );
      skip(occurrence, "likely_existing_occurrence");
    }
  }

  const occurrenceById = new Map(
    input.plan.occurrences.map((occurrence) => [
      occurrence.externalId,
      occurrence,
    ]),
  );
  const existingEventById = new Map(
    (existing.statusEvents ?? []).map((event) => [event.id, event]),
  );
  const existingEventByFingerprint = new Map(
    (existing.statusEvents ?? []).map((event) => [
      statusEventIdentity(event.occurrenceId, event.recordedAtUtc, event.status),
      event,
    ]),
  );

  for (const event of input.plan.statusEvents) {
    const parentOccurrence = occurrenceById.get(event.occurrenceExternalId);

    if (!parentOccurrence || parentOccurrence.action === "skip") {
      skip(event, "parent_occurrence_skipped");
    }

    const existingById = existingEventById.get(event.externalId);
    const existingByFingerprint = existingEventByFingerprint.get(
      statusEventIdentity(
        event.occurrenceExternalId,
        event.recordedAtUtc,
        event.status,
      ),
    );

    if (existingById) {
      addStatusEventConflict(
        input.conflicts,
        event,
        "existing_status_event_id",
        `Status event ${event.externalId} already exists locally.`,
        existingById.id,
      );
      skip(event, "existing_status_event_id");
      continue;
    }

    if (existingByFingerprint) {
      addStatusEventConflict(
        input.conflicts,
        event,
        "likely_existing_status_event",
        `Status event ${event.externalId} looks like an existing local status event.`,
        existingByFingerprint.id,
      );
      skip(event, "likely_existing_status_event");
    }
  }

  const statusEventById = new Map(
    input.plan.statusEvents.map((event) => [event.externalId, event]),
  );

  for (const note of input.plan.notes) {
    if (
      note.attachedToType === "behavior" &&
      behaviorById.get(note.attachedToId)?.action === "skip"
    ) {
      skip(note, "parent_behavior_skipped");
    }

    if (
      note.attachedToType === "occurrence" &&
      occurrenceById.get(note.attachedToId)?.action === "skip"
    ) {
      skip(note, "parent_occurrence_skipped");
    }

    if (
      note.attachedToType === "status_event" &&
      statusEventById.get(note.attachedToId)?.action === "skip"
    ) {
      skip(note, "parent_status_event_skipped");
    }
  }
}

function warnAboutSnapshotHistory(input: {
  plan: BehaviorLogImportPlan;
  warnings: BehaviorLogImportIssue[];
}): void {
  const eventsByOccurrenceId = groupBy(
    input.plan.statusEvents,
    (event) => event.occurrenceExternalId,
  );

  for (const occurrence of input.plan.occurrences) {
    const events = eventsByOccurrenceId.get(occurrence.externalId) ?? [];

    if (occurrence.currentStatus !== "unresolved" && events.length === 0) {
      input.warnings.push({
        severity: "warning",
        code: "resolved_snapshot_without_history",
        message: `Occurrence ${occurrence.externalId} has current_status ${occurrence.currentStatus} but no status_events row.`,
        file: JSONL_FILES.occurrences,
      });
      continue;
    }

    if (events.length === 0) {
      continue;
    }

    const latestEvent = [...events].sort(compareStatusEventPlans).at(-1);

    if (latestEvent && latestEvent.status !== occurrence.currentStatus) {
      input.warnings.push({
        severity: "warning",
        code: "snapshot_status_differs_from_history",
        message: `Occurrence ${occurrence.externalId} current_status ${occurrence.currentStatus} differs from latest status event ${latestEvent.status}.`,
        file: JSONL_FILES.occurrences,
      });
    }
  }
}

type MergePreviewBuildInput = {
  plan: BehaviorLogImportPlan;
  existing?: BehaviorLogExistingRecords;
  privacy: BehaviorLogImportMergePreview["privacy"];
  interventions: BehaviorLogImportInterventionPreviewPlan[];
};

type MergePreviewContext = {
  existing: BehaviorLogExistingRecords;
  mappingsByKey: Map<string, string>;
  behaviorsById: Map<string, NonNullable<BehaviorLogExistingRecords["behaviors"]>[number]>;
  behaviorsBySourceOriginalId: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["behaviors"]>[number]
  >;
  behaviorsByIdentity: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["behaviors"]>[number]
  >;
  behaviorsByCadenceIdentity: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["behaviors"]>[number]
  >;
  behaviorsByTitle: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["behaviors"]>[number]
  >;
  schedulesById: Map<string, NonNullable<BehaviorLogExistingRecords["schedules"]>[number]>;
  schedulesByBehaviorId: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["schedules"]>[number][]
  >;
  occurrencesById: Map<string, NonNullable<BehaviorLogExistingRecords["occurrences"]>[number]>;
  occurrencesBySourceOriginalId: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["occurrences"]>[number]
  >;
  statusEventsById: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["statusEvents"]>[number]
  >;
  statusEventsBySourceOriginalId: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["statusEvents"]>[number]
  >;
  statusEventsByFingerprint: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["statusEvents"]>[number]
  >;
  importedNotesById: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["importedNotes"]>[number]
  >;
  importedNotesByExternalId: Map<
    string,
    NonNullable<BehaviorLogExistingRecords["importedNotes"]>[number]
  >;
  importedSchedulesByBehaviorId: Map<string, BehaviorLogImportSchedulePlan[]>;
};

function buildMergePreview(
  input: MergePreviewBuildInput,
): BehaviorLogImportMergePreview {
  const context = createMergePreviewContext(input);
  const conflicts: BehaviorLogImportMergeConflict[] = [];
  const behaviorActions = input.plan.behaviors.map((behavior) =>
    resolveBehaviorMergeAction(behavior, context, conflicts),
  );
  const behaviorActionsByExternalId = new Map(
    behaviorActions.map((action) => [action.externalId, action]),
  );
  const scheduleActions = input.plan.schedules.map((schedule) =>
    resolveScheduleMergeAction({
      schedule,
      context,
      conflicts,
      behaviorActionsByExternalId,
    }),
  );
  const scheduleActionsByExternalId = new Map(
    scheduleActions.map((action) => [action.externalId, action]),
  );
  const occurrenceActions = input.plan.occurrences.map((occurrence) =>
    resolveOccurrenceMergeAction({
      occurrence,
      context,
      conflicts,
      behaviorActionsByExternalId,
      scheduleActionsByExternalId,
    }),
  );
  const occurrenceActionsByExternalId = new Map(
    occurrenceActions.map((action) => [action.externalId, action]),
  );
  const statusEventActions = input.plan.statusEvents.map((event) =>
    resolveStatusEventMergeAction({
      event,
      context,
      conflicts,
      occurrenceActionsByExternalId,
    }),
  );
  const statusEventActionsByExternalId = new Map(
    statusEventActions.map((action) => [action.externalId, action]),
  );
  const noteActions = input.plan.notes.map((note) =>
    resolveNoteMergeAction({
      note,
      context,
      conflicts,
      behaviorActionsByExternalId,
      occurrenceActionsByExternalId,
      statusEventActionsByExternalId,
    }),
  );
  const interventionActions = input.interventions.map((intervention) =>
    resolveInterventionMergeAction({
      intervention,
      context,
      conflicts,
      behaviorActionsByExternalId,
      occurrenceActionsByExternalId,
    }),
  );
  const actions = {
    behaviors: behaviorActions,
    schedules: scheduleActions,
    occurrences: occurrenceActions,
    statusEvents: statusEventActions,
    notes: noteActions,
    interventions: interventionActions,
  };

  return {
    mode: "merge_preview",
    privacy: input.privacy,
    semantics: {
      jsonlAuthoritative: true,
      csvIgnoredForMerge: true,
      statusEventsAuthoritative: true,
      unresolvedIsFailure: false,
      appendOnlyStatusEvents: true,
    },
    actionCounts: countMergeActions(actions),
    conflictCodes: [...new Set(conflicts.map((conflict) => conflict.code))].sort(),
    conflictCount: conflicts.length,
    conflicts,
    actions,
  };
}

function createMergePreviewContext(
  input: MergePreviewBuildInput,
): MergePreviewContext {
  const existing = input.existing ?? {};
  const existingSchedules = dedupeById([
    ...(existing.schedules ?? []),
    ...(existing.behaviors ?? []).flatMap((behavior) => behavior.schedules ?? []),
  ]);
  const behaviors = existing.behaviors ?? [];
  const occurrences = existing.occurrences ?? [];
  const statusEvents = existing.statusEvents ?? [];
  const importedNotes = existing.importedNotes ?? [];

  return {
    existing,
    mappingsByKey: new Map(
      (existing.mappings ?? []).map((mapping) => [
        mergeMappingKey(mapping.recordType, mapping.externalId),
        mapping.localId,
      ]),
    ),
    behaviorsById: new Map(behaviors.map((behavior) => [behavior.id, behavior])),
    behaviorsBySourceOriginalId: indexByOptionalString(
      behaviors,
      (behavior) => behavior.sourceOriginalId,
    ),
    behaviorsByIdentity: new Map(
      behaviors.map((behavior) => [
        behaviorIdentity(behavior.title, behavior.category ?? null),
        behavior,
      ]),
    ),
    behaviorsByCadenceIdentity: new Map(
      behaviors.flatMap((behavior) =>
        behavior.cadenceCategoryName
          ? [
              [
                behaviorIdentity(
                  behavior.title,
                  behavior.cadenceCategoryName,
                ),
                behavior,
              ] as const,
            ]
          : [],
      ),
    ),
    behaviorsByTitle: new Map(
      behaviors.map((behavior) => [normalizeIdentity(behavior.title), behavior]),
    ),
    schedulesById: new Map(
      existingSchedules.map((schedule) => [schedule.id, schedule]),
    ),
    schedulesByBehaviorId: groupBy(
      existingSchedules,
      (schedule) => schedule.behaviorId,
    ),
    occurrencesById: new Map(
      occurrences.map((occurrence) => [occurrence.id, occurrence]),
    ),
    occurrencesBySourceOriginalId: indexByOptionalString(
      occurrences,
      (occurrence) => occurrence.sourceOriginalId,
    ),
    statusEventsById: new Map(statusEvents.map((event) => [event.id, event])),
    statusEventsBySourceOriginalId: indexByOptionalString(
      statusEvents,
      (event) => event.sourceOriginalId,
    ),
    statusEventsByFingerprint: new Map(
      statusEvents.map((event) => [
        statusEventMergeIdentity(
          event.occurrenceId,
          event.recordedAtUtc,
          event.status,
          event.statusSemantics ?? null,
          event.revisesEventId ?? null,
        ),
        event,
      ]),
    ),
    importedNotesById: new Map(
      importedNotes.map((note) => [note.id, note]),
    ),
    importedNotesByExternalId: new Map(
      importedNotes.map((note) => [note.externalId, note]),
    ),
    importedSchedulesByBehaviorId: groupBy(
      input.plan.schedules,
      (schedule) => schedule.behaviorExternalId,
    ),
  };
}

function resolveBehaviorMergeAction(
  behavior: BehaviorLogImportBehaviorPlan,
  context: MergePreviewContext,
  conflicts: BehaviorLogImportMergeConflict[],
): BehaviorLogImportMergeRecordAction {
  const mappedLocalId = context.mappingsByKey.get(
    mergeMappingKey("behavior", behavior.externalId),
  );
  const mappedBehavior = mappedLocalId
    ? context.behaviorsById.get(mappedLocalId)
    : undefined;

  if (mappedLocalId && !mappedBehavior) {
    return conflictMergeAction({
      conflicts,
      recordType: "behavior",
      externalId: behavior.externalId,
      localId: mappedLocalId,
      codes: ["behavior_mapped_record_missing"],
      reasons: [
        `Existing import mapping points behavior ${behavior.externalId} at local behavior ${mappedLocalId}, but that local behavior was not provided to the preview.`,
      ],
    });
  }

  if (mappedBehavior) {
    return behaviorCandidateAction({
      behavior,
      existing: mappedBehavior,
      context,
      conflicts,
      reason: `Existing import mapping links behavior ${behavior.externalId} to local behavior ${mappedBehavior.id}.`,
    });
  }

  const sourceMatch = behavior.sourceOriginalId
    ? context.behaviorsBySourceOriginalId.get(behavior.sourceOriginalId) ??
      context.behaviorsById.get(behavior.sourceOriginalId)
    : undefined;

  if (sourceMatch) {
    return behaviorCandidateAction({
      behavior,
      existing: sourceMatch,
      context,
      conflicts,
      reason: `Behavior ${behavior.externalId} shares source original id ${behavior.sourceOriginalId}.`,
    });
  }

  const idMatch = context.behaviorsById.get(behavior.externalId);

  if (idMatch) {
    return behaviorCandidateAction({
      behavior,
      existing: idMatch,
      context,
      conflicts,
      reason: `Behavior ${behavior.externalId} matches a local behavior id.`,
    });
  }

  const cadenceIdentityMatch = behavior.cadenceCategoryName
    ? context.behaviorsByCadenceIdentity.get(
        behaviorIdentity(behavior.title, behavior.cadenceCategoryName),
      )
    : undefined;
  const identityMatch =
    cadenceIdentityMatch ??
    context.behaviorsByIdentity.get(
      behaviorIdentity(behavior.title, behaviorCategoryForIdentity(behavior)),
    );

  if (identityMatch) {
    return behaviorCandidateAction({
      behavior,
      existing: identityMatch,
      context,
      conflicts,
      reason: cadenceIdentityMatch
        ? `Behavior ${behavior.externalId} matches local Cadence title/category identity.`
        : `Behavior ${behavior.externalId} matches local canonical title/category identity.`,
    });
  }

  const titleOnlyMatch = context.behaviorsByTitle.get(
    normalizeIdentity(behavior.title),
  );

  if (titleOnlyMatch) {
    return behaviorCandidateAction({
      behavior,
      existing: titleOnlyMatch,
      context,
      conflicts,
      reason: `Behavior ${behavior.externalId} has the same title as local behavior ${titleOnlyMatch.id}, but category or provenance differs.`,
    });
  }

  return mergeAction({
    recordType: "behavior",
    externalId: behavior.externalId,
    action: "create_new",
    localId: null,
    reasons: [`Behavior ${behavior.externalId} has no local match.`],
  });
}

function behaviorCandidateAction(input: {
  behavior: BehaviorLogImportBehaviorPlan;
  existing: NonNullable<BehaviorLogExistingRecords["behaviors"]>[number];
  context: MergePreviewContext;
  conflicts: BehaviorLogImportMergeConflict[];
  reason: string;
}): BehaviorLogImportMergeRecordAction {
  const { codes, reasons } = compareBehaviorCandidate(
    input.behavior,
    input.existing,
    input.context,
  );

  if (codes.length > 0) {
    return conflictMergeAction({
      conflicts: input.conflicts,
      recordType: "behavior",
      externalId: input.behavior.externalId,
      localId: input.existing.id,
      codes,
      reasons,
    });
  }

  return mergeAction({
    recordType: "behavior",
    externalId: input.behavior.externalId,
    action: "map_to_existing",
    localId: input.existing.id,
    reasons: [input.reason],
  });
}

function resolveScheduleMergeAction(input: {
  schedule: BehaviorLogImportSchedulePlan;
  context: MergePreviewContext;
  conflicts: BehaviorLogImportMergeConflict[];
  behaviorActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
}): BehaviorLogImportMergeRecordAction {
  const parent = input.behaviorActionsByExternalId.get(
    input.schedule.behaviorExternalId,
  );

  if (parent?.action === "conflict_requires_decision") {
    return conflictMergeAction({
      conflicts: input.conflicts,
      recordType: "schedule",
      externalId: input.schedule.externalId,
      localId: null,
      codes: ["schedule_parent_behavior_conflict"],
      reasons: [
        `Schedule ${input.schedule.externalId} cannot be compared until behavior ${input.schedule.behaviorExternalId} is resolved.`,
      ],
      relatedExternalIds: {
        behavior: input.schedule.behaviorExternalId,
      },
    });
  }

  if (!parent?.localId) {
    return mergeAction({
      recordType: "schedule",
      externalId: input.schedule.externalId,
      action: "create_new",
      localId: null,
      reasons: [
        `Schedule ${input.schedule.externalId} belongs to a behavior that will be created.`,
      ],
      relatedExternalIds: {
        behavior: input.schedule.behaviorExternalId,
      },
    });
  }

  const mappedLocalId = input.context.mappingsByKey.get(
    mergeMappingKey("schedule", input.schedule.externalId),
  );
  const mappedSchedule = mappedLocalId
    ? input.context.schedulesById.get(mappedLocalId)
    : undefined;

  if (mappedLocalId && !mappedSchedule) {
    return conflictMergeAction({
      conflicts: input.conflicts,
      recordType: "schedule",
      externalId: input.schedule.externalId,
      localId: mappedLocalId,
      codes: ["schedule_mapped_record_missing"],
      reasons: [
        `Existing import mapping points schedule ${input.schedule.externalId} at local schedule ${mappedLocalId}, but that local schedule was not provided to the preview.`,
      ],
      relatedExternalIds: {
        behavior: input.schedule.behaviorExternalId,
      },
    });
  }

  const sourceMatch = input.schedule.sourceOriginalId
    ? input.context.schedulesById.get(input.schedule.sourceOriginalId)
    : undefined;
  const idMatch = input.context.schedulesById.get(input.schedule.externalId);
  const shapeMatch = (
    input.context.schedulesByBehaviorId.get(parent.localId) ?? []
  ).find((schedule) => schedulesMatch(input.schedule, schedule));
  const candidate = mappedSchedule ?? sourceMatch ?? idMatch ?? shapeMatch;

  if (candidate) {
    const { codes, reasons } = compareScheduleCandidate(
      input.schedule,
      candidate,
      parent.localId,
    );

    if (codes.length > 0) {
      return conflictMergeAction({
        conflicts: input.conflicts,
        recordType: "schedule",
        externalId: input.schedule.externalId,
        localId: candidate.id,
        codes,
        reasons,
        relatedExternalIds: {
          behavior: input.schedule.behaviorExternalId,
        },
      });
    }

    return mergeAction({
      recordType: "schedule",
      externalId: input.schedule.externalId,
      action: "map_to_existing",
      localId: candidate.id,
      reasons: [
        `Schedule ${input.schedule.externalId} matches a local schedule for behavior ${parent.localId}.`,
      ],
      relatedExternalIds: {
        behavior: input.schedule.behaviorExternalId,
      },
    });
  }

  return mergeAction({
    recordType: "schedule",
    externalId: input.schedule.externalId,
    action: "create_new",
    localId: null,
    reasons: [
      `Schedule ${input.schedule.externalId} has no matching local recurrence and slot shape.`,
    ],
    relatedExternalIds: {
      behavior: input.schedule.behaviorExternalId,
    },
  });
}

function resolveOccurrenceMergeAction(input: {
  occurrence: BehaviorLogImportOccurrencePlan;
  context: MergePreviewContext;
  conflicts: BehaviorLogImportMergeConflict[];
  behaviorActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
  scheduleActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
}): BehaviorLogImportMergeRecordAction {
  const behaviorAction = input.behaviorActionsByExternalId.get(
    input.occurrence.behaviorExternalId,
  );
  const scheduleAction = input.scheduleActionsByExternalId.get(
    input.occurrence.scheduleExternalId,
  );

  if (
    behaviorAction?.action === "conflict_requires_decision" ||
    scheduleAction?.action === "conflict_requires_decision"
  ) {
    return conflictMergeAction({
      conflicts: input.conflicts,
      recordType: "occurrence",
      externalId: input.occurrence.externalId,
      localId: null,
      codes: ["occurrence_parent_mapping_unresolved"],
      reasons: [
        `Occurrence ${input.occurrence.externalId} cannot be compared until its behavior and schedule are resolved.`,
      ],
      localDate: input.occurrence.localDate,
      timezone: input.occurrence.timezone,
      relatedExternalIds: {
        behavior: input.occurrence.behaviorExternalId,
        schedule: input.occurrence.scheduleExternalId,
      },
    });
  }

  if (!behaviorAction?.localId || !scheduleAction?.localId) {
    return mergeAction({
      recordType: "occurrence",
      externalId: input.occurrence.externalId,
      action: "create_new",
      localId: null,
      reasons: [
        `Occurrence ${input.occurrence.externalId} belongs to behavior or schedule records that will be created.`,
      ],
      relatedExternalIds: {
        behavior: input.occurrence.behaviorExternalId,
        schedule: input.occurrence.scheduleExternalId,
      },
    });
  }

  const localBehaviorId = behaviorAction.localId;
  const localScheduleId = scheduleAction.localId;
  const mappedLocalId = input.context.mappingsByKey.get(
    mergeMappingKey("occurrence", input.occurrence.externalId),
  );
  const mappedOccurrence = mappedLocalId
    ? input.context.occurrencesById.get(mappedLocalId)
    : undefined;

  if (mappedLocalId && !mappedOccurrence) {
    return occurrenceConflictAction({
      occurrence: input.occurrence,
      conflicts: input.conflicts,
      localId: mappedLocalId,
      codes: ["occurrence_mapped_record_missing"],
      reasons: [
        `Existing import mapping points occurrence ${input.occurrence.externalId} at local occurrence ${mappedLocalId}, but that local occurrence was not provided to the preview.`,
      ],
    });
  }

  const sourceMatch = input.occurrence.sourceOriginalId
    ? input.context.occurrencesBySourceOriginalId.get(
        input.occurrence.sourceOriginalId,
      ) ?? input.context.occurrencesById.get(input.occurrence.sourceOriginalId)
    : undefined;
  const idMatch = input.context.occurrencesById.get(input.occurrence.externalId);
  const exactMatch = (input.context.existing.occurrences ?? []).find((candidate) =>
    occurrencesMatch(input.occurrence, candidate, {
      behaviorId: localBehaviorId,
      scheduleId: localScheduleId,
    }),
  );
  const sameInstantMismatch = (input.context.existing.occurrences ?? []).find(
    (candidate) =>
      candidate.behaviorId === localBehaviorId &&
      optionalStringsEqual(candidate.scheduleId, localScheduleId) &&
      candidate.scheduledForUtc === input.occurrence.scheduledForUtc &&
      !occurrencesMatch(input.occurrence, candidate, {
        behaviorId: localBehaviorId,
        scheduleId: localScheduleId,
      }),
  );
  const candidate =
    mappedOccurrence ?? sourceMatch ?? idMatch ?? exactMatch ?? sameInstantMismatch;

  if (candidate) {
    const { codes, reasons } = compareOccurrenceCandidate(input.occurrence, candidate, {
      behaviorId: localBehaviorId,
      scheduleId: localScheduleId,
    });

    if (codes.length > 0) {
      return occurrenceConflictAction({
        occurrence: input.occurrence,
        conflicts: input.conflicts,
        localId: candidate.id,
        codes,
        reasons,
      });
    }

    return mergeAction({
      recordType: "occurrence",
      externalId: input.occurrence.externalId,
      action: "map_to_existing",
      localId: candidate.id,
      reasons: [
        `Occurrence ${input.occurrence.externalId} matches a local occurrence by mapped behavior, mapped schedule, scheduled_for_utc, local_date, and timezone.`,
      ],
      relatedExternalIds: {
        behavior: input.occurrence.behaviorExternalId,
        schedule: input.occurrence.scheduleExternalId,
      },
    });
  }

  return mergeAction({
    recordType: "occurrence",
    externalId: input.occurrence.externalId,
    action: "create_new",
    localId: null,
    reasons: [
      `Occurrence ${input.occurrence.externalId} has no local match by mapped behavior, mapped schedule, scheduled_for_utc, local_date, and timezone.`,
    ],
    relatedExternalIds: {
      behavior: input.occurrence.behaviorExternalId,
      schedule: input.occurrence.scheduleExternalId,
    },
  });
}

function resolveStatusEventMergeAction(input: {
  event: BehaviorLogImportStatusEventPlan;
  context: MergePreviewContext;
  conflicts: BehaviorLogImportMergeConflict[];
  occurrenceActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
}): BehaviorLogImportMergeRecordAction {
  const occurrenceAction = input.occurrenceActionsByExternalId.get(
    input.event.occurrenceExternalId,
  );

  if (occurrenceAction?.action === "conflict_requires_decision") {
    return statusEventConflictAction({
      event: input.event,
      conflicts: input.conflicts,
      localId: null,
      codes: ["status_event_parent_mapping_unresolved"],
      reasons: [
        `Status event ${input.event.externalId} cannot be compared until occurrence ${input.event.occurrenceExternalId} is resolved.`,
      ],
    });
  }

  if (!occurrenceAction?.localId) {
    return mergeAction({
      recordType: "status_event",
      externalId: input.event.externalId,
      action: "create_new",
      localId: null,
      reasons: [
        `Status event ${input.event.externalId} belongs to an occurrence that will be created. status_events.jsonl remains authoritative over the occurrence current_status snapshot.`,
      ],
      relatedExternalIds: {
        occurrence: input.event.occurrenceExternalId,
        behavior: input.event.behaviorExternalId,
        revisesEvent: input.event.revisesEventId,
      },
    });
  }

  const revisionCode = unresolvedRevisionCode(input.event, input.context);
  const mappedLocalId = input.context.mappingsByKey.get(
    mergeMappingKey("status_event", input.event.externalId),
  );
  const mappedEvent = mappedLocalId
    ? input.context.statusEventsById.get(mappedLocalId)
    : undefined;

  if (mappedLocalId && !mappedEvent) {
    return statusEventConflictAction({
      event: input.event,
      conflicts: input.conflicts,
      localId: mappedLocalId,
      codes: ["status_event_mapped_record_missing"],
      reasons: [
        `Existing import mapping points status event ${input.event.externalId} at local event ${mappedLocalId}, but that local event was not provided to the preview.`,
      ],
    });
  }

  const sourceMatch = input.event.sourceOriginalId
    ? input.context.statusEventsBySourceOriginalId.get(input.event.sourceOriginalId) ??
      input.context.statusEventsById.get(input.event.sourceOriginalId)
    : undefined;
  const idMatch = input.context.statusEventsById.get(input.event.externalId);
  const fingerprintMatch = input.context.statusEventsByFingerprint.get(
    statusEventMergeIdentity(
      occurrenceAction.localId,
      input.event.recordedAtUtc,
      input.event.status,
      input.event.statusSemantics,
      localRevisionTargetId(input.event, input.context),
    ),
  );
  const candidate = mappedEvent ?? sourceMatch ?? idMatch ?? fingerprintMatch;

  if (candidate) {
    const { codes, reasons } = compareStatusEventCandidate(input.event, candidate, {
      occurrenceId: occurrenceAction.localId,
      revisionTargetId: localRevisionTargetId(input.event, input.context),
    });
    const allCodes = [...codes, ...revisionCode.codes];
    const allReasons = [...reasons, ...revisionCode.reasons];

    if (allCodes.length > 0) {
      return statusEventConflictAction({
        event: input.event,
        conflicts: input.conflicts,
        localId: candidate.id,
        codes: allCodes,
        reasons: allReasons,
      });
    }

    return mergeAction({
      recordType: "status_event",
      externalId: input.event.externalId,
      action: fingerprintMatch ? "skip_existing" : "map_to_existing",
      localId: candidate.id,
      reasons: [
        fingerprintMatch
          ? `Status event ${input.event.externalId} already exists locally with the same occurrence, recorded time, status, semantics, and revision target.`
          : `Status event ${input.event.externalId} maps to local status event ${candidate.id}.`,
      ],
      relatedExternalIds: {
        occurrence: input.event.occurrenceExternalId,
        behavior: input.event.behaviorExternalId,
        revisesEvent: input.event.revisesEventId,
      },
    });
  }

  if (revisionCode.codes.length > 0) {
    return statusEventConflictAction({
      event: input.event,
      conflicts: input.conflicts,
      localId: null,
      codes: revisionCode.codes,
      reasons: revisionCode.reasons,
    });
  }

  return mergeAction({
    recordType: "status_event",
    externalId: input.event.externalId,
    action: "create_new",
    localId: null,
    reasons: [
      `Status event ${input.event.externalId} has no local append-only history match. status_events.jsonl remains authoritative over current_status snapshots.`,
    ],
    relatedExternalIds: {
      occurrence: input.event.occurrenceExternalId,
      behavior: input.event.behaviorExternalId,
      revisesEvent: input.event.revisesEventId,
    },
  });
}

function resolveNoteMergeAction(input: {
  note: BehaviorLogImportNotePlan;
  context: MergePreviewContext;
  conflicts: BehaviorLogImportMergeConflict[];
  behaviorActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
  occurrenceActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
  statusEventActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
}): BehaviorLogImportMergeRecordAction {
  const metadata = noteMergeMetadata(input.note);
  const mappedLocalId = input.context.mappingsByKey.get(
    mergeMappingKey("note", input.note.externalId),
  );

  if (mappedLocalId) {
    const importedNote = input.context.importedNotesById.get(mappedLocalId);

    if (!importedNote) {
      return conflictMergeAction({
        conflicts: input.conflicts,
        recordType: "note",
        externalId: input.note.externalId,
        localId: mappedLocalId,
        codes: ["note_mapped_record_missing"],
        reasons: [
          `Existing import mapping points note ${input.note.externalId} at ${mappedLocalId}, but no imported_notes row was provided. Cadence will not reinterpret legacy occurrence-note mappings as imported-note records.`,
        ],
        relatedExternalIds: noteRelatedExternalIds(input.note),
        metadata: {
          ...metadata,
          noteDecision: "mapped_imported_note_missing",
          noteStorageDecision: "requires_imported_note_record",
        },
      });
    }

    return mergeAction({
      recordType: "note",
      externalId: input.note.externalId,
      action: "map_to_existing",
      localId: importedNote.id,
      reasons: [
        `Existing import mapping links note ${input.note.externalId} to imported note ${importedNote.id}.`,
      ],
      relatedExternalIds: noteRelatedExternalIds(input.note),
      metadata: {
        ...metadata,
        noteDecision: "already_mapped",
        noteStorageDecision: "existing_imported_note_record",
      },
    });
  }

  const existingImportedNote = input.context.importedNotesByExternalId.get(
    input.note.externalId,
  );

  if (existingImportedNote) {
    return mergeAction({
      recordType: "note",
      externalId: input.note.externalId,
      action: "map_to_existing",
      localId: existingImportedNote.id,
      reasons: [
        `Imported note ${input.note.externalId} already exists as passive note ${existingImportedNote.id}.`,
      ],
      relatedExternalIds: noteRelatedExternalIds(input.note),
      metadata: {
        ...metadata,
        noteDecision: "already_imported_note_record",
        noteStorageDecision: "existing_imported_note_record",
      },
    });
  }

  if (input.note.action === "skip") {
    return mergeAction({
      recordType: "note",
      externalId: input.note.externalId,
      action: "skip_existing",
      localId: null,
      reasons: noteSkipReasons(input.note),
      relatedExternalIds: noteRelatedExternalIds(input.note),
      metadata: {
        ...metadata,
        noteDecision: "skip_unsupported_note",
        noteStorageDecision: "skip_imported_note_record",
      },
    });
  }

  if (input.note.noteRole === "ai_generated") {
    return mergeAction({
      recordType: "note",
      externalId: input.note.externalId,
      action: "skip_existing",
      localId: null,
      reasons: [
        `Note ${input.note.externalId} is AI-generated and will not be imported into Cadence notes.`,
      ],
      relatedExternalIds: noteRelatedExternalIds(input.note),
      metadata: {
        ...metadata,
        noteDecision: "skip_ai_generated_note",
        noteStorageDecision: "skip_imported_note_record",
      },
    });
  }

  const targetAction = noteTargetAction(input);

  if (targetAction?.action === "conflict_requires_decision") {
    return conflictMergeAction({
      conflicts: input.conflicts,
      recordType: "note",
      externalId: input.note.externalId,
      localId: null,
      codes: ["note_attachment_unresolved"],
      reasons: [
        `Note ${input.note.externalId} cannot be imported until its ${input.note.attachedToType} attachment is resolved.`,
      ],
      relatedExternalIds: noteRelatedExternalIds(input.note),
      metadata,
    });
  }

  if (input.note.attachedToType === "review") {
    return importedNoteRecordAction({
      note: input.note,
      metadata,
      noteDecision: "create_imported_note_record",
      reason: `Review note ${input.note.externalId} will be stored as passive imported note history.`,
    });
  }

  if (!targetAction) {
    return conflictMergeAction({
      conflicts: input.conflicts,
      recordType: "note",
      externalId: input.note.externalId,
      localId: null,
      codes: ["note_attachment_unresolved"],
      reasons: [
        `Note ${input.note.externalId} cannot be imported because ${input.note.attachedToType} ${input.note.attachedToId} has no merge action.`,
      ],
      relatedExternalIds: noteRelatedExternalIds(input.note),
      metadata,
    });
  }

  if (input.note.attachedToType !== "occurrence") {
    return importedNoteRecordAction({
      note: input.note,
      metadata,
      targetAction,
      noteDecision: "create_imported_note_record",
      reason: `Note ${input.note.externalId} will be stored as passive imported ${input.note.attachedToType} note history.`,
    });
  }

  if (targetAction.action === "create_new") {
    return importedNoteRecordAction({
      note: input.note,
      metadata,
      targetAction,
      noteDecision: "fill_created_occurrence_note",
      reason: `Note ${input.note.externalId} will be stored as an imported note and can fill occurrence ${input.note.attachedToId} after that occurrence is created.`,
    });
  }

  if (!targetAction.localId) {
    return importedNoteRecordAction({
      note: input.note,
      metadata,
      targetAction,
      noteDecision: "skip_missing_target",
      reason: `Note ${input.note.externalId} will be stored as imported note history without a local occurrence target.`,
    });
  }

  const localOccurrence = input.context.occurrencesById.get(targetAction.localId);

  if (!localOccurrence) {
    return importedNoteRecordAction({
      note: input.note,
      metadata,
      targetAction,
      noteDecision: "target_occurrence_not_provided",
      reason: `Note ${input.note.externalId} will be stored as imported note history; local occurrence ${targetAction.localId} was not provided for safe inline-note inspection.`,
    });
  }

  if (isEmptyNoteBody(localOccurrence.note)) {
    return importedNoteRecordAction({
      note: input.note,
      metadata,
      targetAction,
      noteDecision: "fill_empty_occurrence_note",
      reason: `Note ${input.note.externalId} will be stored as an imported note and may fill empty local occurrence note ${localOccurrence.id}.`,
      localDate: localOccurrence.localDate,
      timezone: localOccurrence.timezone,
    });
  }

  if (noteBodiesEqual(localOccurrence.note, input.note.bodyMarkdown)) {
    return importedNoteRecordAction({
      note: input.note,
      metadata,
      targetAction,
      noteDecision: "note_matches_existing_occurrence_note",
      reason: `Note ${input.note.externalId} will be stored as an imported note; its body already matches local occurrence ${localOccurrence.id}.`,
      localDate: localOccurrence.localDate,
      timezone: localOccurrence.timezone,
    });
  }

  return importedNoteRecordAction({
    note: input.note,
    metadata,
    targetAction,
    noteDecision: "requires_explicit_note_replace_decision",
    reason: `Note ${input.note.externalId} will be stored as passive imported note history; local occurrence ${localOccurrence.id} has a different inline note and will not be changed without an explicit later decision.`,
    localDate: localOccurrence.localDate,
    timezone: localOccurrence.timezone,
  });
}

function noteTargetAction(input: {
  note: BehaviorLogImportNotePlan;
  behaviorActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
  occurrenceActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
  statusEventActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
}): BehaviorLogImportMergeRecordAction | undefined {
  switch (input.note.attachedToType) {
    case "behavior":
      return input.behaviorActionsByExternalId.get(input.note.attachedToId);
    case "occurrence":
      return input.occurrenceActionsByExternalId.get(input.note.attachedToId);
    case "status_event":
      return input.statusEventActionsByExternalId.get(input.note.attachedToId);
    case "review":
      return undefined;
  }
}

function importedNoteRecordAction(input: {
  note: BehaviorLogImportNotePlan;
  metadata: Record<string, unknown>;
  targetAction?: BehaviorLogImportMergeRecordAction;
  noteDecision: string;
  reason: string;
  localDate?: string;
  timezone?: string;
}): BehaviorLogImportMergeRecordAction {
  return mergeAction({
    recordType: "note",
    externalId: input.note.externalId,
    action: "create_new",
    localId: null,
    reasons: [input.reason],
    relatedExternalIds: noteRelatedExternalIds(input.note),
    metadata: {
      ...input.metadata,
      noteDecision: input.noteDecision,
      noteStorageDecision: "create_imported_note_record",
      targetLocalId: input.targetAction?.localId ?? null,
      targetAction: input.targetAction?.action ?? null,
      localDate: input.localDate ?? null,
      timezone: input.timezone ?? null,
    },
  });
}

function noteRelatedExternalIds(
  note: BehaviorLogImportNotePlan,
): Record<string, string | null> {
  return {
    [note.attachedToType]: note.attachedToId,
  };
}

function noteSkipReasons(note: BehaviorLogImportNotePlan): string[] {
  if (note.skipReasons.length === 0) {
    return [`Note ${note.externalId} is skipped by the validated import plan.`];
  }

  return note.skipReasons.map(
    (reason) => `Note ${note.externalId} is skipped: ${reason}.`,
  );
}

function noteMergeMetadata(
  note: BehaviorLogImportNotePlan,
): Record<string, unknown> {
  const normalizedBody = normalizeNoteBody(note.bodyMarkdown) ?? note.bodyMarkdown;

  return {
    attachedToType: note.attachedToType,
    attachedToId: note.attachedToId,
    noteRole: note.noteRole,
    sensitivity: note.sensitivity,
    sourceOriginalId: note.sourceOriginalId ?? null,
    sourceCaptureMethod: note.sourceCaptureMethod,
    sourceConfidence: note.sourceConfidence,
    createdAtUtc: note.createdAtUtc,
    updatedAtUtc: note.updatedAtUtc,
    bodySha256: sha256(normalizedBody),
  };
}

function isEmptyNoteBody(value: string | null | undefined): boolean {
  return normalizeNoteBody(value) === null;
}

function noteBodiesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return normalizeNoteBody(left) === normalizeNoteBody(right);
}

function normalizeNoteBody(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\r\n/g, "\n").trim() ?? "";

  return normalized.length > 0 ? normalized : null;
}

function resolveInterventionMergeAction(input: {
  intervention: BehaviorLogImportInterventionPreviewPlan;
  context: MergePreviewContext;
  conflicts: BehaviorLogImportMergeConflict[];
  behaviorActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
  occurrenceActionsByExternalId: Map<string, BehaviorLogImportMergeRecordAction>;
}): BehaviorLogImportMergeRecordAction {
  const mappedLocalId = input.context.mappingsByKey.get(
    mergeMappingKey("intervention", input.intervention.externalId),
  );

  if (mappedLocalId) {
    return mergeAction({
      recordType: "intervention",
      externalId: input.intervention.externalId,
      action: "map_to_existing",
      localId: mappedLocalId,
      reasons: [
        `Existing import mapping links intervention ${input.intervention.externalId}.`,
      ],
    });
  }

  const behaviorAction = input.intervention.behaviorExternalId
    ? input.behaviorActionsByExternalId.get(input.intervention.behaviorExternalId)
    : undefined;
  const occurrenceAction = input.intervention.occurrenceExternalId
    ? input.occurrenceActionsByExternalId.get(
        input.intervention.occurrenceExternalId,
      )
    : undefined;

  if (
    behaviorAction?.action === "conflict_requires_decision" ||
    occurrenceAction?.action === "conflict_requires_decision"
  ) {
    return conflictMergeAction({
      conflicts: input.conflicts,
      recordType: "intervention",
      externalId: input.intervention.externalId,
      localId: null,
      codes: ["intervention_parent_unresolved"],
      reasons: [
        `Intervention ${input.intervention.externalId} cannot be reviewed until its behavior or occurrence is resolved.`,
      ],
      relatedExternalIds: {
        behavior: input.intervention.behaviorExternalId,
        occurrence: input.intervention.occurrenceExternalId,
      },
    });
  }

  return mergeAction({
    recordType: "intervention",
    externalId: input.intervention.externalId,
    action: "create_new",
    localId: null,
    reasons: [
      `Intervention ${input.intervention.externalId} can be stored as passive imported intervention history without reminder delivery or provider side effects.`,
    ],
    relatedExternalIds: {
      behavior: input.intervention.behaviorExternalId,
      occurrence: input.intervention.occurrenceExternalId,
    },
    metadata: interventionMergeMetadata({
      intervention: input.intervention,
      behaviorLocalId: behaviorAction?.localId ?? null,
      occurrenceLocalId: occurrenceAction?.localId ?? null,
    }),
  });
}

function interventionMergeMetadata(input: {
  intervention: BehaviorLogImportInterventionPreviewPlan;
  behaviorLocalId: string | null;
  occurrenceLocalId: string | null;
}): Record<string, unknown> {
  return {
    interventionDecision: "store_passive_history",
    interventionType: input.intervention.interventionType,
    channel: input.intervention.channel,
    deliveryStatus: input.intervention.deliveryStatus,
    scheduledSendAtUtc: input.intervention.scheduledSendAtUtc,
    sentAtUtc: input.intervention.sentAtUtc,
    behaviorExternalId: input.intervention.behaviorExternalId,
    occurrenceExternalId: input.intervention.occurrenceExternalId,
    behaviorLocalId: input.behaviorLocalId,
    occurrenceLocalId: input.occurrenceLocalId,
    storageDecision: input.intervention.storageDecision,
  };
}

function compareBehaviorCandidate(
  behavior: BehaviorLogImportBehaviorPlan,
  existing: NonNullable<BehaviorLogExistingRecords["behaviors"]>[number],
  context: MergePreviewContext,
): { codes: string[]; reasons: string[] } {
  const codes: string[] = [];
  const reasons: string[] = [];
  const canonicalIdentityDiffers =
    behaviorIdentity(behavior.title, behaviorCategoryForIdentity(behavior)) !==
    behaviorIdentity(existing.title, existing.category ?? null);
  const cadenceDisplayCategoryDiffers =
    behavior.cadenceCategoryName !== null &&
    existing.cadenceCategoryName != null &&
    normalizeIdentity(behavior.cadenceCategoryName) !==
      normalizeIdentity(existing.cadenceCategoryName);

  if (canonicalIdentityDiffers || cadenceDisplayCategoryDiffers) {
    codes.push("behavior_identity_mismatch");
    reasons.push(
      `Behavior ${behavior.externalId} differs from local behavior ${existing.id} by title or category identity.`,
    );
  }

  if (importedBehaviorArchived(behavior) !== existingBehaviorArchived(existing)) {
    codes.push("behavior_archive_state_mismatch");
    reasons.push(
      `Behavior ${behavior.externalId} archive state differs from local behavior ${existing.id}.`,
    );
  }

  if (
    !behaviorScheduleShapesCompatible(
      context.importedSchedulesByBehaviorId.get(behavior.externalId) ?? [],
      context.schedulesByBehaviorId.get(existing.id) ?? existing.schedules ?? [],
    )
  ) {
    codes.push("behavior_schedule_shape_mismatch");
    reasons.push(
      `Behavior ${behavior.externalId} schedule shape does not match local behavior ${existing.id}.`,
    );
  }

  return { codes, reasons };
}

function compareScheduleCandidate(
  schedule: BehaviorLogImportSchedulePlan,
  existing: NonNullable<BehaviorLogExistingRecords["schedules"]>[number],
  behaviorId: string,
): { codes: string[]; reasons: string[] } {
  if (existing.behaviorId === behaviorId && schedulesMatch(schedule, existing)) {
    return { codes: [], reasons: [] };
  }

  return {
    codes: ["schedule_shape_mismatch"],
    reasons: [
      `Schedule ${schedule.externalId} differs from local schedule ${existing.id} by behavior mapping, recurrence, timezone, active dates, or slot shape.`,
    ],
  };
}

function compareOccurrenceCandidate(
  occurrence: BehaviorLogImportOccurrencePlan,
  existing: NonNullable<BehaviorLogExistingRecords["occurrences"]>[number],
  parent: { behaviorId: string; scheduleId: string },
): { codes: string[]; reasons: string[] } {
  if (occurrencesMatch(occurrence, existing, parent)) {
    return { codes: [], reasons: [] };
  }

  return {
    codes: ["occurrence_identity_mismatch"],
    reasons: [
      `Occurrence ${occurrence.externalId} differs from local occurrence ${existing.id} by mapped behavior, mapped schedule, scheduled_for_utc, local_date, or timezone.`,
    ],
  };
}

function compareStatusEventCandidate(
  event: BehaviorLogImportStatusEventPlan,
  existing: NonNullable<BehaviorLogExistingRecords["statusEvents"]>[number],
  parent: { occurrenceId: string; revisionTargetId: string | null },
): { codes: string[]; reasons: string[] } {
  if (
    existing.occurrenceId === parent.occurrenceId &&
    existing.recordedAtUtc === event.recordedAtUtc &&
    existing.status === event.status &&
    (existing.statusSemantics ?? event.statusSemantics) ===
      event.statusSemantics &&
    optionalStringsEqual(existing.revisesEventId ?? null, parent.revisionTargetId)
  ) {
    return { codes: [], reasons: [] };
  }

  return {
    codes: ["status_event_identity_mismatch"],
    reasons: [
      `Status event ${event.externalId} differs from local event ${existing.id} by occurrence mapping, recorded time, status, semantics, or revision target.`,
    ],
  };
}

function occurrenceConflictAction(input: {
  occurrence: BehaviorLogImportOccurrencePlan;
  conflicts: BehaviorLogImportMergeConflict[];
  localId: string | null;
  codes: string[];
  reasons: string[];
}): BehaviorLogImportMergeRecordAction {
  return conflictMergeAction({
    conflicts: input.conflicts,
    recordType: "occurrence",
    externalId: input.occurrence.externalId,
    localId: input.localId,
    codes: input.codes,
    reasons: input.reasons,
    localDate: input.occurrence.localDate,
    timezone: input.occurrence.timezone,
    relatedExternalIds: {
      behavior: input.occurrence.behaviorExternalId,
      schedule: input.occurrence.scheduleExternalId,
    },
  });
}

function statusEventConflictAction(input: {
  event: BehaviorLogImportStatusEventPlan;
  conflicts: BehaviorLogImportMergeConflict[];
  localId: string | null;
  codes: string[];
  reasons: string[];
}): BehaviorLogImportMergeRecordAction {
  return conflictMergeAction({
    conflicts: input.conflicts,
    recordType: "status_event",
    externalId: input.event.externalId,
    localId: input.localId,
    codes: input.codes,
    reasons: input.reasons,
    localDate: input.event.localDate,
    timezone: input.event.timezone,
    relatedExternalIds: {
      occurrence: input.event.occurrenceExternalId,
      behavior: input.event.behaviorExternalId,
      revisesEvent: input.event.revisesEventId,
    },
  });
}

function conflictMergeAction(input: {
  conflicts: BehaviorLogImportMergeConflict[];
  recordType: BehaviorLogImportRecordType;
  externalId: string;
  localId: string | null;
  codes: string[];
  reasons: string[];
  localDate?: string;
  timezone?: string;
  relatedExternalIds?: Record<string, string | null>;
  metadata?: Record<string, unknown>;
}): BehaviorLogImportMergeRecordAction {
  for (const [index, code] of input.codes.entries()) {
    input.conflicts.push({
      code,
      reason: input.reasons[index] ?? input.reasons[0] ?? code,
      importedRecordType: input.recordType,
      importedId: input.externalId,
      existingId: input.localId,
      localDate: input.localDate,
      timezone: input.timezone,
    });
  }

  return mergeAction({
    recordType: input.recordType,
    externalId: input.externalId,
    action: "conflict_requires_decision",
    localId: input.localId,
    conflictCodes: input.codes,
    reasons: input.reasons,
    relatedExternalIds: input.relatedExternalIds,
    metadata: input.metadata,
  });
}

function mergeAction(input: {
  recordType: BehaviorLogImportRecordType;
  externalId: string;
  action: BehaviorLogImportMergeRecordAction["action"];
  localId: string | null;
  reasons: string[];
  conflictCodes?: string[];
  relatedExternalIds?: Record<string, string | null>;
  metadata?: Record<string, unknown>;
}): BehaviorLogImportMergeRecordAction {
  return {
    recordType: input.recordType,
    externalId: input.externalId,
    action: input.action,
    localId: input.localId,
    conflictCodes: input.conflictCodes ?? [],
    reasons: input.reasons,
    relatedExternalIds: input.relatedExternalIds,
    metadata: input.metadata,
  };
}

function countMergeActions(
  actions: BehaviorLogImportMergePreview["actions"],
): BehaviorLogImportMergePreview["actionCounts"] {
  const counts: BehaviorLogImportMergePreview["actionCounts"] = {
    create_new: 0,
    map_to_existing: 0,
    skip_existing: 0,
    conflict_requires_decision: 0,
  };

  for (const group of Object.values(actions)) {
    for (const action of group) {
      counts[action.action] += 1;
    }
  }

  return counts;
}

function behaviorCategoryForIdentity(
  behavior: BehaviorLogImportBehaviorPlan,
): string | null {
  // Candidate lookup follows the authoritative BehaviorLog category. When
  // both records also carry Cadence display-category metadata,
  // compareBehaviorCandidate verifies that identity separately.
  return behavior.category;
}

function importedBehaviorArchived(
  behavior: BehaviorLogImportBehaviorPlan,
): boolean {
  return Boolean(behavior.archivedAtUtc) || behavior.cadenceActive === false;
}

function existingBehaviorArchived(
  behavior: NonNullable<BehaviorLogExistingRecords["behaviors"]>[number],
): boolean {
  return Boolean(behavior.archivedAt) || behavior.active === false;
}

function behaviorScheduleShapesCompatible(
  importedSchedules: BehaviorLogImportSchedulePlan[],
  existingSchedules: NonNullable<BehaviorLogExistingRecords["schedules"]>,
): boolean {
  if (importedSchedules.length === 0 || existingSchedules.length === 0) {
    return true;
  }

  return importedSchedules.every((importedSchedule) =>
    existingSchedules.some((existingSchedule) =>
      schedulesMatch(importedSchedule, existingSchedule),
    ),
  );
}

function schedulesMatch(
  imported: BehaviorLogImportSchedulePlan,
  existing: NonNullable<BehaviorLogExistingRecords["schedules"]>[number],
): boolean {
  return (
    imported.recurrenceProfile === existing.recurrenceProfile &&
    stableStringify(imported.recurrence) === stableStringify(existing.recurrence) &&
    imported.timezone === existing.timezone &&
    normalizeLocalTimeForCompare(imported.localTime) ===
      normalizeLocalTimeForCompare(existing.localTime) &&
    normalizeLocalTimeForCompare(imported.windowStartLocal) ===
      normalizeLocalTimeForCompare(existing.windowStartLocal) &&
    normalizeLocalTimeForCompare(imported.windowEndLocal) ===
      normalizeLocalTimeForCompare(existing.windowEndLocal) &&
    (imported.cadenceScheduleKind ?? null) ===
      (existing.cadenceScheduleKind ?? null) &&
    (imported.cadenceSchedulePreset ?? null) ===
      (existing.cadenceSchedulePreset ?? null) &&
    imported.activeFromLocalDate === existing.activeFromLocalDate &&
    optionalStringsEqual(
      imported.activeUntilLocalDate,
      existing.activeUntilLocalDate,
    )
  );
}

function occurrencesMatch(
  imported: BehaviorLogImportOccurrencePlan,
  existing: NonNullable<BehaviorLogExistingRecords["occurrences"]>[number],
  parent: { behaviorId: string; scheduleId: string },
): boolean {
  return (
    existing.behaviorId === parent.behaviorId &&
    optionalStringsEqual(existing.scheduleId, parent.scheduleId) &&
    existing.scheduledForUtc === imported.scheduledForUtc &&
    existing.localDate === imported.localDate &&
    existing.timezone === imported.timezone
  );
}

function unresolvedRevisionCode(
  event: BehaviorLogImportStatusEventPlan,
  context: MergePreviewContext,
): { codes: string[]; reasons: string[] } {
  if (!event.revisesEventId) {
    return { codes: [], reasons: [] };
  }

  const hasImportedTarget = context.existing.statusEvents?.some(
    (candidate) =>
      candidate.id === event.revisesEventId ||
      candidate.sourceOriginalId === event.revisesEventId,
  );
  const hasMappedTarget = context.mappingsByKey.has(
    mergeMappingKey("status_event", event.revisesEventId),
  );

  if (hasImportedTarget || hasMappedTarget) {
    return { codes: [], reasons: [] };
  }

  return {
    codes: ["status_event_revision_target_unresolved"],
    reasons: [
      `Status event ${event.externalId} revises ${event.revisesEventId}, but that revision target has no local mapping in the merge preview input.`,
    ],
  };
}

function localRevisionTargetId(
  event: BehaviorLogImportStatusEventPlan,
  context: MergePreviewContext,
): string | null {
  if (!event.revisesEventId) {
    return null;
  }

  return (
    context.mappingsByKey.get(
      mergeMappingKey("status_event", event.revisesEventId),
    ) ??
    context.statusEventsById.get(event.revisesEventId)?.id ??
    context.statusEventsBySourceOriginalId.get(event.revisesEventId)?.id ??
    null
  );
}

function statusEventMergeIdentity(
  occurrenceId: string,
  recordedAtUtc: string,
  status: OccurrenceStatus,
  semantics: BehaviorLogStatusSemantics | null,
  revisesEventId: string | null,
): string {
  return [
    occurrenceId,
    recordedAtUtc,
    status,
    semantics ?? "",
    revisesEventId ?? "",
  ].join("|");
}

function readPrivacySummary(
  files: BehaviorLogImportFile[],
): BehaviorLogImportMergePreview["privacy"] {
  const manifest = parseLooseJsonObject(
    files.find((file) => file.path === "manifest.json")?.content ?? null,
  );
  const privacy = isRecord(manifest?.privacy) ? manifest.privacy : null;
  const profiles = Array.isArray(manifest?.profiles)
    ? manifest.profiles.filter((profile): profile is string =>
        typeof profile === "string",
      )
    : [];
  const containsNotesFile = files.some((file) => file.path === JSONL_FILES.notes);
  const containsInterventionsFile = files.some(
    (file) => file.path === JSONL_FILES.interventions,
  );

  return {
    profiles,
    redactionLevel: readPreviewString(privacy?.redaction_level),
    subjectIdStrategy: readPreviewString(privacy?.subject_id_strategy),
    containsNotes:
      readPreviewBoolean(privacy?.contains_notes) ?? containsNotesFile,
    containsInterventions:
      profiles.includes("interventions") || containsInterventionsFile,
    containsRawLocation: readPreviewBoolean(privacy?.contains_raw_location),
    containsHealthData: readPreviewBoolean(privacy?.contains_health_data),
    containsAiGeneratedContent: readPreviewBoolean(
      privacy?.contains_ai_generated_content,
    ),
  };
}

function parseLooseJsonObject(content: string | null): JsonRecord | null {
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readPreviewString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readPreviewBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function mergeMappingKey(
  recordType: BehaviorLogImportRecordType,
  externalId: string,
): string {
  return `${recordType}:${externalId}`;
}

function optionalStringsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return (left ?? null) === (right ?? null);
}

function normalizeLocalTimeForCompare(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return Temporal.PlainTime.from(value).toString({ smallestUnit: "minute" });
  } catch {
    return value;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function createBehaviorLogImportBundleFingerprint(
  files: BehaviorLogImportFile[],
): string {
  const hash = createHash("sha256");

  for (const file of [...files].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    hash.update(file.path, "utf8");
    hash.update("\0");
    hash.update(sha256(file.content), "utf8");
    hash.update("\0");
  }

  return hash.digest("hex");
}

export function createBehaviorLogImportLocalDataFingerprint(
  existing: BehaviorLogExistingRecords | undefined,
): string {
  return sha256(stableStringify(existing ?? {}));
}

function dedupeById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function indexByOptionalString<T>(
  values: T[],
  getKey: (value: T) => string | null | undefined,
): Map<string, T> {
  const map = new Map<string, T>();

  for (const value of values) {
    const key = getKey(value);

    if (key) {
      map.set(key, value);
    }
  }

  return map;
}

function summarizePreview(input: {
  schemaVersion: string | null;
  fileCount: number;
  plan: BehaviorLogImportPlan;
  errors: BehaviorLogImportIssue[];
  warnings: BehaviorLogImportIssue[];
  conflicts: BehaviorLogImportConflict[];
  unsupportedFields: BehaviorLogUnsupportedField[];
}): BehaviorLogImportPreview["summary"] {
  const allPlans = [
    ...input.plan.behaviors,
    ...input.plan.schedules,
    ...input.plan.occurrences,
    ...input.plan.statusEvents,
    ...input.plan.notes,
  ];
  const interventionCounts = summarizeInterventionCounts(input.plan);
  const interventionStorageSummary = summarizeInterventionStorage(input.plan);

  return {
    schemaVersion: input.schemaVersion,
    fileCount: input.fileCount,
    behaviorCount: input.plan.behaviors.length,
    scheduleCount: input.plan.schedules.length,
    occurrenceCount: input.plan.occurrences.length,
    statusEventCount: input.plan.statusEvents.length,
    noteCount: input.plan.notes.length,
    interventionCount: input.plan.interventions.length,
    interventionPreviewOnlyCount: input.plan.interventions.filter(
      (intervention) => intervention.action === "preview_only",
    ).length,
    interventionStoredCount: interventionStorageSummary.storedCount,
    interventionSensitiveFieldDropCount:
      interventionStorageSummary.sensitiveFieldDropCount,
    interventionRedactedFieldCount: interventionStorageSummary.redactedFieldCount,
    interventionCounts,
    createCount: allPlans.filter((record) => record.action === "create")
      .length,
    skipCount: allPlans.filter((record) => record.action === "skip").length,
    errorCount: input.errors.length,
    warningCount: input.warnings.length,
    conflictCount: input.conflicts.length,
    unsupportedFieldCount: input.unsupportedFields.reduce(
      (count, entry) => count + entry.fields.length,
      0,
    ),
    dayGroups: summarizeDayGroups(input.plan, input.conflicts),
  };
}

function summarizeInterventionStorage(plan: BehaviorLogImportPlan): {
  storedCount: number;
  sensitiveFieldDropCount: number;
  redactedFieldCount: number;
} {
  return plan.interventions.reduce(
    (summary, intervention) => ({
      storedCount:
        intervention.storageDecision.decision === "store_passive_history"
          ? summary.storedCount + 1
          : summary.storedCount,
      sensitiveFieldDropCount:
        summary.sensitiveFieldDropCount +
        intervention.storageDecision.droppedSensitiveFields.length,
      redactedFieldCount:
        summary.redactedFieldCount +
        intervention.storageDecision.redactedFields.length,
    }),
    {
      storedCount: 0,
      sensitiveFieldDropCount: 0,
      redactedFieldCount: 0,
    },
  );
}

function summarizeInterventionCounts(
  plan: BehaviorLogImportPlan,
): BehaviorLogImportPreview["summary"]["interventionCounts"] {
  const behaviorsById = new Map(
    plan.behaviors.map((behavior) => [behavior.externalId, behavior]),
  );

  return {
    byChannel: countInterventionsBy(
      plan.interventions,
      (intervention) => intervention.channel,
    ),
    byDeliveryStatus: countInterventionsBy(
      plan.interventions,
      (intervention) => intervention.deliveryStatus,
    ),
    byBehavior: countInterventionsBy(
      plan.interventions,
      (intervention) => intervention.behaviorExternalId,
    ).map((entry) => ({
      behaviorExternalId: entry.value,
      behaviorTitle: behaviorsById.get(entry.value)?.title ?? null,
      count: entry.count,
    })),
  };
}

function countInterventionsBy<T>(
  interventions: BehaviorLogImportInterventionPreviewPlan[],
  getValue: (intervention: BehaviorLogImportInterventionPreviewPlan) => T,
): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();

  for (const intervention of interventions) {
    const value = getValue(intervention);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => String(left.value).localeCompare(String(right.value)));
}

function summarizeDayGroups(
  plan: BehaviorLogImportPlan,
  conflicts: BehaviorLogImportConflict[],
): BehaviorLogImportDayGroup[] {
  const groups = new Map<string, BehaviorLogImportDayGroup>();
  const add = (localDate: string, timezone: string) => {
    const key = `${localDate}|${timezone}`;
    const group =
      groups.get(key) ??
      ({
        localDate,
        timezone,
        occurrenceCount: 0,
        statusEventCount: 0,
        noteCount: 0,
        conflictCount: 0,
      } satisfies BehaviorLogImportDayGroup);

    groups.set(key, group);
    return group;
  };

  const occurrenceById = new Map(
    plan.occurrences.map((occurrence) => [occurrence.externalId, occurrence]),
  );

  for (const occurrence of plan.occurrences) {
    add(occurrence.localDate, occurrence.timezone).occurrenceCount += 1;
  }

  for (const event of plan.statusEvents) {
    add(event.localDate, event.timezone).statusEventCount += 1;
  }

  for (const note of plan.notes) {
    if (note.attachedToType !== "occurrence") {
      continue;
    }

    const occurrence = occurrenceById.get(note.attachedToId);

    if (occurrence) {
      add(occurrence.localDate, occurrence.timezone).noteCount += 1;
    }
  }

  for (const conflict of conflicts) {
    if (conflict.localDate && conflict.timezone) {
      add(conflict.localDate, conflict.timezone).conflictCount += 1;
    }
  }

  return [...groups.values()].sort((left, right) => {
    const dateComparison = left.localDate.localeCompare(right.localDate);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.timezone.localeCompare(right.timezone);
  });
}

function markDuplicateIds(
  plans: Array<{ action: "create" | "skip"; skipReasons: string[]; externalId: string }>,
  recordType: BehaviorLogImportConflict["importedRecordType"],
  conflicts: BehaviorLogImportConflict[],
): void {
  const seen = new Set<string>();

  for (const plan of plans) {
    if (seen.has(plan.externalId)) {
      addConflict(conflicts, {
        code: "duplicate_imported_id",
        message: `${recordType} ${plan.externalId} appears more than once in the bundle.`,
        importedRecordType: recordType,
        importedId: plan.externalId,
      });
      skip(plan, "duplicate_imported_id");
      continue;
    }

    seen.add(plan.externalId);
  }
}

function addOccurrenceConflict(
  conflicts: BehaviorLogImportConflict[],
  occurrence: BehaviorLogImportOccurrencePlan,
  code: string,
  message: string,
  existingId?: string,
): void {
  addConflict(conflicts, {
    code,
    message,
    importedRecordType: "occurrence",
    importedId: occurrence.externalId,
    existingId,
    localDate: occurrence.localDate,
    timezone: occurrence.timezone,
  });
}

function addStatusEventConflict(
  conflicts: BehaviorLogImportConflict[],
  event: BehaviorLogImportStatusEventPlan,
  code: string,
  message: string,
  existingId?: string,
): void {
  addConflict(conflicts, {
    code,
    message,
    importedRecordType: "status_event",
    importedId: event.externalId,
    existingId,
    localDate: event.localDate,
    timezone: event.timezone,
  });
}

function addConflict(
  conflicts: BehaviorLogImportConflict[],
  conflict: BehaviorLogImportConflict,
): void {
  conflicts.push(conflict);
}

function skip(
  record: { action: "create" | "skip"; skipReasons: string[] },
  reason: string,
): void {
  record.action = "skip";

  if (!record.skipReasons.includes(reason)) {
    record.skipReasons.push(reason);
  }
}

function readRequiredString(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = row.record[field];

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  errors.push({
    severity: "error",
    code: "required_field_invalid",
    message: `${row.file} row ${row.row} requires string field ${field}.`,
    file: row.file,
    row: row.row,
  });
  return null;
}

function readOptionalString(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = row.record[field];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  errors.push({
    severity: "error",
    code: "optional_field_invalid",
    message: `${row.file} row ${row.row} field ${field} must be a string or null.`,
    file: row.file,
    row: row.row,
  });
  return null;
}

function readRequiredObject(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): Record<string, unknown> | null {
  const value = row.record[field];

  if (isRecord(value)) {
    return value;
  }

  errors.push({
    severity: "error",
    code: "required_object_invalid",
    message: `${row.file} row ${row.row} requires object field ${field}.`,
    file: row.file,
    row: row.row,
  });
  return null;
}

function readRequiredInstant(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = readRequiredString(row, field, errors);

  return value ? normalizeInstant(value, row, field, errors) : null;
}

function readOptionalInstant(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = readOptionalString(row, field, errors);

  return value ? normalizeInstant(value, row, field, errors) : null;
}

function normalizeInstant(
  value: string,
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    errors.push({
      severity: "error",
      code: "instant_invalid",
      message: `${row.file} row ${row.row} field ${field} must be an ISO instant.`,
      file: row.file,
      row: row.row,
    });
    return null;
  }
}

function readRequiredLocalDate(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = readRequiredString(row, field, errors);

  return value ? normalizeLocalDate(value, row, field, errors) : null;
}

function readOptionalLocalDate(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = readOptionalString(row, field, errors);

  return value ? normalizeLocalDate(value, row, field, errors) : null;
}

function normalizeLocalDate(
  value: string,
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  try {
    return Temporal.PlainDate.from(value).toString();
  } catch {
    errors.push({
      severity: "error",
      code: "local_date_invalid",
      message: `${row.file} row ${row.row} field ${field} must be YYYY-MM-DD.`,
      file: row.file,
      row: row.row,
    });
    return null;
  }
}

function readRequiredTimezone(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = readRequiredString(row, field, errors);

  if (!value) {
    return null;
  }

  try {
    TIMEZONE_VALIDATION_INSTANT.toZonedDateTimeISO(value);
    return value;
  } catch {
    errors.push({
      severity: "error",
      code: "timezone_invalid",
      message: `${row.file} row ${row.row} field ${field} must be an IANA timezone.`,
      file: row.file,
      row: row.row,
    });
    return null;
  }
}

function readOptionalLocalTime(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): string | null {
  const value = readOptionalString(row, field, errors);

  if (!value) {
    return null;
  }

  try {
    return Temporal.PlainTime.from(value).toString({
      smallestUnit: "minute",
    });
  } catch {
    errors.push({
      severity: "error",
      code: "local_time_invalid",
      message: `${row.file} row ${row.row} field ${field} must be HH:MM or HH:MM:SS.`,
      file: row.file,
      row: row.row,
    });
    return null;
  }
}

function readRequiredStatus(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): OccurrenceStatus | null {
  const value = readRequiredString(row, field, errors);

  if (value && isOccurrenceStatus(value)) {
    return value;
  }

  if (value) {
    errors.push({
      severity: "error",
      code: "status_invalid",
      message: `${row.file} row ${row.row} field ${field} has unsupported status ${value}.`,
      file: row.file,
      row: row.row,
    });
  }

  return null;
}

function readOptionalStatus(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): OccurrenceStatus | null {
  const value = readOptionalString(row, field, errors);

  if (value === null) {
    return null;
  }

  if (isOccurrenceStatus(value)) {
    return value;
  }

  errors.push({
    severity: "error",
    code: "status_invalid",
    message: `${row.file} row ${row.row} field ${field} has unsupported status ${value}.`,
    file: row.file,
    row: row.row,
  });
  return null;
}

function readRequiredStatusSemantics(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): BehaviorLogStatusSemantics | null {
  const value = readRequiredString(row, field, errors);

  if (value && isStatusSemantics(value)) {
    return value;
  }

  if (value) {
    errors.push({
      severity: "error",
      code: "status_semantics_invalid",
      message: `${row.file} row ${row.row} field ${field} has unsupported semantics ${value}.`,
      file: row.file,
      row: row.row,
    });
  }

  return null;
}

function readRequiredAttachedToType(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): BehaviorLogImportNotePlan["attachedToType"] | null {
  const value = readRequiredString(row, field, errors);

  if (
    value === "behavior" ||
    value === "occurrence" ||
    value === "status_event" ||
    value === "review"
  ) {
    return value;
  }

  if (value) {
    errors.push({
      severity: "error",
      code: "note_target_type_invalid",
      message: `${row.file} row ${row.row} field ${field} has unsupported target type ${value}.`,
      file: row.file,
      row: row.row,
    });
  }

  return null;
}

function readRequiredNoteRole(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): BehaviorLogImportNotePlan["noteRole"] | null {
  const value = readRequiredString(row, field, errors);

  if (
    value === "user" ||
    value === "imported" ||
    value === "system" ||
    value === "ai_generated"
  ) {
    return value;
  }

  if (value) {
    errors.push({
      severity: "error",
      code: "note_role_invalid",
      message: `${row.file} row ${row.row} field ${field} has unsupported role ${value}.`,
      file: row.file,
      row: row.row,
    });
  }

  return null;
}

function readOptionalNoteSensitivity(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): BehaviorLogNoteSensitivity | null {
  const value = readOptionalString(row, field, errors);

  if (value === null) {
    return null;
  }

  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "restricted"
  ) {
    return value;
  }

  errors.push({
    severity: "error",
    code: "note_sensitivity_invalid",
    message: `${row.file} row ${row.row} field ${field} has unsupported sensitivity ${value}.`,
    file: row.file,
    row: row.row,
  });
  return null;
}

function readRequiredInterventionChannel(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): BehaviorLogInterventionChannel | null {
  const value = readRequiredString(row, field, errors);

  if (value && isInterventionChannel(value)) {
    return value;
  }

  if (value) {
    errors.push({
      severity: "error",
      code: "intervention_channel_invalid",
      message: `${row.file} row ${row.row} field ${field} has unsupported channel ${value}.`,
      file: row.file,
      row: row.row,
    });
  }

  return null;
}

function readRequiredInterventionDeliveryStatus(
  row: ParsedJsonlRecord,
  field: string,
  errors: BehaviorLogImportIssue[],
): BehaviorLogInterventionDeliveryStatus | null {
  const value = readRequiredString(row, field, errors);

  if (value && isInterventionDeliveryStatus(value)) {
    return value;
  }

  if (value) {
    errors.push({
      severity: "error",
      code: "intervention_delivery_status_invalid",
      message: `${row.file} row ${row.row} field ${field} has unsupported delivery status ${value}.`,
      file: row.file,
      row: row.row,
    });
  }

  return null;
}

function readSource(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
  required: boolean,
): {
  captureMethod: BehaviorLogSourceCaptureMethod;
  confidence: BehaviorLogSourceConfidence;
  originalId: string | null;
} {
  const source = row.record.source;

  if (!isRecord(source)) {
    if (required) {
      errors.push({
        severity: "error",
        code: "source_invalid",
        message: `${row.file} row ${row.row} requires object field source.`,
        file: row.file,
        row: row.row,
      });
    }

    return {
      captureMethod: "unknown",
      confidence: "unknown",
      originalId: null,
    };
  }

  const captureMethod =
    typeof source.capture_method === "string" &&
    isSourceCaptureMethod(source.capture_method)
      ? source.capture_method
      : "unknown";
  const confidence =
    typeof source.confidence === "string" &&
    isSourceConfidence(source.confidence)
      ? source.confidence
      : "unknown";
  const originalId =
    typeof source.original_id === "string" && source.original_id.trim().length > 0
      ? source.original_id.trim()
      : null;

  return { captureMethod, confidence, originalId };
}

function readCadenceExtension(record: JsonRecord): JsonRecord | null {
  const extensions = record.extensions;

  if (!isRecord(extensions)) {
    return null;
  }

  const cadence = extensions[BEHAVIORLOG_EXTENSION_NAMESPACE];

  return isRecord(cadence) ? cadence : null;
}

function readExtensionString(
  extension: JsonRecord | null,
  field: string,
): string | null {
  const value = extension?.[field];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readExtensionBoolean(
  extension: JsonRecord | null,
  field: string,
): boolean | null {
  const value = extension?.[field];

  return typeof value === "boolean" ? value : null;
}

function readExtensionInteger(
  extension: JsonRecord | null,
  field: string,
): number | null {
  const value = extension?.[field];

  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readExtensionScheduleKind(
  extension: JsonRecord | null,
  field: string,
): BehaviorLogImportSchedulePlan["cadenceScheduleKind"] {
  const value = extension?.[field];

  return value === "exact" || value === "range" ? value : null;
}

function readExtensionSchedulePreset(
  extension: JsonRecord | null,
  field: string,
): BehaviorLogImportSchedulePlan["cadenceSchedulePreset"] {
  const value = extension?.[field];

  return isCadenceRangePreset(value) ? value : null;
}

function isSupportedRecurrence(recurrence: Record<string, unknown>): boolean {
  switch (recurrence.type) {
    case "daily":
      return isPositiveInteger(recurrence.interval);
    case "every_n_days":
      return isPositiveInteger(recurrence.interval);
    case "weekly_on_weekdays":
      return isWeekdayArray(recurrence.weekdays);
    case "every_n_weeks_on_weekdays":
      return (
        isPositiveInteger(recurrence.interval) &&
        isWeekdayArray(recurrence.weekdays)
      );
    case "monthly_on_day":
      return (
        isPositiveInteger(recurrence.interval) &&
        isPositiveInteger(recurrence.day) &&
        recurrence.day <= 31 &&
        (recurrence.fallback === undefined ||
          recurrence.fallback === "last_day_of_month")
      );
    default:
      return false;
  }
}

function isSupportedScheduleSlot(
  schedule: BehaviorLogImportSchedulePlan,
): boolean {
  if (schedule.windowStartLocal || schedule.windowEndLocal) {
    return (
      Boolean(schedule.windowStartLocal && schedule.windowEndLocal) &&
      cadencePresetForRange(
        schedule.windowStartLocal ?? "",
        schedule.windowEndLocal ?? "",
      ) !== null
    );
  }

  return schedule.localTime !== null;
}

function cadencePresetForRange(
  startTime: string,
  endTime: string,
): BehaviorLogImportSchedulePlan["cadenceSchedulePreset"] {
  return (
    CADENCE_RANGE_PRESETS.find(
      (preset) => preset.start === startTime && preset.end === endTime,
    )?.preset ?? null
  );
}

function isOccurrenceStatus(value: string): value is OccurrenceStatus {
  return (
    value === "unresolved" ||
    value === "completed" ||
    value === "not_completed"
  );
}

function isStatusSemantics(value: string): value is BehaviorLogStatusSemantics {
  return (
    value === "explicit_user_mark" ||
    value === "explicit_user_correction" ||
    value === "imported_explicit" ||
    value === "system_rule_declared" ||
    value === "ambiguous_import"
  );
}

function isInterventionChannel(
  value: string,
): value is BehaviorLogInterventionChannel {
  return value === "browser_push" || value === "email";
}

function isInterventionDeliveryStatus(
  value: string,
): value is BehaviorLogInterventionDeliveryStatus {
  return (
    value === "pending" ||
    value === "sent" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function isSourceCaptureMethod(
  value: string,
): value is BehaviorLogSourceCaptureMethod {
  return (
    value === "manual_tap" ||
    value === "manual_text" ||
    value === "system_generated" ||
    value === "imported" ||
    value === "inferred" ||
    value === "derived" ||
    value === "ai_generated" ||
    value === "unknown"
  );
}

function isSourceConfidence(value: string): value is BehaviorLogSourceConfidence {
  return (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "ambiguous" ||
    value === "unknown"
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isWeekdayArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isWeekday);
}

function isWeekday(value: unknown): boolean {
  return (
    value === "monday" ||
    value === "tuesday" ||
    value === "wednesday" ||
    value === "thursday" ||
    value === "friday" ||
    value === "saturday" ||
    value === "sunday"
  );
}

function isCadenceRangePreset(
  value: unknown,
): value is BehaviorLogImportSchedulePlan["cadenceSchedulePreset"] {
  return (
    value === "morning" ||
    value === "afternoon" ||
    value === "evening" ||
    value === "night"
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordIdForUnsupportedField(record: JsonRecord): string | null {
  for (const key of [
    "behavior_id",
    "schedule_id",
    "occurrence_id",
    "event_id",
    "note_id",
    "intervention_id",
  ]) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return null;
}

function groupBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const value of values) {
    const key = getKey(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }

  return grouped;
}

function compareStatusEventPlans(
  left: BehaviorLogImportStatusEventPlan,
  right: BehaviorLogImportStatusEventPlan,
): number {
  const recordedComparison = Temporal.Instant.compare(
    Temporal.Instant.from(left.recordedAtUtc),
    Temporal.Instant.from(right.recordedAtUtc),
  );

  if (recordedComparison !== 0) {
    return recordedComparison;
  }

  return left.externalId.localeCompare(right.externalId);
}

function behaviorIdentity(title: string, category: string | null): string {
  return `${normalizeIdentity(title)}|${normalizeIdentity(category ?? "")}`;
}

function occurrenceIdentity(input: {
  behaviorTitle: string;
  scheduledForUtc: string;
  localDate: string;
  timezone: string;
}): string {
  return [
    normalizeIdentity(input.behaviorTitle),
    input.scheduledForUtc,
    input.localDate,
    input.timezone,
  ].join("|");
}

function statusEventIdentity(
  occurrenceId: string,
  recordedAtUtc: string,
  status: OccurrenceStatus,
): string {
  return `${occurrenceId}|${recordedAtUtc}|${status}`;
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
