import { accountSyncFingerprint } from "@cadence/core/resolvers/account-sync.resolver";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect } from "vitest";
import { resolveBehaviorLogImportMergePreview } from "@cadence/core/resolvers/behaviorlog-import.resolver";
import { existingRecords } from "@cadence/core/services/behaviorlog-write-plan";
import { listBehaviorCategories, type AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { applyAcceptedBehaviorLogImportPlanAtomically, createBehaviorLogImportRunFromPreview } from "@/lib/services/behaviorlog-import-write.service";
import { getUserExportBundle } from "@/lib/services/export.service";
import { applyBehaviorLogRestoreUploadFromFormData, createBehaviorLogRestorePreviewRun } from "@/lib/services/behaviorlog-restore.service";
import { createStoredZip, readZipEntries } from "@/lib/services/zip";
import { capacityExport, capacityHistory, CAPACITY_NOW } from "./behaviorlog-capacity-fixture";
import { emptyPortabilitySnapshot } from "./portability-fixture";
import { restoreForm } from "./restore-sql-contract";

export async function exerciseCapacitySqlContract(client: AppSupabaseClient, userId: string) {
  const source = capacityExport(true);
  const zip = createStoredZip(source.behaviorLog.files);
  const files = readZipEntries(zip);
  const base = emptyPortabilitySnapshot();
  base.profile.id = userId;
  base.categories = await listBehaviorCategories(client, userId);
  const preview = resolveBehaviorLogImportMergePreview({ files, existing: existingRecords(base), convertNativeRemindersToBrowser: true });
  expect(preview.valid).toBe(true);
  const accepted = await createBehaviorLogImportRunFromPreview(client, {
    userId, files, preview, importMode: "merge_preview", startedAt: CAPACITY_NOW.toString(), completedAt: CAPACITY_NOW.toString(),
  });
  console.info("Capacity: applying import");
  const applied = await applyAcceptedBehaviorLogImportPlanAtomically(client, {
    userId, files, preview, importMode: "merge_by_user_approved_plan", acceptedPreviewRunId: accepted.id,
    acceptedPreviewFingerprint: preview.previewFingerprint, completedAt: CAPACITY_NOW.toString(),
  });
  expect(applied.created.occurrences).toBe(7304);
  const options = { range: "all" as const, now: CAPACITY_NOW, includeNotes: true, includeTimeTracking: true };
  console.info("Capacity: exporting imported history");
  const exported = await getUserExportBundle(options);
  expect(capacityHistory(exported.behaviorLog.files)).toEqual(capacityHistory(source.behaviorLog.files));
  const rezip = Buffer.from(createStoredZip(exported.behaviorLog.files));
  const fingerprint = createHash("sha256").update(rezip).digest("hex");
  console.info("Capacity: previewing restore");
  const restore = await createBehaviorLogRestorePreviewRun(client, { userId, files: readZipEntries(rezip), archiveFingerprint: fingerprint });
  expect(restore.preview.valid, JSON.stringify(restore.preview.errors)).toBe(true);
  console.info("Capacity: applying restore");
  const restored = await applyBehaviorLogRestoreUploadFromFormData(restoreForm(rezip, restore.preview, restore.importRun.id, fingerprint));
  expect(restored.status, restored.message ?? "").toBe("applied");
  const after = await getUserExportBundle(options);
  expect(capacityHistory(after.behaviorLog.files)).toEqual(capacityHistory(exported.behaviorLog.files));
  const sync = await client.rpc("read_account_sync_snapshot");
  if (sync.error) throw sync.error;
  const envelope = sync.data as unknown as { entities: Parameters<typeof accountSyncFingerprint>[0]["entities"]; fingerprint: string };
  expect(accountSyncFingerprint(envelope)).toBe(envelope.fingerprint);
  const report = { syncBytes: Buffer.byteLength(JSON.stringify(envelope.entities)), syncRows: envelope.entities.length, webCapacity: true, zipBytes: zip.length, reexportZipBytes: rezip.length };
  console.info(JSON.stringify(report));
  if (process.env.CADENCE_CAPACITY_REPORT) await writeFile(process.env.CADENCE_CAPACITY_REPORT, JSON.stringify(report));
}
