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

This repository now contains the Ticket 001 Next.js application scaffold, Ticket 002 Supabase Auth setup, Ticket 003 database schema, Ticket 004 recurrence resolver, Ticket 005 behavior CRUD, Ticket 006 occurrence generation, Ticket 007 Timeline screen, Ticket 008 status marking and notes, Ticket 009 browser push subscription/reminder planning, Ticket 010 email reminder processing with Sequenzy provider setup, Ticket 011 Analytics, Ticket 012 Export, and the project-definition and agent-bootstrap layer.

Current evidence:

- `package.json` and `package-lock.json` exist with Next.js App Router, TypeScript, Tailwind, ESLint, and Vitest scripts.
- `app/`, `components/`, `lib/`, and `tests/` application directories exist.
- Primary app routes exist for Timeline, Behaviors, Analytics, Export, and Settings. Export is implemented with JSONL, CSV, full JSON backup, and Markdown AI summary outputs.
- Supabase SSR auth utilities exist under `lib/supabase/`, with Google login at `/login`, OAuth callback handling at `/auth/callback`, and protected app routes guarded by `proxy.ts` plus the app layout.
- Supabase CLI has been initialized with `supabase/config.toml`; local Supabase uses the 5532x port range to avoid conflicts with another local Supabase stack.
- Product database schema exists in `supabase/migrations/20260607204951_create_database_schema.sql` with RLS-enabled profiles, categories, behaviors, occurrences, reminder_deliveries, and push_subscriptions tables. Ticket 010 adds `supabase/migrations/20260608011000_add_reminder_delivery_processing_claim.sql` for an internal `reminder_deliveries.processing_started_at` claim timestamp.
- Auth user onboarding creates a profile and default categories; migration backfills existing auth users.
- Supabase database types are generated in `lib/db/database.types.ts`, with hand-written domain aliases in `lib/types/database.ts`.
- A pure Temporal-based recurrence resolver exists in `lib/resolvers/recurrence.resolver.ts`, with recurrence domain types in `lib/types/recurrence.ts` and paired tests in `tests/recurrence.resolver.test.ts`.
- Behavior CRUD exists on `/behaviors` with server actions, service/repository access through the authenticated Supabase user, category selection, recurrence editing, scheduled time, browser/email reminder settings, active/archive handling, and active/archived lists.
- Occurrence generation exists in `lib/resolvers/occurrence.resolver.ts`, `lib/services/occurrence.service.ts`, and `lib/db/occurrences.repo.ts`. Behavior create/edit/archive now syncs a rolling today + 30 day occurrence window, inserts missing rows idempotently, removes stale future unresolved rows, and preserves past or resolved occurrence history.
- Timeline grouping exists in `lib/resolvers/timeline.resolver.ts`, `lib/services/timeline.service.ts`, and `/timeline`. The page syncs missing occurrences before rendering, surfaces Needs decision for prior unresolved active-behavior occurrences through a floating lower-right button and modal, starts the forward timeline at the current local day, shows the next 7 days by default, and can expand future visibility up to the generated 30-day horizon.
- Status marking and note editing exists in `lib/resolvers/status.resolver.ts`, `lib/services/occurrence.service.ts`, `app/(app)/timeline/actions.ts`, and Timeline row controls. Completed and Not Completed actions update `status_marked_at`; Completed also sets `completed_at`; switching away from Completed clears `completed_at`; note-only edits preserve status timestamps.
- Browser push subscription storage exists at `app/api/push/subscribe/route.ts`, `lib/services/push-subscription.service.ts`, and `lib/db/pushSubscriptions.repo.ts`; subscription registration validates endpoint/key shape and stores active subscriptions through the authenticated Supabase user context.
- Reminder delivery planning exists in `lib/resolvers/reminder.resolver.ts`, `lib/services/reminder.service.ts`, and `lib/db/reminderDeliveries.repo.ts`. Occurrence sync now creates missing pending reminder deliveries idempotently from behavior reminder settings, including browser reminders enabled by default, and status resolution cancels pending deliveries for resolved occurrences.
- Email reminder processing code exists at `app/api/reminders/process/route.ts`, `lib/services/reminder.service.ts`, `lib/db/reminderDeliveries.repo.ts`, and `lib/services/sequenzy.service.ts`. The protected process route validates `REMINDER_PROCESS_SECRET`, claims due pending email deliveries with `processing_started_at`, re-checks current occurrence/behavior eligibility through the reminder resolver, sends Sequenzy template emails from server-only code, and records sent, failed, or cancelled outcomes. Sequenzy provider setup is verified with transactional slug `habit-reminder`; local `.env.local` has `SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder`.
- Analytics exists in `lib/resolvers/analytics.resolver.ts`, `lib/services/analytics.service.ts`, and `/analytics`. The resolver owns range normalization, adherence math, status counts, overall and per-behavior heatmap day states, category counts, and selected-day Not Completed inspection. Default adherence excludes unresolved occurrences.
- Export exists in `lib/resolvers/export.resolver.ts`, `lib/services/export.service.ts`, `/export`, and `/api/export/jsonl`, `/api/export/csv`, `/api/export/json`. The resolver owns range filtering, archived-behavior filtering, JSONL, CSV escaping, full JSON backup shape, and Markdown AI summary adherence math. All-time export includes occurrences through the current local day and excludes generated future rows.
- Settings now shows profile email, timezone, notification permission status, browser push availability, and a browser reminder enable/save control. The client path uses only `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; real push sending still requires server-only VAPID private configuration in the processing/sending layer.
- A minimal `public/push-service-worker.js` displays received push payloads and opens same-origin app URLs, defaulting to `/timeline`. It does not implement PWA install, route caching, background sync, offline writes, or offline mutation.
- Supabase and Sequenzy CLIs are installed as dev dependencies and exposed through `npm run supabase -- ...` and `npm run sequenzy -- ...`.
- Agent operations docs now include Supabase CLI workflow, Sequenzy CLI workflow, date/time strategy, route map, and deterministic drift checks.
- A local/dev-only design-system bench exists at `/design-system`, backed by `design-system.config.json`, `design-system.manifest.json`, `design-system.usage.json`, and `npm run design-system:check`. It renders fixture-backed existing UI only, is not in primary navigation, is disabled in production builds, and is excluded from design-system inventory/product usage scans.
- The v1 feature ticket sequence is complete through Ticket 012. Ticket 013 Vercel production hardening is deployed and authenticated production smoke QA now passes for Google login, Behavior create/archive, Timeline occurrence generation, status changes, notes, Settings render, Analytics render, and Export page/link rendering. Completion remains blocked only on production reminder processing execution verification and browser push subscription verification in a browser where notifications are not blocked.
- Vercel plugin inspection found existing project `cadence` under team `Emi's projects`, connected to GitHub repo `emixd12/habit-tracking-app` on `main`. The latest observed production deployment is ready at `cadence-r3j8s5nvu-emis-projects-4c886aeb.vercel.app`, with canonical public alias `https://cadence-blush-three.vercel.app`, and points at commit `5492863e00f77d89a5cea487d2513845cb1fd096` (`Harden Vercel cron reminders`). Production public Supabase config is present, `/login` renders without the missing-config warning, Google OAuth returns to the canonical production domain, and `/api/reminders/process` supports Vercel Cron `GET` with secret protection.
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
| 010: Email reminders | complete | Added a `processing_started_at` claim migration and regenerated Supabase types; extended the existing reminder repository/service to list, claim, cancel, mark sent, and mark failed due email deliveries; added a server-only Sequenzy transactional template adapter; added protected `POST /api/reminders/process`; stale pending email deliveries are cancelled when the behavior is inactive, email reminders are disabled, the occurrence is resolved, or the current resolver-planned offset no longer matches. Runtime uses `SUPABASE_SERVICE_ROLE_KEY`, `REMINDER_PROCESS_SECRET`, `SEQUENZY_API_KEY`, and `SEQUENZY_REMINDER_TEMPLATE_SLUG` only on the server side. Provider setup uses transactional slug `habit-reminder`, and local `.env.local` sets `SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder`. Hosted Supabase migration `20260608011000_add_reminder_delivery_processing_claim.sql` has been pushed. | Pass: `npm run supabase -- db reset`; Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`; Pass: `npm run test -- tests/reminder.resolver.test.ts tests/reminder.service.test.ts tests/reminder-process-route.test.ts tests/sequenzy.service.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Pass: `npm run sequenzy -- whoami` with `.env.local` loaded; Pass: `npm run sequenzy -- transactional get habit-reminder --json`; Pass: one user-approved test send to `emibache@gmail.com`; Pass: `npm run supabase -- db push --linked --yes`; Pass: `npm run supabase -- migration list --linked` shows local and remote `20260608011000`. | Start Ticket 011: Analytics. Set `REMINDER_PROCESS_SECRET` in the deployed/server runtime before scheduling calls to `/api/reminders/process`; do not expose it to the browser. |
| 011: Analytics | complete | Added pure analytics resolver/types/tests; added analytics service orchestration over existing behavior and occurrence repositories; replaced `/analytics` with a sparse server-rendered screen containing overall adherence, 7/30/90 range links, an overall calendar heatmap, selected-day Not Completed inspection, per-behavior counts and heatmaps, and compact category counts. Updated `docs/ROUTE_MAP.md` and `DESIGN.md` from the implemented screen. | Pass: `npx vitest run tests/analytics.resolver.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Browser QA: in-app browser `/analytics` redirected unauthenticated session to `/login?next=%2Fanalytics` at 1280px and 390px with no horizontal overflow and no console errors. Authenticated Analytics visual QA was not possible because the in-app browser did not have a Supabase session. | Start Ticket 012: Export. No Ticket 011 blockers. |
| 012: Export | complete | Added pure export resolver/types/tests; added export service orchestration over categories, behaviors, occurrences, and profile timezone; added `/api/export/jsonl`, `/api/export/csv`, and `/api/export/json` download routes; replaced `/export` placeholder with range options, Include archived behaviors, download actions, and Markdown AI summary copy/download controls. JSONL emits category, behavior, and occurrence records one per line; CSV uses the documented occurrence columns with escaping; full JSON backup includes `exported_at`, profile timezone, categories, behaviors, and occurrences; Markdown adherence excludes unresolved occurrences. Updated `docs/ROUTE_MAP.md` and `DESIGN.md` from the implemented screen. | Pass: `npx vitest run tests/export.resolver.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Browser QA: authenticated in-app browser `/export` rendered at 1280px and 390px with no horizontal overflow, no console warnings/errors, expected download links, and all-time plus archived query option state preserved. | No Ticket 012 blockers. Future restore/import history remains out of scope unless product docs change. |
| 013: Vercel production deployment | blocked | Added `vercel.json` with hourly Vercel Cron for `/api/reminders/process`; updated the route to support Vercel Cron `GET` plus existing protected manual `POST`; added `CRON_SECRET` support alongside `REMINDER_PROCESS_SECRET`; documented Vercel workflow, env ownership, Supabase Auth redirects, smoke QA, and rollback path in `docs/VERCEL_WORKFLOW.md`; updated operations/route/notification docs and `.env.example`. Vercel inspection confirms existing project `cadence` under `Emi's projects`, connected to `emixd12/habit-tracking-app` on `main`; latest production deployment `dpl_9d95kTrK9ArzgqeGC1W41f9Gcbr4` is ready at commit `5492863e00f77d89a5cea487d2513845cb1fd096`. | Pass: `npm run test -- tests/reminder-process-route.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Pass: `./node_modules/.bin/tsc --noEmit` after preserving the pre-existing local `next-env.d.ts` edit. Vercel build log inspection passed with deployment ready; build logs show root entrypoint `.`, `npm run build`, Next.js 16.2.7, Node runtime `24.x`, and only npm peer warnings from `react-reconciler`/`ink`. Production smoke after env/deploy update: canonical `/login` returns 200 with no missing Supabase config warning; protected routes redirect unauthenticated users to `/login?next=...`; `/api/reminders/process` returns 401 for a wrong bearer secret on `GET`; desktop and 390px mobile login render with no horizontal overflow and no browser console warnings/errors. Authenticated production QA passed after Supabase Site URL correction: Google OAuth returns to `https://cadence-blush-three.vercel.app/timeline`; created `Ticket 013 QA 20260608180323`; Timeline generated current and future occurrences; current occurrence was marked Completed, changed to Not Completed, and saved note `Ticket 013 production QA note 20260608180323`; Analytics rendered the Not Completed occurrence and note; Export page rendered JSONL/CSV/full JSON links and AI summary for the QA occurrence; Settings rendered profile email, `America/New_York`, notification permission `Blocked`, and browser push `Available`; QA behavior was archived and no active behaviors remain. Production runtime logs during QA show 200s for authenticated app routes, 401 for wrong reminder secret, and no error/fatal/warning logs. | Remaining blockers: a real production reminder-processing run is not verified because this environment does not have `REMINDER_PROCESS_SECRET`/`CRON_SECRET`; no scheduled `/api/reminders/process` invocation was observed around the 18:00 UTC hourly boundary, so confirm Vercel Cron is active for the account/plan or run a safe manual `POST` with the real bearer secret and `limit=1`. Do not send real emails unless an approved test recipient is expected. Browser push subscription could not be completed because the in-app browser's notification permission is `Blocked`; retry in a browser/profile where notifications are allowed. Actual file download events could not be verified because Codex in-app browser does not support downloads, but the authenticated Export page and link targets rendered correctly. |

