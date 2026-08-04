import { buildFaqMarkdown } from "./faq";
import { siteConfig } from "./site";

export type MarketingRoute = {
  routeId: string;
  path: `/${string}` | "/";
  markdownPath: `/${string}.md`;
  type: "landing" | "product" | "standard" | "documentation" | "example" | "about" | "faq";
  title: string;
  navLabel: string;
  description: string;
  lastModified: string;
  includeInSitemap: boolean;
  includeInLlms: boolean;
  includeInMarkdownMirror: boolean;
  markdown: string;
};

export const marketingRoutes = [
  {
    routeId: "home",
    path: "/",
    markdownPath: "/index.md",
    type: "landing",
    title: "Cadence",
    navLabel: "Home",
    description:
      "Cadence is an open-source behavior tracker where you decide every occurrence and export your full history as a portable BehaviorLog bundle.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# Cadence

Cadence is an open-source personal behavior tracker. You define behaviors with schedules, Cadence generates scheduled occurrences on a today-first timeline, and you decide each one: Completed or Not Completed. Undecided occurrences stay Unresolved, and prior-day unresolved items surface in Needs decision; nothing is ever auto-marked missed. The full history exports as JSONL, CSV, full JSON, a Markdown summary, or a portable BehaviorLog bundle.

## How Cadence Works

1. Define a behavior with a title and a schedule: daily, every N days, weekly, or monthly, at exact times or time ranges. Categories, descriptions, and reminders are optional.
2. Each scheduled slot becomes an occurrence on a today-first timeline; yesterday's undecided items collect in a small Needs decision group. Nothing is ever auto-marked missed.
3. Mark each occurrence Completed or Not Completed, with an optional note. Undecided occurrences stay Unresolved; every decision writes an append-only status event.
4. Review adherence across 7, 30, or 90 days on a calendar heatmap, then export the full history anytime.

## Philosophy

Cadence deliberately has no streaks, badges, points, or guilt mechanics. Streaks collapse effort into one number that resets on one bad day; Cadence shows adherence across 7, 30, or 90 days instead. An undecided occurrence stays Unresolved — silence is never converted into failure. The product records facts about behavioral adherence and leaves motivation to the user.

Interfaces are no longer fixed: in the agentic era, an AI tool can read a personal history and build whatever view or coaching layer its owner prefers. Cadence therefore invests in the data backbone — a factual, portable record — rather than a prescribed interface.

## Time Tracking

Any current-day occurrence (or one visible in Needs decision) can carry an elapsed-time timer with start, stop, and reset. Reviews show per-occurrence totals and range averages alongside adherence. Exports omit time-tracking data unless the user explicitly opts in, because exact session timestamps can reveal activity patterns.

## Read First

- Use Cadence to track recurring behaviors one account at a time.
- Use BehaviorLog when a behavior history needs to move between tools without losing local dates, timezones, or explicit status history.
- Status values are unresolved, completed, and not_completed.
- Needs decision is a derived Cadence UI group, not a stored BehaviorLog status.
`,
  },
  {
    routeId: "faq",
    path: "/faq",
    markdownPath: "/faq.md",
    type: "faq",
    title: "Frequently Asked Questions",
    navLabel: "FAQ",
    description:
      "Answers on Cadence's no-gamification philosophy, missed days, time tracking, privacy, and portable BehaviorLog exports.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: buildFaqMarkdown(),
  },
  {
    routeId: "examples",
    path: "/examples",
    markdownPath: "/examples.md",
    type: "example",
    title: "Example BehaviorLog Bundle",
    navLabel: "Examples",
    description:
      "Download a sanitized Cadence-generated BehaviorLog-style example bundle and inspect the files agents should read first.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# Example BehaviorLog Bundle

The example bundle uses sanitized demo behavior data. It is intended for tooling tests, agent inspection, and format review.

## Included Concepts

- Behavior records.
- Calendar-simple schedules.
- Occurrences with local_date, timezone, and current status.
- Status event history.
- A short AGENTS.md file that tells coding agents how to inspect the bundle.

Download path: ${siteConfig.exampleBundlePath}
`,
  },
  {
    routeId: "docs",
    path: "/docs",
    markdownPath: "/docs.md",
    type: "documentation",
    title: "Cadence Docs",
    navLabel: "Docs",
    description:
      "Technical entry points for Cadence, BehaviorLog bundles, machine-readable mirrors, and future docs structure.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# Cadence Docs

This route is optimized for coding agents, retrieval tools, and developers evaluating Cadence exports. Prefer the Markdown mirrors and route manifest when context budget matters.

## Machine Files

- /llms.txt is the curated agent index.
- /llms-full.txt contains scoped page text for this small marketing site.
- /data/route-manifest.json is the source route manifest exposed as JSON.
- /faq.md, /examples.md, /docs.md, /about.md, and /index.md are clean Markdown mirrors.
- /sitemap.xml lists canonical HTML routes.
- /robots.txt advertises the sitemap.

## Analysis Rule

Use status_events.jsonl as the BehaviorLog history authority. Treat occurrences.jsonl current_status as a snapshot only.

## Documentation Roadmap

The current docs route is intentionally small. Future documentation should grow into Guides, Reference, Examples, Agent policy, and Schema history while preserving Markdown mirrors and route-manifest data.
`,
  },
  {
    routeId: "about",
    path: "/about",
    markdownPath: "/about.md",
    type: "about",
    title: "Project Philosophy and Governance",
    navLabel: "About",
    description:
      "The launch route for Cadence philosophy, open-source posture, governance boundaries, and scope constraints.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# Project Philosophy and Governance

Cadence is the product surface for a simple belief: portable records should stay factual, inspectable, and user-owned. BehaviorLog is the open standard that carries those records outside the app.

## Philosophy

Manual truth matters. A behavior occurrence is unresolved until the user marks it. The system should not turn silence into failure.

## Governance

The upstream BehaviorLog Bundle standard lives in its own repository. Cadence uses the standard through product workflows, export paths, import work, examples, and agent-readable docs while preserving product boundaries.

## Scope Boundaries

Cadence v1 is not a social habit tracker, a medical dosing app, a collaboration product, a payment product, or an AI coaching product.

## Open Source

The codebase is public, small by design, and structured so agents can inspect docs, tests, and export contracts directly.
`,
  },
] as const satisfies MarketingRoute[];

