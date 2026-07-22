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
npm run agents:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

If a command does not exist yet, add it or explicitly state why it does not exist.
For UI/design-system changes, also run `npm run design-system:check`.

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
- `completed_at` is set when status is `completed`
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

## Ticket 014: BehaviorLog import validation dry-run

Add a BehaviorLog import/validation pathway that can read a `.behaviorlog.zip`
bundle, validate it, and produce a safe import preview. This ticket must not
write imported data to the database.

Context:
- BehaviorLog export and internal `occurrence_status_events` history are already implemented.
- Hosted Supabase has migration `20260612075036_add_occurrence_status_events.sql`.
- Import work should preserve the distinction between occurrence current-status
  snapshots and append-only status-event history.

Acceptance criteria:
- Add a pure BehaviorLog import resolver that accepts parsed bundle files and returns a validation/import preview plan.
- Parse `.behaviorlog.zip` contents through a service or utility layer before passing structured records to the resolver.
- Validate required files:
  - `manifest.json`
  - `schema.json`
  - `README.md`
  - `AGENTS.md`
  - `data/behaviors.jsonl`
  - `data/schedules.jsonl`
  - `data/occurrences.jsonl`
  - `data/status_events.jsonl`
- Validate manifest SHA-256 hashes for every listed file.
- Validate supported schema version and required record types.
- Validate JSONL parsing errors with actionable row/file errors.
- Map BehaviorLog behavior, schedule, occurrence, status-event, and optional note records into an internal import plan.
- Detect likely conflicts against existing local behaviors, occurrences, and status events without mutating them.
- Preserve status semantics including `explicit_user_mark`, `explicit_user_correction`, imported source confidence, and `revises_event_id`.
- Treat `current_status` in `occurrences.jsonl` as a snapshot; status history comes from `status_events.jsonl`.
- Use `local_date` and IANA `timezone` for day grouping and conflict preview.
- Return a dry-run summary including counts, warnings, conflicts, unsupported fields, and records that would be created or skipped.
- Do not add destructive merge, restore, overwrite, delete, or deduplication writes in this ticket.
- Do not create a new primary navigation route unless product docs are explicitly updated first; a service-level dry-run or internal test harness is enough for this milestone.
- Resolver logic is tested with a small fixture bundle produced by the existing export resolver.