## Post-ticket refinements

### Timeline mobile adaptation

Status: complete.

Implementation summary:
- Adapted the Timeline mobile layout while preserving the desktop ledger treatment.
- Kept occurrence rows unboxed and kept native disclosure without adding a chevron or separate disclosure icon.
- Moved mobile status actions into a full-width touch row before expanded details, increased mobile status and note action tap targets, made grouped stacks breathe more on mobile, and adapted the Needs decision button/modal for mobile safe areas.
- Browser-comment follow-up removed the mobile divider between the occurrence time/title row and the Completed/Not Completed action row while preserving the mobile touch row spacing.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and `DESIGN.md` so the mobile Timeline behavior and no-chevron choice are documented.
- Updated `design-system.usage.json` Timeline line references for the restructured occurrence row.
- No schema, resolver, provider, reminder, export, analytics, or out-of-scope product behavior changes were added.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 115 tests).
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Browser QA: `/design-system` at 390px width reported no horizontal overflow; closed occurrence details were hidden; the first status action measured 44px tall; expanding the occurrence row showed details as a grid with the status row before details and no chevron text detected; browser logs showed no warnings or errors.
- Follow-up pass: `npm run agents:check`; `npm run resolvers:check`; `./node_modules/.bin/eslint components/timeline/OccurrenceRow.tsx`; `npm run test` (19 files, 115 tests); `npm run design-system:check`; `git diff --check -- components/timeline/OccurrenceRow.tsx`.
- Follow-up browser QA: `/timeline` at 430px wide reported `statusBorderTopWidth: "0px"` for the occurrence status row and no horizontal overflow.
- Follow-up unblock: after regenerating `lib/db/database.types.ts` during BehaviorLog milestone verification, full `npm run lint`, `npm run typecheck`, and `npm run build` passed again.

Remaining risk:
- The in-app browser did not open the fixed Needs decision modal from the design-system bench trigger despite the trigger being visible and no console errors being present, so modal open/close interaction was not verified in browser QA during this pass.

### Behaviors page critique follow-up

Status: complete.

