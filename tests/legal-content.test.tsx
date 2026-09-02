import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { LegalPageContent } from "../components/settings/LegalContent";
import { TrustAndLegalPanel } from "../components/settings/SettingsPanels";

describe("trust and legal UI content", () => {
  it("renders sparse public legal routes without adding product drift language", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="trust" />);

    expect(html).toContain("Data boundaries");
    expect(html).toContain("Public source and license");
    expect(html).toContain("Limits of verification");
    expect(html).toContain("Row Level Security scopes user-owned records");
    expect(html).toContain(
      "does not send exported behavior data to an AI provider",
    );
    expect(html).toContain("under the repository&#x27;s MIT license");
    expect(html).not.toContain("Manual truth");
    expect(html).not.toContain("dashboard");
    expect(html).not.toContain("missed status");
    expect(html).not.toContain("expected to stay scoped");
  });

  it("links the legal pages together", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="privacy" />);

    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/trust"');
    expect(html).toContain(
      'href="https://cadence-marketing-two.vercel.app/cadence"',
    );
    expect(html).toContain("Cadence overview");
    expect(html).toContain("delete their account in Settings");
  });

  it("renders the blocked Privacy draft with semantic processor and retention tables", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="privacy" />);

    expect(html).toContain("August 31, 2026 (draft; not legally approved)");
    expect(html).toContain(
      "not approved for publication or public registration",
    );
    expect(html).toContain("Cadence service providers and purposes");
    expect(html).toContain(
      "Retention targets and verified active-provider windows",
    );
    expect(html).toContain("<table");
    expect(html).toContain('<th scope="col"');
    expect(html).toContain("Vercel Pro runtime logs: 1 day");
    expect(html).toContain("Supabase Pro API and database logs: 7 days");
    expect(html).toContain("Browser-push payloads");
    expect(html).toContain("24-hour TTL");
    expect(html).toContain("Sequenzy publishes no transactional-message window");
    expect(html).toContain("domain routes through Microsoft 365");
    expect(html).toContain("privacy@identityscaffolding.com");
    expect(html).toContain("California disclosures");
    expect(html).toContain("only for people age 18 or older");
    expect(html).toContain("does not send behavior data to an AI provider");
  });

  it("renders complete draft Terms with the settled legal facts", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="terms" />);

    expect(html).toContain("Identity Scaffolding LLC");
    expect(html).toContain("30 N Gould St Ste R, Sheridan, WY 82801");
    expect(html).toContain("General-purpose recordkeeping");
    expect(html).toContain("Source license and other rights");
    expect(html).toContain(
      "repository license governs only material within its stated scope",
    );
    expect(html).toContain("New York law governs");
    expect(html).toContain(
      "require neither arbitration nor a waiver of class-action rights",
    );
    expect(html).toContain("greater of 100 US dollars");
    expect(html).toContain(
      "not approved for publication or public registration",
    );
  });

  it("renders each public account-information destination from Settings", () => {
    const html = renderToStaticMarkup(<TrustAndLegalPanel />);

    expect(html).toContain('href="/trust"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });
});
