import { createHash } from "node:crypto";

import {
  bindBehaviorLogRestoreApplyPayload,
  createBehaviorLogImportRun,
  getAppliedBehaviorLogRestoreRunByAcceptedPreview,
  getBehaviorLogImportRunById,
  markBehaviorLogRestoreRunFailedIfPending,
} from "@/lib/db/behaviorLogImports.repo";
import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import {
  resolveBehaviorLogImportPreview,
} from "@/lib/resolvers/behaviorlog-import.resolver";
import {
  normalizeBehaviorDefinition,
  planBehaviorDefinitionChangeEvent,
  planInitialBehaviorDefinitionEvent,
} from "@/lib/resolvers/behavior-definition.resolver";
import { resolveBehaviorLogRestorePreview } from "@/lib/resolvers/behaviorlog-restore.resolver";
import {
  listBehaviorLogExistingRecords,
  parseBehaviorLogZipFiles,
  type BehaviorLogZipInput,
} from "@/lib/services/behaviorlog-import.service";
import { markOccurrenceSyncStale } from "@/lib/services/occurrence-sync-state.service";
import { repairUserOccurrenceReminderGraphBestEffort } from "@/lib/services/occurrence-reminder-repair.service";
import {
  invalidateBehaviorData,
  invalidateImportRunData,
  readCachedBehaviorLogImportRuns,
} from "@/lib/cache/stable-user-data.cache";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import type {
  BehaviorLogImportBehaviorPlan,
  BehaviorLogExistingRecords,
  BehaviorLogImportFile,
  BehaviorLogImportNotePlan,
  BehaviorLogImportPreview,
  BehaviorLogImportRecordMappingInput,
  BehaviorLogImportRunCreateInput,
  BehaviorLogImportSchedulePlan,
} from "@/lib/types/behaviorlog-import";
import type { BehaviorLogImportRun } from "@/lib/types/database";
import type {
  BehaviorDefinition,
  BehaviorDefinitionEventPlan,
} from "@/lib/types/behavior-definition-event";
import { DEFAULT_TIMEZONE, type Weekday } from "@/lib/types/recurrence";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ZIP_READ_LIMITS } from "@/lib/services/zip";
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
import { BEHAVIORLOG_BUNDLE_SIZE_ERROR } from "@/lib/types/behaviorlog-bundle-ui";

const BEHAVIORLOG_FORMAT = "behaviorlog.bundle";
const MAX_BEHAVIORLOG_UPLOAD_BYTES = DEFAULT_ZIP_READ_LIMITS.maxArchiveBytes;
const RESTORE_CONFIRMATION_TEXT = "RESTORE";

type BehaviorLogRestoreUploadBundle = {
  fileName: string;
  fileSize: number;
  zip: Buffer;
  files: BehaviorLogImportFile[];
  archiveFingerprint: string;
};

type RestoreRpcClient = {
  rpc: (
    fn: "apply_behaviorlog_restore",
    args: { restore_payload: RestorePayload },
  ) => Promise<{ data: unknown; error: Error | null }>;
};

type RestoreBoundPayload = RestoreProductPayload & {
  apply_run_id: string;
  accepted_preview_run_id: string;
  accepted_preview_fingerprint: string;
  accepted_local_data_fingerprint: string;
  accepted_bundle_fingerprint: string;
  accepted_bundle_payload_fingerprint: string;
  mappings: Array<{
    record_type: BehaviorLogImportRecordMappingInput["recordType"];
    external_id: string;
    local_id: string;
  }>;
};

type RestorePayload = RestoreBoundPayload & {
  apply_payload_digest: string;
};

type RestoreRowPrecondition = {
  record_type:
    | "behavior"
    | "schedule"
    | "occurrence"
    | "status_event"
    | "note"
    | "intervention";
  local_id: string;
  expectation: "absent" | "unchanged";
  expected_updated_at: string | null;
};

type RestoreProductPayload = {
  preconditions: RestoreRowPrecondition[];
  archive_behavior_ids: string[];
  delete_schedule_ids: string[];
  delete_occurrence_ids: string[];
  delete_status_event_ids: string[];
  clear_occurrence_note_ids: string[];
  delete_imported_note_ids: string[];
  delete_imported_intervention_ids: string[];
  behaviors: Array<Record<string, unknown>>;
  behavior_definition_events: Array<Record<string, unknown>>;
  schedules: Array<Record<string, unknown>>;
  occurrences: Array<Record<string, unknown>>;
  status_events: Array<Record<string, unknown>>;
  imported_notes: Array<Record<string, unknown>>;
  imported_interventions: Array<Record<string, unknown>>;
};