Implementation summary:
- Completed all priority fixes from the Behaviors page impeccable critique.
- Worker 1 changed `/behaviors` so the create form sits behind a native disclosure, stays closed when existing behaviors are present, and opens by default only for a no-behavior empty state.
- Worker 2 changed `BehaviorList` so per-card edit forms lazy-mount only after the card's edit disclosure is opened.
- Added a first-class Restore action for archived behaviors through the existing server action/service/repository path; Restore sets `active=true`, clears `archived_at`, and re-syncs occurrences.
- Improved segmented radio focus visibility for schedule and recurrence controls.
- Tightened behavior copy from "Schedule times" to "Scheduled for", "Every N days" to "Every few days", and recurrence unit labels to singular/plural text without `day(s)`-style wording.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and `DESIGN.md` to reflect the collapsed create form, lazy edit pattern, and Restore affordance.
- No schema changes, resolver changes, provider operations, or out-of-scope product features were added.

Verification:
- Pass: Worker 1 `npm run typecheck`.
- Pass: Worker 2 `npm run typecheck`; `npm run agents:check`; `npm run resolvers:check`; `npm run lint`; `npm run test`; `npm run build`.
- Pass: `npm run typecheck`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run test` (18 files, 103 tests).
- Pass: `npm run design-system:check`.
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`.
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`.
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`.
- Pass: `npm run build`.
- Browser QA: authenticated in-app browser `/behaviors` desktop render showed create disclosure closed, Active and Archived sections present, 8 Archive buttons, 3 Restore buttons, no horizontal overflow, and 0 mounted edit forms while cards were closed.
- Browser QA: opening one behavior edit disclosure mounted exactly 1 edit form, showed "Every few days", showed "Scheduled for", and confirmed focus-styled segmented labels were present.
- Browser QA: authenticated in-app browser `/behaviors` at 390px width showed the Active behaviors heading near the top of the viewport, create disclosure closed, 8 Archive buttons, 3 Restore buttons, no horizontal overflow, and 0 mounted edit forms while cards were closed.

Remaining risk:
- Restore was verified through render-level browser QA and build/type checks; a live database restore click was not performed to avoid changing the user's behavior data during QA.

### Behavior schedule slots

Status: complete.

Implementation summary:
- Added exact-time and preset time-range schedule slots for behaviors, including multiple slots per behavior.
- Added migration `20260609202707_add_behavior_schedule_slots.sql` with `behavior_schedule_slots`, occurrence schedule snapshot fields, RLS policies, and backfill from existing `behaviors.scheduled_time`.
- Updated behavior form parsing/UI, behavior repositories/services, occurrence generation, reminder email variables, Timeline grouping, analytics labels, export formats, generated database types, docs, and tests.
- Timeline grouping keeps each scheduled time/range as its own occurrence row, avoids progress-fill grouped rows, avoids "1 of 2 completed" labels, and keeps partial completion as a derived visual result only.

Verification:
- Pass: `npm run supabase -- db reset`
- Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`
- Pass: `npm run test -- tests/behavior-form.test.ts tests/occurrence.resolver.test.ts tests/timeline.resolver.test.ts tests/analytics.resolver.test.ts tests/export.resolver.test.ts tests/reminder.resolver.test.ts tests/reminder.service.test.ts`
- Pass: `npm run typecheck`
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run test`
- Pass: `npm run build`
- Browser QA: `/design-system` desktop fixture render shows the new schedule editor, range cues, grouped Timeline range rows, no "1 of 2 completed" label, no horizontal overflow, and no bench-specific warning/error logs observed beyond the earlier authenticated route error already noted below.
- Browser QA: `/design-system` at 390px width shows the new schedule editor, range cues, grouped Timeline range rows, no "1 of 2 completed" label, and no horizontal overflow.

Remaining risk:
- Authenticated `/behaviors` and `/timeline` render against the configured hosted Supabase database will fail until the new migration is deployed to hosted Supabase. Hosted `db push` was not run because it requires explicit user authorization.

### Timeline Needs decision modal

Status: complete.

Implementation summary:
- Replaced the inline Needs decision section on `/timeline` with a fixed lower-right Needs decision button and modal.
- The button shows the current prior-unresolved occurrence count and uses the primary visual treatment when there are decisions pending.
- The modal renders the same resolver-produced Needs decision day groups and occurrence rows, preserving Completed, Not Completed, and Note actions without duplicating timeline grouping logic.
- Updated `docs/PRODUCT_SPEC.md`, `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, `docs/ROUTE_MAP.md`, and `DESIGN.md` so the source of truth matches the modal-based interaction.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/timeline` desktop render shows no inline Needs decision section, shows the fixed lower-right count button, and reports no console warnings or errors.
- Browser QA: authenticated in-app browser `/timeline` at 390px width has no horizontal overflow, no inline Needs decision section, and the fixed count button remains within the viewport.

Remaining risk:
- The active browser-comment overlay in the in-app browser inserted `#codex-browser-sidebar-comments-root` above the page with pointer events enabled. This blocked click/key event delivery for all client toggles tested, including the existing mobile navigation button, so modal open/close interaction could not be verified in that annotated browser surface.

### Design system bench adoption

Status: complete.

Implementation summary:
- Added a local/dev-only `/design-system` bench route that renders existing product UI components with static fixture data. The route is outside primary navigation, calls no Supabase services, and returns `notFound()` in production builds.
- Added required foundation and primitive sections for typography, font scale, color, spacing, radius, border, shadow, motion, and common product control patterns.
- Added trace cards for 18 tracked UI entries, including the app shell, screen frame, primary navigation registry, login button, Timeline, Behaviors, Analytics, Export, Settings, and supporting Timeline/Behavior/Export modules.
- Added `design-system.config.json`, `design-system.manifest.json`, `design-system.usage.json`, and `scripts/check-design-system.mjs`; `npm run design-system:check` is separate from the existing required checks.
- Added the short `design-system-bench` routing hook to `AGENTS.md` and documented the internal route in `docs/ROUTE_MAP.md`.

Verification:
- Pass: `npm run design-system:check`
- Pass: post-bench temporary inventory and usage rescans; `app/design-system` did not enter inventory or product usage, and usage summary stayed at 25 product usages / 0 bench previews.
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Browser QA: `http://localhost:3000/design-system` desktop render showed 18 trace cards, required foundation anchors, closed usage drawers, no horizontal overflow, and no browser console warnings or errors.
- Browser QA: `http://localhost:3000/design-system` at 390px width showed 18 trace cards, the Needs decision product preview control, no horizontal overflow, and no browser console warnings or errors.

Remaining risk:
- A Next dev server was already running on port 3000 during QA. The bench was verified through that server; no server restart was performed.

### Quiet border system

Status: complete.

Implementation summary:
- Replaced product UI `border-2` and color-specific border treatments with the shared 1px `border-line` quiet divider across the app shell, auth, Timeline, Behaviors, Analytics, Export, Settings, and design-system previews.
- Updated the `/design-system` Border foundation so controls and panels use the same quiet divider instead of documenting a separate 2px major-border style.
- Updated `DESIGN.md` so the source-of-truth visual system now defines one 1px Ash Line border rule for product dividers, controls, panels, rows, inputs, overlays, and heatmap cells.

Verification:
- Pass: `npm run design-system:check`
- Pass: design-system-bench inventory and usage rescans to temporary files; auto inventory omitted the existing manual navigation entry, usage summary stayed at 25 product usages / 0 bench previews.
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Browser QA: `http://localhost:3000/design-system` desktop render showed both Border foundation samples at 1px with the same `border-line` color, no horizontal overflow, and no browser warning/error logs.
- Browser QA: `http://localhost:3000/design-system` at 390px width showed both Border foundation samples at 1px with the same `border-line` color, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- A Next dev server was already running on port 3000 during QA. The bench was verified through that server; no server restart was performed.

### Courier New typography stack

Status: complete.

Implementation summary:
- Replaced the product font family stack in `app/globals.css` with `Courier New` for the Tailwind `font-sans`, Tailwind `font-mono`, and body font declarations.
- Updated the `/design-system` Typography foundation row and product preview wrapper so the bench displays and computes `Courier New` instead of the previous Courier/Courier New/monospace stack.
- Updated `DESIGN.md` so the design-system source of truth names `Courier New` as the single product font family.

