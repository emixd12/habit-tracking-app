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

This repository now contains the Ticket 001 Next.js application scaffold, Ticket 002 Supabase Auth setup, Ticket 003 database schema, Ticket 004 recurrence resolver, Ticket 005 behavior CRUD, Ticket 006 occurrence generation, Ticket 007 Timeline screen, Ticket 008 status marking and notes, Ticket 009 browser push subscription/reminder planning, Ticket 010 email reminder processing with Sequenzy provider setup, Ticket 011 Analytics, Ticket 012 Export, Ticket 013 Vercel production deployment, BehaviorLog interoperability and import work through Ticket 024, Ticket 025A restore preview, Ticket 025B restore apply/UI, Ticket 026 imported notes, Ticket 027 imported intervention history, Ticket 028 imported intervention promotion services, Ticket 029 public web hardening, Ticket 030 public web hardening follow-up, Ticket 031 Astro marketing site, Ticket 032 Needs Decision same-day correction retention, Ticket 033 Analytics selected-day occurrence correction, and the project-definition and agent-bootstrap layer.

Product posture update: Cadence is now scoped as a public, open-source
single-account personal behavior tracker product. The current implemented
surfaces are the authenticated Next.js web app and a sibling Astro marketing
site under `apps/marketing`; future surfaces are a Tauri desktop app proposal
and a future mobile app. The first public-product implementation steps are
hardening the current web app for many independent Google-auth users and
launching the static marketing surface, not billing, AI, desktop, or mobile
work. The target composable workspace and public marketing scope live in
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md`.

Current evidence:

- `package.json` and `package-lock.json` exist with Next.js App Router, TypeScript, Tailwind, ESLint, Vitest, npm workspaces, and marketing workspace scripts.
- `app/`, `components/`, `lib/`, and `tests/` application directories exist.
- `apps/marketing` exists as a static Astro app with routes `/`, `/standard`,
  `/cadence`, `/examples`, `/docs`, and `/about`, plus Markdown mirrors,
  `llms.txt`, `llms-full.txt`, a route manifest, sitemap, robots output, and a
  build-generated sanitized example BehaviorLog bundle. It is deployed as the
  separate Vercel project `cadence-marketing` with production alias
  `https://cadence-marketing-two.vercel.app`.
- Primary app routes exist for Timeline, Behaviors, Analytics, Export, and Settings. Public account-information routes exist for Terms, Privacy, and Trust. Export is implemented with JSONL, CSV, full JSON backup, BehaviorLog bundle, Markdown AI summary outputs, and BehaviorLog import.
- Supabase SSR auth utilities exist under `lib/supabase/`, with Google login at `/login`, OAuth callback handling at `/auth/callback`, and protected app routes guarded by `proxy.ts` plus the app layout.
- Supabase CLI has been initialized with `supabase/config.toml`; local Supabase uses the 5532x port range to avoid conflicts with another local Supabase stack.
- Product database schema exists in `supabase/migrations/20260607204951_create_database_schema.sql` with RLS-enabled profiles, categories, behaviors, occurrences, reminder_deliveries, and push_subscriptions tables. Ticket 010 adds `supabase/migrations/20260608011000_add_reminder_delivery_processing_claim.sql` for an internal `reminder_deliveries.processing_started_at` claim timestamp.
- Auth user onboarding creates a profile and default categories; migration backfills existing auth users.
- Supabase database types are generated in `lib/db/database.types.ts`, with hand-written domain aliases in `lib/types/database.ts`.
- A pure Temporal-based recurrence resolver exists in `lib/resolvers/recurrence.resolver.ts`, with recurrence domain types in `lib/types/recurrence.ts` and paired tests in `tests/recurrence.resolver.test.ts`.
- Behavior CRUD exists on `/behaviors` with server actions, service/repository access through the authenticated Supabase user, category selection, recurrence editing, scheduled time, browser/email reminder settings, active/archive handling, and active/archived lists.
- Occurrence generation exists in `lib/resolvers/occurrence.resolver.ts`, `lib/services/occurrence.service.ts`, and `lib/db/occurrences.repo.ts`. Behavior create/edit/archive now syncs a rolling today + 30 day occurrence window, inserts missing rows idempotently, removes stale future unresolved rows, and preserves past or resolved occurrence history.
- Timeline grouping exists in `lib/resolvers/timeline.resolver.ts`, `lib/services/timeline.service.ts`, and `/timeline`. The page syncs missing occurrences before rendering, surfaces Needs decision for prior unresolved active-behavior occurrences plus same-day retained prior decisions through a floating lower-right button and modal, starts the forward timeline at the current local day, shows the next 7 days by default, and can expand future visibility up to the generated 30-day horizon.
- Status marking and note editing exists in `lib/resolvers/status.resolver.ts`, `lib/services/occurrence.service.ts`, `app/(app)/timeline/actions.ts`, and Timeline row controls. Completed and Not Completed actions update `status_marked_at`; Completed also sets `completed_at`; switching away from Completed clears `completed_at`; note-only edits preserve status timestamps.
- Browser push subscription storage exists at `app/api/push/subscribe/route.ts`, `lib/services/push-subscription.service.ts`, and `lib/db/pushSubscriptions.repo.ts`; subscription registration validates endpoint/key shape, stores active subscriptions through the authenticated Supabase user context, lists active subscriptions for browser-push sends, and marks expired subscriptions inactive.
- Reminder delivery planning exists in `lib/resolvers/reminder.resolver.ts`, `lib/services/reminder.service.ts`, and `lib/db/reminderDeliveries.repo.ts`. Occurrence sync now creates missing pending reminder deliveries idempotently from behavior reminder settings, including browser reminders enabled by default, and status resolution cancels pending deliveries for resolved occurrences.
- Reminder processing code exists at `app/api/reminders/process/route.ts`, `lib/services/reminder.service.ts`, `lib/db/reminderDeliveries.repo.ts`, `lib/services/sequenzy.service.ts`, and `lib/services/web-push.service.ts`. The protected process route validates `REMINDER_PROCESS_SECRET` or `CRON_SECRET`, rate-limits repeated auth failures, bounds manual batch size, claims due pending email and browser-push deliveries with `processing_started_at`, re-checks current occurrence/behavior eligibility through the reminder resolver, sends Sequenzy template emails or VAPID-backed browser push from server-only code, and records sent, failed, or cancelled outcomes. Sequenzy provider setup is verified with transactional slug `habit-reminder`; local `.env.local` has `SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder`.
- Analytics exists in `lib/resolvers/analytics.resolver.ts`, `lib/services/analytics.service.ts`, and `/analytics`. The resolver owns range normalization, adherence math, status counts, overall and per-behavior heatmap day states, category counts, and behavior-day occurrence review for status/note correction. Default adherence excludes unresolved occurrences, and the top summary Unresolved count matches the Timeline Needs decision count.
- Export exists in `lib/resolvers/export.resolver.ts`, `lib/services/export.service.ts`, `/export`, and `/api/export/jsonl`, `/api/export/csv`, `/api/export/json`. The resolver owns range filtering, archived-behavior filtering, JSONL, CSV escaping, full JSON backup shape, and Markdown AI summary adherence math. All-time export includes occurrences through the current local day and excludes generated future rows.
- Settings now shows profile email, timezone detection/manual override, notification permission status, browser push availability, a browser reminder enable/save control, Trust/Privacy/Terms links, and account deletion with export acknowledgement plus typed confirmation. Timezone detection uses browser/OS `Intl` data without geolocation; saving a changed timezone updates the profile, active behavior timezones, and future unresolved occurrences through the existing occurrence sync. The client path uses only `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; the processing/sending layer uses server-only `VAPID_PRIVATE_KEY`.
- Timeline now shows a dismissible first-run setup pop-up for accounts that have
  not completed required launch setup items. It links into the existing
  Behaviors create form, Settings notification subscription, Settings timezone,
  and optional Export import controls without requesting notification permission
  on page load.
- Privacy-safe structured monitoring events now cover OAuth callback failures,
  push subscription route outcomes, and reminder processor outcomes through
  runtime logs. The sanitizer drops sensitive keys and redacts email-shaped
  values before logging.
- `npm run smoke:rls` runs a many-user Supabase RLS smoke check using
  service-role credentials only for temporary user setup/cleanup and ordinary
  signed-in publishable-key clients for isolation checks.
- A minimal `public/push-service-worker.js` displays received push payloads and opens same-origin app URLs, defaulting to `/timeline`. It does not implement PWA install, route caching, background sync, offline writes, or offline mutation.
- Supabase and Sequenzy CLIs are installed as dev dependencies and exposed through `npm run supabase -- ...` and `npm run sequenzy -- ...`.
- Agent operations docs now include Supabase CLI workflow, Sequenzy CLI workflow, date/time strategy, route map, and deterministic drift checks.
- A local/dev-only design-system bench exists at `/design-system`, backed by
  `design-system.config.json`, `design-system.surfaces.json`,
  `design-system.manifest.json`, `design-system.usage.json`, and
  `npm run design-system:check`. It renders foundations, canonical
  cross-surface component-family mappings, and fixture-backed web-app UI. It
  is not in primary navigation, is disabled in production builds, and keeps
  bench previews separate from product usage scans.
- The v1 feature ticket sequence is complete through Ticket 012. Ticket 013 Vercel production hardening is complete after later browser-push production verification: authenticated production smoke QA passed for Google login, Behavior create/archive, Timeline occurrence generation, status changes, notes, Settings render, Analytics render, Export page/link rendering, production reminder cron execution, browser push subscription, and a safe browser-push send.
- Vercel plugin inspection found existing project `cadence` under team `Emi's projects`, connected to GitHub repo `emixd12/habit-tracking-app` on `main`, with canonical public alias `https://cadence-blush-three.vercel.app`. Production public Supabase config is present, `/login` renders without the missing-config warning, Google OAuth returns to the canonical production domain, and `/api/reminders/process` supports Vercel Cron `GET` with secret protection.
- Project-local design workflow files exist under `.agents/skills/impeccable/` and should be used for UI/design work after the scaffold exists.

## Design-system surface catalog update

Status: complete.

Implementation summary:
- Added `design-system.surfaces.json` as the canonical cross-surface design
  catalog for the authenticated web app, Astro marketing site, future desktop
  app, and future mobile app.
- The catalog defines shared component-family contracts for foundations,
  text actions, form controls, navigation, surface shells, disclosure sections,
  Timeline feed, Needs decision, Analytics calendar, Behavior editor,
  Export/portability, and brand marks.
- Updated `/design-system` so the bench now shows surface cards and a canonical
  component-family matrix before the existing web-app trace cards. Web-app
  entries link back to live manifest trace anchors; Astro and future-surface
  entries point to native source files or planned implementation docs.
- Extended `npm run design-system:check` to validate the surface catalog for
  duplicate ids, missing sources, unknown surfaces, and unknown web manifest
  component references.
- Updated `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`, `docs/OPERATIONS.md`, and
  `DESIGN.md` to document one canonical design system with surface-scoped
  implementations.

Verification:
- Pass: `npm run design-system:check`
- Pass: `npm run typecheck`
- Pass: `npm run lint`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run test` (41 files, 257 tests)
- Pass: `npm run build`
- Pass: `git diff --check`
- HTTP QA: existing Next dev server at `http://localhost:3000/design-system`
  returned 200 and rendered Surfaces, Canonical component families,
  Authenticated web app, Astro marketing site, and Timeline feed content.

Remaining risk:
- The global bench shows Astro and future desktop/mobile mappings, but only the
  authenticated web app has a strict live manifest today. Add native manifests
  or surface-specific benches when those surfaces have enough live UI to verify.

## Timeline UI feedback update

- Reworked first-run setup on `/timeline` from an inline feed band into a
  dismissible fixed pop-up so the current-day feed remains first in document
  flow.
- Updated Timeline resolver metadata so `not_completed` rows now match
  Completed row structure: compact resolved row, collapsed status label, and
  correction controls only after expanding.
