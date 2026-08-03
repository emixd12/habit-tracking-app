import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { LegalPageContent } from "../components/settings/LegalContent";
import { TrustAndLegalPanel } from "../components/settings/SettingsPanels";

describe("trust and legal UI content", () => {
  it("renders sparse public legal routes without adding product drift language", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="trust" />);

    expect(html).toContain("Manual truth");
    expect(html).toContain("Account isolation");
    expect(html).toContain("Supabase Auth identifies the signed-in account");
    expect(html).toContain("Row Level Security policies scope user-owned records");
    expect(html).toContain("BehaviorLog bundle export");
    expect(html).not.toContain("dashboard");
    expect(html).not.toContain("missed status");
    expect(html).not.toContain("expected to stay scoped");
  });

  it("links the legal pages together", () => {
    const html = renderToStaticMarkup(<LegalPageContent pageKey="privacy" />);

    expect(html).toContain("href=\"/terms\"");
    expect(html).toContain("href=\"/privacy\"");
    expect(html).toContain("href=\"/trust\"");
    expect(html).toContain("href=\"https://cadence-marketing-two.vercel.app/cadence\"");
    expect(html).toContain("Cadence overview");
    expect(html).toContain("Settings screen provides account deletion");
  });

  it("renders each public account-information destination from Settings", () => {
    const html = renderToStaticMarkup(<TrustAndLegalPanel />);

    expect(html).toContain('href="/trust"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });
});
