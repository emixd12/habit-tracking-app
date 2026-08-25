import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import {
  SettingsPanelGrid,
  SettingsProfile,
} from "@/components/settings/SettingsPanels";

describe("Settings page responsive profile", () => {
  it("uses a zero-minimum single-column track for the Settings panels", () => {
    const html = renderToStaticMarkup(
      <SettingsPanelGrid>
        <span>Neutral child</span>
      </SettingsPanelGrid>,
    );

    expect(html).toContain(
      '<div class="grid min-w-0 grid-cols-1 divide-y divide-line"><span>',
    );
  });

  it("allows a long account email to shrink and wrap inside a narrow viewport", () => {
    const html = renderToStaticMarkup(
      <SettingsProfile
        email={`${"long-account-identifier-".repeat(8)}@example.invalid`}
      />,
    );

    expect(html).toContain(
      '<dd class="min-w-0 [overflow-wrap:anywhere]">',
    );
    expect(html).not.toMatch(/<dd[^>]*whitespace-nowrap/);
  });
});