- Cleaned up the Needs decision modal by removing the repeated Prior
  unresolved label, using white date groups, and showing each date's remaining
  unresolved count under the date label.

Verification for this update: Pass: `npx vitest run tests/timeline.resolver.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; Pass: `npm run design-system:check`; Pass: `git diff --check`.

Browser QA: authenticated in-app browser `/timeline` desktop render showed the
first-run setup as a fixed dismissible pop-up with no horizontal overflow. The
Needs decision modal no longer repeated Prior unresolved in the header, date
groups used a white background with `0 left to decide` under the date, and Not
Completed rows matched Completed row structure with a collapsed label and no
visible collapsed action buttons.

Browser QA: `/timeline` at 390px width showed no horizontal overflow; the fixed
Needs decision button stayed within the safe-area width; the modal was
full-height; and Completed and Not Completed retained rows had matching row
heights, labels, and no visible collapsed action buttons. Browser logs showed
no warnings or errors.

Follow-up modal header refinement:
- Removed the visible global Needs decision title and total-to-decide label
  from the open modal header while keeping the close control and accessible
  dialog label.
- Updated `DESIGN.md`, `docs/UI_SPEC.md`, and `docs/USER_FLOWS.md` so the open
  modal is led by date groups only.
- Verification: Pass: `npm run agents:check`; Pass: `npm run
  resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass:
  `npm run test`; Pass: `npm run design-system:check`; Pass: `npm run build`;
  Pass: `git diff --check`.
- Browser QA: design-system Needs decision dialog preview at 1127px and 390px
  opened with an empty visible header, exactly one close button, no visible
  heading or paragraph in the header, date-group text first, and no horizontal
  overflow.

Follow-up modal top-space refinement:
- Removed the remaining reserved header row from the open Needs decision modal.
  The close control is now pinned over the top-right corner, and the first date
  group starts at the top of the scroll area with right padding reserved for the
  close control.
- Updated `DESIGN.md`, `docs/UI_SPEC.md`, and `docs/USER_FLOWS.md` to specify
  the overlaid close control and no reserved header row.
- Verification: Pass: `npm run agents:check`; Pass: `npm run
  resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass:
  `npm run test`; Pass: `npm run design-system:check`; Pass: `npm run build`;
  Pass: `git diff --check`.
- Browser QA: design-system Needs decision dialog preview at 1127px and 390px
  opened with no modal header element, the close button pinned top-right, the
  first date group at the top of the scroll area, and no horizontal overflow.

Follow-up modal gutter refinement:
- Removed the asymmetric right padding from the Needs decision modal scroll
  area so date groups and occurrence rows stretch to matching left and right
  gutters. The date header text row alone reserves space for the overlaid close
  control.
- Updated `DESIGN.md`, `docs/UI_SPEC.md`, and `docs/USER_FLOWS.md` to document
  equal modal gutters with a close-control text guard.
- Verification: Pass: `npm run agents:check`; Pass: `npm run
  resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass:
  `npm run test`; Pass: `npm run design-system:check`; Pass: `npm run build`;
  Pass: `git diff --check`.
- Browser QA: design-system Needs decision dialog preview at 1032px, 1127px,
  and 390px showed equal left/right distances from the modal to the date group
  and first occurrence row, a pinned top-right close button, no modal header
  element, and no horizontal overflow.

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
| 013: Vercel production deployment | complete | Added `vercel.json` with hourly Vercel Cron for `/api/reminders/process`; updated the route to support Vercel Cron `GET` plus existing protected manual `POST`; added `CRON_SECRET` support alongside `REMINDER_PROCESS_SECRET`; documented Vercel workflow, env ownership, Supabase Auth redirects, smoke QA, and rollback path. Later browser-push troubleshooting and production verification completed the original push-subscription/send blocker. | Pass: `npm run test -- tests/reminder-process-route.test.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test`; Pass: `npm run build`; production smoke for login/protected redirects/authenticated app routes; production cron logs returned 200; Chrome verified notification permission plus active FCM PushSubscription; safe production browser-push send returned `{ checked: 1, claimed: 1, sent: 1, failed: 0, cancelled: 0 }`. | No Ticket 013 blocker remains. Chrome will not show the native notification permission prompt again for an origin that is already granted or denied unless site settings are reset. Actual file download events remain limited by browser automation, but Export page/link rendering was verified. |

Later ticket rollup:

| Ticket | Status | Current note |
|---|---|---|
| 014: BehaviorLog import validation dry-run | complete | Service/resolver dry-run validation exists; no import writes were added in this ticket. |
| 015: BehaviorLog core conformance harness | complete | Cadence-generated BehaviorLog bundles pass the pinned upstream Level 1 validator snapshot; future changes should update the snapshot intentionally. |
| 016: BehaviorLog Level 2 CSV views | complete | Optional BehaviorLog CSV views are emitted from authoritative JSONL and covered by resolver/conformance tests. |
| 017: BehaviorLog Intervention Profile export | complete | Reminder deliveries export as optional Intervention Profile records without provider side effects or message-body export. |
| 018: BehaviorLog import persistence foundation | complete | Import-run and mapping tables exist with RLS and hosted migration applied. |
| 019: BehaviorLog create-only core import | complete | Create-missing-only behavior/schedule/occurrence/status-event import path exists and remains non-destructive. |
| 020: BehaviorLog conflict-aware merge preview | complete | Merge preview produces deterministic actions/conflicts without mutating product data. |
| 021: BehaviorLog user-approved merge write | complete | Approved merge writes create/map records and append status events without blind overwrite or destructive restore. |
| 022: BehaviorLog optional notes import | complete | Occurrence-attached note import was implemented and later expanded by Ticket 026. |
| 023: BehaviorLog Intervention Profile import preview | complete | Optional intervention import preview was implemented and later expanded by Ticket 027. |
| 024: User-facing BehaviorLog import UI | complete | Export screen includes upload, preview, recent-run, create-only, and approved-merge UI. |
| 025A: BehaviorLog restore preview | complete | Added a preview-only restore resolver/service contract with create/replace/archive/delete/keep/skip action classification, destructive-action flags, non-restorable account/provider/browser fields, status-history policy planning, sensitivity/redaction summaries, stable local/bundle/preview fingerprints, a `restore_preview` import-run mode migration, and focused tests. No product records, reminder deliveries, provider calls, or destructive apply behavior were added. | Pass: `npm run test -- tests/behaviorlog-restore.resolver.test.ts tests/behaviorlog-restore.service.test.ts`; Pass: `npm run supabase -- db reset`; Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts` (no generated type diff); Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test` (37 files, 247 tests); Pass: `npm run build`; Pass: `git diff --check`. | Start Ticket 025B only after preserving the 025A preview/fingerprint contract. Hosted Supabase deployment for the new migration still requires explicit user authorization before `npm run supabase -- db push`. |
| 025B: BehaviorLog restore apply and UI | complete | Added a destructive restore apply path behind accepted restore preview/fingerprint checks, typed `RESTORE` confirmation, fresh-backup acknowledgement, sensitivity acknowledgement when relevant, stale-preview refusal, a transaction-scoped Supabase RPC, and sparse Export-screen restore UI. Restore apply is limited to user-owned BehaviorLog product data and does not call Sequenzy, Web Push, browser APIs, provider SDKs, or notification-processing routes. | Pass: `npm run test -- tests/behaviorlog-restore-ui.test.tsx tests/behaviorlog-restore-apply.service.test.ts tests/behaviorlog-restore.resolver.test.ts tests/behaviorlog-restore.service.test.ts tests/behaviorlog-import-ui.test.tsx`; Pass: `npm run supabase -- db reset`; Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test` (39 files, 251 tests); Pass: `npm run build`; Pass: `npm run design-system:check`; Pass: `git diff --check`; Browser QA on `/design-system#ds-module-behavior-log-restore-panel` at 1280px and 390px with no horizontal overflow or console warnings/errors. | Hosted Supabase deployment for the new migrations still requires explicit user authorization before `npm run supabase -- db push`. Destructive restore was not applied against a real account during QA. Current apply expects Cadence/UUID core identifiers for core restore rows and does not recreate categories from BehaviorLog bundles. |
| 026: General BehaviorLog notes data model and import | complete | Passive imported notes table and import/apply support are implemented with sensitivity acknowledgement. |
| 027: Imported intervention history storage | complete | Passive imported intervention history storage exists with RLS and hosted migration applied. |
| 028: Promote imported interventions into reminder deliveries | complete | Service-level promotion path exists with explicit selection/confirmation; no user-facing promotion UI has been added. |
| 029: Public web hardening account safety baseline | complete | Account deletion, legal/trust pages, endpoint hardening, bounded reminder processing, and RLS policy registry are implemented. Remaining public-launch follow-up is hosted multi-user RLS smoke QA, first-run onboarding, and privacy-conscious monitoring/error reporting. |
| 030: Public web hardening follow-up | complete | Added dismissible Timeline first-run setup, privacy-safe structured runtime monitoring, and `npm run smoke:rls` many-user RLS smoke QA. | Pass: `npm run smoke:rls`; Pass: `npm run agents:check`; Pass: `npm run resolvers:check`; Pass: `npm run lint`; Pass: `npm run typecheck`; Pass: `npm run test` (35 files, 241 tests); Pass: `npm run build`; Pass: `npm run design-system:check`; Pass: `git diff --check`; Browser QA with a temporary authenticated Chrome user verified Timeline first-run setup at 1280px and 390px with no horizontal overflow, required links present, no console warnings/errors, and temporary user cleanup. | No Ticket 030 blocker remains. Re-run `npm run smoke:rls` before broad launch and after material RLS/schema changes. |

## Post-ticket refinements

### Analytics summary unresolved alignment

Status: complete.

Implementation summary:
- Updated the Analytics top summary Unresolved count to match the Timeline Needs decision count.
- The top summary now counts only active unresolved occurrences before the current local day, regardless of the selected Analytics range.
- Current-day unresolved occurrences still appear in the Analytics heatmap and behavior/category detail counts so the current-day state remains visible.
- Added `behaviorActive` to analytics resolver input from the analytics service so archived prior unresolved occurrences do not affect the top summary count.
- Updated product/UI/user-flow/design docs to document the aligned summary semantics.
- No schema changes, route changes, provider operations, or out-of-scope features were added.

Verification:
- Pass: `npm run test -- tests/analytics.resolver.test.ts tests/timeline.resolver.test.ts`
- Pass: `npm run resolvers:check`
- Pass: `npm run typecheck`
- Pass: `npm run agents:check`
- Pass: `npm run lint`
- Pass: `npm run test` (25 files, 157 tests).
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/analytics` showed summary `Unresolved: 0` while `/timeline` showed `Open Needs decision, 0 prior unresolved occurrences`; `/analytics` had no browser warning/error logs.

Remaining risk:
- Behavior/category detail counts may still show current-day unresolved occurrences by design; only the top summary Unresolved count is aligned to Needs decision.

### Analytics calendar completion intensity

Status: complete.

Implementation summary:
- Updated the overall Analytics calendar from a binary completed/not-completed treatment to completion-intensity day cells.
- Overall day cells now carry `completionRate`; fully completed days use the full completed color, partial days mix the completed color with the background by completed share, and days with no completions use the background end of the scale without a diagonal overlay.
- Added the `partial` overall day state in the analytics resolver/type contract and updated resolver tests for a 50% completed day.
- Updated the Analytics legend, design-system Analytics fixture, product/UI/user-flow/design docs, and browser QA coverage for the new shade-only visual semantics.
- No schema changes, route changes, provider operations, or out-of-scope features were added.

Verification:
- Pass: `npm run test -- tests/analytics.resolver.test.ts`
- Pass: `npm run resolvers:check`
- Pass: `npm run typecheck`
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `npm run agents:check`
- Pass: `npm run lint`
- Pass: `npm run test` (25 files, 157 tests).
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/analytics` showed live fractional `data-completion-rate` values, proportional computed blue shades, the Partial legend item, zero diagonal overlays in the overall calendar and legend, no horizontal overflow at desktop or 390px mobile, and no browser warnings/errors.
- Browser QA: `/design-system` at 390px showed the partial Analytics fixture cell, no horizontal overflow, and no browser warnings/errors.

