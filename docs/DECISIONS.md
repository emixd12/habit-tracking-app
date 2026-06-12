# Locked Product Decisions

These decisions are already resolved. Do not re-ask them unless a later user prompt explicitly changes them.

## Status model

Use explicit manual marking.

Statuses:
- unresolved
- completed
- not_completed

Do not auto-mark an occurrence as missed.

Needs decision is a derived UI state for prior-day unresolved occurrences, not a stored status.

The UI labels `completed` as Completed and `not_completed` as Not Completed.

Occurrence rows keep a current-status snapshot. Internal
`occurrence_status_events` rows store explicit status history for auditability
and BehaviorLog interoperability.

## Primary route

Use Timeline as the primary screen.

Route:
`/timeline`

Avoid:
`/dashboard`

## Day reset

Use local midnight.

Default timezone:
America/New_York

## Medication tracking

V1 tracks only did/did not.

Do not add:
- Dose amount
- Supply count
- Refill inventory
- Medication calculation logic

## Measurements

No structured measurement templates in v1.

Use:
- Behavior title
- Behavior description
- Occurrence note

## Recurrence anchor

Use scheduled date/time.

Recurring behaviors should recur according to their schedule, not from the last completion date.

## Behavior schedule slots

Behaviors can have one or more exact times or preset time ranges.

Supported preset ranges:
- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

Range occurrences use the beginning of the range as their scheduled reminder
anchor. Multi-time behavior completion is derived from individual occurrence
statuses only; do not add a stored partial-completion status or progress label.

## Reminders

Browser notifications:
- Enabled by default on every behavior
- Permission is requested from Settings

Email reminders:
- Optional per behavior
- Configured when creating/editing behavior

## Offline behavior

Internet-required web app is acceptable.

Offline support and PWA caching are deferred from v1.

Future offline/PWA work is tracked in `/docs/FUTURE_UPDATES.md`.

## Auth

Use Google login through Supabase Auth unless implementation complexity becomes disproportionate.

## Supabase operations

Use the Supabase CLI as the standard pathway for database and hosted project operations.

- Use project-local commands through `npm run supabase -- <command>`.
- Use migrations for all schema changes.
- Keep local and hosted schema congruent through git-tracked migrations.
- Do not change the hosted database directly outside migrations.
- Use `docs/SUPABASE_WORKFLOW.md` for command details.

## Email provider

Use Sequenzy for v1 email reminders.

- Use the Sequenzy CLI as the standard agent pathway for provider operations.
- Use project-local commands through `npm run sequenzy -- <command>`.
- Keep runtime email sending server-only.
- Do not expose `SEQUENZY_API_KEY` to the browser.
- Use `docs/SEQUENZY_WORKFLOW.md` for command details.

## Date and time implementation

Use the strategy in `docs/DATETIME_STRATEGY.md`.

- Default timezone remains `America/New_York`.
- Use local midnight for day boundaries.
- Store `scheduled_for` as `timestamptz` and `local_date` as the local calendar date.
- Use Temporal for timezone-aware implementation when recurrence logic begins.
- Inject `now` into resolvers; do not read the system clock inside resolver logic.

## Agent drift checks

Run `npm run agents:check` and `npm run resolvers:check` before considering any coding task complete.

These checks are part of the repository contract and should be extended when new drift risks appear.

## Product direction

Build a custom MVP.

Do not start by integrating an open-source habit tracker.