type RestoreBehaviorDefinitionEventPayload = {
  event_kind: "baseline" | "transition";
  behavior_id: string;
  previous_title: string | null;
  next_title: string;
  previous_description: string | null;
  next_description: string | null;
  changed_fields: Array<"title" | "description">;
  recorded_at: string;
  source: "import";
  reason: "behaviorlog_restore";
  expected_previous_title: string | null;
  expected_previous_description: string | null;
};

type RestorePayloadBuildResult = {
  payload: RestoreProductPayload;
  mappings: BehaviorLogImportRecordMappingInput[];
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
    archiveFingerprint: string;
    statusHistoryPolicy?: BehaviorLogRestoreStatusHistoryPolicy;
  },
): Promise<{
  preview: BehaviorLogRestorePreview;
  importRun: BehaviorLogImportRun;
}> {
  const startedAt = new Date().toISOString();
  const preview = await previewCurrentUserBehaviorLogRestoreFromFiles(supabase, {
    userId: input.userId,
    files: input.files,
    statusHistoryPolicy: input.statusHistoryPolicy,
  });
  const completedAt = new Date().toISOString();
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
    dryRunSummary: toRestorePreviewSnapshot(
      preview,
      input.archiveFingerprint,
    ),
    status: "previewed",
    failureMessage: null,
    startedAt,
    completedAt,
  });
  invalidateImportRunData(input.userId);

  return { preview, importRun };
}

export async function getBehaviorLogRestorePageData(): Promise<BehaviorLogRestorePageData> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const recentRuns = await readCachedBehaviorLogImportRuns(supabase, userId, 12);

  return createBehaviorLogRestorePageDataFromRuns(recentRuns);
}

