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

## Behavior schedules and time entries

Behaviors can have one or more schedules. Each schedule owns one recurrence
pattern and one or more exact times or time ranges. Add time means another time
entry under the same recurrence. Add schedule means another recurrence pattern.

Supported preset ranges:
- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

Range occurrences use the beginning of the range as their scheduled reminder
anchor. Matching generated occurrences with the same behavior, local date,
start time, and end-time/range identity are counted once. Multi-time behavior
completion is derived from individual occurrence statuses only; do not add a
stored partial-completion status or progress label.

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

Build a custom, open-source Cadence product.

Do not start by integrating an open-source habit tracker.

Cadence is now a public product posture, not a private-only app. The current
web app should be hardened for many independent single-account users while
remaining single-player and small.

Cadence also demonstrates and promotes the BehaviorLog Bundle standard:
`https://github.com/emixd12/BehaviorLog-Bundle`.

## Public surface architecture

Use separate shells for separate surfaces:

- authenticated web app: current Next.js app,
- marketing site: implemented sibling Astro app,
- desktop app: future Tauri proposal,
- mobile app: future local-first app following the desktop direction.

When the repository is restructured, prefer:

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

Do not restructure the repository without a scoped ticket. Start with npm
workspaces unless multi-app task orchestration justifies Turborepo.

## Marketing stack

Use Astro for the public marketing site. Keep it SEO-conscious, static-first,
and visually consistent with `docs/PRODUCT_SPEC.md` and `DESIGN.md`.

## Pricing and AI

Billing is not launch scope. The intended future shape is free open-source
desktop/mobile apps plus paid web/shared-account capabilities for cross-surface
saving and future speech-to-speech AI features.

Do not add payment or AI speech features until tickets update the relevant
product, route, data, legal, and operations docs.
