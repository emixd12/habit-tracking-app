import { Download } from "lucide-react";

import { BehaviorLogImportPanel } from "@/components/export/BehaviorLogImportPanel";
import { MarkdownSummaryActions } from "@/components/export/MarkdownSummaryActions";
import type { BehaviorLogImportPageData } from "@/lib/types/behaviorlog-import-ui";
import type { ExportBundle } from "@/lib/types/export";

type ExportPanelProps = Readonly<{
  exportData: ExportBundle;
  importData: BehaviorLogImportPageData;
}>;

const DOWNLOAD_ACTIONS = [
  {
    format: "jsonl",
    label: "JSONL",
    fileType: ".jsonl",
  },
  {
    format: "csv",
    label: "CSV",
    fileType: ".csv",
  },
  {
    format: "json",
    label: "Full JSON backup",
    fileType: ".json",
  },
  {
    format: "behaviorlog",
    label: "BehaviorLog bundle",
    fileType: ".behaviorlog.zip",
  },
] as const;

export function ExportPanel({ exportData, importData }: ExportPanelProps) {
  return (
    <div className="grid gap-8">
      <section
        className="border border-line bg-background p-5 sm:p-6"
        aria-labelledby="export-options-title"
      >
        <div className="border-b border-line pb-4">
          <h2
            id="export-options-title"
            className="text-2xl font-bold leading-tight"
          >
            Options
          </h2>
        </div>

        <form method="get" className="mt-5 grid gap-5">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-bold text-muted-readable">
              Range
            </legend>
            <div className="flex flex-wrap gap-2">
              {exportData.rangeOptions.map((option) => (
                <label key={option.key} className="cursor-pointer">
                  <input
                    type="radio"
                    name="range"
                    value={option.key}
                    defaultChecked={exportData.range.key === option.key}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-h-11 items-center justify-center border border-line bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground hover:bg-surface">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex w-fit items-start gap-3 border border-line bg-surface p-3 text-sm font-bold">
            <input
              type="checkbox"
              name="include_archived"
              value="1"
              defaultChecked={exportData.includeArchived}
              className="mt-0.5 h-5 w-5 accent-foreground"
            />
            <span>Include archived behaviors</span>
          </label>

          <div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center border border-line bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-foreground"
            >
              Apply options
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="export-current-title">
        <div className="border border-line bg-background">
          <div className="border-b border-line p-5 sm:p-6">
            <h2
              id="export-current-title"
              className="text-2xl font-bold leading-tight"
            >
              Current export
            </h2>
            <p className="mt-2 break-words text-sm font-bold text-muted-readable">
              {exportData.range.summaryLabel} · {exportData.timezone}
            </p>
          </div>
          <dl className="grid sm:grid-cols-3">
            <ExportStat label="Behaviors" value={exportData.behaviorCount} />
            <ExportStat label="Occurrences" value={exportData.occurrenceCount} />
            <ExportStat
              label="Default adherence"
              value={exportData.overallAdherenceLabel}
            />
          </dl>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="export-downloads-title">
        <div className="border-b border-line pb-3">
          <h2
            id="export-downloads-title"
            className="text-2xl font-bold leading-tight"
          >
            Downloads
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DOWNLOAD_ACTIONS.map((action) => (
            <a
              key={action.format}
              href={downloadHref(action.format, exportData)}
              className="group flex min-h-24 items-center justify-between gap-4 border border-line bg-background p-4 text-foreground transition-colors hover:bg-surface"
            >
              <span className="min-w-0">
                <span className="block break-words text-lg font-bold leading-tight">
                  {action.label}
                </span>
                <span className="mt-1 block text-sm font-bold text-muted-readable">
                  {action.fileType}
                </span>
              </span>
              <Download
                aria-hidden="true"
                size={22}
                strokeWidth={2}
                className="shrink-0"
              />
            </a>
          ))}
        </div>
      </section>

      <section
        className="border border-line bg-background p-5 sm:p-6"
        aria-labelledby="export-summary-title"
      >
        <div className="flex flex-col gap-4 border-b border-line pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2
              id="export-summary-title"
              className="text-2xl font-bold leading-tight"
            >
              AI summary
            </h2>
            <p className="mt-2 text-sm font-bold text-muted-readable">
              {exportData.markdownFileName}
            </p>
          </div>
          <MarkdownSummaryActions
            summary={exportData.markdownSummary}
            fileName={exportData.markdownFileName}
          />
        </div>

        <pre className="mt-5 max-h-[36rem] overflow-auto whitespace-pre-wrap border border-line bg-surface p-4 text-sm leading-6 text-foreground">
          {exportData.markdownSummary}
        </pre>
      </section>

      <BehaviorLogImportPanel recentRuns={importData.recentRuns} />
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
    <div className="border-b border-line p-4 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <dt className="text-sm font-bold text-muted-readable">{label}</dt>
      <dd className="mt-2 break-words text-2xl font-bold leading-tight">
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

  return `/api/export/${format}?${params.toString()}`;
}
