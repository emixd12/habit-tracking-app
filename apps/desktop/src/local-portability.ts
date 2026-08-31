import { Temporal } from "@js-temporal/polyfill";
import { sha256 } from "@cadence/core/hash";
import type { Json } from "@cadence/core/types/json";
import type { BehaviorLogImportFile, BehaviorLogImportMergePreviewResult } from "@cadence/core/types/behaviorlog-import";
import type { BehaviorLogRestorePreview } from "@cadence/core/types/behaviorlog-restore";
import type { LocalImportWritePlan, PortabilityImportRunRow, PortabilitySnapshot } from "@cadence/core/types/portability-rows";
import { readDesktopZipEntries } from "./archive";
import { localCommand, localMutation } from "./local-store";
import { DEFAULT_ZIP_READ_LIMITS } from "../../../lib/services/zip-format";
import { BEHAVIORLOG_BUNDLE_SIZE_ERROR } from "../../../lib/types/behaviorlog-bundle-ui";

export type LocalUploadBundle = { fileName: string; fileSize: number; files: BehaviorLogImportFile[]; archiveFingerprint: string };
export async function readLocalBundle(formData: FormData, field: "behaviorlog_file" | "restore_behaviorlog_file" | "bundle_payload"): Promise<LocalUploadBundle> {
  let bytes: Uint8Array<ArrayBuffer>; let fileName: string;
  if (field === "bundle_payload") {
    const encoded = requiredFormString(formData, field);
    if (encoded.length > Math.ceil(DEFAULT_ZIP_READ_LIMITS.maxArchiveBytes / 3) * 4) throw new Error(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
    let binary: string; try { binary = atob(encoded); } catch { throw new Error("The uploaded bundle payload is invalid."); }
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    fileName = String(formData.get("upload_file_name") ?? "uploaded.behaviorlog.zip");
  } else {
    const file = formData.get(field);
    if (!(file instanceof File)) throw new Error("Choose a .behaviorlog.zip file.");
    if (file.size > DEFAULT_ZIP_READ_LIMITS.maxArchiveBytes) throw new Error(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
    fileName = file.name.trim(); bytes = new Uint8Array(await file.arrayBuffer());
  }
  if (!fileName.endsWith(".behaviorlog.zip")) throw new Error("Unsupported file. Upload a .behaviorlog.zip bundle.");
  if (!bytes.length) throw new Error("The uploaded bundle is empty.");
  if (bytes.length > DEFAULT_ZIP_READ_LIMITS.maxArchiveBytes) throw new Error(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
  const files = readDesktopZipEntries(bytes).map((entry) => {
    if (!entry.path || entry.path.startsWith("/") || entry.path.includes("\\") || entry.path.split("/").includes("..")) throw new Error(`Unsafe ZIP entry path: ${entry.path || "(empty)"}.`);
    return { ...entry, mediaType: entry.path.endsWith(".jsonl") ? "application/jsonl" : entry.path.endsWith(".json") ? "application/json" : entry.path.endsWith(".md") ? "text/markdown" : "application/octet-stream" };
  });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer));
  return { fileName, fileSize: bytes.length, files, archiveFingerprint: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") };
}
export function previewRun(profileId: string, bundle: LocalUploadBundle, preview: BehaviorLogImportMergePreviewResult | BehaviorLogRestorePreview, now: string): PortabilityImportRunRow {
  const visiblePreview = { ...preview };
  if ("portability" in visiblePreview) delete visiblePreview.portability;
  const manifestFile = bundle.files.find(({ path }) => path === "manifest.json");
  let manifest: Record<string, unknown> = {}; try { manifest = JSON.parse(manifestFile?.content ?? "{}"); } catch { /* The resolver reports malformed manifests. */ }
  const producer = object(manifest.producer), privacy = object(manifest.privacy);
  return { id: crypto.randomUUID(), user_id: profileId, bundle_format: text(manifest.format) ?? "behaviorlog.bundle", schema_version: text(manifest.schema_version), manifest_sha256: manifestFile ? sha256(manifestFile.content) : null,
    bundle_fingerprint: preview.bundleFingerprint, producer_name: text(producer.name), producer_version: text(producer.version), subject_id_strategy: text(privacy.subject_id_strategy), privacy_redaction_level: text(privacy.redaction_level),
    import_mode: "mode" in preview ? "restore_preview" : "merge_preview", status: "previewed", accepted_preview_run_id: null, accepted_preview_fingerprint: null,
    dry_run_summary: json({ ...visiblePreview, errorCount: preview.errors.length, archiveFingerprint: bundle.archiveFingerprint, bundlePayloadFingerprint: bundle.archiveFingerprint }),
    failure_message: null, started_at: now, completed_at: now, created_at: now, updated_at: now };
}
export function applyRun(accepted: PortabilityImportRunRow, mode: LocalImportWritePlan["mode"], now: string): PortabilityImportRunRow {
  return { ...accepted, id: crypto.randomUUID(), import_mode: mode, accepted_preview_run_id: accepted.id, accepted_preview_fingerprint: String(object(accepted.dry_run_summary).previewFingerprint), started_at: now, completed_at: null, created_at: now, updated_at: now };
}
export function acceptedRun(snapshot: PortabilitySnapshot, form: FormData, bundle: LocalUploadBundle, kind: "import" | "restore"): PortabilityImportRunRow {
  const id = requiredFormString(form, kind === "import" ? "import_preview_run_id" : "restore_preview_run_id");
  const run = snapshot.importRuns.find((row) => row.id === id);
  if (!run || run.user_id !== snapshot.profile.id || run.import_mode !== (kind === "import" ? "merge_preview" : "restore_preview") || run.status !== "previewed") throw new Error("Preview the .behaviorlog.zip bundle again before applying.");
  const summary = object(run.dry_run_summary);
  for (const [field, key] of [["preview_fingerprint", "previewFingerprint"], ["local_data_fingerprint", "localDataFingerprint"], ["archive_fingerprint", "archiveFingerprint"]]) {
    if (requiredFormString(form, field) !== summary[key]) throw new Error("The import no longer matches the accepted preview run.");
  }
  if (kind === "import" && requiredFormString(form, "bundle_fingerprint") !== summary.bundleFingerprint) throw new Error("The bundle no longer matches the accepted preview run.");
  if (summary.valid !== true || summary.bundleFingerprint !== run.bundle_fingerprint || bundle.archiveFingerprint !== summary.archiveFingerprint) throw new Error("The uploaded bundle no longer matches the accepted preview. Preview it again.");
  return run;
}
export function assertFreshPreview(accepted: PortabilityImportRunRow, preview: BehaviorLogImportMergePreviewResult | BehaviorLogRestorePreview) {
  const summary = object(accepted.dry_run_summary);
  if (preview.localDataFingerprint !== summary.localDataFingerprint) throw new Error("Local data changed since this preview. Preview it again before applying.");
  if (preview.bundleFingerprint !== summary.bundleFingerprint || preview.previewFingerprint !== summary.previewFingerprint) throw new Error("The preview is stale. Preview it again before applying.");
}
export function applyStoredPlan(profileId: string, accepted: PortabilityImportRunRow, now: string, importMode: LocalImportWritePlan["mode"]) {
  const summary = object(accepted.dry_run_summary);
  return localCommand("applyBehaviorLogImport", { ...localMutation(profileId, now), previewRunId: accepted.id, importMode, previewFingerprint: String(summary.previewFingerprint), localDataFingerprint: String(summary.localDataFingerprint), bundleFingerprint: String(summary.bundleFingerprint), bundlePayloadFingerprint: String(summary.bundlePayloadFingerprint ?? summary.archiveFingerprint) });
}
export function checkedApplyResult(result: Awaited<ReturnType<typeof applyStoredPlan>>) {
  if (result.status !== "applied" || !result.result) throw new Error(result.error ?? "BehaviorLog import could not be completed.");
  return result;
}
export function requiredFormString(form: FormData, field: string) { const value = form.get(field); if (typeof value !== "string" || !value.trim()) throw new Error("Preview the .behaviorlog.zip bundle again before applying."); return value.trim(); }
export function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function json(value: unknown): Json { return JSON.parse(JSON.stringify(value)) as Json; }
export function portabilityNow(now?: Temporal.Instant) { return (now ?? Temporal.Now.instant()).toString(); }
export function portabilityError(error: unknown) { return error instanceof Error ? error.message : "BehaviorLog import could not be completed."; }
