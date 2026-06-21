import { createHash } from "node:crypto";

import {
  createBehaviorLogImportRun,
  getBehaviorLogImportRunById,
  listBehaviorLogImportRuns,
  updateBehaviorLogImportRunStatus,
} from "@/lib/db/behaviorLogImports.repo";
import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { resolveBehaviorLogImportPreview } from "@/lib/resolvers/behaviorlog-import.resolver";
import { resolveBehaviorLogRestorePreview } from "@/lib/resolvers/behaviorlog-restore.resolver";
import {
  listBehaviorLogExistingRecords,
  parseBehaviorLogZipFiles,
  type BehaviorLogZipInput,
} from "@/lib/services/behaviorlog-import.service";
import type {
  BehaviorLogExistingRecords,
  BehaviorLogImportFile,
  BehaviorLogImportNotePlan,
  BehaviorLogImportPreview,
  BehaviorLogImportRunCreateInput,
  BehaviorLogImportSchedulePlan,
} from "@/lib/types/behaviorlog-import";
import type { BehaviorLogImportRun } from "@/lib/types/database";
import { DEFAULT_TIMEZONE, type Weekday } from "@/lib/types/recurrence";
import { createClient } from "@/lib/supabase/server";
import type {
  BehaviorLogRestoreAction,
  BehaviorLogRestorePreview,
  BehaviorLogRestoreStatusHistoryPolicy,
} from "@/lib/types/behaviorlog-restore";
import type {
  BehaviorLogRestoreActionState,
  BehaviorLogRestorePageData,
  BehaviorLogRestoreRunView,
} from "@/lib/types/behaviorlog-restore-ui";
import { BEHAVIORLOG_RESTORE_INITIAL_STATE } from "@/lib/types/behaviorlog-restore-ui";

const BEHAVIORLOG_FORMAT = "behaviorlog.bundle";
const MAX_BEHAVIORLOG_UPLOAD_BYTES = 20 * 1024 * 1024;
const RESTORE_CONFIRMATION_TEXT = "RESTORE";

type BehaviorLogRestoreUploadBundle = {
  fileName: string;
  fileSize: number;
  zip: Buffer;
  files: BehaviorLogImportFile[];
  bundlePayload: string;
};

type RestoreRpcClient = {
  rpc: (
    fn: "apply_behaviorlog_restore",
    args: { restore_payload: RestorePayload },
  ) => Promise<{ data: unknown; error: Error | null }>;
};

type RestorePayload = {
  archive_behavior_ids: string[];
  delete_schedule_ids: string[];
  delete_occurrence_ids: string[];
  delete_status_event_ids: string[];
  clear_occurrence_note_ids: string[];
  delete_imported_note_ids: string[];
  delete_imported_intervention_ids: string[];
  behaviors: Array<Record<string, unknown>>;
  schedules: Array<Record<string, unknown>>;
  occurrences: Array<Record<string, unknown>>;
  status_events: Array<Record<string, unknown>>;
  imported_notes: Array<Record<string, unknown>>;
  imported_interventions: Array<Record<string, unknown>>;
};

export class BehaviorLogRestoreAuthError extends Error {
  constructor(message = "Sign in again before restoring data.") {
    super(message);
    this.name = "BehaviorLogRestoreAuthError";
  }
}

export class BehaviorLogRestoreUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BehaviorLogRestoreUserError";
  }
}

export function previewBehaviorLogRestoreFromZip(input: {
  zip: BehaviorLogZipInput;
  existing?: BehaviorLogExistingRecords;
  statusHistoryPolicy?: BehaviorLogRestoreStatusHistoryPolicy;
}): BehaviorLogRestorePreview {
  return previewBehaviorLogRestoreFromFiles({
    files: parseBehaviorLogZipFiles(input.zip),
    existing: input.existing,
    statusHistoryPolicy: input.statusHistoryPolicy,
  });
}

export function previewBehaviorLogRestoreFromFiles(input: {
  files: BehaviorLogImportFile[];
  existing?: BehaviorLogExistingRecords;
  statusHistoryPolicy?: BehaviorLogRestoreStatusHistoryPolicy;
}): BehaviorLogRestorePreview {
  const importPreview = resolveBehaviorLogImportPreview({
    files: input.files,
    existing: input.existing,
  });

  return resolveBehaviorLogRestorePreview({
    importPreview,
    existing: input.existing,
    statusHistoryPolicy: input.statusHistoryPolicy,
  });
}

