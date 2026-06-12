import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";

import type {
  BehaviorLogExistingRecords,
  BehaviorLogImportBehaviorPlan,
  BehaviorLogImportConflict,
  BehaviorLogImportDayGroup,
  BehaviorLogImportFile,
  BehaviorLogImportIssue,
  BehaviorLogImportNotePlan,
  BehaviorLogImportOccurrencePlan,
  BehaviorLogImportPlan,
  BehaviorLogImportPreview,
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
const TIMEZONE_VALIDATION_INSTANT = Temporal.Instant.from(
  "2000-01-01T00:00:00Z",
);

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
  };

  validateCrossReferences({ plan, errors, warnings });
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
  const archivedAtUtc = readOptionalInstant(row, "archived_at_utc", errors);
  const source = readSource(row, errors, false);

  if (!id || !title || !category) {
    return null;
  }

  return {
    action: "create",
    skipReasons: [],
    externalId: id,
    title,
    category,
    description: readOptionalString(row, "description", errors),
    archivedAtUtc,
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
    activeFromLocalDate,
    activeUntilLocalDate: readOptionalLocalDate(
      row,
      "active_until_local_date",
      errors,
    ),
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
    currentStatus,
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
    sourceConfidence: source.confidence,
  };
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

  for (const note of input.plan.notes) {
    if (
      note.attachedToType === "occurrence" &&
      occurrenceById.get(note.attachedToId)?.action === "skip"
    ) {
      skip(note, "parent_occurrence_skipped");
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

  return {
    schemaVersion: input.schemaVersion,
    fileCount: input.fileCount,
    behaviorCount: input.plan.behaviors.length,
    scheduleCount: input.plan.schedules.length,
    occurrenceCount: input.plan.occurrences.length,
    statusEventCount: input.plan.statusEvents.length,
    noteCount: input.plan.notes.length,
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

function readSource(
  row: ParsedJsonlRecord,
  errors: BehaviorLogImportIssue[],
  required: boolean,
): {
  captureMethod: BehaviorLogSourceCaptureMethod;
  confidence: BehaviorLogSourceConfidence;
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

  return { captureMethod, confidence };
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
