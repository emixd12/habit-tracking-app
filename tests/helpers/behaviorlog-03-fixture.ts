import { Temporal } from "@js-temporal/polyfill";
import { assembleExportBundle, type ExportAssemblyInput } from "@cadence/core/services/export-assembly";
import { BEHAVIOR_ID, USER_ID, storedBehavior, storedConfigurationEvent, storedExportOccurrence } from "./export-row-fixture";

/** Synthetic native export shared by the real SQLite and Postgres contracts. */
export function behaviorLog03Files() {
  const baseline = storedConfigurationEvent();
  const revision = { ...baseline, id: "configuration-2", event_kind: "revision",
    previous_configuration: baseline.next_configuration,
    next_configuration: { ...baseline.next_configuration, reminder_offset_minutes: 15 },
    changed_fields: ["reminder_offset_minutes"], recorded_at: "2026-06-01T12:00:00Z",
    effective_at: "2026-06-01T12:00:00Z", effective_local_date: "2026-06-01",
    source: "manual", reason_code: "behavior_edited", created_at: "2026-06-01T12:00:00Z" };
  const past = { ...storedExportOccurrence(), scheduled_for: "2026-05-02T02:00:00Z",
    status: "completed", completed_at: "2026-05-02T02:01:00Z", status_marked_at: "2026-05-02T02:01:00Z",
    note: "Private imported context", updated_at: "2026-05-02T02:01:00Z" };
  const future = { ...storedExportOccurrence(), id: "44444444-4444-4444-8444-444444444444",
    behavior_configuration_event_id: null, scheduled_for: "2026-09-02T02:00:00Z", local_date: "2026-09-01",
    status: "not_completed", status_marked_at: "2026-08-30T11:00:00Z", note: "Private future context",
    updated_at: "2026-08-30T11:00:00Z" };
  const input: ExportAssemblyInput = {
    userId: USER_ID, timezone: "America/New_York", now: Temporal.Instant.from("2026-08-30T12:00:00Z"),
    range: "all", includeNotes: true, includeTimeTracking: true,
    categories: [{ id: "unused-source-category", name: "Imported unused category", sort_order: 99,
      created_at: baseline.created_at, updated_at: baseline.created_at }],
    behaviors: [{ ...storedBehavior(), current_configuration_event_id: revision.id,
      reminder_offset_minutes: 15, updated_at: revision.created_at }],
    behaviorDefinitionEvents: [], behaviorConfigurationEvents: [baseline, revision], occurrences: [past, future],
    statusEvents: [past, future].map((occurrence, index) => ({ id: `source-status-${index}`,
      occurrence_id: occurrence.id, behavior_id: BEHAVIOR_ID, local_date: occurrence.local_date,
      timezone: "America/New_York", previous_status: "unresolved", status: occurrence.status,
      status_semantics: "explicit_user_mark", recorded_at: occurrence.status_marked_at!, effective_at: occurrence.status_marked_at!,
      revises_event_id: null, reason_code: null, source_capture_method: "manual_tap", source_confidence: "high",
      created_at: occurrence.status_marked_at!, updated_at: occurrence.status_marked_at! })),
    reminderDeliveries: [],
    timeSessions: [{ id: "source-timing", behavior_id: BEHAVIOR_ID, occurrence_id: past.id,
      started_at: "2026-05-02T01:59:00Z", stopped_at: "2026-05-02T02:00:00Z" }],
    nativeReminders: [{ id: "source-native-observation", occurrenceId: past.id, requestId: `cadence.local.${past.id}`,
      fireAt: past.scheduled_for, status: "delivered", verifiedAt: "2026-05-02T02:00:01Z",
      createdAt: baseline.created_at, updatedAt: "2026-05-02T02:00:01Z" }],
  };
  return assembleExportBundle(input).behaviorLog.files;
}