export async function previewCurrentUserBehaviorLogRestoreFromFiles(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    files: BehaviorLogImportFile[];
    statusHistoryPolicy?: BehaviorLogRestoreStatusHistoryPolicy;
  },
): Promise<BehaviorLogRestorePreview> {
  const existing = await listBehaviorLogExistingRecords(supabase, input.userId);

  return previewBehaviorLogRestoreFromFiles({
    files: input.files,
    existing,
    statusHistoryPolicy: input.statusHistoryPolicy,
  });
}

export async function createBehaviorLogRestorePreviewRun(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    files: BehaviorLogImportFile[];
    statusHistoryPolicy?: BehaviorLogRestoreStatusHistoryPolicy;
  },
): Promise<{
  preview: BehaviorLogRestorePreview;
  importRun: BehaviorLogImportRun;
}> {
  const preview = await previewCurrentUserBehaviorLogRestoreFromFiles(supabase, {
    userId: input.userId,
    files: input.files,
    statusHistoryPolicy: input.statusHistoryPolicy,
  });
  const manifest = readManifestMetadata(input.files);
  const importRun = await createBehaviorLogImportRun(supabase, {
    userId: input.userId,
    bundleFormat: manifest.bundleFormat ?? BEHAVIORLOG_FORMAT,
    schemaVersion: manifest.schemaVersion ?? null,
    manifestSha256: manifest.manifestSha256,
    bundleFingerprint: preview.bundleFingerprint,
    producerName: manifest.producerName,
    producerVersion: manifest.producerVersion,
    subjectIdStrategy: manifest.subjectIdStrategy,
    privacyRedactionLevel: manifest.privacyRedactionLevel,
    importMode: "restore_preview",
    dryRunSummary: toRestorePreviewSnapshot(preview),
    status: "previewed",
    failureMessage: null,
    completedAt: null,
  });

  return { preview, importRun };
}

export async function getBehaviorLogRestorePageData(): Promise<BehaviorLogRestorePageData> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const recentRuns = await listBehaviorLogImportRuns(supabase, userId, 12);

  return {
    recentRuns: recentRuns
      .filter(
        (run) =>
          run.import_mode === "restore_preview" ||
          run.import_mode === "restore_apply",
      )
      .slice(0, 6)
      .map(toRestoreRunView),
  };
}

export async function previewBehaviorLogRestoreUploadFromFormData(
  formData: FormData,
): Promise<BehaviorLogRestoreActionState> {
  const bundle = await readUploadBundle(formData);
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const { preview, importRun } = await createBehaviorLogRestorePreviewRun(
    supabase,
    {
      userId,
      files: bundle.files,
    },
  );

  return {
    status: "previewed",
    message: preview.valid
      ? "BehaviorLog restore preview ready."
      : "BehaviorLog restore preview found validation errors.",
    upload: {
      fileName: bundle.fileName,
      fileSize: bundle.fileSize,
    },
    bundlePayload: bundle.bundlePayload,
    preview,
    previewRun: toRestoreRunView(importRun),
    applyResult: null,
  };
}

