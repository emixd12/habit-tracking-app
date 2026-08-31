import {
  Children,
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

import { ExportPanel } from "../components/export/ExportPanel";
import { ExportRangeSelector } from "../components/export/ExportRangeSelector";
import { MarkdownSummaryActions } from "../components/export/MarkdownSummaryActions";
import { BehaviorLogImportPanel } from "../components/export/BehaviorLogImportPanel";
import { BehaviorLogRestorePanel } from "../components/export/BehaviorLogRestorePanel";
import { EXPORT_PROMPT_TEMPLATES } from "../lib/export-prompts";
import type { ExportBundle } from "../lib/types/export";
import type { BehaviorLogImportFormAction } from "../lib/types/behaviorlog-import-ui";
import type { BehaviorLogRestoreFormAction } from "../lib/types/behaviorlog-restore-ui";

describe("Export panel UI", () => {
  it("renders export options and every structured download interaction", () => {
    const html = renderToStaticMarkup(
      <ExportPanel
        importAction={async (state) => state}
        restoreAction={async (state) => state}
        exportData={exportBundle()}
        importData={{ recentRuns: [] }}
        restoreData={{ recentRuns: [] }}
      />,
    );

    for (const range of ["7", "30", "90", "all"]) {
      expect(html).toMatch(
        new RegExp(`name="range"[^>]*value="${range}"`),
      );
    }
    expect(html).toContain('name="include_archived"');
    expect(html).toContain('name="include_notes"');
    expect(html).toContain('name="include_time_tracking"');
    expect(html).toContain("Exact timing-session timestamps can reveal");
    expect(html).toContain(">Apply export options</button>");

    for (const format of ["JSONL", "CSV", "App JSON backup", "BehaviorLog bundle"]) {
      expect(html).toContain(`aria-label="Download ${format}`);
    }
    expect(html).toContain('href="/api/export/jsonl?range=30"');
    expect(html).toContain('href="/api/export/csv?range=30"');
    expect(html).toContain('href="/api/export/json?range=30"');
    expect(html).toContain('href="/api/export/behaviorlog?range=30"');
  });

  it("keeps the time-tracking option and download parameter off by default", () => {
    const html = renderToStaticMarkup(
      <ExportPanel
        importAction={async (state) => state}
        restoreAction={async (state) => state}
        exportData={exportBundle()}
        importData={{ recentRuns: [] }}
        restoreData={{ recentRuns: [] }}
      />,
    );

    expect(html).not.toContain("Timing sessions");
    expect(html).not.toContain("include_time_tracking=1");
  });

  it("preserves enabled time tracking in the checkbox, summary, and every download link", () => {
    const bundle = exportBundle();
    bundle.includeTimeTracking = true;
    bundle.timeSessionCount = 2;
    const html = renderToStaticMarkup(
      <ExportPanel
        importAction={async (state) => state}
        restoreAction={async (state) => state}
        exportData={bundle}
        importData={{ recentRuns: [] }}
        restoreData={{ recentRuns: [] }}
      />,
    );

    expect(html).toMatch(
      /name="include_time_tracking"[^>]*checked=""/,
    );
    expect(html).toContain("Timing sessions");
    for (const format of ["jsonl", "csv", "json", "behaviorlog"]) {
      expect(html).toContain(
        `/api/export/${format}?range=30&amp;include_time_tracking=1`,
      );
    }
  });

  it("explains standard BehaviorLog files and supported replay", () => {
    const html = renderToStaticMarkup(
      <ExportPanel
        importAction={async (state) => state}
        restoreAction={async (state) => state}
        exportData={exportBundle()}
        importData={{ recentRuns: [] }}
        restoreData={{ recentRuns: [] }}
      />,
    );

    expect(html).toContain("JSONL (.jsonl)");
    expect(html).toContain(
      "Line-oriented app-native rows for scripts, agents, and quick inspection.",
    );
    expect(html).toContain("CSV (.csv)");
    expect(html).toContain("Spreadsheet review of occurrence snapshots");
    expect(html).toContain("App JSON backup (.json)");
    expect(html).toContain(
      "status-event history, and complete behavior definition, schedule, and reminder history.",
    );
    expect(html).toContain("BehaviorLog bundle (.behaviorlog.zip)");
    expect(html).toContain(
      "BehaviorLog core records, standard definition and configuration history, reminder rules, optional standard time sessions",
    );
    expect(html).toContain(
      "BehaviorLog stores title and description history in its standard definition-history file.",
    );
    expect(html).toContain(
      "When time tracking is selected, it stores timing sessions in its standard time-session file.",
    );
    expect(html).toContain(
      "reminder-setting history uses the standard configuration-history file.",
    );
    expect(html).toContain(
      "Historical definitions and configuration can contain sensitive context.",
    );
    expect(html).toContain(
      "Cadence replays standard definition history and safely mapped time sessions during supported imports and restore.",
    );
    expect(html).toContain(
      "Cadence preserves standard configuration history for re-export.",
    );
    expect(html).toContain("use its current schedule and reminder snapshot");
    expect(html).toContain(
      "Historical Occurrence snapshots stay portable without activating prior schedules.",
    );
    expect(html).not.toContain(
      "Exported behavior definition and configuration revisions are not replayed",
    );
  });

  it("renders the analysis prompt library after the AI summary", () => {
    const html = renderToStaticMarkup(
      <ExportPanel
        importAction={async (state) => state}
        restoreAction={async (state) => state}
        exportData={exportBundle()}
        importData={{ recentRuns: [] }}
        restoreData={{ recentRuns: [] }}
      />,
    );

    expect(html).toContain("Analysis prompts");
    expect(html).toContain(
      "becomes visible to the assistant you paste it into",
    );

    for (const template of EXPORT_PROMPT_TEMPLATES) {
      expect(html).toContain(template.title);
    }

    expect(html.indexOf("AI summary")).toBeLessThan(
      html.indexOf("Analysis prompts"),
    );
  });

  it("resets range-control state when navigation supplies a different selected range", () => {
    const thirtyDayPanel = ExportPanel({
      importAction: async (state) => state,
      restoreAction: async (state) => state,
      exportData: exportBundle(),
      importData: { recentRuns: [] },
      restoreData: { recentRuns: [] },
    });
    const ninetyDayData = exportBundle();

    ninetyDayData.range = {
      key: "90",
      label: "90 days",
      startLocalDate: "2026-03-11",
      endLocalDate: "2026-06-08",
      summaryLabel: "2026-03-11 to 2026-06-08",
    };

    const ninetyDayPanel = ExportPanel({
      importAction: async (state) => state,
      restoreAction: async (state) => state,
      exportData: ninetyDayData,
      importData: { recentRuns: [] },
      restoreData: { recentRuns: [] },
    });
    const thirtyDaySelector = findElementByType(
      thirtyDayPanel,
      ExportRangeSelector,
    );
    const ninetyDaySelector = findElementByType(
      ninetyDayPanel,
      ExportRangeSelector,
    );

    expect(String(thirtyDaySelector?.key)).toContain("30");
    expect(String(ninetyDaySelector?.key)).toContain("90");
    expect(ninetyDaySelector?.key).not.toBe(thirtyDaySelector?.key);

    const html = renderToStaticMarkup(ninetyDayPanel);
    const ninetyDayInput = html.match(
      /<input[^>]*name="range"[^>]*value="90"[^>]*>/,
    )?.[0];
    const thirtyDayInput = html.match(
      /<input[^>]*name="range"[^>]*value="30"[^>]*>/,
    )?.[0];

    expect(ninetyDayInput).toContain('checked=""');
    expect(thirtyDayInput).not.toContain('checked=""');
  });

  it("routes desktop downloads and form actions through supplied transports", () => {
    const onDownload = vi.fn();
    const importAction = vi.fn<BehaviorLogImportFormAction>(async (state) => state);
    const restoreAction = vi.fn<BehaviorLogRestoreFormAction>(async (state) => state);
    const panel = ExportPanel({
      exportData: exportBundle(),
      importData: { recentRuns: [] },
      restoreData: { recentRuns: [] },
      importAction,
      restoreAction,
      onDownload,
    });
    const html = renderToStaticMarkup(panel);
    expect(html).not.toContain('href="/api/export/');
    expect(html).toContain('name="include_notes"');
    expect(onDownload).not.toHaveBeenCalled();

    for (const button of findElementsByType(panel, "button")) {
      const props = button.props as { "aria-label"?: string; onClick?: () => void };
      if (props["aria-label"]?.startsWith("Download ")) props.onClick?.();
    }
    const markdown = findElementByType(panel, MarkdownSummaryActions);
    (markdown?.props as { onDownload: () => void }).onDownload();
    expect(onDownload.mock.calls).toEqual([
      ["jsonl"], ["csv"], ["json"], ["behaviorlog"], ["markdown"],
    ]);
    expect((findElementByType(panel, BehaviorLogImportPanel)?.props as { action: unknown }).action).toBe(importAction);
    expect((findElementByType(panel, BehaviorLogRestorePanel)?.props as { action: unknown }).action).toBe(restoreAction);
    expect(importAction).not.toHaveBeenCalled();
    expect(restoreAction).not.toHaveBeenCalled();
  });

  it("reports native save cancellation and errors while gating busy exports", () => {
    const onApplyOptions = vi.fn();
    const panel = ExportPanel({
      exportData: exportBundle(),
      importData: { recentRuns: [] },
      restoreData: { recentRuns: [] },
      importAction: async (state) => state,
      restoreAction: async (state) => state,
      onApplyOptions,
      onDownload: vi.fn(),
      busy: true,
      downloadStatus: "Save cancelled. No file was written.",
      error: "Cadence could not save the export.",
    });
    const html = renderToStaticMarkup(panel);
    expect(html).toContain("Save cancelled. No file was written.");
    expect(html).toContain('role="alert"');
    for (const button of findElementsByType(panel, "button")) {
      expect((button.props as { disabled?: boolean }).disabled).toBe(true);
    }
    const preventDefault = vi.fn();
    const form = findElementByType(panel, "form");
    (form?.props as { onSubmit: (event: { preventDefault: () => void }) => void }).onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onApplyOptions).not.toHaveBeenCalled();
  });
});

