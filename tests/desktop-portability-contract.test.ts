import { createStoredZip } from "../lib/services/zip";
import { createHash } from "node:crypto";
import { saveLocalOccurrenceNote, trackLocalOccurrence } from "../apps/desktop/src/local-occurrence.service";
import { createBehavior, updateBehavior } from "@cadence/core/services/behavior.service";
import { createLocalBehaviorStore } from "../apps/desktop/src/local-behavior.service";
import { getLocalExportDownload, getLocalExportPageData } from "../apps/desktop/src/local-export.service";
import { ensureLocalOccurrencesFresh } from "../apps/desktop/src/local-generation.service";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { Temporal } from "@js-temporal/polyfill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localCommand } from "../apps/desktop/src/local-store";
import { previewLocalBehaviorLogImport, applyLocalBehaviorLogImport } from "../apps/desktop/src/local-import.service";
import { previewLocalBehaviorLogRestore, applyLocalBehaviorLogRestore } from "../apps/desktop/src/local-restore.service";
import { createDesktopZip } from "../apps/desktop/src/archive";
import { portabilityFiles, richPortabilityFiles } from "./helpers/portability-fixture";
import { behaviorLog03Files } from "./helpers/behaviorlog-03-fixture";
import type { BehaviorLogImportActionState } from "../lib/types/behaviorlog-import-ui";
import type { BehaviorLogRestoreActionState } from "../lib/types/behaviorlog-restore-ui";
const transport = vi.hoisted(() => ({ notify: (() : Promise<unknown> => Promise.reject(new Error("OS adapter not configured."))) as (_request: unknown) => Promise<unknown>, send: (() : Promise<unknown> => Promise.reject(new Error("SQLite runner is not started."))) as (_request: unknown) => Promise<unknown> }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: (command: string, args: { request: unknown }) => {
  if (command === "native_notifications") return transport.notify(args.request);
  if (command !== "local_store") throw new Error(`Unexpected native command: ${command}`);
  return transport.send(args.request);
} }));

