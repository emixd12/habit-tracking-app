import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

import { BehaviorLogImportPanel } from "../components/export/BehaviorLogImportPanel";
import { BehaviorLogRestorePanel } from "../components/export/BehaviorLogRestorePanel";
import { getFocusableElements } from "../components/timeline/NeedsDecisionDialog";
import { formatUserDateTime } from "../lib/ui/date-time";

describe("Ticket 090 UI regressions", () => {
  it("includes visible summaries and excludes hidden detail controls from the dialog focus set", () => {
    const visibleSummary = focusableElement(true);
    const hiddenDetailButton = focusableElement(false);
    const visibleCloseButton = focusableElement(true);
    let queriedSelector = "";
    const querySelectorAll = vi.fn((selector: string) => {
      queriedSelector = selector;
      return [
        visibleSummary,
        hiddenDetailButton,
        visibleCloseButton,
      ] as unknown as NodeListOf<HTMLElement>;
    });

    expect(
      getFocusableElements({ querySelectorAll } as unknown as HTMLElement),
    ).toEqual([visibleSummary, visibleCloseButton]);
    expect(queriedSelector).toContain("summary");
  });

  it("formats fixed instants identically across ambient zones", () => {
    const originalTimezone = process.env.TZ;

    try {
      process.env.TZ = "UTC";
      const serverText = formatUserDateTime(
        "2026-08-06T00:30:00Z",
        "America/New_York",
      );
      process.env.TZ = "America/Los_Angeles";
      const browserText = formatUserDateTime(
        "2026-08-06T00:30:00Z",
        "America/New_York",
      );

      expect(browserText).toBe(serverText);
      expect(browserText).toContain("Aug 5, 2026");
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimezone;
      }
    }
  });

  it("passes the profile timezone through both Export history panels", () => {
    const importHtml = renderToStaticMarkup(
      <BehaviorLogImportPanel
        timezone="America/New_York"
        recentRuns={[
          {
            id: "import-run",
            import_mode: "merge_preview",
            status: "previewed",
            started_at: "2026-08-06T00:30:00Z",
            completed_at: null,
            failure_message: null,
          },
        ]}
      />,
    );
    const restoreHtml = renderToStaticMarkup(
      <BehaviorLogRestorePanel
        timezone="America/New_York"
        recentRuns={[
          {
            id: "restore-run",
            mode: "restore_preview",
            status: "previewed",
            startedAt: "2026-08-06T00:30:00Z",
            completedAt: null,
            failureMessage: null,
          },
        ]}
      />,
    );

    expect(importHtml).toContain("Aug 5, 2026");
    expect(restoreHtml).toContain("Aug 5, 2026");
    expect(importHtml).not.toContain("Aug 6, 2026");
    expect(restoreHtml).not.toContain("Aug 6, 2026");
  });
});

function focusableElement(visible: boolean): HTMLElement {
  return {
    checkVisibility: () => visible,
    getAttribute: () => null,
    hasAttribute: () => false,
  } as unknown as HTMLElement;
}