Remaining risk:
- Fully unresolved days intentionally remain neutral; unresolved occurrences reduce a mixed day's completion shade because the shade represents completion share across all scheduled occurrences for that day. A 0% completed resolved day is intentionally the background end of the shade scale.

### Analytics layout simplification and tracking starts

Status: complete.

Implementation summary:
- Removed boxed section-panel treatment from the Analytics screen and converted the page to unboxed report sections separated by horizontal dividers.
- Merged the overall calendar into the Overall adherence area and moved the calendar legend behind a See Legend disclosure.
- Removed the empty selected-day Not Completed panel; selected-day Not Completed details now render only when the selected day has rows.
- Added per-behavior tracking start metadata from `behaviors.created_at`, converted through Temporal in the behavior timezone, and surfaced it as Tracking since text plus a start marker in each behavior heatmap when the start day is in range.
- Reshaped behavior and category status counts into vertical label/value rows with numeric values aligned to the right.
- Updated Analytics resolver tests, the design-system Analytics fixture, product/UI/user-flow/design docs, and this status ledger.
- No schema changes, route changes, provider operations, or out-of-scope features were added.

Verification:
- Pass: `npm run test -- tests/analytics.resolver.test.ts`
- Pass: `./node_modules/.bin/eslint components/analytics/AnalyticsScreen.tsx lib/resolvers/analytics.resolver.ts lib/services/analytics.service.ts tests/analytics.resolver.test.ts app/design-system/page.tsx`
- Pass: `npm run typecheck`
- Pass: `npm run design-system:check`
- Pass: `npm run resolvers:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_inventory.py --root . --out /tmp/cadence-design-system.manifest.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/scan_usages.py --root . --manifest design-system.manifest.json --out /tmp/cadence-design-system.usage.json`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `git diff --check`
- Pass: `npm run agents:check`
- Pass: `npm run lint`
- Pass: `npm run test` (25 files, 158 tests).
- Pass: `npm run build`
- Browser QA: authenticated in-app browser `/analytics` at desktop width showed zero boxed section wrappers, the calendar inside Overall adherence, See Legend closed by default and revealing the legend on click, no empty selected-day Not Completed panel, Tracking since text and `data-tracking-start` cells for behavior rows, label/value status rows, no horizontal overflow, and no warning/error logs.
- Browser QA: authenticated in-app browser `/analytics` at 390px showed zero boxed section wrappers, no horizontal overflow, no empty selected-day Not Completed panel, behavior count values to the right of their labels, Tracking since text and start markers, and See Legend closed by default.

Remaining risk:
- The visible heatmap start marker is intentionally subtle and relies on the adjacent Tracking since text for human-readable context.

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
- Further hardened `StatusButtons` so it captures the submitted status and current status at the user gesture, then requires a successful server-confirmed `completed` result before playback. A later render cannot cause a chime without that captured user intent.
- Split the media-element gesture primer from the media element used for audible playback so delayed muted-primer cleanup cannot pause, reset, or mute the real chime.
- Hardened `lib/ui/completion-feedback.ts` to prime Web Audio with a silent one-sample source, unlock an `HTMLAudioElement` during the user gesture, prefer the media element for actual audible playback, keep Web Audio as fallback, retry failed preload/decode attempts, guard missing `AudioContext`/`Audio` APIs, and emit dev-only playback/blocked diagnostics.
- Added a final compatibility fallback for browsers where media playback rejects and the MP3 buffer cannot load or decode: when Web Audio oscillator/gain nodes are available and the context can run, Cadence now plays one very short, low-gain synthesized chime before reporting playback blocked.
- Changed the Timeline refresh sequence so `router.refresh()` waits until the chime playback path has started instead of immediately refreshing after the successful status action.
- Follow-up production listener QA showed two real production Completed clicks reached hydrated React status forms, but neither emitted `cadence:completion-chime-played` nor `cadence:completion-chime-blocked`. The issue was the status server action calling `revalidatePath("/timeline")` before the client success effect could run; completing an occurrence can remove or replace the submitting action component, losing the pending chime effect.
- Removed the eager Timeline revalidation from `markOccurrenceStatusAction`. `StatusButtons` already refreshes the Timeline after success and completion feedback, so server confirmation is preserved while avoiding the unmount race.
- Production deployment `dpl_HJXgLVV75HTFGbGVY6YYbpVMRywF` from commit `a7f824221aabbc3b756b08a426f447efa0d3b02f` was ready and aliased to `https://cadence-blush-three.vercel.app` on 2026-06-19.
- Updated the design-system fixture action to mirror the real status action's `nextStatus` return for fixture-backed browser QA.
- No schema, resolver, product-scope, notification-provider, or real occurrence-data changes were made.

Verification:
- Pass: `curl -I http://localhost:3000/sounds/completion-chime.mp3` returned `200 OK` with `Content-Type: audio/mpeg`.
- Pass: `curl -I http://localhost:3002/sounds/completion-chime.mp3` returned `200 OK` with `Content-Type: audio/mpeg` from the current Cadence dev server.
- Pass: `ffprobe`/`ffmpeg` diagnostics after installing `ffmpeg`: asset is a 1-second stereo MP3, peak `-2.7 dB`, RMS `-25.1 dB`, with audible content before the trailing silence.
- Pass: `afplay public/sounds/completion-chime.mp3` exited successfully.
- Pass: `npm run test -- tests/completion-feedback.test.ts` (14 tests covering intent confirmation, primer/playback separation, synthesized fallback success, and oscillator-unavailable blocked coverage).
- Pass: `npx eslint components/timeline/StatusButtons.tsx lib/ui/completion-feedback.ts tests/completion-feedback.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run design-system:check`
- Pass: `npm run typecheck`
- Pass: `npm run test` (32 files, 227 tests).
- Pass: `npm run build`
- Pass: Production Chrome listener attached to `https://cadence-blush-three.vercel.app/timeline` captured two user-clicked Completed submits with `status: "completed"` and hydrated React `onPointerDown`/`onClick`/`onSubmit` handlers present, but no chime played/blocked events before the local fix.
- Pass: `npm run test -- tests/completion-feedback.test.ts` after removing eager status-action revalidation.
- Pass: `npm run typecheck`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run test` (32 files, 227 tests).
- Pass: `npm run build`
- Pass: Vercel production deployment `dpl_HJXgLVV75HTFGbGVY6YYbpVMRywF` reached `READY`, with canonical alias `cadence-blush-three.vercel.app` and commit `a7f824221aabbc3b756b08a426f447efa0d3b02f`.
- Pass: Production smoke after deploy: `/login` returned 200; `/timeline`, `/behaviors`, `/settings`, `/analytics`, and `/export` redirected unauthenticated requests to `/login?next=...`; `/api/reminders/process` returned 401 without a secret; `/sounds/completion-chime.mp3` returned 200 with `Content-Type: audio/mpeg`.
- Pass: Vercel runtime logs showed no production warning/error/fatal entries in the 15 minutes around the deployment smoke check.
- Pass: design-system-bench classify/theme detection, inventory and usage scans to `/tmp`, and `npm run design-system:check`; a freshly generated full traceability verification still reports unrelated in-progress Settings/Timezone bench coverage gaps from the current dirty worktree, so no design-system source files were changed for this chime-only pass.
- Browser QA: Chrome remote-debugging profile loaded local `/design-system#ds-module-status-buttons`, clicked the fixture Completed control through CDP mouse events, received the bench server-action success message, and observed `cadence:completion-chime-played` with `source: "media"`.
- Browser QA: After the eager-revalidation fix, Chrome loaded local `http://localhost:3002/design-system#ds-module-status-buttons`, clicked the fixture Completed control, and observed `cadence:completion-chime-played` with `source: "media"`.
- Browser QA: in-app browser `/design-system#ds-module-status-buttons` rendered Completed and Not Completed controls and the fixture action completed without mutating product data. The in-app browser reports `AudioContext`, `Audio`, and `Notification` as unavailable, so it cannot prove audible playback in that embedded surface.
- Browser QA: Chrome plugin fresh tab `/design-system#ds-module-status-buttons` clicked Completed and logged `cadence:completion-chime-played media`, confirming the normal browser media element playback path started. The only observed Chrome warning was an extension-injected hydration mismatch, unrelated to audio.
- Browser QA: Chrome design-system `NotificationPermissionPanel` preview showed the `Permission` row, `Browser push` row, and `Enable browser reminders` control. The fixture has no VAPID key, so the control was disabled and no permission prompt was opened or accepted.
- Browser QA: in-app browser `NotificationPermissionPanel` preview showed the `Permission` row and `Enable browser reminders` control, with permission blocked/unavailable in that embedded surface.

Remaining risk:
- The in-app browser cannot play or authorize audio because its media and notification APIs are unavailable; Chrome verified the actual media playback-start path.
- The synthesized compatibility fallback is covered by unit tests only. The real Chrome fixture used the preferred media element path, so the fallback was not forced in browser QA.
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
- Pass: `npm run supabase -- db push --yes` applied `20260612075036_add_occurrence_status_events.sql` to hosted Supabase after user authorization.
- Pass: `npm run supabase -- migration list` confirmed local and hosted migration histories now match through `20260612075036`.
- Pass: hosted `pg_policies` query confirmed only `SELECT` and `INSERT` RLS policies on `occurrence_status_events`.
- Pass: hosted `information_schema.role_table_grants` query confirmed authenticated grants only `SELECT` and `INSERT` on `occurrence_status_events`.
- Pass: hosted count query confirmed `occurrence_status_events` exists with 26 backfilled rows.
- Local render smoke: existing dev server at `http://localhost:3000` rendered `/design-system` with the BehaviorLog bundle export control and returned 200; dev logs showed no warnings or errors beyond the React DevTools info message.

Remaining risk:
- Occurrence status update and status-event insert are orchestrated by the service as separate Supabase calls; the BehaviorLog exporter synthesizes a fallback event for resolved rows without a status-event row, but a future RPC could make the write path fully atomic.

### Ticket 014: BehaviorLog import validation dry-run

Status: complete.

Implementation summary:
- Added a pure BehaviorLog import resolver that validates parsed bundle files, required file presence, manifest SHA-256 hashes, supported schema version, JSONL row parsing, required record types, cross-record references, unsupported top-level fields, status semantics, source confidence, `revises_event_id`, and dry-run conflict/skipped-record planning.
- Added explicit import-preview types plus a service wrapper that reads `.behaviorlog.zip` bytes through the ZIP utility and passes structured file contents to the resolver.
- Extended the ZIP utility to read stored and deflated ZIP entries without adding a dependency.
- Added resolver tests using a small BehaviorLog bundle generated by the existing export resolver, including happy-path import preview, hash/JSONL parse failures, local conflict detection, current-status snapshot handling without synthesized history, and unsupported-field reporting.
- Updated `docs/EXPORT_FORMATS.md`, `docs/DATA_MODEL.md`, `docs/AGENT_RESOLVERS.md`, and `scripts/check-resolvers.mjs` so import validation is registered as a dry-run-only resolver path.
- No routes, UI, schema changes, database writes, merge/restore behavior, destructive operations, or deduplication writes were added.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import.resolver.test.ts`
- Pass: `npm run resolvers:check`
- Pass: `npm run typecheck`
- Pass: `npm run lint`
- Pass: `npm run test` (20 files, 120 tests).
- Pass: `npm run agents:check`
- Pass: `npm run build`

Remaining risk:
- This ticket exposes a service/resolver dry-run pathway only. A user-facing import screen, authenticated API route, and any future merge/write behavior remain separate future work and should require product/data-model updates before implementation.

### Ticket 015: BehaviorLog core conformance harness

Status: complete.

Implementation summary:
- Added a pinned upstream `emixd12/BehaviorLog-Bundle` reference validator snapshot from commit `d3b3850ed6cd4fb243b091ae14baeb24fdd653e9` and recorded the snapshot source/date.
- Added `scripts/behaviorlog-conformance.mjs` and `tests/behaviorlog-conformance.test.ts`; the test generates a Cadence BehaviorLog bundle through the export resolver, writes it as a temporary `.behaviorlog/` directory, runs the upstream validator snapshot, and confirms the same files remain readable by the dry-run import resolver.
- Tightened BehaviorLog import validation so unknown top-level fields in core records are validation errors while still being reported in `unsupportedFields`.
- Updated `docs/EXPORT_FORMATS.md` and `docs/AGENT_RESOLVERS.md` with the conformance harness and stricter import-validation contract.
- No schema changes, UI routes, import writes, merge/restore behavior, optional profiles, or database mutations were added.

Verification:
- Pass: `npm run test -- tests/behaviorlog-conformance.test.ts tests/behaviorlog-import.resolver.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (21 files, 122 tests).
- Pass: `npm run build`