export async function applyBehaviorLogRestoreUploadFromFormData(
  formData: FormData,
): Promise<BehaviorLogRestoreActionState> {
  assertRestoreApplyAcknowledgements(formData);

  const bundle = readBundlePayload(formData);
  const previewRunId = readRequiredString(
    formData,
    "restore_preview_run_id",
    "Preview the BehaviorLog restore again before applying.",
  );
  const acceptedPreviewFingerprint = readRequiredString(
    formData,
    "preview_fingerprint",
    "Preview the BehaviorLog restore again before applying.",
  );
  const acceptedLocalDataFingerprint = readRequiredString(
    formData,
    "local_data_fingerprint",
    "Preview the BehaviorLog restore again before applying.",
  );
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const previewRun = await getBehaviorLogImportRunById(
    supabase,
    userId,
    previewRunId,
  );

  assertAcceptedPreviewRun(
    previewRun,
    acceptedPreviewFingerprint,
    acceptedLocalDataFingerprint,
  );

  const existing = await listBehaviorLogExistingRecords(supabase, userId);
  const importPreview = resolveBehaviorLogImportPreview({
    files: bundle.files,
    existing,
  });
  const preview = resolveBehaviorLogRestorePreview({
    importPreview,
    existing,
  });

  assertFreshAcceptedPreview({
    preview,
    acceptedPreviewFingerprint,
    acceptedLocalDataFingerprint,
  });
  assertRestorePreviewCanApply(preview, formData);

  const manifest = readManifestMetadata(bundle.files);
  const applyRun = await createBehaviorLogImportRun(supabase, {
    userId,
    bundleFormat: manifest.bundleFormat ?? BEHAVIORLOG_FORMAT,
    schemaVersion: manifest.schemaVersion,
    manifestSha256: manifest.manifestSha256,
    bundleFingerprint: preview.bundleFingerprint,
    producerName: manifest.producerName,
    producerVersion: manifest.producerVersion,
    subjectIdStrategy: manifest.subjectIdStrategy,
    privacyRedactionLevel: manifest.privacyRedactionLevel,
    importMode: "restore_apply",
    dryRunSummary: toRestorePreviewSnapshot(preview),
    status: "previewed",
    failureMessage: null,
    completedAt: null,
  } satisfies BehaviorLogImportRunCreateInput);
  const completedAt = new Date().toISOString();

  try {
    const payload = buildRestorePayload({
      userId,
      importRunId: applyRun.id,
      importPreview,
      preview,
      existing,
    });
    const { data, error } = await (supabase as unknown as RestoreRpcClient).rpc(
      "apply_behaviorlog_restore",
      {
        restore_payload: payload,
      },
    );

    if (error) {
      throw error;
    }

    const appliedRun =
      (await updateBehaviorLogImportRunStatus(supabase, {
        userId,
        importRunId: applyRun.id,
        status: "applied",
        completedAt,
      })) ?? applyRun;

    return {
      status: "applied",
      message: "BehaviorLog restore applied.",
      upload: {
        fileName: bundle.fileName,
        fileSize: bundle.fileSize,
      },
      bundlePayload: null,
      preview,
      previewRun: toRestoreRunView(previewRun),
      applyResult: {
        importRun: toRestoreRunView(appliedRun),
        appliedCounts: normalizeRpcResult(data),
      },
    };
  } catch (error) {
    await updateBehaviorLogImportRunStatus(supabase, {
      userId,
      importRunId: applyRun.id,
      status: "failed",
      failureMessage: errorMessage(error),
      completedAt,
    });

    throw error;
  }
}

export function behaviorLogRestoreErrorToActionState(
  error: unknown,
  previousState: BehaviorLogRestoreActionState = BEHAVIORLOG_RESTORE_INITIAL_STATE,
): BehaviorLogRestoreActionState {
  return {
    ...previousState,
    status: "error",
    message: errorMessage(error),
    applyResult: null,
  };
}

function toRestorePreviewSnapshot(
  preview: BehaviorLogRestorePreview,
): Record<string, unknown> {
  return {
    mode: preview.mode,
    valid: preview.valid,
    previewFingerprint: preview.previewFingerprint,
    localDataFingerprint: preview.localDataFingerprint,
    bundleFingerprint: preview.bundleFingerprint,
    statusHistoryPolicy: preview.statusHistoryPolicy,
    semantics: preview.semantics,
    summary: preview.summary,
    nonRestorableFields: preview.nonRestorableFields,
    sensitivity: preview.sensitivity,
    errorCount: preview.errors.length,
    warningCount: preview.warnings.length,
    errors: preview.errors,
    warnings: preview.warnings,
    actions: preview.actions,
  };
}