function findElementsByType(node: ReactNode, type: ElementType): ReactElement[] {
  if (!isValidElement(node)) return [];
  const children = Children.toArray((node.props as { children?: ReactNode }).children);
  return [
    ...(node.type === type ? [node] : []),
    ...children.flatMap((child) => findElementsByType(child, type)),
  ];
}

function findElementByType(
  node: ReactNode,
  type: ElementType,
): ReactElement | null {
  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === type) {
    return node;
  }

  const props = node.props as { children?: ReactNode };

  for (const child of Children.toArray(props.children)) {
    const match = findElementByType(child, type);

    if (match) {
      return match;
    }
  }

  return null;
}

function exportBundle(): ExportBundle {
  return {
    timezone: "America/New_York",
    exportedAt: "2026-06-08T16:00:00Z",
    includeArchived: false,
    includeNotes: false,
    includeTimeTracking: false,
    range: {
      key: "30",
      label: "30 days",
      startLocalDate: "2026-05-10",
      endLocalDate: "2026-06-08",
      summaryLabel: "2026-05-10 to 2026-06-08",
    },
    rangeOptions: [
      { key: "7", label: "7 days" },
      { key: "30", label: "30 days" },
      { key: "90", label: "90 days" },
      { key: "all", label: "All time" },
    ],
    categoryCount: 1,
    behaviorCount: 1,
    occurrenceCount: 1,
    behaviorConfigurationEventCount: 0,
    overallCounts: {
      completedCount: 1,
      notCompletedCount: 0,
      unresolvedCount: 0,
      resolvedCount: 1,
      totalCount: 1,
    },
    overallAdherenceLabel: "100%",
    jsonl: "{}",
    csv: "local_date,status",
    jsonBackup: {
      exported_at: "2026-06-08T16:00:00Z",
      profile: {
        timezone: "America/New_York",
      },
      categories: [],
      behaviors: [],
      occurrences: [],
      status_events: [],
      behavior_definition_events: [],
      behavior_configuration_events: [],
    },
    json: "{}",
    markdownSummary: "# Cadence export summary",
    fileBaseName: "cadence-export",
    markdownFileName: "cadence-export.md",
    behaviorLog: {
      fileName: "cadence-export.behaviorlog.zip",
      files: [],
    },
  };
}
