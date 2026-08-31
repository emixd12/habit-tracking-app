import { Temporal } from "@js-temporal/polyfill";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleExportBundle, type ExportAssemblyInput } from "@cadence/core/services/export-assembly";
import { USER_ID, storedBehavior, storedConfigurationEvent, storedExportOccurrence } from "./helpers/export-row-fixture";
import { portabilityApplyRun } from "./helpers/portability-fixture";

const input: ExportAssemblyInput = {
  userId: USER_ID, timezone: "America/New_York", now: Temporal.Instant.from("2026-06-08T16:00:00Z"), range: "all",
  categories: [], behaviors: [storedBehavior()], behaviorDefinitionEvents: [],
  behaviorConfigurationEvents: [storedConfigurationEvent()], occurrences: [storedExportOccurrence()],
  statusEvents: [], reminderDeliveries: [], timeSessions: [],
};
function records(bundle: ReturnType<typeof assembleExportBundle>, path: string) {
  const text = bundle.behaviorLog.files.find((file) => file.path === path)?.content.trim();
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
}

function preservedExport(eventLists: Record<string, unknown>[][], originalLocalCapture = false) {
  const occurrence = { ...storedExportOccurrence(), behavior_configuration_event_id: null };
  const runs = eventLists.map((events, index) => ({ ...portabilityApplyRun(), id: `run-${index}`, status: "applied",
    dry_run_summary: JSON.parse(JSON.stringify({ portability: { version: 1, configurationEvents: events,
      occurrences: [{ externalId: "source-occurrence", behaviorExternalId: occurrence.behavior_id,
        configurationEventId: events[0].event_id, timezone: "America/New_York", localDate: occurrence.local_date,
        scheduledForUtc: occurrence.scheduled_for }] } })) }));
  const mappings = runs.flatMap((run) => [
    { record_type: "behavior", external_id: occurrence.behavior_id, local_id: occurrence.behavior_id },
    { record_type: "occurrence", external_id: "source-occurrence", local_id: occurrence.id },
  ].map((row, index) => ({ ...row, id: `${run.id}-${index}`, user_id: USER_ID, import_run_id: run.id, created_at: run.created_at })));
  return assembleExportBundle({ ...input, occurrences: [occurrence], importRuns: runs, importMappings: mappings,
    behaviorConfigurationEvents: [originalLocalCapture ? storedConfigurationEvent() :
      { ...storedConfigurationEvent(), source: "import", reason_code: "behaviorlog_import" }] });
}