export function createBehaviorLogRestorePageDataFromRuns(
  recentRuns: BehaviorLogImportRun[],
): BehaviorLogRestorePageData {
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
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const bundle = await readUploadBundle(formData);
  const { preview, importRun } = await createBehaviorLogRestorePreviewRun(
    supabase,
    {
      userId,
      files: bundle.files,
      archiveFingerprint: bundle.archiveFingerprint,
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
    archiveFingerprint: bundle.archiveFingerprint,
    preview,
    previewRun: toRestoreRunView(importRun),
    applyResult: null,
  };
}

export async function applyBehaviorLogRestoreUploadFromFormData(
  formData: FormData,
): Promise<BehaviorLogRestoreActionState> {
  assertRestoreApplyAcknowledgements(formData);

  const supabase = await createClient();
  const userId = await requireUserId(supabase);
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
  const acceptedArchiveFingerprint = readRequiredString(
    formData,
    "archive_fingerprint",
    "Preview the BehaviorLog restore again before applying.",
  );
  const previewRun = await getBehaviorLogImportRunById(
    supabase,
    userId,
    previewRunId,
  );

  assertAcceptedPreviewRun(
    previewRun,
    acceptedPreviewFingerprint,
    acceptedLocalDataFingerprint,
    acceptedArchiveFingerprint,
  );
  const archiveFingerprint = assertArchiveMatchesAcceptedPreview(
    bundle.archiveFingerprint,
    acceptedArchiveFingerprint,
  );

  const alreadyAppliedRun =
    await getAppliedBehaviorLogRestoreRunByAcceptedPreview(supabase, {
      userId,
      acceptedPreviewRunId: previewRun.id,
      acceptedPreviewFingerprint,
    });

  if (alreadyAppliedRun) {
    await repairUserOccurrenceReminderGraphBestEffort(supabase, userId, {
      operation: "behaviorlog_restore",
    });
    return createAlreadyAppliedRestoreState({
      bundle,
      previewRun,
      appliedRun: alreadyAppliedRun,
    });
  }

  const existing = await listBehaviorLogExistingRecords(supabase, userId);
  const importPreview = resolveBehaviorLogImportPreview({
    files: bundle.files,
  });
  const preview = resolveBehaviorLogRestorePreview({
    importPreview,
    existing,
  });

  try {
    assertFreshAcceptedPreview({
      preview,
      acceptedPreviewFingerprint,
      acceptedLocalDataFingerprint,
    });
  } catch (stalePreviewError) {
    const concurrentlyAppliedRun =
      await getAppliedBehaviorLogRestoreRunByAcceptedPreview(supabase, {
        userId,
        acceptedPreviewRunId: previewRun.id,
        acceptedPreviewFingerprint,
      });

    if (concurrentlyAppliedRun) {
      await repairUserOccurrenceReminderGraphBestEffort(supabase, userId, {
        operation: "behaviorlog_restore",
      });
      return createAlreadyAppliedRestoreState({
        bundle,
        previewRun,
        appliedRun: concurrentlyAppliedRun,
      });
    }

    throw stalePreviewError;
  }
  assertRestorePreviewCanApply(preview, formData);
  await markOccurrenceSyncStale(supabase, {
    userId,
    reason: "behaviorlog_restore_applied",
  });

  const manifest = readManifestMetadata(bundle.files);
  const applyRunSummary = toRestorePreviewSnapshot(
    preview,
    archiveFingerprint,
  );
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
    acceptedPreviewRunId: previewRun.id,
    acceptedPreviewFingerprint,
    dryRunSummary: applyRunSummary,
    status: "previewed",
    failureMessage: null,
    completedAt: null,
  } satisfies BehaviorLogImportRunCreateInput);
  invalidateImportRunData(userId);
  let rpcData: unknown;

  try {
    const { payload, mappings } = buildRestorePayload({
      userId,
      importRunId: applyRun.id,
      importPreview,
      preview,
      existing,
    });
    const boundPayload: RestoreBoundPayload = {
      ...payload,
      apply_run_id: applyRun.id,
      accepted_preview_run_id: previewRun.id,
      accepted_preview_fingerprint: acceptedPreviewFingerprint,
      accepted_local_data_fingerprint: acceptedLocalDataFingerprint,
      accepted_bundle_fingerprint: preview.bundleFingerprint,
      accepted_bundle_payload_fingerprint: archiveFingerprint,
      mappings: mappings.map((mapping) => ({
        record_type: mapping.recordType,
        external_id: mapping.externalId,
        local_id: mapping.localId,
      })),
    };
    const applyPayloadDigest = await bindBehaviorLogRestoreApplyPayload(
      supabase,
      {
        userId,
        importRunId: applyRun.id,
        restorePayload: boundPayload as unknown as Record<string, unknown>,
      },
    );
    const { data, error } = await (supabase as unknown as RestoreRpcClient).rpc(
      "apply_behaviorlog_restore",
      {
        restore_payload: {
          ...boundPayload,
          apply_payload_digest: applyPayloadDigest,
        },
      },
    );

    if (error) {
      throw error;
    }

    rpcData = data;
  } catch (error) {
    const failedRun = await markBehaviorLogRestoreRunFailedIfPending(supabase, {
      userId,
      importRunId: applyRun.id,
      failureMessage: errorMessage(error),
      completedAt: new Date().toISOString(),
    });
    invalidateImportRunData(userId);

    if (!failedRun) {
      const committedRun =
        await getAppliedBehaviorLogRestoreRunByAcceptedPreview(supabase, {
          userId,
          acceptedPreviewRunId: previewRun.id,
          acceptedPreviewFingerprint,
        });

      if (committedRun) {
        await repairUserOccurrenceReminderGraphBestEffort(supabase, userId, {
          operation: "behaviorlog_restore",
        });
        return createAlreadyAppliedRestoreState({
          bundle,
          previewRun,
          appliedRun: committedRun,
        });
      }
    }

    throw error;
  }

  const rpcResult = normalizeRestoreRpcResult(rpcData, applyRun);
  invalidateBehaviorData(userId);
  invalidateImportRunData(userId);
  await repairUserOccurrenceReminderGraphBestEffort(supabase, userId, {
    operation: "behaviorlog_restore",
  });

  return {
    status: "applied",
    message: rpcResult.alreadyApplied
      ? "This accepted BehaviorLog restore was already applied."
      : "BehaviorLog restore applied.",
    upload: {
      fileName: bundle.fileName,
      fileSize: bundle.fileSize,
    },
    archiveFingerprint: null,
    preview,
    previewRun: toRestoreRunView(previewRun),
    applyResult: {
      importRun: rpcResult.appliedRun,
      appliedCounts: rpcResult.appliedCounts,
    },
  };
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
  archiveFingerprint: string,
): Record<string, unknown> {
  return {
    mode: preview.mode,
    valid: preview.valid,
    previewFingerprint: preview.previewFingerprint,
    localDataFingerprint: preview.localDataFingerprint,
    bundleFingerprint: preview.bundleFingerprint,
    archiveFingerprint,
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

function createAlreadyAppliedRestoreState(input: {
  bundle: BehaviorLogRestoreUploadBundle;
  previewRun: BehaviorLogImportRun;
  appliedRun: BehaviorLogImportRun;
}): BehaviorLogRestoreActionState {
  const appliedSummary = readObject(input.appliedRun.dry_run_summary);

  return {
    status: "applied",
    message: "This accepted BehaviorLog restore was already applied.",
    upload: {
      fileName: input.bundle.fileName,
      fileSize: input.bundle.fileSize,
    },
    archiveFingerprint: null,
    preview: readRestorePreviewSnapshot(input.previewRun),
    previewRun: toRestoreRunView(input.previewRun),
    applyResult: {
      importRun: toRestoreRunView(input.appliedRun),
      appliedCounts: normalizeRpcResult(appliedSummary?.applyResult),
    },
  };
}

function readRestorePreviewSnapshot(
  previewRun: BehaviorLogImportRun,
): BehaviorLogRestorePreview {
  const snapshot = readObject(previewRun.dry_run_summary);

  if (snapshot?.mode !== "restore_preview") {
    throw new BehaviorLogRestoreUserError(
      "The accepted restore preview snapshot is unavailable. Preview the restore again.",
    );
  }

  assertAcceptedRestorePreviewSnapshotCanApply(snapshot);

  return snapshot as BehaviorLogRestorePreview;
}

function buildRestorePayload(input: {
  userId: string;
  importRunId: string;
  importPreview: BehaviorLogImportPreview;
  preview: BehaviorLogRestorePreview;
  existing: BehaviorLogExistingRecords;
}): RestorePayloadBuildResult {
  const actionIndex = indexRestoreActions(input.preview);
  const behaviorIdByExternal = new Map<string, string>();
  const scheduleIdByExternal = new Map<string, string>();
  const occurrenceIdByExternal = new Map<string, string>();
  const statusEventIdByExternal = new Map<string, string>();
  const noteIdByExternal = new Map<string, string>();
  const interventionIdByExternal = new Map<string, string>();
  const latestStatusEventByOccurrence = new Map<string, string>();
  const mappings: BehaviorLogImportRecordMappingInput[] = [];
  const restoreRecordedAt = new Date().toISOString();

  for (const behavior of input.importPreview.plan.behaviors) {
    const action = actionIndex.behavior.get(behavior.externalId);

    if (action && action.action !== "skip") {
      const behaviorId = deriveBehaviorLogRestoreLocalId(action, {
        externalId: behavior.externalId,
        label: "behavior",
        recordType: "behavior",
        userId: input.userId,
        bundleFingerprint: input.preview.bundleFingerprint,
      });
      behaviorIdByExternal.set(
        behavior.externalId,
        behaviorId,
      );
      mappings.push(
        restoreMapping(input, "behavior", behavior.externalId, behaviorId),
      );
    }
  }

  for (const schedule of input.importPreview.plan.schedules) {
    const action = actionIndex.schedule.get(schedule.externalId);

    if (action && action.action !== "skip") {
      const scheduleId = deriveBehaviorLogRestoreLocalId(action, {
        externalId: schedule.externalId,
        label: "schedule",
        recordType: "schedule",
        userId: input.userId,
        bundleFingerprint: input.preview.bundleFingerprint,
      });
      scheduleIdByExternal.set(
        schedule.externalId,
        scheduleId,
      );
      mappings.push(
        restoreMapping(input, "schedule", schedule.externalId, scheduleId),
      );
    }
  }

  for (const occurrence of input.importPreview.plan.occurrences) {
    const action = actionIndex.occurrence.get(occurrence.externalId);

    if (action && action.action !== "skip") {
      const occurrenceId = deriveBehaviorLogRestoreLocalId(action, {
        externalId: occurrence.externalId,
        label: "occurrence",
        recordType: "occurrence",
        userId: input.userId,
        bundleFingerprint: input.preview.bundleFingerprint,
      });
      occurrenceIdByExternal.set(
        occurrence.externalId,
        occurrenceId,
      );
      mappings.push(
        restoreMapping(input, "occurrence", occurrence.externalId, occurrenceId),
      );
    }
  }

  for (const event of input.importPreview.plan.statusEvents) {
    const action = actionIndex.status_event.get(event.externalId);

    if (action && action.action !== "skip") {
      const eventId = deriveBehaviorLogRestoreLocalId(action, {
        externalId: event.externalId,
        label: "status event",
        recordType: "status_event",
        userId: input.userId,
        bundleFingerprint: input.preview.bundleFingerprint,
      });
      statusEventIdByExternal.set(event.externalId, eventId);
      mappings.push(
        restoreMapping(input, "status_event", event.externalId, eventId),
      );
      latestStatusEventByOccurrence.set(event.occurrenceExternalId, event.externalId);
    }
  }

  for (const note of input.importPreview.plan.notes) {
    const action = actionIndex.note.get(note.externalId);

    if (action && action.action !== "skip") {
      const noteId = deriveBehaviorLogRestoreLocalId(action, {
        externalId: note.externalId,
        label: "note",
        recordType: "note",
        userId: input.userId,
        bundleFingerprint: input.preview.bundleFingerprint,
      });
      noteIdByExternal.set(note.externalId, noteId);
      mappings.push(restoreMapping(input, "note", note.externalId, noteId));
    }
  }

  for (const intervention of input.importPreview.plan.interventions) {
    const action = actionIndex.intervention.get(intervention.externalId);

    if (action && action.action !== "skip") {
      const interventionId = deriveBehaviorLogRestoreLocalId(action, {
        externalId: intervention.externalId,
        label: "intervention",
        recordType: "intervention",
        userId: input.userId,
        bundleFingerprint: input.preview.bundleFingerprint,
      });
      interventionIdByExternal.set(intervention.externalId, interventionId);
      mappings.push(
        restoreMapping(
          input,
          "intervention",
          intervention.externalId,
          interventionId,
        ),
      );
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
  const behaviorDefinitionEvents = buildRestoreBehaviorDefinitionEvents({
    behaviorPlans: input.importPreview.plan.behaviors,
    actionIndex: actionIndex.behavior,
    behaviorIdByExternal,
    existingBehaviors: input.existing.behaviors ?? [],
    restoreRecordedAt,
  });
  const behaviorDefinitionEventByBehaviorId = new Map(
    behaviorDefinitionEvents.map((event) => [event.behavior_id, event]),
  );
  const existingBehaviorById = new Map(
    (input.existing.behaviors ?? []).map((behavior) => [behavior.id, behavior]),
  );
  const preconditions = buildRestoreRowPreconditions({
    preview: input.preview,
    existing: input.existing,
    behaviorIdByExternal,
    scheduleIdByExternal,
    occurrenceIdByExternal,
    statusEventIdByExternal,
    noteIdByExternal,
    interventionIdByExternal,
  });

  return {
    payload: {
      preconditions,
      archive_behavior_ids: input.preview.actions.behaviors
        .filter((action) => action.action === "archive")
        .map(requiredLocalId),
      delete_schedule_ids: input.preview.actions.schedules
        .filter((action) => action.action === "delete")
        .map(requiredLocalId),
      delete_occurrence_ids: input.preview.actions.occurrences
        .filter((action) => action.action === "delete")
        .map(requiredLocalId),
      delete_status_event_ids: [],
      clear_occurrence_note_ids: input.preview.actions.inlineOccurrenceNotes
        .filter((action) => action.action === "delete")
        .map(requiredLocalId),
      delete_imported_note_ids: input.preview.actions.importedNotes
        .filter((action) => action.action === "delete")
        .map(requiredLocalId),
      delete_imported_intervention_ids:
        input.preview.actions.importedInterventions
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

          const definition = normalizeBehaviorDefinition({
            title: behavior.title,
            description: behavior.description,
          });
          const action = actionIndex.behavior.get(behavior.externalId);
          const behaviorId = requiredMapValue(
            behaviorIdByExternal,
            behavior.externalId,
            "restored behavior",
          );
          const definitionEvent =
            behaviorDefinitionEventByBehaviorId.get(behaviorId);
          const existingBehavior = existingBehaviorById.get(behaviorId);

          if (!definitionEvent && !existingBehavior) {
            throw new BehaviorLogRestoreUserError(
              `Behavior ${behavior.externalId} cannot be restored without an initial definition event.`,
            );
          }

          return {
            id: behaviorId,
            external_id: behavior.externalId,
            category_id: null,
            title:
              definitionEvent?.next_title ??
              existingBehavior?.title ??
              definition.title,
            description:
              definitionEvent?.next_description ??
              existingBehavior?.description ??
              definition.description,
            recurrence_rule: toCadenceRecurrenceRule(primarySchedule),
            scheduled_time:
              primarySchedule.localTime ?? primarySchedule.windowStartLocal,
            timezone: primarySchedule.timezone || DEFAULT_TIMEZONE,
            browser_reminder_enabled:
              behavior.cadenceBrowserReminderEnabled ?? true,
            email_reminder_enabled: behavior.cadenceEmailReminderEnabled ?? false,
            reminder_offset_minutes: behavior.cadenceReminderOffsetMinutes ?? 0,
            active: behavior.archivedAtUtc
              ? false
              : behavior.cadenceActive ?? true,
            archived_at: behavior.archivedAtUtc,
            created_at:
              action?.action === "create"
                ? behavior.createdAtUtc ?? restoreRecordedAt
                : behavior.createdAtUtc,
          };
        }),
      behavior_definition_events: behaviorDefinitionEvents,
      schedules: input.importPreview.plan.schedules
        .filter((schedule) =>
          shouldUpsert(actionIndex.schedule.get(schedule.externalId)),
        )
        .map((schedule, index) => ({
          id: scheduleIdByExternal.get(schedule.externalId),
          external_id: schedule.externalId,
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
            (candidate) =>
              candidate.externalId === occurrence.scheduleExternalId,
          );

          if (!schedule) {
            throw new BehaviorLogRestoreUserError(
              `Occurrence ${occurrence.externalId} cannot be restored without its schedule.`,
            );
          }

          return {
            id: occurrenceIdByExternal.get(occurrence.externalId),
            external_id: occurrence.externalId,
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
                ? latestEvent?.effectiveAtUtc ??
                  latestEvent?.recordedAtUtc ??
                  null
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
        .filter(
          (event) =>
            actionIndex.status_event.get(event.externalId)?.action === "create",
        )
        .map((event) => ({
          id: statusEventIdByExternal.get(event.externalId),
          external_id: event.externalId,
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
          id: requiredMapValue(noteIdByExternal, note.externalId, "note id"),
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
          id: requiredMapValue(
            interventionIdByExternal,
            intervention.externalId,
            "intervention id",
          ),
          import_run_id: input.importRunId,
          external_id: intervention.externalId,
          behavior_external_id: intervention.behaviorExternalId,
          occurrence_external_id: intervention.occurrenceExternalId,
          behavior_id:
            behaviorIdByExternal.get(intervention.behaviorExternalId) ?? null,
          occurrence_id:
            occurrenceIdByExternal.get(intervention.occurrenceExternalId) ??
            null,
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
    },
    mappings,
  };
}

function buildRestoreRowPreconditions(input: {
  preview: BehaviorLogRestorePreview;
  existing: BehaviorLogExistingRecords;
  behaviorIdByExternal: Map<string, string>;
  scheduleIdByExternal: Map<string, string>;
  occurrenceIdByExternal: Map<string, string>;
  statusEventIdByExternal: Map<string, string>;
  noteIdByExternal: Map<string, string>;
  interventionIdByExternal: Map<string, string>;
}): RestoreRowPrecondition[] {
  const preconditions = new Map<string, RestoreRowPrecondition>();

  const add = (entry: RestoreRowPrecondition): void => {
    const key = `${entry.record_type}:${entry.local_id}`;
    const existing = preconditions.get(key);

    if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
      throw new BehaviorLogRestoreUserError(
        `Restore preview has conflicting preconditions for ${entry.record_type} ${entry.local_id}.`,
      );
    }

    preconditions.set(key, entry);
  };
  const addAction = (
    action: BehaviorLogRestoreAction,
    recordType: RestoreRowPrecondition["record_type"],
    createdIds: Map<string, string>,
    existingRows: Array<{ id: string; rowUpdatedAtUtc?: string | null }>,
  ): void => {
    if (action.action === "skip") {
      return;
    }

    if (action.action === "create") {
      if (!action.externalId) {
        throw new BehaviorLogRestoreUserError(
          `Restore create action for ${recordType} is missing its external id.`,
        );
      }

      add({
        record_type: recordType,
        local_id: requiredMapValue(
          createdIds,
          action.externalId,
          `${recordType} create precondition`,
        ),
        expectation: "absent",
        expected_updated_at: null,
      });
      return;
    }

    const localId = requiredLocalId(action);
    const existing = existingRows.find((row) => row.id === localId);
    const expectedUpdatedAt = existing?.rowUpdatedAtUtc;

    if (!existing || !expectedUpdatedAt) {
      throw new BehaviorLogRestoreUserError(
        `Local ${recordType} ${localId} is missing its restore concurrency marker. Preview the restore again.`,
      );
    }

    add({
      record_type: recordType,
      local_id: localId,
      expectation: "unchanged",
      expected_updated_at: expectedUpdatedAt,
    });
  };

  for (const action of input.preview.actions.behaviors) {
    addAction(
      action,
      "behavior",
      input.behaviorIdByExternal,
      input.existing.behaviors ?? [],
    );
  }

  for (const action of input.preview.actions.schedules) {
    addAction(
      action,
      "schedule",
      input.scheduleIdByExternal,
      input.existing.schedules ?? [],
    );
  }

  for (const action of input.preview.actions.occurrences) {
    addAction(
      action,
      "occurrence",
      input.occurrenceIdByExternal,
      input.existing.occurrences ?? [],
    );
  }

  for (const action of input.preview.actions.inlineOccurrenceNotes) {
    if (action.action === "skip" || action.action === "keep") {
      continue;
    }

    const localId = requiredLocalId(action);
    const existing = (input.existing.occurrences ?? []).find(
      (row) => row.id === localId,
    );

    if (!existing?.rowUpdatedAtUtc) {
      throw new BehaviorLogRestoreUserError(
        `Local occurrence ${localId} is missing its restore concurrency marker. Preview the restore again.`,
      );
    }

    add({
      record_type: "occurrence",
      local_id: localId,
      expectation: "unchanged",
      expected_updated_at: existing.rowUpdatedAtUtc,
    });
  }

  for (const action of input.preview.actions.statusEvents) {
    if (action.action !== "create") {
      continue;
    }

    addAction(
      action,
      "status_event",
      input.statusEventIdByExternal,
      input.existing.statusEvents ?? [],
    );
  }

  for (const action of input.preview.actions.importedNotes) {
    addAction(
      action,
      "note",
      input.noteIdByExternal,
      input.existing.importedNotes ?? [],
    );
  }

  for (const action of input.preview.actions.importedInterventions) {
    addAction(
      action,
      "intervention",
      input.interventionIdByExternal,
      input.existing.importedInterventions ?? [],
    );
  }

  return [...preconditions.values()].sort((left, right) =>
    `${left.record_type}:${left.local_id}`.localeCompare(
      `${right.record_type}:${right.local_id}`,
    ),
  );
}

function buildRestoreBehaviorDefinitionEvents(input: {
  behaviorPlans: BehaviorLogImportBehaviorPlan[];
  actionIndex: Map<string, BehaviorLogRestoreAction>;
  behaviorIdByExternal: Map<string, string>;
  existingBehaviors: NonNullable<BehaviorLogExistingRecords["behaviors"]>;
  restoreRecordedAt: string;
}): RestoreBehaviorDefinitionEventPayload[] {
  const existingById = new Map(
    input.existingBehaviors.map((behavior) => [behavior.id, behavior]),
  );
  const events: RestoreBehaviorDefinitionEventPayload[] = [];

  for (const behavior of input.behaviorPlans) {
    const action = input.actionIndex.get(behavior.externalId);

    if (!action || action.action === "skip" || action.action === "archive") {
      continue;
    }

    const behaviorId = requiredMapValue(
      input.behaviorIdByExternal,
      behavior.externalId,
      "definition event behavior",
    );
    const nextDefinition = normalizeBehaviorDefinition({
      title: behavior.title,
      description: behavior.description,
    });

    if (action.action === "create") {
      const plan = planInitialBehaviorDefinitionEvent({
        definition: nextDefinition,
        recordedAt: behavior.createdAtUtc ?? input.restoreRecordedAt,
        source: "import",
        reason: "behaviorlog_restore",
      });

      events.push(
        toRestoreBehaviorDefinitionEventPayload({
          behaviorId,
          eventKind: "baseline",
          plan,
          expectedPreviousDefinition: null,
        }),
      );
      continue;
    }

    if (action.action !== "replace") {
      continue;
    }

    const existing = existingById.get(behaviorId);

    if (!existing) {
      throw new BehaviorLogRestoreUserError(
        `Behavior ${behavior.externalId} cannot record restore history because its prior local definition is missing.`,
      );
    }

    const plan = planBehaviorDefinitionChangeEvent({
      previousDefinition: {
        title: existing.title,
        description: existing.description ?? null,
      },
      nextDefinition,
      recordedAt: input.restoreRecordedAt,
      source: "import",
      reason: "behaviorlog_restore",
    });

    if (!plan) {
      continue;
    }

    events.push(
      toRestoreBehaviorDefinitionEventPayload({
        behaviorId,
        eventKind: "transition",
        plan,
        expectedPreviousDefinition: {
          title: existing.title,
          description: existing.description ?? null,
        },
      }),
    );
  }

  return events;
}

function toRestoreBehaviorDefinitionEventPayload(input: {
  behaviorId: string;
  eventKind: "baseline" | "transition";
  plan: BehaviorDefinitionEventPlan;
  expectedPreviousDefinition: BehaviorDefinition | null;
}): RestoreBehaviorDefinitionEventPayload {
  return {
    event_kind: input.eventKind,
    behavior_id: input.behaviorId,
    previous_title: input.plan.previousTitle,
    next_title: input.plan.nextTitle,
    previous_description: input.plan.previousDescription,
    next_description: input.plan.nextDescription,
    changed_fields: input.plan.changedFields,
    recorded_at: input.plan.recordedAt,
    source: "import",
    reason: "behaviorlog_restore",
    expected_previous_title: input.expectedPreviousDefinition?.title ?? null,
    expected_previous_description:
      input.expectedPreviousDefinition?.description ?? null,
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

export function deriveBehaviorLogRestoreLocalId(
  action: BehaviorLogRestoreAction,
  input: {
    externalId: string;
    label: string;
    recordType: BehaviorLogImportRecordMappingInput["recordType"];
    userId: string;
    bundleFingerprint: string;
  },
): string {
  if (action.action === "create") {
    return deterministicRestoreUuid([
      "behaviorlog_restore",
      input.userId,
      input.bundleFingerprint,
      input.recordType,
      input.externalId,
    ]);
  }

  const id = action.localId;

  if (id && isUuid(id)) {
    return id;
  }

  if (!id || !isUuid(id)) {
    throw new BehaviorLogRestoreUserError(
      `Restore action for ${input.label} ${input.externalId} is missing a safe local id.`,
    );
  }

  return id;
}

function restoreMapping(
  input: {
    userId: string;
    importRunId: string;
  },
  recordType: BehaviorLogImportRecordMappingInput["recordType"],
  externalId: string,
  localId: string,
): BehaviorLogImportRecordMappingInput {
  return {
    userId: input.userId,
    importRunId: input.importRunId,
    recordType,
    externalId,
    localId,
  };
}

function deterministicRestoreUuid(parts: string[]): string {
  const bytes = Buffer.from(
    createHash("sha256").update(parts.join("\0")).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
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

  if (
    preview.summary.unsupportedActionCount > 0 ||
    preview.summary.skippedCount > 0
  ) {
    throw new BehaviorLogRestoreUserError(
      "Restore preview still contains skipped or unsupported actions.",
    );
  }

  if (
    preview.statusHistoryPolicy.selected !==
      "preserve_append_only_history" ||
    !preview.statusHistoryPolicy.applySupportedInThisTicket
  ) {
    throw new BehaviorLogRestoreUserError(
      "The selected status-history policy is preview-only and cannot be applied.",
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
  archiveFingerprint: string,
): asserts run is BehaviorLogImportRun {
  if (!run || run.import_mode !== "restore_preview" || run.status !== "previewed") {
    throw new BehaviorLogRestoreUserError(
      "Preview the BehaviorLog restore again before applying.",
    );
  }

  const summary = readObject(run.dry_run_summary);

  if (
    readString(summary?.previewFingerprint) !== previewFingerprint ||
    readString(summary?.localDataFingerprint) !== localDataFingerprint ||
    readString(summary?.archiveFingerprint) !== archiveFingerprint
  ) {
    throw new BehaviorLogRestoreUserError(
      "Restore preview no longer matches the accepted preview run.",
    );
  }

  assertAcceptedRestorePreviewSnapshotCanApply(summary);
}

function assertAcceptedRestorePreviewSnapshotCanApply(
  snapshot: Record<string, unknown> | null,
): void {
  const summary = readObject(snapshot?.summary);
  const policy = readObject(snapshot?.statusHistoryPolicy);
  const errors = Array.isArray(snapshot?.errors) ? snapshot.errors : null;

  if (
    snapshot?.mode !== "restore_preview" ||
    snapshot.valid !== true ||
    snapshot.errorCount !== 0 ||
    !errors ||
    errors.length !== 0 ||
    summary?.unsupportedActionCount !== 0 ||
    summary.skippedCount !== 0
  ) {
    throw new BehaviorLogRestoreUserError(
      "The accepted restore preview is not safe to apply. Preview the restore again.",
    );
  }

  if (
    policy?.selected !== "preserve_append_only_history" ||
    policy.applySupportedInThisTicket !== true
  ) {
    throw new BehaviorLogRestoreUserError(
      "The accepted status-history policy is preview-only and cannot be applied.",
    );
  }
}

function assertArchiveMatchesAcceptedPreview(
  archiveFingerprint: string,
  acceptedArchiveFingerprint: string,
): string {
  if (archiveFingerprint !== acceptedArchiveFingerprint) {
    throw new BehaviorLogRestoreUserError(
      "The uploaded bundle no longer matches the accepted restore preview. Preview the restore again.",
    );
  }

  return archiveFingerprint;
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
  void supabase;

  try {
    return await requireCurrentUserId("Sign in again before restoring data.");
  } catch {
    throw new BehaviorLogRestoreAuthError();
  }
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
    throw new BehaviorLogRestoreUserError(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
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
    throw new BehaviorLogRestoreUserError(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
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
      archiveFingerprint: createHash("sha256")
        .update(input.zip)
        .digest("hex"),
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

function normalizeRestoreRpcResult(
  data: unknown,
  fallbackRun: BehaviorLogImportRun,
): {
  alreadyApplied: boolean;
  appliedRun: BehaviorLogRestoreRunView;
  appliedCounts: Record<string, number>;
} {
  const value = readObject(data);

  return {
    alreadyApplied: value?.already_applied === true,
    appliedRun: {
      id: readString(value?.applied_run_id) ?? fallbackRun.id,
      mode: "restore_apply",
      status: "applied",
      startedAt:
        readString(value?.applied_run_started_at) ?? fallbackRun.started_at,
      completedAt:
        readString(value?.applied_run_completed_at) ?? fallbackRun.completed_at,
      failureMessage: null,
    },
    appliedCounts: normalizeRpcResult(data),
  };
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
