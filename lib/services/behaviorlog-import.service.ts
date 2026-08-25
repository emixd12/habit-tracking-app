import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";

import {
  resolveBehaviorLogImportMergePreview,
  resolveBehaviorLogImportPreview,
  type ResolveBehaviorLogImportMergePreviewInput,
  type ResolveBehaviorLogImportPreviewInput,
} from "@/lib/resolvers/behaviorlog-import.resolver";
import {
  getBehaviorLogImportRunById,
  listBehaviorLogImportRecordMappings,
} from "@/lib/db/behaviorLogImports.repo";
import { listImportedNotes } from "@/lib/db/notes.repo";
import { listImportedInterventions } from "@/lib/db/importedInterventions.repo";
import {
  listUserBehaviors,
  type AppSupabaseClient,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { listUserOccurrences } from "@/lib/db/occurrences.repo";
import { listOccurrenceStatusEventsByOccurrenceIds } from "@/lib/db/occurrenceStatusEvents.repo";
import {
  applyApprovedBehaviorLogMergePlan,
  applyCreateMissingBehaviorLogImportPlan,
  createBehaviorLogImportRunFromPreview,
} from "@/lib/services/behaviorlog-import-write.service";
import { readCachedBehaviorLogImportRuns } from "@/lib/cache/stable-user-data.cache";
import { normalizeRecurrenceRule } from "@/lib/services/behavior-form";
import {
  DEFAULT_ZIP_READ_LIMITS,
  readZipEntries,
} from "@/lib/services/zip";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type {
  BehaviorLogExistingRecords,
  BehaviorLogExistingSchedule,
  BehaviorLogImportRecordType,
  BehaviorLogImportFile,
  BehaviorLogImportMergePreviewResult,
  BehaviorLogImportPreview,
  BehaviorLogSourceCaptureMethod,
  BehaviorLogSourceConfidence,
  BehaviorLogStatusSemantics,
} from "@/lib/types/behaviorlog-import";
import type {
  BehaviorLogImportActionState,
  BehaviorLogImportApplyMode,
  BehaviorLogImportCapabilities,
  BehaviorLogImportPageData,
} from "@/lib/types/behaviorlog-import-ui";
import { BEHAVIORLOG_BUNDLE_SIZE_ERROR } from "@/lib/types/behaviorlog-bundle-ui";
import {
  BEHAVIORLOG_IMPORT_INITIAL_STATE,
  isBehaviorLogApplyMode,
  toImportRunView,
} from "@/lib/types/behaviorlog-import-ui";
import type {
  BehaviorLogImportRun,
  Occurrence,
  OccurrenceStatus,
  OccurrenceStatusEvent,
  ImportedNote,
  ImportedIntervention,
} from "@/lib/types/database";
import { DEFAULT_TIMEZONE, type RecurrenceRule } from "@/lib/types/recurrence";

export type BehaviorLogZipInput = Buffer | Uint8Array | ArrayBuffer;

const MAX_BEHAVIORLOG_UPLOAD_BYTES = DEFAULT_ZIP_READ_LIMITS.maxArchiveBytes;
const BEHAVIORLOG_RECURRENCE_PROFILE = "behaviorlog.calendar_simple.v1";

type BehaviorLogUploadBundle = {
  fileName: string;
  fileSize: number;
  zip: Buffer;
  files: BehaviorLogImportFile[];
  archiveFingerprint: string;
};

export class BehaviorLogImportAuthError extends Error {
  constructor(message = "Sign in again before importing data.") {
    super(message);
    this.name = "BehaviorLogImportAuthError";
  }
}

export class BehaviorLogImportUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BehaviorLogImportUserError";
  }
}

export function parseBehaviorLogZipFiles(
  zip: BehaviorLogZipInput,
): BehaviorLogImportFile[] {
  return readZipEntries(zip).map((entry) => {
    assertSafeZipPath(entry.path);

    return {
      path: entry.path,
      mediaType: inferMediaType(entry.path),
      content: entry.content,
    };
  });
}