Verification:
- Pass: `npm run design-system:check`
- Pass: design-system-bench inventory and usage rescans to temporary files; usage summary stayed at 25 product usages / 0 bench previews.
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Browser QA: `http://localhost:3000/design-system` desktop render showed `Font family: Courier New`, computed the Typography row and product preview as `"Courier New"`, had no horizontal overflow, and reported no browser warning/error logs.
- Browser QA: `http://localhost:3000/design-system` at 390px width showed `Font family: Courier New`, computed the row as `"Courier New"`, had no horizontal overflow, and reported no browser warning/error logs.

Remaining risk:
- A Next dev server was already running on port 3000 during QA. The bench was verified through that server; no server restart was performed.

### Timeline status refresh

Status: complete.

Implementation summary:
- Updated `components/timeline/StatusButtons.tsx` to call `router.refresh()` after a successful status server action.
- The server action still owns persistence and calls `revalidatePath("/timeline")`; the refresh only asks the current route to consume the fresh resolver-produced Timeline payload.
- Preserved the existing Needs decision semantics: the floating button and modal count prior-day unresolved occurrences only.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: design-system-bench inventory and usage rescans to temporary files; usage summary stayed at 25 product usages / 0 bench previews.
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Browser QA: read-only authenticated `/timeline` render showed the floating Needs decision button count and open modal count both at `3`, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- Browser QA did not click a real Completed or Not Completed button because that would mutate the user's actual behavior history.
- Current-day completions do not reduce the Needs decision count by design; that count is derived only from unresolved occurrences before the current local date.

### IBM Plex Sans typography stack

Status: complete.

Implementation summary:
- Added the Next.js `IBM_Plex_Sans` font to `app/layout.tsx` and applied both its generated body class and CSS variable at the root layout.
- Updated `app/globals.css` so the Tailwind `font-sans`, Tailwind `font-mono`, and body font declarations use IBM Plex Sans with standard sans fallbacks.
- Updated the `/design-system` Typography foundation row and product preview wrapper so the bench displays and computes `IBM Plex Sans`.
- Updated `DESIGN.md` so the design-system source of truth names IBM Plex Sans as the single product font family.
- Restarted the existing local `next dev` server on port 3000 after browser QA found a stale generated Tailwind CSS chunk from the prior Courier New stack.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: design-system-bench inventory and usage rescans to temporary files; usage summary stayed at 25 product usages / 0 bench previews.
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Browser QA: `http://localhost:3000/design-system` desktop render showed `Font family: IBM Plex Sans`; body, Typography row, product preview, and the first `font-mono` usage computed to IBM Plex Sans; no horizontal overflow; no browser warning/error logs.
- Browser QA: `http://localhost:3000/design-system` at 390px width showed `Font family: IBM Plex Sans`; body, Typography row, product preview, and the first `font-mono` usage computed to IBM Plex Sans; no horizontal overflow; no browser warning/error logs.

Remaining risk:
- Historical `STATUS.md` entries still describe the prior Courier New work, but live source and current design docs now use IBM Plex Sans.

### Fixed sidebar and unframed behavior form

Status: complete.

Implementation summary:
- Updated `components/layout/AppShell.tsx` so the desktop sidebar is truly fixed while page content scrolls, with the main content padded by the expanded or collapsed sidebar width.
- Narrowed the collapsed desktop sidebar to a 64px icon rail, centered the expand/collapse button with the nav icons, and removed boxed borders around sidebar navigation items.
- Removed the outer border and padding from the Behaviors page Create behavior section while preserving the form controls and inner field-group dividers.
- Updated `docs/UI_SPEC.md`, `DESIGN.md`, and the design-system bench navigation preview/usage metadata so the source-of-truth and trace files match the new UI treatment.

Verification:
- Pass: `npm run design-system:check`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: design-system-bench classify/theme detection plus inventory and usage rescans to temporary files; auto inventory omitted only the existing manual navigation entry, and usage summary stayed at 25 product usages / 0 bench previews.
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Browser QA: authenticated `/behaviors` at 1024x768 showed fixed expanded sidebar metrics, `main` left padding at 288px, sidebar nav item borders at `0px`, and the Create behavior section with `0px` border and `0px` padding.
- Browser QA: authenticated `/behaviors` collapsed at 1024x768 showed a 64px fixed sidebar, `main` left padding at 64px, expand/collapse button and all nav icons centered at the same x coordinate, and nav item borders at `0px`.
- Browser QA: `/behaviors` at 390px showed no horizontal overflow; the mobile drawer opened to 288px, kept nav item borders at `0px`, and stayed within the viewport.
- Browser QA: authenticated `/timeline` at 1024x768 after scrolling showed the sidebar fixed at top `0`, `main` left padding at 288px, no horizontal overflow, and nav item borders at `0px`.

Remaining risk:
- The `/timeline` browser QA route took one slow first render during local dev before the layout metrics were collected; the measured layout state passed after the page loaded.
- After resetting the temporary browser viewport, local dev Supabase auth fetches began timing out and the cleanup navigation landed on `/login?next=%2Fbehaviors`; the authenticated `/behaviors` and `/timeline` layout checks had already completed.

### Behavior form timezone removal and recurrence flattening

Status: complete.

Implementation summary:
- Removed the Timezone display panel from the Behavior create/edit form; timezone remains owned by Settings and is still applied server-side from the profile/default timezone during behavior creation.
- Removed the Recurrence editor's outer bordered panel while preserving its semantic fieldset, segmented recurrence presets, and weekday/monthly controls.
- Changed Recurrence subsection labels such as Every, On, and Day to smaller muted heading text.
- Tightened the desktop sidebar from 288px to 256px expanded and from 64px to 56px collapsed, with matching main-content offsets.
- Updated `docs/UI_SPEC.md`, `DESIGN.md`, the design-system bench preview usage, and design-system trace metadata to match the new form and shell treatment.

Verification:
- Pass: `npm run design-system:check`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: design-system-bench classify/theme detection plus inventory and usage rescans to temporary files; auto inventory omitted only the existing manual navigation entry, and usage summary stayed at 25 product usages / 0 bench previews.
- Browser QA: authenticated `/behaviors` at 1024x768 showed a fixed 256px sidebar, `main` left padding at 256px, no timezone block in the form, a 0px border/0px padding Recurrence fieldset, and no horizontal overflow.
- Browser QA: authenticated `/behaviors` collapsed at 1024x768 showed a 56px sidebar, `main` left padding at 56px, and the expand/collapse button plus all nav icons centered on the same x coordinate.
- Browser QA: authenticated `/behaviors` at 390px showed no horizontal overflow, no timezone block, and a 0px border/0px padding Recurrence fieldset.
- Browser QA: authenticated `/timeline` at 1024x768 after scrolling showed the sidebar fixed at top `0`, a 256px sidebar width, `main` left padding at 256px, and no horizontal overflow.

Remaining risk:
- Local dev-server logs showed transient Supabase DNS/auth fetch failures before browser QA, but the server recovered and authenticated `/behaviors` and `/timeline` layout QA completed successfully.

### Reminder editor flattening

Status: complete.

Implementation summary:
- Updated `components/behaviors/ReminderEditor.tsx` so the Reminders fieldset uses the same unframed form-section treatment as Recurrence, with no outer border or padding.
- Changed the Reminder offset label to the smaller muted subsection-heading style.
- Updated `docs/UI_SPEC.md` and `DESIGN.md` so Reminders, Recurrence, and the Behavior form source-of-truth describe the same unframed pattern.
- While verifying, aligned the existing in-progress schedule-slot work with TypeScript by updating generated database types for the existing `behavior_schedule_slots` migration, schedule-slot service/test fixtures, design-system preview fixtures, analytics/export test fixtures, and behavior/export mapping fixtures.

