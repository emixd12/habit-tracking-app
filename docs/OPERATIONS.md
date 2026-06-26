# Agent Operations Runbook

Use this file after `AGENTS.md` and `STATUS.md` to run the repository consistently.

## Current state

The repository contains the v1 authenticated web app, BehaviorLog
interoperability/import/restore work through Ticket 028, public web hardening
through Ticket 030, and the Ticket 031 Astro marketing site. `STATUS.md`
remains the detailed implementation ledger and should be checked before
starting or continuing any ticket.

Cadence's product posture has moved from private-only usage to a public
open-source product with multiple surfaces. The current implemented surfaces
are the authenticated Next.js web app and the sibling Astro marketing site. See
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md` before starting public-product,
marketing-site, workspace, desktop, or mobile work.

## Setup

```bash
npm install
npm run agents:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

If local `npm` or `node` is not on the shell path in an agent environment, use the user's local binary path or a login shell. On this machine, npm and node are available under `/Users/emi/.local/bin`.

## Installed CLIs

Project-local CLI tools:

```bash
npm run supabase -- --version
npm run sequenzy -- --version
```

The Supabase and Sequenzy CLIs are dev dependencies so agents do not need global installs.

## Standard verification

Before marking a coding task complete, run:

```bash
npm run agents:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

For UI changes, also run the app and inspect at least:

- `/timeline`
- the affected route
- a desktop viewport
- a narrow mobile viewport around 390px wide

For many-independent-user RLS smoke QA, point the Supabase environment variables
at the intended local or hosted project and run:

```bash
npm run smoke:rls
```

The command uses service-role credentials only to create and clean up temporary
auth users. Data access checks run through ordinary signed-in publishable-key
clients.

## Clean-session onboarding QA

Use the dev/test-only login route when a clean browser session needs to exercise
first-run onboarding but Google account access would block the test.

Enable it locally:

```bash
CADENCE_ENABLE_TEST_LOGIN=1
```

If the local app points at a hosted Supabase project, also set:

```bash
CADENCE_ALLOW_HOSTED_TEST_LOGIN=1
```

Safety gates:

- `/auth/test-login` is blocked unless `CADENCE_ENABLE_TEST_LOGIN=1`.
- The route is blocked when `NODE_ENV=production` or `VERCEL_ENV=production`.
- The route only accepts localhost request hosts.
- Hosted Supabase projects require `CADENCE_ALLOW_HOSTED_TEST_LOGIN=1`.
- The service-role key is used only server-side to create a temporary confirmed
  Supabase Auth user. The route then signs in through the ordinary Supabase
  password flow so app code still uses normal auth cookies and RLS.

Clean up stale temporary test users:

```bash
npm run test-login:cleanup
```

The cleanup command deletes only `cadence-test-*@example.invalid` users older
than `CADENCE_TEST_LOGIN_MAX_AGE_HOURS`, defaulting to 24 hours, and reports
counts without printing emails, ids, or auth responses.

## Auth route protection

Protected-route proxy gating uses Supabase Auth `getClaims()` to validate the
cookie-backed access token and refresh cookies when needed. This follows the
current Supabase SSR guidance for page protection and avoids using
`getSession()` in server code.

Keep strict `getUser()` lookups where the app needs the full Auth user record
or security-sensitive account actions. Ordinary app-route user id and account
label reads should use verified Supabase Auth claims through the shared current
user helper; RLS-backed database access still runs through the ordinary
authenticated Supabase client.

During local development, authenticated sessions can preview the login screen at
`/login?preview=1`. This bypass is limited to local non-production hosts and is
also linked from the development app shell.

## Source-of-truth order

1. `AGENTS.md`: operating rules and architecture constraints.
2. `STATUS.md`: current implementation state and handoff notes.
3. This runbook plus provider workflow docs.
4. Product docs under `docs/`.
5. Tests and implementation.
6. Current user prompt, when it intentionally changes scope.

If docs conflict, report and fix the conflict before implementing product code.

## Provider workflows

- Supabase: `docs/SUPABASE_WORKFLOW.md`
- Sequenzy: `docs/SEQUENZY_WORKFLOW.md`
- Vercel: `docs/VERCEL_WORKFLOW.md`

## Public-product operations

Before broad public launch, scope and verify:

- many-independent-user RLS smoke tests,
- account deletion and export/account portability,
- basic abuse protections and validation,
- monitoring/error reporting without sensitive behavior payloads,
- Terms of Service, Privacy Policy, and privacy/trust content,
- owner mapping for Vercel, Supabase, Sequenzy, VAPID, and cron secrets.

Implemented baseline:

- static RLS policy registry test for user-owned tables,
- Settings account deletion with export acknowledgement and typed confirmation,
- public `/terms`, `/privacy`, and `/trust` routes,
- auth-failure rate limiting for push subscription and reminder processing
  routes,
- bounded reminder processing batch size,
- protected occurrence horizon sync at `/api/occurrences/sync`, scheduled daily
  through Vercel Cron and guarded by `REMINDER_PROCESS_SECRET` or `CRON_SECRET`.
- behavior create/edit/archive/restore marks occurrence sync state stale and
  defers heavy occurrence/reminder repair to the next freshness-aware read
  route or the protected sync process; Settings timezone changes still sync
  immediately because timezone, active behavior schedules, and future
  unresolved occurrences must change together.

Remaining public-launch follow-up:

- execute Ticket 034 before broad account expansion: fix the restore-apply
  database readiness defect, verify hosted schema congruence, run hosted
  multi-user RLS smoke QA with `npm run smoke:rls`, audit hosted Auth/provider
  settings, and record sanitized results in `STATUS.md`.

Implemented follow-up:

- first-run onboarding for behavior creation, notification permission, optional
  import, and timezone through a dismissible Timeline setup pop-up,
- privacy-safe monitoring/error reporting through structured runtime logs that
  avoid sensitive behavior payloads.

Marketing cookies and analytics are not launch scope, but any future addition
should include consent and documentation updates.

## Marketing site operations

The public marketing site lives in `apps/marketing` as a sibling Astro app. It
does not run inside the authenticated Next.js app shell.

Project-local commands:

```bash
npm run marketing:dev
npm run marketing:build
npm run marketing:check
npm run marketing:preview
```

`npm run marketing:build` runs `astro check`, builds the static site, and
generates the sanitized example BehaviorLog bundle under the marketing public
directory before Astro copies assets into `dist`.

`npm run marketing:check` runs `astro check` and verifies the built agent
readability outputs in `apps/marketing/dist`: Markdown mirrors, `llms.txt`,
`llms-full.txt`, route manifest, sitemap, robots, metadata markers, and the
example bundle path.

The current marketing crawl policy is recorded in `docs/CRAWL_POLICY.md`.
Update that document before changing robots or Content-Signal behavior.

Use those files instead of searching repeatedly for provider setup.

## Design workflow

For UI/design tasks, use the project-local impeccable workflow:

```bash
node .agents/skills/impeccable/scripts/context.mjs
```

Then read `.agents/skills/impeccable/reference/product.md` for app UI guidance. If a specific impeccable command is relevant, read its reference before implementing.

`DESIGN.md` is seeded. After real UI exists beyond the scaffold, run the impeccable `document` workflow or otherwise update `DESIGN.md` from actual code rather than from intentions.

The local design-system bench is also the cross-surface catalog surface:

- `design-system.surfaces.json` owns the canonical surface list, component
  families, shared contracts, and per-surface implementation mappings.
- `design-system.manifest.json` and `design-system.usage.json` remain the
  current strict live inventory for the authenticated Next.js web app.
- `/design-system` renders foundations, global surface/component-family
  mappings, and fixture-backed web-app trace cards.

When changing reusable UI, tokens, surface contracts, component-family
inventory, or bench mapping, update the relevant design-system files and run:

```bash
npm run design-system:check
```

## Secrets and local files

- Never commit `.env`, `.env.local`, `.env.*.local`, CLI auth config, service-role keys, API keys, approval codes, or generated secrets.
- `.env.example` is names only plus safe default URLs.
- If a tool prints credentials, redact them in final summaries.

## Status updates

Update `STATUS.md` when a ticket starts, completes, becomes blocked, is reopened, or materially changes scope. Record verification commands with real pass/fail results.

Do not use `STATUS.md` to expand v1 product scope. Put future ideas in `docs/FUTURE_UPDATES.md` unless the user explicitly changes v1 scope.