export function previewBehaviorLogImportFromZip(input: {
  zip: BehaviorLogZipInput;
  existing?: BehaviorLogExistingRecords;
  supportedSchemaVersions?: readonly string[];
}): BehaviorLogImportPreview {
  return resolveBehaviorLogImportPreview({
    files: parseBehaviorLogZipFiles(input.zip),
    existing: input.existing,
    supportedSchemaVersions: input.supportedSchemaVersions,
  });
}

export function previewBehaviorLogMergeImportFromZip(input: {
  zip: BehaviorLogZipInput;
  existing?: BehaviorLogExistingRecords;
  supportedSchemaVersions?: readonly string[];
}): BehaviorLogImportMergePreviewResult {
  return resolveBehaviorLogImportMergePreview({
    files: parseBehaviorLogZipFiles(input.zip),
    existing: input.existing,
    supportedSchemaVersions: input.supportedSchemaVersions,
  });
}

export function previewBehaviorLogImportFromFiles(
  input: ResolveBehaviorLogImportPreviewInput,
): BehaviorLogImportPreview {
  return resolveBehaviorLogImportPreview(input);
}

export function previewBehaviorLogMergeImportFromFiles(
  input: ResolveBehaviorLogImportMergePreviewInput,
): BehaviorLogImportMergePreviewResult {
  return resolveBehaviorLogImportMergePreview(input);
}

export async function getBehaviorLogImportPageData(): Promise<BehaviorLogImportPageData> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const recentRuns = await readCachedBehaviorLogImportRuns(supabase, userId, 8);

  return createBehaviorLogImportPageDataFromRuns(recentRuns);
}

export async function listCurrentUserBehaviorLogImportRuns(
  limit: number,
): Promise<BehaviorLogImportRun[]> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  return readCachedBehaviorLogImportRuns(supabase, userId, limit);
}

export function createBehaviorLogImportPageDataFromRuns(
  recentRuns: BehaviorLogImportRun[],
): BehaviorLogImportPageData {
  return {
    recentRuns: recentRuns
      .filter(
        (run) =>
          run.import_mode !== "restore_preview" &&
          run.import_mode !== "restore_apply",
      )
      .map(toImportRunView),
  };
}

export async function previewBehaviorLogImportUploadFromFormData(
  formData: FormData,
): Promise<BehaviorLogImportActionState> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const bundle = await readUploadBundle(formData);
  const existing = await listBehaviorLogExistingRecords(supabase, userId);
  const preview = previewBehaviorLogMergeImportFromFiles({
    files: bundle.files,
    existing,
  });
  const importRun = await createBehaviorLogImportRunFromPreview(supabase, {
    userId,
    files: bundle.files,
    preview,
    archiveFingerprint: bundle.archiveFingerprint,
    importMode: "merge_preview",
  });

  return {
    status: "previewed",
    message: preview.valid
      ? "BehaviorLog preview ready."
      : "BehaviorLog preview found validation errors.",
    upload: {
      fileName: bundle.fileName,
      fileSize: bundle.fileSize,
    },
    archiveFingerprint: bundle.archiveFingerprint,
    preview,
    previewRun: toImportRunView(importRun),
    capabilities: resolveBehaviorLogImportCapabilities(preview),
    applyResult: null,
  };
}

