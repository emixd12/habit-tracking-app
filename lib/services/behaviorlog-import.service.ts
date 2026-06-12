import {
  resolveBehaviorLogImportPreview,
  type ResolveBehaviorLogImportPreviewInput,
} from "@/lib/resolvers/behaviorlog-import.resolver";
import { readZipEntries } from "@/lib/services/zip";
import type {
  BehaviorLogExistingRecords,
  BehaviorLogImportFile,
  BehaviorLogImportPreview,
} from "@/lib/types/behaviorlog-import";

export type BehaviorLogZipInput = Buffer | Uint8Array | ArrayBuffer;

export function parseBehaviorLogZipFiles(
  zip: BehaviorLogZipInput,
): BehaviorLogImportFile[] {
  return readZipEntries(zip).map((entry) => {
    assertSafeZipPath(entry.path);

    return {
      path: entry.path,
      mediaType: inferMediaType(entry.path),
      content: entry.content,
    };
  });
}

export function previewBehaviorLogImportFromZip(input: {
  zip: BehaviorLogZipInput;
  existing?: BehaviorLogExistingRecords;
  supportedSchemaVersions?: readonly string[];
}): BehaviorLogImportPreview {
  return resolveBehaviorLogImportPreview({
    files: parseBehaviorLogZipFiles(input.zip),
    existing: input.existing,
    supportedSchemaVersions: input.supportedSchemaVersions,
  });
}

export function previewBehaviorLogImportFromFiles(
  input: ResolveBehaviorLogImportPreviewInput,
): BehaviorLogImportPreview {
  return resolveBehaviorLogImportPreview(input);
}

function assertSafeZipPath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error(`Unsafe ZIP entry path: ${path || "(empty)"}.`);
  }
}

function inferMediaType(path: string): string {
  if (path.endsWith(".json")) {
    return "application/json";
  }

  if (path.endsWith(".jsonl")) {
    return "application/jsonl";
  }

  if (path.endsWith(".md")) {
    return "text/markdown";
  }

  return "application/octet-stream";
}