Verification:
- Pass: `npm run design-system:check`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Browser QA: `/design-system` desktop render showed the live Reminders fieldset at `0px` border and `0px` padding, matching Recurrence, with Reminder offset at 12px bold label text and no horizontal overflow.
- Browser QA: `/design-system` at 390px width showed the Reminders fieldset at `0px` border and `0px` padding with no horizontal overflow.

Remaining risk:
- Authenticated `/behaviors` browser QA is currently blocked by the connected Supabase schema/cache returning `PGRST200` for the `behaviors` to `behavior_schedule_slots` relationship. The migration and docs exist locally, but the connected database was not updated in this task because hosted schema deployment requires explicit authorization.

### Hosted schedule-slot schema deployment and embed repair

Status: complete.

Implementation summary:
- Pushed hosted Supabase migration `20260609202707_add_behavior_schedule_slots.sql`, bringing the connected remote schema back in line with local migrations.
- Confirmed the hosted schema now has `behavior_schedule_slots` and occurrence schedule snapshot columns.
- Fixed `lib/db/behaviors.repo.ts` to embed `schedule_slots` through the explicit owner-scoped `behavior_schedule_slots_behavior_owner_fkey` relationship, resolving PostgREST `PGRST201` ambiguity after the schema migration was deployed.
- Triggered a production Vercel redeploy with empty commit `c9989b8` (`chore: trigger Vercel redeploy`) before making the code repair, then verified deployment `dpl_F7zEzJBMshqwAA6DkJRHSUus6u4R` reached `READY`.

