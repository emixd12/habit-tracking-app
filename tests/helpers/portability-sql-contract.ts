import { Temporal } from "@js-temporal/polyfill";
import { expect } from "vitest";
import { resolveBehaviorLogImportMergePreview } from "@cadence/core/resolvers/behaviorlog-import.resolver";
import { planBehaviorLogImportWrite } from "@cadence/core/services/behaviorlog-import-plan";
import { existingRecords } from "@cadence/core/services/behaviorlog-write-plan";
import type { PortabilitySnapshot } from "@cadence/core/types/portability-rows";
import { listBehaviorCategories, listUserBehaviors, type AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { listBehaviorDefinitionEvents } from "@/lib/db/behaviorDefinitionEvents.repo";
import { listBehaviorConfigurationEvents } from "@/lib/db/behaviorConfigurationEvents.repo";
import { applyAcceptedBehaviorLogImportPlanAtomically, createBehaviorLogImportRunFromPreview } from "@/lib/services/behaviorlog-import-write.service";
import { emptyPortabilitySnapshot, fixtureIds, portabilityApplyRun, richPortabilityFiles, PORTABILITY_NOW } from "./portability-fixture";

// The same rich fixture also runs through the real SQLite FormData coordinator
// in desktop-portability-contract.test.ts. This compares its shared row planner
// with the production Postgres atomic import and checks SQL replay separately.
export async function exercisePortabilitySqlContract(client: AppSupabaseClient, userId: string) {
  const files = richPortabilityFiles();
  const snapshot = emptyPortabilitySnapshot();
  snapshot.profile.id = userId;
  snapshot.categories = await listBehaviorCategories(client, userId);
  const preview = resolveBehaviorLogImportMergePreview({ files, existing: existingRecords(snapshot) });
  expect(preview.valid).toBe(true);
  const accepted = await createBehaviorLogImportRunFromPreview(client, {
    userId, files, preview, importMode: "merge_preview", startedAt: PORTABILITY_NOW, completedAt: PORTABILITY_NOW,
  });
  const applyRun = { ...portabilityApplyRun(), user_id: userId, accepted_preview_run_id: accepted.id,
    accepted_preview_fingerprint: preview.previewFingerprint };
  const plan = planBehaviorLogImportWrite({ snapshot, applyRun, now: PORTABILITY_NOW, newId: fixtureIds(),
    preview, mode: "merge_by_user_approved_plan", interventionRulesPresent: files.some((file) => file.path === "data/intervention_rules.jsonl") });
  const expected: PortabilitySnapshot = { ...snapshot, categories: [...snapshot.categories, ...plan.categoryCreates],
    graphs: plan.graphWrites.map(({ graph }) => ({ ...graph, revision: 0 })),
    definitionEvents: plan.definitionEvents,
    configurationEvents: plan.graphWrites.flatMap((write) => write.configurationEvents),
    occurrences: plan.occurrenceWrites.map(({ next }) => next),
    statusEvents: plan.statusEvents,
    timeSessions: plan.timeSessionWrites.map(({ next }) => next),
    importedNotes: plan.importedNoteWrites.map(({ next }) => next),
    importedInterventions: plan.importedInterventionWrites.map(({ next }) => next),
    mappings: plan.mappings,
  };
  const applyInput = { userId, files, preview, importMode: "merge_by_user_approved_plan" as const,
    acceptedPreviewRunId: accepted.id, acceptedPreviewFingerprint: preview.previewFingerprint, completedAt: PORTABILITY_NOW };
  const applied = await applyAcceptedBehaviorLogImportPlanAtomically(client, applyInput);
  const expectedResult = plan.result as { created: Record<string, number>; skipped: Record<string, number> };
  for (const key of ["behaviors", "schedules", "occurrences", "statusEvents", "notes", "interventions", "mappings", "definitionEvents", "timeSessions"] as const) {
    expect(applied.created[key], `Created ${key}`).toBe(expectedResult.created[key]);
  }
  const actual = await readPortabilitySqlSnapshot(client, snapshot);
  expect(portabilitySemantics(actual)).toEqual(portabilitySemantics(expected));
  expect(actual.timeSessions).toHaveLength(1);
  expect(Temporal.Instant.from(actual.timeSessions[0].started_at)
    .until(Temporal.Instant.from(actual.timeSessions[0].stopped_at!)).total("seconds")).toBe(60);
  const replayed = await applyAcceptedBehaviorLogImportPlanAtomically(client, applyInput);
  expect(replayed.importRun.id === applied.importRun.id).toBe(true);
  expect(portabilitySemantics(await readPortabilitySqlSnapshot(client, snapshot))).toEqual(portabilitySemantics(actual));
  const reminders = await client.from("reminder_deliveries").select("id").eq("user_id", userId);
  if (reminders.error) throw new Error("Could not verify local import reminder isolation.");
  expect(reminders.data).toHaveLength(0);
}

export async function readPortabilitySqlSnapshot(client: AppSupabaseClient, base: PortabilitySnapshot): Promise<PortabilitySnapshot> {
  const userId = base.profile.id;
  const [graphs, categories, definitionEvents, configurationEvents, occurrences, statusEvents, timeSessions, importedNotes, importedInterventions, mappings, importRuns] = await Promise.all([
    listUserBehaviors(client, userId), listBehaviorCategories(client, userId), listBehaviorDefinitionEvents(client, userId), listBehaviorConfigurationEvents(client, userId),
    client.from("occurrences").select("*").eq("user_id", userId),
    client.from("occurrence_status_events").select("*").eq("user_id", userId),
    client.from("occurrence_time_sessions").select("*").eq("user_id", userId),
    client.from("imported_notes").select("*").eq("user_id", userId),
    client.from("imported_interventions").select("*").eq("user_id", userId),
    client.from("behaviorlog_import_record_mappings").select("*").eq("user_id", userId),
    client.from("behaviorlog_import_runs").select("*").eq("user_id", userId),
  ]);
  if ([occurrences, statusEvents, timeSessions, importedNotes, importedInterventions, mappings, importRuns].some(({ error }) => error)) {
    throw new Error("Could not read local SQL import results.");
  }
  return { ...base, categories, graphs: graphs.map((graph) => ({ behavior: graph, schedules: graph.schedules ?? [], slots: graph.schedule_slots, revision: 0 })),
    definitionEvents, configurationEvents, occurrences: occurrences.data!, statusEvents: statusEvents.data!,
    timeSessions: timeSessions.data!, importedNotes: importedNotes.data!, importedInterventions: importedInterventions.data!, mappings: mappings.data!,
    importRuns: importRuns.data! };
}

export function portabilitySemantics(snapshot: PortabilitySnapshot) {
  const instant = (value: string | null) => value ? Temporal.Instant.from(value).toString() : null;
  const time = (value: string | null) => value ? Temporal.PlainTime.from(value).toString() : null;
  const sorted = <T,>(rows: T[]) => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const behaviorTitle = (id: string) => snapshot.graphs.find(({ behavior }) => behavior.id === id)?.behavior.title ?? "MISSING";
  const occurrenceKey = (id: string) => {
    const row = snapshot.occurrences.find((row) => row.id === id);
    return row ? `${behaviorTitle(row.behavior_id)}:${row.local_date}:${time(row.schedule_start_time)}` : "MISSING";
  };
  return {
    graphs: sorted(snapshot.graphs.map(({ behavior, schedules, slots }) => ({
      title: behavior.title, description: behavior.description, category: snapshot.categories.find(({ id }) => id === behavior.category_id)?.name ?? null,
      recurrence: behavior.recurrence_rule, time: time(behavior.scheduled_time), timezone: behavior.timezone,
      browser: behavior.browser_reminder_enabled, email: behavior.email_reminder_enabled, offset: behavior.reminder_offset_minutes,
      active: behavior.active, archived: instant(behavior.archived_at), created: instant(behavior.created_at),
      currentConfigurationExists: snapshot.configurationEvents.some((event) => event.id === behavior.current_configuration_event_id && event.behavior_id === behavior.id),
      schedules: sorted(schedules.map((schedule) => ({ recurrence: schedule.recurrence_rule, order: schedule.sort_order,
        slots: sorted(slots.filter((slot) => slot.behavior_schedule_id === schedule.id).map((slot) => ({ kind: slot.kind, preset: slot.preset,
          start: time(slot.start_time), end: time(slot.end_time), order: slot.sort_order }))) }))),
    }))),
    definitions: sorted(snapshot.definitionEvents.map((event) => ({ behavior: behaviorTitle(event.behavior_id),
      previousTitle: event.previous_title, title: event.next_title, previousDescription: event.previous_description, description: event.next_description,
      changed: [...event.changed_fields].sort(), recorded: instant(event.recorded_at), source: event.source, reason: event.reason }))),
    configurations: sorted(snapshot.configurationEvents.map((event) => ({ behavior: behaviorTitle(event.behavior_id), kind: event.event_kind,
      changed: [...event.changed_fields].sort(), timezone: event.timezone, source: event.source, reason: event.reason_code }))),
    occurrences: sorted(snapshot.occurrences.map((row) => ({ behavior: behaviorTitle(row.behavior_id), date: row.local_date,
      scheduled: instant(row.scheduled_for), kind: row.schedule_kind, preset: row.schedule_preset, start: time(row.schedule_start_time), end: time(row.schedule_end_time),
      slotLinked: row.behavior_schedule_slot_id !== null, configurationLinked: row.behavior_configuration_event_id !== null,
      status: row.status, note: row.note, completed: instant(row.completed_at), marked: instant(row.status_marked_at) }))),
    statusEvents: sorted(snapshot.statusEvents.map((row) => ({ occurrence: occurrenceKey(row.occurrence_id), previous: row.previous_status,
      status: row.status, semantics: row.status_semantics, recorded: instant(row.recorded_at), effective: instant(row.effective_at),
      date: row.local_date, timezone: row.timezone, capture: row.source_capture_method, confidence: row.source_confidence, reason: row.reason_code }))),
    timeSessions: sorted(snapshot.timeSessions.map((row) => ({ occurrence: occurrenceKey(row.occurrence_id), start: instant(row.started_at), stop: instant(row.stopped_at) }))),
    notes: sorted(snapshot.importedNotes.map((row) => ({ externalId: row.external_id, body: row.body_markdown, target: row.target_type,
      targetExternalId: row.target_external_id, role: row.note_role, sensitivity: row.sensitivity, capture: row.source_capture_method, confidence: row.source_confidence }))),
    interventions: sorted(snapshot.importedInterventions.map((row) => ({ externalId: row.external_id, channel: row.channel, status: row.delivery_status }))),
    mappings: sorted(snapshot.mappings.map((row) => ({ type: row.record_type, externalId: row.external_id }))),
  };
}