Remaining risk:
- The upstream BehaviorLog Bundle specification is still draft; future alignment should intentionally update `tests/fixtures/behaviorlog-reference/SNAPSHOT.md` and the vendored validator snapshot before changing conformance expectations.

### Ticket 016: BehaviorLog Level 2 CSV views

Status: complete.

Implementation summary:
- Ticket 016 implementation is complete. The export resolver now emits optional `csv/behaviors.csv`, `csv/schedules.csv`, `csv/occurrences.csv`, and `csv/status_events.csv` BehaviorLog bundle views generated from the same normalized records as authoritative JSONL.
- CSV files are listed in `manifest.json` as optional `text/csv` files with SHA-256 hashes and null schema references.
- Tests now compare each CSV view to its JSONL source by record count and stable ID, and cover CSV escaping plus single-column JSON-string extension encoding.

Verification:
- Pass: `npm run test -- tests/export.resolver.test.ts tests/behaviorlog-conformance.test.ts tests/behaviorlog-import.resolver.test.ts`
- Pass: `npm run resolvers:check`
- Pass: `npm run agents:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (21 files, 124 tests).
- Pass: `npm run build`

Remaining risk:
- No known Ticket 016 blockers. Keep CSV as optional compatibility views and do not add import writes, merge/restore behavior, user-facing import UI, or optional BehaviorLog profiles unless a later ticket explicitly changes scope.

### Ticket 017: BehaviorLog Intervention Profile export

Status: complete.

Implementation summary:
- Ticket 017 implementation is complete. The export service now loads user-scoped reminder deliveries for exported occurrence ids and passes sanitized delivery facts into the export resolver.
- The BehaviorLog resolver now emits optional `data/interventions.jsonl` records when exported occurrences have reminder deliveries, advertises the optional `interventions` profile, adds an Intervention schema definition, and lists the file in `manifest.json` with SHA-256 hash and `required: false`.
- Intervention records reference exported behaviors and occurrences, preserve channel, scheduled send time, sent time, delivery status, and sanitized failure reason, and keep Cadence delivery metadata under `extensions.app.cadence`.
- No reminder processing behavior, provider sends, import writes, message-body export, user-facing import UI, schema migration, or notification-provider side effects were added.

Verification:
- Pass: `npm run test -- tests/export.resolver.test.ts tests/behaviorlog-conformance.test.ts tests/behaviorlog-import.resolver.test.ts` (24 focused tests).
- Pass: `npm run typecheck`
- Pass: `npm run lint`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run test` (21 files, 127 tests).
- Pass: `npm run build`

Remaining risk:
- Import validation still ignores optional Intervention Profile records beyond manifest hash validation; any future intervention import or merge behavior needs a separate ticket and product/data-model update.

### Ticket 018: BehaviorLog import persistence foundation

Status: complete.

Implementation summary:
- Added Supabase migration `20260612221022_add_behaviorlog_import_tracking.sql`
  with `behaviorlog_import_runs` and
  `behaviorlog_import_record_mappings`.
- Import runs store user-owned bundle/schema metadata, manifest SHA-256,
  deterministic bundle fingerprint, producer metadata, subject/privacy hints,
  import mode, dry-run summary snapshot, status, failure message, and
  start/completion timestamps.
- Record mappings store external BehaviorLog ids to local Cadence UUIDs by
  import run and record type, with support for behavior, schedule, occurrence,
  status event, note, and intervention mappings.
- Mapping inserts are idempotent on `import_run_id, record_type, external_id`.
- Added repository and service helpers for import-run creation, status updates,
  and mapping insertion/listing. These helpers write only import tracking rows,
  not imported product records.
- Updated generated database types, domain aliases, `docs/DATA_MODEL.md`, and
  `docs/EXPORT_FORMATS.md`.
- Later Tickets 019-023 depend on this import run and external-to-local mapping
  contract.

Verification:
- Pass: `npm run supabase -- db reset`.
- Pass: local schema probe confirmed RLS enabled on both new tables.
- Pass: local `pg_policies` probe confirmed authenticated owner policies for
  select, insert, update, and delete on both new tables. The first probe without
  `roles::text` hit a Supabase CLI scan limitation for `name[]`, then passed
  with the cast.
- Pass: local grant probe confirmed no `anon` grants and explicit
  authenticated/service-role CRUD grants on both new tables.
- Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`.
- Pass: `npm run test -- tests/behaviorlog-import-write.service.test.ts`.
- Pass: `npm run test -- tests/behaviorlog-import.resolver.test.ts tests/behaviorlog-import-write.service.test.ts`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run typecheck` after regenerating types with the direct Supabase
  binary; the npm script wrapper prints a banner that must not be redirected
  into `lib/db/database.types.ts`.

Remaining risk:
- Hosted Supabase now has migration
  `20260612221022_add_behaviorlog_import_tracking.sql`; `npm run supabase --
  db push --linked --yes` and `npm run supabase -- migration list --linked`
  passed on 2026-06-14.
- The tracking layer intentionally does not create, merge, overwrite, restore,
  delete, or deduplicate imported product records. Ticket 019 starts the first
  constrained product-record write path.

### Ticket 019: BehaviorLog create-only core import

Status: complete.

Implementation summary:
- Added `applyCreateMissingBehaviorLogImportPlan` in
  `lib/services/behaviorlog-import-write.service.ts`.
- The create-only apply path requires an existing valid dry-run import run with
  `import_mode = 'create_missing_only'` and an accepted valid dry-run summary.
- Creates clearly new behaviors, compatible schedule slots, and occurrences
  from authoritative BehaviorLog JSONL plan records.
- Inserts imported occurrences as `unresolved` first, appends imported
  `occurrence_status_events`, then updates occurrence `status`, `completed_at`,
  and `status_marked_at` from the latest imported status event for each
  occurrence.
- Does not synthesize status history from
  `occurrences.jsonl.current_status`; resolved snapshots without supporting
  status events remain warnings and imported occurrences stay unresolved.
- Uses `behaviorlog_import_record_mappings` for external-to-local behavior,
  schedule, occurrence, and status-event id mappings and for same-run
  idempotence.
- Added narrow repository helpers for import run lookup, schedule-slot
  create/lookup, occurrence create/lookup, and imported status-event duplicate
  fingerprint lookup.
- Extended the import resolver/types to preserve Cadence extension fields and
  warn/skip unsupported recurrence profiles, unsupported recurrence payloads,
  and unsupported schedule windows.
- Updated `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`, and
  `docs/AGENT_RESOLVERS.md` for create-only import semantics.
- No notes, interventions, CSV-only data, merge behavior, overwrite/restore,
  destructive delete, user-facing import UI, or provider side effects were
  added.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import-write.service.test.ts tests/behaviorlog-import.resolver.test.ts` (12 focused tests).
- Pass: `npm run typecheck`.
- Pass: `npm run lint`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.

Remaining risk:
- Hosted Supabase now has the Ticket 018 import-tracking migration; `npm run
  supabase -- migration list --linked` shows local and remote
  `20260612221022` match.
- Ticket 020 should treat the create-only path as provenance-aware but not
  conflict-resolving. Merge preview must make mapping/map-to-existing decisions
  explicit instead of relying on the create-only writer.
- Ticket 022 remains responsible for occurrence-note import decisions; Ticket
  019 intentionally does not import notes.
- Ticket 023 remains preview-only for interventions; Ticket 019 intentionally
  does not write `reminder_deliveries`.

### Ticket 020: BehaviorLog conflict-aware merge preview

Status: complete.

Implementation summary:
- Added `resolveBehaviorLogImportMergePreview` with deterministic
  `create_new`, `map_to_existing`, `skip_existing`, and
  `conflict_requires_decision` actions.
- Added stable merge conflict codes and human-readable reasons for behavior,
  schedule, occurrence, status-event, note, and intervention preview records.
- Added merge-preview privacy/redaction summary and explicit BehaviorLog
  semantics flags for JSONL authority, CSV ignored for merge, status-events
  authority, unresolved-not-failure, and append-only status history.
- Extended existing-record inputs with schedules, import mappings,
  source-original ids, archive state, schedule shape, status-event semantics,
  and revision target fields used by merge preview.
- Added optional notes and interventions to merge preview only. No note writes,
  intervention writes, reminder delivery writes, provider calls, or reminder
  scheduling side effects were added.
- Added service helpers for merge preview from files/ZIP and an import-run
  persistence helper that stores the merge preview snapshot in
  `behaviorlog_import_runs.dry_run_summary` only.
- Preserved the Ticket 019 create-only `plan.action` contract and writer path.
- Updated `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`, and
  `docs/AGENT_RESOLVERS.md`.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import.resolver.test.ts tests/behaviorlog-import-write.service.test.ts` (17 focused tests).
- Pass: `npm run typecheck`.
- Pass: `npm run lint`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run build` after rerunning with approved network access; the first
  sandboxed build failed because Next.js could not fetch the configured Google
  Font.

Remaining risk:
- Hosted Supabase now has the Ticket 018 import-tracking migration; `npm run
  supabase -- migration list --linked` shows local and remote
  `20260612221022` match.
- Ticket 021 should consume `preview.mergePreview.actions` and
  `dry_run_summary.mergePreview`, refuse unresolved
  `conflict_requires_decision` actions, and still avoid blind overwrite or
  destructive restore behavior.
- Ticket 022 remains responsible for note import decisions; Ticket 020 only
  previews notes.
- Ticket 023 remains responsible for detailed intervention validation; Ticket
  020 only previews interventions and does not write `reminder_deliveries`.

### Ticket 021: BehaviorLog user-approved merge write

Status: complete.

Implementation summary:
- Added `applyApprovedBehaviorLogMergePlan` in
  `lib/services/behaviorlog-import-write.service.ts`.
- The merge writer requires an import run with
  `import_mode = 'merge_by_user_approved_plan'`, a valid accepted
  `dry_run_summary.mergePreview`, and a matching input merge preview.
- Refuses to apply unresolved `conflict_requires_decision` actions and marks the
  import run failed on apply errors.
- Applies `create_new` records using the Ticket 019 create-only safeguards.
- Applies `map_to_existing` for behaviors, schedules, and occurrences by writing
  provenance mappings only; it does not overwrite local behavior, schedule, or
  occurrence fields.
- Appends imported status events that are not already mapped or duplicated,
  preserves `revises_event_id` when the revised event is mapped, and records all
  applied mappings.
- Updates occurrence current-status snapshots only after imported status events
  are accepted, and only when the imported event is the latest by effective
  time, recorded time, then stable id.
- Protects existing local explicit high-confidence status snapshots from
  ambiguous or lower-confidence imported events.
- Added `getBehaviorScheduleSlotById` repository helper and merge-write tests.
- Notes remain non-product writes in this phase; mappings may be recorded but
  occurrence note fill/conflict logic is left for Ticket 022.
- Interventions remain preview/provenance-only; no `reminder_deliveries`,
  provider calls, or scheduling side effects were added.
- Updated `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`, and
  `docs/AGENT_RESOLVERS.md`.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import-write.service.test.ts tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import.resolver.test.ts` (22 focused tests).
