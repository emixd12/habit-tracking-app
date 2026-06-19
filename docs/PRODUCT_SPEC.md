# Product Spec

## Purpose

Cadence is a public, open-source personal behavior tracker for recurring life
patterns.

The app lets the user define recurring behaviors, see what is scheduled in a timeline, and manually mark each scheduled occurrence as Completed or Not Completed.

Cadence also serves as a practical demonstration and adoption surface for the
BehaviorLog Bundle standard:
`https://github.com/emixd12/BehaviorLog-Bundle`.

## Primary user

One independent account holder using a single-player personal tracker.

The public web app may support many independent accounts, but it is not a
collaboration product. It does not need shared workspaces, role management,
social features, public profiles, admin dashboards, or productivity-suite
sprawl.

The first public-product step is to harden the existing web app for many
independent users with simple Google auth. Billing, desktop, mobile, sync, and
AI speech features are future scope unless tickets explicitly move them into
active work.

## Product surfaces

Target surfaces:

1. Authenticated web app: current Next.js app.
2. Marketing site: future Astro app for Cadence, BehaviorLog, docs links, and
   example bundles.
3. Desktop app: future local-first Tauri app, documented as a proposal in
   `docs/DESKTOP_BUILD.md`.
4. Mobile app: future local-first app following the desktop direction.

The product should eventually live in a composable workspace, but repository
restructuring is not implied by this document alone. See
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md`.

## Core screens

1. Timeline
2. Behaviors
3. Analytics
4. Export
5. Settings

## Public website scope

The current Next.js app includes sparse public account-information routes:
`/terms`, `/privacy`, and `/trust`. These are not the future marketing site.
They exist so users can review product boundaries, privacy, portability, and
account-deletion behavior before signing in.

The marketing site should be a simple Astro site, SEO-conscious from launch,
and visually consistent with `PRODUCT.md` and `DESIGN.md`.

Launch routes:

- `/`: combined landing page explaining Cadence and BehaviorLog
- `/cadence`: product page for the tracker
- `/standard`: BehaviorLog Bundle overview and adoption case
- `/docs`: docs entry point, mostly linking to GitHub files at launch
- `/examples`: optional sample bundle page or homepage section
- `/about`: optional philosophy, governance, privacy, or project page/section

Primary calls to action:

- Try Cadence
- Read the Standard
- Download Example Bundle
- View on GitHub

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

Public launch may add a minimal onboarding flow after first login:

- create first behavior
- request browser notification permission
- import data when import exists
- detect timezone automatically when possible and allow manual override

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

BehaviorLog imports can also preserve general note records attached to
behaviors, occurrences, status events, and reviews. These imported records are
passive user-review context: Cadence stores their role, sensitivity, source
metadata, source original id, timestamps, and attachment target, but it must not
turn them into objective analytics facts.

Occurrence-attached imported notes may fill the existing Timeline occurrence
Note field only when an accepted import plan safely identifies the occurrence,
the note is not AI-generated, and the local occurrence note is empty. Behavior,
status-event, review, and conflicting occurrence notes remain imported note
records rather than product notes on Timeline or Behaviors. Import preview and
apply summaries should distinguish inline occurrence-note fills from general
imported note records.

High or restricted sensitivity imported notes require an explicit privacy
acknowledgement before apply. AI-generated notes are previewed with warnings but
not imported into Cadence notes in v1.

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
- A completion-intensity calendar heatmap for overall adherence
- Per-behavior charts or heatmaps where useful
- Per-behavior tracking start date, visible in text and marked in the
  per-behavior calendar when it falls inside the selected range
- Day-level representation of full completion, partial completion, and not completed when a behavior has multiple occurrences in one day
- A way to see occurrences that were not completed on a given day
- Default adherence rate excludes unresolved

The top-level Analytics summary Unresolved count should match the Timeline
Needs decision count: active unresolved occurrences before the current local
day, regardless of the selected Analytics range. Current-day unresolved
occurrences may still appear as unresolved in the overall heatmap and
behavior/category detail counts, but they are not included in the top summary
Unresolved count until they become prior-day unresolved.

The overall calendar should shade each day by completion share: full blue when
all scheduled occurrences that day are Completed, and proportionally lighter
blue as the completed share decreases. Days with no completed occurrences use
the background end of that scale. Fully unresolved days remain neutral and
should not imply failure.

Example:
If Brush teeth has:
- 24 completed
- 4 not completed
- 1 prior-day unresolved

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

Account deletion and export should be first-class before broad public launch,
consistent with the BehaviorLog portability posture.

The Settings screen implements account deletion for the signed-in account. The
user must acknowledge the export reminder and type the account email, or
`DELETE` when no email is available. The server signs out the account globally
and deletes the Supabase auth user through a server-only service-role client.

## Offline and PWA behavior

Offline support, offline writes, and PWA caching are deferred from v1.

Future offline/PWA work is tracked in `/docs/FUTURE_UPDATES.md`.

## In scope

- Google login
- Many independent single-account users
- Behavior creation/edit/archive
- Categories
- Recurrence rules
- Timeline-first interface
- Notes
- Browser reminders by default
- Optional email reminders
- Basic analytics
- JSONL/CSV/full JSON/BehaviorLog export
- Account deletion with export reminder and typed confirmation
- Public Terms, Privacy, and Trust routes
- Simple onboarding for first behavior, notification permission, import, and timezone
- Public Astro marketing site when explicitly ticketed

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
- AI coaching or speech features in the launch web app
- Marketing/product emails at launch
- Desktop/mobile implementation until proposal work is explicitly scheduled
