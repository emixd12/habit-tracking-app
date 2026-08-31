"use client";

import { BehaviorLogImportPanel } from "@/components/export/BehaviorLogImportPanel";
import { BehaviorLogRestorePanel } from "@/components/export/BehaviorLogRestorePanel";
import { ExportRangeSelector } from "@/components/export/ExportRangeSelector";
import { MarkdownSummaryActions } from "@/components/export/MarkdownSummaryActions";
import { PromptLibraryPanel } from "@/components/export/PromptLibraryPanel";
import type {
  BehaviorLogImportFormAction,
  BehaviorLogImportPageData,
} from "@/lib/types/behaviorlog-import-ui";
import type {
  BehaviorLogRestoreFormAction,
  BehaviorLogRestorePageData,
} from "@/lib/types/behaviorlog-restore-ui";
import type { ExportBundle } from "@/lib/types/export";
import type { ExportDownloadFormat } from "@cadence/core/services/export-download";

export type ExportPanelProps = Readonly<{
  exportData: ExportBundle;
  importData: BehaviorLogImportPageData;
  restoreData: BehaviorLogRestorePageData;
  importAction: BehaviorLogImportFormAction;
  restoreAction: BehaviorLogRestoreFormAction;
  onApplyOptions?: (formData: FormData) => void;
  onDownload?: (format: ExportDownloadFormat) => void;
  busy?: boolean;
  downloadStatus?: string;
  error?: string;
}>;

const DOWNLOAD_ACTIONS = [
  {
    format: "jsonl",
    label: "JSONL (.jsonl)",
    description:
      "Line-oriented app-native rows for scripts, agents, and quick inspection.",
  },
  {
    format: "csv",
    label: "CSV (.csv)",
    description:
      "Spreadsheet review of occurrence snapshots for the selected range.",
  },
  {
    format: "json",
    label: "App JSON backup (.json)",
    description:
      "App-native categories, behaviors, occurrence snapshots, status-event history, and complete behavior definition, schedule, and reminder history.",
  },
  {
    format: "behaviorlog",
    label: "BehaviorLog bundle (.behaviorlog.zip)",
    description:
      "BehaviorLog core records, standard definition and configuration history, reminder rules, optional standard time sessions, and CSV views.",
  },
] as const;