- Pass: `npm run typecheck`.
- Pass: `npm run lint`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run build`.

Remaining risk:
- Hosted Supabase now has the Ticket 018 import-tracking migration; `npm run
  supabase -- migration list --linked` shows local and remote
  `20260612221022` match.
- Merge apply remains a multi-call Supabase workflow. A partial failure marks
  the import run `failed`, but already-written rows are not rolled back. This
  matches the Ticket 019 service pattern and should be revisited if the import
  UI later needs stronger atomicity.
- Ticket 022 should implement occurrence-note import/fill/conflict behavior on
  top of the existing note preview/provenance scaffolding.
- Ticket 023 should keep interventions preview-only unless a later data model
  adds passive imported intervention history.

### Ticket 022: BehaviorLog optional notes import

Status: complete.

Implementation summary:
- Added limited BehaviorLog note import support for occurrence-attached notes
  only.
- Parsed `data/notes.jsonl` sensitivity labels and source metadata into the
  import plan and merge-preview metadata.
- Added preview warnings for high and restricted sensitivity notes.
- Skipped behavior-attached, status-event-attached, review-attached, and
  AI-generated notes from product data with explicit warnings/reasons.
- Added safe merge-preview note decisions for created occurrence fill, empty
  mapped occurrence fill, already-matching mapped notes, missing targets, and
  differing existing-note conflicts.
- Added approved merge-apply support that fills `occurrences.note` only when
  the target occurrence is safely identified and the local note is still empty.
  Note mappings use the target occurrence id as `local_id`.
- Existing non-empty differing occurrence notes remain protected behind
  `occurrence_note_conflict`; note replacement was not added.
- Notes do not update occurrence status fields, status-event history, reminder
  deliveries, analytics inputs, adherence logic, provider calls, or scheduling.
- No generalized notes table was added.
- Updated `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`,
  `docs/USER_FLOWS.md`, and `docs/AGENT_RESOLVERS.md`.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import-notes.test.ts tests/behaviorlog-import-write.service.test.ts tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import.resolver.test.ts` (30 focused tests).
- Pass: `npm run typecheck`.
- Pass: `npm run lint`.
- Pass: `git diff --check`.

Remaining risk:
- Hosted Supabase now has the Ticket 018 import-tracking migration; `npm run
  supabase -- migration list --linked` shows local and remote
  `20260612221022` match.
- Ticket 023 should keep Intervention Profile import preview-only. It must not
  write `reminder_deliveries`, call providers, send notifications, schedule
  reminders, or reuse occurrence-note fill behavior for interventions.

### Ticket 023: BehaviorLog Intervention Profile import preview

Status: complete.

Implementation summary:
- Added optional `data/interventions.jsonl` parsing to BehaviorLog import
  preview.
- Intervention rows validate JSONL parsing, manifest hash, `record_type`,
  channel, delivery status, and behavior/occurrence references.
- Intervention preview plans are marked `action: "preview_only"` and
  `previewOnly: true`.
- Import summary now includes intervention count, preview-only count, and
  counts by channel, delivery status, and linked behavior.
- Merge preview includes intervention rows only as preview/provenance actions;
  it does not schedule, send, cancel, retry, or write operational reminders.
- Added warnings for sensitive delivery payload fields and values, including
  message bodies, endpoints, provider identifiers/secrets, subscription keys,
  recipient identifiers, emails, phones, and similar nested extension fields.
- Updated `docs/EXPORT_FORMATS.md`, `docs/NOTIFICATION_SPEC.md`, and
  `docs/AGENT_RESOLVERS.md`.
- No schema changes, `reminder_deliveries` writes, provider calls,
  notification-processing route calls, or `csv/interventions.csv` output were
  added.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import-interventions.test.ts tests/behaviorlog-import-notes.test.ts tests/behaviorlog-import.resolver.test.ts tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import-write.service.test.ts` (36 focused tests).
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (25 files, 157 tests).
- Pass: `npm run build`.
- Pass: `env HOME=/private/tmp/cadence-supabase-home npm run supabase -- db reset`.
- Pass: `npm run supabase -- db push --linked --yes` applied
  `20260612221022_add_behaviorlog_import_tracking.sql` to hosted Supabase on
  2026-06-14.
- Pass: `npm run supabase -- migration list --linked` shows local and remote
  `20260612221022` match.
- Pass: `git diff --check`.

Remaining risk:
- Hosted Supabase now has the Ticket 018 import-tracking migration.
- Imported intervention records are intentionally not stored as passive history.
  A later ticket would need a separate data model before retaining imported
  intervention history outside the preview/import ledger.

### Ticket 024: User-facing BehaviorLog import UI

Status: complete.

Implementation summary:
- Added a first-class BehaviorLog import section to the authenticated Export
  screen. It accepts `.behaviorlog.zip` uploads, rejects unsupported files,
  persists preview import-run ledger rows, shows dry-run counts, errors,
  warnings, conflicts, privacy notes, note sensitivity warnings, intervention
  preview counts, and merge actions, and requires explicit confirmation before
  create-only or approved-merge writes.
- Added server actions and a UI-facing import service layer that regenerates
  previews from the submitted bundle payload during apply, gathers current local
  records for conflict-aware merge preview, and creates a mode-specific import
  run before calling the existing create-only or approved-merge writers.
- Added recent import-run history to the Export screen with mode, status,
  timestamps, and failure message display.
- Added repository reads for recent import runs, user import mappings, and all
  user occurrences. No schema changes were needed.
- Updated the design-system bench inventory/usage and added a live preview for
  the new import panel.
- Updated `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, `docs/ROUTE_MAP.md`, and
  `docs/EXPORT_FORMATS.md` for the user-facing import workflow.
- No destructive restore/overwrite behavior, generalized notes data model,
  intervention-to-reminder writes, provider calls, or raw bundle persistence
  were added.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import-ui.test.tsx`.
- Pass: `npm run test -- tests/behaviorlog-import-ui.test.tsx tests/behaviorlog-import.resolver.test.ts tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import-write.service.test.ts` (31 focused tests).
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (26 files, 163 tests).
- Pass: `npm run build`.
- Pass: `npm run design-system:check`.
- Pass: browser QA on existing local dev server at `http://localhost:3000/export`
  for desktop and 390px mobile viewport; Import, upload control, recent runs,
  and downloads rendered with no horizontal overflow.
- Pass: `git diff --check`.

Remaining risk:
- Apply uses the submitted bundle payload to regenerate preview server-side; raw
  bundle contents are intentionally not stored in Postgres. Very large bundles
  remain capped by the current upload screen limit and may need a separate
  storage-backed handoff if future import sizes grow.
- The import UI depends on the existing Ticket 019-023 writer semantics; partial
  apply failures still mark the import run failed but do not roll back already
  written rows.

### Ticket 026: General BehaviorLog notes data model and import

Status: complete.

Implementation summary:
- Added the user-owned `imported_notes` table for passive BehaviorLog notes
  attached to behaviors, occurrences, status events, and reviews, with
  owner-scoped RLS, source metadata, source original id, sensitivity, role,
  imported timestamps, attachment target, and import-run provenance.
- Extended BehaviorLog import preview and apply so non-AI notes can be stored as
  imported note records while occurrence-attached notes may also fill the
  existing occurrence Note field only when the target is safe and the local note
  is empty.
- Changed note mappings to point at `imported_notes.id` instead of an occurrence
  id, and included existing imported notes in merge-preview context for
  idempotent mapping.
- Updated the Export import panel to distinguish imported note records from
  inline occurrence-note fills and to require a dedicated high/restricted note
  sensitivity acknowledgement before apply. The server enforces the
  acknowledgement as well as the UI.
- Updated product, data-model, export/import, UI, user-flow, resolver registry,
  and design docs so notes remain passive user-review context and do not feed
  status, adherence, reminders, or analytics.

Verification:
- Pass: `npm run test -- tests/behaviorlog-import-notes.test.ts tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import-ui.test.tsx tests/behaviorlog-import-write.service.test.ts` (35 focused tests).
- Pass: `npm run supabase -- db reset`.
- Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`.
- Pass: `npm run supabase -- db push --linked --dry-run`.
- Pass: `npm run supabase -- db push --linked --yes` applied
  `20260618120000_add_imported_notes.sql` to hosted Supabase.
- Pass: `npm run supabase -- migration list --linked` confirmed
  `20260618120000` is present locally and remotely.
- Pass: hosted schema probe confirmed `public.imported_notes` has RLS enabled
  with four policies.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run design-system:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (26 files, 169 tests).
- Pass: `npm run build`.
- Browser QA: started Cadence on `http://localhost:3003` because port 3000 was
  serving a different local app; authenticated `/export` rendered at desktop
  and 390px mobile with the import section present, no horizontal overflow, and
  no browser warning/error logs. `/design-system#ds-module-behaviorlog-import`
  rendered the idle import panel without overflow or warning/error logs.
- Browser QA: uploaded
  `/tmp/cadence-ticket-26-upload-20260618064102.behaviorlog.zip` through the
  Export import form and received `BehaviorLog preview ready.` with dry-run
  counts, `Imported note records`, `Inline note fills`,
  `high_sensitivity_note_present`, the note sensitivity warning, and the
  high/restricted note acknowledgement visible. The post-upload preview had no
  horizontal overflow at 1280px or 390px and no browser warning/error events.

Remaining risk:
- Browser QA stopped at preview and did not click Apply, so no product records
  were accepted from the browser upload. The apply path remains covered by
  resolver, service, and render tests.

### Ticket 027: Imported intervention history storage

Status: complete.

Implementation summary:
- Added user-owned passive `imported_interventions` storage with owner-scoped
  RLS, import-run ownership, optional local behavior/occurrence links, external
  BehaviorLog ids, intervention type, channel, delivery status,
  scheduled/sent timestamps, sanitized failure reason, source metadata,
  redaction indicators, and metadata.
- Extended BehaviorLog intervention preview so each intervention shows passive
  storage fields, dropped sensitive delivery fields, redacted fields, and
  explicit no-reminder/no-provider side-effect flags.
- Extended create-only and approved-merge apply paths to store passive
  intervention history idempotently through `behaviorlog_import_record_mappings`
  with `record_type = 'intervention'`.
- Updated the Export import panel to show imported intervention counts,
  passive-history rows, dropped/redacted field counts, per-intervention storage
  details, and applied imported-intervention counts.
- Updated data model, notification, export/import, UI, user-flow, and resolver
  registry docs. No Ticket 028 promotion behavior, `reminder_deliveries` writes,
  provider calls, scheduling, sending, cancellation, retry, or claim behavior
  was added.

Verification:
- Pass: `npm run supabase -- db reset`.
- Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`.
- Pass: `npm run test -- tests/behaviorlog-import-intervention-history.test.ts tests/behaviorlog-import-interventions.test.ts tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import-write.service.test.ts` (31 focused tests).
- Pass: `npm run test -- tests/behaviorlog-import-intervention-history.test.ts tests/behaviorlog-import-interventions.test.ts tests/behaviorlog-import-merge-preview.test.ts tests/behaviorlog-import-write.service.test.ts tests/behaviorlog-import-ui.test.tsx tests/behaviorlog-import.resolver.test.ts tests/behaviorlog-import-notes.test.ts` (51 focused tests).
- Pass: `npm run typecheck`.
- Pass: `npm run lint`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run design-system:check`.
- Pass: `npm run test` (27 files, 173 tests).
- Pass: `npm run build`.
- Pass: local schema probe confirmed RLS enabled on
  `public.imported_interventions` with select/insert/update/delete owner
  policies. The first probe hit the Supabase CLI array scan limitation and
  passed after casting the policy list to text.
- Pass: `git diff --check`.
- Pass: `npm run supabase -- db push --linked --yes` applied
  `20260618220226_add_imported_intervention_history.sql` to hosted Supabase on
  2026-06-18.
- Pass: `npm run supabase -- migration list --linked` confirmed
  `20260618220226` is present locally and remotely.

Remaining risk:
- No known Ticket 027 blockers.