Verification:
- Pass: `npm run supabase -- db push --linked --yes`
- Pass: `npm run supabase -- migration list --linked`
- Pass: remote Supabase probe for `behavior_schedule_slots`, occurrence schedule columns, and explicit behavior schedule-slot embed
- Pass: unauthenticated local `/timeline` redirects to `/login?next=%2Ftimeline`
- Pass: authenticated in-app browser `/timeline` renders without the runtime overlay or warning/error logs
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`

Remaining risk:
- None known for the hosted schedule-slot schema and behavior schedule-slot embed issue.

### Timeline completion chime

Status: complete.

Implementation summary:
- Added the user-provided MP3 as `public/sounds/completion-chime.mp3`.
- Added client-side completion feedback so `StatusButtons` preloads the chime and plays it only after a successful user-initiated status change into Completed.
- Kept Not Completed, note saves, page refreshes, and re-saving an already Completed occurrence silent.
- Follow-up: changed playback to fetch the MP3 during preload, create/resume the browser audio context during the user's submit gesture, and play the decoded chime only after the status server action reports success. This addresses browser policies that can block first-click audio when `play()` is called only after the async save returns.
- Documented the chime behavior in `docs/UI_SPEC.md` and `DESIGN.md`.
- Added `lib/ui/completion-feedback.ts` and paired tests for the completion-chime decision rule.
- Updated the design-system bench preview to pass the existing `restoreAction` prop required by the in-progress BehaviorList work, and excluded non-rendering `lib/ui/**` helpers from auto-inventory scans.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: `npm run test -- tests/completion-feedback.test.ts`
- Pass: design-system-bench classify/theme detection plus inventory and usage rescans to temporary files; inventory stayed focused on 18 rendered components and did not retain the audio helper as a visual module after config exclusion.
- Pass: `curl -I http://localhost:3000/sounds/completion-chime.mp3` returned `200 OK` with `Content-Type: audio/mpeg`.
- Browser QA: authenticated in-app browser `/timeline` desktop render showed Completed controls, no horizontal overflow, and no warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390px width showed Completed controls, no horizontal overflow, and no warning/error logs.
- Follow-up Browser QA: local `/design-system#ds-module-status-buttons` rendered the fixture Completed button and reported no warning/error logs, but its server-action mock did not submit in the in-app browser fixture; no product data was changed.

Remaining risk:
- Browser QA did not click a real Completed button because that would mutate the user's actual behavior history. The client decision rule is covered by tests, and the audio asset route is verified.

### Timeline Not Completed approval controls

Status: complete.

Implementation summary:
- Updated the Timeline resolver display metadata so `not_completed` occurrences expose the same collapsed Completed / Not Completed controls as an unresolved decision row, with Not Completed indicated as the current choice.
- Completed rows continue to use the full blue resolved treatment and collapsed status label instead of primary buttons.
- Updated the Timeline UI source-of-truth docs and design-system occurrence-row fixture so Not Completed rows are documented and previewed as approval-ready, without adding a new stored status or changing Needs decision semantics.

Verification:
- Pass: `npm run test -- tests/timeline.resolver.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: design-system-bench classify/theme detection, inventory and usage scans to temporary files, and `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Browser QA: authenticated in-app browser `/timeline` default-width render showed the selected Not Completed row with collapsed Completed and Not Completed buttons, Not Completed `aria-pressed="true"`, Completed rows still label-only, no horizontal overflow, and no browser warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390px width showed the same Not Completed collapsed controls, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- Browser QA did not click the status buttons because that would mutate the user's actual behavior history. The resolver display contract is covered by `tests/timeline.resolver.test.ts`.

### Timeline Not Completed original surface

Status: complete.

Implementation summary:
- Updated `components/timeline/OccurrenceRow.tsx` so `not_completed` rows use the same `bg-background` collapsed card surface and `bg-surface` expanded-detail surface as the original unresolved row.
- Preserved the prior behavior where `not_completed` rows expose both collapsed Completed and Not Completed buttons, with Not Completed indicated as the current choice.
- Confirmed no schema migration is needed: the existing `occurrences` row already stores `status`, `completed_at`, and `status_marked_at` per scheduled occurrence instance.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and `DESIGN.md` to call this a visual reset while preserving the stored `not_completed` status on the occurrence instance.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test`
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: design-system-bench classify/theme detection, inventory and usage scans to temporary files, and `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Browser QA: authenticated in-app browser `/timeline` default-width render showed Not Completed rows on `bg-background` with collapsed Completed and Not Completed buttons, no horizontal overflow, and no browser warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390px width showed the 9:00 AM Not Completed row on `bg-background` with both buttons, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- Browser QA did not click status buttons because that would mutate the user's actual behavior history. No data-model risk is known for this visual treatment change.

### Font scale downshift

Status: complete.

Implementation summary:
- Shifted the app's Tailwind text scale down one step at the shared token level in `app/globals.css`; existing `text-*` utilities now render smaller across product UI and product previews.
- Updated the `/design-system` Font scale foundation to show Display 30, Heading 24, Section 20, Body 14, and Label 12 with matching computed sizes.
- Updated `DESIGN.md` so the typography source of truth matches the implemented scale.
- During verification, fixed a hook dependency warning in `components/timeline/StatusButtons.tsx` and a lint-only `this` alias in `tests/completion-feedback.test.ts` from the existing completion-chime worktree changes.

Verification:
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/classify_repo.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/detect_theme_support.py --root .`
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test -- tests/completion-feedback.test.ts`
- Pass: `npm run test` (18 files, 106 tests).
- Pass: `npm run build`
- Browser QA: `/design-system` at 1042x863 showed the Font scale foundation with computed sizes Display 30, Heading 24, Section 20, Body 14, and Label 12; no horizontal overflow.
- Browser QA: `/design-system` at 390x844 showed the same computed font-scale values, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- The change was verified on the design-system bench and fixture-backed product previews. Authenticated product-route click flows were not exercised because this was a shared typography-token change and should not mutate user data.

### No-bold typography experiment

Status: complete.

Implementation summary:
- Added shared font-weight token overrides in `app/globals.css` so Tailwind weight utilities from `font-medium` through `font-black` render at normal `400` weight.
- Added native-element resets for headings, semantic bold text, table headers, definition terms, and summaries so browser defaults do not reintroduce bolding.
- Updated `DESIGN.md` so the typography contract describes all hierarchy levels at `400` weight and notes that this is a no-bold experiment.

Verification:
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/classify_repo.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/detect_theme_support.py --root .`
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (18 files, 107 tests).
- Pass: `npm run build`
- Browser QA: `/design-system` at desktop width showed bench chrome and Font scale samples all computed at `font-weight: 400`; no horizontal overflow.
- Browser QA: authenticated `/timeline` at desktop width showed sampled title, nav, button, section heading, and body text all computed at `font-weight: 400`; no horizontal overflow.
- Browser QA: authenticated `/timeline` at 390x844 showed sampled mobile brand, menu button, page title, section heading, and body text all computed at `font-weight: 400`; no horizontal overflow and no warning/error logs.

Remaining risk:
- This is intentionally a broad visual experiment. It preserves existing component class names, so future reversion can remove the shared token overrides without editing every component.

### Completion chime diagnostics follow-up

Status: complete.

Implementation summary:
- Diagnosed the completion chime path after reports that Completed did not trigger sound.
- Confirmed `/sounds/completion-chime.mp3` is served locally as `audio/mpeg`; the remaining likely causes were browser activation timing after async server actions, loss of submitted status intent, transient preload failure caching, and embedded-browser media API gaps.
- Changed `StatusButtons` so Completed and Not Completed are submitted through separate structural forms with hidden `occurrence_id` and `status` fields instead of relying on `SubmitEvent.submitter`.
- The status server action now echoes the submitted status in `OccurrenceActionState`; `StatusButtons` uses that server-confirmed status after success while still priming audio on pointer/click/submit before the async action returns.
- Hardened `lib/ui/completion-feedback.ts` to prime Web Audio with a silent one-sample source, unlock an `HTMLAudioElement` during the user gesture, prefer the media element for actual audible playback, keep Web Audio as fallback, retry failed preload/decode attempts, guard missing `AudioContext`/`Audio` APIs, and emit dev-only playback/blocked diagnostics.
- Changed the Timeline refresh sequence so `router.refresh()` waits until the chime playback path has started instead of immediately refreshing after the successful status action.
- Updated the design-system fixture action to mirror the real status action's `nextStatus` return for fixture-backed browser QA.
- No schema, resolver, product-scope, notification-provider, or real occurrence-data changes were made.

Verification:
- Pass: `curl -I http://localhost:3000/sounds/completion-chime.mp3` returned `200 OK` with `Content-Type: audio/mpeg`.
- Pass: `ffprobe`/`ffmpeg` diagnostics after installing `ffmpeg`: asset is a 1-second stereo MP3, peak `-2.7 dB`, RMS `-25.1 dB`, with audible content before the trailing silence.
- Pass: `afplay public/sounds/completion-chime.mp3` exited successfully.
- Pass: `npm run test -- tests/completion-feedback.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run design-system:check`
- Pass: `npm run typecheck`
- Pass: `npm run test` (18 files, 107 tests).
- Pass: `npm run build`
- Browser QA: in-app browser `/design-system#ds-module-status-buttons` rendered Completed and Not Completed controls and the fixture action completed without mutating product data. The in-app browser reports `AudioContext`, `Audio`, and `Notification` as unavailable, so it cannot prove audible playback in that embedded surface.
- Browser QA: Chrome plugin fresh tab `/design-system#ds-module-status-buttons` clicked Completed and logged `cadence:completion-chime-played media`, confirming the normal browser media element playback path started. The only observed Chrome warning was an extension-injected hydration mismatch, unrelated to audio.
- Browser QA: Chrome design-system `NotificationPermissionPanel` preview showed the `Permission` row, `Browser push` row, and `Enable browser reminders` control. The fixture has no VAPID key, so the control was disabled and no permission prompt was opened or accepted.
- Browser QA: in-app browser `NotificationPermissionPanel` preview showed the `Permission` row and `Enable browser reminders` control, with permission blocked/unavailable in that embedded surface.

Remaining risk:
- The in-app browser cannot play or authorize audio because its media and notification APIs are unavailable; Chrome verified the actual media playback-start path.
- Browser notification permission prompts were not accepted during QA. The permission label/control is present, and prompt triggering remains owned by Settings with real push configuration.

### Timeline status action text links

Status: complete.

Implementation summary:
- Changed `components/timeline/StatusButtons.tsx` so Timeline Completed and Not Completed actions render as inline text-link controls instead of boxed filled/outlined buttons, while retaining the check and x icons.
- Kept semantic submit buttons under the hood so keyboard access, form submission, pending state, `aria-pressed`, and completion chime preparation remain intact.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and `DESIGN.md` so future Timeline work preserves text-link status actions instead of reintroducing button chrome.
- No schema, resolver, service, API route, provider, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (18 files, 107 tests).
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/classify_repo.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/detect_theme_support.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/timeline` desktop render showed Completed and Not Completed controls with transparent background, `0px` border width, retained icons, current-choice underline where applicable, and no warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390px width showed the text-link status actions wrapping without horizontal overflow and no warning/error logs.

Remaining risk:
- Browser QA did not click status actions because that would mutate the user's actual occurrence history. The existing fixture-backed StatusButtons path remains covered by the design-system bench.

### Timeline borderless row polish

Status: complete.

Implementation summary:
- Removed perimeter borders from Timeline occurrence rows and tightened row rhythm with a 4px list gap plus compact 10-12px row padding.
- Removed the Timeline page helper sentence under the title.
- Removed the border from the mobile top-bar navigation icon button.
- Removed the internal divider between the number and text in the floating Needs decision button while keeping its outer button affordance.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, `DESIGN.md`, and the local design-system typography preview so the documented visual direction matches the implemented Timeline.
- No schema, resolver, service, API route, provider, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (18 files, 107 tests).
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/timeline` at 942px width showed no Timeline helper text, occurrence row border widths at `0px`, list `rowGap: 4px`, row padding at `12px`, mobile menu trigger border widths at `0px`, Needs decision count span border widths at `0px`, no horizontal overflow, and no warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390px width showed no Timeline helper text, occurrence row border widths at `0px`, list `rowGap: 4px`, row padding at `10px`, mobile menu trigger border widths at `0px`, Needs decision count span border widths at `0px`, no horizontal overflow, and no warning/error logs.

Remaining risk:
- Browser QA was visual/read-only. Status actions and the Needs decision modal were not clicked to avoid mutating the user's live occurrence history.

### Timeline status action underline affordance

Status: complete.

Implementation summary:
- Changed `components/timeline/StatusButtons.tsx` so all Timeline status text-link actions are underlined by default.
- Follow-up: normalized Completed and Not Completed action underlines to the same thin `decoration-1` treatment so Not Completed no longer receives a saved-status thickness cue.
- Removed `aria-pressed` from the status action controls because the controls are submit actions, not the row's status indicator.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and `DESIGN.md` to document consistent thin underlines and avoid current-choice styling for Not Completed rows.
- No schema, resolver, service, API route, provider, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/classify_repo.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/detect_theme_support.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/timeline` desktop render showed sampled Completed and Not Completed status actions with transparent backgrounds, 0px borders, `textDecorationLine: underline`, `textDecorationThickness: 1px`, and no `aria-pressed`; no warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390px width showed the same sampled status action styles, no horizontal overflow, and no warning/error logs.

Remaining risk:
- Browser QA was visual/read-only. Status actions were not clicked to avoid mutating the user's live occurrence history.

### Timeline browser comment polish

Status: complete.

Implementation summary:
- Removed the visible Timeline page title so the Timeline feed starts directly with the current-day section while preserving an `sr-only` page heading for accessibility.
- Reworked Timeline occurrence rows so scheduled labels use a fixed column and behavior title first letters align across exact times and preset ranges.
- Added compact Timeline-only preset labels, so range occurrences display `Morning`, `Afternoon`, `Evening`, or `Night` without the full clock range; export, analytics, and reminder labels can still use the full range text.
- Added soft blue hover hues for unresolved and Needs decision rows, with a darker blue hover for Completed rows.
- Reworked expanded occurrence row layout so status actions stay pinned to the top-right and the expanded detail panel spans the full inner row width.
- Changed Timeline Completed status actions to use black text like Not Completed.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, `DESIGN.md`, the design-system Timeline fixture, and `design-system.usage.json` to match the implemented Timeline state.
- Added `tests/schedule.test.ts` coverage for full versus compact schedule labels.
- No schema, resolver, provider, status semantics, notification behavior, or product-scope changes were made.

Verification:
- Pass: `npm run test -- tests/schedule.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/classify_repo.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/detect_theme_support.py --root .`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/timeline` at 942px width showed no visible Timeline page title, the current-day section at the top of the content, zero horizontal overflow, compact `Evening` range labels, aligned behavior-title x positions, black Completed/Not Completed actions, and emitted hover CSS for `#eef6ff`, `#e8f2ff`, and `#2f669f`.
- Browser QA: opening the second current-day row kept status actions top-aligned with the summary (`0px` top delta) and measured the expanded details panel at the full inner row width.
- Browser QA: authenticated in-app browser `/timeline` at 390px width showed no visible Timeline page title, zero horizontal overflow, compact `Evening` range labels, and aligned behavior-title x positions.
- Browser QA: no warning or error logs were observed in the in-app browser after the Timeline checks.

Remaining risk:
- Browser QA was visual/read-only. Status action clicks were not performed to avoid mutating the user's live occurrence history.
- The in-app browser did not report `:hover` state from synthetic pointer movement, so hover was verified by emitted CSS and row class output rather than a live hover screenshot.

### Timeline row vertical alignment polish

Status: complete.

Implementation summary:
- Centered collapsed Timeline row contents so scheduled time, behavior title, collapsed status text, and Completed / Not Completed action text share the row's vertical midpoint.
- Preserved the expanded-row layout by returning status controls to top alignment when a row's details are open on desktop.
- Added a targeted Timeline status-action hover/focus weight rule so Completed and Not Completed become heavier on hover/focus without changing the global no-bold typography tokens.
- Updated `docs/UI_SPEC.md` and `DESIGN.md` to document the centered collapsed-row treatment and the status-link hover exception.
- No resolver, service, schema, provider, status semantic, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run design-system:check`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run build`
- Pass: design-system-bench classify, theme detection, inventory scan to `/tmp/cadence-design-system.manifest.json`, usage scan to `/tmp/cadence-design-system.usage.json`, and traceability verification.
- Browser QA: authenticated in-app browser `/timeline` at 1042x863 showed the selected `Clean Invisalign` row with time, title, status wrapper, Completed, and Not Completed all at `0px` vertical center delta from the row midpoint, no horizontal overflow, and no browser warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390x844 showed the selected row fitting within the viewport with no horizontal overflow and no browser warning/error logs.
- Browser QA: emitted page CSS includes `.timeline-status-action:not(:disabled):hover, .timeline-status-action:focus-visible { font-weight: 600; }` and the expanded-row `:has(details[open])` alignment rule.

Remaining risk:
- Browser QA was visual/read-only. Status action clicks were not performed to avoid mutating the user's live occurrence history.

### Timeline status hover color refinement

Status: complete.

Implementation summary:
- Removed the hover color shift from Timeline Completed and Not Completed text-link status actions while preserving the targeted hover/focus heavier text treatment.
- Updated `docs/UI_SPEC.md` and `DESIGN.md` so the status-action contract says hover/focus may become heavier without changing color.
- No resolver, service, schema, provider, status semantic, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run design-system:check`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run build`
- Pass: design-system-bench classify, theme detection, inventory scan to `/tmp/cadence-design-system.manifest.json`, usage scan to `/tmp/cadence-design-system.usage.json`, and traceability verification.
- Browser QA: authenticated in-app browser `/timeline` at 1042x863 showed the selected `Clean Invisalign` row with two Timeline status actions, no `hover:text-primary` class, no hover color CSS for `.timeline-status-action`, and no horizontal overflow or browser warning/error logs.
- Browser QA: authenticated in-app browser `/timeline` at 390x844 showed the selected row with no `hover:text-primary` status-action class, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- Browser QA was visual/read-only. Status action clicks were not performed to avoid mutating the user's live occurrence history.

### Timeline sidebar and hover stability polish

Status: complete.

Implementation summary:
- Changed the desktop app-shell brand label from `Cadence Tracker` to `Cadence`, matching the mobile header.
- Tied the active primary navigation item directly to the shared `--primary` blue token used by completed Timeline rows and primary card states.
- Reduced the Timeline occurrence summary gap between the scheduled time column and behavior title from `0.75rem` to `0.25rem`.
- Replaced the Timeline status-action hover/focus `font-weight` change with non-reflowing text-shadow emphasis so hovering Not Completed does not move the neighboring Completed action.
- Updated `docs/UI_SPEC.md` and `DESIGN.md` to document non-reflowing status-action hover/focus emphasis.
- No resolver, service, schema, provider, status semantic, notification behavior, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run design-system:check`
- Pass: design-system-bench inventory scan to `/tmp/cadence-design-system.manifest.json`, usage scan to `/tmp/cadence-design-system.usage.json`, and traceability verification.
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/timeline` at 854x863 showed sidebar label `Cadence`, active Timeline nav background `rgb(53, 114, 179)` matching `--primary: #3572b3`, row column gap `4px`, no horizontal overflow, no warning/error logs, and emitted status-action hover/focus CSS using `text-shadow` without a font-weight change.
- Browser QA: authenticated in-app browser `/timeline` at 390x844 showed header label `Cadence`, row column gap `4px`, no horizontal overflow, and no warning/error logs.

Remaining risk:
- Browser QA was visual/read-only. Status actions were not clicked to avoid mutating the user's live occurrence history.

### Sidebar rail specification

Status: complete.

Implementation summary:
- Applied the requested desktop sidebar rail contract in `components/layout/AppShell.tsx`: expanded width is 16rem, collapsed width is 4rem, main content uses matching `lg:pl-64` or `lg:pl-16`, and width/padding transitions run over 200ms.
- Added `sidebar-open` localStorage persistence for the desktop rail, defaulting to open on desktop when no saved preference exists.
- Rebuilt the desktop header around a stable `grid-cols-[4rem_1fr]` layout, with a logo toggle, collapsed hover crossfade to `PanelLeftOpen`, and an expanded right-side `PanelLeftClose` button.
- Reworked primary nav and footer account rows around a fixed 64px icon/avatar column, 40px nav rows, 16px icons, opacity-collapsed labels, row hover when expanded, and icon-cell hover/active treatment when collapsed.
- Replaced mobile sidebar behavior with a separate sticky 64px mobile header plus 60vw drawer, z-70 backdrop, z-80 drawer, Escape close, backdrop close, focus trapping, body scroll lock, edge swipe open, and left swipe close.
- Passed the authenticated profile name/email into the shell footer account trigger from the protected app layout.
- Added Tailwind token aliases for `card`, `muted-foreground`, and `ring`, updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, `DESIGN.md`, and refreshed design-system navigation preview/usage metadata.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run design-system:check`
- Pass: design-system-bench inventory scan to `/tmp/cadence-design-system.manifest.json`, usage scan to `design-system.usage.json`, and traceability verification.
- Pass: `npm run build`
- Browser QA: unauthenticated in-app browser correctly redirected protected `/timeline` to `/login?next=%2Ftimeline`.
- Browser QA: local `/design-system` desktop shell preview at 1280px measured 256px expanded sidebar width, 256px main left padding, 64px icon cell, 16px icons, 40px nav rows, 64px header, label opacity `1`, and no horizontal overflow.
- Browser QA: local `/design-system` mobile shell preview at 390px measured hidden desktop aside, sticky 64px mobile header, 60vw drawer width, 64px drawer header, z-80 drawer, z-70 backdrop, 200ms transform transition, closed drawer translate `-100%`, no body scroll lock while closed, and no horizontal overflow.

Remaining risk:
- The in-app browser did not have an authenticated Supabase session, so real protected app-shell interaction was not visually QA'd on `/timeline`.
- The design-system shell preview rendered the layout correctly but did not dispatch pointer-driven state changes reliably inside the contained preview, so collapse/open clicks, focus trap cycling, and swipe gestures were verified by implementation and static measurements rather than live pointer interaction.

### Desktop sidebar header divider removal

Status: complete.

Implementation summary:
- Removed the bottom divider from the desktop sidebar header container in `components/layout/AppShell.tsx`, matching the browser comment on the collapsed Expand navigation/logo cell.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and `DESIGN.md` so the navigation contract records the unruled desktop header treatment.
- No resolver, service, schema, route, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run design-system:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run build`
- Pass: design-system-bench classify, theme detection, inventory scan to `/tmp/cadence-design-system.manifest.json`, usage scan to `/tmp/cadence-design-system.usage.json`, and traceability verification.
- Browser QA: authenticated `/timeline` at 1132x863 measured the fixed desktop sidebar header bottom border at `0px`, desktop sidebar width at `256px`, main left padding at `256px`, no horizontal overflow, and no browser warning/error logs.
- Browser QA: `/timeline` at 390x844 after reload measured desktop sidebar hidden, mobile top header height `64px`, mobile top and drawer header bottom borders still `1px`, main left padding `0px`, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- The annotated browser surface blocked pointer delivery for a live collapse click, but the removed border is on the shared desktop header container used in both expanded and collapsed rail states.

### Mobile drawer header divider removal

Status: complete.

Implementation summary:
- Removed the bottom divider from the mobile drawer Cadence header in `components/layout/AppShell.tsx`, matching the browser comment on `aside#mobile-navigation`.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and `DESIGN.md` so the navigation contract records the unruled mobile drawer header treatment.
- No resolver, service, schema, route, or product-scope changes were made.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run design-system:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run build`
- Pass: design-system-bench classify, theme detection, inventory scan to `/tmp/cadence-design-system.manifest.json`, usage scan to `/tmp/cadence-design-system.usage.json`, and traceability verification.
- Browser QA: authenticated `/timeline` at 890x863 with the mobile drawer open measured the drawer Cadence header bottom border at `0px`, drawer width at `534px`, no horizontal overflow, and no browser warning/error logs.
- Browser QA: authenticated `/timeline` at 1132x863 measured the fixed desktop sidebar header bottom border still at `0px`, desktop sidebar width at `256px`, no horizontal overflow, and no browser warning/error logs.

Remaining risk:
- The sticky mobile top header still has its bottom divider; the browser comment targeted the open drawer header under Cadence.

### BehaviorLog status vocabulary alignment

Status: complete.

Implementation summary:
- Renamed the legacy stored occurrence status vocabulary to `completed` / `not_completed` across code, docs, tests, UI action values, analytics/export resolvers, and design-system fixtures.
- Added Supabase migration `20260612073554_rename_occurrence_statuses_to_behaviorlog.sql` to migrate existing `occurrences.status` rows and replace the check constraint.
- Kept UI labels as Completed / Not Completed and preserved existing semantics: unresolved is not failure, Needs decision remains derived, Completed sets `completed_at`, Not Completed clears it, and resolving cancels pending reminders.
- Export JSONL, CSV, and full JSON now emit `completed` / `not_completed`.

Verification:
- Pass: `npm run supabase -- db reset`
- Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`
- Pass: `npm run test -- tests/status.resolver.test.ts tests/timeline.resolver.test.ts tests/analytics.resolver.test.ts tests/export.resolver.test.ts tests/occurrence.resolver.test.ts tests/reminder.resolver.test.ts tests/completion-feedback.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run test` (19 files, 110 tests).
- Pass: `npm run typecheck`
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: design-system-bench classify, theme detection, inventory scan to `/tmp/cadence-design-system.manifest.json`, usage scan to `/tmp/cadence-design-system.usage.json`, and traceability verification.
- Pass: `npm run supabase -- migration list` showed hosted migration history aligned except for pending `20260612073554`.
- Pass: `npm run supabase -- db push --dry-run` would apply only `20260612073554_rename_occurrence_statuses_to_behaviorlog.sql`.
- Pass: `npm run supabase -- db push --yes` applied `20260612073554_rename_occurrence_statuses_to_behaviorlog.sql` to hosted Supabase.
- Pass: `npm run supabase -- migration list` confirmed local and hosted migration histories now match through `20260612073554`.
- Pass: hosted `db query --linked` confirmed `occurrences_status_check` allows only `unresolved`, `completed`, and `not_completed`.
- Pass: hosted `db query --linked` confirmed zero `occurrences` rows remain with legacy status values.

Remaining risk:
- Browser QA was not rerun because UI-visible labels and layout treatments did not change; hidden action values and status behavior were covered by resolver/UI-adjacent tests plus build and design-system checks.

### BehaviorLog interoperability milestone 1

Status: complete.

Implementation summary:
- Added internal `occurrence_status_events` history for explicit status marks and corrections, including same-user occurrence ownership, same-user `revises_event_id` ownership, RLS, and authenticated select/insert-only grants so normal app code treats the table as append-only.
- Updated status transition planning so the resolver produces status-event semantics and the occurrence service persists the event after a status change.
- Added BehaviorLog `.behaviorlog.zip` export generation with manifest hashes, schema, README, AGENTS guidance, behavior/schedule/occurrence/status-event JSONL files, optional notes JSONL, app-specific extension fields under `app.cadence`, and synthetic medium-confidence status events for resolved legacy rows that predate status-event history.
- Added `/api/export/behaviorlog` and the Export screen download option while keeping JSONL, CSV, full JSON, and AI summary exports intact.
- Updated product, data-model, route, resolver, UI, flow, decision, README, and AGENTS docs so current-status snapshots and append-only status history are distinct.

Verification:
- Pass: `npm run supabase -- db reset`
- Pass: `npm run supabase -- gen types typescript --local` regenerated `lib/db/database.types.ts` after removing only the npm wrapper banner.
- Pass: local `pg_policies` query confirmed only `SELECT` and `INSERT` RLS policies on `occurrence_status_events`.
- Pass: local `information_schema.role_table_grants` query confirmed authenticated grants only `SELECT` and `INSERT` on `occurrence_status_events`.
- Pass: `npm run test -- tests/status.resolver.test.ts tests/export.resolver.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (19 files, 115 tests).
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: `npm run supabase -- db push --dry-run` would apply only `20260612075036_add_occurrence_status_events.sql`; hosted database was not changed.
- Local render smoke: existing dev server at `http://localhost:3000` rendered `/design-system` with the BehaviorLog bundle export control and returned 200; dev logs showed no warnings or errors beyond the React DevTools info message.

Remaining risk:
- Hosted Supabase still needs explicit user authorization before applying `20260612075036_add_occurrence_status_events.sql`.
- Occurrence status update and status-event insert are orchestrated by the service as separate Supabase calls; the BehaviorLog exporter synthesizes a fallback event for resolved rows without a status-event row, but a future RPC could make the write path fully atomic.

## Handoff notes

- For the next coding agent: continue Ticket 013 from the Vercel environment/deployment blocker. Do not start deferred offline/PWA or future restore/import work unless the product docs change or the user explicitly brings it into scope.
- Run `npm run agents:check` and `npm run resolvers:check` before standard lint/typecheck/test/build verification.
- Run `npm run design-system:check` after changing reusable UI, the bench route, or design-system manifest/usage/config files.
- Use `docs/SUPABASE_WORKFLOW.md` for Supabase CLI local/hosted management and `docs/SEQUENZY_WORKFLOW.md` for Sequenzy CLI/provider operations.
- Keep v1 small. Do not implement deferred PWA/offline behavior from `docs/FUTURE_UPDATES.md` unless the active docs are updated first.
- Preserve the resolver-first architecture: core logic belongs in `lib/resolvers`, database access in `lib/db`, orchestration in `lib/services`, and UI/API routes should not duplicate resolver logic.
