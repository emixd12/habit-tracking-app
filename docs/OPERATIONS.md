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
npm run interactions:check
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
npm run agentmail:version
```

The Supabase and Sequenzy CLIs are dev dependencies so agents do not need global installs.
AgentMail is also installed as a dev dependency for agent-owned test inbox QA.

## Standard verification

Before marking a coding task complete, run:

```bash
npm run agents:check
npm run interactions:check
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

## AgentMail Test Inboxes

AgentMail is the repo-standard test inbox layer for agent-led email QA. Use it
to create disposable or task-scoped inboxes for login, auth email,
transactional reminder, SMTP/provider, and app-runtime email testing. It is not
the production sender for auth email or app-runtime communication.

The CLI is repo-scoped and loads `AGENTMAIL_API_KEY` from `.env.local` when the
process environment does not already provide it. Use the project wrapper rather
than a global AgentMail install:

```bash
npm run agentmail:version
npm run agentmail -- --help
npm run agentmail -- inboxes list --limit 20 --format json
npm run agentmail -- inboxes create --display-name "Cadence QA Login" --username cadence-qa-login --domain agentmail.to --format json
npm run agentmail -- inboxes:messages list --inbox-id inb_xxx --limit 10 --format json
npm run agentmail -- inboxes:messages get --inbox-id inb_xxx --message-id msg_xxx --format json
npm run agentmail -- inboxes:threads list --inbox-id inb_xxx --limit 10 --format json
```

General QA loop:

1. Create or reuse an AgentMail inbox and keep the inbox ID plus generated email
   address in private task notes.
2. Use the AgentMail email address as the test recipient in the app flow.
3. Trigger the app flow through the owning auth, notification, or communication
   path.
4. Poll messages or threads, then retrieve the relevant message by ID.
5. Extract only the needed delivery evidence, such as subject, headers, or a
   reduced verification result.
6. Redact email addresses, raw tokens, links, message bodies, names, and
   provider identifiers before adding findings to reports.
7. For production-readiness claims, verify the actual owning email provider and
   app outbox too. AgentMail proves inbox receipt for a test recipient; it does
   not prove real customer delivery configuration.

AgentMail test inbox access belongs to service-access and operations work. It
must not become product, account, notification, export, or provider truth.
Auth and notification behavior still route through their owning contracts.

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

## Gated schedule-integrity repair deployment

Ticket 060's schedule repair is a normal git-tracked Supabase migration, but it
mutates existing product rows. Complete the following sequence before and
after hosted deployment:

1. Run `npm run supabase -- db reset` and
   `npm run smoke:schedule-integrity:local`. The smoke is rollback-only and
   covers idempotent repair, preserved statuses, atomic form create/update,
   stale-write refusal, cross-owner refusal, and rollback after a forced slot
   failure.
2. Obtain explicit owner authorization for the linked hosted project, create a
   fresh user-owned export/backup, and compare local and hosted migration
   history. Do not use Dashboard SQL or Table Editor repair.
3. Deploy only with `npm run supabase -- db push`.
4. Run the protected occurrence sync/reminder-planning path once for affected
   stale accounts. The migration itself never creates past reminders.
5. Record only aggregate proof: active empty schedules, orphan/cross-owner
   slots, repaired slot/occurrence counts, duplicate counts, past reminder
   counts, and freshness outcome. Do not record user, behavior, schedule,
   occurrence, provider, email, or note identifiers.
6. Browser-QA Timeline, Behaviors, Needs decision, and behavior review without
   changing preserved resolved occurrences. Recheck migration congruence and
   the Supabase security advisor afterward.

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

## Interaction registry

`interaction-registry.json` is the canonical machine-readable inventory of
implemented user interaction intents across the marketing site, public
account-information surfaces, login, and authenticated app. Its contract and
maintenance rules live in `docs/INTERACTION_REGISTRY.md` and
`interaction-registry.schema.json`.

Update the registry whenever a user-facing interaction is added, removed,
renamed, moved to another route, gated differently, or given a materially
different side effect or test-coverage posture. New interactive UI source files
must also be added to the registry's `source_inventory`.

Run:

```bash
npm run interactions:check
```

The interaction validator is also invoked from `npm run agents:check`, so new
interactive source files cannot silently bypass the inventory.

## Secrets and local files

- Never commit `.env`, `.env.local`, `.env.*.local`, CLI auth config, service-role keys, API keys, approval codes, or generated secrets.
- `.env.example` is names only plus safe default URLs.
- If a tool prints credentials, redact them in final summaries.

## Status updates

Update `STATUS.md` when a ticket starts, completes, becomes blocked, is reopened, or materially changes scope. Record verification commands with real pass/fail results.

Do not use `STATUS.md` to expand v1 product scope. Put future ideas in `docs/FUTURE_UPDATES.md` unless the user explicitly changes v1 scope.
