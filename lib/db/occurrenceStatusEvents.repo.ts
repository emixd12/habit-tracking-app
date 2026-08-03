import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import type {
  NewOccurrenceStatusEvent,
  Occurrence,
  OccurrenceStatus,
  OccurrenceStatusEvent,
} from "@/lib/types/database";

export type ApplyOccurrenceStatusTransitionRpcInput = {
  occurrenceId: string;
  expectedStatus: OccurrenceStatus;
  expectedLatestEventId: string | null;
  status: OccurrenceStatus;
  completedAt: string | null;
  statusMarkedAt: string | null;
  cancelPendingReminders: boolean;
  event: {
    statusSemantics: "explicit_user_mark" | "explicit_user_correction";
    recordedAt: string;
    effectiveAt: string | null;
    sourceCaptureMethod: "manual_tap";
    sourceConfidence: "high";
  } | null;
};

export type ApplyOccurrenceStatusTransitionRpcResult = {
  statusChanged: boolean;
  concurrentDuplicate: boolean;
  occurrence: Occurrence;
  statusEvent: OccurrenceStatusEvent | null;
};

type OccurrenceStatusTransitionRpcClient = {
  rpc: (
    fn: "apply_occurrence_status_transition",
    args: {
      target_occurrence_id: string;
      expected_status: OccurrenceStatus;
      expected_latest_event_id: string | null;
      planned_status: OccurrenceStatus;
      planned_completed_at: string | null;
      planned_status_marked_at: string | null;
      planned_event_semantics:
        | "explicit_user_mark"
        | "explicit_user_correction"
        | null;
      planned_event_recorded_at: string | null;
      planned_event_effective_at: string | null;
      planned_event_source_capture_method: "manual_tap" | null;
      planned_event_source_confidence: "high" | null;
      planned_cancel_pending_reminders: boolean;
    },
  ) => Promise<{ data: unknown; error: unknown }>;
};

const STALE_OCCURRENCE_STATUS_MESSAGE =
  "Occurrence status changed. Review the latest status and try again.";
const STALE_OCCURRENCE_STATUS_RPC_MESSAGES = new Set([
  "Occurrence status changed concurrently. Review the latest status and try again.",
  "Occurrence status history changed concurrently. Review the latest status and try again.",
]);

export async function applyOccurrenceStatusTransitionRpc(
  supabase: AppSupabaseClient,
  input: ApplyOccurrenceStatusTransitionRpcInput,
): Promise<ApplyOccurrenceStatusTransitionRpcResult> {
  const { data, error } = await (
    supabase as unknown as OccurrenceStatusTransitionRpcClient
  ).rpc("apply_occurrence_status_transition", {
    target_occurrence_id: input.occurrenceId,
    expected_status: input.expectedStatus,
    expected_latest_event_id: input.expectedLatestEventId,
    planned_status: input.status,
    planned_completed_at: input.completedAt,
    planned_status_marked_at: input.statusMarkedAt,
    planned_event_semantics: input.event?.statusSemantics ?? null,
    planned_event_recorded_at: input.event?.recordedAt ?? null,
    planned_event_effective_at: input.event?.effectiveAt ?? null,
    planned_event_source_capture_method:
      input.event?.sourceCaptureMethod ?? null,
    planned_event_source_confidence: input.event?.sourceConfidence ?? null,
    planned_cancel_pending_reminders: input.cancelPendingReminders,
  });

  if (error) {
    throw normalizeStatusTransitionRpcError(error);
  }

  return normalizeStatusTransitionRpcResult(data);
}

export async function createOccurrenceStatusEvent(
  supabase: AppSupabaseClient,
  event: NewOccurrenceStatusEvent,
): Promise<OccurrenceStatusEvent> {
  const { data, error } = await supabase
    .from("occurrence_status_events")
    .insert(event)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getOccurrenceStatusEventByImportFingerprint(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    occurrenceId: string;
    recordedAt: string;
    status: string;
  },
): Promise<OccurrenceStatusEvent | null> {
  const { data, error } = await supabase
    .from("occurrence_status_events")
    .select("*")
    .eq("user_id", input.userId)
    .eq("occurrence_id", input.occurrenceId)
    .eq("recorded_at", input.recordedAt)
    .eq("status", input.status)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listOccurrenceStatusEventsByOccurrenceIds(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceIds: string[],
): Promise<OccurrenceStatusEvent[]> {
  if (occurrenceIds.length === 0) {
    return [];
  }

  return measurePerformanceSpan(
    {
      span: "db.list_occurrence_status_events_by_occurrence_ids",
      counts: (events) => ({
        status_events: events.length,
        occurrences: occurrenceIds.length,
      }),
    },
    async () => {
      const { data, error } = await supabase
        .from("occurrence_status_events")
        .select("*")
        .eq("user_id", userId)
        .in("occurrence_id", occurrenceIds)
        .order("recorded_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  );
}

export async function getLatestOccurrenceStatusEventForOccurrence(
  supabase: AppSupabaseClient,
  userId: string,
  occurrenceId: string,
): Promise<OccurrenceStatusEvent | null> {
  const { data, error } = await supabase
    .from("occurrence_status_events")
    .select("*")
    .eq("user_id", userId)
    .eq("occurrence_id", occurrenceId)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

function normalizeStatusTransitionRpcError(error: unknown): Error {
  if (
    isRecord(error) &&
    error.code === "P0001" &&
    typeof error.message === "string" &&
    STALE_OCCURRENCE_STATUS_RPC_MESSAGES.has(error.message)
  ) {
    return new Error(STALE_OCCURRENCE_STATUS_MESSAGE);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Unable to update this occurrence.");
}

function normalizeStatusTransitionRpcResult(
  value: unknown,
): ApplyOccurrenceStatusTransitionRpcResult {
  if (!isRecord(value) || !isRecord(value.occurrence)) {
    throw new Error(
      "Occurrence status transition returned an invalid payload.",
    );
  }

  if (
    typeof value.status_changed !== "boolean" ||
    typeof value.concurrent_duplicate !== "boolean" ||
    typeof value.occurrence.id !== "string" ||
    typeof value.occurrence.status !== "string"
  ) {
    throw new Error(
      "Occurrence status transition returned an invalid payload.",
    );
  }

  const statusEvent = value.status_event;

  if (statusEvent !== null && !isRecord(statusEvent)) {
    throw new Error(
      "Occurrence status transition returned an invalid payload.",
    );
  }

  return {
    statusChanged: value.status_changed,
    concurrentDuplicate: value.concurrent_duplicate,
    occurrence: value.occurrence as unknown as Occurrence,
    statusEvent: statusEvent as OccurrenceStatusEvent | null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
