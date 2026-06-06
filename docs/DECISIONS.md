# Locked Product Decisions

These decisions are already resolved. Do not re-ask them unless a later user prompt explicitly changes them.

## Status model

Use explicit manual marking.

Statuses:
- unresolved
- done
- not_done

Do not auto-mark an occurrence as missed.

Needs decision is a derived UI state for prior-day unresolved occurrences, not a stored status.

The UI labels `done` as Completed and `not_done` as Not Completed.

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

## Product direction

Build a custom MVP.

Do not start by integrating an open-source habit tracker.