Suggested files:
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/services/behaviorlog-import.service.ts`
- `lib/services/zip.ts`
- `lib/types/behaviorlog-import.ts`
- `tests/behaviorlog-import.resolver.test.ts`
- `tests/fixtures/behaviorlog/*.jsonl`
- `docs/EXPORT_FORMATS.md`
- `docs/DATA_MODEL.md`
- `docs/AGENT_RESOLVERS.md`
- `STATUS.md`

---

## Ticket 015: BehaviorLog core conformance harness

Add a BehaviorLog core conformance harness that proves Cadence can produce and
read Level 1 core-compatible BehaviorLog bundles against the upstream
`emixd12/BehaviorLog-Bundle` draft specification. This ticket should tighten
validation and test infrastructure only. It must not add import writes,
merge/restore behavior, user-facing import UI, or optional profile expansion.

Context:
- BehaviorLog export exists and emits `.behaviorlog.zip` bundles.
- Ticket 014 added import validation dry-run logic.
- The upstream BehaviorLog Bundle draft defines required core files, hashable
  manifests, JSONL authority, app-neutral status vocabulary, append-only status
  events, local-date/timezone semantics, and conformance levels.
- The next alignment risk is drift between Cadence's generated bundles and the
  upstream reference validator/conformance expectations.

Acceptance criteria:
- Add a conformance test or harness that generates a Cadence BehaviorLog bundle
  from the existing export resolver and materializes it as a temporary
  `.behaviorlog/` directory.
- Run a local or vendored snapshot of the upstream BehaviorLog reference
  validator against the generated bundle during tests.
- Record the upstream source and exact commit or snapshot date used by the
  harness, so future agents can intentionally update it.
- Assert Cadence output passes core Level 1 checks for:
  - required files
  - manifest format and schema version
  - required file hashes
  - JSON and JSONL parseability
  - duplicate ID detection
  - behavior/schedule/occurrence/status-event references
  - `occurrence_state`
  - core status vocabulary
  - `current_status` as snapshot only
  - append-only status event history
  - `local_date` plus IANA `timezone`
  - app-specific fields only under `extensions`
- Tighten Cadence import validation to match upstream conformance where needed.
  In particular, unknown top-level fields in core records should be validation
  errors, not silently importable records.
- Preserve Ticket 014's dry-run boundary: the harness may validate and preview,
  but it must not insert, update, delete, merge, restore, overwrite, or
  deduplicate database rows.
- Do not add optional BehaviorLog Intervention, Context, Review, Analytics, CSV,
  PROV, RO-Crate, iCalendar, FHIR, or xAPI profile support in this ticket.
- Update `docs/EXPORT_FORMATS.md` and `docs/AGENT_RESOLVERS.md` if the
  conformance contract or import validation behavior changes.
- Update `STATUS.md` with verification results when the ticket is implemented.

Suggested files:
- `tests/behaviorlog-conformance.test.ts`
- `tests/fixtures/behaviorlog-reference/*`
- `scripts/behaviorlog-conformance.mjs`
- `lib/resolvers/export.resolver.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `tests/behaviorlog-import.resolver.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/AGENT_RESOLVERS.md`
- `STATUS.md`

---

## Ticket 016: BehaviorLog Level 2 CSV views

Add optional CSV migration views to Cadence's BehaviorLog bundle so the app can
advance from core Level 1 alignment toward the upstream
`emixd12/BehaviorLog-Bundle` Level 2 conformance target. JSONL remains the
authoritative data source; CSV files are compatibility views only.

Context:
- Ticket 015 added a pinned upstream reference validator snapshot and proves
  Cadence can produce and dry-run read a Level 1 core-compatible bundle.
- Cadence already has app-native occurrence CSV export, but the
  `.behaviorlog.zip` bundle does not yet include BehaviorLog CSV migration
  views.
- Upstream BehaviorLog conformance defines Level 2 as core plus CSV views.

Acceptance criteria:
- Generate optional CSV files inside the BehaviorLog bundle:
  - `csv/behaviors.csv`
  - `csv/schedules.csv`
  - `csv/occurrences.csv`
  - `csv/status_events.csv`
- Generate CSV rows from the same normalized BehaviorLog records used for the
  corresponding JSONL files.
- Preserve stable IDs in CSV columns so CSV rows can join back to JSONL records.
- Keep JSONL authoritative. Import validation may ignore CSV files or validate
  them as optional views, but it must not rely on CSV over JSONL.
- Add all emitted CSV files to `manifest.json` with:
  - `media_type: "text/csv"`
  - `required: false`
  - SHA-256 hashes
  - a clear schema reference or null when no core JSON Schema definition exists
- Ensure app-specific fields remain under `extensions` in JSONL; if extension
  data appears in CSV, encode it as a single JSON string column rather than
  expanding arbitrary producer fields into top-level CSV concepts.
- Preserve the Ticket 015 conformance harness. The upstream Level 1 validator
  should still pass when optional CSV files are present.
- Add tests that compare each CSV view against its authoritative JSONL source
  for record count and stable IDs.
- Add CSV escaping tests for commas, quotes, and newlines in BehaviorLog CSV
  views.
- Do not add import writes, merge/restore behavior, user-facing import UI,
  optional Intervention/Context/Review/Analytics profiles, PROV, RO-Crate,
  iCalendar, FHIR, or xAPI support in this ticket.
- Update `docs/EXPORT_FORMATS.md` and `docs/AGENT_RESOLVERS.md` if the
  BehaviorLog bundle contract changes.
- Update `STATUS.md` with verification results when the ticket is implemented.

Suggested files:
- `lib/resolvers/export.resolver.ts`
- `tests/export.resolver.test.ts`
- `tests/behaviorlog-conformance.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/AGENT_RESOLVERS.md`
- `STATUS.md`

---

## Ticket 017: BehaviorLog Intervention Profile export

Add export-only BehaviorLog Intervention Profile support for Cadence reminder
deliveries. This should map existing browser and email reminder-delivery records
into optional `data/interventions.jsonl` records inside the `.behaviorlog.zip`
bundle. This ticket must not add import writes, reminder behavior changes,
message-body export, user-facing import UI, or notification-provider side
effects.

Context:
- Ticket 015 proves Cadence can produce and dry-run read Level 1 core-compatible
  BehaviorLog bundles.
- Ticket 016 is planned to add optional Level 2 CSV migration views.
- Upstream BehaviorLog maps browser/email reminder delivery into the
  Intervention Profile and defines that profile as `data/interventions.jsonl`.
- Cadence already stores reminder delivery facts in `reminder_deliveries`,
  linked to occurrences.

Acceptance criteria:
- Export optional `data/interventions.jsonl` when the BehaviorLog bundle input
  includes reminder deliveries.
- Add emitted intervention files to `manifest.json` with:
  - `media_type: "application/jsonl"`
  - `required: false`
  - SHA-256 hashes
  - a schema reference for Intervention records when the local schema includes
    one, otherwise a documented null reference
- Map reminder deliveries without changing reminder processing behavior:
  - `occurrence_id` links to the exported occurrence
  - `behavior_id` links through the occurrence's behavior
  - channel distinguishes browser push from email
  - scheduled send time, sent time, delivery status, and failure reason are
    preserved when present
  - provider-specific or Cadence-specific values live under `extensions`
- Do not export email bodies, push payload bodies, API keys, provider secrets,
  raw endpoints, browser subscription keys, or other sensitive delivery
  transport details.
- Keep intervention records optional and profile-scoped; core JSONL remains
  valid without them.
- Preserve the Level 1 conformance harness. The pinned core validator should
  still pass when optional intervention records are present.
- Add tests that verify:
  - reminder deliveries are exported as interventions
  - intervention records reference existing behaviors and occurrences
  - pending, sent, failed, and cancelled delivery statuses are represented
  - sensitive transport details are not exported
  - `manifest.json` lists and hashes `data/interventions.jsonl`
- Add or update the BehaviorLog schema copy used in exported bundles so
  Intervention records are self-described.
- Do not add import handling for interventions beyond ignoring or warning about
  the optional profile if current import validation encounters it.
- Do not add Context, Review, Analytics, PROV, RO-Crate, iCalendar, FHIR, xAPI,
  or research-profile support in this ticket.
- Update `docs/EXPORT_FORMATS.md` and `docs/AGENT_RESOLVERS.md` if the
  BehaviorLog bundle contract changes.
- Update `STATUS.md` with verification results when the ticket is implemented.

Suggested files:
- `lib/types/export.ts`
- `lib/services/export.service.ts`
- `lib/resolvers/export.resolver.ts`
- `tests/export.resolver.test.ts`
- `tests/behaviorlog-conformance.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/AGENT_RESOLVERS.md`
- `STATUS.md`

---

## Ticket 018: BehaviorLog import persistence foundation

Add the database and service foundation needed for auditable, idempotent
BehaviorLog imports. This ticket should not import user data yet; it only
creates the local persistence primitives that later create/merge/write tickets
will use.

Context:
- Ticket 014 added BehaviorLog import validation dry-run.
- Ticket 015 added a pinned upstream core conformance harness.
- Ticket 016 added optional Level 2 CSV views.
- Ticket 017 added export-only Intervention Profile support.
- Upstream BehaviorLog reader guidance requires manifest-first validation,
  privacy awareness, JSONL authority over CSV, unresolved preservation, and
  clear explanation before destructive normalization.

Acceptance criteria:
- Add Supabase migrations for import tracking tables, likely:
  - `behaviorlog_import_runs`
  - `behaviorlog_import_record_mappings`
- `behaviorlog_import_runs` records user-owned import metadata:
  - bundle format and schema version
  - manifest SHA-256 or bundle fingerprint
  - producer name/version when present
  - subject id strategy/privacy redaction level when present
  - import mode
  - dry-run summary snapshot
  - status such as `previewed`, `applied`, `failed`, or `cancelled`
  - started/completed timestamps
- `behaviorlog_import_record_mappings` maps external BehaviorLog ids to local
  Cadence ids by record type and import run.
- Mapping rows support behavior, schedule, occurrence, status event, note, and
  intervention record types even if later tickets only write a subset.
- Add RLS policies for all new user-owned tables.
- Add repository/service helpers for creating import runs and mappings.
- Make mapping inserts idempotent for repeated import attempts from the same
  bundle/import run.
- Update `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`, and generated database
  types.
- Do not write imported behaviors, schedules, occurrences, status events, notes,
  or interventions in this ticket.
- Do not add destructive restore, overwrite, delete, or deduplication writes.
- Tests cover migration type shape or repository behavior where practical.

Suggested files:
- `supabase/migrations/*_add_behaviorlog_import_tracking.sql`
- `lib/db/behaviorLogImports.repo.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/types/behaviorlog-import.ts`
- `lib/db/database.types.ts`
- `tests/behaviorlog-import-write.service.test.ts`
- `docs/DATA_MODEL.md`
- `docs/EXPORT_FORMATS.md`
- `STATUS.md`

---

## Ticket 019: BehaviorLog create-only core import

Implement a create-only BehaviorLog core import write path. This ticket may
insert records that are clearly new, but it must not merge into existing local
records, overwrite local data, delete data, or rely on CSV over JSONL.

Context:
- Ticket 018 provides import run and record mapping persistence.
- BehaviorLog JSONL files remain authoritative over optional CSV views.
- `status_events.jsonl` is authoritative for status history;
  `occurrences.jsonl.current_status` is a convenience snapshot only.

Acceptance criteria:
- Add a service-level import apply path for mode `create_missing_only`.
- Require a valid dry-run preview before applying writes.
- Create missing behaviors from `data/behaviors.jsonl`.
- Create compatible schedule slots from `data/schedules.jsonl`.
- Create missing occurrences from `data/occurrences.jsonl`.
- Append imported status events from `data/status_events.jsonl` into
  `occurrence_status_events`.
- Update `occurrences.status`, `completed_at`, and `status_marked_at` only after
  appending imported status events and only according to the latest imported
  event for that occurrence.
- Preserve `unresolved` as `unresolved`; never convert silence into
  `not_completed`.
- If an occurrence snapshot is resolved but no supporting status event exists,
  skip status writes or create an import warning unless source confidence and
  status semantics safely support an imported explicit event.
- Store all external-to-local id mappings in
  `behaviorlog_import_record_mappings`.
- Preserve source/provenance fields that Cadence can represent directly, and
  record unmapped fields in preview warnings rather than silently dropping them.
- Unsupported recurrence profiles are skipped with actionable warnings.
- Imported schedules should stay within Cadence's supported recurrence and
  schedule-slot model.
- The write path is idempotent for repeated application of the same accepted
  create-only plan.
- Do not create merge behavior, overwrite behavior, restore behavior, user-facing
  import UI, intervention writes, Context/Profile writes, Analytics Profile
  writes, or CSV-only import.
- Resolver/service tests cover behavior, schedule, occurrence, status-event,
  mapping, idempotence, unresolved preservation, and unsupported recurrence
  handling.

Suggested files:
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/db/behaviorLogImports.repo.ts`
- `lib/db/behaviors.repo.ts`
- `lib/db/occurrences.repo.ts`
- `lib/db/occurrenceStatusEvents.repo.ts`
- `tests/behaviorlog-import-write.service.test.ts`
- `tests/behaviorlog-import.resolver.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/DATA_MODEL.md`
- `docs/AGENT_RESOLVERS.md`
- `STATUS.md`

---

## Ticket 020: BehaviorLog conflict-aware merge preview

Extend the dry-run import planner into a merge planner that can identify likely
matches and conflicts before any merge writes are allowed. This ticket should
produce a user-reviewable plan only; it must not mutate product data.

Context:
- Ticket 014 dry-run can validate bundles and detect basic likely conflicts.
- Ticket 019 creates only clearly new records.
- Upstream BehaviorLog reader guidance says receiving apps should explain
  destructive normalization before import.

Acceptance criteria:
- Add a merge-preview mode that compares imported records against local records.
- Compare behaviors by external mapping id, title/category identity, source
  original id, archive state, and compatible schedule shape.
- Compare schedules by behavior mapping, recurrence profile, recurrence payload,
  timezone, active dates, and schedule slot/window.
- Compare occurrences by mapped behavior/schedule plus `scheduled_for_utc`,
  `local_date`, and timezone.
- Compare status events by external event id, occurrence mapping, recorded time,
  status, semantics, and revision target.
- Produce deterministic actions such as:
  - `create_new`
  - `map_to_existing`
  - `skip_existing`
  - `conflict_requires_decision`
- Produce deterministic conflict codes and human-readable reasons.
- Preserve BehaviorLog semantics:
  - JSONL authority over CSV
  - `status_events.jsonl` authority over `current_status`
  - `unresolved` is not failure
  - append-only status-event history
- Include privacy profile and redaction-level summary in the preview output.
- Preview optional notes and interventions but do not write them.
- Save the accepted or generated merge preview to `behaviorlog_import_runs` only
  if this can be done without mutating product records.
- Do not insert, update, delete, merge, restore, overwrite, or deduplicate
  product records in this ticket.
- Tests cover each preview action, conflict reason stability, and status-event
  authority over occurrence snapshots.

Suggested files:
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/services/behaviorlog-import.service.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/types/behaviorlog-import.ts`
- `tests/behaviorlog-import.resolver.test.ts`
- `tests/behaviorlog-import-merge-preview.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/AGENT_RESOLVERS.md`
- `STATUS.md`

---

## Ticket 021: BehaviorLog user-approved merge write

Apply a previously generated, user-approved BehaviorLog merge plan. This ticket
may create or map records according to explicit plan decisions, but it must not
perform blind overwrite, destructive restore, deletion, or automatic conflict
resolution.

Context:
- Ticket 020 produces conflict-aware merge previews.
- Upstream BehaviorLog expects receiving apps to preserve source semantics and
  explain destructive normalization before import.
- Cadence stores status history append-only in `occurrence_status_events`.

Acceptance criteria:
- Add apply support for mode `merge_by_user_approved_plan`.
- Require an import run and accepted merge plan generated by Ticket 020.
- Refuse to apply plans with unresolved `conflict_requires_decision` actions.
- For `create_new`, insert records using the same safeguards as Ticket 019.
- For `map_to_existing`, create mapping rows without overwriting local behavior,
  schedule, or occurrence fields unless the plan explicitly allows a safe field
  fill such as setting an empty local note from an imported occurrence note.
- Append imported status events that are not already mapped or duplicated.
- Update occurrence current-status snapshots only after appending status events
  and only when the imported event is the latest effective/recorded event by the
  documented ordering rule.
- Do not downgrade or replace an existing local explicit high-confidence status
  event with an ambiguous or lower-confidence imported event.
- Preserve `revises_event_id` when both source and target events are mapped.
- Record every applied action and mapping in import tracking tables.
- Make applying the same accepted plan idempotent.
- Fail safely: a partial failure should leave an import run marked failed and
  should not silently continue with inconsistent mappings.
- Do not add blind overwrite, destructive restore, delete, intervention writes,
  Context/Profile writes, Analytics Profile writes, CSV-only import, or provider
  side effects.
- Tests cover accepted-plan enforcement, conflict refusal, append-only status
  history, snapshot update rules, idempotence, and lower-confidence event
  protection.

Suggested files:
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/db/behaviorLogImports.repo.ts`
- `lib/db/occurrenceStatusEvents.repo.ts`
- `lib/services/occurrence.service.ts`
- `tests/behaviorlog-import-merge-write.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/DATA_MODEL.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

---

## Ticket 022: BehaviorLog optional notes import

Add limited note import support after core create/merge behavior is safe. This
ticket should import only note shapes Cadence can represent without expanding
the product into a general notes system.

Context:
- BehaviorLog notes can attach to behavior, occurrence, status event, or review.
- Cadence currently supports notes on occurrences.
- Upstream privacy guidance treats notes as sensitive attributed context.

Acceptance criteria:
- Parse and preview `data/notes.jsonl` with privacy/sensitivity labels.
- Import occurrence-attached notes only when the target occurrence is created,
  mapped, or otherwise safely identified.
- If the local occurrence note is empty, allow the imported note body to fill it.
- If the local occurrence note is non-empty and differs, require an explicit
  merge-plan decision before changing it.
- Do not import behavior notes, status-event notes, review notes, or AI-generated
  notes into product data unless the data model and product docs are explicitly
  expanded.
- Preserve imported note source metadata in import mapping or import-run details
  where possible.
- Never treat notes as objective fact in analytics, status, or adherence logic.
- Do not add a generalized notes table unless this ticket updates
  `docs/DATA_MODEL.md` and the product docs accordingly.
- Do not import restricted/high-sensitivity notes without surfacing the privacy
  warning in the preview.
- Tests cover empty-note import, existing-note conflict, unsupported note target
  skip, sensitivity warnings, and no analytics/status side effects.

Suggested files:
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/db/occurrences.repo.ts`
- `tests/behaviorlog-import-notes.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/DATA_MODEL.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

---

## Ticket 023: BehaviorLog Intervention Profile import preview

Add import-preview support for optional BehaviorLog Intervention Profile
records. This ticket should validate and preview `data/interventions.jsonl`, but
it must not create active reminders, send notifications, call providers, or
write to `reminder_deliveries`.

Context:
- Ticket 017 exports Cadence reminder deliveries as optional BehaviorLog
  Intervention Profile records.
- Upstream BehaviorLog defines interventions as reminders, prompts,
  notifications, suppressions, snoozes, dismissals, delivery failures, and
  related burden signals.
- Cadence `reminder_deliveries` are operational delivery records, not passive
  imported history.

Acceptance criteria:
- Parse optional `data/interventions.jsonl` when present in a BehaviorLog bundle.
- Validate intervention JSONL parsing, supported record type, manifest hash,
  delivery status, channel, and references to behavior/occurrence records.
- Preview intervention counts by channel, delivery status, and linked behavior.
- Mark interventions as `preview_only` unless a later ticket adds passive
  imported intervention-history storage.
- Warn if intervention records contain message bodies, raw endpoints, provider
  secrets, subscription keys, recipient identifiers, or other sensitive
  transport data.
- Do not write interventions into `reminder_deliveries`.
- Do not schedule, cancel, or send reminders.
- Do not call Sequenzy, Web Push, browser APIs, provider SDKs, or notification
  processing routes.
- Do not add `csv/interventions.csv` unless a later ticket changes scope.
- Tests cover valid intervention preview, missing references, unsupported
  channel/status, sensitive-field warnings, and no import-write actions.

Suggested files:
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/types/behaviorlog-import.ts`
- `tests/behaviorlog-import-interventions.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/NOTIFICATION_SPEC.md`
- `docs/AGENT_RESOLVERS.md`
- `STATUS.md`

---

## Ticket 024: User-facing BehaviorLog import UI

Add a first-class import entry point so the user can upload a `.behaviorlog.zip`,
review validation output, inspect merge actions, and intentionally apply a safe
import plan.

Context:
- Tickets 018-023 added import persistence, preview, create-only apply,
  user-approved merge apply, limited note import, and intervention preview.
- The remaining gap is an end-user workflow that exposes those service paths
  without requiring direct service calls.

Acceptance criteria:
- Add an authenticated import screen or export/import screen section.
- Accept `.behaviorlog.zip` uploads and reject unsupported files with clear
  validation errors.
- Show dry-run summary counts, warnings, errors, conflicts, privacy notes,
  note sensitivity warnings, and intervention preview counts.
- Let the user choose create-only import only when the dry-run plan is valid and
  contains no unsafe merge decisions.
- Let the user review merge actions and approve only supported safe actions.
- Require explicit confirmation before any write operation.
- Persist import runs and show their status, mode, timestamps, and failure
  message when present.
- Do not add destructive overwrite, full restore, generalized notes, or
  intervention-to-reminder writes in this ticket.
- UI is sparse, mobile-responsive, and avoids product-sprawl language.
- Tests cover upload validation, invalid bundle display, dry-run summary
  rendering, apply gating, and no accidental writes from preview.

Suggested files:
- `app/(app)/export/page.tsx`
- `app/(app)/export/actions.ts`
- `components/export/*`
- `lib/services/behaviorlog-import.service.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `tests/behaviorlog-import-ui.test.ts`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/ROUTE_MAP.md`
- `STATUS.md`

---

## Ticket 025A: BehaviorLog restore preview

Add a restore-preview-only mode for users who want to understand what a trusted
BehaviorLog backup would do before any destructive restore is allowed. This
ticket must not mutate product records.

Context:
- Current import modes are create-only and user-approved merge.
- Existing merge preview is non-destructive and intentionally avoids
  overwrite/delete decisions.
- Full restore is materially more dangerous than merge because it can archive,
  replace, or delete local records.
- BehaviorLog is a behavior-data portability bundle, not a complete account
  image. Restore preview must be clear about what is and is not restorable.
- Current import apply services are multi-call Supabase workflows. Destructive
  apply is deferred to Ticket 025B and needs a stronger partial-failure plan.

Acceptance criteria:
- Add a separate restore preview resolver; do not reuse merge preview for
  destructive decisions.
- Add a restore-preview import mode to the import-run ledger, such as
  `restore_preview`, using a Supabase migration and generated database types if
  the preview is persisted.
- The resolver accepts parsed BehaviorLog bundle files plus the full current
  user-owned local graph needed for comparison.
- The preview shows exactly which local records would be created, replaced,
  archived, deleted, kept, or skipped for:
  - behaviors
  - behavior schedule slots
  - occurrences
  - occurrence status events
  - inline occurrence notes
  - passive imported note records
  - passive imported intervention-history records
- The preview distinguishes destructive actions from non-destructive actions in
  machine-readable output suitable for UI review.
- The preview states that profile data, auth identity, browser push
  subscriptions, browser permissions, provider accounts, and external provider
  state are not restored from BehaviorLog.
- Preserve BehaviorLog semantics:
  - `status_events.jsonl` is authoritative for status history.
  - `occurrences.jsonl.current_status` is a snapshot only.
  - `unresolved` is never converted into `not_completed`.
  - CSV files are optional views and do not drive restore decisions.
- Include explicit status-history policy planning:
  - default `preserve_append_only_history`
  - optional future `replace_status_history` only as a previewed decision, not
    an apply behavior in this ticket.
- Include privacy and sensitivity warnings for high/restricted imported notes
  and redacted intervention fields.
- Detect stale or unsupported restore inputs, including unsupported schema
  version, unsupported recurrence/schedule shapes, missing references, unknown
  core top-level fields, and current local records that cannot be safely mapped.
- Return a stable preview fingerprint that Ticket 025B can require before
  destructive apply.
- Do not create, update, archive, delete, restore, overwrite, deduplicate, send
  reminders, create reminder deliveries, call Sequenzy, call Web Push, or call
  notification-processing routes in this ticket.
- Update docs so the restore preview contract is distinct from create-only and
  merge import.
- Tests cover preview action classification, destructive count reporting,
  non-restorable account/provider fields, unresolved preservation,
  status-history policy planning, sensitivity warnings, unsupported records, and
  preview fingerprint stability.

Suggested files:
- `lib/resolvers/behaviorlog-restore.resolver.ts`
- `lib/services/behaviorlog-restore.service.ts`
- `lib/types/behaviorlog-restore.ts`
- `lib/db/behaviorLogImports.repo.ts`
- `lib/db/database.types.ts`
- `supabase/migrations/*_add_behaviorlog_restore_preview_mode.sql`
- `tests/behaviorlog-restore.resolver.test.ts`
- `tests/behaviorlog-restore.service.test.ts`
- `docs/DATA_MODEL.md`
- `docs/EXPORT_FORMATS.md`
- `docs/AGENT_RESOLVERS.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

Verification:
- Run focused restore resolver/service tests first.
- Run `npm run supabase -- db reset` and regenerate database types if a
  migration is added.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.

---

## Ticket 025B: BehaviorLog restore apply and UI

Add the destructive restore apply path and user-facing review flow after Ticket
025A restore preview is implemented and verified. This ticket may archive,
replace, or delete local user-owned product records, but it must never perform
silent or hidden destructive writes.

Context:
- Ticket 025A must provide a stable restore preview, destructive action list,
  and preview fingerprint.
- Restore apply is higher risk than create-only or merge apply because partial
  failure can leave a user's tracker in a mixed state.
- Current create-only and merge apply paths are multi-call Supabase workflows.
  Do not blindly copy that approach for destructive restore without addressing
  atomicity or resumability.

Acceptance criteria:
- Add a restore apply mode to the import-run ledger, such as `restore_apply`,
  using a Supabase migration and generated database types if it was not added in
  Ticket 025A.
- Require:
  - a valid Ticket 025A restore preview,
  - an accepted preview snapshot stored on the import run,
  - a matching preview fingerprint at apply time,
  - explicit typed confirmation,
  - explicit acknowledgement that the user downloaded or created a fresh backup,
  - explicit acknowledgement for high/restricted imported notes when present.
- Refuse apply when the local data fingerprint no longer matches the accepted
  preview or when unsupported/conflict actions remain unresolved.
- Preserve Supabase RLS and user ownership for every restored row.
- Prefer a transaction-safe or resumable restore strategy. If implementation
  uses multiple Supabase client calls, the service must make partial failure
  visible, mark the import run failed, and be safe to retry without duplicate or
  contradictory rows.
- Preserve append-only status history by default. Only replace status history
  when the accepted preview explicitly selected full status-history replacement.
- Apply restore decisions in dependency order so referential integrity is
  preserved across behaviors, schedule slots, occurrences, status events,
  reminder deliveries, imported notes, and imported interventions.
- Cancel or remove operational reminder deliveries only according to the
  accepted restore plan. Do not call Sequenzy, Web Push, browser APIs, provider
  SDKs, or notification-processing routes during restore.
- Recreate only data represented by the accepted BehaviorLog restore contract.
  Do not claim to restore auth identity, profile email, browser permissions,
  push subscriptions, provider accounts, provider secrets, or external provider
  state.
- Make applying the same accepted restore run idempotent.
- Failed restore attempts must mark the import run `failed` and surface partial
  work clearly in the UI.
- Add a sparse authenticated UI, likely on the Export screen, that:
  - uploads or reuses a `.behaviorlog.zip`,
  - shows the Ticket 025A restore preview,
  - highlights destructive actions,
  - forces backup acknowledgement,
  - forces typed confirmation,
  - shows apply result or failure details,
  - remains mobile-responsive.
- Do not add admin dashboards, collaboration, social features, billing,
  offline/PWA writes, provider sends, or support tooling.
- Tests cover typed confirmation, backup acknowledgement, stale-preview refusal,
  destructive-action refusal without confirmation, replacement/archive/delete
  semantics, status-history preservation and explicit replacement, reminder
  side-effect prevention, idempotence, partial-failure reporting, RLS ownership,
  and UI gating.

Suggested files:
- `lib/services/behaviorlog-restore.service.ts`
- `lib/db/behaviorLogImports.repo.ts`
- `lib/db/behaviors.repo.ts`
- `lib/db/occurrences.repo.ts`
- `lib/db/occurrenceStatusEvents.repo.ts`
- `lib/db/notes.repo.ts`
- `lib/db/importedInterventions.repo.ts`
- `lib/db/reminderDeliveries.repo.ts`
- `components/export/*`
- `app/(app)/export/actions.ts`
- `tests/behaviorlog-restore.service.test.ts`
- `tests/behaviorlog-restore-ui.test.tsx`
- `docs/DATA_MODEL.md`
- `docs/EXPORT_FORMATS.md`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/ROUTE_MAP.md`
- `STATUS.md`

Verification:
- Run focused restore service/UI tests first.
- Run `npm run supabase -- db reset` and regenerate database types if a
  migration is added.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- For UI work, run `npm run design-system:check` when reusable UI or design
  inventory changes, then browser-check `/export` at desktop and around 390px.
  Do not apply a destructive restore against the user's real account during QA.

---

## Ticket 026: General BehaviorLog notes data model and import

Expand Cadence from occurrence-only notes to a small general imported-note model
that can represent BehaviorLog notes attached to behaviors, occurrences, status
events, and reviews.

Context:
- Ticket 022 intentionally imports only occurrence-attached notes into
  `occurrences.note`.
- BehaviorLog supports richer note attachments.
- Notes remain sensitive attributed context and must not become objective
  analytics facts.

Acceptance criteria:
- Update product docs before schema work to define which note attachment types
  Cadence will display and how.
- Add a user-owned notes table or equivalent schema that can store imported
  behavior, occurrence, status-event, and review notes.
- Preserve note role, sensitivity, source metadata, source original id, created
  and updated timestamps, and attachment target.
- Do not feed imported notes into adherence, status, reminder, or analytics
  calculations unless a later ticket explicitly changes that.
- Update import preview to distinguish inline occurrence-note fills from general
  imported note records.
- Add UI surfaces only where they are useful and sparse.
- Require privacy warnings before importing high or restricted sensitivity
  notes.
- Tests cover each supported attachment type, unsupported/AI-generated handling,
  sensitivity warnings, RLS ownership, and no analytics/status side effects.

Suggested files:
- `supabase/migrations/*_add_imported_notes.sql`
- `lib/db/notes.repo.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `components/timeline/*`
- `components/behaviors/*`
- `tests/behaviorlog-import-general-notes.test.ts`
- `docs/DATA_MODEL.md`
- `docs/PRODUCT_SPEC.md`
- `docs/UI_SPEC.md`
- `STATUS.md`

---

## Ticket 027: Imported intervention history storage

Add passive storage for imported BehaviorLog Intervention Profile records so
Cadence can retain historical reminder/prompt delivery context without turning
those imported rows into active reminders.

Context:
- Ticket 023 previews interventions but does not store them.
- Cadence `reminder_deliveries` are operational delivery records.
- Imported intervention history should be passive provenance unless a later
  ticket explicitly promotes selected records into operational reminders.

Acceptance criteria:
- Add a user-owned imported intervention history table or equivalent passive
  storage model.
- Store BehaviorLog intervention id, behavior/occurrence mappings, intervention
  type, channel, delivery status, scheduled/sent timestamps, failure reason,
  source metadata, and redacted sensitivity indicators.
- Do not store raw provider secrets, raw push endpoints, subscription keys,
  recipient identifiers, or message bodies unless product/privacy docs are
  explicitly expanded.
- Import preview must show what will be stored and what sensitive fields will be
  dropped or redacted.
- Applying the same accepted import run must be idempotent.
- Stored intervention history must not schedule, send, cancel, retry, or claim
  reminders.
- Tests cover storage, redaction/drop behavior, idempotence, RLS ownership, and
  no writes to `reminder_deliveries`.

Suggested files:
- `supabase/migrations/*_add_imported_intervention_history.sql`
- `lib/db/importedInterventions.repo.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `tests/behaviorlog-import-intervention-history.test.ts`
- `docs/DATA_MODEL.md`
- `docs/NOTIFICATION_SPEC.md`
- `docs/EXPORT_FORMATS.md`
- `STATUS.md`

---

## Ticket 028: Promote imported interventions into reminder deliveries

Add an explicit opt-in flow to convert selected imported intervention records
into operational `reminder_deliveries` rows.

Context:
- This is intentionally separate from import preview and passive intervention
  history.
- Writing to `reminder_deliveries` can create active operational work, so it
  must be narrowly scoped and user-approved.

Acceptance criteria:
- Only eligible future pending reminder interventions can be promoted.
- Sent, failed, cancelled, dismissed, historical, or ambiguous intervention
  records remain passive history and must not become operational deliveries.
- Require explicit user selection and confirmation for every promoted group.
- Create `reminder_deliveries` idempotently and avoid duplicate sends.
- Do not call Sequenzy, Web Push, browser APIs, provider SDKs, or notification
  processing routes during promotion.
- Normal reminder processing may later send promoted pending deliveries only if
  they remain due, valid, unresolved, and consistent with current behavior
  reminder settings.
- Preserve provenance linking the reminder delivery back to the imported
  intervention record/import run.
- Tests cover eligibility filtering, explicit confirmation, duplicate
  prevention, provenance, no provider calls, and no promotion for historical or
  resolved occurrences.

Suggested files:
- `lib/resolvers/imported-intervention-promotion.resolver.ts`
- `lib/services/imported-intervention-promotion.service.ts`
- `lib/db/reminderDeliveries.repo.ts`
- `lib/db/importedInterventions.repo.ts`
- `tests/imported-intervention-promotion.test.ts`
- `docs/NOTIFICATION_SPEC.md`
- `docs/DATA_MODEL.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

---

## Ticket 029: Public web hardening account safety baseline

Harden the current authenticated web app with the first public-launch account
safety baseline.

Acceptance criteria:
- Keep Google-only login for launch.
- Add a durable RLS policy registry test for user-owned tables.
- Add practical abuse controls to sensitive current endpoints.
- Bound reminder-process batch limits.
- Validate malformed occurrence mutation ids before repository lookup.
- Add Settings-based account deletion with export acknowledgement and typed
  confirmation.
- Keep account deletion server-only with Supabase service-role access and
  database cascades.
- Add public Terms, Privacy, and Trust routes linked from Login and Settings.
- Preserve export/account portability before deletion.
- Preserve the small tracker scope and avoid collaboration/social features.

Suggested docs:
- `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_MODEL.md`
- `docs/USER_FLOWS.md`
- `docs/NOTIFICATION_SPEC.md`
- `docs/VERCEL_WORKFLOW.md`
- `STATUS.md`

Out of scope for this baseline:
- Ticket 025A/025B restore preview and restore apply/UI work.
- Marketing site or workspace restructuring.
- Billing, AI, desktop/mobile, PWA/offline, or admin/support surfaces.
- Full first-run onboarding and monitoring/error-reporting integration, which
  remain public-launch follow-up work.

---

## Ticket 030: Public web hardening follow-up

Complete the remaining public-launch hardening items after Ticket 029:

- Add minimal first-run onboarding:
  - create first behavior,
  - notification permission,
  - import entry when import exists.
- Add basic monitoring/error reporting without sensitive behavior payloads.
- Add hosted many-independent-user RLS smoke QA beyond the static policy
  registry test.

Acceptance criteria:
- Keep onboarding thin, optional, and routed into existing Behaviors, Settings,
  and Export controls rather than a separate setup wizard.
- Do not request notification permission on page load.
- Treat import as optional and non-blocking.
- Keep monitoring provider-free unless separately scoped; structured runtime
  logs must avoid behavior titles, notes, descriptions, email addresses, push
  endpoints, keys, secrets, tokens, request bodies, and uploaded payloads.
- Add a repeatable RLS smoke command that uses two ordinary authenticated
  Supabase sessions for data access and proves one user cannot read, insert, or
  update another user's rows.
- Use service-role credentials only for smoke-test user setup and cleanup.

Suggested docs:
- `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`
- `docs/PRODUCT_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/UI_SPEC.md`
- `docs/DATA_MODEL.md`
- `docs/OPERATIONS.md`
- `docs/VERCEL_WORKFLOW.md`
- `STATUS.md`

---

## Ticket 031: Astro marketing site

Add a simple public marketing site for Cadence and the BehaviorLog Bundle
standard.

Acceptance criteria:
- Implement as Astro, not inside the authenticated app shell.
- Support launch routes:
  - `/`
  - `/cadence`
  - `/standard`
  - `/docs`
  - `/examples`
  - `/about`
- Homepage leads with Cadence as the product and site brand.
- BehaviorLog is presented as the open bundle standard and portability layer
  behind Cadence exports and imports.
- Use the existing Cadence square ledger visual system and keep the current
  Cadence mark.
- Use only the Cadence mark and name in the marketing header.
- Use real Cadence product screenshots or static captures where possible,
  using demo or sanitized data only.
- `/docs` is agent-first technical documentation, useful to agents first and
  humans second.
- `/about` covers philosophy, governance, scope boundaries, and open-source
  posture for launch.
- Include primary CTAs:
  - Try Cadence
  - Read BehaviorLog
  - Download Example Bundle
  - View on GitHub
  - Log in
- Use SEO-conscious static pages with metadata, canonical URLs, sitemap/robots,
  accessible headings, and fast rendering.
- Include Open Graph and Twitter metadata.
- Keep primary content available in raw static HTML.
- Do not add marketing cookies or analytics.
- Share Cadence design tokens or token outputs where practical.
- Do not tease desktop/mobile apps before they are real or intentionally
  announced.
- Preserve existing authenticated Next.js app behavior unless a minimal
  npm-workspace adjustment is required.
- Update route, public-product architecture, design, status, and ticket docs.

Suggested files:
- `apps/marketing/*`
- `packages/ui/*` if tokens/primitives are extracted
- `docs/ROUTE_MAP.md`
- `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`
- `docs/CRAWL_POLICY.md`
- `DESIGN.md`
- `STATUS.md`

---

## Ticket 032: Needs Decision same-day correction retention

Keep prior-day occurrences that were just decided from the Needs Decision modal
visible in that same modal for the rest of the current local day, using the same
row behavior and visual treatment as the Timeline.

Context:
- The current Timeline service reads prior unresolved occurrences and
  current/future occurrences. When a prior unresolved occurrence is marked
  Completed or Not Completed from the Needs Decision modal, it no longer
  qualifies for the modal after refresh.
- The existing occurrence status service can already change an owned occurrence
  by id and writes `explicit_user_correction` status events when a resolved
  occurrence is changed later.
- The user need is immediate correction for accidental Needs Decision taps,
  without turning Needs Decision into a general past-history browser.
- Interpret "lasts for a day" as "visible through the current local day until
  the next local midnight" in the user's timezone, matching the app day-boundary
  model.

Acceptance criteria:
- Needs Decision remains opened from the existing floating Timeline button.
  Do not add a new route, past Timeline sections, dashboard, or history page.
- Recently decided prior-day rows stay in their original prior local-day group
  in the modal. Do not create a separate `Decided just now`, `Recently decided`,
  or similar section.
- A prior unresolved occurrence marked from Needs Decision remains visible in the
  modal when its `status_marked_at` falls on the current local date in the
  user's timezone.
- Retained rows stop appearing in Needs Decision after the next local midnight
  without writing a separate stored flag, status, or audit marker.
- Completed retained rows use the same full blue Completed row treatment as
  Timeline completed rows. Collapsed primary status actions stay hidden, and
  expanding the row exposes Change status plus Note editing.
- Not Completed retained rows use the same Timeline Not Completed behavior:
  they return to the ordinary row treatment and continue exposing Completed and
  Not Completed actions in the collapsed row.
- Notes remain editable while a retained row is visible.
- The Needs Decision count continues to count only prior unresolved occurrences,
  not retained resolved rows. The button can still open when the count is zero
  if retained rows exist.
- The modal empty state appears only when there are no prior unresolved rows and
  no retained same-day decided rows.
- Preserve the existing completion chime behavior: a successful change into
  Completed may chime once, and refresh/revalidation must not unmount the row
  before that feedback can run.
- Do not add a stored `missed` status, automatic status changes, bulk edit,
  confirmation step before a correction, or offline pending mutation behavior.
- Keep date-boundary and row-visibility planning in resolvers/services. UI
  components must not implement local-day retention logic directly.
- Update `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and any relevant tests/docs so
  the intended modal behavior is explicit.

Suggested files:
- `lib/resolvers/timeline.resolver.ts`
- `lib/services/timeline.service.ts`
- `lib/types/timeline.ts`
- `components/timeline/Timeline.tsx`
- `components/timeline/NeedsDecisionDialog.tsx`
- `components/timeline/OccurrenceRow.tsx`
- `components/timeline/StatusButtons.tsx`
- `app/(app)/timeline/actions.ts`
- `tests/timeline.resolver.test.ts`
- `tests/completion-feedback.test.ts`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

Verification:
- Run focused Timeline resolver/component tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- For UI changes, run `npm run design-system:check` if reusable UI or design
  inventory changes, then browser-check `/timeline` at desktop and around 390px.

---

## Ticket 033: Analytics selected-day occurrence correction

Add a later correction path for submitted occurrence decisions from the
Analytics calendar, using selected calendar dates to review and correct
individual occurrences.

Context:
- Ticket 032 handles immediate accidental taps from the Needs Decision modal for
  the current local day only.
- After that same-day retention expires, the app still needs a deliberate path
  to correct past submitted occurrence decisions.
- The Timeline should stay forward-looking and should not become a past-history
  browser.
- Analytics already has calendar date selection and selected-day inspection, but
  the current selected-day panel is read-only and only lists Not Completed
  occurrences.
- This surface should have enough information scent to be discoverable, without
  making historical edits feel like the primary logging flow.

Acceptance criteria:
- Keep the route as `/analytics`; do not add `/history`, `/dashboard`, or a new
  primary navigation item.
- Selecting a calendar date shows a sparse `Review selected day` panel when that
  date has occurrences in the active Analytics range.
- The selected-day panel lists all occurrences for the selected date, not only
  Not Completed occurrences.
- Each listed occurrence shows scheduled time, behavior title, category, current
  status, and note state using the established occurrence-row vocabulary.
- The user can change a submitted occurrence decision from Completed to Not
  Completed or from Not Completed to Completed.
- Unresolved occurrences in the selected-day panel can be marked Completed or
  Not Completed, but Needs Decision remains the stronger prompt for prior-day
  unresolved items.
- The user can add or edit the occurrence note from the selected-day panel.
- Corrections reuse the existing occurrence status service and status resolver
  so status events continue to record `explicit_user_correction` when a resolved
  status changes.
- Analytics counts, adherence, heatmaps, and selected-day rows refresh after a
  correction.
- The panel should provide clear information scent, for example by naming the
  area `Review selected day` and adding concise calendar helper text such as
  `Select a day to review its occurrences`.
- Do not rely on onboarding copy as the only way to teach this correction path.
- Keep historical correction deliberate: no bulk edit, no all-time search, no
  automatic correction suggestions, no AI coaching, and no gamified language.
- Do not change the default Analytics range behavior unless required for the
  selected-day review.
- No schema migration should be necessary unless implementation discovers a
  missing persisted field. If schema changes become necessary, follow the
  Supabase migration/data-model/type-generation rules.
- Update `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and resolver docs if the
  selected-day data contract changes.

Suggested files:
- `lib/resolvers/analytics.resolver.ts`
- `lib/services/analytics.service.ts`
- `lib/types/analytics.ts`
- `components/analytics/AnalyticsScreen.tsx`
- `components/timeline/OccurrenceRow.tsx` or a shared occurrence-row component
  if reuse is cleaner than duplicating row behavior
- `components/timeline/StatusButtons.tsx` or a shared status-action component
- `components/timeline/OccurrenceNoteForm.tsx` or a shared note form component
- `app/(app)/analytics/actions.ts`
- `app/(app)/analytics/page.tsx`
- `tests/analytics.resolver.test.ts`
- Analytics UI/component tests if added
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/AGENT_RESOLVERS.md` if resolver contracts change
- `STATUS.md`

Verification:
- Run focused Analytics resolver/UI tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- For UI changes, run `npm run design-system:check` if reusable UI or design
  inventory changes, then browser-check `/analytics` at desktop and around
  390px.

---

## Ticket 034: Multi-account Supabase launch readiness sign-off

Close the remaining readiness gates before inviting additional public accounts
onto the hosted Cadence web app.

Context:
- The app and database are already designed for many independent single-player
  accounts, with user-owned rows scoped by Supabase Auth and RLS.
- The remaining work is sign-off work, not a new product surface: verify hosted
  isolation, confirm hosted auth/account settings, and fix any readiness defects
  found by that verification.
- A prior readiness review found one restore-apply migration defect to address:
  `public.apply_behaviorlog_restore` attempts to upsert `behaviors` with
  `on conflict (import_run_id, external_id)`, but those columns do not exist on
  `behaviors`.
- Hosted Supabase commands and smoke checks are mutating operations. Run them
  only after the target project is explicit and the user authorizes the hosted
  verification/deployment step.

Implementation strategy:
1. Reconfirm the target hosted Supabase project and deployment domain.
2. Review current Supabase changelog/docs for Auth redirect settings, RLS,
   security-definer functions, and CLI commands relevant to the work.
3. Fix the restore-apply database defect locally with a new migration:
   - create the migration through `npm run supabase -- migration new ...`;
   - correct the invalid `behaviors` upsert conflict target while preserving
     per-user ownership checks;
   - review `public.apply_behaviorlog_restore` as a privileged function,
     including explicit execute grants/revokes so it is callable only by the
     intended role;
   - add or update tests that would fail if the invalid conflict target or
     unsafe function permissions return.
4. Verify local database rebuild and schema safety:
   - run `npm run supabase -- db reset`;
   - run Supabase advisors if the installed CLI supports them, or document the
     fallback if not;
   - regenerate database types if the effective schema changes;
   - run focused restore/RLS tests before the full verification suite.
5. Check hosted schema congruence before changing hosted state:
   - run `npm run supabase -- migration list` against the authorized project;
   - stop and document drift if hosted history does not match git;
   - push migrations with `npm run supabase -- db push` only after explicit
     user authorization.
6. Run hosted many-user RLS smoke QA:
   - point `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` at the
     authorized hosted project;
   - run `npm run smoke:rls`;
   - record only sanitized pass/fail counts in `STATUS.md`, never keys,
     temporary emails, user ids, or auth responses.
7. Audit hosted Auth/account settings for launch:
   - Google provider enabled and tested;
   - canonical production callback URL allow-listed at `/auth/callback`;
   - localhost callback URLs retained only where appropriate for development;
   - public signup intentionally enabled for Google accounts;
   - anonymous sign-ins disabled;
   - email/password signup either disabled for hosted public launch or
     explicitly justified as non-user-facing operational/test support;
   - provider-level abuse protections, captcha/bot protection, and rate limits
     reviewed against current Supabase capabilities;
   - service-role, Sequenzy, VAPID, and cron/process secrets accounted for in
     hosted environment ownership without printing secret values.
8. Perform a minimal production account smoke:
   - sign in with Google on the canonical production domain;
   - verify profile/default categories are created;
   - create a behavior and confirm Timeline generation works;
   - verify Export and account deletion remain available.

Acceptance criteria:
- The restore-apply migration defect is fixed by a git-tracked migration, not a
  hosted dashboard edit.
- Any `SECURITY DEFINER` restore function remains scoped to the authenticated
  user and has explicit execute permissions that do not expose it to anonymous
  callers.
- Local migrations rebuild cleanly from scratch.
- Static RLS policy tests cover every user-owned public table.
- Hosted migration history is checked and documented before any hosted push.
- Hosted `npm run smoke:rls` passes against the intended project after any
  required migration deployment.
- Hosted Auth/provider/account settings are audited and recorded without
  secrets.
- Minimal production Google sign-in and first-account data creation pass.
- `STATUS.md` records exact commands run, whether they targeted local or
  hosted Supabase, and any remaining launch risk.
- No collaboration, shared workspaces, social features, billing, admin
  dashboards, offline/PWA behavior, AI coaching, or desktop/mobile work is
  added.

Suggested files:
- `supabase/migrations/*`
- `lib/db/database.types.ts` if generated types change
- `tests/rls-policy-registry.test.ts`
- `tests/behaviorlog-restore-apply.service.test.ts`
- a focused migration/static test for restore RPC safety if useful
- `docs/OPERATIONS.md`
- `docs/SUPABASE_WORKFLOW.md` if the hosted readiness checklist changes
- `STATUS.md`

Verification:
- Run focused restore/RLS tests first.
- Run `npm run supabase -- db reset` locally after migration changes.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Run hosted `npm run smoke:rls` only after target-project authorization.
- If hosted migrations are pushed, run a post-push hosted smoke pass and record
  the sanitized result in `STATUS.md`.

---

## Ticket 035: Performance server timing instrumentation

Add privacy-safe timing evidence for authenticated app route loads before
making larger performance architecture changes.

Context:
- `docs/PERFORMANCE_SPEED_LOG.md` shows the current local production-build
  medians after Batch 3 are still too slow for a small app:
  - `/timeline`: about 2107ms
  - `/analytics`: about 1915ms
  - `/export`: about 2206ms
  - Timeline -> Behaviors client navigation: about 748ms
  - Settings -> Timeline client navigation: about 1489ms
- The same log found scripting, style, and layout work are near zero on warm
  loads; route time is dominated by server/data work.
- The current strongest hypothesis is that read routes are blocked by auth,
  Supabase REST round trips, occurrence sync, reminder planning, and repeated
  repository reads.
- This ticket is evidence-gathering only. It should not rewrite route data
  ownership, database schema, auth strategy, or occurrence generation.

Acceptance criteria:
- Add a small server timing utility that can measure named spans without
  logging behavior titles, notes, emails, UUIDs, cookies, tokens, provider
  responses, or other sensitive user data.
- Instrument at least:
  - protected app layout auth/user lookup
  - `/timeline` page bundle load
  - `/behaviors` page data load
  - `/analytics` page data load
  - `/export` page data load
  - `syncUserOccurrences`
  - major occurrence-sync phases: behavior list reuse, existing occurrence
    reads, schedule-slot resolution, generation planning, occurrence writes,
    reminder planning/writes
  - primary repository calls used by Timeline, Behaviors, Analytics, and Export
- Keep instrumentation server-only and disabled or low-noise by default. Use an
  explicit environment flag such as `CADENCE_PERF_LOG=1` for detailed local and
  production sampling.
- Emit structured logs that include route/span name, duration, status, and
  aggregate counts only. Counts may include number of behaviors, occurrences,
  created/deleted/updated rows, and reminders planned.
- Add or update a repeatable measurement harness if needed so local and
  authenticated production route timings can be captured consistently.
- Record before/after timings and the slowest server spans in
  `docs/PERFORMANCE_SPEED_LOG.md`.
- Do not add user-facing UI in this ticket.
- Do not add database indexes, RPCs, caching, background jobs, or auth-strategy
  changes in this ticket.
- Update `STATUS.md` with current ticket state and verification results.

Suggested files:
- `lib/services/performance-timing.ts`
- `lib/services/timeline.service.ts`
- `lib/services/behavior.service.ts`
- `lib/services/analytics.service.ts`
- `lib/services/export.service.ts`
- `lib/services/occurrence.service.ts`
- `lib/db/*.repo.ts` where lightweight timing wrappers are useful
- `scripts/performance-route-harness.mjs` if a durable harness is added
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`

Verification:
- Run focused tests for any touched services.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Run at least one local production-build measurement pass with
  `CADENCE_PERF_LOG=1`.
- If production timing is sampled, record sanitized results only.

---

## Ticket 036: App route loading boundaries and navigation response

Make route switches feel immediate while deeper server work is being reduced.
This is a user-perceived speed improvement, not a substitute for reducing the
actual server time in later tickets.

Context:
- The app currently has no `loading.tsx` route boundaries under the
  authenticated app routes.
- Next.js App Router dynamic routes can wait on the server response before the
  new page appears. Official Next.js guidance recommends loading boundaries and
  streaming for dynamic routes so shared layouts stay interactive and the
  fallback can be prefetched.
- User feedback specifically calls out page switching, such as Timeline to
  Behaviors, as feeling too slow.
- Keep the interface sparse and consistent with Cadence's existing app shell.

Acceptance criteria:
- Add route-level loading UI for the authenticated app routes, using a shared
  sparse skeleton that matches the current screen frames.
- At minimum cover:
  - `/timeline`
  - `/behaviors`
  - `/analytics`
  - `/export`
  - `/settings`
- Keep the app shell and navigation interactive during route transitions.
- Avoid spinners-only loading if a stable skeleton better preserves layout.
- Ensure loading UI does not introduce layout shift, oversized marketing-style
  placeholders, or dense dashboard treatment.
- Confirm nav links still use Next `Link` and do not disable default prefetch
  behavior unless evidence requires it.
- If needed, split slow page sections behind local `Suspense` boundaries so the
  first usable route frame appears before all route data is ready. Do not move
  resolver or database logic into client components.
- Do not change stored data, resolver behavior, occurrence generation, reminder
  delivery, or auth semantics.
- Update `DESIGN.md` or design-system files only if reusable UI inventory or
  design contracts change.
- Update `docs/PERFORMANCE_SPEED_LOG.md` with click-to-loading and
  click-to-target timings.
- Update `STATUS.md` with verification results.

Suggested files:
- `app/(app)/loading.tsx`
- route-specific `app/(app)/*/loading.tsx` files if one shared loading boundary
  is too generic
- `components/layout/ScreenLoading.tsx` or equivalent shared component
- `components/layout/AppShell.tsx` if navigation pending state is added
- `docs/PERFORMANCE_SPEED_LOG.md`
- `DESIGN.md` if reusable UI guidance changes
- `STATUS.md`

Verification:
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- For UI changes, run `npm run design-system:check` if reusable UI or design
  inventory changes.
- Browser-check `/timeline`, `/behaviors`, `/analytics`, `/export`, and
  `/settings` at desktop and around 390px.
- Measure at least:
  - Timeline -> Behaviors click-to-loading
  - Timeline -> Behaviors click-to-target
  - Settings -> Timeline click-to-loading
  - Settings -> Timeline click-to-target

---

## Ticket 037: Occurrence sync freshness state

Create a persisted per-user freshness contract so read routes can know whether
occurrences are already generated for the required horizon without running the
full sync job on every page load.

Context:
- Current read-heavy routes call `syncUserOccurrences` before rendering.
- `syncUserOccurrences` plans generation for all behaviors, reads occurrences,
  resolves schedule slots, performs missing occurrence upserts, deletes stale
  future unresolved occurrences, and syncs reminder deliveries.
- Earlier optimization batches parallelized and batched parts of this work, but
  the read routes remain server-bound.
- The desired architecture is: write paths and background jobs keep occurrence
  rows ready; read routes render from ready data and only trigger repair when
  the freshness state is stale.

Acceptance criteria:
- Add a Supabase migration for a user-owned occurrence sync state table, likely
  `occurrence_sync_state`.
- The table should track enough information to decide whether the user's
  occurrence horizon is fresh, such as:
  - `user_id`
  - timezone or timezone version used for the last sync
  - last synced local date
  - synced-through local date or horizon end
  - last successful sync timestamp
  - stale flag or stale reason
  - optional aggregate counts for observability
  - created/updated timestamps
- Add RLS policies and explicit grants for the new user-owned table.
- Add repository and service helpers for:
  - reading sync state
  - marking sync stale after behavior, schedule, timezone, import, restore, or
    other occurrence-affecting writes
  - marking sync fresh after a successful sync
  - deciding whether a given route's required local-date horizon is covered
- Keep resolver logic pure. Freshness decision helpers may live in services or a
  small pure resolver if useful, but database access must stay in repositories.
- Update occurrence-affecting write paths to mark freshness stale or fresh as
  appropriate:
  - behavior create/edit/archive/restore
  - settings timezone update
  - BehaviorLog import/restore apply paths that create/update occurrences
  - future occurrence-affecting write paths if present
- Do not remove `syncUserOccurrences` from read routes in this ticket. This is
  the state foundation only.
- Update `docs/DATA_MODEL.md`, generated database types, and relevant service
  tests.
- Update `docs/PERFORMANCE_SPEED_LOG.md` with implementation notes, not speed
  claims unless measured.
- Update `STATUS.md`.

Suggested files:
- `supabase/migrations/*_add_occurrence_sync_state.sql`
- `lib/db/occurrenceSyncState.repo.ts`
- `lib/services/occurrence-sync-state.service.ts`
- `lib/services/occurrence.service.ts`
- `lib/services/behavior.service.ts`
- `lib/services/settings.service.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/services/behaviorlog-restore.service.ts`
- `lib/db/database.types.ts`
- `docs/DATA_MODEL.md`
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`
- focused service tests for freshness decisions and stale marking

Verification:
- Create the migration through `npm run supabase -- migration new ...`.
- Run `npm run supabase -- db reset`.
- Regenerate database types if schema changes.
- Run focused occurrence/behavior/settings/import tests.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.

---

## Ticket 038: Move occurrence sync off hot read routes

Use the freshness state from Ticket 037 to stop doing full occurrence sync on
every Timeline, Analytics, and Export page render.

Context:
- This is the core architectural change for the current performance problem.
- Timeline, Analytics, and Export currently run `syncUserOccurrences` before
  reading route data.
- The app is small and single-player per account; a rolling generated horizon is
  acceptable as long as behavior changes, timezone changes, imports/restores,
  and daily horizon extension keep rows correct.
- The system must still preserve the domain rules:
  - no automatic `not_completed` or missed status
  - past/resolved occurrence history is preserved
  - Needs decision remains derived from unresolved prior-day occurrences
  - recurrence and day-boundary logic stays in resolvers/services

Acceptance criteria:
- Add a service-level `ensureUserOccurrencesFresh` or equivalent that:
  - checks `occurrence_sync_state`
  - runs `syncUserOccurrences` only when stale or insufficient for the route's
    required horizon
  - marks sync fresh on success
  - records sanitized timing and count data when performance logging is enabled
- Replace unconditional route-load `syncUserOccurrences` calls in Timeline,
  Analytics, and Export with freshness-aware logic.
- Choose route horizons deliberately:
  - Timeline must cover current local day plus the documented future timeline
    horizon.
  - Analytics must cover the selected analytics range through the current local
    day without deleting future rows outside its view.
  - Export must cover through the exported end local date, with all-time export
    still including occurrences through the current local day and excluding
    generated future rows.
- Fix the occurrence planner contract if needed so smaller read-route horizons
  cannot delete valid future unresolved rows outside the requested view.
- Add or update a daily/background horizon extension path. This may use the
  existing protected process route pattern or a new protected route, but it
  must be secret-protected and idempotent.
- Ensure behavior create/edit/archive/restore and timezone save still produce
  correct future unresolved occurrences immediately for the affected behavior or
  account.
- If sync is stale and fails, choose a conservative failure mode:
  - do not show silently incorrect data as fresh;
  - surface a route-safe error or fallback consistent with current error
    handling.
- Keep Supabase RLS in normal app code. Do not use service-role clients for
  ordinary authenticated user route reads.
- Update `docs/PERFORMANCE_SPEED_LOG.md` with before/after route timings.
- Update `docs/OPERATIONS.md` and `docs/ROUTE_MAP.md` if a new process route or
  cron workflow is added.
- Update `STATUS.md`.

Suggested files:
- `lib/services/occurrence.service.ts`
- `lib/services/occurrence-sync-state.service.ts`
- `lib/services/timeline.service.ts`
- `lib/services/analytics.service.ts`
- `lib/services/export.service.ts`
- `lib/resolvers/occurrence.resolver.ts` if planner contract changes
- `app/api/occurrences/sync/route.ts` or an existing process route if a
  background sync endpoint is added
- `vercel.json` if Vercel Cron is used for horizon extension
- `docs/PERFORMANCE_SPEED_LOG.md`
- `docs/OPERATIONS.md`
- `docs/ROUTE_MAP.md`
- `STATUS.md`
- focused occurrence service/resolver tests

Verification:
- Run focused occurrence resolver/service tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Run local production-build route timing for `/timeline`, `/analytics`,
  `/export`, `/behaviors`, and `/settings`.
- Verify behavior create/edit/archive/restore, timezone save, Timeline status
  actions, Analytics selected-day correction, and Export downloads still use
  correct occurrence data.

---

## Ticket 039: Decouple reminder planning from read-route rendering

Move reminder-delivery planning fully onto occurrence/behavior mutation paths
and reminder processing repair paths so ordinary page reads do not create or
cancel reminder deliveries.

Context:
- `syncUserOccurrences` currently calls `syncReminderDeliveriesForBehaviors`
  after occurrence generation planning.
- Browser reminders are enabled by default; email reminders are optional per
  behavior.
- Pending reminders must still be cancelled when an occurrence is resolved
  before the send time.
- Reminder processing must remain idempotent and must avoid duplicate sends.
- This ticket follows Ticket 038 because read-route occurrence sync must first
  have a freshness contract.

Acceptance criteria:
- Make behavior create/edit/archive/restore, timezone changes, import/restore
  apply, and occurrence-generation jobs responsible for planning/cancelling
  pending reminder deliveries for affected future occurrences.
- Keep status resolution cancellation in the existing occurrence status service
  path.
- Add a safe reminder processor repair step if needed:
  - before sending a due reminder, re-check occurrence/behavior eligibility;
  - create or cancel missing/stale pending deliveries only when needed and only
    for the due window;
  - never send duplicate reminders.
- Remove reminder planning writes from ordinary fresh read-route rendering.
- Preserve inactive-behavior cancellation semantics.
- Preserve all Sequenzy and Web Push server-only secret boundaries.
- Add tests for:
  - behavior changes plan expected reminder deliveries
  - route reads do not create reminder deliveries when sync state is fresh
  - resolving an occurrence cancels pending deliveries
  - reminder processor remains idempotent
  - duplicate sends are not introduced
- Update `docs/NOTIFICATION_SPEC.md` and `docs/PERFORMANCE_SPEED_LOG.md` if the
  reminder planning lifecycle changes.
- Update `STATUS.md`.

Suggested files:
- `lib/services/reminder.service.ts`
- `lib/services/occurrence.service.ts`
- `lib/services/behavior.service.ts`
- `lib/services/settings.service.ts`
- `lib/db/reminderDeliveries.repo.ts`
- `app/api/reminders/process/route.ts`
- `tests/reminder.service.test.ts`
- `tests/occurrence.service.test.ts`
- `docs/NOTIFICATION_SPEC.md`
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`

Verification:
- Run focused reminder and occurrence service tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- If production reminder behavior is smoke-tested, do not send real emails
  without explicit user-approved recipient instructions.

---

## Ticket 040: Auth and app-shell latency reduction

Reduce protected-route auth and shell overhead after measuring it, without
weakening Supabase Auth, RLS, or route protection.

Context:
- The protected proxy currently calls Supabase Auth `getUser` for matched app
  routes, and the protected app layout also verifies the user server-side.
- Supabase documents that `getUser` performs a network request to the Auth
  server. Supabase also documents `getClaims`, which can verify JWT claims
  faster when the project uses an asymmetric signing key, with fallback behavior
  when it does not.
- The app must keep Google login, cookie-backed SSR auth, RLS, and server-side
  route protection.
- This ticket must be evidence-driven. Do not switch auth methods blindly.

Acceptance criteria:
- Use Ticket 035 instrumentation to measure protected proxy auth time, app
  layout auth time, and total shell render time.
- Check current Supabase docs/changelog before changing auth behavior.
- Determine whether the hosted Supabase project supports a safe `getClaims`
  path for route gating. Document the result in
  `docs/PERFORMANCE_SPEED_LOG.md`.
- If safe, replace one or more redundant route-gating `getUser` calls with a
  lower-latency claims/session-validation path while preserving:
  - server-side route protection
  - cookie refresh correctness
  - redirect behavior for unauthenticated users
  - RLS-backed database access for user-owned rows
  - no trust in user-editable metadata for authorization decisions
- Keep strict `getUser` or equivalent authoritative user lookup where the code
  needs full user details, email/display metadata, or security-sensitive account
  actions.
- Consider splitting app-shell account display from route gating if full user
  metadata is the only reason every navigation waits on Auth network I/O.
- Add tests or smoke coverage for:
  - unauthenticated protected route redirect
  - authenticated route access
  - `/login` redirect for already-authenticated users
  - OAuth callback flow remains unchanged
  - account/settings paths that require authoritative user data still work
- Do not bypass Supabase RLS or use service-role clients for normal app pages.
- Update `docs/OPERATIONS.md` or auth notes if the auth validation approach
  changes.
- Update `docs/PERFORMANCE_SPEED_LOG.md` with before/after timings.
- Update `STATUS.md`.

Suggested files:
- `proxy.ts`
- `lib/supabase/proxy.ts`
- `lib/auth/current-user.ts`
- `app/(app)/layout.tsx`
- `lib/services/settings.service.ts`
- `tests/*auth*.test.ts` if auth tests exist or are added
- `docs/PERFORMANCE_SPEED_LOG.md`
- `docs/OPERATIONS.md`
- `STATUS.md`

Verification:
- Run focused auth/proxy tests or route smoke tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-smoke authenticated and unauthenticated access to `/timeline`,
  `/behaviors`, `/settings`, and `/login`.

---

## Ticket 041: Query evidence, indexes, and optional Timeline read RPC

After the hot-route sync and auth work, use concrete query evidence to decide
whether database indexes or a narrow RLS-safe read RPC are needed.

Context:
- Existing occurrence indexes cover common user/local-date and user/status/date
  reads, but current repository query shapes include additional filters such as
  `behavior_id`, `scheduled_for`, `status_marked_at`, and reminder status.
- The previous speed loop intentionally deferred index changes until hosted
  route timing and Supabase query evidence showed a clear need.
- The app should remain simple. Do not add database views or RPCs as a generic
  abstraction layer.

Acceptance criteria:
- Measure query timings for the post-Ticket-040 app on local production build
  and, if authorized, hosted production.
- Use Supabase/Postgres evidence such as `EXPLAIN` plans, slow query logs,
  repository timing spans, or local seeded data tests before adding indexes.
- Evaluate at least these query families:
  - Timeline forward local-date range reads
  - Needs decision prior unresolved reads
  - same-day retained prior resolved reads using `status_marked_at`
  - Analytics local-date range reads
  - Export through-current-day reads
  - per-behavior occurrence sync reads when sync does run
  - due pending reminder delivery reads
- Add indexes only when evidence shows an expected benefit, through Supabase
  migrations with updated `docs/DATA_MODEL.md`.
- Candidate indexes may include, but are not limited to:
  - `(user_id, behavior_id, scheduled_for)` for per-behavior sync reads
  - a partial or composite index for prior unresolved occurrence reads
  - `(user_id, status, status_marked_at, local_date)` or another measured shape
    for retained same-day prior decisions
- If route timing is dominated by multiple network round trips rather than
  individual query plans, consider one narrow Timeline read RPC that returns the
  three Timeline occurrence sets in one call.
- Any RPC must:
  - preserve per-user ownership checks
  - avoid `SECURITY DEFINER` unless there is a documented, reviewed reason
  - have explicit grants/revokes
  - return only the fields needed by the service
  - keep Timeline grouping logic in the resolver/service layer, not SQL
- Do not move recurrence generation, status semantics, adherence math, export
  formatting, or reminder planning into SQL.
- Update generated database types after schema changes.
- Update `docs/PERFORMANCE_SPEED_LOG.md` with query evidence and route timing
  deltas.
- Update `STATUS.md`.

Suggested files:
- `supabase/migrations/*_add_performance_indexes.sql`
- `lib/db/occurrences.repo.ts`
- `lib/db/reminderDeliveries.repo.ts`
- `lib/services/timeline.service.ts` only if a narrow read RPC is added
- `lib/db/database.types.ts`
- `docs/DATA_MODEL.md`
- `docs/SUPABASE_WORKFLOW.md` only if workflow guidance changes
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`
- focused repository/service tests

Verification:
- Create migrations through `npm run supabase -- migration new ...`.
- Run `npm run supabase -- db reset`.
- Regenerate database types if schema changes.
- Run focused repository/service tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Re-run the route timing matrix for `/timeline`, `/behaviors`, `/analytics`,
  `/export`, and `/settings`.

---

## Ticket 042: Production region and database round-trip latency evidence

Verify whether hosted app and Supabase region placement is adding avoidable
latency before introducing more complex caching or database aggregation.

Context:
- The follow-up speed pass found that app shells can respond under 100 ms, but
  full authenticated data loads and form actions remain bounded by hosted
  Supabase round trips measured at roughly 155-200 ms each from the test
  machine.
- Prior measurements showed production functions running in `iad1`; the
  Supabase project region and function-to-database latency need explicit
  confirmation.
- Region changes can involve downtime, data migration, provider limits, or
  OAuth/domain follow-up, so this ticket is evidence and recommendation only
  unless a later ticket explicitly authorizes an environment change.

Acceptance criteria:
- Confirm the production Vercel function region and current Supabase project
  region without exposing secrets or provider tokens.
- Measure authenticated server-side Supabase round-trip timing from the
  production deployment using existing timing instrumentation where possible.
- Measure the same page-load route matrix used in the performance speed loop:
  `/timeline`, `/behaviors`, `/analytics`, `/export`, and `/settings`.
- Record whether observed latency appears dominated by region distance, cold
  start, individual query plans, multiple sequential Supabase calls, or
  post-action re-render work.
- If region mismatch is found, document the lowest-risk options and tradeoffs:
  moving Supabase, pinning or moving Vercel functions, accepting the current
  placement, or using cache/RPC mitigation instead.
- Do not move production infrastructure, rotate secrets, or change provider
  settings in this ticket unless a separate user instruction explicitly
  authorizes that mutation.
- Update `docs/PERFORMANCE_SPEED_LOG.md` with measurements and the final
  recommendation.
- Update `STATUS.md`.

Suggested files:
- `docs/PERFORMANCE_SPEED_LOG.md`
- `docs/VERCEL_WORKFLOW.md` only if deployment-region guidance changes
- `docs/SUPABASE_WORKFLOW.md` only if project-region guidance changes
- `STATUS.md`
- `vercel.json` only if a separate approved implementation ticket changes
  region configuration

Verification:
- Re-run the route timing matrix under the same repeatable test conditions.
- Run `npm run agents:check`.
- If provider config files change, also run `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.

---

## Ticket 043: Page-level authenticated read RPC aggregation

Collapse repeated Supabase network round trips for page data where measurements
show that batching reads is more valuable than another client or framework
optimization.

Context:
- Ticket 041 allows one narrow Timeline read RPC if route timing is dominated
  by network round trips rather than individual query plans.
- The follow-up speed pass indicates the remaining full data loads are often
  bounded by multiple hosted Supabase calls, not by the app shell itself.
- This ticket generalizes that investigation to all primary authenticated pages
  while preserving resolver-first boundaries.

Acceptance criteria:
- Start with the highest-value page shown by current measurements, likely
  `/export` or `/timeline`, and prove the pattern before applying it elsewhere.
- For each page considered, capture before/after counts for Supabase calls,
  server timing spans, and full page-load timing.
- Any PostgreSQL function must be narrow and page-specific. Do not introduce a
  generic database abstraction layer.
- Preserve user ownership through RLS or explicit `auth.uid()` ownership
  checks. Avoid `SECURITY DEFINER` unless there is a documented, reviewed
  reason, a pinned `search_path`, and explicit grants/revokes.
- Return only the fields needed by the service for the page.
- Keep recurrence generation, timeline grouping, status semantics, adherence
  math, export formatting, and reminder planning in resolvers/services rather
  than SQL.
- Add Supabase migrations for any RPCs or indexes.
- Update generated database types after schema changes.
- Update `docs/DATA_MODEL.md` if database functions or indexes become part of
  the documented data-access contract.
- Update `docs/PERFORMANCE_SPEED_LOG.md` after each significant page change.
- Update `STATUS.md`.

Suggested files:
- `supabase/migrations/*_add_page_read_rpc.sql`
- `lib/db/*`
- `lib/services/timeline.service.ts`
- `lib/services/analytics.service.ts`
- `lib/services/export.service.ts`
- `lib/services/behavior.service.ts`
- `lib/services/settings.service.ts`
- `lib/db/database.types.ts`
- `docs/DATA_MODEL.md`
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`
- focused repository/service tests

Verification:
- Create migrations through `npm run supabase -- migration new ...`.
- Run `npm run supabase -- db reset`.
- Regenerate database types if schema changes.
- Run focused repository/service tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Re-run the route timing matrix after each page-level RPC change.

---

## Ticket 044: Per-user read-through cache for stable authenticated data

Add explicit, user-scoped caching for stable authenticated read bundles so
unchanged private data does not require a hosted Supabase round trip on every
page render.

Context:
- The app repeatedly reads stable per-user data such as settings, categories,
  behavior lists, and import/restore metadata.
- Authenticated caching is only acceptable if keys are scoped to the current
  user and invalidation is tied to the mutations that change that data.
- This must not become PWA/offline caching; offline mutation and sync conflict
  handling remain deferred from v1.

Acceptance criteria:
- Define a small cache contract for user-owned read bundles, including key
  shape, tags or invalidation handles, TTL expectations, and allowed data
  categories.
- Cache only low-volatility authenticated data where stale reads are either
  invalidated by known mutations or have a documented short TTL.
- Include `userId` in cache keys and tags. Do not include emails, provider
  tokens, or secrets in keys, tags, logs, or timing output.
- Preserve normal RLS-protected Supabase access on cache misses. Do not use a
  service-role client for normal app reads.
- Invalidate affected cache entries on behavior create/update/archive/restore,
  category changes, settings timezone changes, import/restore apply, and
  account deletion.
- Keep occurrence rows, status histories, and reminder delivery state uncached
  unless a later measurement proves a specific safe cache boundary.
- Measure before/after page loads for every primary authenticated route under
  the same speed-loop test conditions.
- Add focused tests or low-level assertions that prove cache keys are
  user-scoped and mutations invalidate the intended data.
- Update `docs/PERFORMANCE_SPEED_LOG.md`.
- Update `STATUS.md`.

Suggested files:
- `lib/cache/*`
- `lib/services/settings.service.ts`
- `lib/services/behavior.service.ts`
- `lib/services/categories.service.ts` if present
- `lib/services/import*.ts` or restore services if present
- related server actions that mutate cached data
- focused cache/service tests
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`

Verification:
- Run focused cache/service tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Re-run the route timing matrix for `/timeline`, `/behaviors`, `/analytics`,
  `/export`, and `/settings`.

---

## Ticket 045: Optimistic UI for common Timeline actions

Make common occurrence actions feel immediate by updating the visible UI before
the hosted Supabase mutation finishes, while still reconciling against the
server result.

Context:
- True server completion remains bounded by hosted Supabase round trips, but
  user-perceived action response can be under 100 ms for local UI feedback.
- The highest-value actions are Timeline status changes and note edits because
  they are frequent and small.
- This ticket is not offline support. It must not add background mutation
  queues, persistent local writes, or sync conflict handling.

Acceptance criteria:
- Implement optimistic UI first for occurrence `Completed` and `Not Completed`
  actions on the Timeline.
- Include note save only if the same pattern remains small and low risk after
  status actions are working.
- Show an accessible pending state for actions whose server confirmation has
  not returned.
- Revert the optimistic change and surface the existing error path if the
  server action fails.
- Keep stored occurrence statuses authoritative on the server. The optimistic
  state is visual until confirmed.
- Preserve the domain language: Unresolved, Completed, Not Completed, and
  Needs decision.
- Measure click-to-visible-feedback separately from server action completion.
- Re-run page-load measurements after the change to ensure optimistic state
  does not regress initial loads.
- Add focused tests for the optimistic state transition and rollback behavior
  if the component structure supports it.
- Update `docs/PERFORMANCE_SPEED_LOG.md`.
- Update `STATUS.md`.

Suggested files:
- Timeline occurrence row components
- Timeline action state hooks or reducers
- status/note server actions only if response shapes need to change
- focused component or reducer tests
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`

Verification:
- Run focused component or action-state tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-smoke status changes, note edits if included, action failure handling,
  and mobile Timeline layout.

---

## Ticket 046: Small mutation responses and targeted route refresh

Reduce form-action latency by returning small server-confirmed view models and
refreshing only the data that actually needs to be reloaded.

Context:
- The follow-up speed pass found that behavior create/edit/archive actions are
  still affected by hosted Supabase writes plus post-action route re-render
  work.
- Prior performance work already moved occurrence sync off hot read paths and
  allowed behavior mutations to mark occurrence sync state stale instead of
  synchronously generating all future occurrences.
- Broad route revalidation is still useful for correctness in some places, but
  it should not be the default when the client can update a local list from a
  small server-confirmed response.

Acceptance criteria:
- Audit current server actions for behavior create/update/archive/restore,
  Timeline status/note changes, Analytics correction actions, and Settings
  timezone changes.
- Identify which actions require `revalidatePath`, which can use targeted cache
  invalidation, and which can return a small confirmed result for local UI
  update.
- Start with behavior create because it is a visible form workflow and currently
  pays for both database work and page refresh behavior.
- Return enough validated server data for the UI to insert or update the
  affected row without forcing a full route re-render.
- Preserve server-side validation, ownership checks, RLS, and the occurrence
  sync freshness contract.
- Keep cross-route consistency explicit. If another route may be stale until
  navigation or refresh, document why that is acceptable or add targeted
  invalidation.
- Do not introduce a broad client-side data framework solely for this ticket.
- Measure form submit-to-visible-result and server action completion separately.
- Re-run page-load measurements for every primary authenticated route after
  each significant change.
- Update `docs/PERFORMANCE_SPEED_LOG.md`.
- Update `STATUS.md`.

Suggested files:
- behavior server actions
- behavior list/form components
- Timeline and Analytics action handlers if included after the behavior flow
- `lib/services/behavior.service.ts`
- `lib/services/timeline.service.ts`
- focused action/component tests
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`

Verification:
- Run focused action/component tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-smoke create, edit, archive, and restore behavior flows plus Timeline
  and Analytics action flows if they are changed.

---

## Ticket 047: Production performance timing log sampling

Enable the existing privacy-safe server timing instrumentation in production
long enough to capture authenticated route span evidence for the current
performance architecture.

Context:
- Ticket 035 added `CADENCE_PERF_LOG=1` gated server timing spans for
  protected app layout auth, route data loads, occurrence freshness checks,
  reminder planning/writes, and primary repository reads.
- Ticket 042 could not capture production server span evidence because
  `CADENCE_PERF_LOG` was not configured in the hosted production environment.
- Tickets 043-046 added RPC, read-through cache, optimistic UI, and targeted
  mutation improvements. A production log sample is needed to distinguish
  route/server work, Supabase round trips, and cache behavior from browser
  wall-clock timing variance.

Acceptance criteria:
- Configure `CADENCE_PERF_LOG=1` for the Vercel Production environment without
  exposing secrets or changing public runtime config.
- Redeploy production so the runtime receives the new environment variable.
- Run an authenticated production route matrix for `/timeline`, `/behaviors`,
  `/analytics`, `/export`, and `/settings`.
- Query production Vercel logs for sanitized `performance_timing` events and
  record representative route/page/auth/repository spans.
- Confirm that timing output contains route/span names, duration, status, and
  aggregate counts only. Do not record cookies, emails, behavior titles, notes,
  push endpoints, provider tokens, request bodies, or response bodies.
- Record whether cache hits are visible through missing or reduced repository
  spans on repeated route loads. Treat the cache as best-effort per instance,
  not durable shared infrastructure.
- Update `docs/PERFORMANCE_SPEED_LOG.md` with production span evidence,
  browser timing notes, and any remaining risk.
- Update `docs/VERCEL_WORKFLOW.md` so `CADENCE_PERF_LOG` is documented as an
  optional production sampling flag.
- Update `STATUS.md`.

Suggested files:
- `docs/PERFORMANCE_SPEED_LOG.md`
- `docs/VERCEL_WORKFLOW.md`
- `STATUS.md`

Verification:
- Confirm `vercel env ls production` includes `CADENCE_PERF_LOG`.
- Confirm the post-change production deployment is `READY`.
- Confirm `vercel logs --query performance_timing` returns sanitized timing
  events after authenticated route loads.
- Run `npm run agents:check`.
- Run `git diff --check`.

---

## UX backlog posture

The following UX tickets come from `docs/UX_RESEARCH_LOG.md` and
`docs/UX_JOURNEY_INVENTORY.md`.

Product stance:
- Cadence optimizes first for efficient visual use, sparse interaction, and
  readability for the primary abled-user workflow.
- Cadence should still preserve baseline web correctness: unique ids, valid
  labels, keyboard-safe close behavior for overlays, reliable mobile layout,
  factual state copy, and no unreachable core controls.
- Cadence is not pursuing a comprehensive screen-reader remediation or WCAG
  compliance program in this ticket set unless a later product decision changes
  that posture.
- BehaviorLog export/import remains the strategic portability path for users
  who need a different interface or interaction model.
- Avoid granular accessibility changes that materially compromise the sparse
  visual workflow. Prefer interventions that also improve general robustness,
  mobile usability, implementation clarity, or safety comprehension.

Adjusted UX priority:
1. Fix duplicate ids, broken anchors/labels, and any confirmed layout overlap.
2. Preserve the efficient visual UI while adding low-cost robustness such as
   correct buttons, labels, focus return, and Escape close behavior.
3. Improve mobile tap reliability only where it affects daily status marking,
   note editing, or high-risk confirmation flows.
4. Treat keyboard-only and 200 percent zoom checks as smoke tests for impossible
   or overlapped workflows, not as a full assistive-technology program.
5. Treat screen-reader-specific announcements, exhaustive ARIA descriptions,
   and specialized screen-reader journey tuning as optional unless they also
   improve maintainability or general usability.
6. Prioritize import, restore, reminder, deletion, and trust comprehension
   where confusion can cause unsafe data decisions.

---

## Ticket 048: UX research reproduction and triage pass

Turn the source-review findings in `docs/UX_RESEARCH_LOG.md` into a verified UX
backlog, separating confirmed implementation bugs from optional design
refinements.

Context:
- The first UX research pass logged findings UX-001 through UX-035.
- Many findings are marked `Needs reproduction` because they came from source
  review rather than browser observation.
- The current product posture favors efficient visual operation and baseline
  web correctness over comprehensive assistive-technology remediation.

Acceptance criteria:
- Run a browser-based reproduction pass for the highest-risk journeys:
  - J04 First-run activation
  - J07 Daily timeline use
  - J09 Needs decision
  - J12 Browser reminders
  - J14 Timezone management
  - J16 Import BehaviorLog bundle
  - J17 Restore backup
  - J19 Account deletion
  - J21 Mobile navigation and task flow
- Test at desktop and narrow mobile widths around 390px and 320px where
  relevant.
- Treat keyboard-only and 200 percent zoom as smoke checks for impossible,
  overlapped, or hidden workflows rather than a full accessibility audit.
- Update each reproduced finding in `docs/UX_RESEARCH_LOG.md` with:
  - observed result,
  - whether the issue is confirmed, not reproduced, deferred, or fixed,
  - which follow-up ticket owns it.
- Do not change product behavior in this ticket except for tiny documentation
  corrections needed to record the triage result.
- Do not add new product scope, new routes, dashboards, social features,
  gamification, AI coaching, calendar sync, or offline behavior.

Suggested files:
- `docs/UX_RESEARCH_LOG.md`
- `docs/UX_JOURNEY_INVENTORY.md` only if journey wording needs clarification
- `docs/TICKETS.md` only if follow-up tickets need scope adjustment
- `STATUS.md`

Verification:
- Run `npm run agents:check`.
- Run `git diff --check`.
- If any UI code is changed despite the expected doc-only scope, also run the
  standard UI verification for the affected route.

---

## Ticket 049: Settings baseline web correctness

Fix low-risk Settings issues that affect ordinary browser behavior, anchors,
labels, and destructive-action affordances without redesigning the Settings
surface.

Context:
- UX-015 flags duplicate `timezone` ids in Settings.
- UX-027 flags that timezone-save impact may be unclear before submit.
- UX-028 flags that account deletion server gates may not be mirrored in the
  client button state.
- These are baseline correctness and safety issues, not a broad accessibility
  redesign.

Acceptance criteria:
- Ensure the timezone section anchor and timezone input have unique ids.
- Preserve `/settings#timezone` as a stable route target unless a documented
  redirect or compatibility strategy is added.
- Ensure labels point to the intended controls after the id fix.
- Add concise pre-save timezone impact text if browser testing confirms users
  cannot predict that future unresolved occurrences and active behavior
  timezones are affected.
- Mirror account deletion gates in the client affordance if testing confirms
  the enabled button implies permission to proceed before acknowledgement and
  typed confirmation are complete.
- Preserve server-side account deletion validation regardless of client button
  state.
- Do not add account recovery, provider-account deletion claims, admin support
  tooling, or broad account-management scope.

Suggested files:
- `app/(app)/settings/page.tsx`
- Settings client components, if split from the page
- `components/*` only if Settings uses shared form controls
- `docs/UI_SPEC.md` if the Settings contract changes
- `docs/USER_FLOWS.md` if timezone or deletion copy requirements change
- `STATUS.md`

Verification:
- Run focused Settings tests if present or added.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-check `/settings`, `/settings#timezone`, and account deletion gates
  at desktop and around 390px.

---

## Ticket 050: First-run mobile layout robustness

Verify and fix first-run setup layout issues that can block or obscure the
Timeline on mobile.

Context:
- UX-013 flags that the first-run setup pop-up may collide with the sticky
  mobile header.
- UX-016 flags that setup dismissal is browser-local rather than account-scoped.
- UX-017 flags that the non-modal setup panel may be missed by some non-pointer
  users, but the product posture does not require a screen-reader-specific
  onboarding redesign unless it improves general use.

Acceptance criteria:
- Reproduce first-run setup with a clean account at desktop, 390px, and 320px.
- If the setup pop-up overlaps the header, drawer trigger, Needs decision
  control, or primary Timeline content, adjust layout or positioning.
- Preserve the setup prompt as optional and non-blocking.
- Do not request notification permission on page load.
- Decide whether browser-local dismissal remains acceptable for v1 or whether
  account-scoped dismissal is worth implementing. Record the decision in
  `docs/USER_FLOWS.md` or `docs/UI_SPEC.md` if it changes product behavior.
- Keep focus behavior simple: no focus stealing from the Timeline unless a
  confirmed general usability problem requires it.
- Do not add a setup wizard, dashboard, checklist route, or multi-step
  onboarding product surface.

Suggested files:
- `components/timeline/*`
- `components/layout/*`
- `app/(app)/timeline/page.tsx`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

Verification:
- Run focused Timeline/component tests if present or added.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-check first-run `/timeline` at desktop, 390px, and 320px.
- Run `npm run design-system:check` if reusable UI or design inventory changes.

---

## Ticket 051: Timeline daily workflow usability pass

Improve the primary daily Timeline workflow where issues affect fast visual use,
mobile taps, or implementation clarity.

Context:
- UX-002 flags quiet text actions and mobile/hurry-state tap reliability.
- UX-019 flags possible scroll-context loss after Show more days.
- UX-020 flags implicit row-expansion semantics.
- UX-035 flags possible duplicate titles in multi-slot Timeline groups.
- The goal is not to make the Timeline verbose. Preserve the sparse, efficient
  visual workflow.

Acceptance criteria:
- Verify unresolved current-day rows expose Completed, Not Completed, and Note
  affordances clearly enough on desktop and mobile.
- Confirm primary daily actions have reliable tap targets on mobile without
  making the row visually heavy.
- Prefer invisible hit-area padding or spacing changes before replacing quiet
  text actions with heavier controls.
- If row expansion is confusing to visual users or fragile in implementation,
  clarify the toggle area using native disclosure semantics or a simple button
  pattern while preserving the no-dashboard, no-chevron-heavy visual style.
- Verify Show more days preserves or restores useful scroll context on long
  Timelines. Add an anchor or targeted scroll behavior only if context loss is
  confirmed.
- Test a multi-slot behavior on mobile and reduce repeated title noise only if
  it materially slows scanning.
- Do not add bulk status updates, streaks, gamified feedback, past-history
  browsing, AI suggestions, or a dense dashboard.

Suggested files:
- `components/timeline/Timeline.tsx`
- `components/timeline/TimelineGroup.tsx`
- `components/timeline/OccurrenceRow.tsx`
- `components/timeline/StatusButtons.tsx`
- `components/timeline/OccurrenceNoteForm.tsx`
- `app/(app)/timeline/page.tsx`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

Verification:
- Run focused Timeline/component tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-check `/timeline` at desktop, 390px, and 320px, including 200 percent
  zoom as a smoke test.
- Run `npm run design-system:check` if reusable UI or design inventory changes.

---

## Ticket 052: Needs Decision interaction correctness

Make the Needs Decision modal reliable for ordinary keyboard and mobile use
without turning it into a broad accessibility redesign.

Context:
- UX-003 flags that a zero-count Needs Decision button can still open retained
  same-day decided rows, which may read as broken.
- UX-018 flags possible missing focus trap and focus restoration.
- UX-021 flags ambiguity around whether same-day retained rows are specifically
  Needs-decision-origin rows or any prior-day row resolved today.
- The adjusted posture prioritizes close behavior, focus return, and factual
  state clarity over exhaustive screen-reader tuning.

Acceptance criteria:
- Confirm the modal can be opened, used, and closed on desktop and mobile.
- Ensure `Escape` and the visible close action work consistently.
- Return focus to the Needs Decision launcher after close when the launcher
  remains mounted.
- Add a simple focus trap only if testing confirms keyboard users can tab into
  obscured page content or lose operational context.
- Clarify the zero-count retained-row state if users read it as empty or
  broken. Prefer concise label/state copy over adding a new modal section.
- Decide and document whether same-day retention includes only rows decided
  inside Needs Decision or any prior-day row resolved today.
- Keep Needs decision as a derived UI group, not a stored status.
- Do not add a past-history route, bulk decision flow, dashboard, stored missed
  status, or automatic status changes.

Suggested files:
- `components/timeline/NeedsDecisionDialog.tsx`
- `components/timeline/Timeline.tsx`
- `lib/resolvers/timeline.resolver.ts` if retention semantics change
- `lib/services/timeline.service.ts` if retention semantics change
- `tests/timeline.resolver.test.ts` if resolver behavior changes
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

Verification:
- Run focused Timeline resolver/component tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-check Needs Decision at desktop, 390px, keyboard-only smoke, and 200
  percent zoom.
- Run `npm run design-system:check` if reusable UI or design inventory changes.

---

## Ticket 053: Browser reminder readiness clarity

Separate reminder intent from delivery readiness so users understand permission,
subscription, and behavior-level reminder state.

Context:
- UX-005 flags browser permission recovery paths.
- UX-014 and UX-024 flag that notification permission can look complete even
  when a saved push subscription is missing or unverified on revisit.
- UX-025 flags that behavior-level browser reminders can overpromise delivery.
- UX-026 flags that clicking a browser notification may focus the wrong page.

Acceptance criteria:
- Distinguish, in concise UI state, between:
  - browser notification support,
  - browser permission,
  - saved active push subscription,
  - per-behavior browser reminder intent.
- Show saved subscription state on Settings revisit if the data is available
  without adding heavy polling or provider complexity.
- Make behavior-level browser reminder copy clear that delivery requires global
  browser permission and a saved subscription.
- Keep browser reminders enabled by default at the behavior level.
- Keep email reminders opt-in per behavior.
- Ensure clicking a reminder notification focuses or opens the intended
  Timeline URL instead of leaving the user on an unrelated same-origin page.
- Keep tracking usable when push is unavailable, denied, blocked, expired, or
  failed.
- Do not add provider test-send buttons, reminder dashboards, notification
  troubleshooting wizards, or PWA/offline behavior.

Suggested files:
- `app/(app)/settings/page.tsx`
- Settings notification components, if split from the page
- `components/behaviors/ReminderEditor.tsx`
- `public/push-service-worker.js`
- `lib/services/push-subscription.service.ts` if page data needs saved state
- `lib/db/pushSubscriptions.repo.ts` if page data needs saved state
- `docs/NOTIFICATION_SPEC.md`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

Verification:
- Run focused push subscription/reminder tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-check `/settings#notifications` and behavior reminder controls at
  desktop and around 390px.
- Test at least allowed, denied, and unavailable/unsupported notification
  states where practical. Do not send real emails without explicit recipient
  approval.

---

## Ticket 054: Later correction and review discoverability

Clarify deliberate correction paths without turning Timeline into a history
browser or Analytics into a dense dashboard.

Context:
- UX-004 flags that behavior heatmap interactivity may be undiscoverable.
- UX-022 flags that the resolver supports returning to Unresolved, but the UI
  exposes only Completed and Not Completed corrections.
- UX-023 flags that the selected-day correction area heading is too vague.
- Ticket 033 already scopes Analytics selected-day occurrence correction; this
  ticket should refine discoverability and decide any remaining correction
  model gaps.

Acceptance criteria:
- Verify discovery of behavior/date review from behavior heatmap cells through
  realistic owner-approved agent proxy browser walkthrough(s) without
  prompting, with structured, documented evidence clearly labeled as not
  real-user evidence. Human TS07 testing remains the future requirement before
  claiming externally validated discoverability.
- Improve information scent for actionable behavior heatmap cells if needed,
  without making the overall passive calendar look actionable.
- Rename vague selected-day review copy if needed, for example toward `Review
  selected day` or similarly explicit date-specific language.
- Decide whether v1 should expose `Clear decision` back to Unresolved in
  Timeline, Needs Decision, or later review. If yes, update product docs before
  implementation and add service/UI tests.
- Preserve manual status language: Unresolved, Completed, Not Completed.
- Preserve Needs decision as the stronger prompt for prior-day unresolved
  occurrences.
- Do not add a global history route, all-time occurrence search, bulk edit,
  automatic correction suggestions, AI coaching, or streak/gamification
  language.

Suggested files:
- `components/behaviors/BehaviorList.tsx`
- Analytics or behavior review components currently owning selected-day review
- `lib/resolvers/analytics.resolver.ts` only if data contracts change
- `lib/resolvers/status.resolver.ts` only if Clear decision behavior changes
- `tests/analytics.resolver.test.ts`
- `tests/status.resolver.test.ts` if status transitions change
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/PRODUCT_SPEC.md` if status correction scope changes
- `STATUS.md`

Verification:
- Run focused Analytics/status tests first when code changes.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-check the relevant review path at desktop and around 390px.
- Run `npm run design-system:check` if reusable UI or design inventory changes.

---

## Ticket 055: Portability flow comprehension hardening

Make export, import, and restore choices easier to understand at the moments
where confusion can cause unsafe data decisions.

Context:
- UX-006 flags that users may not know which export format to choose.
- UX-007 flags that import and restore density is necessary but high risk.
- UX-029 through UX-033 flag restore history, import preview binding, full JSON
  backup labeling, hidden import details, and sensitivity summary clarity.
- Cadence's portability posture depends on users trusting these flows.

Acceptance criteria:
- Add concise task-based guidance for export formats:
  - spreadsheet review,
  - full backup,
  - BehaviorLog portability,
  - Markdown summary.
- Verify whether Full JSON backup includes status event history. If not, revise
  label/copy or docs so BehaviorLog is clearly the complete interoperability
  and restore-oriented path.
- Reproduce whether restore previews can appear as `Open` after completion and
  fix status/timestamp handling if confirmed.
- Bind import apply to the exact persisted accepted `merge_preview` run and its
  bundle, local-data, and combined preview fingerprints. Apply must reject
  stale, altered, mismatched, or unaccepted preview data rather than silently
  recomputing a replacement plan, and the applied run must retain an auditable
  accepted-preview link and fingerprint.
- Surface unsupported fields, intervention counts, sensitivity counts, and
  redaction summaries enough for a user to make an informed import/restore
  decision.
- Keep high-risk flows explicit and auditable, with stale-preview refusal and
  destructive-action confirmation preserved.
- Do not add broad restore automation, hidden destructive writes, provider
  sends, admin repair tools, AI interpretation, or new product data categories
  outside existing BehaviorLog import/restore scope.

Suggested files:
- `components/export/*`
- `app/(app)/export/actions.ts`
- `lib/services/behaviorlog-import.service.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/services/behaviorlog-restore.service.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/resolvers/behaviorlog-restore.resolver.ts`
- focused import/restore/export tests
- `docs/EXPORT_FORMATS.md`
- `docs/UI_SPEC.md`
- `docs/USER_FLOWS.md`
- `STATUS.md`

Verification:
- Run focused export/import/restore tests first.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser-check `/export` at desktop and around 390px with valid, invalid,
  warning-heavy, and destructive-preview fixtures.
- Browser-check import preview/apply with fixture data, including stale-preview
  rejection and a valid accepted-preview success case.
- Do not apply a destructive restore against the user's real account during QA.

---

## Ticket 056: Public trust and marketing comprehension

Tighten public-facing trust, legal, and BehaviorLog explanation paths without
expanding the marketing surface beyond the current launch scope.

Context:
- UX-001 flags that first-time users may not understand BehaviorLog before they
  have data.
- UX-009 flags that Terms, Privacy, and Trust appear late in the pre-auth
  journey.
- UX-010 flags that public legal pages lack a clear marketing return path.
- UX-011 flags that Trust copy may understate the implemented RLS-backed
  account-isolation posture.
- UX-012 flags that marketing machine-file links may omit `/docs.md`.

Acceptance criteria:
- Test whether marketing users can explain Cadence and BehaviorLog in their
  own words before sign-in. Owner-approved agent-driven browser persona
  walkthroughs are accepted proxy evidence for this ticket, but must be
  labeled as proxy testing rather than real-user evidence and retain a future
  human-validation follow-up before any externally validated claim.
- Add low-priority footer access to Terms, Privacy, and Trust from marketing if
  users look for trust material before clicking Log in.
- Add a clear Cadence overview return path from public legal/trust pages if
  users expect it.
- Tune Trust copy so account isolation is factual and confidence-building
  without overclaiming support, security guarantees, or provider behavior.
- Verify marketing `/docs` machine-readable file index includes generated
  Markdown mirrors such as `/docs.md` when those files exist.
- Preserve the narrow marketing navigation model and avoid turning legal pages
  into marketing-heavy landing pages.
- Do not add analytics cookies, tracking scripts, billing language, desktop or
  mobile promises, AI coaching claims, social positioning, or admin/support
  surfaces.

Suggested files:
- `apps/marketing/*`
- public legal/trust route files
- `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`
- `docs/CRAWL_POLICY.md`
- `docs/USER_FLOWS.md`
- `docs/UI_SPEC.md`
- `STATUS.md`

Verification:
- Run `npm run marketing:build`.
- Run `npm run marketing:check`.
- Run `npm run agents:check`.
- Run the standard app checks if public legal/trust routes in the Next.js app
  change.

---

## Ticket 057: Behavior title and description history export context

Capture append-only history for behavior title and description changes so
exports can preserve how the user's definition of a behavior changed over time.

Context:
- Promoted from `docs/FEATURE_IDEAS.md` "Behavior Title And Description
  History".
- `behaviors.title` and `behaviors.description` currently store only the latest
  behavior definition.
- `behaviors.updated_at` proves the row changed, but does not record which
  fields changed or what the prior values were.
- App-native and BehaviorLog exports currently include behavior title and
  description snapshots, not a first-class behavior-definition revision trail.
- The goal is export and agent context first, not an in-app revision browser.

Acceptance criteria:
- Add a Supabase migration for an append-only user-owned behavior definition
  history table, such as `behavior_definition_events`.
- The table must include `user_id`, `behavior_id`, prior and next title and
  description values, changed field names, `recorded_at`, source metadata, and
  timestamps.
- The table must have RLS policies and explicit authenticated Data API grants
  matching the repository's current Supabase posture.
- Backfill one baseline event for existing behaviors so exports have a starting
  definition. Use `behaviors.created_at` as the baseline `recorded_at` unless a
  better existing timestamp is available.
- On behavior create, write an initial definition event.
- On behavior edit, append an event only when the normalized title or
  description changes. Schedule, reminder, category, archive, or timezone-only
  edits must not create definition events.
- Preserve current behavior CRUD behavior and occurrence sync semantics.
- Keep event planning resolver-first: add a small pure resolver or equivalent
  pure planning function for behavior definition event creation, and update
  `docs/AGENT_RESOLVERS.md` if a new resolver is introduced.
- Add repository and service paths for reading/writing definition events without
  querying Supabase from UI components.
- Include behavior definition history in export context:
  - Full JSON backup should include the history records.
  - BehaviorLog bundle should include the history as a Cadence extension or
    optional app-specific file without violating the BehaviorLog core schema.
  - Markdown AI summary should mention that definition history exists when
    included, and should give agents guidance to account for behavior renames
    or description changes.
- Add import/restore planning notes or implementation for the new export shape.
  If full import/restore support is too large for this ticket, document the
  limitation clearly in `docs/EXPORT_FORMATS.md` and the export UI copy.
- Historical title and description text can be sensitive. Add an explicit
  privacy decision in docs about whether definition history is included by
  default or behind a separate export option.
- Update `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`, `docs/PRODUCT_SPEC.md`,
  `docs/USER_FLOWS.md`, and `docs/FEATURE_IDEAS.md` as needed.
- Add focused tests for create, edit, no-op edit, schedule-only edit, export
  formatting, RLS/static policy coverage, and resolver/event planning.
- Do not add multi-user audit logs, approval workflows, AI-generated behavior
  rewrites, automatic behavior splitting/merging, or broad account activity
  logs.

Owner questions before implementation:
- Should behavior definition history be included in exports by default, or
  behind an "include behavior history" option?
- Should exports include full previous/next text, a computed diff, or both?
- Should the user be able to enter a reason for a title or description change
  in this ticket, or should reason support be schema-only for now?
- Should imported behavior definition history be applied on restore in the
  first implementation, or only preserved in export until a later import ticket?

Suggested files:
- `supabase/migrations/*`
- `docs/DATA_MODEL.md`
- `docs/EXPORT_FORMATS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/AGENT_RESOLVERS.md`
- `lib/db/database.types.ts`
- `lib/db/*behavior*`
- `lib/services/behavior.service.ts`
- `lib/resolvers/*behavior*`
- `lib/services/export.service.ts`
- `lib/resolvers/export.resolver.ts`
- `components/export/*`
- `tests/*behavior*`
- `tests/export.resolver.test.ts`
- RLS/static policy tests
- `STATUS.md`

Verification:
- Run `npm run supabase -- db reset` after the migration.
- Regenerate database types.
- Run focused behavior/history/export tests.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.

---

## Ticket 058: Status timestamp and status history export hardening

Harden status timestamp and status-history capture, then make sure the history
is available as useful export context for agents.

Context:
- Promoted from `docs/FEATURE_IDEAS.md` "Status Action Capture And Correction
  History".
- Current occurrence snapshots already store `status_marked_at` and
  `completed_at`.
- Current `occurrence_status_events` rows store append-only status history for
  first marks, corrections, unmarking back to Unresolved, source metadata,
  confidence, and `revises_event_id`.
- BehaviorLog exports already treat `status_events.jsonl` as the status-history
  authority.
- This ticket should audit, close gaps, and make the status-history context
  consistently available. It should not create a new status vocabulary or a
  user-facing audit log unless explicitly scoped later.

Acceptance criteria:
- Audit the current manual status flow from Timeline, Behaviors review, import,
  restore, export, and tests.
- Confirm or fix that every explicit status change appends one
  `occurrence_status_events` row:
  - Unresolved to Completed,
  - Unresolved to Not Completed,
  - Completed to Not Completed,
  - Not Completed to Completed,
  - resolved status back to Unresolved.
- Confirm repeated taps of the already-current resolved status do not create
  duplicate status events.
- Confirm note-only edits do not mutate status timestamps or create status
  events.
- Confirm `completed_at` means completion timestamp for current Completed
  snapshots, while `status_marked_at` means latest current-status mark time for
  the current snapshot.
- Confirm unmarking to Unresolved clears current snapshot timestamps but leaves
  the append-only event with its own `recorded_at`.
- Confirm corrections link to the latest prior event through `revises_event_id`
  when available.
- Confirm RLS and Data API grants keep `occurrence_status_events` append-only
  for normal authenticated app access.
- Close export gaps:
  - BehaviorLog bundle must include authoritative `data/status_events.jsonl`.
  - Full JSON backup includes occurrence status-event history in addition to
    unchanged current occurrence snapshots.
  - Markdown AI summary gives concise correction and logging guidance: use
    status events over current occurrence snapshots for correction, late-log,
    and adherence-timing analysis.
  - App-native JSONL/CSV should keep existing `status_marked_at` fields and
    should not silently imply that snapshots are full history.
- Add or update tests for timestamp preservation, correction history, unmarking,
  legacy resolved rows without status events, export context, and BehaviorLog
  conformance.
- Update `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`, `docs/PRODUCT_SPEC.md`,
  `docs/USER_FLOWS.md`, `docs/DECISIONS.md`, and `docs/FEATURE_IDEAS.md` where
  the hardened contract needs to be explicit.
- Do not add a `missed` status, automatic missed marking, AI coaching, broad
  audit-log UI, or status-history editing.

Owner questions before implementation:
- Full JSON includes `occurrence_status_events` as an additive
  `status_events` root array; BehaviorLog remains the interoperable and
  restore-oriented format.
- Markdown includes concise static correction and logging guidance.
- Status history remains export/context only; this ticket adds no UI surface.
- No future source values are added. Existing source-capture fields retain an
  extension path for a later scoped feature.

Suggested files:
- `docs/DATA_MODEL.md`
- `docs/EXPORT_FORMATS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/USER_FLOWS.md`
- `docs/DECISIONS.md`
- `lib/resolvers/status.resolver.ts`
- `lib/services/occurrence.service.ts`
- `lib/db/occurrenceStatusEvents.repo.ts`
- `lib/services/export.service.ts`
- `lib/resolvers/export.resolver.ts`
- `components/export/*`
- `tests/status.resolver.test.ts`
- `tests/occurrence.service.test.ts`
- `tests/export.resolver.test.ts`
- `tests/behaviorlog-conformance.test.ts`
- RLS/static policy tests
- `STATUS.md`

Verification:
- Run focused status, occurrence service, export, and BehaviorLog conformance
  tests first.
- If schema or RLS changes are needed, run `npm run supabase -- db reset` and
  regenerate database types.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.

---

## Ticket 059: BehaviorLog restore apply for Cadence schedule IDs

Make destructive restore apply work for BehaviorLog bundles exported by Cadence
itself when schedule records use stable BehaviorLog external IDs such as
`sch_<uuid>` instead of local database UUIDs.

Context:
- Follow-up hosted browser QA on 2026-07-09 exported a real Cadence
  `.behaviorlog.zip` bundle, accepted it in restore preview, and successfully
  applied the same bundle through create-only import into a second disposable
  account.
- Destructive restore apply stayed disabled because the restore preview
  contained skipped actions. The confirmed compatibility issue is that Cadence
  export emits `data/schedules.jsonl` `schedule_id` values like `sch_<uuid>`,
  while the restore apply payload builder currently requires schedule IDs to be
  database UUIDs when an accepted preview action has no existing local ID.
- `sch_<uuid>` is a valid BehaviorLog external identifier. The restore path
  should map external schedule IDs to safe local UUID schedule-slot IDs instead
  of changing the export format to make schedule IDs look like database IDs.

Acceptance criteria:
- Add a regression fixture or test path using a Cadence-generated BehaviorLog
  bundle with:
  - at least one `data/schedules.jsonl` row whose `schedule_id` is
    `sch_<uuid>`,
  - at least one occurrence that references that schedule,
  - at least one status event for the occurrence.
- Restore preview must not classify schedules, occurrences, status events, or
  notes as skipped solely because the referenced schedule ID is a non-UUID
  BehaviorLog external ID.
- Restore apply must generate or resolve safe local UUIDs for schedule-slot
  rows when accepted preview actions lack a local ID, then use those mapped
  UUIDs for occurrence `behavior_schedule_slot_id` values.
- Preserve the original BehaviorLog external schedule IDs in import/restore
  provenance so later import, merge, or restore previews can map
  `sch_<uuid>` back to the restored local schedule slot.
- Applying the same accepted restore run must remain idempotent.
- Keep the existing restore gates intact:
  - accepted `restore_preview` run,
  - matching preview fingerprint,
  - matching local-data fingerprint,
  - typed `RESTORE` confirmation,
  - fresh-backup acknowledgement,
  - sensitivity acknowledgement when needed,
  - no validation errors,
  - no skipped or unsupported restore actions.
- Keep restore apply transaction-scoped and user-owned. Do not bypass Supabase
  RLS expectations, widen RPC execute privileges, or perform direct hosted
  database edits.
- Update any misleading user-facing error copy that currently suggests a
  Cadence-generated BehaviorLog backup should avoid this failure.
- Update docs if the restore compatibility contract or provenance behavior
  becomes more explicit.
- Do not change BehaviorLog export schedule IDs just to satisfy restore apply.
- Do not add category restore, provider sends, reminder scheduling, PWA/offline
  behavior, broad restore automation, hidden destructive writes, AI
  interpretation, or new product data categories.

Suggested files:
- `lib/services/behaviorlog-restore.service.ts`
- `lib/resolvers/behaviorlog-restore.resolver.ts` if preview skip behavior
  changes
- `lib/services/behaviorlog-import.service.ts` or import mapping helpers if
  restore provenance should reuse existing mapping utilities
- `supabase/migrations/*` only if the restore RPC payload or mapping writes
  need database changes
- `lib/db/database.types.ts` if schema or RPC types change
- `docs/EXPORT_FORMATS.md`
- `docs/USER_FLOWS.md`
- `docs/DATA_MODEL.md` if provenance persistence changes
- `tests/behaviorlog-restore.service.test.ts`
- `tests/behaviorlog-restore-apply.service.test.ts`
- `tests/behaviorlog-restore.resolver.test.ts` if resolver behavior changes
- `tests/behaviorlog-conformance.test.ts` if export/restore fixture
  generation changes
- RLS/static policy tests if schema or privileges change
- `STATUS.md`

Verification:
- Run focused restore preview/apply tests first, including the new
  Cadence-exported `sch_<uuid>` regression.
- If schema, RPC, RLS, grants, or migrations change, run
  `npm run supabase -- db reset` and regenerate database types.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Browser QA `/export` with disposable hosted or local test-login accounts:
  export a BehaviorLog bundle from one account, restore-preview it in another
  account, verify the apply controls unlock only after all restore gates are
  satisfied, and apply only against disposable data.
- After browser QA, delete disposable accounts or data and run the appropriate
  test-login cleanup command when test-login users were used.

---

## Ticket 060: Schedule integrity and missing occurrence repair

Repair empty behavior schedules, restore the occurrences they suppressed, and
prevent occurrence sync from silently treating structurally invalid schedules
as fresh.

Context:
- A read-only hosted investigation on 2026-07-17 found one active weekly
  behavior whose `behavior_schedules` parent was valid but had no
  `behavior_schedule_slots` child. The compatibility columns on `behaviors`
  still held its Friday recurrence and 11:30 AM time, so the Behaviors UI
  synthesized a valid-looking editor row while occurrence generation produced
  no rows.
- The affected behavior has one preserved Completed occurrence on 2026-06-26.
  Its scheduled 2026-07-03, 2026-07-10, and 2026-07-17 occurrences were absent
  rather than stored as Unresolved. Any additional scheduled dates that pass
  before this ticket is deployed must be detected from recurrence, not listed
  manually.
- Account occurrence sync still recorded a fresh 30-day horizon even though
  this behavior produced no plan. Needs decision and the behavior heatmap were
  downstream symptoms of missing occurrence rows, not Timeline or analytics
  grouping defects.
- The hosted audit found 36 behaviors, 37 schedules, and 36 slots. Only one of
  27 active behaviors had an empty schedule. One archived behavior also had an
  empty schedule. No orphaned or cross-owner schedule-slot links were found,
  all relevant tables had RLS enabled, and hosted migration history matched
  the repository.
- `20260626140000_add_behavior_schedules.sql` backfilled schedule parents and
  attached existing legacy slots, but it did not create a compatibility slot
  when an older behavior had no slot row. Current behavior create/update also
  commits the behavior/definition write separately from schedule replacement,
  so a failed follow-on schedule write can still leave a partial graph.

Implementation order:
1. Add failing resolver/service and migration regression fixtures for a single
   empty legacy schedule, a multi-schedule graph with one empty schedule, and a
   schedule-write failure after the behavior write.
2. Add a git-tracked, idempotent Supabase migration that repairs every empty
   schedule from its owning behavior's compatibility recurrence/time fields;
   do not hardcode hosted behavior, user, schedule, or occurrence IDs.
3. In the same repair contract, insert only genuinely missing scheduled
   occurrences for repaired active schedules from their stable local anchor
   through the normal future horizon. Preserve all existing occurrences and
   statuses. Mark affected account sync state stale so normal reminder
   planning and horizon verification run afterward.
4. Harden occurrence schedule normalization and freshness decisions so an
   active schedule with no time entry cannot produce an empty plan and then be
   recorded as fresh.
5. Move manual behavior create/update plus definition-event, schedule-parent,
   schedule-slot, and occurrence-sync-stale writes behind owner-scoped atomic
   database functions. Keep repositories responsible for persistence and
   resolvers responsible for planning/validation.
6. Update contracts, generated database types, drift checks, and operational
   deployment notes. Verify locally before requesting authorization for hosted
   migration deployment.

Acceptance criteria:

Data repair:
- Create the migration with `npm run supabase -- migration new
  <descriptive_name>`; do not invent a filename or edit the hosted database
  directly.
- Before adding any stricter write guard, identify every
  `behavior_schedules` row with zero owned `behavior_schedule_slots` rows.
- For each empty schedule, insert one exact-time compatibility slot using:
  - the same `user_id` and `behavior_id`,
  - the empty schedule's `id` as `behavior_schedule_id`,
  - `behaviors.scheduled_time` as `start_time`,
  - `kind = 'exact'`, `preset = null`, `end_time = null`, and
    `sort_order = 0`.
- The slot backfill must be idempotent and owner-consistent. Existing valid
  schedules and slots must remain byte-for-byte unchanged except for normal
  trigger timestamps on rows intentionally updated by the migration.
- Repair missing occurrences only for schedules repaired by this migration.
  Recurrence expansion must match the existing recurrence resolver for daily,
  every-N-days, weekly/every-N-weeks, and monthly-last-day rules in the
  behavior timezone.
- Use the behavior's stable local creation date as the interval anchor unless
  a more specific existing anchor contract is present. Do not parse local
  dates through JavaScript `Date` or use the database/server timezone as the
  behavior timezone.
- Insert missing occurrences idempotently with the repaired slot snapshot and
  stored status `unresolved`. Do not update, delete, relabel, or recreate any
  existing occurrence, including the preserved 2026-06-26 Completed row.
- The known 2026-07-03, 2026-07-10, and 2026-07-17 Friday instances must exist
  after repair. Also generate any later scheduled instances that become due
  before deployment and maintain the documented 30-day future horizon.
- Repaired historical rows must have no synthetic completion timestamps and
  no fabricated status-history events. They must enter Needs decision through
  the existing derived `unresolved` plus prior-`local_date` rule.
- Do not create, send, or retry reminders for past repaired occurrences.
  Normal resolver/service reminder planning may create pending deliveries only
  for still-eligible future occurrences after the account is marked stale and
  resynced.
- The archived empty schedule may receive its missing compatibility slot, but
  it must not generate new occurrences or reminders while archived.
- Record aggregate, privacy-safe migration verification counts only. Do not
  put hosted user IDs, emails, behavior IDs, schedule IDs, occurrence IDs, or
  private notes in committed docs or logs.

Runtime integrity and sync freshness:
- `lib/services/occurrence.service.ts` must not filter an active empty schedule
  into a successful no-op plan.
- Define one explicit normalization result for schedule graphs, including a
  typed invalid-schedule outcome. Do not let UI fallback rendering become the
  occurrence-generation source of truth.
- A single legacy-compatible empty schedule may use the behavior compatibility
  fields only through the documented normalization/repair path. An ambiguous
  graph, including one empty schedule among multiple schedules, must fail
  loudly, keep `occurrence_sync_state.stale = true`, and surface a safe error
  instead of marking the horizon fresh.
- `markOccurrenceSyncFreshForPlans` may run only after every active behavior
  has at least one valid schedule time entry and all planned occurrence writes
  have succeeded.
- A failed generation, schedule validation, occurrence write, or reminder-plan
  write must not leave a false fresh horizon. Preserve the original error while
  best-effort marking sync state `sync_failed`.
- Keep recurrence generation and repair planning resolver-first. UI, API
  routes, repositories, SQL query layers, and reminder adapters must not
  duplicate ongoing recurrence rules. Any SQL recurrence expansion used only
  for the one-time migration must have parity fixtures against
  `recurrence.resolver.ts` for every supported recurrence type and DST/local
  date boundary relevant to the repaired data.

Atomic behavior schedule writes:
- Manual behavior create must commit or roll back the behavior row, initial
  definition event, all schedule parents, all schedule slots, and stale sync
  state as one owner-scoped transaction.
- Manual behavior update, including schedule-only edits, must commit or roll
  back the behavior definition/category/reminder fields, optional definition
  event, complete schedule graph replacement, and stale sync state as one
  owner-scoped transaction.
- Validate in the transaction that there is at least one schedule and at least
  one time entry for every schedule. Reject empty, duplicate, malformed,
  cross-owner, or stale schedule graphs before any partial product write is
  committed.
- Preserve the existing stale-definition/ABA guards and definition-event no-op
  behavior. Schedule-only edits must not append definition-history events.
- Database functions must validate `auth.uid()`, pin a safe `search_path`, use
  minimum required privileges, and have explicit `EXECUTE` grants/revokes.
  Do not add a general service-role bypass or broaden table access.
- Document and test a deployment sequence that does not strand the currently
  deployed app between an RPC/schema migration and the application code that
  calls it. Any temporary compatibility fallback must be narrow, observable,
  and removed or explicitly ticketed for removal after rollout.

Verification and hosted proof:
- Add resolver tests proving weekly Friday generation for the repaired shape,
  every supported recurrence type, interval anchoring, monthly day-31
  fallback, timezone boundaries, idempotence, and existing-status
  preservation.
- Add service/repository tests proving an empty or ambiguous schedule cannot be
  marked fresh, write failures leave sync stale, and valid schedules retain
  current generation behavior.
- Add database/RPC tests proving behavior create/update schedule writes are
  atomic, cross-owner calls fail, stale writes fail, and a forced schedule-slot
  failure rolls back the behavior and definition event.
- Add migration tests with at least:
  - the confirmed weekly Friday empty-schedule shape,
  - one archived empty schedule,
  - one valid schedule that must remain untouched,
  - one pre-existing Completed occurrence,
  - one pre-existing Unresolved occurrence,
  - an idempotent second repair run.
- Run `npm run supabase -- db reset` from a clean local database and regenerate
  `lib/db/database.types.ts` after schema/RPC changes.
- Run a rollback-only local SQL smoke for repair counts, atomic create/update,
  RLS ownership refusal, and idempotent replay.
- Run `npm run agents:check`, `npm run resolvers:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Before hosted mutation, require explicit owner authorization, confirm local
  and hosted migration histories, and create a fresh user-owned export/backup.
- Deploy only through `npm run supabase -- db push`; do not use Dashboard SQL
  or Table Editor repairs.
- After hosted deployment, run the occurrence sync/reminder planning path once
  for affected stale accounts, then verify with privacy-safe aggregate queries:
  - zero active empty schedules,
  - zero cross-owner/orphan schedule slots,
  - the preserved Completed occurrence is unchanged,
  - all expected repaired occurrences exist exactly once,
  - prior repaired occurrences are Unresolved and counted by Needs decision,
  - the current/future Friday occurrences appear on Timeline,
  - no past reminder deliveries were created,
  - the account's fresh horizon is recorded only after successful repair.
- Browser QA the affected production account at `/timeline` and `/behaviors`:
  verify Needs decision, current/future occurrences, heatmap/review visibility,
  status actions, and no duplicate rows. Do not alter the preserved Completed
  occurrence during QA.
- Re-run hosted migration-list congruence and the Supabase security advisor
  after deployment. Classify unrelated pre-existing advisor warnings
  separately rather than expanding this ticket.

Documentation updates required during implementation:
- `docs/DATA_MODEL.md`: make the non-empty schedule invariant, atomic write
  boundary, compatibility fallback, and repair behavior explicit.
- `docs/RECURRENCE_RULES.md`: define repair range/anchor semantics and confirm
  that prior missing occurrences remain Unresolved rather than being marked
  automatically.
- `docs/AGENT_RESOLVERS.md`: record schedule normalization/repair ownership and
  the rule that freshness cannot bypass invalid schedules.
- `docs/SUPABASE_WORKFLOW.md` or `docs/OPERATIONS.md`: record the gated hosted
  repair and post-deploy verification sequence if it is reusable.
- `STATUS.md`: mark Ticket 060 in progress before implementation and record
  sanitized repair counts, verification, deployment, and remaining risk when
  complete.

Suggested files:
- `supabase/migrations/*`
- `lib/db/behaviors.repo.ts`
- `lib/db/occurrences.repo.ts`
- `lib/db/occurrenceSyncState.repo.ts`
- `lib/db/behaviorDefinitionEvents.repo.ts`
- `lib/services/behavior.service.ts`
- `lib/services/occurrence.service.ts`
- `lib/services/occurrence-sync-state.service.ts`
- `lib/resolvers/occurrence.resolver.ts`
- `lib/resolvers/recurrence.resolver.ts` only if a reusable range contract is
  required; do not change supported recurrence semantics
- `lib/services/behavior-form.ts` for server-side schedule graph validation
- `lib/db/database.types.ts`
- `tests/behavior-create.service.test.ts`
- `tests/behavior-definition.service.test.ts`
- `tests/occurrence.resolver.test.ts`
- `tests/occurrence.service.test.ts`
- `tests/occurrence-sync-state.service.test.ts`
- `tests/recurrence.resolver.test.ts`
- new focused migration/RPC tests under `tests/`
- `docs/DATA_MODEL.md`
- `docs/RECURRENCE_RULES.md`
- `docs/AGENT_RESOLVERS.md`
- `docs/SUPABASE_WORKFLOW.md` or `docs/OPERATIONS.md`
- `STATUS.md`

Out of scope:
- New stored statuses, automatic Not Completed/missed decisions, bulk status
  actions, admin repair dashboards, user-facing database diagnostics, schedule
  history reconstruction, reminder sends for past occurrences, calendar sync,
  PWA/offline work, AI coaching, or unrelated Supabase advisor cleanup.

---

## Ticket 061: Export prompt library for external AI analysis

Add a copyable prompt library to the Export & Import screen so users can hand
a Cadence export to their own AI assistant with prompts that use the full
breadth of exported data correctly.

Context:
- Promoted from `docs/FEATURE_IDEAS.md` "Export Prompt Library For External AI
  Analysis".
- Exports already carry more analyzable structure than most users will think
  to ask about: occurrence snapshots, append-only `status_events` with
  `recorded_at`, `effective_at`, and `revises_event_id`, behavior definition
  history, schedules and time slots, categories, opt-in occurrence notes, and
  reminder delivery records in BehaviorLog `data/interventions.jsonl`.
- The Markdown AI summary already teaches agents core semantics (snapshots vs
  status history, Unresolved is not failure). The prompt library is the
  user-facing counterpart: ready-made questions that respect those semantics.

Product decisions for this ticket:
- V1 templates are static text. No template is generated from user data and no
  template interpolates per-user values. The selected export already carries
  the range.
- Templates stay provider-generic. They may reference "your calendar, email,
  sleep, or location context your assistant already has" but must not name
  external services or imply Cadence connects to them.
- Prompt templates are UI-only. They are not added to exported bundles, the
  BehaviorLog manifest, or the AI summary in this ticket.
- Every template that touches status data must encode the core semantics:
  Unresolved is missing decision data rather than failure, occurrence rows are
  current snapshots, `status_events` is the correction/chronology source of
  truth, and local analysis uses `local_date` plus the IANA timezone.
- Templates that depend on optional data (notes, interventions, definition
  history) must say which export option or format provides it, so users are
  not confused when a JSONL/CSV export lacks that data.

Prompt template set (final copy authored during implementation; each template
must cover the listed intent and data grounding):

1. Notes-explained failures: find recurring reasons in occurrence notes for
   Not Completed occurrences, cluster them into themes, and rank themes by
   frequency and by which behaviors they affect. Requires include-notes.
2. Weekday and time-of-day dips: compare adherence by weekday and by schedule
   slot label to find systematic low windows, using `local_date` and the
   exported timezone rather than UTC.
3. Category comparison: compare adherence and Unresolved counts across
   categories and identify which category carries the most undecided
   occurrences rather than the most failures.
4. Logging chronology and batching: use `status_events.recorded_at` versus
   occurrence scheduled times to determine whether decisions are logged near
   the occurrence or batched later, and whether batching correlates with more
   Not Completed or corrected decisions.
5. Correction patterns: follow `revises_event_id` chains to find which
   behaviors get corrected most, in which direction, and how long after the
   first decision corrections happen.
6. Reminder effectiveness: using BehaviorLog `data/interventions.jsonl`,
   compare resolution and completion on occurrences with delivered reminders
   versus without, split by channel, without treating correlation as proof.
7. Definition drift: use behavior definition history to segment a behavior's
   occurrences by definition period before comparing adherence across time,
   instead of treating a renamed behavior as one unchanged behavior.
8. Decision debt: profile Unresolved occurrences by behavior and age to show
   where Needs decision items accumulate, treating them as missing data and
   suggesting which behaviors need an easier decision moment.
9. Schedule load and overcommitment: relate the number of scheduled
   occurrences per day to that day's adherence and identify whether heavier
   days degrade completion, suggesting candidates to reschedule or drop.
10. Behavior lifecycle: compare each behavior's early adherence after creation
    (using its baseline definition event time) against later periods to
    detect novelty decay or slow-start patterns.
11. Realistic timing: where `effective_at` is present, compare stated
    completion times against scheduled times and suggest schedule times that
    match when the user actually does the behavior.
12. Cross-source context: ask the user's own assistant to compare adherence
    dips against calendar, travel, sleep, or similar context it already has
    access to, explicitly scoped to user-approved sources and with Cadence
    data as the adherence source of truth.

Acceptance criteria:

UI structure and design conventions (per `DESIGN.md` and the existing
`components/export/ExportPanel.tsx` vocabulary):
- The prompt library renders as one more subsection of the Export
  super-section, after AI summary, inside the existing `gap-8` subsection
  stack: `text-xl leading-tight` heading ("Analysis prompts" or similar
  factual label), with an `mt-2`/`mt-3` muted intro (`text-sm
  text-muted-readable`, `max-w-3xl`) explaining that prompts are copied into
  the user's own external assistant alongside an export.
- The sensitivity disclosure is one plain muted sentence in that intro area,
  matching the Downloads section's existing definition-history note. No
  warning boxes, no Rust Signal (informational, not caution), no icons
  (Export page controls remain icon-free).
- The twelve templates render as unboxed list rows separated by single inner
  1px Ash Line dividers (`divide-y`, no outer border, per the
  One-Line-Per-Boundary Rule) at the 16px airy row tier used by export
  download rows.
- Each row is a native `details`/`summary` disclosure using the shared
  disclosure-trigger class, per the product's standard disclosure pattern.
  Collapsed rows show the template title (`text-sm font-bold
  text-foreground`) and a one-line muted purpose sentence, mirroring the
  download rows' label/description rhythm.
- Expanded content shows: a muted requirements line stating which export
  format and options the prompt needs (sentence case, factual), the full
  prompt text in a bordered Cold Surface preformatted panel matching the AI
  summary preview treatment (`border border-line bg-surface p-4 text-sm
  whitespace-pre-wrap`), and a Copy prompt control.
- Copy prompt uses the underlined text-action vocabulary
  (`product-action`, min 44px tap target on mobile) and the
  MarkdownSummaryActions clipboard pattern: async clipboard write with an
  adjacent `aria-live="polite"` status showing Copied or Copy unavailable.
  No filled or boxed button chrome.
- Square corners, no shadows, no new colors, IBM Plex Sans only; body and
  helper copy in sentence case per the Uppercase Limit Rule. The section
  stacks single-column on mobile like the rest of the Export screen.
- Template content is defined in one typed module, not inline in the panel
  component, so copy review and future reuse stay simple.
- All templates use Cadence status vocabulary exactly: Unresolved, Completed,
  Not Completed, Needs decision.
- No database schema, migration, export resolver output, or API route changes.
- Tests cover template invariants: required semantics phrases for
  status-touching templates, required format/option guidance for
  optional-data templates, no external service names, and stable template ids.
- Component tests cover render and copy behavior of the new section.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, and
  `npm run build`.

Documentation updates required during implementation:
- `docs/EXPORT_FORMATS.md`: add a prompt library section describing placement,
  static-template posture, and the sensitivity disclosure.
- `docs/UI_SPEC.md`: describe the Export & Import prompt library section.
- `DESIGN.md`: add the prompt library rows to the Export Panels component
  section.
- `docs/FEATURE_IDEAS.md`: mark the idea implemented by Ticket 061.
- `STATUS.md`: track progress and completion.

Suggested files:
- `lib/export-prompts.ts` (new typed template module)
- `components/export/PromptLibraryPanel.tsx` (new)
- `components/export/ExportPanel.tsx` or `app/(app)/export/page.tsx` for
  placement
- `tests/export-prompts.test.ts` (new)
- `docs/EXPORT_FORMATS.md`
- `docs/UI_SPEC.md`
- `DESIGN.md`
- `docs/FEATURE_IDEAS.md`
- `STATUS.md`

Out of scope:
- Prompt generation from user data, per-user interpolation, embedding prompts
  in exported bundles or the AI summary, in-app AI analysis or chat, direct
  integrations with calendar/email/wearables, provider-specific instructions,
  and any change to export content or adherence semantics.

---

## Future ticket: Workspace restructuring

Move toward the target composable architecture only when needed by marketing,
desktop/mobile, or shared-core work.

Target shape:

```text
apps/
  app/
  marketing/
  desktop/
  mobile/
packages/
  core/
  db/
  ui/
  config/
```

Acceptance criteria should include:
- Preserve all current authenticated app routes and behavior.
- Preserve Supabase, Sequenzy, Vercel, test, and drift-check workflows.
- Start with npm workspaces unless Turborepo is justified.
- Extract `packages/core` before broader UI sharing when a second runtime needs
  the logic.
- Keep `packages/ui` focused on tokens and primitives first because future
  surfaces may use different frameworks.

---

## Deferred work

PWA caching, offline timeline access, local pending status changes, and sync conflict handling are not part of the v1 ticket sequence.

See `/docs/FUTURE_UPDATES.md`.
