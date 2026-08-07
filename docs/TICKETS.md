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

Settled implementation decisions:
- Full JSON and BehaviorLog include behavior definition history by default;
  there is no separate history option.
- Events include full previous/next title and description text plus canonical
  `changed_fields`; the exporter does not synthesize a text diff.
- `reason` support is schema-only for normal Behavior form changes. Import and
  restore paths may record machine-readable provenance.
- Import and restore create local baselines or transitions from the current
  exported definition. They validate but do not replay the earlier
  Cadence-specific revision trail.

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

Settled implementation decisions:
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

## Ticket 062: Interaction audit P3 traceability and narrow-screen follow-up

Close the locally actionable P3 findings from the 2026-07-22 exhaustive
interaction audit without making the separate product decision about
account-specific onboarding dismissal.

Context:
- Tickets 001-061 are complete.
- The interaction-audit remediation pass intentionally stopped after P0-P2
  findings and preserved IA-024 through IA-028 as a research backlog.
- IA-024 is human-gated because changing the browser-local onboarding
  dismissal key to account-specific storage changes the product contract.
- IA-025 through IA-028 can be corrected locally without provider writes,
  schema changes, new routes, or product-scope expansion.

Scope:
- IA-025: align registered trigger and variant labels with the visible controls
  and the task-based user guides.
- IA-026: map `INT-MKT-010` to every source-inventory entry that implements it,
  including the marketing footer in `BaseLayout.astro`.
- IA-027: audit direct test-coverage declarations against the cited tests.
  Add focused UI assertions where they are small and valuable; otherwise
  classify coverage honestly as indirect or manual and cite the real evidence
  owner.
- IA-028: prevent the Settings Profile email from causing document-level
  horizontal overflow at the supported 320px minimum viewport.
- Reconcile stale status text for the already-deployed IA-002 migration and
  already-ready app and marketing deployments using read-only provider
  evidence.

Acceptance criteria:
- Registry labels name controls users can find verbatim, while grouped variants
  remain explicit where one interaction has multiple visible controls.
- The `BaseLayout.astro` source inventory includes `INT-MKT-010`.
- Every `direct` coverage declaration is backed by a cited test that renders or
  activates the registered interaction. Adjacent resolver, service, route, or
  artifact checks are labeled `indirect` unless a focused UI test closes the
  gap.
- Settings remains within a 320px viewport with a long account identifier and
  still follows the single-column Settings design contract.
- IA-024 remains unchanged and is recorded as the only product-decision-gated
  audit item.
- No database migration, hosted mutation, provider send, new route, stored
  status, or onboarding behavior change is introduced.
- Update `interaction-registry.json`, the interaction-audit remediation ledger,
  `docs/OPERATIONS.md`, and `STATUS.md` to match the verified current state.
