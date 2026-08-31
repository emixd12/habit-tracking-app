import { invoke } from "@tauri-apps/api/core";
import type { ExportDownloadPayload } from "@cadence/core/services/export-download";

export async function saveLocalExport(payload: ExportDownloadPayload): Promise<boolean> {
  const bytes = payload.bytes ?? new TextEncoder().encode(payload.text);
  try {
    return await invoke<boolean>("save_export", { filename: payload.filename, bytes: Array.from(bytes) });
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
