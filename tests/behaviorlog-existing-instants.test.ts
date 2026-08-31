import { describe, expect, it } from "vitest";
import { planBehaviorLogImportWrite } from "@cadence/core/services/behaviorlog-import-plan";
import { existingRecords } from "@cadence/core/services/behaviorlog-write-plan";
import { resolveBehaviorLogImportMergePreview } from "@cadence/core/resolvers/behaviorlog-import.resolver";
import type { PortabilitySnapshot } from "@cadence/core/types/portability-rows";
import { emptyPortabilitySnapshot, fixtureIds, portabilityApplyRun, richPortabilityFiles, PORTABILITY_NOW } from "./helpers/portability-fixture";
import { behaviorLog03Files } from "./helpers/behaviorlog-03-fixture";

function snapshot(files = richPortabilityFiles()): PortabilitySnapshot {
  const empty = emptyPortabilitySnapshot();
  const preview = resolveBehaviorLogImportMergePreview({ files, existing: existingRecords(empty) });
  const plan = planBehaviorLogImportWrite({ snapshot: empty, applyRun: portabilityApplyRun(), now: PORTABILITY_NOW,
    newId: fixtureIds(), preview, mode: "merge_by_user_approved_plan", interventionRulesPresent: true });
  return { ...empty, graphs: plan.graphWrites.map(({ graph }) => ({ ...graph, revision: 0 })),
    categories: plan.categoryCreates, definitionEvents: plan.definitionEvents,
    configurationEvents: plan.graphWrites.flatMap((write) => write.configurationEvents),
    occurrences: plan.occurrenceWrites.map(({ next }) => next), statusEvents: plan.statusEvents,
    timeSessions: plan.timeSessionWrites.map(({ next }) => next), importedNotes: plan.importedNoteWrites.map(({ next }) => next),
    importedInterventions: plan.importedInterventionWrites.map(({ next }) => next),
    mappings: plan.mappings };
}

describe("portable existing-record instant identity", () => {
  it("uses the current configuration period instead of the original Behavior creation date", () => {
    const source = snapshot(behaviorLog03Files());
    const baseline = source.configurationEvents[0];
    expect(source.graphs[0].behavior.created_at).not.toBe(baseline.effective_at);
    expect(existingRecords(source).schedules?.[0].activeFromLocalDate).toBe(baseline.effective_local_date);
    source.configurationEvents.push({ ...baseline, id: "later-category", event_kind: "revision",
      changed_fields: ["category_id"], recorded_at: "2026-08-30T16:00:00Z",
      effective_at: "2026-08-30T16:00:00Z", effective_local_date: "2026-08-30" });
    expect(existingRecords(source).schedules?.[0].activeFromLocalDate).toBe(baseline.effective_local_date);
    source.graphs[0].behavior.active = false;
    source.graphs[0].behavior.archived_at = "2026-08-31T16:00:00Z";
    source.configurationEvents.push({ ...baseline, id: "later-archive", event_kind: "revision",
      changed_fields: ["active"], recorded_at: "2026-08-31T16:00:00Z",
      effective_at: "2026-08-31T16:00:00Z", effective_local_date: "2026-08-31" });
    expect(existingRecords(source).schedules?.[0]).toMatchObject({
      activeFromLocalDate: "2026-08-31", activeUntilLocalDate: "2026-08-31",
    });
  });

  it("keeps native observation identity instead of coercing it into a pending browser cue", () => {
    const source = snapshot(behaviorLog03Files());
    expect(existingRecords(source).importedInterventions).toEqual([expect.objectContaining({ channel: "other", deliveryStatus: "delivered" })]);
    source.importedInterventions[0].channel = "unsupported";
    expect(() => existingRecords(source)).toThrow("unsupported channel");
    source.importedInterventions[0].channel = "other";
    source.importedInterventions[0].delivery_status = "unsupported";
    expect(() => existingRecords(source)).toThrow("unsupported delivery status");
  });

  it("compares a historical saved slot snapshot independently of the current slot graph", () => {
    const source = snapshot();
    source.occurrences[0].schedule_kind = "range";
    source.occurrences[0].schedule_preset = "morning";
    source.occurrences[0].schedule_start_time = "06:00:00";
    source.occurrences[0].schedule_end_time = "12:00:00";
    expect(existingRecords(source).occurrences?.[0].scheduleSnapshot).toEqual({
      kind: "range", preset: "morning", startTime: "06:00", endTime: "12:00",
    });
  });

  it("gives equivalent PostgREST offsets and SQLite instants the same comparison identity", () => {
    const source = snapshot();
    const postgres: PortabilitySnapshot = JSON.parse(JSON.stringify(source).replace(/Z"/g, '+00:00"'));
    const identity = (value: unknown) => JSON.parse(JSON.stringify(value, (key, field) => key === "rowUpdatedAtUtc" ? undefined : field));
    expect(identity(existingRecords(postgres))).toEqual(identity(existingRecords(source)));
  });

  it("preserves subsecond precision and raw stale-row guards", () => {
    const source = snapshot();
    source.occurrences[0].scheduled_for = "2026-05-01T18:00:00.123456-04:00";
    source.occurrences[0].updated_at = "2026-06-08T16:00:00.987654+00:00";
    const existing = existingRecords(source);
    expect(existing.occurrences?.[0].scheduledForUtc).toBe("2026-05-01T22:00:00.123456Z");
    expect(existing.occurrences?.[0].rowUpdatedAtUtc).toBe(source.occurrences[0].updated_at);
  });
});
