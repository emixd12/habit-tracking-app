# Implementation Tickets

Implement in small vertical slices.

Do not attempt to build the whole application in one pass.

For each ticket, Codex should return:
- What changed
- Files changed
- Tests added/updated
- Commands run
- Risks/TODOs

Before a ticket is complete, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

If a command does not exist yet, add it or explicitly state why it does not exist.

---

## Ticket 001: Initialize app

Create a Next.js App Router TypeScript project with Tailwind, linting, typecheck, Vitest, and a basic app shell.

Do not implement product features yet.

Acceptance criteria:
- `npm run lint` works
- `npm run typecheck` works
- `npm run test` works
- `npm run build` works
- App has placeholder routes:
  - Timeline
  - Behaviors
  - Analytics
  - Export
  - Settings
- Basic responsive layout exists
- No database work yet
- No auth work yet

Suggested files:
- `package.json`
- `next.config.*`
- `tsconfig.json`
- `vitest.config.*`
- `app/layout.tsx`
- `app/page.tsx`
- `app/(app)/timeline/page.tsx`
- `app/(app)/behaviors/page.tsx`
- `app/(app)/analytics/page.tsx`
- `app/(app)/export/page.tsx`
- `app/(app)/settings/page.tsx`
- `components/layout/AppShell.tsx`

---

## Ticket 002: Add Supabase Auth

Add Supabase client/server setup and Google login.

Acceptance criteria:
- User can sign in with Google
- Protected app routes redirect unauthenticated users
- Authenticated user can access Timeline page
- No service-role key is exposed to browser
- `.env.example` is updated if needed
- Auth setup is documented if needed

Suggested files:
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `middleware.ts`
- `app/(auth)/login/page.tsx`
- `app/auth/callback/route.ts`

---

## Ticket 003: Create database schema

Create Supabase migrations for:
- profiles
- categories
- behaviors
- occurrences
- reminder_deliveries
- push_subscriptions

Add RLS policies for all user-owned tables.

Acceptance criteria:
- Migrations apply cleanly
- RLS prevents access to other users' records
- Seed or onboarding mechanism creates default categories
- Schema matches `/docs/DATA_MODEL.md`
- Types are generated or manually defined

Suggested files:
- `supabase/migrations/*`
- `supabase/seed.sql`
- `lib/types/*.ts`

---

## Ticket 004: Recurrence resolver

Implement `recurrence.resolver.ts` and tests.

Supported:
- Daily
- Every N days
- Weekly selected weekdays
- Every N weeks
- Monthly day N with last-day fallback

Acceptance criteria:
- Resolver is pure
- Tests cover all supported recurrence types
- Tests cover America/New_York and midnight boundary
- No database calls in resolver
- No UI code in resolver

Suggested files:
- `lib/resolvers/recurrence.resolver.ts`
- `lib/types/recurrence.ts`
- `tests/recurrence.resolver.test.ts`

---

## Ticket 005: Behavior CRUD

Implement behavior create/edit/archive.

Acceptance criteria:
- Create behavior with:
  - title
  - description
  - category
  - recurrence
  - scheduled time
  - browser reminder
  - email reminder
  - reminder offset
- Edit behavior
- Archive behavior
- Archived behavior no longer generates new occurrences
- History remains intact
- UI is mobile responsive

Suggested files:
- `lib/db/behaviors.repo.ts`
- `lib/services/behavior.service.ts`
- `components/behaviors/BehaviorForm.tsx`
- `components/behaviors/BehaviorList.tsx`
- `components/behaviors/RecurrenceEditor.tsx`
- `components/behaviors/ReminderEditor.tsx`
- `app/(app)/behaviors/page.tsx`

---

## Ticket 006: Occurrence generation

Implement `occurrence.resolver.ts` and `occurrence.service.ts`.

Generate occurrences for today + next 30 days.

Acceptance criteria:
- Occurrences are idempotent
- No duplicates
- Editing behavior refreshes future unresolved occurrences according to documented behavior
- Existing resolved history is not destroyed
- Archived behaviors generate no new occurrences
- Tests cover missing occurrence detection

