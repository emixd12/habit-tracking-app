import {
  ExportPanel,
  type ExportPanelProps,
} from "@/components/export/ExportPanel";
import type { ExportDownloadFormat } from "@cadence/core/services/export-download";
import { DesktopScreenFrame } from "./desktop-screen-frame";
import type { ExportOptions } from "@cadence/core/services/export-assembly";
import type { BehaviorLogImportFormAction } from "@/lib/types/behaviorlog-import-ui";
import type { BehaviorLogRestoreFormAction } from "@/lib/types/behaviorlog-restore-ui";
import { getLocalExportPageData, getLocalExportDownload } from "./local-export.service";
import { getLocalBehaviorLogImportPageData, previewLocalBehaviorLogImport, applyLocalBehaviorLogImport } from "./local-import.service";
import { getLocalBehaviorLogRestorePageData, previewLocalBehaviorLogRestore, applyLocalBehaviorLogRestore } from "./local-restore.service";
import { saveLocalExport } from "./local-files";
import { localCommand } from "./local-store";
import { localErrorMessage } from "./local-actions";

async function readExportScreen(options: ExportOptions) {
  const profile = await localCommand("readProfile", {});
  const exportData = await getLocalExportPageData(profile, options);
  const [importData, restoreData] = await Promise.all([
    getLocalBehaviorLogImportPageData(profile), getLocalBehaviorLogRestorePageData(profile),
  ]);
  return { exportData, importData, restoreData };
}

export function LocalExportScreen({ onChanged }: { onChanged: () => void }) {
  const [options, setOptions] = useState<ExportOptions>({});
  const [data, setData] = useState<Awaited<ReturnType<typeof readExportScreen>> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void readExportScreen(options).then((result) => {
      if (active) { setData(result); setError(""); }
    }).catch((failure) => { if (active) setError(localErrorMessage(failure)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [options, revision]);
  const reload = () => { setBusy(true); setRevision((value) => value + 1); };
  const importAction: BehaviorLogImportFormAction = async (previous, form) => {
    try {
      const profile = await localCommand("readProfile", {});
      const intent = form.get("intent");
      const result = intent === "preview" ? await previewLocalBehaviorLogImport(profile, form)
        : intent === "apply" ? await applyLocalBehaviorLogImport(profile, form)
        : { ...previous, status: "error" as const, message: "Choose an import action." };
      reload();
      if (result.status === "applied") onChanged();
      return result;
    } catch (failure) { return { ...previous, status: "error", message: localErrorMessage(failure) }; }
  };
  const restoreAction: BehaviorLogRestoreFormAction = async (previous, form) => {
    try {
      const profile = await localCommand("readProfile", {});
      const intent = form.get("intent");
      const result = intent === "restore_preview" ? await previewLocalBehaviorLogRestore(profile, form)
        : intent === "restore_apply" ? await applyLocalBehaviorLogRestore(profile, form)
        : { ...previous, status: "error" as const, message: "Choose a restore action." };
      reload();
      if (result.status === "applied") onChanged();
      return result;
    } catch (failure) { return { ...previous, status: "error", message: localErrorMessage(failure) }; }
  };
  const download = async (format: ExportDownloadFormat) => {
    setBusy(true); setError(""); setDownloadStatus("");
    try {
      const profile = await localCommand("readProfile", {});
      const payload = await getLocalExportDownload(profile, format, options);
      const saved = await saveLocalExport(payload);
      setDownloadStatus(saved ? `Saved ${payload.filename}.` : "Save cancelled. No file was written.");
    } catch (failure) { setError(localErrorMessage(failure)); }
    finally { setBusy(false); }
  };
  if (!data) return <DesktopScreenFrame title="Export & Import">
    {error ? <div role="alert"><p>{error}</p><button className="product-action product-action-primary mt-3" onClick={reload}>Try again</button></div>
      : <p role="status">Opening local exports and import history…</p>}
  </DesktopScreenFrame>;
  return <ExportScreen {...data} importAction={importAction} restoreAction={restoreAction}
    busy={busy} error={error} downloadStatus={downloadStatus} onDownload={(format) => { void download(format); }}
    onApplyOptions={(form) => {
      setBusy(true); setDownloadStatus("");
      setOptions({ range: String(form.get("range") ?? ""), includeArchived: form.get("include_archived") === "1",
        includeNotes: form.get("include_notes") === "1", includeTimeTracking: form.get("include_time_tracking") === "1" });
    }} />;
}

export type ExportScreenProps = ExportPanelProps &
  Readonly<{
    onApplyOptions: (formData: FormData) => void;
    onDownload: (format: ExportDownloadFormat) => void;
    busy: boolean;
  }>;

export function ExportScreen(props: ExportScreenProps) {
  return (
    <DesktopScreenFrame title="Export & Import">
      <ExportPanel {...props} />
    </DesktopScreenFrame>
  );
}
import { useEffect, useState } from "react";
