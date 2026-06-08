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

This repository now contains the Ticket 001 Next.js application scaffold, Ticket 002 Supabase Auth setup, Ticket 003 database schema, Ticket 004 recurrence resolver, Ticket 005 behavior CRUD, Ticket 006 occurrence generation, Ticket 007 Timeline screen, Ticket 008 status marking and notes, Ticket 009 browser push subscription/reminder planning, the local Ticket 010 email reminder processing implementation, and the project-definition and agent-bootstrap layer.

Current evidence:

- `package.json` and `package-lock.json` exist with Next.js App Router, TypeScript, Tailwind, ESLint, and Vitest scripts.
- `app/`, `components/`, `lib/`, and `tests/` application directories exist.
- Placeholder app routes exist for Timeline, Behaviors, Analytics, Export, and Settings.
- Supabase SSR auth utilities exist under `lib/supabase/`, with Google login at `/login`, OAuth callback handling at `/auth/callback`, and protected app routes guarded by `proxy.ts` plus the app layout.
- Supabase CLI has been initialized with `supabase/config.toml`; local Supabase uses the 5532x port range to avoid conflicts with another local Supabase stack.
- Product database schema exists in `supabase/migrations/20260607204951_create_database_schema.sql` with RLS-enabled profiles, categories, behaviors, occurrences, reminder_deliveries, and push_subscriptions tables. Ticket 010 adds `supabase/migrations/20260608011000_add_reminder_delivery_processing_claim.sql` for an internal `reminder_deliveries.processing_started_at` claim timestamp.
- Auth user onboarding creates a profile and default categories; migration backfills existing auth users.
- Supabase database types are generated in `lib/db/database.types.ts`, with hand-written domain aliases in `lib/types/database.ts`.
- A pure Temporal-based recurrence resolver exists in `lib/resolvers/recurrence.resolver.ts`, with recurrence domain types in `lib/types/recurrence.ts` and paired tests in `tests/recurrence.resolver.test.ts`.
- Behavior CRUD exists on `/behaviors` with server actions, service/repository access through the authenticated Supabase user, category selection, recurrence editing, scheduled time, browser/email reminder settings, active/archive handling, and active/archived lists.
- Occurrence generation exists in `lib/resolvers/occurrence.resolver.ts`, `lib/services/occurrence.service.ts`, and `lib/db/occurrences.repo.ts`. Behavior create/edit/archive now syncs a rolling today + 30 day occurrence window, inserts missing rows idempotently, removes stale future unresolved rows, and preserves past or resolved occurrence history.
- Timeline grouping exists in `lib/resolvers/timeline.resolver.ts`, `lib/services/timeline.service.ts`, and `/timeline`. The page syncs missing occurrences before rendering, shows Needs decision for prior unresolved active-behavior occurrences, starts the forward timeline at the current local day, shows the next 7 days by default, and can expand future visibility up to the generated 30-day horizon.
- Status marking and note editing exists in `lib/resolvers/status.resolver.ts`, `lib/services/occurrence.service.ts`, `app/(app)/timeline/actions.ts`, and Timeline row controls. Completed and Not Completed actions update `status_marked_at`; Completed also sets `completed_at`; switching away from Completed clears `completed_at`; note-only edits preserve status timestamps.
- Browser push subscription storage exists at `app/api/push/subscribe/route.ts`, `lib/services/push-subscription.service.ts`, and `lib/db/pushSubscriptions.repo.ts`; subscription registration validates endpoint/key shape and stores active subscriptions through the authenticated Supabase user context.
- Reminder delivery planning exists in `lib/resolvers/reminder.resolver.ts`, `lib/services/reminder.service.ts`, and `lib/db/reminderDeliveries.repo.ts`. Occurrence sync now creates missing pending reminder deliveries idempotently from behavior reminder settings, including browser reminders enabled by default, and status resolution cancels pending deliveries for resolved occurrences.
- Email reminder processing code exists at `app/api/reminders/process/route.ts`, `lib/services/reminder.service.ts`, `lib/db/reminderDeliveries.repo.ts`, and `lib/services/sequenzy.service.ts`. The protected process route validates `REMINDER_PROCESS_SECRET`, claims due pending email deliveries with `processing_started_at`, re-checks current occurrence/behavior eligibility through the reminder resolver, sends Sequenzy template emails from server-only code, and records sent, failed, or cancelled outcomes. Sequenzy account/template/test-send verification is blocked until the user logs into the Sequenzy CLI and approves a test recipient.
- Settings now shows profile email, timezone, notification permission status, browser push availability, and a browser reminder enable/save control. The client path uses only `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; real push sending still requires server-only VAPID private configuration in the processing/sending layer.
- A minimal `public/push-service-worker.js` displays received push payloads and opens same-origin app URLs, defaulting to `/timeline`. It does not implement PWA install, route caching, background sync, offline writes, or offline mutation.
- Supabase and Sequenzy CLIs are installed as dev dependencies and exposed through `npm run supabase -- ...` and `npm run sequenzy -- ...`.
- Agent operations docs now include Supabase CLI workflow, Sequenzy CLI workflow, date/time strategy, route map, and deterministic drift checks.
- The next implementation step is resolving the Ticket 010 Sequenzy provider verification blocker. Do not start Ticket 011 until Ticket 010 is accepted.
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

Supabase is initialized for local development. Ticket 003 added the first product database migration and generated database types.

## Ticket status

| Ticket | Status | Implementation summary | Verification | Blockers / next action |
|---|---|---|---|---|
| 001: Initialize app | complete | Added Next.js App Router TypeScript scaffold with Tailwind v4, ESLint, Vitest, a responsive app shell, `/timeline`, `/behaviors`, `/analytics`, `/export`, and `/settings` placeholder routes, and a navigation smoke test. No database, auth, schema, or product feature logic added. | Pass: `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`; browser QA at desktop width and 390px mobile viewport; `npm audit --omit=dev` found 0 vulnerabilities. | Start Ticket 002: Add Supabase Auth. |
| 002: Add Supabase Auth | complete | Added `@supabase/ssr` and `@supabase/supabase-js`; created browser/server Supabase clients; initialized `supabase/config.toml`; added Google login at `/login`, OAuth callback exchange at `/auth/callback`, Next 16 `proxy.ts` session refresh/redirect handling, server-side app layout auth guard, sanitized auth redirect helpers, env docs, and auth redirect tests. No service-role key is used in browser code. | Pass: `npm run agents:check`; `npm run resolvers:check`; `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`; HTTP QA for `/`, `/timeline`, `/login`, and `/auth/callback`; browser QA for `/login` at desktop and 390px mobile plus protected `/timeline` redirect. | Start Ticket 003: Create database schema. Google OAuth still requires real Supabase project/provider credentials in local/deployed environment. |
| 003: Create database schema | complete | Added initial Supabase schema migration for profiles, categories, behaviors, occurrences, reminder_deliveries, and push_subscriptions; enabled owner-scoped RLS policies; added updated_at triggers, relationship ownership constraints, reminder/subscription idempotence constraints, auth-user profile/default-category onboarding, existing-user backfill, empty local seed placeholder, generated Supabase database types, and domain aliases for status/channel literals. Clarified that `profiles.id` is the profile ownership key instead of a separate `user_id`. Local Supabase ports moved to 5532x to avoid an existing local stack conflict. | Pass: `npm run supabase -- db reset`; Pass: SQL smoke check for default categories, profile/category RLS, cross-user insert rejection, and cross-user category-link rejection; Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`. | Start Ticket 004: Recurrence resolver. Hosted Supabase deployment still requires explicit user authorization before `npm run supabase -- db push`. |
| 004: Recurrence resolver | complete | Added `@js-temporal/polyfill`, recurrence rule/domain types, and a pure Temporal-based `resolveOccurrenceSchedule` resolver covering daily, every-N-days, weekly, every-N-weeks, monthly day-N with last-day fallback, local scheduled times, explicit timezones, optional local anchor dates for interval phase, and DST disambiguation. Updated `docs/RECURRENCE_RULES.md` so the resolver contract matches the locked Temporal strategy. | Pass: `npx vitest run tests/recurrence.resolver.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`. | Start Ticket 005: Behavior CRUD. Future occurrence services should pass a stable local anchor date, such as behavior created/start date, for interval-based rules. |
| 005: Behavior CRUD | complete | Added behavior repository/service/server actions; implemented `/behaviors` create/edit/archive UI with category selection, recurrence editor, scheduled time, browser/email reminder settings, active toggle, active/archived sections, and preserved-history archive semantics via `active=false` plus `archived_at`. Updated `DESIGN.md` from the implemented behavior form/card patterns. Authenticated QA found and fixed client-side Supabase public env loading, callback provider-error handling, and edit-form stale defaults after successful saves. Hosted migration `20260607204951_create_database_schema.sql` was pushed after user authorization. | Pass: `npx vitest run tests/behavior-form.test.ts`; Pass: `npx vitest run tests/supabase-env.test.ts tests/auth-redirects.test.ts tests/auth-callback-route.test.ts`; Pass: `npm run supabase -- db push --linked --yes`; Pass: `npm run supabase -- migration list --linked`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Browser QA: hosted Google OAuth from `http://localhost:3000` completed and redirected to `/behaviors`; authenticated create/edit/archive flow passed against hosted Supabase; active behavior moved to Archived with preserved history; 390px mobile viewport had no horizontal overflow. | Start Ticket 006: Occurrence generation. Local Supabase OAuth still needs its Google redirect URI updated if local Google OAuth is used. |
| 006: Occurrence generation | complete | Added pure occurrence generation planning for the rolling today + 30 day local-date window; added Supabase occurrence repository/service orchestration; wired behavior create/edit/archive to sync occurrences; idempotent inserts use `behavior_id, scheduled_for`; stale future unresolved rows are removed while past and resolved rows are preserved. Widened the recurrence resolver range input to accept `Temporal.Instant` as well as `Date`. | Pass: `npx vitest run tests/occurrence.resolver.test.ts tests/recurrence.resolver.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`. | Ticket 007 complete; start Ticket 008: Status marking and notes. |
| 007: Timeline | complete | Added pure Timeline grouping resolver and tests; added timeline service and occurrence repository reads; replaced `/timeline` placeholder with Needs decision, current day, future day sections, show-more control, empty-day states, resolved-state styling, and expandable occurrence details. Status mutation and note editing remain for Ticket 008. Updated `DESIGN.md` from the implemented Timeline UI. | Pass: `npx vitest run tests/timeline.resolver.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Browser QA: `/timeline` authenticated render at 1280px and 390px, no horizontal overflow, Needs decision/current/future empty states visible, show-more control visible on mobile. | Start Ticket 008: Status marking and notes. |
| 008: Status marking and notes | complete | Added pure status transition and note normalization resolver; added occurrence repository/service update path; added Timeline server actions; replaced disabled Timeline buttons with live Completed / Not Completed controls; added inline expanded note editing; resolved rows can change status later from expanded details. | Pass: `npx vitest run tests/status.resolver.test.ts tests/timeline.resolver.test.ts`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run agents:check`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Browser QA: in-app browser `/timeline` redirected unauthenticated session to `/login` with no console errors. Authenticated Timeline visual QA was not possible because the in-app browser did not have a Supabase session, and Chrome fallback was not used without explicit approval. | Start Ticket 009: Browser push. Reminder cancellation on status resolution remains for the reminder-service tickets, where deliveries are generated and processed. |
| 009: Browser push | complete | Added reminder delivery resolver/tests; created reminder delivery repository/service and wired occurrence sync to create missing browser/email delivery rows from behavior reminder settings; resolving an occurrence cancels pending deliveries. Added authenticated push subscription API route, service validation, and repository upsert. Replaced Settings placeholder with profile, timezone, notification permission, and browser push availability panels plus a client enable/save control. Added minimal push service worker display/click handling without offline/PWA caching. Updated `DESIGN.md` from the implemented Settings UI and `docs/ROUTE_MAP.md` for the implemented Settings/API route state. No schema migration was needed because `push_subscriptions` and `reminder_deliveries` already existed. | Pass: `npx vitest run tests/reminder.resolver.test.ts tests/push-subscribe-route.test.ts tests/push-browser.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Browser QA: in-app browser `/settings` authenticated render at 1280px and 390px, no horizontal overflow, no console errors. Local degraded-state QA showed permission `Blocked` and missing `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, so the real browser permission prompt/subscription handshake was not clicked in this environment. | Start Ticket 010: Email reminders. Configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for real browser subscription testing; keep VAPID private/server keys out of browser code. |
| 010: Email reminders | blocked | Local implementation added a `processing_started_at` claim migration and regenerated Supabase types; extended the existing reminder repository/service to list, claim, cancel, mark sent, and mark failed due email deliveries; added a server-only Sequenzy transactional template adapter; added protected `POST /api/reminders/process`; stale pending email deliveries are cancelled when the behavior is inactive, email reminders are disabled, the occurrence is resolved, or the current resolver-planned offset no longer matches. Runtime uses `SUPABASE_SERVICE_ROLE_KEY`, `REMINDER_PROCESS_SECRET`, `SEQUENZY_API_KEY`, and `SEQUENZY_REMINDER_TEMPLATE_SLUG` only on the server side. | Pass: `npm run supabase -- db reset`; Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`; Pass: `npm run test -- tests/reminder.resolver.test.ts tests/reminder.service.test.ts tests/reminder-process-route.test.ts tests/sequenzy.service.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`. Blocked provider check: `npm run sequenzy -- whoami` reported authentication required, so template inspection and test send were not run. | User must run/authorize `npm run sequenzy -- login` or provide a server-only `SEQUENZY_API_KEY`, confirm/create the `SEQUENZY_REMINDER_TEMPLATE_SLUG`, and explicitly approve a test recipient before running `npm run sequenzy -- templates list --json`, `npm run sequenzy -- templates get <slug> --json`, and `npm run sequenzy -- send <recipient> --template <slug> --var BEHAVIOR_TITLE=Test --var OCCURRENCE_LOCAL_DATE=2026-06-08`. Hosted Supabase still needs user authorization before pushing the new migration. |
| 011: Analytics | not_started | No analytics resolver or screen yet. | Not run. | Depends on occurrence/status history. |
| 012: Export | not_started | No export resolver, service, or API routes yet. | Not run. | Depends on data model and occurrence/history records. |

## Handoff notes

- For the next coding agent: resolve the Ticket 010 Sequenzy provider verification blocker before starting Ticket 011 unless a user explicitly redirects the work.
- Run `npm run agents:check` and `npm run resolvers:check` before standard lint/typecheck/test/build verification.
- Use `docs/SUPABASE_WORKFLOW.md` for Supabase CLI local/hosted management and `docs/SEQUENZY_WORKFLOW.md` for Sequenzy CLI/provider operations.
- Keep v1 small. Do not implement deferred PWA/offline behavior from `docs/FUTURE_UPDATES.md` unless the active docs are updated first.
- Preserve the resolver-first architecture: core logic belongs in `lib/resolvers`, database access in `lib/db`, orchestration in `lib/services`, and UI/API routes should not duplicate resolver logic.
