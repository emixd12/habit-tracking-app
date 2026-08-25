import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { Json } from "@/lib/db/database.types";
import { readAllPostgrestRows } from "@/lib/db/paginated-read";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import type {
  BehaviorLogImportRecordMappingInput,
  BehaviorLogImportRunCreateInput,
  BehaviorLogImportRunStatusUpdateInput,
} from "@/lib/types/behaviorlog-import";
import type {
  BehaviorLogImportRecordMapping,
  BehaviorLogImportRun,
  NewBehaviorLogImportRecordMapping,
  NewBehaviorLogImportRun,
} from "@/lib/types/database";

type RestorePayloadBindingRpcClient = {
  rpc: (
    fn: "bind_behaviorlog_restore_apply_payload",
    args: { restore_payload: Record<string, unknown> },
  ) => Promise<{ data: unknown; error: Error | null }>;
};

export async function bindBehaviorLogRestoreApplyPayload(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    importRunId: string;
    restorePayload: Record<string, unknown>;
  },
): Promise<string> {
  if (
    input.restorePayload.apply_run_id !== input.importRunId ||
    typeof input.restorePayload.accepted_preview_run_id !== "string"
  ) {
    throw new Error("Restore payload identity does not match its apply ledger.");
  }

  const { data, error } = await (
    supabase as unknown as RestorePayloadBindingRpcClient
  ).rpc("bind_behaviorlog_restore_apply_payload", {
    restore_payload: input.restorePayload,
  });

  if (error) {
    throw error;
  }

  if (typeof data !== "string" || !/^[0-9a-f]{64}$/u.test(data)) {
    throw new Error("Restore apply payload digest could not be bound.");
  }

  return data;
}

export async function createBehaviorLogImportRun(
  supabase: AppSupabaseClient,
  input: BehaviorLogImportRunCreateInput,
): Promise<BehaviorLogImportRun> {
  const { data, error } = await supabase
    .from("behaviorlog_import_runs")
    .insert(toImportRunInsert(input))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getBehaviorLogImportRunById(
  supabase: AppSupabaseClient,
  userId: string,
  importRunId: string,
): Promise<BehaviorLogImportRun | null> {
  const { data, error } = await supabase
    .from("behaviorlog_import_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", importRunId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function getAppliedBehaviorLogRestoreRunByAcceptedPreview(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    acceptedPreviewRunId: string;
    acceptedPreviewFingerprint: string;
  },
): Promise<BehaviorLogImportRun | null> {
  const { data, error } = await supabase
    .from("behaviorlog_import_runs")
    .select("*")
    .eq("user_id", input.userId)
    .eq("import_mode", "restore_apply")
    .eq("status", "applied")
    .eq("accepted_preview_run_id", input.acceptedPreviewRunId)
    .eq("accepted_preview_fingerprint", input.acceptedPreviewFingerprint)
    .order("completed_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listBehaviorLogImportRuns(
  supabase: AppSupabaseClient,
  userId: string,
  limit = 10,
): Promise<BehaviorLogImportRun[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_behaviorlog_import_runs",
      counts: (runs) => ({ import_runs: runs.length }),
    },
    async () => {
      const { data, error } = await supabase
        .from("behaviorlog_import_runs")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  );
}

export async function updateBehaviorLogImportRunStatus(
  supabase: AppSupabaseClient,
  input: BehaviorLogImportRunStatusUpdateInput,
): Promise<BehaviorLogImportRun | null> {
  const { data, error } = await supabase
    .from("behaviorlog_import_runs")
    .update({
      status: input.status,
      failure_message: input.failureMessage ?? null,
      completed_at: input.completedAt ?? null,
    })
    .eq("user_id", input.userId)
    .eq("id", input.importRunId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function markBehaviorLogRestoreRunFailedIfPending(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    importRunId: string;
    failureMessage: string;
    completedAt: string;
  },
): Promise<BehaviorLogImportRun | null> {
  const { data, error } = await supabase
    .from("behaviorlog_import_runs")
    .update({
      status: "failed",
      failure_message: input.failureMessage,
      completed_at: input.completedAt,
    })
    .eq("user_id", input.userId)
    .eq("id", input.importRunId)
    .eq("import_mode", "restore_apply")
    .eq("status", "previewed")
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function createBehaviorLogImportRecordMappings(
  supabase: AppSupabaseClient,
  mappings: BehaviorLogImportRecordMappingInput[],
): Promise<void> {
  if (mappings.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("behaviorlog_import_record_mappings")
    .upsert(mappings.map(toMappingInsert), {
      onConflict: "import_run_id,record_type,external_id",
      ignoreDuplicates: true,
    });

  if (error) {
    throw error;
  }
}

export async function listBehaviorLogImportRecordMappingsByRun(
  supabase: AppSupabaseClient,
  userId: string,
  importRunId: string,
): Promise<BehaviorLogImportRecordMapping[]> {
  return readAllPostgrestRows<BehaviorLogImportRecordMapping>({
    label: "BehaviorLog import record mappings",
    getRowKey: (mapping) => mapping.id,
    createQuery: () =>
      supabase
        .from("behaviorlog_import_record_mappings")
        .select("*")
        .eq("user_id", userId)
        .eq("import_run_id", importRunId)
        .order("record_type", { ascending: true })
        .order("external_id", { ascending: true })
        .order("id", { ascending: true }),
  });
}

export async function listBehaviorLogImportRecordMappings(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<BehaviorLogImportRecordMapping[]> {
  return readAllPostgrestRows<BehaviorLogImportRecordMapping>({
    label: "BehaviorLog import record mappings",
    getRowKey: (mapping) => mapping.id,
    createQuery: () =>
      supabase
        .from("behaviorlog_import_record_mappings")
        .select("*")
        .eq("user_id", userId)
        .order("record_type", { ascending: true })
        .order("external_id", { ascending: true })
        .order("import_run_id", { ascending: true })
        .order("id", { ascending: true }),
  });
}

function toImportRunInsert(
  input: BehaviorLogImportRunCreateInput,
): NewBehaviorLogImportRun {
  return {
    user_id: input.userId,
    bundle_format: input.bundleFormat,
    schema_version: input.schemaVersion,
    manifest_sha256: input.manifestSha256,
    bundle_fingerprint: input.bundleFingerprint,
    accepted_preview_run_id: input.acceptedPreviewRunId ?? null,
    accepted_preview_fingerprint: input.acceptedPreviewFingerprint ?? null,
    producer_name: input.producerName,
    producer_version: input.producerVersion,
    subject_id_strategy: input.subjectIdStrategy,
    privacy_redaction_level: input.privacyRedactionLevel,
    import_mode: input.importMode,
    dry_run_summary: input.dryRunSummary as Json,
    status: input.status ?? "previewed",
    failure_message: input.failureMessage ?? null,
    started_at: input.startedAt ?? undefined,
    completed_at: input.completedAt ?? null,
  };
}

function toMappingInsert(
  input: BehaviorLogImportRecordMappingInput,
): NewBehaviorLogImportRecordMapping {
  return {
    user_id: input.userId,
    import_run_id: input.importRunId,
    record_type: input.recordType,
    external_id: input.externalId,
    local_id: input.localId,
  };
}
