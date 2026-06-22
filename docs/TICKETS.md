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
- Homepage leads with BehaviorLog as the standard.
- Cadence is presented as the demonstration product and main brand object.
- Use the existing Cadence square ledger visual system and keep the current
  Cadence mark.
- Add a quieter BehaviorLog companion mark.
- Use real Cadence product screenshots or static captures where possible,
  using demo or sanitized data only.
- `/docs` is agent-first technical documentation, useful to agents first and
  humans second.
- `/about` covers philosophy, governance, scope boundaries, and open-source
  posture for launch.
- Include primary CTAs:
  - Try Cadence
  - Read the Standard
  - Download Example Bundle
  - View on GitHub
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
