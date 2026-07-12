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

1. Define a behavior with a title and a schedule: daily, every N days, weekly, or monthly, at exact times or time ranges.
2. Cadence turns each scheduled slot into an occurrence on a today-first timeline, with optional browser or email reminders.
3. The user marks each occurrence Completed or Not Completed and can attach notes. Undecided occurrences stay Unresolved.
4. Review adherence across 7, 30, or 90 days, then export the full history anytime.

## Read First

- Use Cadence to track recurring behaviors one account at a time.
- Use BehaviorLog when a behavior history needs to move between tools without losing local dates, timezones, or explicit status history.
- Status values are unresolved, completed, and not_completed.
- Needs decision is a derived Cadence UI group, not a stored BehaviorLog status.
`,
  },
  {
    routeId: "cadence",
    path: "/cadence",
    markdownPath: "/cadence.md",
    type: "product",
    title: "Cadence Tracker",
    navLabel: "Product",
    description:
      "Track recurring behaviors, decide each occurrence manually, and export portable BehaviorLog records.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# Cadence Tracker

Cadence is a public, open-source personal behavior tracker for one account at a time. It supports many independent users through Google login, but each account stays private and single-player.

## Product Model

- Behaviors are recurring things the user wants to track.
- Occurrences are scheduled instances of a behavior.
- Each occurrence stays unresolved until the user marks it Completed or Not Completed.
- Prior-day unresolved occurrences appear in Needs decision.
- Notes attach to occurrences.
- Browser reminders are available when permission is granted, and email reminders are optional per behavior.

## Portability

Cadence exports JSONL, CSV, full JSON backup, Markdown summary, and BehaviorLog bundles. BehaviorLog is the open record format behind Cadence portability, not a separate consumer app.

## Product Boundaries

Cadence is not a social habit tracker, a collaboration product, a medical dosing system, a payment product, an admin console, or an AI coaching surface in v1.
`,
  },
  {
    routeId: "standard",
    path: "/standard",
    markdownPath: "/standard.md",
    type: "standard",
    title: "BehaviorLog Bundle",
    navLabel: "BehaviorLog",
    description:
      "The open bundle standard Cadence uses to keep behavior histories portable and inspectable.",
    lastModified: siteConfig.lastModified,
    includeInSitemap: true,
    includeInLlms: true,
    includeInMarkdownMirror: true,
    markdown: `# BehaviorLog Bundle

BehaviorLog is an open bundle format for personal behavior records. Cadence uses it as the portability layer for exports, imports, examples, and agent-readable inspection.

## Relationship to Cadence

Cadence is the product people use. BehaviorLog is the record contract underneath portable Cadence history. A tracker can produce a bundle, another tool can read it, and agents can inspect the files without needing access to the original account.

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
- /cadence.md, /standard.md, /examples.md, /docs.md, /about.md, and /index.md are clean Markdown mirrors.
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
