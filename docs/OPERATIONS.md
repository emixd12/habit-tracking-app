# Agent Operations Runbook

Use this file after `AGENTS.md` and `STATUS.md` to run the repository consistently.

## Current state

The repository contains the v1 app implementation through Ticket 030 plus
post-ticket refinements recorded in `STATUS.md`. `STATUS.md` remains the
detailed implementation ledger and should be checked before starting or
continuing any ticket.

Cadence's product posture has moved from private-only usage to a public
open-source product with multiple planned surfaces. The current implemented
surface is still the authenticated Next.js web app. See
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
- bounded reminder processing batch size.

Remaining public-launch follow-up:

- run hosted multi-user RLS smoke QA with `npm run smoke:rls` before broad
  launch and after material RLS/schema changes.

Implemented follow-up:

- first-run onboarding for behavior creation, notification permission, optional
  import, and timezone through a dismissible Timeline setup panel,
- privacy-safe monitoring/error reporting through structured runtime logs that
  avoid sensitive behavior payloads.

Marketing cookies and analytics are not launch scope, but any future addition
should include consent and documentation updates.

Use those files instead of searching repeatedly for provider setup.

## Design workflow

For UI/design tasks, use the project-local impeccable workflow:

```bash
node .agents/skills/impeccable/scripts/context.mjs
```

Then read `.agents/skills/impeccable/reference/product.md` for app UI guidance. If a specific impeccable command is relevant, read its reference before implementing.

`DESIGN.md` is seeded. After real UI exists beyond the scaffold, run the impeccable `document` workflow or otherwise update `DESIGN.md` from actual code rather than from intentions.

## Secrets and local files

- Never commit `.env`, `.env.local`, `.env.*.local`, CLI auth config, service-role keys, API keys, approval codes, or generated secrets.
- `.env.example` is names only plus safe default URLs.
- If a tool prints credentials, redact them in final summaries.

## Status updates

Update `STATUS.md` when a ticket starts, completes, becomes blocked, is reopened, or materially changes scope. Record verification commands with real pass/fail results.

Do not use `STATUS.md` to expand v1 product scope. Put future ideas in `docs/FUTURE_UPDATES.md` unless the user explicitly changes v1 scope.
