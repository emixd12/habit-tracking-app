import { siteConfig } from "./site";

export type MarketingRoute = {
  routeId: string;
  path: `/${string}` | "/";
  markdownPath: `/${string}.md`;
  type: "landing" | "product" | "standard" | "documentation" | "example" | "about";
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
    title: "BehaviorLog Bundle Standard and Cadence",
    navLabel: "Home",
    description:
      "BehaviorLog is the portable behavior-history standard. Cadence is the open tracker that proves the bundle works in daily use.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# BehaviorLog Bundle Standard and Cadence

BehaviorLog is an open bundle format for behavior histories. It keeps behaviors, schedules, occurrences, status events, notes, and provenance portable across tools.

Cadence is the demonstration product and main brand object for the project. It is a public, open-source personal behavior tracker that creates recurring behaviors, generates occurrences, and exports BehaviorLog bundles.

## Read First

- Use BehaviorLog when a behavior history needs to move between tools without losing local dates, timezones, or explicit status history.
- Use Cadence when you want to try a working personal tracker that produces practical BehaviorLog exports.
- Status values are unresolved, completed, and not_completed.
- Needs decision is a derived UI group in Cadence, not a stored BehaviorLog status.
`,
  },
  {
    routeId: "standard",
    path: "/standard",
    markdownPath: "/standard.md",
    type: "standard",
    title: "BehaviorLog Bundle Standard",
    navLabel: "Standard",
    description:
      "A technical overview of the BehaviorLog bundle format, status model, JSONL authority, and portability boundaries.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# BehaviorLog Bundle Standard

BehaviorLog is a portable archive for personal behavior records. It is designed for explicit user-marked histories, not inferred wellness scores or productivity gamification.

## Core Files

- manifest.json lists files, media types, requirement flags, schema references, and SHA-256 hashes.
- schema.json describes the bundle draft schema.
- data/behaviors.jsonl stores behavior definitions.
- data/schedules.jsonl stores recurrence and schedule slots.
- data/occurrences.jsonl stores scheduled instances and current status snapshots.
- data/status_events.jsonl stores append-only status history and should be used for analysis.
- data/notes.jsonl and data/interventions.jsonl are optional profile files.

## Status Model

BehaviorLog keeps three core statuses: unresolved, completed, and not_completed. Unresolved is a real state and should not be converted into missed or failed. Current status snapshots help readers load a bundle quickly, while status_events.jsonl remains the history authority.
`,
  },
  {
    routeId: "cadence",
    path: "/cadence",
    markdownPath: "/cadence.md",
    type: "product",
    title: "Cadence Tracker",
    navLabel: "Cadence",
    description:
      "Cadence is a sparse, open-source behavior tracker and the reference producer for BehaviorLog bundles.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# Cadence Tracker

Cadence is a public, open-source personal behavior tracker for one account at a time. It helps a user create recurring behaviors, review scheduled occurrences, mark each occurrence Completed or Not Completed, and export the resulting history.

## Product Boundaries

- Cadence is single-player.
- Cadence uses explicit manual status changes.
- Cadence does not add social features, gamification, calendar sync, AI coaching, medical dose tracking, payments, or admin dashboards in v1.
- Cadence exports JSONL, CSV, full JSON backup, Markdown summary, and BehaviorLog bundles.

## Demonstration Role

Cadence is the practical demonstration surface for BehaviorLog. Its export and import work exists to make behavior-history portability inspectable rather than theoretical.
`,
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
    title: "Agent-First Docs",
    navLabel: "Docs",
    description:
      "Machine-readable entry points for agents working with BehaviorLog bundles and Cadence exports.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# Agent-First Docs

This route is optimized for coding agents and retrieval tools. Prefer the Markdown mirrors and route manifest when context budget matters.

## Machine Files

- /llms.txt is the curated agent index.
- /llms-full.txt contains scoped page text for this small marketing site.
- /data/route-manifest.json is the source route manifest exposed as JSON.
- /standard.md, /cadence.md, /examples.md, /docs.md, /about.md, and /index.md are clean Markdown mirrors.
- /sitemap.xml lists canonical HTML routes.
- /robots.txt advertises the sitemap.

## Analysis Rule

Use status_events.jsonl as the BehaviorLog history authority. Treat occurrences.jsonl current_status as a snapshot only.
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

BehaviorLog and Cadence share one posture: portable records should stay factual, inspectable, and user-owned.

## Philosophy

Manual truth matters. A behavior occurrence is unresolved until the user marks it. The system should not turn silence into failure.

## Governance

The upstream BehaviorLog Bundle standard lives in its own repository. Cadence uses the standard as a producer and reference implementation while preserving product boundaries.

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