export type MarketingRouteId = (typeof marketingRoutes)[number]["routeId"];

export function getRouteById(routeId: MarketingRouteId): MarketingRoute {
  const route = marketingRoutes.find((entry) => entry.routeId === routeId);

  if (!route) {
    throw new Error(`Unknown marketing route: ${routeId}`);
  }

  return route;
}

export function getCanonicalUrl(path: string): string {
  return new URL(path, siteConfig.marketingSiteUrl).toString();
}

export function getRouteManifest() {
  return marketingRoutes.map((route) => ({
    url: getCanonicalUrl(route.path),
    route_id: route.routeId,
    type: route.type,
    title: route.title,
    description: route.description,
    canonical_url: getCanonicalUrl(route.path),
    markdown_url: getCanonicalUrl(route.markdownPath),
    last_modified: route.lastModified,
    language: siteConfig.language,
    is_public: true,
    include_in_sitemap: route.includeInSitemap,
    include_in_llms: route.includeInLlms,
    include_in_feed: false,
    include_in_markdown_mirror: route.includeInMarkdownMirror,
    source_path: `src/pages${route.path === "/" ? "/index" : route.path}.astro`,
  }));
}

export function markdownWithFrontmatter(route: MarketingRoute): string {
  return [
    "---",
    `title: ${JSON.stringify(route.title)}`,
    `description: ${JSON.stringify(route.description)}`,
    `canonical_url: ${getCanonicalUrl(route.path)}`,
    `last_updated: ${route.lastModified}`,
    "status: stable",
    `source: src/pages${route.path === "/" ? "/index" : route.path}.astro`,
    "---",
    "",
    route.markdown.trim(),
    "",
  ].join("\n");
}