export async function applyBehaviorLogImportUploadFromFormData(
  formData: FormData,
): Promise<BehaviorLogImportActionState> {
  const modeValue = formData.get("import_mode");

  if (!isBehaviorLogApplyMode(modeValue)) {
    throw new BehaviorLogImportUserError("Choose an import mode before applying.");
  }

  if (formData.get("confirm_apply") !== "yes") {
    throw new BehaviorLogImportUserError(
      "Confirm that you want to apply this import before writing records.",
    );
  }

  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const bundle = readBundlePayload(formData);
  const previewRunId = readRequiredString(
    formData,
    "import_preview_run_id",
    "Preview the .behaviorlog.zip bundle again before applying.",
  );
  const acceptedPreviewFingerprint = readRequiredString(
    formData,
    "preview_fingerprint",
    "Preview the .behaviorlog.zip bundle again before applying.",
  );
  const acceptedLocalDataFingerprint = readRequiredString(
    formData,
    "local_data_fingerprint",
    "Preview the .behaviorlog.zip bundle again before applying.",
  );
  const acceptedBundleFingerprint = readRequiredString(
    formData,
    "bundle_fingerprint",
    "Preview the .behaviorlog.zip bundle again before applying.",
  );
  const acceptedArchiveFingerprint = readRequiredString(
    formData,
    "archive_fingerprint",
    "Preview the .behaviorlog.zip bundle again before applying.",
  );
  const previewRun = await getBehaviorLogImportRunById(
    supabase,
    userId,
    previewRunId,
  );

  const acceptedPreview = {
    run: previewRun,
    bundleFingerprint: acceptedBundleFingerprint,
    archiveFingerprint: acceptedArchiveFingerprint,
    localDataFingerprint: acceptedLocalDataFingerprint,
    previewFingerprint: acceptedPreviewFingerprint,
  };

  assertAcceptedImportPreviewRun(acceptedPreview);
  assertArchiveMatchesAcceptedImportPreview(
    bundle.archiveFingerprint,
    acceptedArchiveFingerprint,
  );

  const existing = await listBehaviorLogExistingRecords(supabase, userId);
  const preview = previewBehaviorLogMergeImportFromFiles({
    files: bundle.files,
    existing,
  });

  assertFreshAcceptedImportPreview({
    preview,
    bundleFingerprint: acceptedBundleFingerprint,
    localDataFingerprint: acceptedLocalDataFingerprint,
    previewFingerprint: acceptedPreviewFingerprint,
  });
  const capabilities = resolveBehaviorLogImportCapabilities(preview);

  assertImportModeCanApply(modeValue, capabilities);
  assertSensitiveNotesCanApply(formData, preview);

  const importRun = await createBehaviorLogImportRunFromPreview(supabase, {
    userId,
    files: bundle.files,
    preview,
    importMode: modeValue,
    acceptedPreviewRunId: acceptedPreview.run.id,
    acceptedPreviewFingerprint,
  });
  if (modeValue === "create_missing_only") {
    const result = await applyCreateMissingBehaviorLogImportPlan(supabase, {
      userId,
      importRunId: importRun.id,
      preview,
    });

    return {
      status: "applied",
      message: "Create-only import applied.",
      upload: {
        fileName: bundle.fileName,
        fileSize: bundle.fileSize,
      },
      archiveFingerprint: null,
      preview,
      previewRun: toImportRunView(importRun),
      capabilities,
      applyResult: {
        mode: modeValue,
        importRun: toImportRunView(result.importRun),
        created: result.created,
        skipped: result.skipped,
      },
    };
  }

  const result = await applyApprovedBehaviorLogMergePlan(supabase, {
    userId,
    importRunId: importRun.id,
    preview,
  });

  return {
    status: "applied",
    message: "Approved merge import applied.",
    upload: {
      fileName: bundle.fileName,
      fileSize: bundle.fileSize,
    },
    archiveFingerprint: null,
    preview,
    previewRun: toImportRunView(importRun),
    capabilities,
    applyResult: {
      mode: modeValue,
      importRun: toImportRunView(result.importRun),
      created: result.created,
      mapped: result.mapped,
      skipped: result.skipped,
    },
  };
}

export function behaviorLogImportErrorToActionState(
  error: unknown,
  previousState: BehaviorLogImportActionState = BEHAVIORLOG_IMPORT_INITIAL_STATE,
): BehaviorLogImportActionState {
  return {
    ...previousState,
    status: "error",
    message: errorMessage(error),
    applyResult: null,
  };
}

