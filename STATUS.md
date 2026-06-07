# Implementation Status

## Function

`STATUS.md` is the current-state ledger for this repository. Future agents should read it immediately after `AGENTS.md` and before selecting work from `docs/TICKETS.md`.

Its job is to answer:

- What has already been implemented?
- What is currently in progress?
- What is blocked, deferred, or intentionally not started?
- Which verification commands were run for completed work?
- Which files, docs, or contracts changed during each ticket?
- What risks or follow-up items should the next agent know before continuing?

`STATUS.md` does **not** replace the product docs. It does not define feature scope, product behavior, UI requirements, data contracts, or source-of-truth precedence. Use:

- `AGENTS.md` for operating rules and source-of-truth order.
- `docs/TICKETS.md` for ticket scope and acceptance criteria.
- The other files under `docs/` for product, data, recurrence, notification, export, UI, and user-flow contracts.
- `STATUS.md` only for implementation state and handoff continuity.

## Update rules

Update this file whenever a ticket starts, completes, becomes blocked, is reopened, or materially changes scope.

Use these status values:

- `not_started`: No implementation work has begun.
- `in_progress`: Work has begun but is not complete or verified.
- `blocked`: Work cannot continue until a specific dependency or decision is resolved.
- `complete`: Acceptance criteria are satisfied and required verification has run, or unavailable commands are explicitly noted.
- `deferred`: Work is intentionally postponed and should not be implemented in v1 unless the docs change.

When updating a ticket row:

1. Keep the ticket scope anchored to `docs/TICKETS.md`.
2. Record key files changed, not every trivial file.
3. Record verification commands with pass/fail status.
4. Record blockers and follow-ups as concrete next actions.
5. Do not mark a ticket `complete` if `npm run lint`, `npm run typecheck`, `npm run test`, or `npm run build` failed or could not be run without explanation.
6. Do not use this file to expand v1 scope. Put future ideas in `docs/FUTURE_UPDATES.md` unless a user explicitly moves them into scope.

## Current repository state

This repository now contains the Ticket 001 Next.js application scaffold, Ticket 002 Supabase Auth setup, and the project-definition and agent-bootstrap layer.

Current evidence:

- `package.json` and `package-lock.json` exist with Next.js App Router, TypeScript, Tailwind, ESLint, and Vitest scripts.
- `app/`, `components/`, `lib/`, and `tests/` application directories exist.
- Placeholder app routes exist for Timeline, Behaviors, Analytics, Export, and Settings.
- Supabase SSR auth utilities exist under `lib/supabase/`, with Google login at `/login`, OAuth callback handling at `/auth/callback`, and protected app routes guarded by `proxy.ts` plus the app layout.
- Supabase CLI has been initialized with `supabase/config.toml`; no migrations or product database schema exist yet.
- Supabase and Sequenzy CLIs are installed as dev dependencies and exposed through `npm run supabase -- ...` and `npm run sequenzy -- ...`.
- Agent operations docs now include Supabase CLI workflow, Sequenzy CLI workflow, date/time strategy, route map, and deterministic drift checks.
- The next implementation step is Ticket 003 from `docs/TICKETS.md`.
- Project-local design workflow files exist under `.agents/skills/impeccable/` and should be used for UI/design work after the scaffold exists.

## Agent operations update

This governance update added CLI-first Supabase and Sequenzy workflows, route/date-time/resolver registry docs, project-local CLI scripts, and deterministic drift checks.

Verification run for this update:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: `npm run supabase -- --version` returned `2.105.0`
- Pass: `npm run sequenzy -- --version` returned `0.0.34`
- Pass: `npm audit --omit=dev` found 0 vulnerabilities

Supabase is initialized for local development. No database migrations have been added yet; create migrations during Ticket 003.

## Ticket status

| Ticket | Status | Implementation summary | Verification | Blockers / next action |
|---|---|---|---|---|
| 001: Initialize app | complete | Added Next.js App Router TypeScript scaffold with Tailwind v4, ESLint, Vitest, a responsive app shell, `/timeline`, `/behaviors`, `/analytics`, `/export`, and `/settings` placeholder routes, and a navigation smoke test. No database, auth, schema, or product feature logic added. | Pass: `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`; browser QA at desktop width and 390px mobile viewport; `npm audit --omit=dev` found 0 vulnerabilities. | Start Ticket 002: Add Supabase Auth. |
| 002: Add Supabase Auth | complete | Added `@supabase/ssr` and `@supabase/supabase-js`; created browser/server Supabase clients; initialized `supabase/config.toml`; added Google login at `/login`, OAuth callback exchange at `/auth/callback`, Next 16 `proxy.ts` session refresh/redirect handling, server-side app layout auth guard, sanitized auth redirect helpers, env docs, and auth redirect tests. No service-role key is used in browser code. | Pass: `npm run agents:check`; `npm run resolvers:check`; `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`; HTTP QA for `/`, `/timeline`, `/login`, and `/auth/callback`; browser QA for `/login` at desktop and 390px mobile plus protected `/timeline` redirect. | Start Ticket 003: Create database schema. Google OAuth still requires real Supabase project/provider credentials in local/deployed environment. |
| 003: Create database schema | not_started | No migrations or Supabase schema yet. | Not run. | Start after scaffold/auth context is ready. |
| 004: Recurrence resolver | not_started | No resolver implementation yet. | Not run. | Start after TypeScript test setup exists. |
| 005: Behavior CRUD | not_started | No behavior UI/service/repository implementation yet. | Not run. | Depends on schema and app shell. |
| 006: Occurrence generation | not_started | No occurrence resolver/service/repository implementation yet. | Not run. | Depends on recurrence resolver and schema. |
| 007: Timeline | not_started | No timeline screen or grouping resolver yet. | Not run. | Depends on occurrence generation and status model. |
| 008: Status marking and notes | not_started | No status resolver, buttons, or note editing yet. | Not run. | Depends on occurrences and timeline surface. |
| 009: Browser push | not_started | No push subscription or browser notification implementation yet. | Not run. | Depends on auth, schema, and reminder service shape. |
| 010: Email reminders | not_started | No Sequenzy integration or reminder processing route yet. CLI workflow and provider decision are documented. | Not run. | Depends on reminder resolver/service and protected process route decision. |
| 011: Analytics | not_started | No analytics resolver or screen yet. | Not run. | Depends on occurrence/status history. |
| 012: Export | not_started | No export resolver, service, or API routes yet. | Not run. | Depends on data model and occurrence/history records. |

## Handoff notes

- For the next coding agent: begin with Ticket 003 unless a user explicitly asks for a different docs-only task.
- Run `npm run agents:check` and `npm run resolvers:check` before standard lint/typecheck/test/build verification.
- Use `docs/SUPABASE_WORKFLOW.md` for Supabase CLI local/hosted management and `docs/SEQUENZY_WORKFLOW.md` for Sequenzy CLI/provider operations.
- Keep v1 small. Do not implement deferred PWA/offline behavior from `docs/FUTURE_UPDATES.md` unless the active docs are updated first.
- Preserve the resolver-first architecture: core logic belongs in `lib/resolvers`, database access in `lib/db`, orchestration in `lib/services`, and UI/API routes should not duplicate resolver logic.