Rule:
When a behavior changes, future unresolved occurrences may be regenerated. Past occurrences and resolved occurrences are preserved.

Suggested files:
- `lib/resolvers/occurrence.resolver.ts`
- `lib/db/occurrences.repo.ts`
- `lib/services/occurrence.service.ts`
- `tests/occurrence.resolver.test.ts`

---

## Ticket 007: Timeline

Implement `timeline.resolver.ts` and Timeline screen.

Acceptance criteria:
- Needs decision group shows unresolved occurrences before today
- Current day is prominent and starts the forward timeline
- Current-day unresolved occurrences show Completed and Not Completed actions
- Resolved current-day occurrences show a distinct resolved state
- Timeline shows the next 7 days by default
- A control lets the user show more future days
- Day sections with no occurrences show "No behaviors on this day"
- Items are ordered by scheduled time
- Categories and descriptions are hidden until a card is expanded
- Mobile layout works
- Timeline grouping logic is tested

Suggested files:
- `lib/resolvers/timeline.resolver.ts`
- `components/timeline/Timeline.tsx`
- `components/timeline/TimelineGroup.tsx`
- `components/timeline/OccurrenceRow.tsx`
- `app/(app)/timeline/page.tsx`
- `tests/timeline.resolver.test.ts`

---

## Ticket 008: Status marking and notes

Implement `status.resolver.ts` and status buttons.

Acceptance criteria:
- User can mark Completed
- User can mark Not Completed
- User can edit status later
- User can add/edit note
- Status changes update `status_marked_at`
- `completed_at` is set when status is `done`
- Status transition logic is tested

Suggested files:
- `lib/resolvers/status.resolver.ts`
- `lib/services/occurrence.service.ts`
- `components/timeline/StatusButtons.tsx`
- `tests/status.resolver.test.ts`

---

## Ticket 009: Browser push

Implement push subscription and browser notification delivery.

Acceptance criteria:
- User can enable notification permission
- Push subscription stored
- Settings can trigger the browser notification permission prompt
- Browser reminders are generated for behaviors by default
- App still works if permission denied
- No secrets exposed to browser except public VAPID key

Suggested files:
- `app/api/push/subscribe/route.ts`
- `lib/db/pushSubscriptions.repo.ts`
- `lib/services/reminder.service.ts`

---

## Ticket 010: Email reminders

Implement Sequenzy email reminders.

Acceptance criteria:
- Email reminders only send when enabled on behavior
- Reminder offset respected
- Pending reminders cancelled when occurrence is resolved
- Failed reminders logged
- No duplicate sends
- Reminder processing route is protected by a secret or appropriate server-only mechanism
- Sequenzy provider setup, template inspection, and test sends use the CLI workflow in `docs/SEQUENZY_WORKFLOW.md`
- Runtime sending uses server-only code and never exposes `SEQUENZY_API_KEY` to the browser

Suggested files:
- `lib/resolvers/reminder.resolver.ts`
- `lib/services/reminder.service.ts`
- `lib/db/reminders.repo.ts`
- `lib/services/sequenzy.service.ts`
- `app/api/reminders/process/route.ts`
- `tests/reminder.resolver.test.ts`

---

## Ticket 011: Analytics

Implement `analytics.resolver.ts` and basic Analytics screen.

Acceptance criteria:
- Completion counts by behavior
- Overall adherence at top
- 30-day default view with 7/30/90 day options
- Binary calendar heatmap for overall adherence
- Per-behavior chart or calendar heatmap
- Full and partial completion can be represented for behaviors that happen multiple times in a day
- Not completed occurrences can be inspected for a selected day
- Optional compact counts by category
- Unresolved shown separately
- Default adherence excludes unresolved
- Analytics logic is tested

Suggested files:
- `lib/resolvers/analytics.resolver.ts`
- `components/analytics/CompletionSummary.tsx`
- `components/analytics/CategorySummary.tsx`
- `app/(app)/analytics/page.tsx`
- `tests/analytics.resolver.test.ts`

---

## Ticket 012: Export

