import { describe, expect, it } from "vitest";
import { resolveBehaviorLogImportPreview } from "@cadence/core/resolvers/behaviorlog-import.resolver";
import { createStoredZip, readZipEntries } from "../lib/services/zip";
import { createDesktopZip, readDesktopZipEntries } from "../apps/desktop/src/archive";
import { DEFAULT_ZIP_READ_LIMITS } from "../lib/services/zip-format";
import { MAX_BEHAVIORLOG_BUNDLE_BYTES } from "../lib/types/behaviorlog-bundle-ui";
import { capacityExport } from "./helpers/behaviorlog-capacity-fixture";

describe("multi-year BehaviorLog capacity", () => {
  it("keeps a maximum-sized base64 apply form within the configured web request ceiling", async () => {
    expect(DEFAULT_ZIP_READ_LIMITS.maxArchiveBytes).toBe(MAX_BEHAVIORLOG_BUNDLE_BYTES);
    const form = new FormData();
    form.set("bundle_payload", Buffer.alloc(MAX_BEHAVIORLOG_BUNDLE_BYTES).toString("base64"));
    for (const field of ["preview_fingerprint", "local_data_fingerprint", "bundle_fingerprint", "archive_fingerprint", "restore_preview_run_id", "import_preview_run_id"]) form.set(field, "a".repeat(64));
    form.set("upload_file_name", "all-time.behaviorlog.zip"); form.set("confirm_restore_text", "RESTORE");
    const body = await new Request("http://localhost", { method: "POST", body: form }).arrayBuffer();
    expect(body.byteLength).toBeLessThan(4.25 * 1024 * 1024);
    expect(body.byteLength).toBeLessThan(4_500_000);
  });

  it("exports five years through both ZIP adapters and preserves complete metadata", () => {
    const bundle = capacityExport();
    const files = bundle.behaviorLog.files;
    const sizes = files.map(file => Buffer.byteLength(file.content));
    for (const [create, read] of [[createStoredZip, readZipEntries], [createDesktopZip, readDesktopZipEntries]] as const) {
      const archive = create(files);
      const decoded = read(archive);
      const preview = resolveBehaviorLogImportPreview({ files: decoded });
      console.info(JSON.stringify({ zipBytes: archive.length, extractedBytes: sizes.reduce((a,b)=>a+b,0), largestEntry: Math.max(...sizes), metadataBytes: Buffer.byteLength(JSON.stringify(preview.portability)), errors: preview.errors }));
      expect(preview.valid).toBe(true);
      expect(preview.plan.occurrences).toHaveLength(7304);
      expect(preview.portability?.occurrences).toHaveLength(7304);
      expect(preview.portability?.configurationEvents).toHaveLength(20);
      expect(Buffer.byteLength(JSON.stringify(preview.portability))).toBeGreaterThan(256 * 1024);
    }
  }, 60_000);
});
