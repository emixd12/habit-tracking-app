import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("marketing base layout", () => {
  it("makes the main landmark a focus target for the skip link", () => {
    const source = readFileSync(
      "apps/marketing/src/layouts/BaseLayout.astro",
      "utf8",
    );

    expect(source).toContain(
      '<a class="skip-link" href="#main">Skip to content</a>',
    );
    expect(source).toContain('<main id="main" tabindex="-1">');
  });
});
