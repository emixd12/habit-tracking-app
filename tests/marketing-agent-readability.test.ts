import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

type AgentReadabilityHtmlModule = {
  hasMainLandmark: (html: string) => boolean;
};

let agentReadabilityHtml: AgentReadabilityHtmlModule;

beforeAll(async () => {
  // @ts-expect-error The marketing checker helper is a plain Node ESM module.
  agentReadabilityHtml = await import("../apps/marketing/scripts/agent-readability-html.mjs");
});

describe("marketing agent-readability HTML checks", () => {
  it("accepts the focusable main landmark emitted by the marketing layout", () => {
    expect(
      agentReadabilityHtml.hasMainLandmark(
        '<main id="main" tabindex="-1"><h1>Cadence</h1></main>',
      ),
    ).toBe(true);
  });

  it("accepts reordered, multiline, and unquoted main id attributes", () => {
    expect(
      agentReadabilityHtml.hasMainLandmark(
        "<main class=\"content\"\n tabindex=\"-1\" id='main'>Content</main>",
      ),
    ).toBe(true);
    expect(
      agentReadabilityHtml.hasMainLandmark("<main id=main>Content</main>"),
    ).toBe(true);
  });

  it("rejects lookalike attributes and non-matching main ids", () => {
    expect(
      agentReadabilityHtml.hasMainLandmark(
        '<main data-id="main">Content</main>',
      ),
    ).toBe(false);
    expect(
      agentReadabilityHtml.hasMainLandmark(
        '<main id="main-content">Content</main>',
      ),
    ).toBe(false);
    expect(
      agentReadabilityHtml.hasMainLandmark('<main id="MAIN">Content</main>'),
    ).toBe(false);
  });

  it("checks same-origin llms links against built artifacts", () => {
    const checker = readFileSync("apps/marketing/scripts/check-agent-readability.mjs", "utf8");

    expect(checker).toContain("assertSameOriginLlmsLinksExist");
    expect(checker).toContain("llms.txt link has no generated artifact");
  });
});
