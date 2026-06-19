import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { LegalPageContent } from "../components/settings/LegalContent";

describe("trust and legal UI content", () => {
  it("renders sparse public legal routes without adding product drift language", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="trust" />);

    expect(html).toContain("Manual truth");
    expect(html).toContain("Account isolation");
    expect(html).toContain("BehaviorLog bundle export");
    expect(html).not.toContain("dashboard");
    expect(html).not.toContain("missed status");
  });

  it("links the legal pages together", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="privacy" />);

    expect(html).toContain("href=\"/terms\"");
    expect(html).toContain("href=\"/privacy\"");
    expect(html).toContain("href=\"/trust\"");
    expect(html).toContain("Settings screen provides account deletion");
  });
});