const NOW = Temporal.Instant.from("2026-08-30T12:00:00Z");
describe.skipIf(!process.env.CADENCE_SQLITE_CONTRACT)("BehaviorLog clients against real SQLite", () => {
  let directory: string;
  let child: ChildProcessWithoutNullStreams;
  let stopped: Promise<void>;
  async function start() {
    child = spawn(path.resolve("apps/desktop/src-tauri/target/debug/local-store-contract"), [path.join(directory, "contract.sqlite3")]);
    const pending: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    createInterface({ input: child.stdout }).on("line", (line) => {
      const waiter = pending.shift();
      if (!waiter) return;
      try {
        const response = JSON.parse(line);
        if (response.error) waiter.reject(new Error(response.error));
        else waiter.resolve(response.result);
      } catch (error) { waiter.reject(error as Error); }
    });
    child.on("error", (error) => { for (const waiter of pending.splice(0)) waiter.reject(error); });
    stopped = new Promise((resolve) => child.on("close", () => {
      for (const waiter of pending.splice(0)) waiter.reject(new Error(`SQLite runner exited: ${stderr}`));
      resolve();
    }));
    transport.send = (request) => new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }
  async function stop() { child.stdin.end(); await stopped; }
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "cadence-ts-sqlite-")); await start(); });
  afterEach(async () => { vi.restoreAllMocks(); await stop(); await rm(directory, { recursive: true, force: true }); });

  it("roundtrips 0.3 source history, unknown lineage and passive native observations with private defaults", async () => {
    const notify = vi.spyOn(transport, "notify");
    const profile = await localCommand("readProfile", {});
    const zip = createDesktopZip(behaviorLog03Files());
    const preview = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    expect(preview.preview?.errors, preview.message ?? "").toEqual([]);
    expect(preview.preview?.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "portability_loss", file: "data/interventions.jsonl" })]));
    const form = accepted(zip, preview, "import"); form.set("confirm_sensitive_notes", "yes");
    const applied = await applyLocalBehaviorLogImport(profile, form, NOW);
    expect(applied.status, applied.message ?? "").toBe("applied");
    await stop(); await start();
    const stored = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(stored.occurrences).toHaveLength(2);
    expect(stored.occurrences.every((row) => row.behavior_configuration_event_id === null)).toBe(true);
    expect(stored.graphs[0].behavior.current_configuration_event_id).not.toBeNull();
    expect(stored.graphs[0].behavior).toMatchObject({ browser_reminder_enabled: true, reminder_offset_minutes: 15 });
    expect(stored.importRuns.find((run) => run.status === "applied")?.dry_run_summary).toMatchObject({
      portability: { categories: [expect.objectContaining({ name: "Imported unused category", sort_order: 99 })] },
    });
    expect(stored.importedNotes).toHaveLength(2); expect(stored.timeSessions).toHaveLength(1);
    expect(stored.importedInterventions).toEqual([expect.objectContaining({ channel: "other", delivery_status: "delivered", source_original_id: "source-native-observation" })]);
    expect((await localCommand("readNativeReminderState", { profileId: profile.id })).reminders).toEqual([]);

    const privateDefault = await getLocalExportPageData(profile, { range: "all", now: NOW });
    const defaultText = privateDefault.behaviorLog.files.map((file) => file.content).join("\n");
    expect(defaultText).not.toContain("Private imported context"); expect(defaultText).not.toContain("Private future context");
    expect(privateDefault.jsonBackup).not.toHaveProperty("time_sessions");
    const full = await getLocalExportPageData(profile, { range: "all", now: NOW, includeNotes: true, includeTimeTracking: true });
    const rows = (filePath: string) => full.behaviorLog.files.find((file) => file.path === filePath)!.content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const manifest = JSON.parse(full.behaviorLog.files[0].content);
    expect(manifest.schema_version).toBe("0.3.0-draft"); expect(manifest.profiles).toContain("configuration_history");
    expect(manifest.extensions["app.cadence"].categories).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Imported unused category", sort_order: 99 })]));
    const histories = rows("data/behavior_configuration_events.jsonl");
    const sourceHistories = behaviorLog03Files().find((file) => file.path === "data/behavior_configuration_events.jsonl")!.content.trim().split("\n").map((line) => JSON.parse(line));
    const withoutLocalIds = ({ event_id: _eventId, behavior_id: _behaviorId, ...event }: Record<string, unknown>) => {
      void _eventId; void _behaviorId; return event;
    };
    expect(histories.filter((row) => row.event_id.startsWith("cfg_import_")).map(withoutLocalIds)).toEqual(sourceHistories.map(withoutLocalIds));
    expect(histories).toEqual(expect.arrayContaining([
      expect.objectContaining({ recorded_at_utc: "2026-05-01T12:00:00Z", previous: null }),
      expect.objectContaining({ recorded_at_utc: "2026-06-01T12:00:00Z", changed_fields: ["intervention_rules"] }),
    ]));
    const occurrences = rows("data/occurrences.jsonl");
    const known = occurrences.find((row) => row.local_date === "2026-05-01");
    const unknown = occurrences.find((row) => row.local_date === "2026-09-01");
    expect(known.configuration_event_id).toBe(histories.find((row) => row.recorded_at_utc === "2026-05-01T12:00:00Z").event_id);
    expect(unknown).not.toHaveProperty("configuration_event_id");
    expect(unknown.current_status).toBe("not_completed");
    expect(rows("data/notes.jsonl").map((row) => row.body_markdown).sort()).toEqual(["Private future context", "Private imported context"]);
    expect(rows("data/status_events.jsonl").map((row) => [row.status, row.recorded_at_utc])).toEqual([
      ["completed", "2026-05-02T02:01:00Z"], ["not_completed", "2026-08-30T11:00:00Z"],
    ]);
    expect(rows("data/time_sessions.jsonl")[0]).toMatchObject({ started_at_utc: "2026-05-02T01:59:00Z", stopped_at_utc: "2026-05-02T02:00:00Z" });
    expect(rows("data/interventions.jsonl")).toEqual([expect.objectContaining({ channel: "other", delivery_status: "delivered",
      source: expect.objectContaining({ original_id: "source-native-observation" }), extensions: { "app.cadence": { passive_imported_history: true } } })]);
    const fullText = full.behaviorLog.files.map((file) => file.content).join("\n");
    expect(fullText).not.toMatch(/"user_id"\s*:/); expect(fullText).not.toContain(profile.id);
    expect((await localCommand("readImportSnapshot", { profileId: profile.id })).occurrences).toHaveLength(2);

    for (let replay = 0; replay < 2; replay += 1) {
      const selfExport = await getLocalExportDownload(profile, "behaviorlog", { range: "all", now: NOW, includeNotes: true, includeTimeTracking: true });
      const selfPreview = await previewLocalBehaviorLogImport(profile, upload(selfExport.bytes!, "behaviorlog_file"), NOW);
      expect(selfPreview.preview?.errors, selfPreview.message ?? "").toEqual([]);
      expect(selfPreview.preview?.mergePreview.conflicts, JSON.stringify(selfPreview.preview?.mergePreview.actions.occurrences)).toEqual([]);
      expect(selfPreview.preview?.mergePreview.actions.notes.map((action) => action.action), JSON.stringify(selfPreview.preview?.mergePreview.actions.notes)).toEqual(["map_to_existing", "map_to_existing"]);
      expect(selfPreview.preview?.mergePreview.actions.interventions.map((action) => action.action)).toEqual(["map_to_existing"]);
      const selfForm = accepted(selfExport.bytes!, selfPreview, "import"); selfForm.set("confirm_sensitive_notes", "yes");
      const selfApplied = await applyLocalBehaviorLogImport(profile, selfForm, NOW);
      expect(selfApplied.status, selfApplied.message ?? "").toBe("applied");
      const selfSnapshot = await localCommand("readImportSnapshot", { profileId: profile.id });
      expect(selfSnapshot.importedNotes).toEqual(stored.importedNotes);
      expect(selfSnapshot.importedInterventions).toEqual(stored.importedInterventions);
    }

    const downloaded = await getLocalExportDownload(profile, "behaviorlog", { range: "all", now: NOW, includeNotes: true, includeTimeTracking: true });
    const restore = await previewLocalBehaviorLogRestore(profile, upload(downloaded.bytes!, "restore_behaviorlog_file"), NOW);
    expect(restore.preview?.errors, restore.message ?? "").toEqual([]);
    const restoreForm = accepted(downloaded.bytes!, restore, "restore"); restoreForm.set("confirm_sensitive_notes", "yes");
    const restored = await applyLocalBehaviorLogRestore(profile, restoreForm, NOW);
    expect(restored.status, restored.message ?? "").toBe("applied");
    const after = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(after.occurrences).toHaveLength(2); expect(after.timeSessions).toHaveLength(1);
    expect(after.importedInterventions).toHaveLength(1);
    expect(after.importedInterventions[0]).toMatchObject({ channel: "other", delivery_status: "delivered" });
    expect((await localCommand("readNativeReminderState", { profileId: profile.id })).reminders).toEqual([]);
    const finalExport = await localCommand("readExportSnapshot", { profileId: profile.id,
      startLocalDate: null, endLocalDate: "9999-12-31", throughStartedAt: NOW.toString(), includeTimeTracking: true });
    expect(finalExport.reminderDeliveries).toEqual([]); expect(finalExport.nativeReminders).toEqual([]);
    const restoredExport = await getLocalExportPageData(profile, { range: "all", now: NOW, includeNotes: true, includeTimeTracking: true });
    const restoredOccurrences = restoredExport.behaviorLog.files.find((file) => file.path === "data/occurrences.jsonl")!.content.trim().split("\n").map((line) => JSON.parse(line));
    expect(restoredOccurrences.find((row) => row.local_date === "2026-09-01")).not.toHaveProperty("configuration_event_id");
    const restoredHistory = restoredExport.behaviorLog.files.find((file) => file.path === "data/behavior_configuration_events.jsonl")!.content.trim().split("\n").map((line) => JSON.parse(line));
    expect(restoredHistory.filter((row) => row.recorded_at_utc === "2026-05-01T12:00:00Z")).toHaveLength(1);
    expect(restoredHistory).toHaveLength(histories.length);
    const secondZip = createDesktopZip(restoredExport.behaviorLog.files);
    const secondPreview = await previewLocalBehaviorLogRestore(profile, upload(secondZip, "restore_behaviorlog_file"), NOW.add({ seconds: 1 }));
    expect(secondPreview.preview?.errors, secondPreview.message ?? "").toEqual([]);
    const secondForm = accepted(secondZip, secondPreview, "restore"); secondForm.set("confirm_sensitive_notes", "yes");
    expect((await applyLocalBehaviorLogRestore(profile, secondForm, NOW.add({ seconds: 1 }))).status).toBe("applied");
    const secondExport = await getLocalExportPageData(profile, { range: "all", now: NOW.add({ seconds: 1 }), includeNotes: true, includeTimeTracking: true });
    expect(secondExport.behaviorLog.files.find((file) => file.path === "data/behavior_configuration_events.jsonl")!.content.trim().split("\n").map((line) => JSON.parse(line)))
      .toEqual(restoredHistory);
    expect(notify).not.toHaveBeenCalled();
  });

  it("applies an accepted import atomically, rejects substituted bytes, merges mappings, and resumes a repeated apply", async () => {
    const profile = await localCommand("readProfile", {}); const zip = createDesktopZip(portabilityFiles());
    const preview = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    expect(preview.status, preview.message ?? "").toBe("previewed");
    const form = accepted(zip, preview, "import");
    const changed = accepted(zip, preview, "import"); changed.set("bundle_payload", Buffer.from(createStoredZip(portabilityFiles())).toString("base64"));
    expect((await applyLocalBehaviorLogImport(profile, changed, NOW)).status).toBe("error");
    expect((await localCommand("readImportSnapshot", { profileId: profile.id })).graphs).toHaveLength(0);
    const result = await applyLocalBehaviorLogImport(profile, form, NOW);
    expect(result.status, result.message ?? "").toBe("applied");
    const after = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(after.graphs).toHaveLength(1); expect(after.occurrences).toHaveLength(1);
    expect(after.graphs[0].behavior.title).toBe("Brush teeth");
    expect(after.configurationEvents).toHaveLength(1);
    const repeated = await applyLocalBehaviorLogImport(profile, form, NOW);
    expect(repeated.status, repeated.message ?? "").toBe("applied");
    expect(repeated.applyResult?.importRun.id).toBe(result.applyResult?.importRun.id);
    const merge = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    expect(merge.status, merge.message ?? "").toBe("previewed");
    expect(merge.preview?.mergePreview.conflicts).toEqual([]);
    const merged = await applyLocalBehaviorLogImport(profile, accepted(zip, merge, "import"), NOW);
    expect(merged.status, merged.message ?? "").toBe("applied");
    const final = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(final.graphs).toHaveLength(1); expect(final.occurrences).toHaveLength(1);
    expect(final.definitionEvents).toHaveLength(1);
  });

  it("requires restore acknowledgements and restores a reviewed snapshot with immutable lineage", async () => {
    const profile = await localCommand("readProfile", {}); const zip = createDesktopZip(portabilityFiles());
    const preview = await previewLocalBehaviorLogRestore(profile, upload(zip, "restore_behaviorlog_file"), NOW);
    expect(preview.status, preview.message ?? "").toBe("previewed");
    const form = accepted(zip, preview, "restore");
    const missing = accepted(zip, preview, "restore"); missing.delete("confirm_backup");
    expect((await applyLocalBehaviorLogRestore(profile, missing, NOW)).status).toBe("error");
    const applied = await applyLocalBehaviorLogRestore(profile, form, NOW);
    expect(applied.status, applied.message ?? "").toBe("applied");
    const snapshot = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(snapshot.graphs).toHaveLength(1);
    expect(snapshot.occurrences[0].behavior_configuration_event_id).toBeNull();
    expect(snapshot.importRuns.find((run) => run.status === "applied")?.dry_run_summary).toMatchObject({portability: {version:1}});
    expect(snapshot.definitionEvents).toHaveLength(1);
    const repeated = await applyLocalBehaviorLogRestore(profile, form, NOW);
    expect(repeated.status, repeated.message ?? "").toBe("applied");
    expect(repeated.applyResult?.importRun.id).toBe(applied.applyResult?.importRun.id);
  });
  it("restores replaced definitions and archives only the reviewed extra Behavior", async () => {
    const profile = await localCommand("readProfile", {}); const zip = createDesktopZip(portabilityFiles());
    const initial = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    expect((await applyLocalBehaviorLogImport(profile, accepted(zip, initial, "import"), NOW)).status).toBe("applied");
    const before = await localCommand("readImportSnapshot", { profileId: profile.id });
    const behavior = before.graphs[0].behavior;
    const values = { title: "Edited locally", description: "Local definition", categoryId: behavior.category_id, recurrenceRule: { frequency: "daily" as const, interval: 1 }, scheduledTime: "22:00", schedules: [{ recurrenceRule: { frequency: "daily" as const, interval: 1 }, sortOrder: 0, timeEntries: [{ kind: "exact" as const, preset: null, startTime: "22:00", endTime: null, sortOrder: 0 }] }], browserReminderEnabled: true, emailReminderEnabled: false, reminderOffsetMinutes: 0, active: true };
    await updateBehavior(createLocalBehaviorStore(profile.id, NOW.add({ seconds: 1 })), { behaviorId: behavior.id, expectedUpdatedAt: behavior.updated_at, values, recordedAt: NOW.add({ seconds: 1 }).toString() });
    const extra = await createBehavior(createLocalBehaviorStore(profile.id, NOW.add({ seconds: 2 })), { userId: profile.id, timezone: profile.timezone, values: { ...values, title: "Extra Behavior" }, recordedAt: NOW.add({ seconds: 2 }).toString() });
    const preview = await previewLocalBehaviorLogRestore(profile, upload(zip, "restore_behaviorlog_file"), NOW.add({ seconds: 3 }));
    expect(preview.status, preview.message ?? "").toBe("previewed");
    expect(preview.preview?.actions.behaviors).toEqual(expect.arrayContaining([expect.objectContaining({ action: "replace", localId: behavior.id }), expect.objectContaining({ action: "archive", localId: extra.id })]));
    const restored = await applyLocalBehaviorLogRestore(profile, accepted(zip, preview, "restore"), NOW.add({ seconds: 4 }));
    expect(restored.status, restored.message ?? "").toBe("applied");
    const after = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(after.graphs.find((graph) => graph.behavior.id === behavior.id)?.behavior.title).toBe("Brush teeth");
    expect(after.graphs.find((graph) => graph.behavior.id === extra.id)?.behavior.active).toBe(false);
    expect(after.definitionEvents.filter((event) => event.behavior_id === behavior.id)).toHaveLength(3);
  });

  it("imports explicit status history, note and timing without creating operational reminders", async () => {
    const profile = await localCommand("readProfile", {}); const zip = createDesktopZip(richPortabilityFiles());
    const preview = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    expect(preview.status, preview.message ?? "").toBe("previewed");
    const form = accepted(zip, preview, "import"); form.set("confirm_sensitive_notes", "yes");
    const applied = await applyLocalBehaviorLogImport(profile, form, NOW);
    expect(applied.status, applied.message ?? "").toBe("applied");
    const snapshot = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(snapshot.statusEvents).toHaveLength(1);
    expect(snapshot.statusEvents[0]).toMatchObject({ status: "completed", status_semantics: "explicit_user_mark", source_confidence: "high" });
    expect(snapshot.occurrences[0]).toMatchObject({ status: "completed", note: "Sensitive imported note" });
    expect(snapshot.timeSessions).toHaveLength(1);
    expect(snapshot.importedNotes).toHaveLength(1);
    expect((await localCommand("readNativeReminderState", { profileId: profile.id })).reminders).toEqual([]);
  });

  it("rejects a stale accepted import after a local note changes", async () => {
    const profile = await localCommand("readProfile", {}); const zip = createDesktopZip(portabilityFiles());
    const first = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    expect((await applyLocalBehaviorLogImport(profile, accepted(zip, first, "import"), NOW)).status).toBe("applied");
    const preview = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    const before = await localCommand("readImportSnapshot", { profileId: profile.id });
    await saveLocalOccurrenceNote(profile.id, { occurrenceId: before.occurrences[0].id, expectedNote: "", note: "Changed after preview" }, NOW.add({ seconds: 1 }));
    const result = await applyLocalBehaviorLogImport(profile, accepted(zip, preview, "import"), NOW.add({ seconds: 2 }));
    expect(result.status).toBe("error"); expect(result.message).toContain("Local data changed");
    const after = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(after.occurrences[0].note).toBe("Changed after preview");
    expect(after.importRuns.filter((run) => run.status === "applied")).toHaveLength(1);
  });

  it("blocks restricted notes without acknowledgement before binding product writes", async () => {
    const profile = await localCommand("readProfile", {}); const files = richPortabilityFiles();
    const notes = files.find(({ path }) => path === "data/notes.jsonl")!;
    notes.content = notes.content.trim().split("\n").map((line) => JSON.stringify({ ...JSON.parse(line), sensitivity: "restricted" })).join("\n") + "\n";
    const manifestFile = files.find(({ path }) => path === "manifest.json")!; const manifest = JSON.parse(manifestFile.content);
    manifest.files.find((file: { path: string }) => file.path === notes.path).sha256 = createHash("sha256").update(notes.content).digest("hex"); manifestFile.content = JSON.stringify(manifest);
    const zip = createDesktopZip(files); const preview = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW);
    expect(preview.preview?.valid, JSON.stringify(preview.preview?.errors)).toBe(true);
    const form = accepted(zip, preview, "import");
    const blocked = await applyLocalBehaviorLogImport(profile, form, NOW);
    expect(blocked.status).toBe("error"); expect(blocked.message).toContain("acknowledge high or restricted");
    expect((await localCommand("readImportSnapshot", { profileId: profile.id })).graphs).toEqual([]);
    form.set("confirm_sensitive_notes", "yes");
    const applied = await applyLocalBehaviorLogImport(profile, form, NOW);
    expect(applied.status, applied.message ?? "").toBe("applied");
  });

  it("restores its own native export after merge without replacing reviewed Keep graphs", async () => {
    const profile = await localCommand("readProfile", {});
    const values = { title: "Native self export", description: "Keep this definition", categoryId: null,
      recurrenceRule: { frequency: "daily" as const, interval: 1 }, scheduledTime: "08:00",
      schedules: [{ recurrenceRule: { frequency: "daily" as const, interval: 1 }, sortOrder: 0, timeEntries: [{ kind: "exact" as const, preset: null, startTime: "08:00", endTime: null, sortOrder: 0 }] }],
      browserReminderEnabled: true, emailReminderEnabled: false, reminderOffsetMinutes: 0, active: true };
    const behavior = await createBehavior(createLocalBehaviorStore(profile.id, NOW), { userId: profile.id, timezone: profile.timezone, values, recordedAt: NOW.toString() });
    await ensureLocalOccurrencesFresh(profile, NOW);
    const before = await localCommand("readImportSnapshot", { profileId: profile.id });
    const occurrence = before.occurrences.find((row) => row.local_date === "2026-08-30")!;
    await saveLocalOccurrenceNote(profile.id, { occurrenceId: occurrence.id, expectedNote: "", note: "Private native note" }, NOW);
    await trackLocalOccurrence(profile.id, occurrence.id, "start", NOW.add({ seconds: 1 }));
    await trackLocalOccurrence(profile.id, occurrence.id, "stop", NOW.add({ seconds: 61 }));
    const download = await getLocalExportDownload(profile, "behaviorlog", { now: NOW.add({ seconds: 90 }), range: "30", includeNotes: true, includeTimeTracking: true });
    const zip = download.bytes!;
    const preview = await previewLocalBehaviorLogImport(profile, upload(zip, "behaviorlog_file"), NOW.add({ seconds: 91 }));
    expect(preview.status, preview.message ?? "").toBe("previewed");
    const mergeForm = accepted(zip, preview, "import"); mergeForm.set("confirm_sensitive_notes", "yes");
    const merged = await applyLocalBehaviorLogImport(profile, mergeForm, NOW.add({ seconds: 92 }));
    expect(merged.status, merged.message ?? "").toBe("applied");
    const reexport = await getLocalExportPageData(profile, { now: NOW.add({ seconds: 92 }), range: "all" });
    expect(reexport.behaviorLog.files.find((file) => file.path === "data/behavior_configuration_events.jsonl")!.content.trim().split("\n").map((line) => JSON.parse(line).event_id))
      .toEqual(before.configurationEvents.map((event) => event.id));
    const restore = await previewLocalBehaviorLogRestore(profile, upload(zip, "restore_behaviorlog_file"), NOW.add({ seconds: 93 }));
    expect(restore.status, restore.message ?? "").toBe("previewed");
    expect(restore.preview?.errors).toEqual([]);
    expect(restore.preview?.valid).toBe(true);
    expect(restore.preview?.actions.behaviors).toEqual([expect.objectContaining({ action: "keep", localId: behavior.id })]);
    expect(restore.preview?.actions.schedules.every((action) => action.action === "keep")).toBe(true);
    const restoreForm = accepted(zip, restore, "restore"); restoreForm.set("confirm_sensitive_notes", "yes");
    const restored = await applyLocalBehaviorLogRestore(profile, restoreForm, NOW.add({ seconds: 94 }));
    expect(restored.status, restored.message ?? "").toBe("applied");
    const after = await localCommand("readImportSnapshot", { profileId: profile.id });
    expect(after.graphs[0]).toEqual(before.graphs[0]);
    expect(after.configurationEvents).toEqual(before.configurationEvents);
    expect(after.occurrences).toHaveLength(1);
    expect(after.occurrences[0].note).toBe("Private native note");
    expect(after.timeSessions).toHaveLength(1);
  });

});
function upload(zip: Uint8Array, field: string) { const form = new FormData(); form.set(field, new File([new Uint8Array(zip)], "fixture.behaviorlog.zip")); return form; }
function accepted(zip: Uint8Array, preview: BehaviorLogImportActionState | BehaviorLogRestoreActionState, kind: "import" | "restore") {
  const form = new FormData(); form.set("bundle_payload", Buffer.from(zip).toString("base64")); form.set("upload_file_name", "fixture.behaviorlog.zip"); form.set("upload_file_size", String(zip.length));
  form.set(kind === "import" ? "import_preview_run_id" : "restore_preview_run_id", preview.previewRun!.id);
  form.set("preview_fingerprint", preview.preview!.previewFingerprint); form.set("local_data_fingerprint", preview.preview!.localDataFingerprint); form.set("bundle_fingerprint", preview.preview!.bundleFingerprint); form.set("archive_fingerprint", preview.archiveFingerprint!);
  form.set("import_mode", "merge_by_user_approved_plan"); form.set("confirm_apply", "yes"); form.set("confirm_backup", "yes"); form.set("confirm_restore_text", "RESTORE"); return form;
}
