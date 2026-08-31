import { createHash, randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { expect } from "vitest";
import { resolveBehaviorLogImportMergePreview } from "@cadence/core/resolvers/behaviorlog-import.resolver";
import { existingRecords } from "@cadence/core/services/behaviorlog-write-plan";
import type { BehaviorLogImportFile } from "@cadence/core/types/behaviorlog-import";
import { listBehaviorCategories, type AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { applyAcceptedBehaviorLogImportPlanAtomically, createBehaviorLogImportRunFromPreview } from "@/lib/services/behaviorlog-import-write.service";
import { getExportPageData } from "@/lib/services/export.service";
import { applyBehaviorLogRestoreUploadFromFormData, createBehaviorLogRestorePreviewRun } from "@/lib/services/behaviorlog-restore.service";
import { createStoredZip } from "@/lib/services/zip";
import { behaviorLog03Files } from "./behaviorlog-03-fixture";
import { emptyPortabilitySnapshot } from "./portability-fixture";
import { readPortabilitySqlSnapshot } from "./portability-sql-contract";
import { restoreForm } from "./restore-sql-contract";

const NOW = Temporal.Instant.from("2026-08-30T12:00:00Z");
const channels = ["browser_push", "email", "sms", "mobile_push", "in_app", "calendar_notification", "voice_assistant", "webhook", "other", "none"];
const statuses = ["pending", "sent", "delivered", "failed", "cancelled", "suppressed", "unknown"];

function records(files: BehaviorLogImportFile[], path: string): Record<string, unknown>[] {
  return (files.find((file) => file.path === path)?.content ?? "").split(/\r?\n/)
    .filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Runs through ordinary authenticated SQL repositories and the real web export service. */
export async function exerciseBehaviorLog03SqlContract(client: AppSupabaseClient, userId: string) {
  const files = behaviorLog03Files();
  const base = emptyPortabilitySnapshot();
  base.profile.id = userId;
  base.categories = await listBehaviorCategories(client, userId);
  const preview = resolveBehaviorLogImportMergePreview({ files, existing: existingRecords(base) });
  expect(preview.valid, JSON.stringify(preview.errors)).toBe(true);
  expect(preview.summary.schemaVersion).toBe("0.3.0-draft");
  expect(preview.portability?.configurationEvents).toHaveLength(2);
  expect(preview.portability?.occurrences.map((row) => row.configurationEventId)).toEqual(["configuration-1", null]);

  const accepted = await createBehaviorLogImportRunFromPreview(client, {
    userId, files, preview, importMode: "merge_preview", startedAt: NOW.toString(), completedAt: NOW.toString(),
  });
  expect(accepted.dry_run_summary).not.toHaveProperty("portability");
  const input = { userId, files, preview, importMode: "merge_by_user_approved_plan" as const,
    acceptedPreviewRunId: accepted.id, acceptedPreviewFingerprint: preview.previewFingerprint, completedAt: NOW.toString() };
  const applied = await applyAcceptedBehaviorLogImportPlanAtomically(client, input);
  expect(applied.created).toMatchObject({ behaviors: 1, occurrences: 2, notes: 2, interventions: 1, timeSessions: 1 });
  expect(applied.importRun.dry_run_summary).toHaveProperty("portability", preview.portability);
  const savedRun = await client.from("behaviorlog_import_runs").select("dry_run_summary").eq("id", applied.importRun.id).single();
  expect(savedRun.error).toBeNull();
  expect(savedRun.data?.dry_run_summary).toHaveProperty("portability", preview.portability);

  const saved = await readPortabilitySqlSnapshot(client, base);
  expect(saved.occurrences).toHaveLength(2);
  expect(saved.occurrences.map((row) => row.behavior_configuration_event_id)).toEqual([null, null]);
  expect(saved.configurationEvents).toHaveLength(1);
  expect(saved.graphs[0].behavior.current_configuration_event_id).toBe(saved.configurationEvents[0].id);
  expect(saved.graphs[0].behavior.browser_reminder_enabled).toBe(false);
  expect(saved.importedInterventions).toHaveLength(1);
  expect(saved.importedInterventions[0]).toMatchObject({ channel: "other", delivery_status: "delivered" });

  // The web reader must include saved future rows and preserve imported history
  // without assigning imported rows to the new operational configuration.
  const bundle = await getExportPageData({ range: "all", now: NOW, includeNotes: true, includeTimeTracking: true });
  const exported = bundle.behaviorLog.files;
  const exportedOccurrences = records(exported, "data/occurrences.jsonl");
  const future = exportedOccurrences.find((row) => row.local_date === "2026-09-01");
  expect(future).toBeDefined();
  expect(future?.configuration_event_id ?? null).toBeNull();
  const past = exportedOccurrences.find((row) => row.local_date === "2026-05-01");
  expect(past?.configuration_event_id).toEqual(expect.stringMatching(/^cfg_import_/));
  const normalizeEvent = ({ event_id: _eventId, behavior_id: _behaviorId, ...event }: Record<string, unknown>) => {
    void _eventId; void _behaviorId; return event;
  };
  const retained = records(exported, "data/behavior_configuration_events.jsonl")
    .filter((row) => String(row.event_id).startsWith("cfg_import_")).map(normalizeEvent);
  expect(retained).toEqual(records(files, "data/behavior_configuration_events.jsonl").map(normalizeEvent));
  expect(records(exported, "data/interventions.jsonl")).toEqual(expect.arrayContaining([
    expect.objectContaining({ channel: "other", delivery_status: "delivered", planned_for_utc: "2026-05-02T02:00:00Z" }),
  ]));
  expect(records(exported, "data/notes.jsonl").map((row) => row.body_markdown)).toEqual(expect.arrayContaining([
    "Private imported context", "Private future context",
  ]));
  const manifest = JSON.parse(exported.find((file) => file.path === "manifest.json")!.content);
  expect(manifest.extensions["app.cadence"].categories).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Imported unused category", sort_order: 99 }),
  ]));
  const privateDefault = await getExportPageData({ range: "all", now: NOW });
  expect(privateDefault.behaviorLog.files.some((file) => file.path === "data/notes.jsonl")).toBe(false);
  expect(privateDefault.behaviorLog.files.some((file) => file.path === "data/time_sessions.jsonl")).toBe(false);

  const replay = await applyAcceptedBehaviorLogImportPlanAtomically(client, input);
  expect(replay.importRun.id).toBe(applied.importRun.id);
  const beforeMerge = await readPortabilitySqlSnapshot(client, base);
  expect(beforeMerge.importedNotes).toHaveLength(2);
  expect(beforeMerge.importedInterventions).toHaveLength(1);
  const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);

  // A fresh review of the original archive must use the accepted schedule
  // capture, even though its dates precede the new operational configuration.
  const sourceReplayPreview = resolveBehaviorLogImportMergePreview({ files, existing: existingRecords(beforeMerge) });
  expect(sourceReplayPreview.valid, JSON.stringify(sourceReplayPreview.errors)).toBe(true);
  expect(sourceReplayPreview.mergePreview.conflictCodes).toEqual([]);
  expect(sourceReplayPreview.mergePreview.actions.schedules.some((action) => action.action === "map_to_existing")).toBe(true);
  const sourceReplayRun = await createBehaviorLogImportRunFromPreview(client, {
    userId, files, preview: sourceReplayPreview, importMode: "merge_preview",
    startedAt: NOW.toString(), completedAt: NOW.toString(),
  });
  const sourceReplay = await applyAcceptedBehaviorLogImportPlanAtomically(client, {
    userId, files, preview: sourceReplayPreview, importMode: "merge_by_user_approved_plan",
    acceptedPreviewRunId: sourceReplayRun.id, acceptedPreviewFingerprint: sourceReplayPreview.previewFingerprint,
    completedAt: NOW.toString(),
  });
  expect(sourceReplay.created).toMatchObject({ behaviors: 0, schedules: 0, occurrences: 0,
    statusEvents: 0, definitionEvents: 0, notes: 0, interventions: 0, timeSessions: 0 });
  const afterSourceReplay = await readPortabilitySqlSnapshot(client, base);
  expect(afterSourceReplay.graphs).toEqual(beforeMerge.graphs);
  for (const key of ["categories", "definitionEvents", "configurationEvents", "statusEvents", "timeSessions", "importedNotes", "importedInterventions"] as const) {
    expect([...afterSourceReplay[key]].sort(byId), `Original archive preserves ${key}`)
      .toEqual([...beforeMerge[key]].sort(byId));
  }
  // A fresh accepted merge reapplies the latest status projection in both
  // adapters. Its concurrency timestamp may advance; captured fields may not.
  const occurrenceCapture = ({ updated_at: _updatedAt, ...row }: (typeof beforeMerge.occurrences)[number]) => {
    void _updatedAt; return row;
  };
  expect(afterSourceReplay.occurrences.map(occurrenceCapture).sort(byId))
    .toEqual(beforeMerge.occurrences.map(occurrenceCapture).sort(byId));

  // Re-export uses passive rows' local IDs. A self-merge must recognize those
  // exact records and preserve them instead of importing duplicate history.
  const selfMergePreview = resolveBehaviorLogImportMergePreview({ files: exported, existing: existingRecords(beforeMerge) });
  expect(selfMergePreview.valid, JSON.stringify(selfMergePreview.errors)).toBe(true);
  expect(selfMergePreview.mergePreview.conflictCodes).toEqual([]);
  const selfMergeRun = await createBehaviorLogImportRunFromPreview(client, {
    userId, files: exported, preview: selfMergePreview, importMode: "merge_preview",
    startedAt: NOW.toString(), completedAt: NOW.toString(),
  });
  const selfMerge = await applyAcceptedBehaviorLogImportPlanAtomically(client, {
    userId, files: exported, preview: selfMergePreview, importMode: "merge_by_user_approved_plan",
    acceptedPreviewRunId: selfMergeRun.id, acceptedPreviewFingerprint: selfMergePreview.previewFingerprint,
    completedAt: NOW.toString(),
  });
  expect(selfMerge.created).toMatchObject({ notes: 0, interventions: 0 });
  const beforeRestore = await readPortabilitySqlSnapshot(client, base);
  expect([...beforeRestore.importedNotes].sort(byId)).toEqual([...beforeMerge.importedNotes].sort(byId));
  expect([...beforeRestore.importedInterventions].sort(byId)).toEqual([...beforeMerge.importedInterventions].sort(byId));

  // Restoring the re-export adds another accepted ledger. It must not duplicate
  // retained source events or attach unknown lineage to a local baseline.
  const zip = Buffer.from(createStoredZip(exported));
  const archiveFingerprint = createHash("sha256").update(zip).digest("hex");
  const restore = await createBehaviorLogRestorePreviewRun(client, { userId, files: exported, archiveFingerprint });
  expect(restore.preview.valid, JSON.stringify(restore.preview.errors)).toBe(true);
  const restored = await applyBehaviorLogRestoreUploadFromFormData(
    restoreForm(zip, restore.preview, restore.importRun.id, archiveFingerprint),
  );
  expect(restored.status, restored.message ?? "").toBe("applied");
  const afterRestore = await readPortabilitySqlSnapshot(client, base);
  // The production web export reader also synchronizes today's Occurrence.
  // Restore must preserve that exported row and both imported rows exactly once.
  expect(afterRestore.occurrences).toHaveLength(exportedOccurrences.length);
  expect(afterRestore.occurrences.map((row) => row.id).sort())
    .toEqual(beforeRestore.occurrences.map((row) => row.id).sort());
  expect(afterRestore.timeSessions).toHaveLength(1);
  expect(afterRestore.importedInterventions).toHaveLength(1);
  const restoredBundle = await getExportPageData({ range: "all", now: NOW, includeNotes: true, includeTimeTracking: true });
  const restoredFiles = restoredBundle.behaviorLog.files;
  const restoredHistory = records(restoredFiles, "data/behavior_configuration_events.jsonl");
  const byEventId = (left: Record<string, unknown>, right: Record<string, unknown>) =>
    String(left.event_id).localeCompare(String(right.event_id));
  expect([...restoredHistory].sort(byEventId))
    .toEqual(records(exported, "data/behavior_configuration_events.jsonl").sort(byEventId));
  for (const sourceEvent of records(files, "data/behavior_configuration_events.jsonl")) {
    expect(restoredHistory.filter((event) => event.recorded_at_utc === sourceEvent.recorded_at_utc)
      .map(normalizeEvent)).toEqual([normalizeEvent(sourceEvent)]);
  }
  expect(records(restoredFiles, "data/occurrences.jsonl").find((row) => row.local_date === "2026-09-01"))
    .toMatchObject({ current_status: "not_completed" });
  expect(records(restoredFiles, "data/occurrences.jsonl").find((row) => row.local_date === "2026-09-01")
    ?.configuration_event_id ?? null).toBeNull();
  expect(records(restoredFiles, "data/interventions.jsonl")).toHaveLength(1);

  // Exercise the additive passive CHECKs through an ordinary owner, including
  // all canonical values and rejection of values outside the vocabulary.
  const observation = saved.importedInterventions[0];
  for (let index = 0; index < channels.length; index += 1) {
    const row = { ...observation, id: randomUUID(), external_id: `sql-enum-${index}`,
      channel: channels[index], delivery_status: statuses[index % statuses.length] };
    const result = await client.from("imported_interventions").insert(row).select("channel,delivery_status").single();
    expect(result.error, `Passive ${row.channel}/${row.delivery_status}`).toBeNull();
    expect(result.data).toEqual({ channel: row.channel, delivery_status: row.delivery_status });
  }
  for (const invalid of [{ channel: "not_a_channel" }, { delivery_status: "not_a_status" }]) {
    const result = await client.from("imported_interventions").insert({ ...observation,
      id: randomUUID(), external_id: randomUUID(), ...invalid });
    expect(result.error?.code).toBe("23514");
  }
  const reminders = await client.from("reminder_deliveries").select("id").eq("user_id", userId);
  expect(reminders.error).toBeNull();
  expect(reminders.data).toHaveLength(0);
}