### Ticket 028: Promote imported interventions into reminder deliveries

Status: complete.

Implementation summary:
- Added nullable `reminder_deliveries.import_run_id` and
  `reminder_deliveries.imported_intervention_id` provenance columns with a
  pair check, same-user foreign keys, and a unique imported-intervention index.
- Added `lib/resolvers/imported-intervention-promotion.resolver.ts` to
  classify selected passive intervention rows and return operational reminder
  delivery plans only when the user selected rows, confirmed promotion, the row
  is a future pending reminder, the linked behavior/occurrence are current and
  owned by the user, the occurrence is unresolved, the behavior is active, the
  channel is enabled, and the scheduled send time matches current
  `resolveReminderDeliveries` output.
- Added `lib/services/imported-intervention-promotion.service.ts` to orchestrate
  user-scoped reads, existing-delivery checks, idempotent reminder-delivery
  insertion, and provenance attachment. Promotion does not call Sequenzy, Web
  Push, browser APIs, provider SDKs, or notification processing routes.
- Extended `importedInterventions.repo` and `reminderDeliveries.repo` with
  selected-row reads and pending-delivery provenance attachment.
- Added focused Ticket 028 coverage in
  `tests/imported-intervention-promotion.test.ts` for eligibility filtering,
  explicit selection/confirmation, duplicate selected records, existing
  delivery handling, provenance, historical/resolved-occurrence rejection, UTC
  timestamp normalization, and the migration contract.
- Updated data-model, notification, export/import, user-flow, and resolver
  registry docs so BehaviorLog import apply remains passive while promotion is
  a separate opt-in service-level workflow. No Export-screen promotion UI was
  added.

Verification:
- Pass: `npm run supabase -- migration new add_imported_intervention_promotion_provenance`.
- Pass: `npm run supabase -- db reset`.
- Pass: `./node_modules/.bin/supabase gen types typescript --local > lib/db/database.types.ts`.
- Pass: `npm run test -- tests/imported-intervention-promotion.test.ts` (22 focused tests).
- Pass: targeted ESLint for the new resolver, service, repository helpers,
  test, and resolver-check script.
- Pass: `npm run typecheck`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run test` (28 files, 195 tests).
- Pass: `npm run build`.
- Pass: local Supabase schema probes confirmed nullable
  `reminder_deliveries.import_run_id` and `imported_intervention_id` columns
  plus the promotion pair check and same-user foreign-key constraints.
- Pass: `git diff --check`.
- Pass: `npm run supabase -- db push --linked --yes` applied
  `20260618222427_add_imported_intervention_promotion_provenance.sql` to hosted
  Supabase on 2026-06-18.
- Pass: `npm run supabase -- migration list --linked` confirmed
  `20260618222427` is present locally and remotely.

Remaining risk:
- The promotion workflow is implemented as a service-level contract. A
  user-facing review/confirmation UI or API route still needs a separate scoped
  ticket before users can invoke it from the app.

### Ticket 029: Public web hardening account safety baseline

Status: complete.

Implementation summary:
- Verified production reminder cron execution through Vercel runtime logs
  without manually triggering a send. Hourly production
  `GET /api/reminders/process` requests returned 200 from
  2026-06-18T01:00:03Z through 2026-06-19T00:00:03Z, with no production
  warning, error, or fatal logs in the previous seven days.
- Added public `/terms`, `/privacy`, and `/trust` routes with sparse account,
  privacy, portability, manual-status, and reminder-boundary copy.
- Linked Terms, Privacy, and Trust from Login and Settings.
- Added Settings account deletion with export acknowledgement and typed
  confirmation. The server action signs out globally, then deletes the current
  Supabase auth user through the server-only service-role client so existing
  `on delete cascade` ownership constraints remove hosted Cadence records.
- Added in-memory auth-failure rate limiting for `/api/push/subscribe` and
  `/api/reminders/process`.
- Bounded `/api/reminders/process?limit=` to a maximum batch size of 100.
- Added malformed UUID validation for occurrence status/note mutations before
  repository lookup.
- Added a static RLS policy registry test covering every user-owned public
  table in the migration set.
- Updated product, data-model, notification, route, UI, user-flow, operations,
  Vercel workflow, ticket, and design docs.
- No schema migration, Ticket 025A/025B restore work, marketing site,
  workspace restructuring, billing, AI, desktop/mobile, PWA/offline, provider
  sends, or admin/support surface was added.

Verification:
- Pass: `npm run test -- tests/account-deletion.service.test.ts tests/push-subscribe-route.test.ts tests/reminder-process-route.test.ts tests/legal-content.test.tsx tests/rls-policy-registry.test.ts` (19 focused tests).
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (31 files, 206 tests).
- Pass: `npm run build`.
- Pass: `npm run design-system:check`.
- Pass: `git diff --check`.
- Vercel tool verification: production project `cadence`
  (`prj_9tZKRXZ6IdT56ZLKVSmoJH5AAYhs`) latest deployment
  `dpl_APxAZ7fDhZjuNHvKFPMgZjMTP3eK` is `READY` at commit
  `e1bf0bfa56b00264b88ce3cb4307fc6c62823a3b`; reminder cron logs returned 200
  hourly as noted above.
- Browser QA: attempted Playwright against local dev server. The bundled
  Playwright browser was not installed, system Chrome failed to launch headless
  in this environment, and the local Next dev server had a stale lock reporting
  PID 49560 while no HTTP connection was available on port 3000. UI route
  rendering is covered by `npm run build` and render-level tests, but live
  desktop/mobile browser inspection remains unverified in this pass.

Remaining risk:
- Browser push subscription verification from Ticket 029 was superseded by the
  Browser push delivery troubleshooting note below: production Chrome now shows
  permission granted and an active PushSubscription. Real provider delivery
  still needs deployed-code verification.
- The latest production deployment became ready after the observed 00:00Z cron
  tick; confirm the next post-deploy hourly cron tick if strict latest-artifact
  cron verification is needed.
- The rate limiter is per-runtime in-memory protection. It is a practical
  baseline, not distributed abuse prevention across all Vercel instances.
- First-run onboarding, privacy-safe monitoring, and many-user RLS smoke QA were
  completed in Ticket 030 below.

### Ticket 030: Public web hardening follow-up

Status: complete.

Implementation summary:
- Made the future public web hardening follow-up explicit as Ticket 030 in
  `docs/TICKETS.md`.
- Added a server-derived, client-aware first-run setup panel on Timeline. It
  appears only while required setup remains incomplete and the user has not
  dismissed it in the current browser.
- The setup panel links to existing controls:
  `/behaviors#create-behavior`, `/settings#notifications`,
  `/settings#timezone`, and `/export#behaviorlog-import`. Import remains
  optional and non-blocking.
- Added anchor targets to the existing Behavior create, Settings notification,
  Settings timezone, and BehaviorLog import sections.
- Added privacy-safe structured monitoring helpers and wired OAuth callback,
  push subscription, and reminder processing route outcomes into sanitized
  runtime logs. No external monitoring SDK or third-party reporting provider was
  added.
- Added `npm run smoke:rls` backed by `scripts/supabase-rls-smoke.mjs`. The
  smoke command creates two temporary auth users with service-role access for
  setup/cleanup, then signs in with ordinary publishable-key clients and checks
  profile/category/behavior isolation.
- Updated product, UI, user-flow, route, notification, data-model, operations,
  Supabase, Vercel, design, ticket, and status docs.
- No schema migration, new product route, provider send, marketing site,
  admin/support dashboard, analytics/cookie SDK, workspace restructuring, or
  offline/PWA behavior was added.

Verification:
- Pass: `npm run test -- tests/onboarding.service.test.ts tests/monitoring.test.ts tests/rls-smoke-script.test.ts` (14 focused tests).
- Pass: targeted ESLint for changed onboarding, monitoring, route, and test
  files.
- Pass: `npm run smoke:rls`; configured Supabase target created two temporary
  users, verified six ownership checks, and cleaned up temporary users.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (35 files, 241 tests).
- Pass: `npm run build`.
- Pass: `npm run design-system:check`.
- Pass: `git diff --check`.
- Browser QA: local dev server at `http://localhost:3000` with a temporary
  authenticated Chrome user rendered `/timeline` first-run setup at 1280px and
  390px. The setup links were present, there was no horizontal overflow, no
  console warnings/errors were captured, the mobile fixed Needs decision
  control sat over reserved blank panel space, and the temporary auth user was
  cleaned up.

Remaining risk:
- The monitoring implementation intentionally uses platform runtime logs only.
  If a later ticket adds a third-party monitoring provider, it needs an
  explicit privacy model and consent posture before sending events off-platform.
- `npm run smoke:rls` should be rerun before broad public launch and after
  material RLS/schema changes.

### Browser push delivery troubleshooting

Status: complete.

Implementation summary:
- Investigated the reported Chrome notification prompt issue from Settings.
  Chrome on production `https://cadence-blush-three.vercel.app/settings`
  already reports `Notification.permission = "granted"`, so clicking Save
  subscription will not show a browser authorization prompt for that origin
  unless the site permission is reset.
- Confirmed the production Chrome profile has one service worker registration
  for the app origin and an active PushSubscription through `fcm.googleapis.com`
  with both `p256dh` and `auth` keys present. The subscription step is therefore
  working in Chrome.
- Fixed the actual delivery gap: `/api/reminders/process` now calls combined
  reminder processing instead of the email-only processor.
- Added `web-push` server-side sending through `lib/services/web-push.service.ts`
  using `NEXT_PUBLIC_VAPID_PUBLIC_KEY` plus server-only `VAPID_PRIVATE_KEY`.
- Added browser-push due delivery listing/claiming, active subscription lookup,
  expired subscription deactivation, no-subscription failure logging, and
  missing-VAPID failure logging.
- Kept resolver logic pure; browser provider calls remain in services.
- Updated the Settings notification panel so the Permission row continues to
  show Chrome's real permission state (`Allowed`, `Blocked`, or `Not enabled`)
  after saving a subscription instead of replacing it with `Enabled`.
- Updated notification, route, Vercel workflow, and status docs.
- No schema migration, PWA caching, offline writes, marketing flow, or extra
  Settings surface was added.

Verification:
- Pass: `npm run test -- tests/reminder.service.test.ts tests/reminder-process-route.test.ts tests/push-subscribe-route.test.ts tests/push-browser.test.ts` (4 files, 26 tests).
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run typecheck`.
- Pass: `npm run lint`.
- Pass: `npm run design-system:check`.
- Pass: `npm run test` (31 files, 212 tests).
- Pass: `npm run build`.
- Pass: `git diff --check`.
- Pass: local Astro dev server HTTP smoke for `/`, `/docs`, `/llms.txt`, and
  `/examples/cadence-demo.behaviorlog.zip` at `http://127.0.0.1:4321/`.
- NPM install for `web-push` / `@types/web-push` completed with the existing
  `ink` React peer warning and 0 vulnerabilities.
- Chrome QA: local `http://localhost:3000/login?next=%2Fsettings` reported
  secure context, Notification API available, `Notification.permission =
  "default"`, service worker support available, and PushManager available.
- Chrome QA: production Settings tab reported secure context, Notification API
  available, `Notification.permission = "granted"`, service worker support
  available, PushManager available, one app service worker registration, and an
  active FCM PushSubscription with required keys present. Endpoint and keys were
  not printed.

Remaining risk:
- A real browser-push provider send was not triggered during this troubleshooting
  pass. The new provider path is covered by mocked service tests; deployed
  production verification still needs this code deployed and a safe due browser
  reminder or approved test-send path.
- If the user wants to see Chrome's browser authorization prompt again on the
  production origin, the existing allowed notification permission must be reset
  in Chrome site settings first.

### Browser push production verification

Status: complete.

Implementation summary:
- Fixed reminder processor revalidation so expected reminder timestamps are
  compared as Temporal instants instead of raw strings. Supabase/Postgres can
  return the same UTC instant as `+00:00` while the resolver emits `Z`; those
  now match for both email and browser-push deliveries.
