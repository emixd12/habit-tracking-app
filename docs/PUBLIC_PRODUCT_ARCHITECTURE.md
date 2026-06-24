# Public Product Architecture

This document records the product posture change from a private personal app to
a public, multi-surface Cadence product.

It does not schedule implementation by itself. Add or update tickets in
`docs/TICKETS.md` before restructuring the repository, materially changing the
marketing site, adding billing, or starting desktop/mobile work.

## Product posture

Cadence is a public, open-source personal behavior tracker for one account at a
time. It remains a small, single-player product: no collaboration, no social
features, no shared workspaces, no gamification, and no expanded productivity
suite.

The final product posture is:

- Free open-source desktop and mobile apps.
- A web app that can support many independent accounts through simple Google
  authentication.
- A future paid web/shared-account tier for cross-surface saving and future
  speech-to-speech AI features.
- A practical reference implementation and demonstration surface for the
  BehaviorLog Bundle standard:
  `https://github.com/emixd12/BehaviorLog-Bundle`.

The first public-product implementation steps are now present: the current
authenticated web app has been hardened for many independent users, and the
Astro marketing site exists as a sibling app. Billing, AI, desktop, and mobile
remain future scope unless tickets explicitly move them into active work.

## Surface model

The target repository shape is a composable workspace:

```text
apps/
  app/          authenticated web app, current Cadence tracker
  marketing/   public Astro website for SEO, product explanation, and standard adoption
  desktop/     future Tauri desktop app
  mobile/      future mobile app

packages/
  core/         recurrence/status/timeline/export resolver logic
  db/           shared database types, generated clients, or adapter contracts
  ui/           shared design tokens and framework-light primitives
  config/       shared eslint, TypeScript, Tailwind, and tooling configuration
```

This shape is directional. Do not move the current app out of the repository
root until a scoped restructuring ticket exists and the migration can preserve
all current routes, tests, Supabase workflows, Vercel settings, and deployment
behavior.

Preferred sequencing:

1. Harden the existing web app for many independent Google-auth accounts.
2. Add a simple Astro marketing site as a sibling app.
3. Extract `packages/core` only when it removes real duplication or unblocks a
   second runtime.
4. Extract `packages/ui` as tokens and primitives first, not full product
   components.
5. Keep desktop/mobile as proposal-track work until explicitly scheduled.

Use npm workspaces first unless build orchestration becomes painful. Turborepo
may be added later if caching and multi-app task orchestration become
worthwhile.

## Design-system surface model

Cadence uses one canonical design system across surfaces, but implementation is
surface-scoped. The shared design system owns foundations, product language,
state semantics, accessibility expectations, and canonical component-family
contracts. Each surface can satisfy those contracts with native implementation
files for its runtime.

Current design-system inventory layers:

- `DESIGN.md`: human-readable source for the visual system, product voice, and
  surface-specific design rules.
- `design-system.surfaces.json`: canonical cross-surface catalog. It defines
  supported surfaces, component families, shared contracts, and native
  implementation mappings.
- `design-system.manifest.json` and `design-system.usage.json`: current live
  authenticated web-app traceability inventory.
- `/design-system`: local/dev-only global bench. It shows foundations,
  canonical surface/component-family mappings, and the live web-app trace
  cards.

Do not force every surface to share full product components. Astro marketing,
Next.js authenticated app UI, and future local-first desktop/mobile shells have
different runtime boundaries. Share tokens, primitive contracts, terminology,
states, and presentational module specs first. Extract `packages/ui` only when
it removes real duplication or unblocks a scheduled second runtime; keep it
focused on tokens and framework-light primitives before full product modules.

When a new surface starts, add or update its entries in
`design-system.surfaces.json`, then add a native surface manifest or bench only
when there is live UI to verify. Cross-surface catalog entries may point to
Astro templates, CSS/token files, static captures, native component files, or
planned implementation docs, but product usage counts must remain separated
from bench previews.

## Marketing site

The public marketing site is implemented with Astro under `apps/marketing`. It
shares Cadence's brand voice and design tokens, but it does not share the
authenticated Next.js app shell.

Launch routes:

| Route | Purpose |
|---|---|
| `/` | Landing page led by BehaviorLog as the standard and Cadence as the demonstration product |
| `/cadence` | Product page for the tracker |
| `/standard` | BehaviorLog Bundle overview and adoption case |
| `/docs` | Agent-first technical docs entry point |
| `/examples` | Sanitized sample bundle page |
| `/about` | Philosophy, governance, scope boundaries, and open-source posture |

Primary calls to action:

- Try Cadence
- Read the Standard
- Download Example Bundle
- View on GitHub