- Run `npm run agents:check`, `npm run interactions:check`,
  `npm run resolvers:check`, `npm run design-system:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.
- Run focused Settings/registry tests and inspect Settings at 320px and 390px
  when a local authenticated browser fixture is available. If browser QA is
  environment-blocked, record the exact limitation and retain automated layout
  evidence.

Out of scope:
- Deciding or implementing account-specific onboarding dismissal (IA-024),
  rewriting the frozen pre-remediation finding report, changing provider
  configuration, redeploying an already-ready production build, or expanding
  the product beyond the existing v1 surfaces.

---

## Ticket 063: Locust load-test contract and authenticated protocol spike

Establish the repository contract for registry-derived load testing and prove
that Locust can exercise Cadence's real authenticated HTTP paths without
adding a permanent product API for test traffic.

Context:
- Tickets 001-062 are complete.
- `interaction-registry.json` is the canonical inventory of implemented user
  interaction intents, while `docs/UX_JOURNEY_INVENTORY.md` and
  `docs/USER_FLOWS.md` define realistic journey order and success semantics.
- The live registry currently contains 85 interactions. Some interactions
  produce network traffic, while form drafts, disclosures, focus movement,
  clipboard writes, local preferences, browser permission prompts, and other
  client-only effects do not.
- Locust's `HttpUser` preserves cookies and makes HTTP requests but is not a
  browser: it does not render the page, execute Cadence client JavaScript, or
  automatically load page assets.
- Cadence mutations use Next.js Server Actions. Their generated action
  identifiers must not be hard-coded because they may change between builds.
- Ticket 062 already occupies the number originally proposed for this slice;
  the Locust roadmap therefore starts at Ticket 063.

Product and architecture decisions:
- Keep `interaction-registry.json` focused on user intent. Store HTTP
  workload metadata in a separate load-test manifest keyed by stable
  interaction ID.
- Classify every live interaction as exactly one of:
  `loadable_http`, `browser_only`, `external_provider`,
  `destructive_serial_only`, or `not_load_bearing`.
- Permit one interaction to map to zero, one, or multiple HTTP requests.
  Conversely, permit one shared HTTP request to support multiple interaction
  variants when the registry says they have the same user intent.
- Use request names that include the interaction ID and normalized operation,
  such as `INT-TIMELINE-005 POST /timeline server-action`, so Locust statistics
  remain traceable to the canonical registry.
- Do not add a general `/api/load-test/*` route, service-role browser path, RLS
  bypass, stable mutation API, or production authentication shortcut solely
  to simplify Locust.
- Keep browser-only behavior in the existing browser/UX testing layer. The
  load suite must not claim to verify rendering, hydration, focus, clipboard,
  sound, notification permission, mobile layout, or accessibility.
- Pin the selected Locust version and every direct Python dependency. Do not
  use an unbounded dependency range.

Scope:
- Add a concise load-testing architecture document that defines:
  - purpose and non-goals;
  - registry-to-workload classification;
  - environment safety levels;
  - identity, secret, and artifact handling;
  - request naming and semantic response assertions;
  - provisional performance and integrity gates;
  - provider approval boundaries;
  - the dependency graph for Tickets 064-066.
- Add a Python/Locust directory that can be installed independently from the
  Next.js workspace and invoked through project-local npm scripts.
- Add a machine-readable interaction workload manifest and a validator that:
  - loads the live registry;
  - requires exactly one load classification for every interaction ID;
  - rejects unknown or duplicate IDs;
  - requires a reason for every non-loadable entry;
  - requires route, method, expected result, environment, data
    preconditions, and cleanup ownership for every loadable entry;
  - rejects destructive interactions from ordinary mixed-workload profiles;
  - does not duplicate the registry's intent, risk, effect, or user-guidance
    prose.
- Prove four request types locally:
  1. one public document request;
  2. one authenticated protected-page document request;
  3. one authenticated structured-export download;
  4. one authenticated Timeline occurrence-status Server Action submission.
- For the Server Action proof:
  - fetch the current server-rendered page or action metadata;
  - discover the current build's generated action fields dynamically;
  - submit the exact user-owned occurrence ID, expected current state, and
    status payload through the real action;
  - verify both the action response and the persisted occurrence/status-event
    result;
  - prove a stale or cross-owner payload is rejected through normal auth,
    service, resolver, RPC, and RLS boundaries.
- Record the exact limitation if current React/Next.js form output cannot be
  replayed safely from Locust. In that case, stop before adding a test-only
  product route and revise the mutation-load design through a follow-up
  decision.

Acceptance criteria:
- A documented local command starts Locust in web-UI mode for exploration and
  a separate headless command runs the protocol smoke.
- The smoke uses one disposable synthetic account and leaves no product data
  or auth user after cleanup.
- Protected-page validation fails when the response is a login redirect or
  login document even if an intermediate response has a successful status.
- Export validation checks content type, disposition, non-empty body, and a
  small format-specific semantic marker rather than accepting HTTP status
  alone.
- Server Action validation proves the requested status transition and the
  resulting append-only event, not merely a sub-400 response.
- Locust logs and generated reports contain no cookies, passwords, access
  tokens, refresh tokens, service-role keys, user IDs, emails, behavior
  titles, occurrence notes, push endpoints, provider payloads, or uploaded
  bundles.
- Generated run artifacts are ignored by git. Only sanitized aggregate
  summaries may be committed.
- The manifest validator passes against the current interaction registry and
  fails when a fixture removes, duplicates, or misclassifies an interaction.
- A pull-request-safe smoke command is bounded to one user and local targets.
  No default script can point at production.
- `npm run agents:check`, `npm run interactions:check`,
  `npm run resolvers:check`, `npm run lint`, `npm run typecheck`,
  `npm run test`, `npm run build`, the Python manifest tests, and the local
  Locust protocol smoke pass.

Documentation updates required during implementation:
- Create `docs/LOAD_TESTING_PLAN.md`.
- Add the local installation and smoke workflow to `docs/OPERATIONS.md`.
- Add load-test artifact and secret handling to `.gitignore` and the runbook.
- Update `docs/INTERACTION_REGISTRY.md` with the companion-manifest rule,
  without adding load metadata to the canonical interaction schema.
- Update `STATUS.md` when the ticket starts and completes.

Suggested files:
- `load-tests/requirements.txt`
- `load-tests/locustfile.py`
- `load-tests/cadence_load/__init__.py`
- `load-tests/cadence_load/assertions.py`
- `load-tests/cadence_load/forms.py`
- `load-tests/cadence_load/registry.py`
- `load-tests/scenarios/interaction-map.json`
- `load-tests/tests/test_interaction_map.py`
- `load-tests/tests/test_response_assertions.py`
- `scripts/check-load-test-interactions.mjs` if the canonical drift check is
  kept in the existing Node governance layer
- `package.json`
- `.gitignore`
- `docs/LOAD_TESTING_PLAN.md`
- `docs/INTERACTION_REGISTRY.md`
- `docs/OPERATIONS.md`
- `STATUS.md`

Out of scope:
- High-concurrency runs, hosted Supabase writes, Vercel load, distributed
  workers, Google OAuth automation, real email or browser-push sends,
  destructive import/restore/account deletion load, UI rendering assertions,
  performance optimization, database migrations, and new product routes.

---

## Ticket 064: Synthetic load identities and read-workload baseline

Build the disposable many-account fixture lifecycle and the first realistic
public/authenticated read workloads, then establish a repeatable local capacity
baseline.

Dependency:
- Ticket 063 must be complete, including a passing authenticated protocol smoke
  and a validated interaction workload manifest.

Context:
- Cadence supports many independent accounts, but each account is
  single-player. Sharing one account across a large swarm would distort RLS,
  per-user cache behavior, occurrence freshness, and realistic query shapes.
- Supabase Auth applies endpoint and IP-based rate limits. Account creation and
  sign-in traffic must therefore be provisioned before the timed workload
  unless a separate run is explicitly measuring Auth.
- The existing `/auth/test-login` route is local/dev-only and blocked by
  production runtime guards. Load provisioning must not weaken those guards.
- `npm run smoke:rls` already proves a two-user ownership boundary. Load
  fixtures should reuse its safety posture: service-role access only for
  setup/cleanup, and ordinary signed-in clients plus RLS for product access.

Product and architecture decisions:
- Assign one disposable Supabase Auth identity and one cookie jar to each
  active Locust user.
- Provision accounts, sessions, and data before starting Locust statistics.
  Do not include user creation, password sign-in, or initial cookie generation
  in normal route-capacity measurements.
- Store temporary session material only in a run-specific file outside tracked
  source, with owner-only filesystem permissions. Delete it during cleanup
  even when the workload fails.
- Name disposable auth accounts with an exact run-scoped
  `cadence-load-...@example.invalid` pattern that cannot match ordinary users.
- Require an explicit target classification: `local`, `hosted_staging`, or
  `hosted_production`. Ticket 064 supports `local` only.
- Use a production build of the Next.js app where practical. Document any
  difference between local persistent Node execution and Vercel serverless
  behavior.

Fixture cohorts:
- Empty account:
  - profile and default categories;
  - no behaviors or occurrences.
- Typical daily account:
  - 8-12 active behaviors;
  - 1-2 archived behaviors;
  - daily, weekly, every-N-day, every-N-week, and monthly recurrence coverage;
  - exact and range schedule slots;
  - current Completed, Not Completed, and Unresolved occurrences;
  - prior Unresolved occurrences for Needs decision;
  - sparse synthetic notes;
  - email reminders disabled and no push subscription.
- Review-heavy account:
  - at least 90 local days of occurrence/status history;
  - status corrections with valid `revises_event_id` chains;
  - behavior-definition history;
  - behavior-date review data across 7-, 30-, and 90-day ranges.
- Export-heavy account:
  - active and archived behaviors;
  - one year of bounded synthetic history;
  - enough status events, notes, reminder history, and definition history to
    produce non-trivial JSONL, CSV, JSON, BehaviorLog, and Markdown outputs;
  - no real personal or provider data.
- Heavy schedule account:
  - 30-50 behaviors and multiple schedule slots;
  - still within supported product contracts;
  - used only in explicitly tagged capacity profiles, not the default mix.

Scope:
- Add run-scoped provision, session preparation, seed, integrity, and cleanup
  scripts.
- Make provisioning idempotent for one run ID and cleanup exact-targeted:
  - repeated provisioning does not create uncontrolled duplicates;
  - cleanup refuses an empty, malformed, wildcard, or overly broad run ID;
  - cleanup deletes only users and rows owned by the exact synthetic run;
  - aggregate counts are reported without identifiers.
- Add Locust users for:
  - public Login/Terms/Privacy/Trust documents;
  - protected Timeline, Behaviors, Export, and Settings document loads;
  - Timeline future-day query states;
  - Behaviors review range and selected-day reads;
  - JSONL, CSV, full JSON, and BehaviorLog download reads.
- Use realistic task weights and think time from the documented personas and
  journeys, while labeling the weights as initial product assumptions rather
  than observed user analytics.
- Add local load shapes:
  - smoke: 1 user for 2-5 minutes;
  - baseline: 5 and 10 users for 10 minutes each;
  - read ramp: 10, 25, 50, and 100 users with bounded plateaus;
  - recovery: return to the initial user count and confirm latency/error
    recovery.
- Name variable query paths consistently so dynamic IDs and dates do not
  fragment Locust statistics.
- Capture CSV history, failures, exceptions, and an HTML report under one
  ignored run directory.

Acceptance criteria:
- Provisioning produces the requested number of independent accounts and
  reports only cohort/count summaries.
- Every timed protected request uses an ordinary authenticated session and
  product RLS. No service-role key is available to Locust workers.
- A virtual user fails fast when no unique identity is available; identities
  are not silently shared.
- Default profiles never enable email sends, create push subscriptions, invoke
  process secrets, or submit destructive actions.
- Route assertions distinguish expected redirects, authenticated content, and
  semantic page failures.
- Exports contain only synthetic data belonging to the assigned account.
- The initial report records achieved requests per second, p50/p75/p95/p99
  latency, failure ratio, response bytes, cohort mix, local hardware/runtime,
  Next.js mode, Supabase mode, and warm/cold caveats.
- Provisional nominal gates are:
  - zero cross-account data;
  - zero unexpected `5xx` responses;
  - less than 0.5% unexpected request failures;
  - p95 no worse than twice the calibrated one-user warm baseline;
  - recovery to within 10% of the pre-ramp baseline after load returns to the
    initial level.
- Post-run integrity finds no duplicate occurrences, invalid owner
  relationships, false-fresh occurrence horizons, or unexpected reminder
  deliveries.
- `npm run smoke:rls` passes against the local target after the run.
- Cleanup removes every run-created auth user, product row, session artifact,
  and report copy containing sensitive session material. Sanitized aggregate
  result artifacts remain.
- Full repository verification plus Python unit tests and the local smoke,
  baseline, and bounded ramp pass.

Documentation updates required during implementation:
- Expand `docs/LOAD_TESTING_PLAN.md` with cohorts, weights, load shapes, gates,
  and local-vs-hosted interpretation.
- Create `docs/LOAD_TESTING_RUNBOOK.md` with setup, preflight, run, abort,
  integrity, cleanup, and failure-recovery procedures.
- Document the reusable local load lifecycle in `docs/OPERATIONS.md`.
- Update `docs/SUPABASE_WORKFLOW.md` with the synthetic-load rule: service role
  for exact setup/cleanup only, ordinary clients for timed access, no hosted
  use without authorization.
- Append the sanitized baseline to `docs/PERFORMANCE_SPEED_LOG.md`.
- Update `STATUS.md` when the ticket starts and completes.

Suggested files:
- `load-tests/cadence_load/auth.py`
- `load-tests/cadence_load/data.py`
- `load-tests/cadence_load/shapes.py`
- `load-tests/cadence_load/users/public.py`
- `load-tests/cadence_load/users/reader.py`
- `load-tests/scenarios/profiles.json`
- `load-tests/tests/test_identity_pool.py`
- `load-tests/tests/test_profiles.py`
- `scripts/load-test-provision.mjs`
- `scripts/load-test-seed.mjs`
- `scripts/load-test-integrity.mjs`
- `scripts/load-test-cleanup.mjs`
- `tests/load-test-lifecycle.test.ts`
- `package.json`
- `docs/LOAD_TESTING_PLAN.md`
- `docs/LOAD_TESTING_RUNBOOK.md`
- `docs/OPERATIONS.md`
- `docs/SUPABASE_WORKFLOW.md`
- `docs/PERFORMANCE_SPEED_LOG.md`
- `STATUS.md`

Out of scope:
- Mutating user workloads, Auth-capacity testing, hosted targets, Vercel,
  provider processing, production data, schema changes made only to support
  fixtures, performance remediation, destructive interactions, and claims
  about production capacity.

---

## Ticket 065: Mixed mutation, contention, and integrity load profiles

Extend the proven read harness to the common write paths and system contention
cases, with automatic integrity verification and strictly local provider
isolation.

Dependencies:
- Tickets 063 and 064 must be complete.
- The authenticated Server Action protocol must be proven against the current
  Next.js build.
- The synthetic identity lifecycle, baseline gates, and cleanup must be
  reliable before mutation load begins.

Context:
- The registry currently identifies twelve interactions with database-write
  effects. Ordinary load should focus on status decisions, occurrence notes,
  Behavior lifecycle changes, timezone saves, and synthetic exports.
- Cadence's reminder, occurrence, status-event, and behavior-definition
  contracts are idempotent or append-only in specific ways. Load testing must
  validate those contracts after concurrent execution rather than evaluating
  latency alone.
- Needs decision remains derived from Unresolved plus local date. No load
  scenario may invent or persist a `needs_decision` or missed status.
- Real Sequenzy email, Web Push, Google OAuth, and third-party repository
  traffic must remain outside the workload.

Workload coverage:
- Daily tracker:
  - read Timeline;
  - mark an Unresolved occurrence Completed or Not Completed;
  - Clear decision back to Unresolved when the scenario owns a suitable row;
  - save or edit a bounded synthetic occurrence note;
  - verify the refreshed row and status-event result.
- Behavior maintainer:
  - create a minimal valid behavior;
  - update title, recurrence, or one schedule field;
  - archive and restore the same run-owned behavior;
  - verify occurrence sync remains stale until repair and becomes fresh only
    after valid successful repair.
- Reflective reviewer:
  - open a selected behavior/date;
  - change one status or note through the Behaviors action;
  - verify counts and review data reconcile.
- Settings:
  - save an unchanged timezone as the common low-write path;
  - run changed-timezone synchronization only in a separately tagged,
    low-frequency profile because it updates active behaviors and future
    Unresolved occurrences.
- Portability:
  - mix structured export downloads at a low rate against concurrent
    Timeline/Behaviors activity;
  - keep import preview/apply, restore preview/apply, and account deletion out
    of the ordinary swarm.
- System overlap:
  - run one fixed-count operator user for protected occurrence-horizon sync;
  - test reminder-processing claim/idempotence only against seeded synthetic
    deliveries and a local fake Sequenzy endpoint;
  - create no active browser-push subscriptions, so Web Push is never called.
- Same-account contention:
  - use two independent sessions for one synthetic account to submit
    coordinated writes to the same occurrence;
  - require one valid transactional result and the documented idempotent,
    stale, or concurrent-duplicate outcome for the competing request;
  - verify no lost status event, invalid revision chain, duplicate reminder
    cancellation, or cross-owner effect.

Load shapes:
- Mixed baseline: realistic read/write weights at 5 and 10 users.
- Ramp: 10, 25, 50, and 100 users with a minimum stable plateau at each step.
- Spike: stable baseline followed by a rapid 10x increase, bounded hold, and
  recovery.
- Soak: 25-50 users for 1-2 hours, sized below the proven breakpoint.
- Breakpoint: increase in bounded steps until an automatic gate fails or the
  authorized local ceiling is reached.
- Contention: coordinated small-user scenarios that maximize write collision
  rather than raw request volume.
- Operator overlap: run occurrence sync and fake-provider reminder processing
  during a stable mixed workload.

Automatic abort conditions:
- Any cross-account data exposure or write.
- Any real provider request attempt.
- Unexpected account deletion, restore apply, or import apply.
- Sustained unexpected `5xx` ratio above the documented threshold.
- Repeated database connection refusal, false-fresh occurrence horizon, or
  integrity-check failure.
- Run-directory/session leakage or inability to identify the exact cleanup
  target.
- A configured maximum request count, runtime, users, or requests-per-second
  ceiling is reached.

Acceptance criteria:
- Each mutation is performed against state owned by that Locust user and is
  semantically verified after submission.
- Normal task weights keep reads dominant. Mutation weights, think times, and
  achieved requests per second are recorded in the report.
- Dynamic occurrence, behavior, and date identifiers are grouped under stable
  interaction-ID request names while the exact IDs remain out of reports.
- Status transitions preserve the stored vocabulary:
  `unresolved`, `completed`, and `not_completed`.
- Occurrence generation remains unique and preserves past/resolved history.
- Status-event history remains append-only, owner-consistent, ordered, and
  valid under idempotent and competing submissions.
- Pending reminders cancel when an occurrence resolves; eligible strictly
  future reminders may reconcile when a decision is cleared; due/past rows do
  not reactivate.
- Behavior create/update/archive/restore leaves an owner-consistent,
  non-empty schedule graph and does not create definition-history events for
  schedule-only changes.
- Changed-timezone scenarios preserve past and resolved occurrences.
- Reminder processing against the local fake provider proves claim,
  duplicate-send avoidance, and final status without contacting Sequenzy or
  Web Push.
- Soak runs show no unbounded growth in failures, memory, open database
  connections, pending processing claims, or orphaned synthetic rows.
- The result identifies the highest sustainable local user count and achieved
  requests per second under the calibrated nominal gates. It does not label
  that result as production capacity.
- Post-run aggregate checks prove:
  - zero cross-owner rows;
  - zero unexpected duplicate occurrences or deliveries;
  - zero invalid status-event or definition-event chains;
  - zero false-fresh horizons;
  - zero provider sends;
  - exact cleanup counts.
- Full repository verification, Python tests, focused existing resolver/service
  tests, local database integrity checks, and every new bounded load profile
  pass.

Documentation updates required during implementation:
- Expand `docs/LOAD_TESTING_PLAN.md` with the final workload mix, state
  machines, contention rules, and abort gates.
- Expand `docs/LOAD_TESTING_RUNBOOK.md` with fake-provider setup and recovery
  from interrupted mutation runs.
- Add the resulting local capacity curve and bottleneck evidence to
  `docs/PERFORMANCE_SPEED_LOG.md`.
- Update `docs/NOTIFICATION_SPEC.md` only if a reusable fake-provider
  operations seam is introduced; do not change reminder product semantics.
- Update `docs/AGENT_RESOLVERS.md` only if new test orchestration touches an
  owning service boundary; load code must not become an allowed product caller
  of resolvers or repositories.
- Update `STATUS.md` when the ticket starts and completes.

Suggested files:
- `load-tests/cadence_load/actions.py`
- `load-tests/cadence_load/integrity.py`
- `load-tests/cadence_load/users/daily.py`
- `load-tests/cadence_load/users/maintainer.py`
- `load-tests/cadence_load/users/reviewer.py`
- `load-tests/cadence_load/users/exporter.py`
- `load-tests/cadence_load/users/operator.py`
- `load-tests/tests/test_action_payloads.py`
- `load-tests/tests/test_load_shapes.py`
- `scripts/load-test-fake-sequenzy.mjs`
- `scripts/load-test-integrity.mjs`
- `tests/load-test-lifecycle.test.ts`
- focused existing resolver/service/route tests as required
- `docs/LOAD_TESTING_PLAN.md`
- `docs/LOAD_TESTING_RUNBOOK.md`
- `docs/PERFORMANCE_SPEED_LOG.md`
- `docs/NOTIFICATION_SPEC.md` if required
- `docs/AGENT_RESOLVERS.md` if required
- `STATUS.md`

Out of scope:
- Real provider sends, Google OAuth load, permanent load-test APIs, production
  traffic, provider rate-limit tuning, schema changes without product need,
  import apply swarms, restore apply swarms, account deletion swarms, browser
  rendering, accessibility conclusions, and implementing performance fixes
  discovered by the test.

---

## Ticket 066: Authorized hosted capacity run and evidence report

Execute the proven Locust suite against a production-like hosted staging
environment only after provider authorization, then publish a sanitized
capacity and bottleneck report.

Dependencies:
- Tickets 063-065 must be complete with passing local smoke, baseline, mixed,
  spike, soak, contention, integrity, and cleanup evidence.
- The owner must identify the exact Vercel plan, Supabase project/tier,
  hostname, cost ceiling, and staging isolation posture.
- The hosted target must use synthetic accounts and data only.

Hard provider gates:
- Current Vercel policy permits load testing only on Enterprise plans and
  requires prior coordination with Vercel. If the target plan is not
  Enterprise or approval is not documented, do not run Locust against any
  Vercel Preview, Staging, or Production deployment.
- The Vercel approval request must provide the planned start/end time,
  estimated maximum requests per second, target hostname, source geography,
  source IPs, distributed/localized posture, and Fluid Compute posture when
  applicable.
- Current Supabase production guidance recommends staging for load tests. For
  heavy or prolonged hosted load on Team/Enterprise, contact Supabase support
  with at least two weeks notice and provide the expected traffic window and
  profile.
- Provider approval does not authorize real email, Web Push, Google OAuth, or
  unrelated third-party traffic.
- A user request to "run the test" does not waive these provider gates. Record
  a blocked ticket state when approval or an isolated target is missing.

Hosted environment contract:
- Prefer a dedicated application staging hostname and dedicated Supabase
  staging project with migration history congruent to git.
- Match production-relevant regions, environment variables, runtime mode,
  schema, RLS, indexes, and synthetic data volume without copying real user
  records.
- Use local or isolated fake provider endpoints for Sequenzy-dependent paths
  and no active browser-push subscriptions.
- Keep service-role and process secrets outside Locust source, reports, command
  history, and worker output.
- Pre-provision identities and sessions outside timed statistics.
- Protect the staging deployment from unrelated traffic while allowing only
  the approved load-generator sources.

Preflight:
- Record git commit, deployment ID, target hostname, Vercel region/runtime,
  Supabase project ref in private task notes, Supabase region/compute tier,
  migration congruence, fixture cohort counts, Locust version, worker count,
  source regions/IPs, maximum users/RPS/runtime, cost ceiling, and approval
  references.
- Run repository verification, local protocol smoke, local integrity, hosted
  `npm run smoke:rls`, hosted migration-list comparison, Supabase advisors,
  unauthenticated route smoke, authenticated one-user smoke, and exact cleanup
  dry run.
- Confirm monitoring retention and collection before traffic starts:
  - Locust CSV/HTML artifacts;
  - sanitized Cadence `performance_timing` spans;
  - Vercel request/function status, duration, invocation, memory/CPU, and cost
    evidence available on the plan;
  - Supabase CPU, memory, disk IOPS/throughput, database connections,
    PostgREST/Auth signals, and slow-query evidence.
- Establish a fresh one-user and ten-user hosted baseline before any ramp.

Execution:
- Run one bounded stage at a time: public/read baseline, authenticated read
  ramp, mixed mutation ramp, spike/recovery, soak, and contention/operator
  overlap.
- Require a human checkpoint between major stages. Do not automatically move
  from a safe baseline into breakpoint traffic.
- Start below the approved ceiling and stop at the first application,
  database, provider, integrity, cost, or policy gate.
- Record achieved requests per second rather than inferring capacity from
  virtual-user count.
- Separate cold/warm, cache-hit/miss, freshness-repair, and provider-stub
  samples where evidence permits.
- Do not change infrastructure size, indexes, queries, caches, or application
  code during the measurement run. File separate remediation tickets from the
  evidence afterward.

Acceptance criteria:
- Provider authorization and the exact hosted target are recorded before the
  first Locust request.
- No request reaches the current public production hostname unless the owner
  explicitly authorizes that hostname and Vercel approves it.
- No real user record, personal behavior data, personal note, provider
  subscription, or real recipient is created, read, mutated, exported, or
  logged.
- Nominal hosted gates are calibrated from the fresh hosted baseline and
  include:
  - zero cross-account access;
  - zero unexpected `5xx` at target load;
  - less than 0.5% unexpected failures at target load;
  - p95 within the documented route/action budget;
  - bounded p99 and timeout rate;
  - recovery to within 10% of baseline after a spike;
  - no sustained connection, CPU, memory, IOPS, throughput, or cost saturation;
  - zero data-integrity violations.
- The run identifies:
  - maximum tested and maximum sustainable virtual users;
  - achieved requests per second for each workload mix;
  - p50/p75/p95/p99 by interaction ID and route/action group;
  - failure/status distribution;
  - first breached gate and likely owning layer;
  - Vercel versus Supabase versus application bottleneck evidence;
  - cold-start, cache, occurrence-freshness, export-size, and contention
    observations;
  - recovery behavior and remaining headroom;
  - the limits of extrapolating staging evidence to production.
- Post-run hosted integrity, `npm run smoke:rls`, migration congruence, provider
  no-send proof, exact synthetic cleanup, and a final one-user recovery smoke
  pass.
- All raw artifacts remain ignored/private. Commit only aggregate,
  privacy-safe evidence.
- Create narrowly scoped follow-up tickets for proven bottlenecks. Do not
  implement fixes opportunistically in Ticket 066.

Documentation updates required during implementation:
- Finalize `docs/LOAD_TESTING_RUNBOOK.md` with provider approval templates,
  hosted preflight, human checkpoints, abort, rollback, and cleanup.
- Add the hosted environment and approval rules to `docs/VERCEL_WORKFLOW.md`,
  `docs/SUPABASE_WORKFLOW.md`, and `docs/OPERATIONS.md`.
- Append the sanitized capacity report to
  `docs/PERFORMANCE_SPEED_LOG.md` or create a dated report under
  `docs/qa/load-testing/` and link it from the performance log.
- Update `STATUS.md` with provider gates, execution state, results, cleanup,
  follow-up tickets, and remaining uncertainty.

Suggested files:
- `load-tests/cadence_load/shapes.py`
- `load-tests/scenarios/profiles.json`
- `load-tests/tests/test_hosted_guards.py`
- `scripts/load-test-preflight.mjs`
- `scripts/load-test-integrity.mjs`
- `scripts/load-test-cleanup.mjs`
- `docs/LOAD_TESTING_RUNBOOK.md`
- `docs/PERFORMANCE_SPEED_LOG.md`
- `docs/qa/load-testing/<YYYY-MM-DD>-hosted-capacity.md`
- `docs/VERCEL_WORKFLOW.md`
- `docs/SUPABASE_WORKFLOW.md`
- `docs/OPERATIONS.md`
- `STATUS.md`

Out of scope:
- Unapproved Vercel traffic, copying production user data, real provider sends,
  changing hosted schema outside migrations, production performance claims
  from local-only evidence, automatic infrastructure upgrades, opportunistic
  performance fixes, admin dashboards, product analytics/tracking, and
  expansion beyond Cadence's existing single-account product scope.

---

## Ticket 067: Launch cost guardrails and traffic-surge operations

Protect the owner from runaway infrastructure and provider charges, and create
a rehearsed protocol for legitimate usage surges, abusive traffic, provider
incidents, and application regressions before broad public launch.

Context:
- Ticket 065 proved local correctness, integrity, recovery, and bounded resource
  growth. Latency was the first local stress signal. It did not establish hosted
  cost or capacity.
- Ticket 066 remains the source of hosted staging capacity evidence when its
  target and provider approvals exist. Ticket 067 may implement conservative
  launch guardrails before Ticket 066 runs; later hosted evidence may tune them
  through a separate reviewed change.
- Current Vercel Spend Management can provide spend notifications and an
  optional hard limit that pauses projects. Exact availability, scope, pricing,
  default values, notification channels, and pause behavior must be rechecked
  against the owner's current plan before configuration.
- Current Supabase Pro cost controls include a Spend Cap for specific variable
  usage items. The cap does not cover every charge, including compute and some
  add-ons, and it does not provide fine-grained per-item budgets or threshold
  notifications. Recheck the current billing documentation and changelog before
  configuration.
- Platform DDoS, firewall, rate-limit, and challenge controls have distinct
  plan, billing, false-positive, and regional-counter behavior. Treat them as
  traffic controls, not as a complete billing guarantee.
- No provider control can guarantee zero unexpected charges. The ticket must
  document alert latency, already-incurred usage, uncovered billing categories,
  provider outages, and owner-approved availability-versus-cost tradeoffs.

Dependencies:
- Tickets 029-030 public hardening and privacy-safe runtime monitoring must
  remain intact.
- Tickets 063-065 local load and integrity evidence must remain passing.
- The owner must identify the current Vercel, Supabase, Sequenzy, domain, and
  any other billable provider plans and name the billing/incident contact.
- Provider-setting mutations, production firewall publication, project pauses,
  plan changes, purchases, and real incident actions require explicit owner
  authorization for the exact target.

Implementation strategy:
1. Build a sanitized launch cost inventory:
   - record each provider, plan, billing cycle, fixed cost, metered dimensions,
     included quota, overage rate, current baseline, billing owner, and official
     documentation URL;
   - include Vercel requests, transfer, function execution, builds, monitoring,
     firewall features, and project count;
   - include Supabase compute, database/disk, egress, Auth MAU, logs, backups,
     add-ons, project count, and every Spend Cap coverage gap;
   - include Sequenzy email delivery and any domain, logging, or alerting cost;
   - keep account identifiers, invoice details, payment data, secrets, and user
     data out of git-tracked artifacts.
2. Obtain an explicit owner risk policy:
   - monthly normal-operating budget;
   - warning, urgent, and emergency USD thresholds;
   - maximum acceptable unplanned spend;
   - acceptable outage duration if a hard cap pauses the app;
   - who may acknowledge alerts, enable emergency controls, pause service,
     change a limit, or resume traffic;
   - which notification channels have a tested human recipient and backup.
3. Configure provider-native cost controls where the current plan supports
   them:
   - Vercel spend alerts at every supported threshold, a tested notification or
     webhook path, and the owner-approved hard-limit/pause posture;
   - Supabase Spend Cap enabled when the owner chooses availability restriction
     over covered overage, plus explicit tracking of compute and other uncovered
     charges;
   - Sequenzy/provider sending limits or account alerts where available;
   - no automatic plan upgrade, add-on purchase, compute resize, or budget
     increase.
4. Add a privacy-safe cost and surge preflight/report command:
   - verify required cost-policy fields and provider-control evidence without
     reading or printing payment data or secrets;
   - report request/error/latency, function, database, Auth, egress, reminder,
     and provider-send signals needed by the response protocol;
   - fail closed on missing owners, thresholds, notification tests, rollback
     steps, or known uncovered-cost acknowledgement;
   - keep raw provider exports and alert payloads private. Commit only sanitized
     aggregate evidence.
5. Audit and implement bounded traffic controls for current expensive or
   sensitive paths:
   - inventory public documents, OAuth start/callback, protected app reads,
     export downloads, push subscription writes, Next.js Server Actions, and
     occurrence/reminder process routes separately by method and cost;
   - preserve the process routes' secret checks and batch ceilings;
   - replace reliance on per-runtime in-memory failure limits where distributed
     enforcement is required;
   - prefer provider-edge enforcement for anonymous abusive traffic when it is
     available and cheaper than executing application code;
   - stage candidate firewall rules in log-only mode, measure legitimate
     traffic, test Google OAuth and cron bypasses, then require a human review
     before publish;
   - use per-account or action-aware controls for authenticated expensive work.
     Do not apply one broad IP limit that can block households, schools, VPNs,
     accessibility tools, or shared networks;
   - return stable `429` and `Retry-After` behavior where application rate
     limiting applies. Do not silently drop successful user mutations.
6. Add narrowly scoped server-side circuit breakers for cost-amplifying work:
   - independently stop real email sends, browser-push sends, reminder batches,
     occurrence-sync batches, and large/repeated exports without disabling
     account access or ordinary Timeline decisions;
   - default every breaker to normal product behavior and keep it server-only;
   - log only a privacy-safe breaker name, state, reason code, and aggregate
     count;
   - document exact enable, verification, rollback, and recovery procedures;
   - update user-facing copy and the interaction registry only when a breaker
     changes a visible response.
7. Create a four-level surge and cost incident runbook:
   - Level 0, normal: review usage and alert delivery on a fixed cadence;
   - Level 1, warning: identify the source, compare against expected launch
     traffic, and increase observation without changing limits;
   - Level 2, urgent: enable scoped throttles or circuit breakers for the proven
     cost source while preserving core tracking when safe;
   - Level 3, emergency: enable provider attack controls or the owner-approved
     spend hard stop/project pause, notify users if availability changes, and
     contact provider support;
   - every level names entry/exit thresholds, decision owner, maximum response
     time, evidence to capture, prohibited actions, rollback, and escalation;
   - resumption requires costs to stop accelerating, traffic and latency to
     stabilize, integrity/RLS checks to pass, queues to be understood, and one
     owner to record the go decision.
8. Run a non-production tabletop and technical drill:
   - simulate a legitimate traffic spike, anonymous abuse, export amplification,
     reminder backlog, provider-send surge, cost alert, hard-stop decision, and
     false-positive throttle;
   - prove the owner can find current spend, identify the owning layer, stop the
     scoped cost source, preserve data integrity, roll back the control, and
     recover normal service;
   - do not generate billable stress traffic merely to test billing controls.

Acceptance criteria:
- A sanitized provider cost inventory identifies every known fixed and metered
  cost, current plan, included quota, overage path, billing owner, and control
  coverage gap.
- The owner approves concrete USD thresholds, notification recipients,
  availability tradeoffs, escalation authority, and the hard-stop posture.
- Vercel spend notifications are enabled and tested. The selected hard-limit
  behavior is verified or explicitly declined with the residual exposure
  documented.
- Supabase Spend Cap posture is verified. Covered and uncovered usage items are
  listed explicitly; the ticket does not describe the cap as protection from
  compute or all possible charges.
- Sequenzy and every other billable provider has a verified usage-limit, alert,
  or manual review protocol. Missing provider controls are recorded as residual
  risk rather than assumed.
- Cost and surge monitoring has warning, urgent, and emergency signals with a
  tested human delivery path and a backup contact.
- Anonymous, authenticated, export, provider, and protected process traffic use
  separate controls based on measured cost and legitimate behavior.
- Firewall rules are tested in log-only or preview form before enforcement.
  OAuth callbacks, Vercel Cron, ordinary authenticated tracking, exports under
  the declared limit, and accessibility/shared-network scenarios remain usable.
- Circuit breakers can stop each cost-amplifying subsystem independently. No
  breaker weakens Auth, RLS, audit history, status integrity, or exact reminder
  idempotency.
- Every throttled application response has deterministic tests for status,
  retry guidance, monitoring, and no partial mutation.
- The incident runbook covers surge triage, cost containment, attack response,
  provider escalation, rollback, queue recovery, integrity/RLS verification,
  user communication, and safe resumption.
- A non-production drill produces sanitized evidence that the owner can detect,
  contain, roll back, and recover from each declared incident class.
- `npm run agents:check`, `npm run interactions:check`,
  `npm run resolvers:check`, `npm run lint`, `npm run typecheck`,
  `npm run test`, and `npm run build` pass.

Documentation updates required during implementation:
- Add the owner-approved cost policy and incident protocol to
  `docs/OPERATIONS.md` without committing private billing data.
- Add Vercel spend, firewall, deployment-pause, and rollback procedures to
  `docs/VERCEL_WORKFLOW.md`.
- Add Supabase Spend Cap coverage, usage review, compute/add-on exposure, and
  recovery procedures to `docs/SUPABASE_WORKFLOW.md`.
- Add provider-send caps and emergency disable/recovery behavior to
  `docs/SEQUENZY_WORKFLOW.md` and `docs/NOTIFICATION_SPEC.md` when reminder
  delivery behavior changes.
- Update `docs/ROUTE_MAP.md`, `docs/INTERACTION_REGISTRY.md`, and
  `interaction-registry.json` when a route or visible interaction changes.
- Add a sanitized dated drill report under `docs/qa/launch-safety/`.
- Update `STATUS.md` when implementation starts, blocks, or completes.

Suggested files:
- `scripts/launch-cost-preflight.mjs`
- `scripts/launch-surge-drill.mjs`
- `lib/security/rate-limiter.ts`
- `lib/security/launch-circuit-breakers.ts`
- `lib/monitoring.ts`
- `app/api/export/*/route.ts`
- `app/api/push/subscribe/route.ts`
- `app/api/reminders/process/route.ts`
- `app/api/occurrences/sync/route.ts`
- focused Server Action adapters only when their measured cost requires it
- `tests/launch-cost-preflight.test.ts`
- `tests/launch-circuit-breakers.test.ts`
- focused route, action, monitoring, reminder, and export tests
- `docs/OPERATIONS.md`
- `docs/VERCEL_WORKFLOW.md`
- `docs/SUPABASE_WORKFLOW.md`
- `docs/SEQUENZY_WORKFLOW.md`
- `docs/NOTIFICATION_SPEC.md` when provider delivery behavior changes
- `docs/ROUTE_MAP.md` and interaction registry files when required
- `docs/qa/launch-safety/<YYYY-MM-DD>-cost-surge-drill.md`
- `STATUS.md`

Official references to recheck during implementation:
- <https://vercel.com/docs/spend-management>
- <https://vercel.com/docs/vercel-firewall>
- <https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing>
- <https://supabase.com/docs/guides/platform/cost-control>
- <https://supabase.com/docs/guides/platform/billing-on-supabase>
- <https://supabase.com/changelog.md>

Out of scope:
- Payment or subscription infrastructure for Cadence users.
- An admin dashboard, product analytics platform, marketing tracking, or social
  features.
- Guaranteed zero charges, automatic refunds, or assumptions that provider
  alerts arrive before usage is billed.
- Automatic project pause, production firewall publication, attack-mode
  activation, plan changes, purchases, compute resizing, or budget increases
  without exact owner authorization.
- Broad throttles that make ordinary Timeline decisions unreliable, silently
  discard mutations, weaken RLS, or prevent export/account portability without
  an explicit emergency state.
- New monitoring, queue, rate-limit, or incident-management vendors without a
  separate privacy, security, reliability, and recurring-cost decision.
- Opportunistic capacity tuning or implementation of Ticket 066 hosted load.

---

## Ticket 068: Occurrence stopwatch capture, reset, and persistence

Add a small stopwatch to the existing expanded Timeline occurrence row so a
user can record how long one occurrence takes, stop the timer, and reset the
recorded time when it was captured by mistake.

Context:
- Cadence currently stores scheduled times and status timestamps, but it does
  not store elapsed time spent on an occurrence.
- `docs/DECISIONS.md` and `docs/PRODUCT_SPEC.md` currently defer structured
  measurements. This ticket intentionally creates one narrow duration-only
  exception. It must not create a general measurement-template system.
- Timeline already uses an expanded native disclosure for Description,
  Category, Schedule, status correction, and Note. Time tracking belongs in
  that disclosure and does not need a new route, modal, or card treatment.
- Tickets 066 and 067 concern hosted load and launch operations. Their provider
  gates do not block this local product slice.

Dependencies:
- Existing Timeline, occurrence, status, Supabase Auth, and RLS behavior must
  remain passing.
- Run the project-local impeccable context workflow before editing the
  Timeline UI. Use existing product actions, spacing, and typography.
- Hosted migration deployment remains separately authorization-gated. This
  ticket may be implemented and verified locally without resolving Tickets 066
  or 067.

Settled product decisions:
- This is an elapsed-time stopwatch, not a countdown timer.
- A timing session is one persisted start/stop interval attached to one
  occurrence and its owning behavior.
- Starting persists the session before the visible stopwatch begins. Refreshing
  or reopening the page restores a still-running session from its saved
  `started_at` instant.
- One occurrence may have at most one running timing session. Different
  occurrences may run concurrently.
- An occurrence may have multiple stopped timing sessions. Stop followed by a
  later Track Time action creates another session.
- Duration is derived from `stopped_at - started_at`. Do not duplicate it in a
  mutable database column.
- Stop records time only. It does not mark the occurrence Completed, Not
  Completed, or Unresolved and does not change reminder eligibility.
- Start is available for active-behavior occurrences on the current local day
  or still visible in Needs decision. A previously started session may still be
  stopped or reset after the occurrence leaves Needs decision.
- Reset tracked time deletes every timing session for that occurrence,
  including a running session. It returns the row to the idle Track Time state.
- Reset uses a clearly named inline text action without a confirmation modal.
  It is an explicit user correction, not an automatic cleanup rule.
- Countdown configuration, pause/resume state, manual duration entry,
  individual-session editing, and individual-session deletion are out of
  scope.

Implementation order:
1. Update the product, data, UI, user-flow, decision, resolver-ownership, route,
   and interaction contracts before implementation.
2. Add one additive migration for `occurrence_time_sessions`. The migration
   creates only the new table, its indexes, ownership constraints, updated-at
   trigger, RLS policies, and authenticated grants.
3. Regenerate Supabase database types and add explicit timing-session domain
   types.
4. Write the failing pure resolver tests for start, stop, elapsed duration,
   multiple stopped sessions, running state, formatting, invalid timestamps,
   and reset planning.
5. Implement the resolver, repository, and service boundaries.
6. Add Timeline Server Actions for start, stop, and reset. Keep authentication,
   user ownership, occurrence lookup, and date/behavior eligibility in the
   service layer.
7. Add the Track Time line to the existing expanded occurrence disclosure and
   cover its idle, saving, running, stopping, stopped, resetting, and error
   states.
8. Register the new user intent, update the load-test companion
   classification, add user guidance, and run full verification.

Data and migration requirements:
- Create exactly one additive migration named with the project-local Supabase
  workflow, such as `add_occurrence_time_sessions`.
- The new table should contain:
  - `id uuid` primary key;
  - `user_id uuid` with account-deletion cascade;
  - `occurrence_id uuid`;
  - `behavior_id uuid`;
  - `started_at timestamptz`;
  - nullable `stopped_at timestamptz`;
  - `created_at` and `updated_at` timestamps.
- Enforce one owner-consistent foreign key from
  `(user_id, occurrence_id, behavior_id)` to the existing occurrence ownership
  tuple. Deleting the occurrence or account must cascade to its timing
  sessions.
- Enforce `stopped_at is null or stopped_at >= started_at`.
- Add one partial unique index on `(user_id, occurrence_id)` where
  `stopped_at is null` so duplicate starts cannot create two running sessions
  for the same occurrence.
- Add behavior-history and occurrence-lookup indexes without introducing a
  generalized analytics table.
- Add owner-scoped select, insert, update, and delete RLS policies and minimum
  authenticated grants. Reset requires owner-scoped delete access.
- Do not alter, backfill, rewrite, or recalculate any existing behavior,
  occurrence, status event, note, reminder, import, or export row.
- Existing occurrences begin with zero timing sessions. No data conversion is
  required.
- Do not modify the existing Export-page read RPC in this ticket.
- Do not deploy the migration to hosted Supabase without explicit owner
  authorization for the exact linked project.

Resolver, repository, and service requirements:
- Add `lib/resolvers/time-tracking.resolver.ts` and register it in
  `docs/AGENT_RESOLVERS.md` with paired tests.
- Resolvers must receive `now` explicitly and must not read browser APIs,
  environment variables, Supabase, or the system clock.
- Use Temporal instants for authoritative start, stop, and duration math. Do
  not parse local dates with JavaScript `Date`.
- Keep persistence in `lib/db/timeSessions.repo.ts` and orchestration in
  `lib/services/time-tracking.service.ts`.
- Start must be idempotent for an already-running occurrence. A race must
  resolve to one running row rather than a duplicate session.
- Stop must update only the current user's still-running session. A repeated
  stop submission must return the saved stopped result or a stable no-op
  result instead of creating another session.
- Reset must delete all current-user sessions for the occurrence atomically
  from the application's perspective. A repeated reset must be an idempotent
  success.
- Server-side eligibility must reject a start for a future local date, an
  archived behavior, a prior resolved occurrence outside the Needs decision
  retention window, a missing occurrence, or another user's occurrence. Crafted
  form submissions must not bypass the UI gate.
- Stop and reset must not reject only because midnight passed after a valid
  start.
- Time tracking must not mutate occurrence status, `completed_at`,
  `status_marked_at`, status-event history, notes, or reminder deliveries.

Timeline UI requirements:
- Add the control inside `components/timeline/OccurrenceRow.tsx` after Schedule
  details and before status/note correction content.
- Reuse an isolated `TimeTracker` component if it keeps action state and the
  one-second visual counter out of `OccurrenceRow`.
- Idle state shows only the exact underlined action label `Track Time`, without
  a duplicate static heading.
- Running state shows a static, non-underlined `Track time` label, an elapsed
  `HH:MM:SS` value, and the exact action label `Stop`.
- After stopping, show the combined recorded time for the occurrence plus
  `Track Time` and `Reset tracked time` actions.
- Reset immediately returns the component to its idle state after confirmed
  persistence.
- The client counter may update once per second for display, but the saved
  duration must use persisted server instants. Page suspension or timer drift
  must not change the final duration.
- Do not announce every timer tick through a live region. Announce start, stop,
  reset, and failure results only.
- Preserve 44px mobile action targets, keyboard operation, reduced-motion
  expectations, and the existing unboxed disclosure treatment.
- Do not add a new page, API route, modal, floating timer, chart, design token,
  card border, or permanent Timeline column.

Acceptance criteria:
- A signed-in user can open a current-day or visible Needs decision occurrence,
  select Track Time, see a running counter, select Stop, and see the persisted
  combined duration.
- Refreshing during a running session restores the running state and elapsed
  value from the persisted `started_at` instant.
- Starting again after a stop creates a second session and the occurrence total
  equals the sum of its stopped sessions.
- Reset tracked time removes every session for that occurrence, discards a
  running session when present, and returns the UI to Track Time.
- Stop and reset remain user-owned and idempotent under double submission or
  stale UI state.
- Two accounts cannot read, start, stop, update, reset, or infer each other's
  timing sessions through normal authenticated clients.
- A user may run timers for two different occurrences, but cannot create two
  simultaneous running sessions for the same occurrence.
- Stop and reset do not alter occurrence status or reminder state.
- Existing rows are preserved. A clean migration produces an empty timing
  table for existing fixtures without backfill work.
- Timeline remains mobile-responsive and uses the existing design system.
- Interaction registry, user guide, load-test companion classification, RLS
  policy registry, and resolver registry checks cover the new feature.

Documentation updates required during implementation:
- `docs/PRODUCT_SPEC.md`: add duration-only occurrence time tracking and keep
  general structured measurements out of scope.
- `docs/DECISIONS.md`: record the narrow exception to the existing measurement
  decision and the separate timing/status semantics.
- `docs/DATA_MODEL.md`: document the table, constraints, RLS, cascades, and
  derived-duration contract.
- `docs/UI_SPEC.md` and `docs/USER_FLOWS.md`: document Track Time, Stop,
  persistence, reset, conditional availability, and accessibility.
- `docs/AGENT_RESOLVERS.md`: register time-tracking resolver ownership and
  forbidden UI/service duplication.
- `docs/ROUTE_MAP.md`: note the added Timeline interaction without creating a
  route.
- `docs/INTERACTION_REGISTRY.md`, `interaction-registry.json`,
  `load-tests/scenarios/interaction-map.json`, and
  `docs/user-guide/timeline.md`: register and explain the interaction.
- `STATUS.md`: mark Ticket 068 in progress before implementation and record
  verification, migration deployment state, and remaining risks at completion.

Suggested files:
- `supabase/migrations/*_add_occurrence_time_sessions.sql`
- `lib/db/database.types.ts`
- `lib/types/database.ts`
- `lib/types/time-tracking.ts`
- `lib/resolvers/time-tracking.resolver.ts`
- `lib/db/timeSessions.repo.ts`
- `lib/services/time-tracking.service.ts`
- `lib/types/timeline.ts`
- `lib/services/timeline.service.ts`
- `app/(app)/timeline/actions.ts`
- `app/(app)/timeline/page.tsx`
- `components/timeline/Timeline.tsx`
- `components/timeline/TimelineGroup.tsx`
- `components/timeline/OccurrenceRow.tsx`
- `components/timeline/TimeTracker.tsx`
- `tests/time-tracking.resolver.test.ts`
- `tests/time-tracking.service.test.ts`
- `tests/time-sessions.repo.test.ts`
- `tests/time-tracking-migration.test.ts`
- `tests/timeline-time-tracking-ui.test.tsx`
- `tests/rls-policy-registry.test.ts`
- product, resolver, route, interaction, and user-guide docs listed above
- `STATUS.md`

Verification:
- Run focused resolver, service, repository, migration, RLS, and Timeline UI
  tests first.
- Run `npm run supabase -- db reset` from a clean local database.
- Regenerate `lib/db/database.types.ts` from the local schema.
- Run `node .agents/skills/impeccable/scripts/context.mjs` before UI edits and
  verify the result against `.agents/skills/impeccable/reference/product.md`.
- Run `npm run agents:check`, `npm run interactions:check`,
  `npm run load:manifest:check`, `npm run resolvers:check`,
  `npm run design-system:check`, `npm run lint`, `npm run typecheck`,
  `npm run test`, and `npm run build`.

Out of scope:
- General measurements, expected-duration targets, countdowns, pause/resume,
  manual duration entry, automatic Completed status, automatic reminder
  changes, per-session editing, per-session deletion, a global active-timer
  dashboard, charts, history tables, new routes, offline timers, PWA sync,
  background native timers, desktop/mobile implementation, social timing, or
  AI coaching.

---

## Ticket 069: Behavior timing averages and selected-day review

Show compact timing context on Behaviors after Ticket 068 has reliable timing
sessions: one conditional average per behavior and one conditional tracked-time
row for the selected occurrence day.

Dependencies:
- Ticket 068 must be complete with passing migration, resolver, RLS, service,
  Timeline, reset, and interaction tests.
- Use the existing 7, 30, and 90-day Behaviors range. Do not add a separate
  time-tracking range selector.
- Run the project-local impeccable context workflow before UI edits and reuse
  the existing behavior metadata and selected-day review patterns.

Settled product decisions:
- A stopped timing session contributes to recorded time. A running session does
  not contribute to a finalized duration or average.
- One occurrence's recorded tracked time is the sum of all its stopped timing
  sessions.
- The behavior average is the arithmetic mean of recorded occurrence totals
  for timed occurrences in the selected 7, 30, or 90-day range.
- Untimed occurrences and occurrences with only a running session are excluded
  from the denominator.
- The `Average tracked time` line is conditionally hidden when the selected
  range has no recorded occurrence totals. Do not render `No tracked time`.
- In Review selected day, `Tracked time` appears only for an occurrence with
  recorded time or a running session.
- A selected-day occurrence with stopped time shows its combined recorded
  duration. A running-only occurrence shows `In progress`. An occurrence with
  both stopped time and a running session shows its recorded duration plus an
  In progress label.
- Review selected day exposes `Reset tracked time` inside the existing Review
  disclosure and reuses Ticket 068's reset service/action semantics.
- No behavior-level time history disclosure, chart, pop-up, table, empty
  placeholder, or new report section is included.

Implementation order:
1. Add failing analytics resolver tests for per-occurrence totals, behavior
   averages, range boundaries, multiple sessions, active sessions, reset-empty
   state, and deterministic duration formatting.
2. Extend the analytics input/output types and resolver with timing-session
   summaries. Reuse the Ticket 068 duration helpers instead of duplicating
   elapsed-time math.
3. Load timing sessions for the already selected occurrence range and selected
   day without per-row database queries.
4. Add the conditional Average tracked time row to the existing behavior
   outcome metadata.
5. Add the conditional Tracked time row to each selected-day occurrence summary
   between Time of behavior and Status.
6. Add Reset tracked time to the existing per-occurrence Review disclosure and
   refresh Behaviors and Timeline after success.
7. Update UI/product docs, interaction traceability, user guidance, and tests.

Acceptance criteria:
- A behavior with recorded timing in the selected range shows one line such as
  `Average tracked time  2m 14s` in its existing outcome metadata.
- A behavior without recorded timing in the selected range renders no Average
  tracked time line and consumes no placeholder space.
- Changing between 7, 30, and 90 days recalculates the average from occurrences
  inside that selected local-date range.
- Multiple stopped sessions on one occurrence are summed before that occurrence
  contributes one value to the behavior average.
- An occurrence with an active session and no stopped session does not affect
  the average.
- Selecting a non-empty behavior calendar day keeps the existing Review
  selected day panel and adds Tracked time only to occurrences with timing
  data.
- Reset tracked time from Review selected day deletes that occurrence's timing
  sessions, refreshes the average, removes the Tracked time row when no timing
  remains, and does not change Status or Note.
- Behavior adherence, status counts, heatmaps, tracking-since metadata, and
  category counts retain their existing meaning and do not include duration
  data.
- The UI remains sparse, divider-based, mobile-responsive, and accessible. No
  new modal, table, disclosure, chart, route, or design token is added.

Documentation updates required during implementation:
- `docs/PRODUCT_SPEC.md`, `docs/UI_SPEC.md`, and `docs/USER_FLOWS.md`: define
  the average formula, conditional visibility, selected-day row, and reset
  correction path.
- `docs/AGENT_RESOLVERS.md`: record analytics ownership of timing aggregation
  and forbid component-side duration calculations.
- `docs/ROUTE_MAP.md`: note the additive Behaviors review content without a new
  route.
- `docs/INTERACTION_REGISTRY.md`, `interaction-registry.json`,
  `load-tests/scenarios/interaction-map.json`, and
  `docs/user-guide/behaviors-and-review.md`: trace the reset control on the
  Behaviors surface when needed.
- `STATUS.md`: mark Ticket 069 in progress before implementation and record
  verification at completion.

Suggested files:
- `lib/types/analytics.ts`
- `lib/resolvers/analytics.resolver.ts`
- `lib/services/analytics.service.ts`
- `lib/db/timeSessions.repo.ts`
- `app/(app)/behaviors/actions.ts`
- `app/(app)/behaviors/page.tsx`
- `components/behaviors/BehaviorList.tsx`
- `tests/analytics.resolver.test.ts`
- `tests/behavior-review-ui.test.tsx`
- `tests/time-tracking.service.test.ts`
- product, resolver, route, interaction, and user-guide docs listed above
- `STATUS.md`

Verification:
- Run focused analytics, time-tracking service, and behavior-review UI tests.
- Run `node .agents/skills/impeccable/scripts/context.mjs` before UI edits and
  verify the result against `.agents/skills/impeccable/reference/product.md`.
- Run `npm run agents:check`, `npm run interactions:check`,
  `npm run load:manifest:check`, `npm run resolvers:check`,
  `npm run design-system:check`, `npm run lint`, `npm run typecheck`,
  `npm run test`, and `npm run build`.

Out of scope:
- Time history UI, charts, trend lines, target durations, expected-duration
  configuration, category/overall duration dashboards, session editing,
  manual timing entry, a separate timing range, new routes, modals, AI
  interpretation, or changes to adherence semantics.

---

## Ticket 070: Privacy-gated time-tracking exports

Add an Include time tracking option to Export & Import so exact activity
timestamps and derived durations remain excluded by default and enter export
artifacts only after an explicit user choice.

Dependencies:
- Tickets 068 and 069 must be complete so persistence, duration derivation,
  reset behavior, and aggregate semantics are stable before export formats
  adopt them.
- Existing export range, archived-behavior, note, rate-limit, circuit-breaker,
  BehaviorLog conformance, and download-route behavior must remain intact.

Settled product and privacy decisions:
- The option label is `Include time tracking`.
- The option is off by default on the page and on every direct download route.
- Exact timing-session timestamps can reveal activity patterns. The option copy
  must state that time tracking is omitted from every export unless selected.
- The query parameter is `include_time_tracking=1`. Other values do not enable
  inclusion.
- When disabled, the export service does not read timing sessions and all
  existing export shapes remain unchanged.
- When enabled, include timing sessions attached only to occurrences and
  behaviors already included by the selected range and archived-behavior
  option.
- Raw exports may include a running session with `stopped_at = null`.
  `duration_seconds` remains null for that running session.
- Derived totals and averages include stopped sessions only and use the same
  aggregation semantics as Ticket 069.
- Timing history remains export-only in this ticket. BehaviorLog import and
  restore validate the optional Cadence file and disclose that they do not
  replay timing sessions.

Format contract when Include time tracking is disabled:
- Full JSON omits the `time_sessions` property rather than emitting an empty
  array.
- JSONL emits no `time_session` records or timing-derived fields.
- CSV preserves its current columns and emits no timing data.
- BehaviorLog omits the timing file and timing extension declaration.
- Markdown summary omits timing counts, totals, averages, and timing guidance.
- Filenames retain the current format.

Format contract when Include time tracking is enabled:
- Full JSON adds an optional `time_sessions` root containing the raw included
  sessions plus derived `duration_seconds` for stopped sessions.
- App-native JSONL adds one `time_session` record per included session with
  session, occurrence, and behavior IDs; start/stop instants; and nullable
  derived duration.
- App-native occurrence CSV preserves one row per occurrence and adds
  `tracked_duration_seconds`, `time_session_count`, and a `time_sessions` JSON
  column containing the included raw session array.
- BehaviorLog adds
  `raw/cadence/occurrence_time_sessions.jsonl` as an optional, hashed,
  Cadence-specific file and declares its path, record count, ordering, and
  `export_only` support under `manifest.extensions.app.cadence`.
- Markdown summary adds behavior-level stopped-session count, recorded total,
  and average tracked time without listing every exact timestamp.
- The Export selected-range summary may show Timing sessions only while the
  option is enabled.
- Export filenames add `with-time-tracking` so sensitive artifacts are
  identifiable after download.

Implementation order:
1. Add failing resolver tests proving the option defaults off and that disabled
   artifacts contain no raw or derived timing data.
2. Extend export input/output types with optional timing-session inputs and an
   explicit `includeTimeTracking` flag.
3. Add the unchecked checkbox and privacy copy to the existing Options form.
4. Thread `include_time_tracking=1` through page search params, download links,
   shared download parsing, export page data, and direct routes.
5. Read timing sessions only when enabled and only for already included
   occurrence IDs. Use a separate owner-scoped repository read rather than
   changing the Export-page read RPC or adding another migration.
6. Implement the Full JSON, JSONL, CSV, BehaviorLog, filename, range-summary,
   and Markdown contracts above in the export resolver.
7. Update import/restore validation and copy so the optional Cadence file is
   accepted, hash-checked, and explicitly not replayed.
8. Update interaction traceability, privacy/export docs, user guidance, and
   full verification.

Acceptance criteria:
- Export & Import shows an unchecked Include time tracking checkbox beside the
  existing options with factual sensitivity copy.
- Applying export options preserves the selected timing value, and every
  download link includes `include_time_tracking=1` only when selected.
- Calling any export download route without the exact opt-in parameter omits
  timing data, even if the account has timing sessions.
- Disabled exports do not query timing-session rows and do not expose session
  existence through counts, filenames, empty arrays, optional files, Markdown,
  or derived fields.
- Enabled exports include only timing sessions attached to occurrences inside
  the selected export scope.
- Reset sessions deleted by Ticket 068 do not appear in later exports.
- Running sessions preserve their start instant and null stop/duration without
  entering stopped-session averages.
- Full JSON, JSONL, CSV, BehaviorLog, and Markdown outputs satisfy the settled
  format contracts and remain deterministic.
- BehaviorLog manifest hashes, file counts, extension metadata, conformance
  checks, and ZIP packaging pass with and without the optional timing file.
- Import and restore accept a valid Cadence timing file without treating it as
  a core record, do not write timing sessions, and clearly disclose the
  export-only limitation.
- Export rate limiting, circuit breakers, authentication, RLS, CSV formula
  protection, note privacy, archived filtering, and behavior-definition
  history remain unchanged.

Documentation updates required during implementation:
- `docs/EXPORT_FORMATS.md`: document the default-off option, privacy rationale,
  format-specific inclusion, range rules, running-session semantics, and
  export-only import/restore limitation.
- `docs/PRODUCT_SPEC.md`, `docs/UI_SPEC.md`, and `docs/USER_FLOWS.md`: document
  the Export option and default omission.
- `docs/DATA_MODEL.md`: note export filtering and derived-duration semantics
  without adding another schema field.
- `docs/AGENT_RESOLVERS.md`: record export resolver ownership for timing
  filtering and formatting.
- `docs/INTERACTION_REGISTRY.md`, `interaction-registry.json`,
  `load-tests/scenarios/interaction-map.json`, and
  `docs/user-guide/data-portability.md`: register and explain the opt-in.
- `STATUS.md`: mark Ticket 070 in progress before implementation and record
  verification and the remaining export-only restore limitation at completion.

Suggested files:
- `components/export/ExportPanel.tsx`
- `app/(app)/export/page.tsx`
- `app/api/export/_shared.ts`
- `lib/types/export.ts`
- `lib/services/export.service.ts`
- `lib/resolvers/export.resolver.ts`
- `lib/db/timeSessions.repo.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/resolvers/behaviorlog-restore.resolver.ts` only if its optional-file
  disclosure is resolver-owned
- `tests/export-panel-ui.test.tsx`
- `tests/export-download-route.test.ts`
- `tests/export.resolver.test.ts`
- `tests/behaviorlog-conformance.test.ts`
- focused BehaviorLog import/restore validation tests
- product, export, resolver, interaction, and user-guide docs listed above
- `STATUS.md`

Verification:
- Run focused export option, resolver, route, CSV, BehaviorLog conformance,
  import validation, and restore validation tests first.
- Verify disabled fixtures contain no timing field name, timestamp, count,
  filename suffix, manifest entry, or Markdown section.
- Verify enabled fixtures cover multiple sessions, a running session, reset
  omission, archived filtering, 7/30/90/all ranges, deterministic ordering,
  CSV JSON escaping, and manifest hashing.
- Run `npm run agents:check`, `npm run interactions:check`,
  `npm run load:manifest:check`, `npm run resolvers:check`,
  `npm run design-system:check`, `npm run lint`, `npm run typecheck`,
  `npm run test`, and `npm run build`.

Out of scope:
- Importing or restoring timing sessions, enabling time tracking by default,
  separate time-tracking downloads, time-history UI, charts, provider calls,
  public sharing, automatic redaction, configurable timestamp precision,
  generalized measurement export profiles, or changing the BehaviorLog core
  schema.

---

## Ticket 071: Mobile Timeline refresh and completion-feedback regressions

Add pull-to-refresh to the mobile Timeline and fix two reported mobile
regressions: duplicate completion-chime playback and the Completed label moving
out of the summary row when an occurrence opens.

Report context:
- The owner reported all three items on 2026-08-04 with two screenshots of an
  expanded and collapsed Timeline state.
- The screenshots contain personal Behavior content. The owner explicitly
  approved adding them to the repository on 2026-08-04 as Ticket 071 evidence.
- Evidence: [collapsed Timeline](qa/ticket-071/timeline-collapsed.png) and
  [expanded status misalignment](qa/ticket-071/timeline-expanded-status-misalignment.png).
- The prior UI contract allowed expanded rows to pin status at the top-right.
  The owner intentionally replaced that rule: the resolved status label stays
  horizontally parallel to the behavior title while details open below it.

Dependencies:
- Preserve the existing resolver-owned Timeline groups, status persistence,
  optimistic state, completion feedback, timing controls, Notes, and Needs
  decision behavior.
- Run the project-local impeccable context workflow before editing Timeline UI.
- Do not treat pull-to-refresh as permission to add PWA caching, offline reads,
  offline writes, or a pending mutation queue.

Required investigation order for the duplicate chime:
1. Add a focused regression harness before changing playback code. It must
   represent one mobile activation sequence and one successful status action.
2. Make the harness observe both status submissions and completion-chime
   playback attempts or the existing playback-start event. It must fail if one
   confirmed transition produces two playback attempts.
3. Reproduce the report in a real mobile browser path. Prefer the reported
   browser when known; otherwise cover mobile WebKit and mobile Chromium.
4. Use the failing test and browser instrumentation to identify the duplicate
   trigger. Record the verified cause in `STATUS.md`.
5. Fix that cause. Do not add an arbitrary timeout or broad debounce unless the
   test proves it represents the duplicate event source.
6. Keep regression cases for touch/pointer/click/submit ordering, React
   remounts, route refresh, and an already-Completed occurrence where relevant
   to the verified cause.

Pull-to-refresh requirements:
- Enable the gesture only on the mobile Timeline surface when its scroll
  container is already at the top.
- A downward pull that crosses a clear threshold and is then released refreshes
  the current Timeline data exactly once.
- Show restrained pull and refreshing feedback without adding a permanent
  toolbar, card, modal, route, or design token.
- Short pulls, horizontal gestures, cancelled gestures, and pulls started below
  the top must preserve normal scrolling and must not refresh.
- Status buttons, occurrence disclosures, Notes, timing controls, the mobile
  navigation drawer, and Needs decision controls must keep their existing
  touch behavior.
- Refresh must not mark, unmark, edit, start, stop, reset, or otherwise mutate
  an occurrence. It only requests fresh Timeline data.
- One gesture must not combine a custom refresh with a second native refresh.
  The implementation should define and test how browser overscroll is handled.

Completion-chime requirements:
- One successful user-initiated transition from a non-Completed state to
  Completed produces at most one playback attempt and one playback-start event.
- One mobile tap must submit one status mutation. A duplicated playback must
  not be hidden while two mutations still occur.
- Not Completed, Note saves, pull-to-refresh, ordinary route refreshes, failed
  status actions, and re-saving an already Completed occurrence remain silent.
- Browsers that block audio should preserve the existing factual blocked path.
  The fix must not fake a successful playback signal.

Expanded-row alignment requirements:
- Opening a Completed occurrence keeps its Completed label in the summary row,
  horizontally parallel to the behavior title.
- Expanded Description, Category, Schedule, Track Time, Change status, and Note
  content flows below the complete summary row and cannot push the label down.
- The alignment must hold at the supported mobile widths, with long behavior
  titles, and while timing or Note content is present.
- Preserve the corresponding Not Completed row structure and collapsed-row
  alignment. Do not change stored status semantics or row colors.

Acceptance criteria:
- A mobile pull from the top crosses the threshold, releases, shows bounded
  refresh feedback, and refreshes Timeline data once.
- Gesture tests prove that non-qualifying pulls do not refresh or mutate data.
- A test added before the sound fix reproduces the duplicate chime path or
  isolates the exact duplicate trigger observed through browser
  instrumentation.
- One successful mobile Completed action produces one status submission and
  one chime playback attempt. The regression test fails if playback occurs
  twice.
- Opening Completed rows at 320px and 390px keeps the status label parallel to
  the behavior title. A long-title fixture and an expanded-detail fixture both
  pass without horizontal overflow.
- Browser QA covers mobile WebKit and Chromium when available. Any unavailable
  browser or device remains explicitly unverified.
- Product docs, interaction traceability, design-system Timeline fixtures, and
  user guidance match the implemented behavior.

Documentation and traceability required during implementation:
- `docs/UI_SPEC.md` and `docs/USER_FLOWS.md`: reconcile the recorded target
  behavior with the final gesture, exact-once sound, and summary-row details.
- `docs/INTERACTION_REGISTRY.md`, `interaction-registry.json`, and
  `load-tests/scenarios/interaction-map.json`: register pull-to-refresh and
  update any affected status-action coverage after implementation.
- `DESIGN.md` and the design-system bench: preserve the expanded resolved-row
  alignment and mobile gesture feedback pattern.
- `docs/user-guide/timeline.md`: explain mobile pull-to-refresh only if the
  gesture needs user-facing guidance.
- `STATUS.md`: mark the ticket in progress before implementation and record the
  sound root cause, verification, and any device gaps at completion.

Suggested files:
- `components/timeline/Timeline.tsx`
- `components/timeline/TimelineGroup.tsx`
- `components/timeline/OccurrenceRow.tsx`
- `components/timeline/StatusButtons.tsx`
- a focused mobile pull-to-refresh client component or hook
- focused Timeline interaction, status-button audio, and expanded-row UI tests
- design-system Timeline fixtures and the docs listed above
- `docs/qa/ticket-071/timeline-collapsed.png`
- `docs/qa/ticket-071/timeline-expanded-status-misalignment.png`
- `STATUS.md`

Verification:
- Run the new focused sound regression test before and after the fix, retaining
  evidence that it failed for the reproduced cause and passed after correction.
- Run focused pull gesture, Timeline UI, status action, and completion-feedback
  tests.
- Run `node .agents/skills/impeccable/scripts/context.mjs` before UI edits and
  verify the result against `.agents/skills/impeccable/reference/product.md`.
- Run `npm run agents:check`, `npm run interactions:check`,
  `npm run load:manifest:check`, `npm run resolvers:check`,
  `npm run design-system:check`, `npm run lint`, `npm run typecheck`,
  `npm run test`, and `npm run build`.
- Run authenticated mobile browser QA at 320px and 390px, plus real touch
  browser QA when available.

Out of scope:
- Offline/PWA caching, offline mutation, background sync, service-worker data
  caching, native mobile apps, haptics, new sounds, sound settings, changes to
  status semantics, Timeline routes, or broad Timeline redesign.

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

## Ticket 072: BehaviorLog 0.2.0-draft conformance — intervention repair and schema unfork

Align the BehaviorLog export with upstream `0.2.0-draft` and remove every
divergence between Cadence's emitted records and the canonical schema. The
2026-08 parity audit found Cadence interventions fail canonical validation on
three counts and that the embedded `schema.json` is a fork that legitimizes
them.

Dependencies:
- Upstream BehaviorLog-Bundle repo at `0.2.0-draft` (Intervention
  `failure_reason`, canonical profile identifiers, hardened reference
  validator).

Settled decisions:
- Intervention records emit `planned_for_utc` (was `scheduled_send_at_utc`)
  and map Cadence delivery status `pending` to `planned`. `sent`, `failed`,
  and `cancelled` map unchanged. `pending` never appears in a bundle.
- `failure_reason` stays top-level and keeps the existing sanitization; the
  upstream field now exists, so this becomes conformant rather than divergent.
- The embedded `schema.json` is a byte-exact copy of the upstream
  `0.2.0-draft` canonical schema, not a Cadence-generated variant. Delete the
  local schema-generation divergence.
- `manifest.profiles` uses canonical identifiers only: `core`, `intervention`,
  and later `definition_history` and `time_tracking`. Drop `notes` (notes are
  optional core surface, not a profile) and the plural `interventions`.
- `manifest.schema_version` becomes `0.2.0-draft`. Import continues to accept
  `0.1.0-draft` and adds `0.2.0-draft`.
- Re-pin `tests/fixtures/behaviorlog-reference/` to the upstream `0.2.0-draft`
  validator snapshot and record the new commit in `SNAPSHOT.md`. The hardened
  validator now errors on unknown intervention fields and `pending`, which is
  the regression net this ticket needs.

Implementation order:
1. Re-pin the reference-validator snapshot and watch the conformance test fail
   against current output.
2. Fix the intervention record mapping and manifest profile identifiers in the
   export resolver.
3. Replace the generated embedded schema with the canonical copy.
4. Update import validation to accept both schema versions and the renamed
   intervention field from newer bundles while still reading `0.1.0-draft`
   bundles produced before this ticket.
5. Update `docs/EXPORT_FORMATS.md` and conformance tests.

Acceptance criteria:
- `npm run behaviorlog:conformance` passes against the pinned `0.2.0-draft`
  validator with zero errors and zero warnings for a resolver-generated bundle
  containing interventions.
- An exported intervention round-trips through Cadence import preview without
  `unsupportedFields` entries.
- A fixture bundle with `delivery_status: "pending"` fails import validation
  with a clear error.
- Existing `0.1.0-draft` bundles (pre-repair fixtures) still import, with the
  legacy field and status names normalized on read.

Suggested files:
- `lib/resolvers/export.resolver.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `tests/fixtures/behaviorlog-reference/*`
- `tests/behaviorlog-conformance.test.ts`
- `tests/export.resolver.test.ts`
- `docs/EXPORT_FORMATS.md`

---

## Ticket 073: Export Definition History, Time Tracking, and Intervention Rules profiles

Replace the `raw/cadence/` export-only files with the first-class `0.2.0-draft`
profiles so definition history, time sessions, and reminder configuration
become portable to any BehaviorLog reader.

Dependencies:
- Ticket 072.

Settled decisions:
- Behavior definition events export as `data/behavior_definition_events.jsonl`
  with `record_type: "behavior_definition_event"`. Cadence's first row per
  behavior maps to `event_kind: "baseline"` with `previous: null`; later rows
  map to `revision` with full previous/next title and description objects and
  `changed_fields` limited to `title`/`description`. `reason` maps to
  `reason_code`; source `manual`/`import`/`system` maps to capture methods
  `manual_text`/`imported`/`system_generated`.
- The `raw/cadence/behavior_definition_events.jsonl` file and its manifest
  extension declaration are removed. Full JSON keeps the app-native shape.
- Time sessions export as `data/time_sessions.jsonl` with
  `record_type: "time_session"`, still gated by `include_time_tracking=1`.
  The standard records carry start/stop instants and NO duration field;
  running sessions keep `stopped_at_utc: null`. App-native formats keep
  `duration_seconds`. The manifest sets
  `privacy.contains_time_tracking: true` when the file is present, and the
  `raw/cadence/occurrence_time_sessions.jsonl` file is removed.
- Per-behavior reminder settings export as `data/intervention_rules.jsonl`:
  one enabled rule per enabled channel with deterministic
  `rule_id` (`rule_reminder_<behaviorId>_<channel>`),
  `offset_minutes = -reminder_offset_minutes`, and `enabled: true`. Disabled
  channels emit no rule. Intervention records set `rule_id` to the matching
  rule.
- `manifest.profiles` adds `definition_history` and `time_tracking` exactly
  when the corresponding files are present.
- The manifest declares `rules.definition_history_policy: "event_sourced"`,
  since Cadence records every title/description change as a definition event.
- Reminder flags stay duplicated under `extensions.app.cadence` for one
  release for backward compatibility, then may be dropped by a later ticket.

Acceptance criteria:
- Conformance passes with the three new files present and zero warnings,
  including the upstream validator's new privacy-flag, rule-reference, and
  definition-consistency checks.
- Definition-history and time-session content matches Full JSON for the same
  export options, minus app-only fields.
- No `raw/cadence/` files remain in the bundle export.
- Export & Import screen copy reflects that definition history and timing now
  travel in standard files.

Suggested files:
- `lib/resolvers/export.resolver.ts`
- `lib/services/export.service.ts`
- `tests/export.resolver.test.ts`
- `tests/behaviorlog-conformance.test.ts`
- `docs/EXPORT_FORMATS.md`

---

## Ticket 074: Import and restore replay for definition history and time sessions

Close the portability chain the audit flagged: imported bundles carrying the
new profiles should reconstruct revision history and timing sessions instead
of validating and discarding them.

Dependencies:
- Tickets 072 and 073.

Settled decisions:
- Create-mode and approved-merge imports replay
  `data/behavior_definition_events.jsonl` for behaviors they create: baseline
  and revision rows insert into `behavior_definition_events` with
  `source = 'import'`, preserving imported `recorded_at` ordering and full
  previous/next text. The locally generated import baseline is emitted only
  when the bundle carries no baseline for that behavior.
- Restore replays the imported revision trail for restored behaviors under
  the same rules instead of recording only a snapshot transition.
- `data/time_sessions.jsonl` rows import into `occurrence_time_sessions` for
  safely mapped occurrences. A running imported session (null stop) imports
  as stopped-at-null only if the occurrence has no other running session;
  otherwise it is skipped with a warning.
- Both replays are idempotent through `behaviorlog_import_record_mappings`
  with new record types `behavior_definition_event` and `time_session`.
- Unmappable events and sessions become skip actions with warnings, never
  hard failures of the whole import.

Acceptance criteria:
- Export → wipe → restore reproduces the full definition-event trail
  (baselines, revisions, reasons, timestamps) and all stopped time sessions.
- Re-applying the same accepted import creates zero duplicate events or
  sessions.
- Merge preview shows planned definition-event and time-session actions with
  counts before apply.
- The mappings table check constraint covers the two new record types.

Suggested files:
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/services/behaviorlog-restore.service.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `supabase/migrations/*_extend_import_mapping_record_types.sql`
- `tests/behaviorlog-import-write.service.test.ts`
- `tests/behaviorlog-restore-apply.service.test.ts`

---

## Ticket 075: Re-export imported passive data with provenance

Data imported from another app currently dies inside Cadence: `imported_notes`
and `imported_interventions` never re-export, and import parsing drops most
source provenance. Fix both so Cadence can sit in the middle of a portability
chain.

Dependencies:
- Ticket 072.

Settled decisions:
- The BehaviorLog export includes `imported_notes` rows as `note` records
  (`note_role: "imported"`, original attachment type and mapped local target,
  preserved sensitivity, `source.imported_from` and `source.original_id`
  from stored metadata) when the include-notes option is selected and the
  attachment target is inside the export scope.
- `imported_interventions` rows export as additional intervention records
  with `source.capture_method: "imported"` and preserved external provenance,
  alongside the operational reminder-delivery interventions.
- Import parsing retains `source.producer`, `producer_version`,
  `imported_from`, and `transformation_notes` into the existing `metadata`
  jsonb on `imported_notes` and `imported_interventions`. No migration.
- `manifest.privacy.contains_notes` accounts for imported notes.
- Promotion-created reminder deliveries do not double-export: an operational
  delivery with `imported_intervention_id` set suppresses the passive row's
  separate intervention record.

Acceptance criteria:
- Bundle A imported into Cadence and re-exported yields A's notes and
  intervention history with `imported` provenance and stable original IDs.
- No duplicate intervention records for promoted reminders.
- Conformance passes with mixed operational and imported intervention records.

Suggested files:
- `lib/services/export.service.ts`
- `lib/resolvers/export.resolver.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/db/importedInterventions.repo.ts`
- `lib/db/behaviorLogImports.repo.ts`
- `tests/export.service.test.ts`
- `tests/behaviorlog-import-notes.test.ts`

---

## Ticket 076: Export honesty fixes — health flag, synthetic semantics, synthesis notes

Three small truthfulness fixes in the BehaviorLog export surfaced by the
audit.

Dependencies:
- Ticket 072.

Settled decisions:
- `manifest.privacy.contains_health_data` is `true` when any included
  behavior maps to canonical `health_wellness` or `medication_non_dose`, or
  carries the Medical or Measurements display category. It stays `false`
  otherwise.
- Synthesized status events for legacy resolved snapshots use
  `status_semantics: "system_rule_declared"` (not `explicit_user_mark`),
  keeping `capture_method: "derived"` and `confidence: "medium"`. The
  manifest `rules.status_semantics` map documents the synthesis rule.
- Behavior records whose `success_definition` is producer boilerplate carry
  `source.transformation_notes` stating the synthesis, per the updated
  MAPPING.md guidance, so agents do not read it as user intent.
- Schedule records add `behavior_schedule_id` under `extensions.app.cadence`
  so the parent grouping survives for readers that care.

Acceptance criteria:
- A bundle with a Medical-category behavior reports
  `contains_health_data: true`; one without health-adjacent behaviors reports
  `false`.
- Synthesized events are distinguishable from explicit user marks in the
  exported status-event stream.
- Conformance and existing import tests pass unchanged otherwise.

Suggested files:
- `lib/resolvers/export.resolver.ts`
- `tests/export.resolver.test.ts`
- `docs/EXPORT_FORMATS.md`

---

## Ticket 077: Import and restore fidelity — custom ranges, categories, reminder config, archival pairing

Round-trip fixes for data Cadence itself supports but currently drops or
mangles on the way back in.

Dependencies:
- Tickets 072 and 073.

Settled decisions:
- Import accepts arbitrary `window_start_local`/`window_end_local` ranges as
  custom range slots (`kind: 'range'`, `preset: null`) instead of rejecting
  non-preset ranges. Preset labels in extensions still map to presets.
- Restore reassigns behavior categories: match existing categories by
  normalized display name from `extensions.app.cadence.category_name`
  (fallback: canonical category), create the category when absent, and link
  `category_id`. Create-mode import keeps its existing no-create matching.
- Create-mode import and restore apply reminder configuration from
  `data/intervention_rules.jsonl` when present (enabled channels and negated
  `offset_minutes`), falling back to `extensions.app.cadence` reminder flags
  from older bundles.
- `active` derives strictly from `archived_at_utc`: null means active. A
  contradictory `extensions.app.cadence.active: false` with a null archive
  timestamp is ignored and reported as an import warning, eliminating the
  `active=false, archived_at=null` state the audit found.
- When multiple imported schedules share a `behavior_schedule_id` extension
  value, import reconstructs one `behavior_schedules` parent with multiple
  slots instead of parentless flat slots.

Acceptance criteria:
- A Cadence export with a custom 07:15–09:40 range slot round-trips to an
  identical slot.
- Export → wipe → restore reproduces category assignments, reminder settings,
  and schedule-parent grouping.
- No import path can produce `active = false` with `archived_at = null`.
- RLS and schedule-integrity tests still pass.

Suggested files:
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/services/behaviorlog-restore.service.ts`
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `tests/behaviorlog-import-merge-preview.test.ts`
- `tests/behaviorlog-restore-apply.service.test.ts`
- `docs/EXPORT_FORMATS.md`
- `docs/DATA_MODEL.md`

---

## Audit-derived tickets (078-093)

Tickets 078 through 093 come from a repository-wide read-only audit run on
2026-08-06 across five independent passes: domain resolvers/services/repos,
routes/auth/API, import/restore/export, UI/interaction, and
schema/marketing/ops. Every finding cited below was verified against the
source; no fix was applied during the audit.

Suggested order: 078, 079, 080, 081, 082, 083 first. Those cover silent data
loss, an outbound-email abuse vector, permanently stuck reminder state,
truncated exports, unbounded push fan-out, and an account-deletion lockout.
The rest may be scheduled normally.

---

## Ticket 078: Preserve unresolved occurrences earlier in the current day

Stop behavior edits from deleting unresolved occurrences that were already
scheduled earlier today, along with their notes and tracked time.

Context:
- `resolveGenerationWindow` starts the window at local midnight of the current
  day (`lib/resolvers/occurrence.resolver.ts:469-474`).
- `deleteUnresolvedIds` removes every unresolved occurrence inside that window
  that the new schedule no longer generates
  (`lib/resolvers/occurrence.resolver.ts:293-303`). It has no guard for
  scheduled instants earlier than `now`.
- `docs/DATA_MODEL.md:1047` states only "Future unresolved occurrences may be
  regenerated." The implementation contradicts the contract.
- The occurrence row owns its `note` column, and `occurrence_time_sessions`
  cascades on occurrence delete
  (`supabase/migrations/20260802000000_add_occurrence_time_sessions.sql:13`).
  Both are destroyed with no warning and no undo.
- Reproduction: at 14:00 local, a behavior has an unresolved 08:00 occurrence
  today carrying a note and two stopped time sessions. Editing the behavior so
  its schedule starts at 09:00 deletes the 08:00 row, its note, and its
  sessions.

Settled decisions:
- Deletion eligibility narrows to occurrences whose scheduled instant is
  strictly after `now`. The generation window itself is unchanged, so
  regeneration behavior for the rest of today is unaffected.
- Independently of timing, an occurrence is never deleted when it has a
  non-empty note or any `occurrence_time_sessions` row. This is a second,
  independent guard, not a replacement for the time rule.
- Preserved occurrences that the new schedule no longer produces remain stored
  as unresolved on their original date. The user still owes them a decision;
  they are not rewritten, retimed, or auto-resolved.
- `now` continues to be injected into the resolver. Do not read the clock
  inside `lib/resolvers`.

Implementation order:
1. Add failing resolver tests for: an unresolved past-instant occurrence today,
   an unresolved future occurrence today, an unresolved past occurrence with a
   note, and one with a stopped time session.
2. Narrow `deleteUnresolvedIds` in `lib/resolvers/occurrence.resolver.ts`.
3. Thread note and time-session presence into the deletion planner input so the
   resolver can apply the second guard without querying anything itself.
4. Update `docs/DATA_MODEL.md` if the wording needs to state the note and
   time-session guard explicitly.

Acceptance criteria:
- Editing a behavior at 14:00 preserves an unresolved 08:00 occurrence from the
  same day, including its note and time sessions.
- Editing a behavior still removes unresolved occurrences scheduled later today
  and on future days when the new schedule no longer produces them.
- An unresolved occurrence carrying a note or a time session is never deleted
  by a schedule edit, regardless of its scheduled instant.
- Resolved occurrences and past-day occurrences remain preserved as before.
- `npm run resolvers:check` and the full test suite pass.

Suggested files:
- `lib/resolvers/occurrence.resolver.ts`
- `lib/services/occurrence.service.ts`
- `tests/occurrence.resolver.test.ts`
- `docs/DATA_MODEL.md`

---

## Ticket 079: Profile email integrity and reminder recipient trust

Stop an authenticated account from redirecting Cadence's transactional email to
an arbitrary address.

Context:
- `profiles.email` is directly writable by its owner. The base schema grants
  table-wide DML (`supabase/migrations/20260607204951_create_database_schema.sql:292`)
  and the RLS policy is scoped only by `id = auth.uid()` (`:166-180`). There is
  no column-level restriction, and the only trigger on the table is
  `set_profiles_updated_at`.
- `handle_new_user` seeds the email at signup and nothing re-syncs it
  afterward.
- The reminder processor reads that value as the recipient
  (`lib/services/reminder.service.ts:455`) and passes it to Sequenzy as `to`
  (`lib/services/sequenzy.service.ts:78-95`). The behavior title flows into the
  template variables, so the message body is partly attacker-controlled.
- Attack: sign up, set `profiles.email` to a victim's address through the Data
  API, create a behavior with email reminders and a chosen title, then
  repeatedly reset sent `reminder_deliveries` rows to
  `status='pending', processing_started_at=null` — the same table-wide grant
  permits it (`:296`). Result is repeated mail to a third party from the
  project's sending domain and reputation.
- Verified safe to narrow: `lib/db/profiles.repo.ts` only ever issues
  `.update({ timezone })`. No user-scoped app code writes `email` or
  `display_name`.
- Verified NOT safe to blanket-revoke: `reminder_deliveries` is written by the
  user-scoped client during interactive sync
  (`lib/services/occurrence.service.ts:646`, `:775` create a user client and
  reach `syncCoveredReminderDeliveries`). Revoking DML there would break the
  app.

Settled decisions:
- Replace the table-wide profiles grant with a column grant:
  `grant update (timezone) on public.profiles to authenticated`. `email`,
  `display_name`, `id`, and the timestamps become non-writable by the
  `authenticated` role.
- Keep `profiles.email` correct by syncing it from `auth.users` on update,
  mirroring the existing `handle_new_user` insert path, so a provider-side
  email change still propagates.
- Add a `before update` trigger on `reminder_deliveries` that rejects, for any
  role other than `service_role`, a transition out of a terminal status
  (`sent`, `failed`) back to `pending`, and rejects clearing a non-null
  `processing_started_at`. This kills the recycle vector while leaving the
  app's legitimate pending-plan and cancel writes working.
- The reminder recipient continues to read from `profiles.email`, which is
  trustworthy once the column is locked. Do not add a second identity lookup.

Acceptance criteria:
- An authenticated Data API client cannot change its own `profiles.email` or
  `display_name`; a timezone update from Settings still succeeds.
- An authenticated client cannot move a `sent` or `failed` reminder delivery
  back to `pending`, nor clear `processing_started_at`.
- An email change at the identity provider propagates to `profiles.email`.
- Reminder planning, cancellation, and interactive occurrence sync all still
  work through the user-scoped client.
- `npm run smoke:rls` is extended to cover both new restrictions and passes.

Suggested files:
- new migration via `npm run supabase -- migration new <descriptive_name>`
- `scripts/supabase-rls-smoke.mjs`
- `lib/db/profiles.repo.ts`
- `docs/DATA_MODEL.md`
- `tests/supabase-function-permissions-migration.test.ts`

---

## Ticket 080: Reminder pipeline reliability — claim recovery, cancel race, channel isolation

Three defects in one surface: reminders can be stranded forever, can send after
the user resolves the occurrence, and can be blocked entirely by unrelated
email configuration.

Context:
- Claim stranding: claiming sets `processing_started_at`
  (`lib/db/reminderDeliveries.repo.ts:236`), and every due query requires
  `.is("processing_started_at", null)` (`:154`, `:178`). Reconciliation also
  excludes claimed pending rows (`:266`). No path expires or reclaims an
  abandoned claim, and neither provider call has a bounded timeout. A killed
  serverless invocation therefore leaves a row `pending` and claimed forever:
  never sent, never logged as failed. Found independently by three audit
  passes.
- Cancel race: occurrence validation happens before the provider call
  (`lib/services/reminder.service.ts:424-484`). A status transition in that
  window cancels the delivery via the status RPC
  (`supabase/migrations/20260709203117_add_transactional_occurrence_status_change.sql:298`),
  but the post-send update filters only on delivery and user id
  (`lib/db/reminderDeliveries.repo.ts:336`), flipping the cancelled row to
  `sent`. Violates `docs/NOTIFICATION_SPEC.md:242`.
- Channel coupling: `processDueReminders` awaits email before push
  (`lib/services/reminder.service.ts:238-247`), and email processing builds the
  Sequenzy sender before checking whether any email delivery is due (`:269`).
  A deployment with VAPID configured and Sequenzy absent gets no browser
  reminders at all.

Settled decisions:
- A claim older than 15 minutes is reclaimable. Due queries select rows where
  `processing_started_at is null or processing_started_at < now() - interval
  '15 minutes'`, and the claim update carries the same predicate so two workers
  cannot both win a reclaim.
- Reclaiming an abandoned row counts as a retry, not a failure. Emit a
  monitoring event when a reclaim occurs so stranding becomes visible.
- Provider calls get a bounded timeout via `AbortSignal.timeout` at 10 seconds.
  A timeout records a delivery failure through the existing failure path.
- The terminal `sent` update adds `status = 'pending'` to its filter. If it
  updates zero rows the delivery was cancelled mid-flight: log it and do not
  resurrect the row. Report it in the result counters as cancelled, not sent.
- The Sequenzy sender is constructed lazily, only after the due-email query
  returns at least one row. Each channel is isolated so one channel's
  configuration or provider failure cannot abort the other.
- Do not move reminder orchestration out of `lib/services`. Resolvers stay
  pure.

Acceptance criteria:
- A delivery claimed more than 15 minutes ago and never completed is picked up
  by the next run and sent exactly once.
- Two concurrent workers cannot both claim the same reclaimable row.
- A status change that cancels a delivery mid-send leaves the row `cancelled`,
  never `sent`.
- With Sequenzy env vars absent and no email deliveries due, browser push
  reminders still process normally.
- With Sequenzy env vars absent and email deliveries due, those deliveries
  record a failure and push still processes.
- A hung provider call fails the delivery within the timeout instead of
  stranding it.

Suggested files:
- `lib/services/reminder.service.ts`
- `lib/db/reminderDeliveries.repo.ts`
- `lib/services/sequenzy.service.ts`
- `lib/services/web-push.service.ts`
- `tests/reminder.service.test.ts`
- `docs/NOTIFICATION_SPEC.md`

---

## Ticket 081: Complete reads for export and restore

Stop exports and restores from silently truncating at the PostgREST row cap.

Context:
- `listTimeSessionsByOccurrenceIds` (`lib/db/timeSessions.repo.ts:15-27`) and
  `listBehaviorDefinitionEvents`
  (`lib/db/behaviorDefinitionEvents.repo.ts:181-205`) are plain unpaginated
  selects — no `.range()`, no `.limit()`, no loop. They are bounded by the
  configured row cap (`supabase/config.toml:18` sets `max_rows = 1000`
  locally; the hosted value was not verified during the audit and must be
  confirmed first).
- The exporter writes the truncated array length into the BehaviorLog manifest
  as the authoritative `record_count`
  (`lib/services/export.service.ts:216-241`), so a consumer cannot detect the
  loss.
- The restore and fingerprint path has the same shape for occurrences, status
  events, notes, and mappings
  (`lib/services/behaviorlog-import.service.ts:680-701`,
  `lib/db/occurrences.repo.ts:160-175`,
  `lib/db/occurrenceStatusEvents.repo.ts:138-170`, `lib/db/notes.repo.ts:44-59`).
  A restore can therefore commit while silently retaining rows it should have
  removed, because the planner never saw them.
- The main export bundle is unaffected: `readExportPageBundle` calls an RPC
  returning a single JSON row (`lib/db/exportPageRead.repo.ts:153`).
- This lands on the stated "Portable by default" product principle
  (`PRODUCT.md:50`).

Settled decisions:
- Confirm the hosted `max_rows` value before implementing, and record it in
  `docs/SUPABASE_WORKFLOW.md`.
- Add one shared paginated-read helper in `lib/db` that loops with `.range()`
  at a fixed page size until a short page returns. Every user-scoped list read
  that can grow without bound uses it.
- Pagination is not a silent best effort. The helper carries an absolute
  ceiling; reaching it throws rather than returning a partial array, so a
  future unbounded growth case fails loudly instead of truncating.
- Manifest and summary counts derive from the materialized arrays after
  pagination completes, never from a separate count query.

Acceptance criteria:
- An account with more rows than the row cap exports every time session and
  every definition event, and the manifest count equals the true count.
- A restore preview for an account above the cap sees the full local graph, so
  its fingerprint and planned actions cover every row.
- A read that would exceed the absolute ceiling throws a clear error instead of
  truncating.
- Existing export shape, ordering, and hashing tests pass unchanged.

Suggested files:
- new `lib/db/paginated-read.ts`
- `lib/db/timeSessions.repo.ts`
- `lib/db/behaviorDefinitionEvents.repo.ts`
- `lib/db/occurrences.repo.ts`
- `lib/db/occurrenceStatusEvents.repo.ts`
- `lib/db/notes.repo.ts`
- `lib/services/export.service.ts`
- `tests/export.service.test.ts`
- `docs/SUPABASE_WORKFLOW.md`

---

## Ticket 082: Push subscription bounds and account-switch recovery

Cap how much outbound work one account can create, and let a shared browser
switch accounts without stranding notification setup.

Context:
- Registration accepts any syntactically valid HTTPS endpoint with no
  per-account quota (`lib/services/push-subscription.service.ts:108-122`,
  `lib/db/pushSubscriptions.repo.ts:12`), and a successful request resets the
  route's auth-failure limiter (`app/api/push/subscribe/route.ts:142`), so that
  limiter never bites on success.
- Reminder processing loads every active subscription for the user and sends
  sequentially (`lib/services/reminder.service.ts:621-631`). The batch limit
  bounds deliveries, not subscriptions.
- One account can therefore register thousands of endpoints pointing at hosts
  of its choosing and create one due reminder, turning the cron into a blind
  sequential request generator and blowing the function time budget — which
  then strands the claimed delivery unless Ticket 080 has landed.
- Account switching: sign-out leaves the previous account's active push row
  intact (`app/auth/sign-out/route.ts:8`). If the provider reissues the same
  endpoint for the next account, the single-active-owner constraint
  (`supabase/migrations/20260722213732_enforce_single_active_push_endpoint_owner.sql:21`)
  rejects it, and the client unsubscribes the fresh subscription and reports a
  generic failure (`lib/push/browser.ts:120-173`). The repository's own test
  models this (`tests/push-browser.test.ts:399`).

Settled decisions:
- Cap active push subscriptions per account at 20. Registering past the cap
  evicts the least recently used active row rather than rejecting the new
  device, so a legitimate multi-device user is never locked out.
- Bound per-delivery fan-out: a single reminder delivery sends to at most the
  capped set, and the send loop runs with bounded concurrency rather than an
  unbounded sequential walk.
- Successful registration no longer resets the auth-failure limiter; add a
  separate, low-rate registration limiter keyed per account.
- Sign-out deactivates the current device's push subscription row for the
  departing account before clearing the session, so an endpoint reissued to the
  next account is free to claim.
- Endpoint host allowlisting is explicitly out of scope. The quota and the
  bounded fan-out are the fix; an allowlist would break self-hosted and future
  providers.

Acceptance criteria:
- An account cannot hold more than 20 active subscriptions; the 21st evicts the
  least recently used.
- One due browser reminder produces at most 20 outbound sends.
- Repeated successful registrations are rate limited per account.
- Signing out and signing in as a second account in the same browser results in
  a working subscription for the second account.
- Existing push registration, status, and delivery tests pass.

Suggested files:
- `lib/services/push-subscription.service.ts`
- `lib/db/pushSubscriptions.repo.ts`
- `lib/services/reminder.service.ts`
- `lib/push/browser.ts`
- `app/auth/sign-out/route.ts`
- `app/api/push/subscribe/route.ts`
- `tests/push-subscription.service.test.ts`
- `tests/push-browser.test.ts`
- `docs/NOTIFICATION_SPEC.md`

---

## Ticket 083: Settings write atomicity and account-deletion ordering

Make the two destructive Settings paths either fully succeed or leave state
unchanged, as their interaction contracts already promise.

Context:
- Account deletion runs `signOut({ scope: "global" })` first and only then
  constructs the service-role client and deletes the auth user
  (`lib/services/account.service.ts:33-46`). If deletion fails — missing
  `SUPABASE_SERVICE_ROLE_KEY`, transient provider error — the account still
  exists but every session is gone, and the error renders into a Settings page
  the user can no longer reach. Contradicts `INT-SETTINGS-009`
  (`interaction-registry.json:2497`), which describes a recoverable failure.
- Timezone save performs the stale marker, profile update, behavior update, and
  occurrence sync as four independent calls
  (`lib/services/settings.service.ts:74-92`). A failure after the profile write
  leaves the profile on the new zone and behaviors on the old, and background
  sync then expands behaviors in the old zone while recording coverage fresh
  under the new one. Contradicts `INT-SETTINGS-003`
  (`interaction-registry.json:2357`), which promises unchanged stored timezone
  and schedule graph on failure. Found by three audit passes.

Settled decisions:
- Account deletion reorders to: validate confirmation, construct the
  service-role client and verify it is usable, delete the auth user, then sign
  out. A failure before deletion leaves the session intact so the user can read
  the error and retry.
- The timezone save moves behind one owner-scoped atomic database function that
  updates the profile, updates active behaviors, and marks sync state stale in a
  single transaction, following the pattern already established by
  `update_behavior_with_schedule_graph`. Occurrence sync stays outside the
  transaction; it is idempotent and re-runnable.
- On failure, both actions report the specific failure and guarantee no partial
  commit. Do not add a repair path for a partial state that can no longer occur.

Acceptance criteria:
- A simulated `admin.deleteUser` failure leaves the user signed in, on
  Settings, reading a specific error, with the account intact.
- A successful deletion still revokes every session.
- A simulated failure of the behavior timezone update leaves the profile
  timezone unchanged.
- A successful timezone save updates profile and behaviors together and marks
  sync stale exactly once.
- `INT-SETTINGS-003` and `INT-SETTINGS-009` descriptions match observed
  behavior; update `interaction-registry.json` only if the settled behavior
  differs from the recorded contract.

Suggested files:
- `lib/services/account.service.ts`
- `lib/services/settings.service.ts`
- `app/(app)/settings/actions.ts`
- new migration via `npm run supabase -- migration new <descriptive_name>`
- `tests/settings.service.test.ts`
- `tests/account.service.test.ts`
- `docs/USER_FLOWS.md`

---

## Ticket 084: Import apply concurrency fence and partial-failure recovery

Make applying an accepted import run exactly once, even under a double-click or
two tabs.

Context:
- The server does re-verify all four accepted fingerprints before writing, so
  Ticket 055's binding works
  (`lib/services/behaviorlog-import.service.ts:257-301`).
- But nothing locks local state between the check and the writes, every request
  creates its own apply run, and only *restore* has a unique accepted-preview
  fence (`supabase/migrations/20260709191905_bind_import_apply_to_accepted_preview.sql:18-29`
  versus `supabase/migrations/20260709203154_make_behaviorlog_restore_atomic_and_idempotent.sql:18-27`).
- Behavior titles carry no unique constraint
  (`supabase/migrations/20260607204951_create_database_schema.sql:23-39`), and
  writes span multiple transactions
  (`lib/services/behaviorlog-import-write.service.ts:329-511`), so a
  mid-sequence failure marks the ledger failed while leaving created rows
  behind (`:1391-1418`).
- Two tabs applying the same accepted preview both pass the fingerprint check
  before either writes, and both create the behavior with duplicated schedule
  and history. Found by two audit passes.

Settled decisions:
- Give import apply the same unique accepted-preview fence restore already has:
  at most one successful apply per accepted preview run id, enforced by a
  database constraint rather than by application checks.
- A second concurrent apply loses the fence and returns the first run's result
  as an idempotent success, not an error. The user clicked once conceptually.
- Product-row creation and its import mapping insert move into the same
  transaction, so a mapping conflict cannot leave an orphaned behavior.
- A run that fails partway is recorded as failed and its created rows are rolled
  back with it. Do not add a compensating cleanup pass; make the write
  transactional instead.

Acceptance criteria:
- Two concurrent applies of the same accepted preview produce one set of rows;
  the second returns the first's result.
- A forced failure midway through an apply leaves no product rows behind and
  the ledger marked failed.
- Retrying a failed apply from a fresh preview succeeds.
- Existing fingerprint-binding and merge-preview tests pass unchanged.

Suggested files:
- `lib/services/behaviorlog-import.service.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- `lib/db/behaviorLogImports.repo.ts`
- new migration via `npm run supabase -- migration new <descriptive_name>`
- `tests/behaviorlog-import-apply.service.test.ts`
- `docs/EXPORT_FORMATS.md`

---

## Ticket 085: Occurrence identity for overlapping schedule time entries

Let an exact-time entry and a range entry that share a start time coexist on the
same behavior and day, as the recurrence contract already specifies.

Context:
- `docs/RECURRENCE_RULES.md:70-73` defines occurrence identity as behavior +
  local date + start time + end-time/range identity.
- The resolver honors that and plans both occurrences
  (`lib/resolvers/occurrence.resolver.ts:436-457`).
- The database key does not include range identity:
  `unique (behavior_id, scheduled_for)`
  (`supabase/migrations/20260607204951_create_database_schema.sql:63`), and the
  upsert conflict target matches it
  (`lib/db/occurrences.repo.ts:271`). Only one row survives.
- Form validation permits creating exactly this shape, because duplicate start
  times are rejected only *within* a single schedule
  (`lib/services/behavior-form.ts:459-475`: "Use each start time only once
  within a schedule").
- Result: a Daily exact 09:00 schedule plus a Monday 09:00-12:00 range schedule
  silently loses one occurrence every Monday, in Timeline, reminders, and
  analytics alike.

Settled decisions:
- Occurrence identity in the database becomes behavior + local date + start
  time + range identity, matching the documented rule.
- Implement it as a stored generated column on `occurrences` holding the range
  identity, with the unique key over
  `(behavior_id, local_date, schedule_start_time, <generated column>)`, so the
  PostgREST upsert can name real columns as its conflict target. Do not rely on
  a partial or expression index that `onConflict` cannot reference.
- Detect and report existing duplicate-suppressed rows before swapping the
  constraint. If any account already lost occurrences to this key, backfill the
  missing rows in the same migration from the owning schedule, as unresolved,
  preserving everything already stored.
- Form validation stays as-is. Two schedules sharing a start time is a
  legitimate shape once the key is fixed; do not add a cross-schedule
  uniqueness rule.

Acceptance criteria:
- A behavior with Daily exact 09:00 and Monday 09:00-12:00 produces two
  distinct occurrences every Monday, in Timeline, reminders, and analytics.
- The migration is idempotent and does not hardcode any account, behavior, or
  occurrence id.
- No existing occurrence row, status, note, or time session is modified or lost
  by the constraint swap.
- Occurrence sync remains idempotent: a second run creates no duplicates.
- `npm run smoke:schedule-integrity:local` passes.

Suggested files:
- new migration via `npm run supabase -- migration new <descriptive_name>`
- `lib/db/occurrences.repo.ts`
- `lib/db/database.types.ts`
- `lib/resolvers/occurrence.resolver.ts`
- `tests/occurrence.resolver.test.ts`
- `tests/sql/ticket-060-schedule-integrity-smoke.sql`
- `docs/DATA_MODEL.md`

---

## Ticket 086: Import validation and dedup gaps

Four validation holes that let a hash-valid bundle write inconsistent or
duplicated history.

Dependencies:
- Ticket 084 for the transactional apply path.

Context:
- Date/instant disagreement: `local_date`, `scheduled_for_utc`, and `timezone`
  are validated separately and never cross-checked
  (`lib/resolvers/behaviorlog-import.resolver.ts:1004-1044`), then persisted
  unchanged (`lib/services/behaviorlog-import-write.service.ts:2539-2553`). A
  bundle declaring `2026-11-01T05:30:00Z` in `America/New_York` with
  `local_date: 2026-10-31` is accepted, and the occurrence groups under the
  wrong day permanently. DST boundaries make this easy to hit by accident.
  Contradicts `docs/DATETIME_STRATEGY.md:66-75`.
- Cross-behavior schedule references: validation checks that the occurrence's
  behavior and schedule ids exist, never that the schedule belongs to that
  behavior (`lib/resolvers/behaviorlog-import.resolver.ts:1437-1457`). The FK
  enforces account ownership only
  (`supabase/migrations/20260609202707_add_behavior_schedule_slots.sql:136-139`).
  The same inconsistent shape is reachable in the live schema, since a slot's
  `behavior_id` and its schedule parent are independently constrained.
- Duplicate intervention ids: duplicate detection covers behaviors, schedules,
  occurrences, status events, and notes, but omits interventions
  (`lib/resolvers/behaviorlog-import.resolver.ts:354-370`). Apply collapses
  them by external id while keeping both actions
  (`lib/services/behaviorlog-import-write.service.ts:814-821`), so the first
  write stores the last plan and the second no-ops. Preview shows no conflict.
- Note reimport: merge preview maps a matching external note id to the existing
  imported-note row without comparing content or attachment
  (`lib/resolvers/behaviorlog-import.resolver.ts:2663-2725`), then apply treats
  that note row's id as the note's parent `targetLocalId` while its dedup query
  is scoped to the current run
  (`lib/services/behaviorlog-import-write.service.ts:2032-2129`). Reimporting
  the same note creates a duplicate parented to the first note.

Settled decisions:
- Validation derives the local date from the instant and timezone and compares
  it to the declared `local_date`. A mismatch is a blocking error, not a
  warning: the record is wrong, and accepting it corrupts day grouping.
- Occurrence cross-reference validation additionally requires that the
  referenced schedule's behavior equals the occurrence's behavior. Mismatch is
  a blocking error.
- Add a composite foreign key so the database enforces the same rule for
  schedule slots, closing the shape at both layers.
- Interventions join the duplicate-id detection set with the same
  blocking-error treatment as the other record types.
- Note mapping compares the note's attachment target as well as its external
  id, and the apply dedup query is scoped to the account rather than the run.

Acceptance criteria:
- A bundle whose `local_date` disagrees with its instant and timezone is
  rejected at preview with a clear per-record error.
- A bundle attaching behavior B's schedule to behavior A's occurrence is
  rejected at preview.
- A bundle with two intervention rows sharing an id is rejected at preview
  rather than silently keeping one.
- Importing the same note-bearing bundle twice produces one note, correctly
  parented to its behavior.
- A valid Cadence export still imports cleanly with no new errors or warnings.

Suggested files:
- `lib/resolvers/behaviorlog-import.resolver.ts`
- `lib/services/behaviorlog-import-write.service.ts`
- new migration via `npm run supabase -- migration new <descriptive_name>`
- `tests/behaviorlog-import-merge-preview.test.ts`
- `tests/behaviorlog-import.resolver.test.ts`
- `docs/EXPORT_FORMATS.md`

---

## Ticket 087: Multi-tab concurrency for behavior edits, statuses, notes, and cache

Stop a second tab from silently reverting work, and stop a stale cache write
from resurrecting deleted state.

Context:
- Stale behavior form: the edit form submits the full draft with no client
  revision or `updated_at`
  (`components/behaviors/BehaviorForm.tsx:204-206`). The service reads the
  latest record *after* submission and uses that as the RPC precondition
  (`lib/services/behavior.service.ts:141-193`), so the RPC guards server-side
  interleaving but accepts an arbitrarily old browser draft. Tab A saves a
  schedule change; Tab B saves a title change from its older draft and reverts
  A's schedule with no warning.
- Status conflict UI: the server correctly rejects a stale `expected_status`
  (`lib/services/occurrence.service.ts:680-684`), but the client error branch
  only clears optimistic state
  (`components/timeline/StatusButtons.tsx:140-157`), rolling back to the stale
  prop. The user is told "status changed" and then shown the old status.
- Behavior review submissions: review rows do not pass the shared optimistic
  `disabled` state, and `useFormStatus` disables only the submitted form
  (`components/behaviors/BehaviorList.tsx:680-684`), so a sibling status button
  stays live during an in-flight request.
- Note last-write-wins: the note update filters only on user and occurrence id
  with no expected prior value
  (`lib/services/occurrence.service.ts:783-794`,
  `lib/db/occurrences.repo.ts:280-289`).
- Cache write-back: a miss loads asynchronously and writes back unconditionally
  (`lib/cache/user-read-cache.ts:39-64`), so a mutation that invalidates the key
  mid-load is overwritten when the older load resolves — an archived behavior
  can render as active for up to the 60s TTL. The map is also process-local, so
  invalidation does not cross Vercel instances.

Settled decisions:
- The behavior edit form carries the loaded record's `updated_at` as a hidden
  precondition, and the update RPC rejects a mismatch. The failure is a
  first-class conflict state, not a generic error: tell the user the behavior
  changed elsewhere and offer to reload, without discarding their draft.
- A status conflict refreshes the route on the error path as well as the
  success path, so the UI lands on server truth rather than the state that
  caused the conflict.
- Behavior review status controls share the same optimistic disabled state
  Timeline rows use, so only one status submission per occurrence can be in
  flight.
- Note saves carry an expected prior value and surface a conflict rather than
  overwriting. Notes are user-authored prose; silent loss is worse than a
  prompt.
- Cache entries carry a generation counter incremented by invalidation. A load
  that started before an invalidation does not write back.
- Cross-instance cache coherence stays out of scope; the 60s TTL remains the
  bound. Document that explicitly rather than implying global correctness.

Acceptance criteria:
- Two tabs editing one behavior: the second save reports a conflict and does not
  revert the first tab's schedule change.
- A status conflict leaves the row showing the server's current status.
- Rapidly clicking Completed then Not Completed in behavior review issues one
  submission.
- A note conflict is reported rather than silently overwritten.
- A behavior archived during an in-flight cached read does not reappear as
  active.

Suggested files:
- `components/behaviors/BehaviorForm.tsx`
- `components/behaviors/BehaviorList.tsx`
- `components/timeline/StatusButtons.tsx`
- `lib/services/behavior.service.ts`
- `lib/services/occurrence.service.ts`
- `lib/cache/user-read-cache.ts`
- `tests/user-read-cache.test.ts`
- `docs/USER_FLOWS.md`
- `interaction-registry.json`

---

## Ticket 088: Background sync freshness and timezone propagation

Stop background synchronization from certifying stale schedules as fresh, and
stop new behaviors from inheriting an obsolete timezone.

Dependencies:
- Ticket 083 for the atomic timezone write.

Context:
- The sync processor loads behaviors *before* reading sync state
  (`lib/services/occurrence.service.ts:404-445`), and the final upsert clears
  `stale` with no generation number or expected-state check (`:538-540`,
  `lib/db/occurrenceSyncState.repo.ts:78`). A behavior edit committed in that
  window is written over: the processor generates from its stale snapshot and
  then marks the user fresh, so the edit is never picked up.
- Behavior creation prefers the hidden form timezone over the current profile
  timezone (`components/behaviors/BehaviorForm.tsx:209-210`,
  `lib/services/behavior.service.ts:85-92`), while generation uses the
  behavior's stored zone and sync state records the profile zone as fresh
  (`lib/services/occurrence.service.ts:167`, `:337`). Later synchronization
  never repairs the mismatch. Found by two audit passes.

Settled decisions:
- Sync state carries a generation counter. Behavior writes increment it; the
  processor captures it before loading behaviors and the final freshness upsert
  applies only when the counter is unchanged. A bumped counter means the run's
  snapshot is obsolete: leave the account stale for the next run.
- Behavior creation uses the server's current profile timezone as the source of
  truth. The hidden form field is removed rather than merely deprioritized, so
  the stale value cannot be submitted at all.
- Freshness is never recorded for a timezone other than the one actually used
  to expand the behaviors in that run.

Acceptance criteria:
- A behavior edit committed while a sync run is in flight leaves the account
  stale and is applied by the next run.
- A behavior created from a tab loaded before a timezone change is stored in
  the current profile timezone.
- Sync state never records a timezone that differs from the expansion timezone.
- Repeated sync runs remain idempotent.

Suggested files:
- `lib/services/occurrence.service.ts`
- `lib/db/occurrenceSyncState.repo.ts`
- `lib/services/behavior.service.ts`
- `components/behaviors/BehaviorForm.tsx`
- new migration via `npm run supabase -- migration new <descriptive_name>`
- `tests/occurrence-sync-state.service.test.ts`
- `docs/DATETIME_STRATEGY.md`

---

## Ticket 089: Timeline and Export interaction correctness

Five interaction defects across Timeline and Export that strand, discard, or
mislead.

Context:
- Note remount discards typing: a successful save starts `router.refresh()`
  while leaving the textarea editable
  (`components/timeline/OccurrenceNoteForm.tsx:33-52`), and both hosts key the
  form on the stored note value (`components/timeline/OccurrenceRow.tsx:222`,
  `components/behaviors/BehaviorList.tsx:690`). When refreshed data changes the
  key, React remounts and drops any newer draft.
- Stale preview stays actionable: selecting another import or restore file
  replaces the payload without invalidating the rendered preview or its
  confirmation controls
  (`components/export/BehaviorLogImportPanel.tsx:59-66`, `:194`, `:521`,
  `components/export/BehaviorLogRestorePanel.tsx:57-64`, `:183`). Server
  fingerprint checks prevent corruption, so the user is walked to the end of a
  destructive confirm flow for a guaranteed failure.
- Timer loses Stop at midnight: a timer may start on a current-day resolved
  occurrence (`lib/resolvers/time-tracking.resolver.ts:46`), but after midnight
  the retention rule drops that row from Timeline
  (`lib/resolvers/timeline.resolver.ts:190-205`) and behavior review exposes
  only Reset (`components/behaviors/BehaviorReviewTimeReset.tsx:25-32`). The
  user can discard the elapsed time but not keep it, contrary to
  `docs/USER_FLOWS.md:274`.
- Chime blocks reconciliation: a Completed transition awaits the full audio
  fallback chain before `router.refresh()` and `onStatusSuccess`
  (`components/timeline/StatusButtons.tsx:145-146`,
  `lib/ui/completion-feedback.ts:77`, `:106`, `:253`), with no timeout on media
  playback, context resume, or asset fetch. A stalled asset leaves a committed
  row stuck in optimistic "Saving" with controls disabled.
- Pull-to-refresh captures modal gestures: the wrapper contains the modal,
  checks *document* scroll position rather than the modal's scroll container,
  and its interactive-target selector omits `<summary>`
  (`components/timeline/MobileTimelinePullToRefresh.tsx:24`, `:90`, `:128`,
  `components/timeline/Timeline.tsx:31-33`). Scrolling a long modal at 390px can
  lock into a Timeline refresh and `preventDefault` the modal's own scroll,
  contradicting `INT-TIMELINE-010` (`interaction-registry.json:1295`).

Settled decisions:
- The note form is no longer keyed on the stored value. It reconciles on
  successful save and preserves any draft typed after the save started.
- Selecting a new file clears the previous preview and disables its
  confirmation controls immediately. The user re-previews; no destructive
  control is ever live against a payload it does not describe.
- Stop remains available wherever a running timer is reachable, including
  behavior review after the Timeline row ages out. Reset is not an acceptable
  substitute, because it discards the duration.
- Completion feedback is fire-and-forget: audio never gates `router.refresh()`
  or `onStatusSuccess`. Keep the existing exactly-once playback guarantee from
  Ticket 071 — it is a sequencing change, not a removal.
- The pull gesture checks the scroll position of the nearest scrollable
  ancestor, treats `<summary>` as interactive, and does not arm while a modal is
  open.

Acceptance criteria:
- Typing immediately after a successful note save is preserved.
- Selecting a second file leaves no actionable preview from the first.
- A timer running on an aged-out resolved occurrence can still be stopped with
  its duration preserved.
- A stalled chime asset does not leave a committed row disabled.
- Scrolling and swiping inside an open Needs decision modal never triggers a
  Timeline refresh.
- Ticket 071's single-playback and 48px alignment regressions still pass.

Suggested files:
- `components/timeline/OccurrenceNoteForm.tsx`
- `components/timeline/OccurrenceRow.tsx`
- `components/timeline/StatusButtons.tsx`
- `components/timeline/MobileTimelinePullToRefresh.tsx`
- `components/timeline/mobile-pull-to-refresh.ts`
- `components/behaviors/BehaviorReviewTimeReset.tsx`
- `components/export/BehaviorLogImportPanel.tsx`
- `components/export/BehaviorLogRestorePanel.tsx`
- `lib/ui/completion-feedback.ts`
- `tests/timeline-interactions-ui.test.tsx`
- `interaction-registry.json`

---

## Ticket 090: Accessibility, form errors, and hydration determinism

Three defects that break the documented WCAG 2.2 AA baseline or leave the user
without feedback.

Context:
- Focus trap: the Needs decision dialog's focusable selector omits native
  `<summary>` elements while collecting controls inside *closed* `<details>`,
  because it never tests visibility
  (`components/timeline/NeedsDecisionDialog.tsx:13`, `:65`, `:83`, `:185`).
  Focus can escape the `aria-modal` dialog after the last summary, and
  Shift+Tab can target a hidden control. `PRODUCT.md:55` commits to WCAG 2.2 AA.
- Invisible recurrence errors: the server writes incomplete-recurrence errors
  to `fieldErrors.recurrence` (`lib/services/behavior-form.ts:112`, `:670`) but
  the form renders only `fieldErrors.schedule`
  (`components/behaviors/BehaviorForm.tsx:438-447`, `:832`). Selecting Weekly,
  clearing every weekday, and saving yields "Check the highlighted fields" with
  nothing highlighted.
- Hydration mismatch: both Export client panels format run timestamps during
  render with no explicit timezone
  (`components/export/BehaviorLogImportPanel.tsx:704`, `:1114`,
  `components/export/BehaviorLogRestorePanel.tsx:550`, `:683`), so the server
  renders in the server's zone and hydration in the browser's. A run at
  `2026-08-06T00:30:00Z` renders "August 6" on a UTC server and "August 5" in an
  America/New_York browser. STATUS.md records an unexplained production
  hydration warning on Timeline, Behaviors, and Export from Ticket 070; this is
  a confirmed mismatch source on Export but is not yet proven to be that
  warning.

Settled decisions:
- The dialog's focusable set includes `<summary>` and excludes anything not
  currently rendered, tested by visibility rather than by tag list.
- Every `fieldErrors` key the server can produce has a rendered surface. Add a
  check so a new key cannot be introduced without one.
- All user-facing timestamp formatting takes the resolved profile timezone
  explicitly. No locale formatting runs against an implicit ambient zone.
- Sweep Timeline and Behaviors for the same pattern in this ticket. If the
  production warning persists after the sweep, record that in STATUS.md rather
  than closing the item as fixed — do not claim a root cause that was not
  demonstrated.

Acceptance criteria:
- Tab and Shift+Tab remain inside the Needs decision dialog with all rows
  collapsed, and never focus a hidden control.
- Saving a Weekly behavior with no weekday selected shows a message on the
  recurrence field.
- Server and client render identical timestamp text for a fixed instant with
  the server and browser in different zones.
- No new hydration warning appears in a production-mode render of Timeline,
  Behaviors, and Export.

Suggested files:
- `components/timeline/NeedsDecisionDialog.tsx`
- `components/behaviors/BehaviorForm.tsx`
- `components/export/BehaviorLogImportPanel.tsx`
- `components/export/BehaviorLogRestorePanel.tsx`
- `lib/services/behavior-form.ts`
- `tests/ux-ticket-049-052-ui.test.tsx`
- `docs/UI_SPEC.md`

---

## Ticket 091: Reminder delivery cadence and export cost guardrails

Close the gap between the reminder granularity the product offers and the
granularity it delivers, and stop the Export page from doing unbounded work on
load.

Dependencies:
- Ticket 080 for claim recovery, and Ticket 081 for paginated reads.

Context:
- `vercel.json:5-6` runs reminder processing at `0 * * * *`. The product offers
  "at scheduled start" and "15 minutes before"
  (`docs/NOTIFICATION_SPEC.md:97-99`, `docs/UI_SPEC.md:448-449`), and the
  processor only sends already-due rows. An at-start reminder due at 09:01
  arrives at 10:00 — the offered granularity and the delivered granularity are
  two orders of magnitude apart.
- Merely *opening* the Export page builds the entire bundle with
  `enforceDownloadGuardrails: false`
  (`app/(app)/export/page.tsx:64`, `lib/services/export.service.ts:114-117`),
  so no rate limit or circuit breaker applies. The resolver simultaneously
  materializes JSONL, CSV, JSON, Markdown, and BehaviorLog structures
  (`lib/resolvers/export.resolver.ts:222-259`) with ZIP buffers on top
  (`lib/services/zip.ts:41`). Time-tracking exports also put every included
  occurrence id into a single `.in(...)`, which becomes an oversized URI.

Settled decisions:
- Reminder processing runs every 5 minutes. Worst-case lateness drops to about
  5 minutes, which is defensible against a 15-minute-before offset. Confirm the
  cron frequency available on the current Vercel plan before implementing; if
  5 minutes is unavailable, record the achievable frequency and narrow the
  offsets the UI offers to match rather than shipping a promise the platform
  cannot keep.
- The Export page renders from a summary read — counts, range, and available
  formats — and does not build downloadable artifacts. Artifacts are built only
  on the download request, where guardrails already apply.
- Time-session reads are chunked by occurrence id rather than sent as one
  `.in(...)`.
- No hard cap on export size in this ticket. Streaming or chunked download is
  future work; the fix here is to stop paying the cost on page load.

Acceptance criteria:
- A reminder due at 09:01 is delivered within about 5 minutes.
- The offsets offered in the UI are all deliverable at the configured cron
  frequency.
- Opening the Export page issues no artifact serialization and no rate-limit
  consumption.
- An all-time export with time tracking on a large account completes without an
  oversized query URI.
- Existing export artifact content and filenames are unchanged.

Suggested files:
- `vercel.json`
- `app/(app)/export/page.tsx`
- `lib/services/export.service.ts`
- `lib/db/timeSessions.repo.ts`
- `docs/NOTIFICATION_SPEC.md`
- `docs/VERCEL_WORKFLOW.md`
- `tests/export.service.test.ts`

---

## Ticket 092: Marketing example bundle and agent-readability parity

Make the advertised example bundle actually import, and make the markdown
mirrors say what the HTML says.

Context:
- The generated example emits `recurrence: { frequency: "daily", interval: 1 }`
  (`apps/marketing/scripts/build-example-bundle.mjs:46-49`), but
  `isSupportedRecurrence` switches on `recurrence.type`
  (`lib/resolvers/behaviorlog-import.resolver.ts:4354-4377`) and the exporter
  emits `type` (`lib/resolvers/export.resolver.ts:1781-1800`). The example
  schedule is skipped as `unsupported_recurrence` and its behavior is skipped
  for having no supported schedule. The marketing check only asserts the archive
  is non-empty (`apps/marketing/scripts/check-agent-readability.mjs:110-111`).
  This is the adoption surface for the BehaviorLog standard: the one file a
  prospective user downloads to try the flow fails the flow.
- `/cadence` and `/standard` are documented as dedicated pages
  (`docs/ROUTE_MAP.md:35-42`,
  `docs/PUBLIC_PRODUCT_ARCHITECTURE.md:111-120`) but redirect to the homepage
  (`apps/marketing/astro.config.mjs:6-12`) and appear in no manifest, sitemap,
  markdown mirror, or `llms-full.txt`. The real `/faq` page is missing from the
  route map. The header also lacks the documented Cadence and BehaviorLog links.
- The HTML About page states there is no third-party analytics or behavioral
  tracking (`apps/marketing/src/pages/about.astro:64-76`); its markdown source
  omits the claim (`apps/marketing/src/data/routes.ts:141-172`). The Examples
  page's "no real account or reminder-provider data" statement is likewise
  weakened in its mirror. `llms-full.txt` and the `.md` routes consume the
  divergent copy, so an agent and a human read different privacy postures.

Settled decisions:
- The example generator emits the same recurrence shape the exporter produces.
  The generator stops hand-authoring bundle records where it can reuse export
  serialization instead.
- The marketing readability check gains a real conformance assertion: the
  generated example must pass Cadence's own import preview with zero errors and
  zero skipped behaviors. A non-empty archive is not evidence.
- Documentation follows implementation for routes: `/cadence` and `/standard`
  remain redirects and the docs stop describing them as pages, and `/faq` is
  added to the route map. Revisit dedicated pages only under a scoped ticket.
- Markdown mirrors must carry every substantive claim the HTML page makes,
  especially privacy and data-handling statements. Add a parity check rather
  than relying on review.

Acceptance criteria:
- The published example bundle imports into Cadence with zero errors and its
  behavior and schedule created.
- `npm run marketing:check` fails if the example stops importing cleanly.
- Route documentation matches the shipped routes in both directions.
- Every privacy and data-handling claim in an HTML page appears in its markdown
  mirror, enforced by a check.
- `npm run marketing:build` and the agent-readability gate pass.

Suggested files:
- `apps/marketing/scripts/build-example-bundle.mjs`
- `apps/marketing/scripts/check-agent-readability.mjs`
- `apps/marketing/src/data/routes.ts`
- `apps/marketing/src/pages/about.astro`
- `apps/marketing/src/pages/examples.astro`
- `docs/ROUTE_MAP.md`
- `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`

---

## Ticket 093: Governance checks, environment contract, and database operations

Close the gaps that let the repository's own guardrails report success while
invariants drift.

Context:
- The interaction checker compares marker counts and implementation substrings
  (`scripts/check-interactions.mjs:136-141`, `:325-333`, `:435-442`), so an
  existing control whose side effect changes — a note update becoming an
  occurrence delete — passes with a stale registry. The resolver checker's
  "nontrivial API logic" regex omits direct `.rpc(` and `.upsert(` calls
  (`scripts/check-resolvers.mjs:182-205`), so a route can reach Supabase
  directly without tripping the bypass rule. Both report large invariant counts
  (4,498 interaction invariants at Ticket 071), which reads as stronger coverage
  than it is.
- `NEXT_PUBLIC_MARKETING_SITE_URL`, `MARKETING_SITE_URL`, and
  `PUBLIC_CADENCE_APP_URL` are read but documented nowhere and all fall back to
  production domains (`lib/marketing-site.ts:1-3`,
  `apps/marketing/src/data/site.ts:5-10`). The env checker uses a fixed list
  that omits all three (`scripts/check-agents.mjs:186-208`). A preview marketing
  deploy without `PUBLIC_CADENCE_APP_URL` sends testers into the production app.
  `CADENCE_PERF_LOG` and `DESIGN_SYSTEM_BENCH_SKILL_DIR` are also unlisted.
- The daily sync batch orders all accounts by stale state, horizon, update time,
  and user id (`lib/services/occurrence.service.ts:510-518`), but the only index
  starts with `user_id`
  (`supabase/migrations/20260625204148_add_occurrence_sync_state.sql:33-34`), so
  each 25-row batch scans and sorts the whole ledger as accounts grow.
- Two large migrations combine table creation, backfills, `SET NOT NULL`, and FK
  creation without explicit transaction boundaries
  (`supabase/migrations/20260609202707_add_behavior_schedule_slots.sql:1-139`,
  `supabase/migrations/20260626140000_add_behavior_schedules.sql:1-142`). Under
  hosted push semantics an intermediate failure leaves earlier statements
  committed, so the retry fails at `CREATE TABLE`.
- `vercel.json:8-10` schedules occurrence sync, but
  `docs/VERCEL_WORKFLOW.md:108-131` documents only reminder processing while
  claiming to own scheduled triggers.
- `INT-SETTINGS-004` says the notification action appears only when permission
  is not denied (`interaction-registry.json:2378`); the panel shows "Refresh
  this device" whenever push is supported
  (`components/settings/NotificationPermissionPanel.tsx:110`, `:148`, `:311`).
- Test-login gating is sound, but once enabled every successful GET creates
  another confirmed auth user and only a *failed* sign-in deletes one
  (`app/auth/test-login/route.ts:41-70`); cleanup is operator-run only.

Settled decisions:
- The interaction check verifies each registry entry's recorded side effect
  against the handler it names, not just marker presence and counts. Where that
  cannot be mechanically verified, the entry is flagged for human review rather
  than counted as passing.
- Invariant counts stop being reported as a headline number, since they invite
  false confidence. Report checked entries and unverifiable entries separately.
- The resolver bypass pattern includes `.rpc(` and `.upsert(`.
- `.env.example` documents every variable the app reads, and the env checker
  derives its list from the source rather than a hardcoded array. Any variable
  whose absence changes behavior gets an explicit default and a comment naming
  the consequence.
- Add the composite index matching the sync batch's ordering.
- Both historical migrations are left as-is — rewriting applied migrations is
  more dangerous than the defect. Instead, document the transaction requirement
  in `docs/SUPABASE_WORKFLOW.md` and add a check that new migrations containing
  a backfill or `SET NOT NULL` carry explicit `begin`/`commit`.
- Resolve the notification-panel drift by deciding which behavior is intended
  and correcting the other side. Denied permission should still show the
  refresh action, since a user who re-grants permission in browser settings
  needs a way to re-register; update the registry entry to match.
- Test-login gains a creation quota per process and a documented cleanup
  cadence in `docs/OPERATIONS.md`.
- `docs/VERCEL_WORKFLOW.md` documents both crons.

Acceptance criteria:
- A deliberately altered interaction side effect fails `npm run
  interactions:check`.
- A route added with a direct `.rpc(` call fails `npm run resolvers:check`.
- `npm run agents:check` fails when the source reads a variable absent from
  `.env.example`.
- The sync batch query uses the new index.
- A new migration with a backfill and no explicit transaction fails the check.
- `docs/VERCEL_WORKFLOW.md` lists both scheduled jobs.
- `INT-SETTINGS-004` matches the shipped panel.

Suggested files:
- `scripts/check-interactions.mjs`
- `scripts/check-resolvers.mjs`
- `scripts/check-agents.mjs`
- `.env.example`
- new migration via `npm run supabase -- migration new <descriptive_name>`
- `docs/SUPABASE_WORKFLOW.md`
- `docs/VERCEL_WORKFLOW.md`
- `docs/OPERATIONS.md`
- `interaction-registry.json`

---

## Deferred work

PWA caching, offline timeline access, local pending status changes, and sync conflict handling are not part of the v1 ticket sequence.

See `/docs/FUTURE_UPDATES.md`.
