import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { PromptLibraryPanel } from "../components/export/PromptLibraryPanel";

describe("Prompt library UI", () => {
  it("renders unboxed disclosure rows with prompt details and copy status", () => {
    const html = renderToStaticMarkup(<PromptLibraryPanel />);

    expect(html).toContain(
      "Cluster the reasons in occurrence notes for Not Completed occurrences into ranked themes.",
    );
    expect(html).toContain(
      "Needs any export format with the Include occurrence notes option selected; note values are blank otherwise.",
    );
    expect(html).toContain(
      "Cluster the notes into recurring reason themes, name each theme plainly",
    );
    expect(html).toContain("Copy prompt");
    expect(html).toContain('aria-label="Copy prompt: Notes-explained failures"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("<details");
    expect(html).toContain("<summary");

    const listClass = html.match(/<ul class="([^"]*)"/)?.[1];
    expect(listClass).toContain("divide-y divide-line");
    expect(listClass?.split(" ")).not.toContain("border");
  });
});
