import { Temporal } from "@js-temporal/polyfill";
import { assembleExportBundle } from "@cadence/core/services/export-assembly";
import type { PortabilityImportRunRow, PortabilitySnapshot } from "@cadence/core/types/portability-rows";
import { storedBehavior, storedConfigurationEvent, storedExportOccurrence, USER_ID } from "./export-row-fixture";
export const PORTABILITY_NOW = "2026-06-08T16:00:00Z";
export function portabilityFiles() {
  return assembleExportBundle({ userId: USER_ID, timezone: "America/New_York", now: Temporal.Instant.from(PORTABILITY_NOW), range: "all", categories: [], behaviors: [storedBehavior()], behaviorDefinitionEvents: [], behaviorConfigurationEvents: [storedConfigurationEvent()], occurrences: [storedExportOccurrence()], statusEvents: [], reminderDeliveries: [], timeSessions: [] }).behaviorLog.files;
}
export function emptyPortabilitySnapshot(): PortabilitySnapshot {
  return { revision: 0, profile: { id: USER_ID, email: "", display_name: null, timezone: "America/New_York", created_at: PORTABILITY_NOW, updated_at: PORTABILITY_NOW }, categories: [], graphs: [], definitionEvents: [], configurationEvents: [], occurrences: [], statusEvents: [], timeSessions: [], importRuns: [], mappings: [], importedNotes: [], importedInterventions: [] };
}
export function portabilityApplyRun(): PortabilityImportRunRow {
  return { id: "00000000-0000-4000-8000-000000000001", user_id: USER_ID, accepted_preview_run_id: "00000000-0000-4000-8000-000000000002", accepted_preview_fingerprint: "a".repeat(64), bundle_fingerprint: "b".repeat(64), bundle_format: "behaviorlog.bundle", completed_at: null, created_at: PORTABILITY_NOW, dry_run_summary: {}, failure_message: null, import_mode: "merge_by_user_approved_plan", manifest_sha256: null, privacy_redaction_level: null, producer_name: null, producer_version: null, schema_version: "0.1.0", started_at: PORTABILITY_NOW, status: "previewed", subject_id_strategy: null, updated_at: PORTABILITY_NOW };
}
export function fixtureIds() { let value = 100; return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`; }
export function richPortabilityFiles() {
  const occurrence = { ...storedExportOccurrence(), status: "completed", note: "Sensitive imported note", completed_at: "2026-05-01T22:00:00Z", status_marked_at: "2026-05-01T22:00:00Z" };
  return assembleExportBundle({ userId: USER_ID, timezone: "America/New_York", now: Temporal.Instant.from(PORTABILITY_NOW), range: "all", includeNotes: true, includeTimeTracking: true,
    categories: [], behaviors: [storedBehavior()], behaviorDefinitionEvents: [], behaviorConfigurationEvents: [storedConfigurationEvent()], occurrences: [occurrence],
    statusEvents: [{ id: "44444444-4444-4444-8444-444444444444", occurrence_id: occurrence.id, behavior_id: occurrence.behavior_id, previous_status: "unresolved", status: "completed", status_semantics: "explicit_user_mark", recorded_at: "2026-05-01T22:00:00Z", effective_at: "2026-05-01T22:00:00Z", local_date: occurrence.local_date, timezone: "America/New_York", source_capture_method: "manual_tap", source_confidence: "high", revises_event_id: null, reason_code: null, created_at: PORTABILITY_NOW, updated_at: PORTABILITY_NOW }], reminderDeliveries: [],
    timeSessions: [{ id: "55555555-5555-4555-8555-555555555555", occurrence_id: occurrence.id, behavior_id: occurrence.behavior_id, started_at: "2026-05-01T21:59:00Z", stopped_at: "2026-05-01T22:00:00Z" }] }).behaviorLog.files;
}