export function resolveBehaviorLogImportCapabilities(
  preview: BehaviorLogImportMergePreviewResult,
): BehaviorLogImportCapabilities {
  if (!preview.valid || preview.errors.length > 0) {
    return {
      canApplyCreateOnly: false,
      createOnlyReason: "Fix validation errors before applying.",
      canApplyMerge: false,
      mergeReason: "Fix validation errors before applying.",
    };
  }

  if (preview.mergePreview.conflictCount > 0) {
    return {
      canApplyCreateOnly: false,
      createOnlyReason: "Resolve merge conflicts before using create-only import.",
      canApplyMerge: false,
      mergeReason: "Resolve merge conflicts before applying a merge plan.",
    };
  }

  const createOnlyHasWork =
    preview.summary.createCount > 0 ||
    preview.summary.interventionStoredCount > 0;
  const mergeActionCount = Object.values(preview.mergePreview.actionCounts).reduce(
    (total, count) => total + count,
    0,
  );

  return {
    canApplyCreateOnly: createOnlyHasWork,
    createOnlyReason: createOnlyHasWork
      ? null
      : "No new create-only records are available.",
    canApplyMerge: mergeActionCount > 0,
    mergeReason:
      mergeActionCount > 0 ? null : "No supported merge actions are available.",
  };
}

function assertSafeZipPath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error(`Unsafe ZIP entry path: ${path || "(empty)"}.`);
  }
}

function inferMediaType(path: string): string {
  if (path.endsWith(".json")) {
    return "application/json";
  }

  if (path.endsWith(".jsonl")) {
    return "application/jsonl";
  }

  if (path.endsWith(".md")) {
    return "text/markdown";
  }

  return "application/octet-stream";
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  void supabase;

  try {
    return await requireCurrentUserId("Sign in again before importing data.");
  } catch {
    throw new BehaviorLogImportAuthError();
  }
}

