import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyOccurrenceStatusTransitionRpc } from "@/lib/db/occurrenceStatusEvents.repo";
import type { Occurrence, OccurrenceStatusEvent } from "@/lib/types/database";

const rpc = vi.fn();
const SUPABASE = { rpc } as never;
const NOW = "2026-06-08T14:30:00Z";

describe("applyOccurrenceStatusTransitionRpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the resolver plan to the transactional RPC and normalizes its result", async () => {
    const occurrence = buildOccurrence({
      status: "completed",
      completedAt: NOW,
      statusMarkedAt: NOW,
    });
    const statusEvent = buildStatusEvent();

    rpc.mockResolvedValue({
      data: {
        status_changed: true,
        concurrent_duplicate: false,
        occurrence,
        status_event: statusEvent,
      },
      error: null,
    });

    await expect(
      applyOccurrenceStatusTransitionRpc(SUPABASE, {
        occurrenceId: "occurrence-1",
        expectedStatus: "unresolved",
        expectedLatestEventId: null,
        status: "completed",
        completedAt: NOW,
        statusMarkedAt: NOW,
        cancelPendingReminders: true,
        event: {
          statusSemantics: "explicit_user_mark",
          recordedAt: NOW,
          effectiveAt: NOW,
          sourceCaptureMethod: "manual_tap",
          sourceConfidence: "high",
        },
      }),
    ).resolves.toEqual({
      statusChanged: true,
      concurrentDuplicate: false,
      occurrence,
      statusEvent,
    });

    expect(rpc).toHaveBeenCalledWith("apply_occurrence_status_transition", {
      target_occurrence_id: "occurrence-1",
      expected_status: "unresolved",
      expected_latest_event_id: null,
      planned_status: "completed",
      planned_completed_at: NOW,
      planned_status_marked_at: NOW,
      planned_event_semantics: "explicit_user_mark",
      planned_event_recorded_at: NOW,
      planned_event_effective_at: NOW,
      planned_event_source_capture_method: "manual_tap",
      planned_event_source_confidence: "high",
      planned_cancel_pending_reminders: true,
    });
  });

  it("passes a concurrent transition plan and returns its serialized duplicate", async () => {
    const occurrence = buildOccurrence({
      status: "completed",
      completedAt: "2026-06-07T12:00:00Z",
      statusMarkedAt: "2026-06-07T12:00:00Z",
    });

    rpc.mockResolvedValue({
      data: {
        status_changed: false,
        concurrent_duplicate: true,
        occurrence,
        status_event: null,
      },
      error: null,
    });

    await expect(
      applyOccurrenceStatusTransitionRpc(SUPABASE, {
        occurrenceId: occurrence.id,
        expectedStatus: "unresolved",
        expectedLatestEventId: null,
        status: "completed",
        completedAt: NOW,
        statusMarkedAt: NOW,
        cancelPendingReminders: true,
        event: {
          statusSemantics: "explicit_user_mark",
          recordedAt: NOW,
          effectiveAt: NOW,
          sourceCaptureMethod: "manual_tap",
          sourceConfidence: "high",
        },
      }),
    ).resolves.toEqual({
      statusChanged: false,
      concurrentDuplicate: true,
      occurrence,
      statusEvent: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      "apply_occurrence_status_transition",
      expect.objectContaining({
        expected_latest_event_id: null,
        planned_event_semantics: "explicit_user_mark",
        planned_event_recorded_at: NOW,
        planned_event_effective_at: NOW,
        planned_event_source_capture_method: "manual_tap",
        planned_event_source_confidence: "high",
        planned_cancel_pending_reminders: true,
      }),
    );
  });

  it("surfaces RPC failures without accepting a partial payload", async () => {
    const failure = new Error("status event insert failed");

    rpc.mockResolvedValue({ data: null, error: failure });

    await expect(
      applyOccurrenceStatusTransitionRpc(SUPABASE, {
        occurrenceId: "occurrence-1",
        expectedStatus: "unresolved",
        expectedLatestEventId: null,
        status: "completed",
        completedAt: NOW,
        statusMarkedAt: NOW,
        cancelPendingReminders: true,
        event: {
          statusSemantics: "explicit_user_mark",
          recordedAt: NOW,
          effectiveAt: NOW,
          sourceCaptureMethod: "manual_tap",
          sourceConfidence: "high",
        },
      }),
    ).rejects.toThrow(failure);
  });

  it("rejects malformed RPC success payloads", async () => {
    rpc.mockResolvedValue({
      data: {
        status_changed: true,
        concurrent_duplicate: false,
        occurrence: null,
        status_event: null,
      },
      error: null,
    });

    await expect(
      applyOccurrenceStatusTransitionRpc(SUPABASE, {
        occurrenceId: "occurrence-1",
        expectedStatus: "unresolved",
        expectedLatestEventId: null,
        status: "completed",
        completedAt: NOW,
        statusMarkedAt: NOW,
        cancelPendingReminders: true,
        event: null,
      }),
    ).rejects.toThrow(
      "Occurrence status transition returned an invalid payload.",
    );
  });
});

function buildOccurrence(input: {
  status: "unresolved" | "completed" | "not_completed";
  completedAt: string | null;
  statusMarkedAt: string | null;
}): Occurrence {
  return {
    id: "occurrence-1",
    user_id: "user-1",
    behavior_id: "behavior-1",
    behavior_schedule_slot_id: "slot-1",
    scheduled_for: "2026-06-08T14:00:00Z",
    local_date: "2026-06-08",
    schedule_kind: "exact",
    schedule_preset: null,
    schedule_start_time: "10:00:00",
    schedule_end_time: null,
    status: input.status,
    completed_at: input.completedAt,
    status_marked_at: input.statusMarkedAt,
    note: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: NOW,
  };
}

function buildStatusEvent(): OccurrenceStatusEvent {
  return {
    id: "status-event-1",
    user_id: "user-1",
    occurrence_id: "occurrence-1",
    behavior_id: "behavior-1",
    previous_status: "unresolved",
    status: "completed",
    status_semantics: "explicit_user_mark",
    recorded_at: NOW,
    effective_at: NOW,
    local_date: "2026-06-08",
    timezone: "America/New_York",
    source_capture_method: "manual_tap",
    source_confidence: "high",
    revises_event_id: null,
    reason_code: null,
    created_at: NOW,
    updated_at: NOW,
  };
}
