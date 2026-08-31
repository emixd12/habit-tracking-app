import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGAL_PAGES } from "../components/settings/LegalContent";
import { faqItems } from "../apps/marketing/src/data/faq";
import { marketingRoutes } from "../apps/marketing/src/data/routes";
import { siteConfig } from "../apps/marketing/src/data/site";
import {
  exportFormats,
  statusDefinitions,
  vocabulary,
} from "../apps/marketing/src/data/vocabulary";

const publicCopy = [
  siteConfig.description,
  ...faqItems.flatMap(({ question, answer }) => [question, answer]),
  ...marketingRoutes.flatMap(({ description, markdown }) => [
    description,
    markdown,
  ]),
  ...Object.values(LEGAL_PAGES).flatMap(({ summary, sections }) => [
    summary,
    ...sections.flatMap(({ paragraphs, items = [] }) => [
      ...paragraphs,
      ...items,
    ]),
  ]),
  ...[
    "README.md",
    "apps/marketing/src/layouts/BaseLayout.astro",
    "apps/marketing/src/pages/index.astro",
    "apps/marketing/src/pages/faq.astro",
    "apps/marketing/src/pages/about.astro",
    "apps/marketing/src/pages/docs.astro",
    "apps/marketing/src/components/HeroVisual.astro",
    "apps/marketing/src/components/HowItWorks.astro",
    "apps/marketing/src/components/ProductCapture.astro",
  ].map((path) => readFileSync(resolve(path), "utf8")),
].join("\n");

const home = marketingRoutes.find(
  ({ routeId }) => routeId === "home",
)!.markdown;
const about = marketingRoutes.find(
  ({ routeId }) => routeId === "about",
)!.markdown;
const terms = LEGAL_PAGES.terms.sections
  .flatMap(({ paragraphs }) => paragraphs)
  .join("\n");
const statusSurfaces = [home, buildFaqCopy(), about, terms];
const exportSurfaces = [
  home,
  buildFaqCopy(),
  LEGAL_PAGES.privacy.sections
    .flatMap(({ paragraphs }) => paragraphs)
    .join("\n"),
];

describe("public content contract", () => {
  it("keeps vocabulary, statuses, and exports canonical", () => {
    const bannedPhrases = [
      "complete JSON snapshot",
      "full JSON",
      "Markdown summary",
      "permanently free",
      "automatic AI analysis",
    ];
    const occurrenceSynonyms = ["check-in", "scheduled slot", "scheduled item"];

    expect(publicCopy).not.toContain("—");
    for (const phrase of [...bannedPhrases, ...occurrenceSynonyms]) {
      expect(publicCopy.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
    expect(vocabulary.map(({ term }) => term)).toEqual([
      "Behavior",
      "Schedule",
      "Occurrence",
      "Decision",
      "Completed",
      "Not Completed",
      "Unresolved",
      "Context",
      "Revision",
      "Adherence",
      "Record",
      "View",
      "BehaviorLog",
    ]);
    for (const definition of Object.values(statusDefinitions)) {
      for (const surface of statusSurfaces)
        expect(surface).toContain(definition);
    }
    expect(exportFormats).toEqual([
      "JSONL",
      "JSON",
      "CSV",
      "Markdown",
      "BehaviorLog bundle",
    ]);
    for (const surface of exportSurfaces) {
      expect(surface).toContain(exportFormats.join(", "));
    }
  });
});

function buildFaqCopy(): string {
  return faqItems
    .flatMap(({ question, answer }) => [question, answer])
    .join("\n");
}