async function readUploadBundle(
  formData: FormData,
): Promise<BehaviorLogUploadBundle> {
  const value = formData.get("behaviorlog_file");

  if (!isUploadFile(value)) {
    throw new BehaviorLogImportUserError("Choose a .behaviorlog.zip file.");
  }

  const fileName = value.name.trim();

  if (!fileName.endsWith(".behaviorlog.zip")) {
    throw new BehaviorLogImportUserError(
      "Unsupported file. Upload a .behaviorlog.zip bundle.",
    );
  }

  if (value.size === 0) {
    throw new BehaviorLogImportUserError("The uploaded bundle is empty.");
  }

  if (value.size > MAX_BEHAVIORLOG_UPLOAD_BYTES) {
    throw new BehaviorLogImportUserError(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
  }

  const zip = Buffer.from(await value.arrayBuffer());

  return createUploadBundle({
    fileName,
    fileSize: value.size,
    zip,
  });
}

function readBundlePayload(formData: FormData): BehaviorLogUploadBundle {
  const payload = formData.get("bundle_payload");
  const fileNameValue = formData.get("upload_file_name");
  const fileSizeValue = formData.get("upload_file_size");

  if (typeof payload !== "string" || payload.length === 0) {
    throw new BehaviorLogImportUserError(
      "Preview the .behaviorlog.zip bundle again before applying.",
    );
  }

  const zip = Buffer.from(payload, "base64");

  if (zip.byteLength === 0) {
    throw new BehaviorLogImportUserError("The uploaded bundle is empty.");
  }

  if (zip.byteLength > MAX_BEHAVIORLOG_UPLOAD_BYTES) {
    throw new BehaviorLogImportUserError(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
  }

  return createUploadBundle({
    fileName:
      typeof fileNameValue === "string" && fileNameValue.trim()
        ? fileNameValue.trim()
        : "uploaded.behaviorlog.zip",
    fileSize:
      typeof fileSizeValue === "string" && Number.isFinite(Number(fileSizeValue))
        ? Number(fileSizeValue)
        : zip.byteLength,
    zip,
  });
}

function assertAcceptedImportPreviewRun(input: {
  run: BehaviorLogImportRun | null;
  bundleFingerprint: string;
  archiveFingerprint: string;
  localDataFingerprint: string;
  previewFingerprint: string;
}): asserts input is { run: BehaviorLogImportRun } & typeof input {
  if (
    !input.run ||
    input.run.import_mode !== "merge_preview" ||
    input.run.status !== "previewed"
  ) {
    throw new BehaviorLogImportUserError(
      "Preview the .behaviorlog.zip bundle again before applying.",
    );
  }

  const summary = readObject(input.run.dry_run_summary);

  if (
    summary?.valid !== true ||
    input.run.bundle_fingerprint !== input.bundleFingerprint ||
    readString(summary?.bundleFingerprint) !== input.bundleFingerprint ||
    readString(summary?.archiveFingerprint) !== input.archiveFingerprint ||
    readString(summary?.localDataFingerprint) !== input.localDataFingerprint ||
    readString(summary?.previewFingerprint) !== input.previewFingerprint
  ) {
    throw new BehaviorLogImportUserError(
      "Import preview no longer matches the accepted preview run.",
    );
  }
}

function assertArchiveMatchesAcceptedImportPreview(
  archiveFingerprint: string,
  acceptedArchiveFingerprint: string,
): void {
  if (archiveFingerprint === acceptedArchiveFingerprint) {
    return;
  }

  throw new BehaviorLogImportUserError(
    "The uploaded bundle no longer matches the accepted import preview. Preview the import again.",
  );
}

function assertFreshAcceptedImportPreview(input: {
  preview: BehaviorLogImportMergePreviewResult;
  bundleFingerprint: string;
  localDataFingerprint: string;
  previewFingerprint: string;
}): void {
  if (input.preview.bundleFingerprint !== input.bundleFingerprint) {
    throw new BehaviorLogImportUserError(
      "Uploaded bundle changed since this import preview. Preview it again before applying.",
    );
  }

  if (input.preview.localDataFingerprint !== input.localDataFingerprint) {
    throw new BehaviorLogImportUserError(
      "Local data changed since this import preview. Preview it again before applying.",
    );
  }

  if (input.preview.previewFingerprint !== input.previewFingerprint) {
    throw new BehaviorLogImportUserError(
      "Import preview is stale. Preview it again before applying.",
    );
  }
}

function readRequiredString(
  formData: FormData,
  field: string,
  message: string,
): string {
  const value = formData.get(field);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BehaviorLogImportUserError(message);
  }

  return value.trim();
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function createUploadBundle(input: {
  fileName: string;
  fileSize: number;
  zip: Buffer;
}): BehaviorLogUploadBundle {
  try {
    return {
      ...input,
      files: parseBehaviorLogZipFiles(input.zip),
      archiveFingerprint: createHash("sha256").update(input.zip).digest("hex"),
    };
  } catch (error) {
    throw new BehaviorLogImportUserError(
      `Unable to read BehaviorLog bundle: ${errorMessage(error)}`,
    );
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function assertImportModeCanApply(
  mode: BehaviorLogImportApplyMode,
  capabilities: BehaviorLogImportCapabilities,
): void {
  if (mode === "create_missing_only" && !capabilities.canApplyCreateOnly) {
    throw new BehaviorLogImportUserError(
      capabilities.createOnlyReason ?? "Create-only import is unavailable.",
    );
  }

  if (
    mode === "merge_by_user_approved_plan" &&
    !capabilities.canApplyMerge
  ) {
    throw new BehaviorLogImportUserError(
      capabilities.mergeReason ?? "Merge import is unavailable.",
    );
  }
}

function assertSensitiveNotesCanApply(
  formData: FormData,
  preview: BehaviorLogImportMergePreviewResult,
): void {
  if (!previewRequiresSensitiveNoteConfirmation(preview)) {
    return;
  }

  if (formData.get("confirm_sensitive_notes") === "yes") {
    return;
  }

  throw new BehaviorLogImportUserError(
    "Review and acknowledge high or restricted note sensitivity before importing notes.",
  );
}

export function previewRequiresSensitiveNoteConfirmation(
  preview: BehaviorLogImportMergePreviewResult,
): boolean {
  return preview.plan.notes.some(
    (note) =>
      note.action !== "skip" &&
      note.noteRole !== "ai_generated" &&
      (note.sensitivity === "high" || note.sensitivity === "restricted"),
  );
}

export async function listBehaviorLogExistingRecords(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<BehaviorLogExistingRecords> {
  const [
    behaviors,
    occurrences,
    mappings,
    importedNotes,
    importedInterventions,
  ] = await Promise.all([
    listUserBehaviors(supabase, userId),
    listUserOccurrences(supabase, userId),
    listBehaviorLogImportRecordMappings(supabase, userId),
    listImportedNotes(supabase, userId),
    listImportedInterventions(supabase, userId),
  ]);
  const statusEvents = await listOccurrenceStatusEventsByOccurrenceIds(
    supabase,
    userId,
    occurrences.map((occurrence) => occurrence.id),
  );
  const behaviorById = new Map(
    behaviors.map((behavior) => [behavior.id, behavior]),
  );

  return {
    behaviors: behaviors.map(toExistingBehavior),
    schedules: behaviors.flatMap(toExistingSchedules),
    occurrences: occurrences.map((occurrence) =>
      toExistingOccurrence(occurrence, behaviorById.get(occurrence.behavior_id)),
    ),
    statusEvents: statusEvents.map(toExistingStatusEvent),
    importedNotes: importedNotes.map(toExistingImportedNote),
    importedInterventions: importedInterventions.map(
      toExistingImportedIntervention,
    ),
    mappings: mappings.map((mapping) => ({
      recordType: normalizeRecordType(mapping.record_type),
      externalId: mapping.external_id,
      localId: mapping.local_id,
    })),
  };
}

function toExistingBehavior(behavior: BehaviorWithCategory) {
  return {
    id: behavior.id,
    rowUpdatedAtUtc: behavior.updated_at,
    title: behavior.title,
    description: behavior.description,
    category: toBehaviorLogCategory(behavior.category?.name ?? null),
    cadenceCategoryName: behavior.category?.name ?? null,
    active: behavior.active,
    archivedAt: behavior.archived_at,
    sourceOriginalId: behavior.id,
    schedules: toExistingSchedules(behavior),
    configurationSnapshot: toExistingBehaviorConfiguration(behavior),
  };
}

function toExistingBehaviorConfiguration(behavior: BehaviorWithCategory) {
  const parentSchedules = behavior.schedules ?? [];
  const scheduleGraph =
    parentSchedules.length > 0
      ? parentSchedules.map((schedule) => ({
          id: schedule.id,
          recurrenceRule: schedule.recurrence_rule,
          sortOrder: schedule.sort_order,
          timeEntries: schedule.schedule_slots.map((slot) => ({
            id: slot.id,
            kind: slot.kind,
            preset: slot.preset,
            startTime: slot.start_time,
            endTime: slot.end_time,
            sortOrder: slot.sort_order,
          })),
        }))
      : [
          {
            recurrenceRule: behavior.recurrence_rule,
            sortOrder: 0,
            timeEntries: behavior.schedule_slots.map((slot) => ({
              id: slot.id,
              kind: slot.kind,
              preset: slot.preset,
              startTime: slot.start_time,
              endTime: slot.end_time,
              sortOrder: slot.sort_order,
            })),
          },
        ];

  return {
    categoryId: behavior.category_id,
    scheduleGraph,
    browserReminderEnabled: behavior.browser_reminder_enabled,
    emailReminderEnabled: behavior.email_reminder_enabled,
    reminderOffsetMinutes: behavior.reminder_offset_minutes,
    active: behavior.active,
    timezone: behavior.timezone,
  };
}

function toExistingSchedules(
  behavior: BehaviorWithCategory,
): BehaviorLogExistingSchedule[] {
  const timezone = behavior.timezone || DEFAULT_TIMEZONE;

  return behavior.schedule_slots.map((slot) => ({
    id: slot.id,
    rowUpdatedAtUtc: slot.updated_at,
    behaviorId: behavior.id,
    recurrenceProfile: BEHAVIORLOG_RECURRENCE_PROFILE,
    recurrence: toBehaviorLogRecurrence(
      normalizeRecurrenceRule(behavior.recurrence_rule),
    ),
    timezone,
    localTime: normalizeTime(slot.start_time),
    windowStartLocal:
      slot.kind === "range" ? normalizeTime(slot.start_time) : null,
    windowEndLocal:
      slot.kind === "range" && slot.end_time
        ? normalizeTime(slot.end_time)
        : null,
    cadenceScheduleKind: slot.kind === "range" ? "range" : "exact",
    cadenceSchedulePreset: normalizeSchedulePreset(slot.preset),
    activeFromLocalDate: instantToLocalDate(behavior.created_at, timezone),
    activeUntilLocalDate: behavior.archived_at
      ? instantToLocalDate(behavior.archived_at, timezone)
      : null,
    sourceOriginalId: slot.id,
  }));
}

function toExistingOccurrence(
  occurrence: Occurrence,
  behavior: BehaviorWithCategory | undefined,
) {
  return {
    id: occurrence.id,
    rowUpdatedAtUtc: occurrence.updated_at,
    behaviorId: occurrence.behavior_id,
    scheduleId: occurrence.behavior_schedule_slot_id,
    behaviorTitle: behavior?.title ?? null,
    scheduledForUtc: occurrence.scheduled_for,
    localDate: occurrence.local_date,
    timezone: behavior?.timezone ?? DEFAULT_TIMEZONE,
    status: normalizeOccurrenceStatus(occurrence.status),
    note: occurrence.note,
    sourceOriginalId: occurrence.id,
  };
}

function toExistingStatusEvent(event: OccurrenceStatusEvent) {
  return {
    id: event.id,
    rowUpdatedAtUtc: event.updated_at,
    occurrenceId: event.occurrence_id,
    behaviorId: event.behavior_id,
    recordedAtUtc: event.recorded_at,
    status: normalizeOccurrenceStatus(event.status),
    statusSemantics: normalizeStatusSemantics(event.status_semantics),
    sourceCaptureMethod: normalizeSourceCaptureMethod(
      event.source_capture_method,
    ),
    sourceConfidence: normalizeSourceConfidence(event.source_confidence),
    revisesEventId: event.revises_event_id,
    sourceOriginalId: event.id,
  };
}

function toExistingImportedNote(note: ImportedNote) {
  return {
    id: note.id,
    rowUpdatedAtUtc: note.updated_at,
    importRunId: note.import_run_id,
    externalId: note.external_id,
    targetType: normalizeImportedNoteTargetType(note.target_type),
    targetExternalId: note.target_external_id,
    targetLocalId: note.target_local_id,
    bodyMarkdown: note.body_markdown,
    noteRole: normalizeImportedNoteRole(note.note_role),
    sensitivity: normalizeImportedNoteSensitivity(note.sensitivity),
    sourceOriginalId: note.source_original_id,
    sourceCaptureMethod: normalizeSourceCaptureMethod(
      note.source_capture_method,
    ),
    sourceConfidence: normalizeSourceConfidence(note.source_confidence),
    createdAtUtc: note.imported_created_at,
    updatedAtUtc: note.imported_updated_at,
  };
}

function toExistingImportedIntervention(intervention: ImportedIntervention) {
  return {
    id: intervention.id,
    rowUpdatedAtUtc: intervention.updated_at,
    importRunId: intervention.import_run_id,
    externalId: intervention.external_id,
    behaviorExternalId: intervention.behavior_external_id,
    occurrenceExternalId: intervention.occurrence_external_id,
    behaviorId: intervention.behavior_id,
    occurrenceId: intervention.occurrence_id,
    interventionType: intervention.intervention_type,
    channel: normalizeInterventionChannel(intervention.channel),
    deliveryStatus: normalizeInterventionDeliveryStatus(
      intervention.delivery_status,
    ),
    scheduledSendAtUtc: intervention.scheduled_send_at,
    sentAtUtc: intervention.sent_at,
    failureReason: intervention.failure_reason,
    sourceOriginalId: intervention.source_original_id,
    sourceCaptureMethod: normalizeSourceCaptureMethod(
      intervention.source_capture_method,
    ),
    sourceConfidence: normalizeSourceConfidence(intervention.source_confidence),
  };
}

function toBehaviorLogRecurrence(rule: RecurrenceRule): Record<string, unknown> {
  switch (rule.frequency) {
    case "daily":
      return rule.interval === 1
        ? { type: "daily", interval: 1 }
        : { type: "every_n_days", interval: rule.interval };
    case "interval_days":
      return { type: "every_n_days", interval: rule.intervalDays };
    case "weekly":
      return rule.interval === 1
        ? { type: "weekly_on_weekdays", weekdays: rule.daysOfWeek }
        : {
            type: "every_n_weeks_on_weekdays",
            interval: rule.interval,
            weekdays: rule.daysOfWeek,
          };
    case "monthly":
      return {
        type: "monthly_on_day",
        interval: rule.interval,
        day: rule.dayOfMonth,
        fallback: "last_day_of_month",
      };
  }
}

function toBehaviorLogCategory(category: string | null): string {
  switch (category) {
    case "Grooming":
      return "hygiene";
    case "Fitness":
      return "fitness";
    case "Food / Drink":
      return "nutrition";
    case "Home":
      return "chores";
    case "Admin":
      return "admin";
    case "Medical":
    case "Measurements":
      return "health_wellness";
    case "Other":
      return "other";
    case null:
      return "uncategorized";
    default:
      return category.trim().length > 0 ? category : "uncategorized";
  }
}

function instantToLocalDate(instant: string, timezone: string): string {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timezone || DEFAULT_TIMEZONE)
    .toPlainDate()
    .toString();
}

function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

function normalizeSchedulePreset(
  value: string | null,
): "morning" | "afternoon" | "evening" | "night" | null {
  if (
    value === "morning" ||
    value === "afternoon" ||
    value === "evening" ||
    value === "night"
  ) {
    return value;
  }

  return null;
}

function normalizeRecordType(value: string): BehaviorLogImportRecordType {
  if (
    value === "behavior" ||
    value === "schedule" ||
    value === "occurrence" ||
    value === "status_event" ||
    value === "note" ||
    value === "intervention"
  ) {
    return value;
  }

  throw new Error(`Unsupported BehaviorLog import mapping record type: ${value}.`);
}

function normalizeOccurrenceStatus(value: string): OccurrenceStatus {
  if (
    value === "unresolved" ||
    value === "completed" ||
    value === "not_completed"
  ) {
    return value;
  }

  return "unresolved";
}

function normalizeStatusSemantics(value: string): BehaviorLogStatusSemantics {
  if (
    value === "explicit_user_mark" ||
    value === "explicit_user_correction" ||
    value === "imported_explicit" ||
    value === "system_rule_declared" ||
    value === "ambiguous_import"
  ) {
    return value;
  }

  return "ambiguous_import";
}

function normalizeImportedNoteTargetType(
  value: string,
): "behavior" | "occurrence" | "status_event" | "review" {
  if (
    value === "behavior" ||
    value === "occurrence" ||
    value === "status_event" ||
    value === "review"
  ) {
    return value;
  }

  return "review";
}

function normalizeImportedNoteRole(
  value: string,
): "user" | "imported" | "system" | "ai_generated" {
  if (
    value === "user" ||
    value === "imported" ||
    value === "system" ||
    value === "ai_generated"
  ) {
    return value;
  }

  return "imported";
}

function normalizeImportedNoteSensitivity(
  value: string | null,
): "low" | "medium" | "high" | "restricted" | null {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "restricted"
  ) {
    return value;
  }

  return null;
}

function normalizeInterventionChannel(value: string): "browser_push" | "email" {
  return value === "email" ? "email" : "browser_push";
}

function normalizeInterventionDeliveryStatus(
  value: string,
): "pending" | "sent" | "failed" | "cancelled" {
  if (
    value === "pending" ||
    value === "sent" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "pending";
}

function normalizeSourceCaptureMethod(
  value: string,
): BehaviorLogSourceCaptureMethod {
  if (
    value === "manual_tap" ||
    value === "manual_text" ||
    value === "system_generated" ||
    value === "imported" ||
    value === "inferred" ||
    value === "derived" ||
    value === "ai_generated" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function normalizeSourceConfidence(value: string): BehaviorLogSourceConfidence {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "ambiguous" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "BehaviorLog import could not be completed.";
}