function buildRestorePayload(input: {
  userId: string;
  importRunId: string;
  importPreview: BehaviorLogImportPreview;
  preview: BehaviorLogRestorePreview;
  existing: BehaviorLogExistingRecords;
}): RestorePayload {
  const actionIndex = indexRestoreActions(input.preview);
  const behaviorIdByExternal = new Map<string, string>();
  const scheduleIdByExternal = new Map<string, string>();
  const occurrenceIdByExternal = new Map<string, string>();
  const statusEventIdByExternal = new Map<string, string>();
  const latestStatusEventByOccurrence = new Map<string, string>();

  for (const behavior of input.importPreview.plan.behaviors) {
    const action = actionIndex.behavior.get(behavior.externalId);

    if (action && action.action !== "skip") {
      behaviorIdByExternal.set(
        behavior.externalId,
        localOrUuid(action, behavior.externalId, "behavior"),
      );
    }
  }

  for (const schedule of input.importPreview.plan.schedules) {
    const action = actionIndex.schedule.get(schedule.externalId);

    if (action && action.action !== "skip") {
      scheduleIdByExternal.set(
        schedule.externalId,
        localOrUuid(action, schedule.externalId, "schedule"),
      );
    }
  }

  for (const occurrence of input.importPreview.plan.occurrences) {
    const action = actionIndex.occurrence.get(occurrence.externalId);

    if (action && action.action !== "skip") {
      occurrenceIdByExternal.set(
        occurrence.externalId,
        localOrUuid(action, occurrence.externalId, "occurrence"),
      );
    }
  }

  for (const event of input.importPreview.plan.statusEvents) {
    const action = actionIndex.status_event.get(event.externalId);

    if (action && action.action !== "skip") {
      const eventId = localOrUuid(action, event.externalId, "status event");
      statusEventIdByExternal.set(event.externalId, eventId);
      latestStatusEventByOccurrence.set(event.occurrenceExternalId, event.externalId);
    }
  }

  const inlineNoteByOccurrence = new Map(
    input.importPreview.plan.notes
      .filter(
        (note) =>
          note.action !== "skip" &&
          note.noteRole !== "ai_generated" &&
          note.attachedToType === "occurrence",
      )
      .map((note) => [note.attachedToId, note.bodyMarkdown]),
  );

  return {
    archive_behavior_ids: input.preview.actions.behaviors
      .filter((action) => action.action === "archive")
      .map(requiredLocalId),
    delete_schedule_ids: input.preview.actions.schedules
      .filter((action) => action.action === "delete")
      .map(requiredLocalId),
    delete_occurrence_ids: input.preview.actions.occurrences
      .filter((action) => action.action === "delete")
      .map(requiredLocalId),
    delete_status_event_ids:
      input.preview.statusHistoryPolicy.selected === "replace_status_history"
        ? input.preview.actions.statusEvents
            .filter((action) => action.action === "delete")
            .map(requiredLocalId)
        : [],
    clear_occurrence_note_ids: input.preview.actions.inlineOccurrenceNotes
      .filter((action) => action.action === "delete")
      .map(requiredLocalId),
    delete_imported_note_ids: input.preview.actions.importedNotes
      .filter((action) => action.action === "delete")
      .map(requiredLocalId),
    delete_imported_intervention_ids: input.preview.actions.importedInterventions
      .filter((action) => action.action === "delete")
      .map(requiredLocalId),
    behaviors: input.importPreview.plan.behaviors
      .filter((behavior) =>
        shouldUpsert(actionIndex.behavior.get(behavior.externalId)),
      )
      .map((behavior) => {
        const schedules = input.importPreview.plan.schedules.filter(
          (schedule) => schedule.behaviorExternalId === behavior.externalId,
        );
        const primarySchedule = schedules[0];

        if (!primarySchedule) {
          throw new BehaviorLogRestoreUserError(
            `Behavior ${behavior.externalId} cannot be restored without a supported schedule.`,
          );
        }

        return {
          id: behaviorIdByExternal.get(behavior.externalId),
          category_id: null,
          title: behavior.title,
          description: behavior.description,
          recurrence_rule: toCadenceRecurrenceRule(primarySchedule),
          scheduled_time: primarySchedule.localTime ?? primarySchedule.windowStartLocal,
          timezone: primarySchedule.timezone || DEFAULT_TIMEZONE,
          browser_reminder_enabled:
            behavior.cadenceBrowserReminderEnabled ?? true,
          email_reminder_enabled: behavior.cadenceEmailReminderEnabled ?? false,
          reminder_offset_minutes: behavior.cadenceReminderOffsetMinutes ?? 0,
          active: behavior.archivedAtUtc ? false : behavior.cadenceActive ?? true,
          archived_at: behavior.archivedAtUtc,
          created_at: behavior.createdAtUtc,
        };
      }),
    schedules: input.importPreview.plan.schedules
      .filter((schedule) =>
        shouldUpsert(actionIndex.schedule.get(schedule.externalId)),
      )
      .map((schedule, index) => ({
        id: scheduleIdByExternal.get(schedule.externalId),
        behavior_id: requiredMapValue(
          behaviorIdByExternal,
          schedule.behaviorExternalId,
          "schedule behavior",
        ),
        kind: schedule.cadenceScheduleKind ?? "exact",
        preset: schedule.cadenceSchedulePreset,
        start_time: schedule.localTime ?? schedule.windowStartLocal,
        end_time: schedule.windowEndLocal,
        sort_order: index,
      })),
    occurrences: input.importPreview.plan.occurrences
      .filter((occurrence) =>
        shouldUpsert(actionIndex.occurrence.get(occurrence.externalId)),
      )
      .map((occurrence) => {
        const latestEventExternalId = latestStatusEventByOccurrence.get(
          occurrence.externalId,
        );
        const latestEvent = latestEventExternalId
          ? input.importPreview.plan.statusEvents.find(
              (event) => event.externalId === latestEventExternalId,
            )
          : null;
        const schedule = input.importPreview.plan.schedules.find(
          (candidate) => candidate.externalId === occurrence.scheduleExternalId,
        );

        if (!schedule) {
          throw new BehaviorLogRestoreUserError(
            `Occurrence ${occurrence.externalId} cannot be restored without its schedule.`,
          );
        }

        return {
          id: occurrenceIdByExternal.get(occurrence.externalId),
          behavior_id: requiredMapValue(
            behaviorIdByExternal,
            occurrence.behaviorExternalId,
            "occurrence behavior",
          ),
          behavior_schedule_slot_id: requiredMapValue(
            scheduleIdByExternal,
            occurrence.scheduleExternalId,
            "occurrence schedule",
          ),
          scheduled_for: occurrence.scheduledForUtc,
          local_date: occurrence.localDate,
          schedule_kind: schedule.cadenceScheduleKind ?? "exact",
          schedule_preset: schedule.cadenceSchedulePreset,
          schedule_start_time: schedule.localTime ?? schedule.windowStartLocal,
          schedule_end_time: schedule.windowEndLocal,
          status: occurrence.currentStatus,
          completed_at:
            occurrence.currentStatus === "completed"
              ? latestEvent?.effectiveAtUtc ?? latestEvent?.recordedAtUtc ?? null
              : null,
          status_marked_at:
            occurrence.currentStatus === "unresolved"
              ? null
              : latestEvent?.recordedAtUtc ?? null,
          note: inlineNoteByOccurrence.get(occurrence.externalId) ?? null,
          created_at: occurrence.generatedAtUtc,
        };
      }),
    status_events: input.importPreview.plan.statusEvents
      .filter((event) =>
        shouldUpsert(actionIndex.status_event.get(event.externalId)),
      )
      .map((event) => ({
        id: statusEventIdByExternal.get(event.externalId),
        occurrence_id: requiredMapValue(
          occurrenceIdByExternal,
          event.occurrenceExternalId,
          "status event occurrence",
        ),
        behavior_id: requiredMapValue(
          behaviorIdByExternal,
          event.behaviorExternalId,
          "status event behavior",
        ),
        previous_status: event.previousStatus,
        status: event.status,
        status_semantics: event.statusSemantics,
        recorded_at: event.recordedAtUtc,
        effective_at: event.effectiveAtUtc,
        local_date: event.localDate,
        timezone: event.timezone,
        source_capture_method: event.sourceCaptureMethod,
        source_confidence: event.sourceConfidence,
        revises_event_id: event.revisesEventId
          ? statusEventIdByExternal.get(event.revisesEventId) ?? null
          : null,
        reason_code: event.reasonCode,
      })),
    imported_notes: input.importPreview.plan.notes
      .filter((note) => shouldUpsert(actionIndex.note.get(note.externalId)))
      .map((note) => ({
        id: null,
        import_run_id: input.importRunId,
        external_id: note.externalId,
        target_type: note.attachedToType,
        target_external_id: note.attachedToId,
        target_local_id: localTargetIdForNote({
          note,
          behaviorIdByExternal,
          occurrenceIdByExternal,
          statusEventIdByExternal,
        }),
        body_markdown: note.bodyMarkdown,
        note_role: note.noteRole,
        sensitivity: note.sensitivity,
        source_original_id: note.sourceOriginalId,
        source_capture_method: note.sourceCaptureMethod,
        source_confidence: note.sourceConfidence,
        imported_created_at: note.createdAtUtc,
        imported_updated_at: note.updatedAtUtc,
        metadata: { restored_from_behaviorlog: true },
      })),
    imported_interventions: input.importPreview.plan.interventions
      .filter((intervention) =>
        shouldUpsert(actionIndex.intervention.get(intervention.externalId)),
      )
      .map((intervention) => ({
        id: null,
        import_run_id: input.importRunId,
        external_id: intervention.externalId,
        behavior_external_id: intervention.behaviorExternalId,
        occurrence_external_id: intervention.occurrenceExternalId,
        behavior_id: behaviorIdByExternal.get(intervention.behaviorExternalId) ?? null,
        occurrence_id:
          occurrenceIdByExternal.get(intervention.occurrenceExternalId) ?? null,
        intervention_type: intervention.interventionType,
        channel: intervention.channel,
        delivery_status: intervention.deliveryStatus,
        scheduled_send_at: intervention.scheduledSendAtUtc,
        sent_at: intervention.sentAtUtc,
        failure_reason: intervention.failureReason,
        source_original_id: intervention.sourceOriginalId,
        source_capture_method: intervention.sourceCaptureMethod,
        source_confidence: intervention.sourceConfidence,
        redacted_sensitivity_indicators: {
          droppedSensitiveFields:
            intervention.storageDecision.droppedSensitiveFields,
          redactedFields: intervention.storageDecision.redactedFields,
        },
        metadata: { restored_from_behaviorlog: true },
      })),
  };
}

