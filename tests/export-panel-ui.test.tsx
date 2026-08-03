import {
  Children,
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { ExportPanel } from "../components/export/ExportPanel";
import { ExportRangeSelector } from "../components/export/ExportRangeSelector";
import { EXPORT_PROMPT_TEMPLATES } from "../lib/export-prompts";
import type { ExportBundle } from "../lib/types/export";

describe("Export panel UI", () => {
  it("renders export options and every structured download interaction", () => {
    const html = renderToStaticMarkup(
      <ExportPanel
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

  it("explains task-based export formats without overstating app JSON", () => {
    const html = renderToStaticMarkup(
      <ExportPanel
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
      "status-event history, and behavior definition history.",
    );
    expect(html).toContain("BehaviorLog bundle (.behaviorlog.zip)");
    expect(html).toContain(
      "BehaviorLog core records plus Cadence definition history",
    );
    expect(html).toContain(
      "Full JSON and BehaviorLog include complete prior and next behavior titles and descriptions by default.",
    );
    expect(html).toContain(
      "Historical definitions can contain sensitive text.",
    );
    expect(html).toContain(
      "Exported behavior definition revisions are not replayed on import or restore.",
    );
    expect(html).toContain(
      "records a new local import baseline or transition",
    );
  });

  it("renders the analysis prompt library after the AI summary", () => {
    const html = renderToStaticMarkup(
      <ExportPanel
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
});

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