The site is static-first and SEO-conscious from the start: semantic HTML,
canonical URLs, useful metadata, Open Graph/Twitter metadata, sitemap/robots
support, accessible headings, generated Markdown mirrors, `llms.txt`,
`llms-full.txt`, and a public route manifest.

The marketing site is deployed separately from the authenticated Next.js app as
the Vercel project `cadence-marketing`. Its current production alias is
`https://cadence-marketing-two.vercel.app`. `MARKETING_SITE_URL` owns the
Astro `site` value for canonical URLs and sitemap generation.

Marketing analytics and cookies are not launch scope and are not implemented.
Any future analytics layer must include a consent and documentation update.

Do not tease desktop or mobile apps on the marketing site before those surfaces
are real or intentionally announced.

The marketing app uses npm workspace scripts:

```bash
npm run marketing:dev
npm run marketing:build
npm run marketing:check
npm run marketing:preview
```

`npm run marketing:build` generates the sanitized example
`cadence-demo.behaviorlog.zip` download. The generated bundle is not source
data and is rebuilt from `apps/marketing/scripts/build-example-bundle.mjs`.

## Web app launch posture

The current authenticated web app remains the first production surface to
harden. It should support many independent users, each with a private personal
tracker.

Launch auth:

- Google login only.
- Supabase Auth remains the web identity provider.
- The default route after login remains `/timeline`.
- Public users can create accounts immediately when public launch begins.

Simple onboarding is implemented for public launch as a thin, optional pop-up
that links into existing app controls:

1. Create first behavior.
2. Request browser notification permission.
3. Import data when an import path exists.
4. Detect timezone automatically when possible and allow manual override.

Default categories remain useful but user-owned. Users should be able to add
new categories and remove defaults when category management is implemented.

Account deletion and export should be first-class before a broad public launch,
following the BehaviorLog portability posture.

## Data and privacy posture

Cadence supports many independent accounts, not shared accounts. Each account's
data remains inaccessible to other users through Supabase RLS. Normal app code
must keep using authenticated user context and must not use service-role access
for user-facing reads/writes.

No support dashboard or routine admin access to user data is launch scope. If
operational support tooling is ever added, it must be explicitly scoped with a
privacy model, auditability, and source-doc updates.

Before public launch, add standard public-product protections:

- Rate limiting for sensitive routes where practical.
- Signup/auth abuse protections through provider settings.
- Server-side validation on all mutation routes/actions.
- Secret scanning discipline and environment variable ownership.
- Basic monitoring/error reporting without sending sensitive behavior content
  to third-party tools. The first implementation uses privacy-safe structured
  runtime logs rather than adding an external monitoring SDK.
- Account deletion and export paths.
- Terms of Service and Privacy Policy.
- A privacy/trust page explaining ownership, export, reminders, and the
  BehaviorLog portability model.

Data retention policy is undecided. Until it is decided, retain user data while
the account exists, delete user-owned records on account deletion, and do not
add background data purging beyond operational logs.

## Desktop and mobile relationship

`docs/DESKTOP_BUILD.md` remains a proposal, not scheduled work. The public
product docs may mention desktop/mobile as future surfaces, but they are not
part of the launch path unless tickets are added.

Desktop and mobile should follow the local-first direction in
`docs/DESKTOP_BUILD.md`:

- usable without login,
- local data by default,
- optional sync later,
- optional cloud identity only for cross-surface saving and future AI features.

The web app remains cloud-first through Supabase. This difference is
intentional. Future sync work must bridge local-first desktop/mobile data with
hosted Supabase only when the user opts in.

## Pricing and future AI

Billing is not launch scope.

The intended future commercial shape is:

- free open-source desktop and mobile apps,
- a paid web/shared-account layer for cross-app saving,
- future paid speech-to-speech AI behavior-review features.

Do not gate current launch features behind pricing. Do not add payment
infrastructure until a billing ticket updates product, route, data, legal, and
operations docs.

AI coaching or speech features are future scope only. Do not add AI features to
the current app without an explicit product-direction update.

## Source documents affected

When public-product work starts, keep these files in sync:

- `AGENTS.md`
- `docs/PRODUCT_SPEC.md`
- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/ROUTE_MAP.md`
- `docs/DATA_MODEL.md`
- `docs/NOTIFICATION_SPEC.md`
- `docs/EXPORT_FORMATS.md`
- `docs/DECISIONS.md`
- `docs/FUTURE_UPDATES.md`
- `docs/TICKETS.md`
- `docs/OPERATIONS.md`
- `docs/VERCEL_WORKFLOW.md`
- `docs/DESKTOP_BUILD.md`
- `STATUS.md`