- Updated the Settings notification control so Save subscription remains the
  stable action label, retries `Notification.requestPermission()` from the
  user click whenever Chrome still allows prompting, and stays clickable in the
  blocked state so it can show factual unblock guidance.
- Updated notification, UI, and user-flow docs for click-driven permission
  retry and the browser limitation that already allowed or blocked origins do
  not show the native prompt again until site settings are reset.
- Deployed the isolated browser-push fix to the existing Vercel production
  project from a temporary clean copy so unrelated in-progress local changes
  were not included. Deployment `dpl_B5RBr2msxy29hnEHijAXjdf1iFdH` became
  READY and was aliased to `https://cadence-blush-three.vercel.app`.
- No schema migration, offline/PWA caching, marketing flow, or new Settings
  surface was added.

Verification:
- Pass: `npm run test -- tests/reminder.service.test.ts tests/push-browser.test.ts` (2 files, 18 tests).
- Pass: `npm run resolvers:check`.
- Pass: `npm run typecheck`.
- Pass: `npm run lint`.
- Pass: `npm run agents:check`.
- Pass: `npm run test` (32 files, 219 tests).
- Pass: `npm run build`.
- Production preflight: due email reminder count was 0 before calling the
  processor; active browser subscriptions existed for Apple Push and Chrome
  FCM.
- Production send QA: inserted one temporary Chrome-targeted browser-push
  behavior/occurrence/reminder due at `2020-01-01T15:00:00Z`, called
  `POST https://cadence-blush-three.vercel.app/api/reminders/process?limit=1`,
  and received `{ checked: 1, claimed: 1, sent: 1, failed: 0, cancelled: 0 }`.
  The delivery row was marked `sent` with `sent_at`, no error, and
  `processing_started_at`.
- Production cleanup QA: deleted the temporary behavior and confirmed 0
  matching QA behaviors and 0 matching QA reminder-delivery rows remained.
- Chrome QA: production Settings rendered `Allowed`, `Available`, and Save
  subscription; Chrome DevTools Protocol reported secure context, Notification
  API, service worker, PushManager, `Notification.permission = "granted"`, and
  an active FCM PushSubscription with both required keys present.

Remaining risk:
- Chrome will not show the native notification permission banner again for an
  origin that is already `granted` or `denied`. The production Chrome profile
  is currently `granted`, so seeing the banner again requires manually resetting
  the Cadence site permission to the ask/default state in Chrome site settings,
  then clicking Save subscription.
- Codex browser automation was not allowed to open `chrome://settings`, so the
  permission reset itself was not performed by the agent.

### Public product posture

Status: complete.

Implementation summary:
- Updated Cadence's source-of-truth posture from private-only personal app to
  public, open-source, single-account personal behavior tracker.
- Added `docs/PUBLIC_PRODUCT_ARCHITECTURE.md` to scope the target surface model:
  authenticated web app, Astro marketing site, future Tauri desktop app, future
  mobile app, and eventual shared packages.
- Documented the launch sequence: harden the current Google-auth web app for
  many independent accounts first; defer billing, AI speech features,
  desktop/mobile implementation, and workspace restructuring until explicit
  tickets.
- Added future tickets for public web hardening, Astro marketing, and workspace
  restructuring.
- Updated product, route, UI, flow, data, notification, export, operations,
  Vercel, desktop proposal, README, AGENTS, and decision docs to reflect the
  public posture and BehaviorLog Bundle demonstration/adoption role.

Verification:
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`

Remaining risk:
- No implementation restructure was performed. Current routes, deployment
  assumptions, package layout, and app code remain unchanged until future
  tickets schedule the work.

### Settings timezone detection and override

Status: complete.

Implementation summary:
- Added a lightweight Settings timezone panel that shows the stored profile
  timezone, detects the browser/OS timezone with `Intl.DateTimeFormat()`, offers
  a Use detected timezone action, and supports manual IANA timezone entry.
- Added server-side timezone canonicalization/validation without geolocation or
  location permission.
- Saving a changed timezone updates `profiles.timezone`, updates all active
  behaviors to that timezone, and resyncs future unresolved occurrences through
  the existing occurrence generation service. Past occurrences, resolved
  occurrences, and archived behaviors remain historical records.
- Added repository helpers for profile timezone and active behavior timezone
  updates, plus service tests for validation, no-op saves, and active-behavior
  resync orchestration.
- Updated date/time, data-model, product, UI, user-flow, route, ticket, design,
  and status docs to reflect the implemented policy.
- No schema migration, location permission prompt, onboarding wizard, or
  out-of-scope app surface was added.

Verification:
- Pass: `npm run test -- tests/settings.service.test.ts`
- Pass: targeted ESLint for changed Settings/service/repository/test files.
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (32 files, 219 tests).
- Pass: `npm run build`
- Pass: `git diff --check`
- Browser QA: authenticated Chrome `/settings` rendered the new full-width
  Timezone panel with Current timezone, Browser timezone, IANA timezone field,
  Use detected timezone, and Save timezone controls. Browser timezone matched
  the saved timezone, so Use detected timezone was disabled as expected.
- Browser QA: a no-op Save timezone submit against the current timezone
  returned `POST /settings 200` and did not mutate behavior schedules.
- Browser QA: headless system Chrome verified unauthenticated `/settings`
  redirects to `/login?next=%2Fsettings` at 1280px and 390px with no horizontal
  overflow and no console warnings/errors.

Remaining risk:
- Browser QA intentionally did not change the real account timezone; the changed
  timezone mutation/resync path is covered by mocked service tests.
- Protected mobile Settings visual inspection could not be completed reliably
  with the available desktop-browser automation. The unauthenticated mobile
  redirect/login surface was verified at 390px.

### Behavior create submit feedback

Status: complete.

Implementation summary:
- Added a client-owned Behaviors create disclosure wrapper so successful create
  submissions close the create form instead of leaving it open.
- Kept the existing server action success text, `Behavior created.`, and moved
  create success feedback outside the collapsible form so the message remains
  visible after the form closes.
- Remounted the create form after success so a later create starts from blank
  default fields.
- Added the new create-section module to the design-system manifest, usage map,
  and dev-only bench preview.
- No schema, resolver, reminder, export, analytics, route, or product-scope
  changes were added.

Verification:
- Pass: targeted ESLint for changed Behaviors and design-system files.
- Pass: `npm run typecheck`
- Pass: `npm run design-system:check`
- Pass: `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`
- Pass: `git diff --check`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run test` (32 files, 227 tests).
- Pass: `npm run build`
- Browser QA: headless system Chrome submitted the dev-only
  `BehaviorCreateSection` preview at `/design-system`; after the successful
  bench server action, the disclosure was closed, the success status remained
  visible, the title field was blank after remount, and desktop plus 390px
  mobile viewports had no horizontal overflow.

Remaining risk:
- The authenticated `/behaviors` production-data create path was not submitted
  during this pass; the wrapper behavior was verified through the same component
  in the dev-only bench with a harmless server action, and the real create
  action already returns `Behavior created.`.

### Ticket 031: Astro marketing site

Status: complete.

Implementation summary:
- Added `apps/marketing` as a sibling Astro app without moving or changing the
  authenticated Next.js app shell.
- Implemented `/`, `/standard`, `/cadence`, `/examples`, `/docs`, and `/about`.
  The homepage leads with BehaviorLog as the standard, while Cadence remains
  the main product object and demonstration tracker.
- Kept the current Cadence mark, added a quieter inline BehaviorLog companion
  mark, and reused the square ledger visual system with sanitized static
  Timeline and bundle captures.
- Added primary CTAs for Try Cadence, Read the Standard, Download Example
  Bundle, and View on GitHub.
- Added SEO and agent-readability outputs: canonical metadata, Open
  Graph/Twitter metadata, JSON-LD, Markdown alternate links, `sitemap.xml`,
  `robots.txt`, `llms.txt`, `llms-full.txt`, page `.md` mirrors, and
  `/data/route-manifest.json`.
- Added a build-time generator for a sanitized example
  `cadence-demo.behaviorlog.zip` bundle and a marketing agent-readability
  verification script.
- Added npm workspace scripts for `marketing:dev`, `marketing:build`,
  `marketing:check`, and `marketing:preview`; root Next scripts remain
  unchanged.
- Ran a post-launch impeccable polish pass on the marketing site: fixed the
  CSS font reset that caused browser-serif rendering, contained mobile table
  and code-panel overflow, made the sticky header solid, added semantic inline
  code styling, improved mobile tap-target text sizing, and adjusted the
  homepage hero/capture layout so it does not collide or clip.
- Recorded the max-visibility marketing crawl policy in
  `docs/CRAWL_POLICY.md`.
- Updated public product architecture, route map, product/UI/user-flow docs,
  future-update notes, operations, design docs, tickets, and this status ledger.

Verification:
- Pass: `npm run marketing:build`.
- Pass: `npm run marketing:check`.
- Pass: `unzip -t apps/marketing/public/examples/cadence-demo.behaviorlog.zip`.
- Pass: `node tests/fixtures/behaviorlog-reference/validate.mjs /private/tmp/cadence-demo-bundle-check-current`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run design-system:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (39 files, 251 tests).
- Pass: `npm run build`.
- Pass: `git diff --check`.
- Pass: Chrome DevTools screenshot QA for `/` and `/docs` at a true 390px
  mobile viewport; both routes reported `docScrollWidth === docClientWidth`.
- Pass: Chrome DevTools screenshot QA for `/` at 1440px desktop; the hero
  product capture stayed inside the viewport and did not collide with the H1.
- Pass: local agent-readability audit against `http://127.0.0.1:4321` returned
  13 pass, 1 warn, 0 fail; the warning is uniform sitemap `lastmod` values,
  expected because all marketing routes launched on 2026-06-20.
- Pass: Vercel production deployment `dpl_3nZNis38DwHLQDndxyG37URrwRk4`
  reached `READY` for the separate `cadence-marketing` project and was aliased
  to `https://cadence-marketing-two.vercel.app`.
- Pass: live Vercel fetch checks returned 200 for `/`, `/docs`,
  `/sitemap.xml`, and `/llms.txt`; canonical and sitemap URLs point at
  `https://cadence-marketing-two.vercel.app`.

Remaining risk:
- A custom apex/domain is not configured yet. If the marketing site later owns
  apex `/`, keep the authenticated app entry behavior through an app subdomain
  or app-specific route.

### Codebase documentation refresh

Status: complete.

Implementation summary:
- Reviewed the implemented app, marketing workspace, migrations, resolver
  registry, tests, and source-of-truth docs for current-state drift.
- Updated bootstrap/governance/deployment docs so they describe the implemented
  authenticated Next.js app plus sibling Astro marketing site, not a future
  marketing site.
- Updated resolver registry text for the implemented BehaviorLog restore
  preview/apply UI and service test coverage.
- Updated ticket verification guidance to include the agent and resolver drift
  checks before the standard lint/typecheck/test/build sequence.
- No product code, schema, route, provider, or scope changes were made.

Verification:
- Pass: stale documentation scan for old marketing/future-surface wording.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (39 files, 251 tests).
- Pass: `npm run build`.
- Pass: `git diff --check`.

### Occurrence decision correction implementation

Status: complete.

Implementation summary:
- Implemented Ticket 032 Needs Decision same-day correction retention.
- Timeline resolver input now carries `statusMarkedAt`, and the resolver derives
  same-day retained prior decisions from `status_marked_at` plus the user's
  local midnight boundary without adding a stored flag or status.
- Timeline service now fetches prior unresolved rows and prior resolved rows
  marked during the current local day, while the Needs Decision count continues
  to count only prior unresolved occurrences.
- Implemented Ticket 033 Analytics selected-day occurrence correction.
- Analytics selected-day data now lists all occurrences for the selected local
  date, including Completed, Not Completed, and Unresolved rows with status and
  note-state labels.
- Analytics selected-day review reuses the existing occurrence status and note
  services through `/analytics` server actions, preserving status-event
  semantics and refreshing the route after corrections.