function indexRestoreActions(preview: BehaviorLogRestorePreview): Record<
  "behavior" | "schedule" | "occurrence" | "status_event" | "note" | "intervention",
  Map<string, BehaviorLogRestoreAction>
> {
  return {
    behavior: indexByExternalId(preview.actions.behaviors),
    schedule: indexByExternalId(preview.actions.schedules),
    occurrence: indexByExternalId(preview.actions.occurrences),
    status_event: indexByExternalId(preview.actions.statusEvents),
    note: indexByExternalId(preview.actions.importedNotes),
    intervention: indexByExternalId(preview.actions.importedInterventions),
  };
}

function indexByExternalId(
  actions: BehaviorLogRestoreAction[],
): Map<string, BehaviorLogRestoreAction> {
  return new Map(
    actions
      .filter((action) => action.externalId)
      .map((action) => [action.externalId as string, action]),
  );
}

function shouldUpsert(action: BehaviorLogRestoreAction | undefined): boolean {
  return Boolean(
    action &&
      (action.action === "create" ||
        action.action === "replace" ||
        action.action === "keep"),
  );
}

function localOrUuid(
  action: BehaviorLogRestoreAction,
  externalId: string,
  label: string,
): string {
  const id = action.localId ?? externalId;

  if (!isUuid(id)) {
    throw new BehaviorLogRestoreUserError(
      `Restore apply currently requires ${label} ids to be UUIDs. Preview this bundle as import/merge instead, or use a Cadence-generated BehaviorLog backup.`,
    );
  }

  return id;
}