Implement JSONL, CSV, full JSON backup, and AI summary.

Acceptance criteria:
- Export includes categories, behaviors, occurrences, notes
- JSONL is one record per line
- CSV opens cleanly in spreadsheet software
- AI summary is readable Markdown-compatible text
- AI summary can be copied and downloaded as `.md`
- Export range can be selected
- Archived behaviors can be included as an option
- Export resolver is tested
- CSV escaping is tested

Suggested files:
- `lib/resolvers/export.resolver.ts`
- `lib/services/export.service.ts`
- `app/api/export/jsonl/route.ts`
- `app/api/export/csv/route.ts`
- `app/api/export/json/route.ts`
- `components/export/ExportPanel.tsx`
- `tests/export.resolver.test.ts`

---

## Ticket 013: Vercel production deployment

Deploy the completed v1 app to the existing Vercel project and harden the production runtime.

Current Vercel context:
- Existing Vercel project: `cadence` under team `Emi's projects`.
- Connected GitHub repository: `emixd12/habit-tracking-app` on `main`.
- At draft time, the latest production deployment in Vercel was ready but pointed at commit `d2c4c4985bb1a5a141713e4e38fa3c65193f3fd9` (`Implement browser push and email reminders`), before the completed Analytics and Export work in Tickets 011 and 012. Treat the completed Ticket 012 repo state as the deployment target.

Acceptance criteria:
- Use the Vercel plugin or Vercel CLI to confirm the existing `cadence` project is still connected to `emixd12/habit-tracking-app`; do not create a duplicate Vercel project.
- Confirm project settings for the Next.js app, including framework detection, repository root, Node runtime, build command, and production branch.
- Configure Vercel production and preview environment variables for the current app:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the supported legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SEQUENZY_API_KEY`
  - `SEQUENZY_REMINDER_TEMPLATE_SLUG`
  - `SEQUENZY_API_URL` only if the default needs an override
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `REMINDER_PROCESS_SECRET`
- Keep server-only secrets server-only; never expose service-role, Sequenzy, VAPID private, or reminder process secrets to browser code.
- Configure Supabase Auth for the production app URL, including the production `/auth/callback` redirect URL. Add preview callback URLs only if preview OAuth QA is intentionally supported.
- Add Vercel Cron configuration for due email reminder processing, or document a different scheduled trigger if Vercel Cron is not used.
- Verify `/api/reminders/process` is compatible with the scheduled trigger. If Vercel Cron is used, add the route method and tests needed for Vercel's scheduled request behavior while preserving the existing protected manual invocation path.
- Deploy the completed v1 code through Ticket 012 to production and confirm the latest Vercel deployment points at the expected Git commit.
- Smoke test the production app:
  - `/login`
  - `/timeline`
  - `/behaviors`
  - `/settings`
  - `/analytics`
  - `/export`
  - desktop viewport
  - narrow mobile viewport around 390px
- Run an authenticated production smoke test for Google login, behavior/timeline status marking, settings notification state, analytics render, and export download links.
- Verify reminder processing in production with a safe manual or scheduled run. Do not send real emails unless the user explicitly approves the recipient.
- Verify browser push subscription behavior with production `NEXT_PUBLIC_VAPID_PUBLIC_KEY` where browser permission allows it. Do not add PWA offline caching, route caching, background sync, or offline writes.
- Inspect Vercel deployment status/logs and record any runtime warnings or failures.
- Document the deployment workflow, canonical production URL, environment-variable ownership, and rollback path.
- Update `STATUS.md` with the production deployment URL, verification results, known risks, and any follow-up items.

Suggested files:
- `vercel.json`
- `docs/VERCEL_WORKFLOW.md`
- `docs/OPERATIONS.md`
- `.env.example`
- `.gitignore`
- `app/api/reminders/process/route.ts`
- `tests/reminder-process-route.test.ts`
- `STATUS.md`

---

## Deferred work

PWA caching, offline timeline access, local pending status changes, and sync conflict handling are not part of the v1 ticket sequence.

See `/docs/FUTURE_UPDATES.md`.