describe("BehaviorLog complete portable export", () => {
  it("resolves exchanged history aliases without collapsing distinct source IDs lacking capture identity", () => {
    const original = records(assembleExportBundle(input), "data/behavior_configuration_events.jsonl")[0];
    delete original.source.original_id;
    const first = preservedExport([[original]]);
    const exchanged = records(first, "data/behavior_configuration_events.jsonl").find((row) => row.event_id.startsWith("cfg_import_"));
    // The reimported alias arrives first; equal ledger timestamps must not matter.
    const repeated = preservedExport([[exchanged], [original]]);
    const retained = records(repeated, "data/behavior_configuration_events.jsonl").filter((row) => row.event_id.startsWith("cfg_import_"));
    expect(retained).toHaveLength(1);
    expect(records(repeated, "data/occurrences.jsonl")[0].configuration_event_id).toBe(retained[0].event_id);
    expect(records(preservedExport([[original, { ...original, event_id: "distinct-source-event" }]]), "data/behavior_configuration_events.jsonl")
      .filter((row) => row.event_id.startsWith("cfg_import_"))).toHaveLength(2);
  });

  it("preserves conflicting capture provenance even when ledgers reuse the same source event ID", () => {
    const original = records(assembleExportBundle(input), "data/behavior_configuration_events.jsonl")[0];
    const different = { ...original, source: { ...original.source, producer: "Another source", original_id: "different-capture" } };
    const bundle = preservedExport([[original], [different]]);
    const retained = records(bundle, "data/behavior_configuration_events.jsonl").filter((row) => row.event_id.startsWith("cfg_import_"));
    expect(retained).toHaveLength(2);
    expect(new Set(retained.map((row) => row.event_id)).size).toBe(2);
    expect(retained.map((row) => row.source)).toEqual([original.source, different.source]);
    expect(records(bundle, "data/occurrences.jsonl")[0].configuration_event_id).toBe(retained[1].event_id);
  });

  it("recognizes its own local capture after importing a native self-export", () => {
    const original = records(assembleExportBundle(input), "data/behavior_configuration_events.jsonl")[0];
    const bundle = preservedExport([[original]], true);
    expect(records(bundle, "data/behavior_configuration_events.jsonl")).toEqual([original]);
    expect(records(bundle, "data/occurrences.jsonl")[0].configuration_event_id).toBe(original.event_id);
  });

  it("includes saved future decisions and notes in all-time backups", () => {
    const future = { ...storedExportOccurrence(), local_date: "2026-06-09", scheduled_for: "2026-06-10T02:00:00Z",
      status: "completed", completed_at: "2026-06-08T14:00:00Z", status_marked_at: "2026-06-08T14:00:00Z", note: "Prepare ahead" };
    const bundle = assembleExportBundle({ ...input, occurrences: [future], includeNotes: true });
    expect(bundle.jsonBackup.occurrences).toHaveLength(1);
    expect(records(bundle, "data/occurrences.jsonl")[0].current_status).toBe("completed");
    expect(records(bundle, "data/status_events.jsonl")).toHaveLength(1);
    expect(records(bundle, "data/notes.jsonl")[0].body_markdown).toBe("Prepare ahead");
    expect(assembleExportBundle({ ...input, range: "7", occurrences: [future] }).occurrenceCount).toBe(0);
  });

  it("exports standard configuration history, recurrence anchors, and category registries", () => {
    const bundle = assembleExportBundle({ ...input,
      categories: [{ id: "unused", name: "Unused category", sort_order: 3, created_at: "2026-05-01T12:00:00Z", updated_at: "2026-05-01T12:00:00Z" }],
    });
    const manifest = JSON.parse(bundle.behaviorLog.files[0].content);
    expect(manifest.schema_version).toBe("0.3.0-draft");
    expect(manifest.profiles).toContain("configuration_history");
    expect(manifest.extensions["app.cadence"].categories[0]).toMatchObject({ id: "unused", name: "Unused category", sort_order: 3 });
    const event = records(bundle, "data/behavior_configuration_events.jsonl")[0];
    expect(event).toMatchObject({ record_type: "behavior_configuration_event", event_id: "configuration-1", previous: null,
      next: { category: null, active: true, timezone: "America/New_York" },
      changed_fields: ["category", "schedules", "intervention_rules", "active", "timezone"],
    });
    expect(event.next.schedules[0]).toMatchObject({ anchor_local_date: "2026-05-01", recurrence: { type: "daily", interval: 1 } });
    expect(event.next.intervention_rules).toHaveLength(2);
    expect(records(bundle, "data/schedules.jsonl")[0]).toMatchObject({ anchor_local_date: "2026-05-01", schedule_role: "generating" });
    expect(records(bundle, "data/occurrences.jsonl")[0].configuration_event_id).toBe("configuration-1");
  });

  it("does not attribute an old reminder offset to the current rule", () => {
    const occurrence = storedExportOccurrence();
    const bundle = assembleExportBundle({ ...input,
      reminderDeliveries: [{ id: "old-offset", occurrence_id: occurrence.id, channel: "browser_push", status: "sent",
        scheduled_send_at: "2026-05-01T21:45:00Z", sent_at: "2026-05-01T21:45:00Z", error: null,
        processing_started_at: null, created_at: "2026-05-01T12:00:00Z", updated_at: "2026-05-01T21:45:00Z" }],
    });
    expect(records(bundle, "data/interventions.jsonl")[0]).not.toHaveProperty("rule_id");
    expect(records(bundle, "data/intervention_rules.jsonl")).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "email", enabled: false }),
    ]));
  });

  it("labels generated intent and approximate note timestamps", () => {
    const bundle = assembleExportBundle({ ...input, includeNotes: true, occurrences: [{ ...storedExportOccurrence(), note: "Context" }] });
    const behavior = records(bundle, "data/behaviors.jsonl")[0];
    expect(behavior.source.capture_method).toBe("system_generated");
    expect(behavior.source.transformation_notes).toContain("success_definition");
    expect(records(bundle, "data/notes.jsonl")[0].source.transformation_notes).toContain("approximate");
  });

  it("preserves captured seconds and fractions through export assembly", () => {
    const behavior = storedBehavior();
    const start = "22:00:15.123456";
    const end = "22:30:45.654321";
    const slot = { id: "precise-slot", user_id: USER_ID, behavior_id: behavior.id, behavior_schedule_id: "precise-schedule",
      kind: "range", preset: null, start_time: start, end_time: end, sort_order: 0, created_at: behavior.created_at, updated_at: behavior.updated_at };
    const baseline = storedConfigurationEvent();
    const bundle = assembleExportBundle({ ...input,
      behaviors: [{ ...behavior, scheduled_time: start, schedule_slots: [slot], schedules: [{ id: "precise-schedule", user_id: USER_ID,
        behavior_id: behavior.id, recurrence_rule: behavior.recurrence_rule, sort_order: 0, created_at: behavior.created_at, updated_at: behavior.updated_at, schedule_slots: [slot] }] }],
      behaviorConfigurationEvents: [{ ...baseline, next_configuration: { ...baseline.next_configuration, schedule_graph: [{ ...baseline.next_configuration.schedule_graph[0],
        time_entries: [{ kind: "range", preset: null, start_time: start, end_time: end, sort_order: 0 }] }] } }],
      occurrences: [{ ...storedExportOccurrence(), behavior_schedule_slot_id: slot.id, schedule_kind: "range", schedule_start_time: start,
        schedule_end_time: end, scheduled_for: "2026-05-02T02:00:15.123456Z" }],
    });
    expect(bundle.jsonBackup.behaviors[0].scheduled_time).toBe(start);
    expect(bundle.jsonBackup.behaviors[0].schedules[0].timeEntries[0]).toMatchObject({ startTime: start, endTime: end });
    expect(records(bundle, "data/behavior_configuration_events.jsonl")[0].next.schedules[0].time_entries[0]).toMatchObject({ local_time: start, window_start_local: start, window_end_local: end });
    expect(records(bundle, "data/schedules.jsonl")[0]).toMatchObject({ local_time: start, window_start_local: start, window_end_local: end });
    expect(records(bundle, "data/occurrences.jsonl")[0]).toMatchObject({ local_time: start,
      due_window_start_utc: "2026-05-02T02:00:15.123456Z", due_window_end_utc: "2026-05-02T02:30:45.654321Z" });
  });

  it("re-exports passive notes and interventions without replacing their provenance", () => {
    const occurrence = storedExportOccurrence();
    const importedNotes = [{ id: "passive-note", user_id: USER_ID, import_run_id: "run", external_id: "source-note",
      target_type: "behavior", target_local_id: occurrence.behavior_id, target_external_id: "source-behavior", body_markdown: "Imported context",
      note_role: "imported", sensitivity: "high", source_original_id: "original-note", source_capture_method: "manual_text", source_confidence: "high",
      imported_created_at: "2026-04-01T12:00:00Z", imported_updated_at: null, metadata: {}, created_at: "2026-06-01T12:00:00Z", updated_at: "2026-06-01T12:00:00Z" }];
    const importedInterventions = [{ id: "passive-reminder", user_id: USER_ID, import_run_id: "run", external_id: "source-reminder",
      behavior_id: occurrence.behavior_id, behavior_external_id: "source-behavior", occurrence_id: occurrence.id, occurrence_external_id: "source-occurrence",
      channel: "email", intervention_type: "reminder", delivery_status: "sent", scheduled_send_at: "2026-05-01T21:45:00Z", sent_at: "2026-05-01T21:45:00Z",
      failure_reason: null, source_original_id: "original-reminder", source_capture_method: "imported", source_confidence: "high", metadata: {}, redacted_sensitivity_indicators: {},
      created_at: "2026-06-01T12:00:00Z", updated_at: "2026-06-01T12:00:00Z" }];
    const bundle = assembleExportBundle({ ...input, includeNotes: true, importedNotes, importedInterventions });
    expect(records(bundle, "data/notes.jsonl")[0]).toMatchObject({ note_id: "passive-note", note_role: "imported", created_at_utc: "2026-04-01T12:00:00Z", source: { original_id: "original-note" } });
    expect(records(bundle, "data/interventions.jsonl")[0]).toMatchObject({ intervention_id: "passive-reminder", channel: "email", delivery_status: "sent", source: { original_id: "original-reminder" } });
    expect(records(assembleExportBundle({ ...input, importedNotes }), "data/notes.jsonl")).toEqual([]);
    const unknown = assembleExportBundle({ ...input, includeNotes: true,
      importedNotes: importedNotes.map((row) => ({ ...row, source_original_id: null, sensitivity: null })),
      importedInterventions: importedInterventions.map((row) => ({ ...row, source_original_id: null })),
    });
    expect(records(unknown, "data/notes.jsonl")[0].source.original_id).toBeNull();
    expect(records(unknown, "data/notes.jsonl")[0]).not.toHaveProperty("sensitivity");
    expect(records(unknown, "data/interventions.jsonl")[0].source.original_id).toBeNull();
  });

  it("retains validated imported configuration lineage and timezone without replaying stale occurrence identity", () => {
    const original = records(assembleExportBundle(input), "data/behavior_configuration_events.jsonl")[0];
    const occurrence = { ...storedExportOccurrence(), behavior_configuration_event_id: null };
    const mappings = [
      { record_type: "behavior", external_id: original.behavior_id, local_id: occurrence.behavior_id },
      { record_type: "occurrence", external_id: "source-occurrence", local_id: occurrence.id },
    ].map((row, index) => ({ ...row, id: `mapping-${index}`, user_id: USER_ID, import_run_id: "run", created_at: "2026-06-01T12:00:00Z" }));
    const run: NonNullable<ExportAssemblyInput["importRuns"]>[number] = { id: "run", user_id: USER_ID, status: "applied",
      created_at: "2026-06-01T12:00:00Z", updated_at: "2026-06-01T12:00:00Z", started_at: "2026-06-01T12:00:00Z", completed_at: "2026-06-01T12:00:00Z",
      accepted_preview_fingerprint: null, accepted_preview_run_id: null, bundle_fingerprint: null, bundle_format: "behaviorlog.bundle",
      failure_message: null, import_mode: "create_missing_only", manifest_sha256: null, privacy_redaction_level: "standard_redaction",
      producer_name: "Synthetic producer", producer_version: "1", schema_version: "0.3.0-draft", subject_id_strategy: "pseudonymous",
      dry_run_summary: { portability: {
      version: 1, categories: [{ id: "retained-unused", name: "Retained empty category", sort_order: 4 }], configurationEvents: [original], occurrences: [{ externalId: "source-occurrence", behaviorExternalId: original.behavior_id,
        timezone: "America/Los_Angeles", configurationEventId: original.event_id, scheduledForUtc: occurrence.scheduled_for, localDate: occurrence.local_date }],
    } } };
    const retained = { ...input, occurrences: [occurrence], importRuns: [run], importMappings: mappings,
      behaviorConfigurationEvents: [{ ...storedConfigurationEvent(), source: "import", reason_code: "behaviorlog_import" }],
    };
    const bundle = assembleExportBundle(retained);
    const record = records(bundle, "data/occurrences.jsonl")[0];
    expect(JSON.parse(bundle.behaviorLog.files[0].content).extensions["app.cadence"].categories).toEqual([
      { id: "retained-unused", name: "Retained empty category", sort_order: 4 },
    ]);
    expect(record.timezone).toBe("America/Los_Angeles");
    expect(record.configuration_event_id).toMatch(/^cfg_import_/);
    expect(records(bundle, "data/behavior_configuration_events.jsonl")).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_id: record.configuration_event_id, behavior_id: occurrence.behavior_id, effective_at_utc: "2026-05-01T12:00:00Z" }),
    ]));
    const changed = assembleExportBundle({ ...retained, occurrences: [{ ...occurrence, scheduled_for: "2026-05-02T22:00:00Z" }] });
    expect(records(changed, "data/occurrences.jsonl")[0].timezone).toBe("America/New_York");
    const generatedAfterImport = assembleExportBundle({ ...retained, occurrences: [occurrence, { ...storedExportOccurrence(), id: "new-occurrence" }] });
    const configurations = new Set(records(generatedAfterImport, "data/behavior_configuration_events.jsonl").map((event) => event.event_id));
    for (const row of records(generatedAfterImport, "data/occurrences.jsonl")) {
      expect(configurations.has(row.configuration_event_id)).toBe(true);
    }
  });

  it("derives changed fields from canonical snapshots and validates timezone-only revisions", async () => {
    const baseline = storedConfigurationEvent();
    const revision = { ...baseline, id: "timezone-revision", event_kind: "revision", previous_configuration: baseline.next_configuration,
      next_configuration: { ...baseline.next_configuration, timezone: "America/Los_Angeles" }, changed_fields: ["timezone"],
      recorded_at: "2026-06-01T12:00:00Z", effective_at: "2026-06-01T12:00:00Z", effective_local_date: "2026-06-01", timezone: "America/Los_Angeles" };
    const bundle = assembleExportBundle({ ...input, behaviors: [{ ...storedBehavior(), created_at: "2026-05-01T05:00:00Z", timezone: "America/Los_Angeles", current_configuration_event_id: revision.id }],
      behaviorConfigurationEvents: [baseline, revision] });
    const event = records(bundle, "data/behavior_configuration_events.jsonl")[1];
    expect(event.changed_fields).toEqual(["schedules", "intervention_rules", "timezone"]);
    expect(event.previous.schedules[0].anchor_local_date).toBe("2026-05-01");
    expect(event.next.schedules[0].anchor_local_date).toBe("2026-04-30");
    const directory = await mkdtemp(path.join(tmpdir(), "cadence-config-export-"));
    try {
      for (const file of bundle.behaviorLog.files) {
        const target = path.join(directory, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
      const result = spawnSync(process.execPath, ["scripts/behaviorlog-conformance.mjs", directory], { encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("retains extension-only category revisions without inventing a canonical category change", () => {
    const baseline = { ...storedConfigurationEvent(), next_configuration: { ...storedConfigurationEvent().next_configuration, category_id: "missing-old" } };
    const revision = { ...baseline, id: "category-revision", event_kind: "revision", previous_configuration: baseline.next_configuration,
      next_configuration: { ...baseline.next_configuration, category_id: "missing-new" }, changed_fields: ["category_id"], recorded_at: "2026-06-01T12:00:00Z" };
    const bundle = assembleExportBundle({ ...input, behaviors: [{ ...storedBehavior(), category_id: "missing-new", current_configuration_event_id: revision.id }], behaviorConfigurationEvents: [baseline, revision] });
    const event = records(bundle, "data/behavior_configuration_events.jsonl")[1];
    expect(event.changed_fields).toEqual([]);
    expect(event.previous.category).toBeNull();
    expect(event.next.category).toBeNull();
    expect(event.previous.extensions["app.cadence"].category_id).toBe("missing-old");
    expect(event.next.extensions["app.cadence"].category_id).toBe("missing-new");
    expect(event.source.transformation_notes).toContain("Canonical fields are unchanged after projection");
  });

  it("omits unrecorded imported actors and declares known lossy import fields", () => {
    const occurrence = storedExportOccurrence();
    const base = { occurrence_id: occurrence.id, behavior_id: occurrence.behavior_id, previous_status: "unresolved", status: "completed", status_semantics: "explicit_user_mark",
      recorded_at: "2026-05-01T23:00:00Z", effective_at: "2026-05-01T23:00:00Z", local_date: "2026-05-01", timezone: "America/New_York", source_capture_method: "manual_tap",
      source_confidence: "high", revises_event_id: null, reason_code: null, created_at: "2026-05-01T23:00:00Z", updated_at: "2026-05-01T23:00:00Z" };
    const bundle = assembleExportBundle({ ...input, statusEvents: [{ ...base, id: "local-decision" }, { ...base, id: "imported-decision" }],
      importMappings: [{ id: "mapping", user_id: USER_ID, import_run_id: "run", record_type: "status_event", external_id: "original-decision", local_id: "imported-decision", created_at: "2026-06-01T12:00:00Z" }],
    });
    const events = records(bundle, "data/status_events.jsonl");
    expect(events.find((event) => event.event_id === "local-decision").actor).toEqual({ type: "user", id: "subject" });
    expect(events.find((event) => event.event_id === "imported-decision")).not.toHaveProperty("actor");
    const exchange = JSON.parse(bundle.behaviorLog.files[0].content).rules.exchange;
    expect(exchange.fidelity).toBe("partial");
    expect(exchange).not.toHaveProperty("capabilities");
    expect(exchange.losses).toEqual(expect.arrayContaining([expect.objectContaining({ path: "source/imported_optional_fields" })]));
  });
});