function requiredLocalId(action: BehaviorLogRestoreAction): string {
  if (!action.localId || !isUuid(action.localId)) {
    throw new BehaviorLogRestoreUserError(
      `Restore action for ${action.recordType} is missing a safe local id.`,
    );
  }

  return action.localId;
}

function requiredMapValue(
  map: Map<string, string>,
  key: string,
  label: string,
): string {
  const value = map.get(key);

  if (!value) {
    throw new BehaviorLogRestoreUserError(`Restore payload is missing ${label}.`);
  }

  return value;
}

function localTargetIdForNote(input: {
  note: BehaviorLogImportNotePlan;
  behaviorIdByExternal: Map<string, string>;
  occurrenceIdByExternal: Map<string, string>;
  statusEventIdByExternal: Map<string, string>;
}): string | null {
  switch (input.note.attachedToType) {
    case "behavior":
      return input.behaviorIdByExternal.get(input.note.attachedToId) ?? null;
    case "occurrence":
      return input.occurrenceIdByExternal.get(input.note.attachedToId) ?? null;
    case "status_event":
      return input.statusEventIdByExternal.get(input.note.attachedToId) ?? null;
    case "review":
      return null;
  }
}

function toCadenceRecurrenceRule(
  schedule: BehaviorLogImportSchedulePlan,
): Record<string, unknown> {
  const recurrence = schedule.recurrence;

  switch (recurrence.type) {
    case "daily":
      return { frequency: "daily", interval: readPositiveInt(recurrence.interval) ?? 1 };
    case "every_n_days":
      return {
        frequency: "interval_days",
        intervalDays: readPositiveInt(recurrence.interval) ?? 1,
      };
    case "weekly_on_weekdays":
      return {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: readWeekdays(recurrence.weekdays),
      };
    case "every_n_weeks_on_weekdays":
      return {
        frequency: "weekly",
        interval: readPositiveInt(recurrence.interval) ?? 1,
        daysOfWeek: readWeekdays(recurrence.weekdays),
      };
    case "monthly_on_day":
      return {
        frequency: "monthly",
        interval: readPositiveInt(recurrence.interval) ?? 1,
        dayOfMonth: readPositiveInt(recurrence.day) ?? 1,
      };
    default:
      throw new BehaviorLogRestoreUserError(
        `Schedule ${schedule.externalId} uses an unsupported recurrence shape.`,
      );
  }
}

function readPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readWeekdays(value: unknown): Weekday[] {
  const weekdays = Array.isArray(value)
    ? value.filter((day): day is Weekday => isWeekday(day))
    : [];

  if (weekdays.length === 0) {
    throw new BehaviorLogRestoreUserError(
      "Weekly restore schedules must include at least one supported weekday.",
    );
  }

  return weekdays;
}

function isWeekday(value: unknown): value is Weekday {
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function assertRestoreApplyAcknowledgements(formData: FormData): void {
  if (formData.get("confirm_backup") !== "yes") {
    throw new BehaviorLogRestoreUserError(
      "Acknowledge that you created or downloaded a fresh backup before restoring.",
    );
  }

  if (formData.get("confirm_restore_text") !== RESTORE_CONFIRMATION_TEXT) {
    throw new BehaviorLogRestoreUserError(
      `Type ${RESTORE_CONFIRMATION_TEXT} to confirm this destructive restore.`,
    );
  }
}

function assertRestorePreviewCanApply(
  preview: BehaviorLogRestorePreview,
  formData: FormData,
): void {
  if (!preview.valid || preview.errors.length > 0) {
    throw new BehaviorLogRestoreUserError(
      "Fix restore preview validation errors before applying.",
    );
  }

  if (preview.summary.unsupportedActionCount > 0) {
    throw new BehaviorLogRestoreUserError(
      "Restore preview still contains skipped or unsupported actions.",
    );
  }

  if (
    preview.sensitivity.highOrRestrictedNotesPresent &&
    formData.get("confirm_sensitive_notes") !== "yes"
  ) {
    throw new BehaviorLogRestoreUserError(
      "Review and acknowledge high or restricted note sensitivity before restoring.",
    );
  }
}

function assertAcceptedPreviewRun(
  run: BehaviorLogImportRun | null,
  previewFingerprint: string,
  localDataFingerprint: string,
): asserts run is BehaviorLogImportRun {
  if (!run || run.import_mode !== "restore_preview" || run.status !== "previewed") {
    throw new BehaviorLogRestoreUserError(
      "Preview the BehaviorLog restore again before applying.",
    );
  }

  const summary = readObject(run.dry_run_summary);

  if (
    readString(summary?.previewFingerprint) !== previewFingerprint ||
    readString(summary?.localDataFingerprint) !== localDataFingerprint
  ) {
    throw new BehaviorLogRestoreUserError(
      "Restore preview no longer matches the accepted preview run.",
    );
  }
}

function assertFreshAcceptedPreview(input: {
  preview: BehaviorLogRestorePreview;
  acceptedPreviewFingerprint: string;
  acceptedLocalDataFingerprint: string;
}): void {
  if (input.preview.localDataFingerprint !== input.acceptedLocalDataFingerprint) {
    throw new BehaviorLogRestoreUserError(
      "Local data changed since this restore preview. Preview the restore again before applying.",
    );
  }

  if (input.preview.previewFingerprint !== input.acceptedPreviewFingerprint) {
    throw new BehaviorLogRestoreUserError(
      "Restore preview is stale. Preview the restore again before applying.",
    );
  }
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new BehaviorLogRestoreAuthError();
  }

  return user.id;
}

