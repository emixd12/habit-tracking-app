import type { BehaviorLogFile, ExportBundle } from "../types/export";

export type ExportDownloadFormat = "jsonl" | "csv" | "json" | "markdown" | "behaviorlog";
export type ExportDownloadPayload = { filename: string; mimeType: string } & (
  { text: string; bytes?: never } | { bytes: Uint8Array; text?: never }
);

export async function buildExportDownload(bundle: ExportBundle, format: ExportDownloadFormat,
  archive?: (files: BehaviorLogFile[]) => Uint8Array | Promise<Uint8Array>): Promise<ExportDownloadPayload> {
  switch (format) {
    case "jsonl": return { filename: `${bundle.fileBaseName}.jsonl`, mimeType: "application/x-ndjson; charset=utf-8", text: bundle.jsonl };
    case "csv": return { filename: `${bundle.fileBaseName}.csv`, mimeType: "text/csv; charset=utf-8", text: bundle.csv };
    case "json": return { filename: `${bundle.fileBaseName}.json`, mimeType: "application/json; charset=utf-8", text: bundle.json };
    case "markdown": return { filename: bundle.markdownFileName, mimeType: "text/markdown; charset=utf-8", text: bundle.markdownSummary };
    case "behaviorlog": {
      if (!archive) throw new Error("A ZIP archive adapter is required for BehaviorLog downloads.");
      return { filename: bundle.behaviorLog.fileName, mimeType: "application/zip", bytes: await archive(bundle.behaviorLog.files) };
    }
  }
}
