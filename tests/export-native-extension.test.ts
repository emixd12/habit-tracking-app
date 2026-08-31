import { Temporal } from "@js-temporal/polyfill";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleExportBundle, type ExportAssemblyInput } from "@cadence/core/services/export-assembly";
import { sha256 } from "@cadence/core/hash";
import { USER_ID, storedBehavior, storedConfigurationEvent, storedExportOccurrence } from "./helpers/export-row-fixture";
import { behaviorLog03Files } from "./helpers/behaviorlog-03-fixture";

const input: ExportAssemblyInput = {
  userId: USER_ID, timezone: "America/New_York", now: Temporal.Instant.from("2026-06-08T16:00:00Z"), range: "all",
  categories: [], behaviors: [storedBehavior()], behaviorDefinitionEvents: [],
  behaviorConfigurationEvents: [storedConfigurationEvent()], occurrences: [storedExportOccurrence()],
  statusEvents: [], reminderDeliveries: [], timeSessions: [],
};
const native = {
  id: "native-1", occurrenceId: storedExportOccurrence().id, requestId: "request-1", fireAt: "2026-05-01T22:00:00Z",
  status: "scheduled" as const, verifiedAt: "2026-05-01T12:00:00Z", createdAt: "2026-05-01T12:00:00Z",
  updatedAt: "2026-05-01T12:00:00Z", title: "Do not export this title", body: "Private note", error: "Private raw error",
};

describe("native reminder export extension", () => {
  it("keeps current formats exact and adds only filtered extension data with verified file hashes", () => {
    const web = assembleExportBundle(input);
    const desktop = assembleExportBundle({ ...input, nativeReminders: [native, { ...native, id: "excluded", occurrenceId: "other" }] });
    expect([desktop.jsonl, desktop.csv, desktop.json, desktop.markdownSummary])
      .toEqual([web.jsonl, web.csv, web.json, web.markdownSummary]);
    const file = desktop.behaviorLog.files.find(({ path }) => path === "raw/cadence/native_reminders.jsonl");
    expect(file).toBeDefined();
    const row = JSON.parse(file!.content);
    expect(row).toMatchObject({ id: "native-1", occurrence_id: native.occurrenceId, request_id: "request-1",
      fire_at_utc: native.fireAt, state: "scheduled", verified_at_utc: native.verifiedAt });
    expect(row).not.toHaveProperty("title");
    expect(row).not.toHaveProperty("body");
    expect(row).not.toHaveProperty("error");
    const manifest = JSON.parse(desktop.behaviorLog.files[0].content);
    expect(manifest.extensions["app.cadence"].native_reminders).toMatchObject({ path: file!.path, record_count: 1,
      import_restore_support: "export_only", user_receipt: "unverified" });
    expect(manifest.files.find((entry: { path: string }) => entry.path === file!.path).sha256).toBe(sha256(file!.content));
    expect(manifest.schema_version).toBe(JSON.parse(web.behaviorLog.files[0].content).schema_version);
    expect(desktop.behaviorLog.files.find(({ path }) => path === "schema.json")!.content)
      .toBe(web.behaviorLog.files.find(({ path }) => path === "schema.json")!.content);
    const intervention = JSON.parse(desktop.behaviorLog.files.find(({ path }) => path === "data/interventions.jsonl")!.content);
    expect(intervention).toMatchObject({ channel: "other", delivery_status: "planned" });
  });

  it("distinguishes native cue configuration without changing snapshot formats or privacy defaults", () => {
    const sensitive = { ...input, occurrences: [{ ...storedExportOccurrence(), note: "Private note" }] };
    expect(assembleExportBundle({ ...sensitive, nativeReminders: [] }).json).toEqual(assembleExportBundle(sensitive).json);
    const bundle = assembleExportBundle({ ...sensitive, nativeReminders: [native] });
    expect(bundle.jsonBackup.occurrences[0].note).toBeNull();
    expect(bundle.jsonBackup).not.toHaveProperty("time_sessions");
    expect(bundle.behaviorLog.files.map((file) => file.content).join("\n")).not.toContain("Private note");
  });

  it("passes the pinned upstream BehaviorLog validator without changing the core schema", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cadence-native-export-"));
    try {
      // This shared SQL/SQLite fixture includes delivered history and unknown future lineage.
      for (const file of behaviorLog03Files()) {
        const target = path.join(directory, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
      const result = spawnSync(process.execPath, ["scripts/behaviorlog-conformance.mjs", directory], { encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