async function readUploadBundle(
  formData: FormData,
): Promise<BehaviorLogRestoreUploadBundle> {
  const value = formData.get("restore_behaviorlog_file");

  if (!isUploadFile(value)) {
    throw new BehaviorLogRestoreUserError("Choose a .behaviorlog.zip file.");
  }

  const fileName = value.name.trim();

  if (!fileName.endsWith(".behaviorlog.zip")) {
    throw new BehaviorLogRestoreUserError(
      "Unsupported file. Upload a .behaviorlog.zip bundle.",
    );
  }

  if (value.size === 0) {
    throw new BehaviorLogRestoreUserError("The uploaded bundle is empty.");
  }

  if (value.size > MAX_BEHAVIORLOG_UPLOAD_BYTES) {
    throw new BehaviorLogRestoreUserError(
      "The uploaded bundle is too large for this restore screen.",
    );
  }

  const zip = Buffer.from(await value.arrayBuffer());

  return createUploadBundle({
    fileName,
    fileSize: value.size,
    zip,
  });
}

function readBundlePayload(formData: FormData): BehaviorLogRestoreUploadBundle {
  const payload = formData.get("bundle_payload");
  const fileNameValue = formData.get("upload_file_name");
  const fileSizeValue = formData.get("upload_file_size");

  if (typeof payload !== "string" || payload.length === 0) {
    throw new BehaviorLogRestoreUserError(
      "Preview the .behaviorlog.zip bundle again before applying.",
    );
  }

  const zip = Buffer.from(payload, "base64");

  if (zip.byteLength === 0) {
    throw new BehaviorLogRestoreUserError("The uploaded bundle is empty.");
  }

  if (zip.byteLength > MAX_BEHAVIORLOG_UPLOAD_BYTES) {
    throw new BehaviorLogRestoreUserError(
      "The uploaded bundle is too large for this restore screen.",
    );
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

function createUploadBundle(input: {
  fileName: string;
  fileSize: number;
  zip: Buffer;
}): BehaviorLogRestoreUploadBundle {
  try {
    return {
      ...input,
      files: parseBehaviorLogZipFiles(input.zip),
      bundlePayload: input.zip.toString("base64"),
    };
  } catch (error) {
    throw new BehaviorLogRestoreUserError(
      `Unable to read BehaviorLog bundle: ${errorMessage(error)}`,
    );
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function readRequiredString(
  formData: FormData,
  field: string,
  message: string,
): string {
  const value = formData.get(field);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BehaviorLogRestoreUserError(message);
  }

  return value.trim();
}

function toRestoreRunView(run: BehaviorLogImportRun): BehaviorLogRestoreRunView {
  return {
    id: run.id,
    mode: run.import_mode,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    failureMessage: run.failure_message,
  };
}

function normalizeRpcResult(data: unknown): Record<string, number> {
  const value = readObject(data);

  if (!value) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => typeof count === "number" && Number.isFinite(count))
      .map(([key, count]) => [key, count as number]),
  );
}

function readManifestMetadata(files: BehaviorLogImportFile[]): {
  bundleFormat: string | null;
  schemaVersion: string | null;
  manifestSha256: string | null;
  producerName: string | null;
  producerVersion: string | null;
  subjectIdStrategy: string | null;
  privacyRedactionLevel: string | null;
} {
  const manifestFile = files.find((file) => file.path === "manifest.json");
  const manifest = parseJsonObject(manifestFile?.content ?? null);
  const producer = readObject(manifest?.producer);
  const privacy = readObject(manifest?.privacy);

  return {
    bundleFormat: readString(manifest?.format),
    schemaVersion: readString(manifest?.schema_version),
    manifestSha256: manifestFile ? sha256(manifestFile.content) : null,
    producerName: readString(producer?.name),
    producerVersion: readString(producer?.version),
    subjectIdStrategy: readString(privacy?.subject_id_strategy),
    privacyRedactionLevel: readString(privacy?.redaction_level),
  };
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return readObject(parsed);
  } catch {
    return null;
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "BehaviorLog restore could not be completed.";
}