export function ExportPanel({
  exportData,
  importData,
  restoreData,
  importAction,
  restoreAction,
  onApplyOptions,
  onDownload,
  busy = false,
  downloadStatus,
  error,
}: ExportPanelProps) {
  return (
    <div className="grid gap-12">
      <section className="grid gap-8" aria-labelledby="export-section-title">
        <div className="border-b border-line pb-4">
          <h2 id="export-section-title" className="text-2xl leading-tight">
            Export
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-muted-readable">
            Set the options once. The counts, downloads, and AI summary use the
            same selected range, archived-behavior setting, and note setting.
          </p>
        </div>

        <section
          className="bg-background py-1"
          aria-labelledby="export-options-title"
        >
          <h3 id="export-options-title" className="text-xl leading-tight">
            Options
          </h3>

          <form
            key={`${exportData.range.key}:${exportData.includeArchived}:${exportData.includeNotes}:${exportData.includeTimeTracking}`}
            method="get"
            onSubmit={
              onApplyOptions
                ? (event) => {
                    event.preventDefault();
                    if (!busy)
                      onApplyOptions(new FormData(event.currentTarget));
                  }
                : undefined
            }
            className="mt-4 grid gap-5"
          >
            <ExportRangeSelector
              key={exportData.range.key}
              rangeOptions={exportData.rangeOptions}
              selectedRangeKey={exportData.range.key}
              disabled={busy}
            />

            <div className="grid gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Selected range
                </p>
                <p className="mt-1 break-words text-sm text-muted-readable">
                  {exportData.range.summaryLabel} · {exportData.timezone}
                </p>
              </div>
              <dl className="grid gap-2">
                <ExportStat
                  label="Behaviors"
                  value={exportData.behaviorCount}
                />
                <ExportStat
                  label="Occurrences"
                  value={exportData.occurrenceCount}
                />
                <ExportStat
                  label="Default adherence"
                  value={exportData.overallAdherenceLabel}
                />
                {exportData.includeTimeTracking ? (
                  <ExportStat
                    label="Timing sessions"
                    value={exportData.timeSessionCount ?? 0}
                  />
                ) : null}
              </dl>
            </div>

            <div className="grid gap-3">
              <label className="flex w-fit items-start gap-3 text-sm font-bold">
                <input
                  type="checkbox"
                  name="include_archived"
                  value="1"
                  defaultChecked={exportData.includeArchived}
                  disabled={busy}
                  className="mt-0.5 h-5 w-5 accent-foreground"
                />
                <span>Include archived behaviors</span>
              </label>

              <label className="flex max-w-3xl items-start gap-3 text-sm font-bold">
                <input
                  type="checkbox"
                  name="include_notes"
                  value="1"
                  defaultChecked={exportData.includeNotes}
                  disabled={busy}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-foreground"
                />
                <span>
                  Include occurrence notes
                  <span className="mt-1 block font-normal text-muted-readable">
                    Off by default. Notes can contain private context, so every
                    export output omits them unless this is selected.
                  </span>
                </span>
              </label>

              <label className="flex max-w-3xl items-start gap-3 text-sm font-bold">
                <input
                  type="checkbox"
                  name="include_time_tracking"
                  value="1"
                  defaultChecked={exportData.includeTimeTracking}
                  disabled={busy}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-foreground"
                />
                <span>
                  Include time tracking
                  <span className="mt-1 block font-normal text-muted-readable">
                    Off by default. Exact timing-session timestamps can reveal
                    activity patterns, so every export omits time tracking
                    unless this is selected.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={busy}
                className="product-action product-action-primary min-h-11 py-2 text-sm font-bold"
              >
                Apply export options
              </button>
            </div>
          </form>
        </section>

        <section
          className="grid gap-4"
          aria-labelledby="export-downloads-title"
        >
          <h3 id="export-downloads-title" className="text-xl leading-tight">
            Downloads
          </h3>

          <p className="max-w-3xl text-sm text-muted-readable">
            BehaviorLog stores title and description history in its standard
            definition-history file. When time tracking is selected, it stores
            timing sessions in its standard time-session file. Schedule,
            category, timezone, active-state, and reminder-setting history
            uses the standard configuration-history file. Full JSON includes this history in
            Cadence&apos;s app-native format. Historical definitions and
            configuration can contain sensitive context.
          </p>

          <ul className="grid gap-2">
            {DOWNLOAD_ACTIONS.map((action) => (
              <li
                key={action.format}
                className="grid min-w-0 items-baseline gap-x-4 gap-y-1 sm:grid-cols-[16rem_minmax(0,1fr)]"
              >
                <span className="grid gap-1">
                  <span className="break-words text-sm font-bold text-foreground">
                    {action.label}
                  </span>
                  <span className="max-w-[42rem] text-sm text-muted-readable">
                    {action.description}
                  </span>
                </span>
                {onDownload ? (
                  <button
                    type="button"
                    onClick={() => onDownload(action.format)}
                    disabled={busy}
                    className="product-action product-action-primary min-h-6 w-fit text-sm font-bold"
                    aria-label={`Download ${action.label}`}
                  >
                    Download
                  </button>
                ) : (
                  <a
                    href={downloadHref(action.format, exportData)}
                    className="product-action product-action-primary min-h-6 w-fit text-sm font-bold"
                    aria-label={`Download ${action.label}`}
                  >
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
          {downloadStatus ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-readable"
            >
              {downloadStatus}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          ) : null}
        </section>

        <section
          className="bg-background py-1"
          aria-labelledby="export-summary-title"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 id="export-summary-title" className="text-xl leading-tight">
                AI summary
              </h3>
              <p className="mt-2 max-w-3xl text-sm text-muted-readable">
                Markdown summary for pasting into an AI assistant or saving as a
                readable export artifact. It follows the same export options.
              </p>
            </div>
            <MarkdownSummaryActions
              summary={exportData.markdownSummary}
              fileName={exportData.markdownFileName}
              onDownload={onDownload ? () => onDownload("markdown") : undefined}
              downloadBusy={busy}
            />
          </div>

          <pre className="mt-5 max-h-[36rem] overflow-auto whitespace-pre-wrap border border-line bg-surface p-4 text-sm leading-6 text-foreground">
            {exportData.markdownSummary}
          </pre>
        </section>

        <PromptLibraryPanel />
      </section>

      <section className="grid gap-8" aria-labelledby="import-section-title">
        <div className="border-b border-line pb-4">
          <h2 id="import-section-title" className="text-2xl leading-tight">
            Import
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-muted-readable">
            Bring in a BehaviorLog bundle, review the preview, and apply only
            supported changes. Restore stays gated behind its own preview and
            confirmation.
          </p>
          <p className="mt-3 max-w-3xl text-sm text-muted-readable">
            Cadence replays standard definition history and safely mapped time
            sessions during supported imports and restore.
          </p>
          <p className="mt-3 max-w-3xl text-sm text-muted-readable">
            Cadence preserves standard configuration history for re-export. Import
            and restore use its current schedule and reminder snapshot.
            Historical Occurrence snapshots stay portable without activating
            prior schedules.
          </p>
        </div>
        <BehaviorLogImportPanel
          recentRuns={importData.recentRuns}
          timezone={exportData.timezone}
          action={importAction}
        />
        <BehaviorLogRestorePanel
          recentRuns={restoreData.recentRuns}
          timezone={exportData.timezone}
          action={restoreAction}
        />
      </section>
    </div>
  );
}

function ExportStat({
  label,
  value,
}: Readonly<{
  label: string;
  value: string | number;
}>) {
  return (
    <div className="grid min-w-0 items-baseline gap-x-4 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-sm font-bold text-foreground">{label}</dt>
      <dd className="break-words text-sm font-bold tabular-nums text-muted-readable">
        {value}
      </dd>
    </div>
  );
}

function downloadHref(
  format: (typeof DOWNLOAD_ACTIONS)[number]["format"],
  exportData: ExportBundle,
): string {
  const params = new URLSearchParams({
    range: exportData.range.key,
  });

  if (exportData.includeArchived) {
    params.set("include_archived", "1");
  }

  if (exportData.includeNotes) {
    params.set("include_notes", "1");
  }

  if (exportData.includeTimeTracking) {
    params.set("include_time_tracking", "1");
  }

  return `/api/export/${format}?${params.toString()}`;
}