- Updated route/resolver/design docs, the design-system fixture/usage map, and
  resolver tests. No schema, provider, navigation, dashboard/history route, bulk
  edit, offline mutation, stored missed status, or AI/coaching scope was added.

Verification:
- Pass: `npm run test -- tests/timeline.resolver.test.ts tests/analytics.resolver.test.ts`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run design-system:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (39 files, 253 tests).
- Pass: `npm run build`.
- Browser QA: local Chrome against `http://localhost:3000` verified
  `/design-system#ds-module-analytics-screen` and
  `/design-system#ds-module-timeline` at 1280px and 390px with no horizontal
  overflow, no browser warnings/errors, visible `Review selected day`, selected
  day status/note controls, and the Needs decision button. Protected
  `/analytics` and `/timeline` redirected unauthenticated sessions to `/login`
  at both widths without horizontal overflow or browser warnings/errors.

Remaining risk:
- Browser QA used fixture-backed authenticated UI through `/design-system`
  because the automated Chrome context did not have a Supabase session.

### Analytics behavior-day correction refinement

Status: complete.

Implementation summary:
- Removed the Analytics page header description that showed `Local day
  boundary: <timezone>`.
- Converted the Overall adherence calendar into a passive summary. Overall day
  cells no longer open the correction panel.
- Added behavior-specific review selection through the `behavior` and `day`
  query parameters. The Analytics resolver now returns `selectedBehaviorDay`
  rows filtered by behavior id and local date, and marks the selected
  behavior calendar cell without making the UI filter review rows.
- Moved occurrence status/note correction into a compact Review day area inside
  the selected behavior row. It reuses the existing Analytics server actions
  and Timeline status/note controls.
- Updated the dev-only design-system Analytics fixture plus product, UI,
  user-flow, route, resolver-registry, design, and status docs.
- No schema, migration, provider, notification, export, route-navigation,
  dashboard/history route, bulk edit, stored missed status, or AI/coaching
  scope was added.

Verification:
- Pass: `npm run test -- tests/analytics.resolver.test.ts`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run typecheck`.
- Pass: targeted ESLint for Analytics page/component/resolver/service/test and
  design-system fixture files.
- Pass: `npm run agents:check`.
- Pass: `npm run design-system:check`.
- Pass: `npm run lint`.
- Pass: `npm run test` (41 files, 257 tests).
- Pass: `npm run build`.
- Pass:
  `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`.
- Pass: `git diff --check`.
- Browser QA: Playwright with system Chrome against
  `http://localhost:3000/design-system?preview=module.analytics-screen#ds-module-analytics-screen`
  at 1280px and 390px showed the Analytics fixture with no horizontal
  overflow, no console warnings/errors, no `Local day boundary` copy, no old
  `Review selected day`/`Select a day to review` copy, passive overall
  calendar cells, behavior calendar review links, and the in-row Review day
  panel.
- Browser QA: unauthenticated `/analytics` redirected to
  `/login?next=%2Fanalytics` at 1280px and 390px with no horizontal overflow,
  no console warnings/errors, and no local-boundary copy.

Remaining risk:
- Authenticated live `/analytics` production-data QA was not performed because
  the browser context did not have a Supabase session; the same
  `AnalyticsScreen` was verified through the fixture-backed design-system
  route.
- The worktree already contained unrelated auth/proxy/package/design-system
  edits before this task; this refinement did not revert or normalize them.

### Analytics behavior-day scroll retention

Status: complete.

Implementation summary:
- Updated behavior calendar review links on Analytics to preserve scroll
  position while opening a selected behavior day. This prevents the page from
  jumping back to the top when the in-row Review day panel opens.
- No resolver, service, schema, route, provider, export, or product-scope
  changes were added.

Verification:
- Pass: targeted ESLint for `components/analytics/AnalyticsScreen.tsx`.
- Pass: `npm run typecheck`.
- Pass: `npm run build`.

Remaining risk:
- Authenticated live click QA was not performed because the browser context did
  not have a Supabase session.

### Analytics top-fold layout compaction

Status: complete.

Implementation summary:
- Reworked the top Overall adherence section so the active range selector sits
  beside the heading on desktop, while the adherence percentage and status
  counts stay grouped in the left summary column.
- Moved the overall calendar into the same fold as the summary on desktop,
  kept only the See Legend control above it, and removed the extra divider
  line between the heading/range row and summary body.
- Added compact date hover/focus labels to Analytics heatmap cells using the
  existing resolver-provided short date label.
- Removed the extra divider line above Behavior counts.
- Changed behavior category display from a bordered chip beside the behavior
  name to plain `Category: <name>` metadata below the behavior name.
- Enlarged behavior heatmaps so 30-day calendars fill more of the row height
  while preserving the seven-column square-cell aspect ratio.
- Kept the mobile order stacked and readable: heading, range selector,
  adherence metric, counts, then calendar.
- No resolver, service, schema, route, provider, export, navigation, or
  product-scope changes were added.

Verification:
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (41 files, 257 tests).
- Pass: `npm run design-system:check`.
- Pass: `npm run build`.
- Browser QA: authenticated in-app browser `/analytics` at 1024x768 verified no
  horizontal overflow, no Calendar heading, no top border/padding on the
  summary body or Behavior counts section, no behavior category chips,
  `Category: Medical` metadata, 304px by 216px behavior heatmaps in the 30-day
  view, short date `data-hover-label` values, and no warning/error logs.
- Browser QA: authenticated in-app browser `/analytics` at 390px verified no
  horizontal overflow, no Calendar heading, plain category metadata, the larger
  behavior calendar staying inside the viewport, and no warning/error logs.

Remaining risk:
- The in-app browser automation did not expose CSS `:hover` state from
  programmatic mouse movement, including CDP mouse events. The heatmap cells
  have the expected `data-hover-label` attributes and tooltip CSS, but the
  visual hover chip was not proven through automated hover-state capture.

### Analytics behavior-day review cohesion

Status: complete.

Implementation summary:
- Reworked the selected behavior-day Analytics review so it reads as one
  cohesive expansion inside the selected behavior row rather than a divided
  subtable.
- Removed internal divider lines from the review area and replaced the Review
  day heading with Behavior date.
- Replaced scheduled-time/status chips and note-state labels with plain text
  rows for Time of behavior, Status, and Note. Empty notes display as italic
  No note; saved notes display the note text.
- Hid per-occurrence status and note editing behind a Review disclosure by
  default. When opened, Change status sits beside the Completed / Not Completed
  actions when space allows, followed by the existing Note form.
- Removed the stale Analytics selected-day `noteStateLabel` resolver/type
  field and refreshed the design-system usage line numbers.
- Updated `DESIGN.md`, `docs/UI_SPEC.md`, and `docs/USER_FLOWS.md` for the new
  behavior-day review contract.
- No schema, route, provider, notification, export, navigation, dashboard,
  stored-status, or product-scope changes were added.

Verification:
- Pass: `npm run test -- tests/analytics.resolver.test.ts`.
- Pass: targeted ESLint for the Analytics component/resolver/types/test and
  design-system fixture files.
- Pass: `npm run typecheck`.
- Pass: design-system usage scan for current line numbers.
- Pass:
  `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx`.
- Pass: `npm run design-system:check`.
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run test` (41 files, 257 tests).
- Pass: `npm run build`.
- Browser QA: in-app browser against
  `http://127.0.0.1:3000/design-system?preview=module.analytics-screen#ds-module-analytics-screen`
  at 1280px verified Behavior date copy, no Review day copy, plain Time of
  behavior / Status / Note labels, no internal review borders, Review closed by
  default, no horizontal overflow, and no warning/error logs.
- Browser QA: the desktop Review disclosure opened with a 512px editor,
  Change status aligned with the Completed action, visible Note textarea, and
  no horizontal overflow.
- Browser QA: at 390px mobile, the closed and opened review states had no
  horizontal overflow, the Note textarea fit the available panel width, and the
  status controls wrapped as expected.

Remaining risk:
- Authenticated live `/analytics` production-data QA was not performed because
  the browser context did not have a Supabase session; the same
  `AnalyticsScreen` was verified through the fixture-backed design-system
  route.
- The design-system inventory scan still reports broader pre-existing manifest
  drift outside this touched Analytics surface. This refinement refreshed only
  the usage map line numbers affected by the edited component.

### Minimal action primitive and divider rollout

Status: complete.

Implementation summary:
- Replaced the product button primitive with transparent underlined text
  actions. Primary actions now use Ink Black, secondary actions use Readable
  Ash, and destructive actions use Rust Signal.
- Propagated the primitive through auth, Timeline status/note actions,
  behavior create/edit/archive/restore controls, settings actions, export and
  BehaviorLog import/restore controls, legal links, design-system previews, and
  marketing CTAs.
- Replaced non-functional full perimeter panel borders with divider-based
  sections across onboarding, login, settings, export, shared placeholder
  panels, and action feedback messages.
- Preserved real boundaries for form fields, segmented selected controls,
  heatmap cells, dense preview tables, dialogs, and the fixed Needs decision
  launcher.
- Updated `DESIGN.md` and `docs/UI_SPEC.md` so future UI work keeps primary
  actions black, secondary actions grey, and structural containers unboxed.
- No schema, route, provider, notification, export-format, stored-status, or
  product-scope changes were added.

Verification:
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (41 files, 257 tests).
- Pass: `npm run build`.
- Pass: `npm run design-system:check`.
- Pass:
  `python3 /Users/emi/.codex/skills/design-system-bench/scripts/verify_traceability.py --root . --manifest design-system.manifest.json --usage design-system.usage.json --bench app/design-system/page.tsx --config design-system.config.json`.
- Pass: `git diff --check`.
- Pass: `npm run marketing:check`.
- Pass: `npm run marketing:build`.
- Browser QA: restarted local dev server on `http://localhost:3000` and
  verified `/design-system` at 1280px and 390px. Primary primitive computed as
  transparent, 0px border, underlined Ink Black; secondary computed as
  transparent, 0px border, underlined Readable Ash; disabled stayed muted with
  no underline; overlay panel computed white with no perimeter border; no
  horizontal overflow on either viewport.

Remaining risk:
- Authenticated live app routes were not manually walked with a signed-in
  Supabase session. The changed authenticated components were covered through
  fixture-backed design-system previews, static scans, typecheck, tests, and
  build.

## Handoff notes

- For the next coding agent: production browser push subscription is now
  verified in Chrome as permission granted with an active FCM subscription, and
  browser-push production delivery has been verified with a safe temporary due
  reminder. Chrome will not show the native notification permission prompt again
  for an already granted or denied origin unless the site permission is reset.
  Production cron execution has been verified through Vercel runtime logs.
- Ticket 029 completed the first public web hardening baseline. Ticket 030 completed
  first-run onboarding, privacy-safe structured runtime monitoring, and the
  `npm run smoke:rls` many-user RLS smoke command. Re-run the smoke command
  before broad public launch and after material RLS/schema changes.
- Ticket 025 is now split into 025A restore preview and 025B restore apply/UI.
  Implement 025A first, verify it fully, then implement 025B. Ticket 025B is
  intentionally more destructive than the current import/create/merge paths.
- Do not start deferred offline/PWA, workspace restructuring, desktop/mobile, billing, or AI work unless the relevant docs and tickets move that work into active scope.
- Run `npm run agents:check` and `npm run resolvers:check` before standard lint/typecheck/test/build verification.
- Run `npm run design-system:check` after changing reusable UI, the bench route, or design-system manifest/usage/config files.
- Use `docs/SUPABASE_WORKFLOW.md` for Supabase CLI local/hosted management and `docs/SEQUENZY_WORKFLOW.md` for Sequenzy CLI/provider operations.
- Keep v1 small. Do not implement deferred PWA/offline behavior from `docs/FUTURE_UPDATES.md` unless the active docs are updated first.
- Preserve the resolver-first architecture: core logic belongs in `lib/resolvers`, database access in `lib/db`, orchestration in `lib/services`, and UI/API routes should not duplicate resolver logic.
