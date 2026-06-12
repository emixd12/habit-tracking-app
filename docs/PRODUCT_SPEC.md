# Product Spec

## Purpose

A single-user personal behavior tracker for recurring life patterns.

The app lets the user define recurring behaviors, see what is scheduled in a timeline, and manually mark each scheduled occurrence as Completed or Not Completed.

## Primary user

One authenticated user.

This is not a public product. The app should still use proper auth, RLS, and basic security, but it does not need multi-tenant product administration, billing, onboarding funnels, role management, or collaboration.

## Core screens

1. Timeline
2. Behaviors
3. Analytics
4. Export
5. Settings

## Core object model

### Behavior

A recurring thing the user wants to track.

Examples:
- Brush teeth
- Take medication
- Drink matcha
- Workout
- Do laundry
- Take body measurements

### Occurrence

One scheduled instance of a behavior.

Example:
- Brush teeth scheduled for 2026-06-05 at 10:00 PM.
- Stretch scheduled for Morning on 2026-06-05.

### Status

Each occurrence has one status:
- `unresolved`
- `completed`
- `not_completed`

The system does not automatically mark things missed.

Unresolved prior-day items are surfaced through Needs decision.

Needs decision is a derived UI state, not a stored status. It applies when an occurrence is still `unresolved` and its `local_date` is before the current local date.

The UI labels `completed` as Completed and `not_completed` as Not Completed.

## Day boundary

The day resets at local midnight.

Default timezone:
`America/New_York`

## Behavior creation

Required fields:
- Title
- Recurrence
- Schedule with at least one exact time or preset time range

Optional fields:
- Description
- Category
- Browser reminder toggle
- Email reminder toggle
- Reminder offset

Browser reminders default to on.

Email reminders default to off.

Preset time ranges:
- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

A single behavior can have multiple schedule slots in one day. The system
generates one occurrence per matching schedule slot. Partial completion for
multi-time behaviors is derived only from mixed occurrence statuses; it is not a
stored status.

## Notes

Any occurrence can have a free-text note.

V1 does not need structured measurement fields. For measurements, the user can write values in the behavior title, description, or occurrence note.

Example:
- Behavior title: "Take body measurements"
- Description: "Weight, hips, waist, chest. Add values in the note."

## Analytics

Analytics should be basic:
- Overall adherence at the top
- Counts by behavior
- Counts by category
- 7/30/90-day windows, defaulting to 30 days
- `completed` / `not_completed` / `unresolved`
- A binary calendar heatmap for overall adherence
- Per-behavior charts or heatmaps where useful
- Day-level representation of full completion, partial completion, and not completed when a behavior has multiple occurrences in one day
- A way to see occurrences that were not completed on a given day
- Default adherence rate excludes unresolved

Example:
If Brush teeth has:
- 24 completed
- 4 not completed
- 1 unresolved

Default adherence:
`24 / (24 + 4) = 85.7%`

## Export

The app must provide:
- JSONL export
- CSV export
- Full JSON backup
- BehaviorLog bundle export
- Markdown AI summary

Exports should include:
- Behaviors
- Categories
- Occurrences
- Statuses
- Status event history
- Notes

## Offline and PWA behavior

Offline support, offline writes, and PWA caching are deferred from v1.

Future offline/PWA work is tracked in `/docs/FUTURE_UPDATES.md`.

## In scope

- Google login
- Behavior creation/edit/archive
- Categories
- Recurrence rules
- Timeline-first interface
- Notes
- Browser reminders by default
- Optional email reminders
- Basic analytics
- JSONL/CSV/full JSON/BehaviorLog export

## Out of scope

- Structured measurement templates
- Medication dose tracking
- Native mobile app
- Multi-user collaboration
- Social features
- Gamification
- AI coaching
- Calendar sync
- PWA offline cache
- Offline writes
- Payment/subscription infrastructure
- Admin dashboard
- Automatic missed status
- Any third manual completion status beyond Completed and Not Completed
