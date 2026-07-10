import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { ExportPanel } from "../components/export/ExportPanel";
import type { ExportBundle } from "../lib/types/export";

describe("Export panel UI", () => {
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
});

function exportBundle(): ExportBundle {
  return {
    timezone: "America/New_York",
    exportedAt: "2026-06-08T16:00:00Z",
    includeArchived: false,
    includeNotes: false,
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
