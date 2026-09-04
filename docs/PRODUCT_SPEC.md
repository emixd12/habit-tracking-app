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

The web app supports independent users with Google auth. Tickets 107–114
implement local-first macOS tracking with one local profile and no login.
Ticket 115 defers Apple-trusted desktop distribution acceptance.
Tickets 116–122 plan optional use of the same Google account with offline-
capable desktop synchronization. Billing, mobile, and AI speech features remain
future scope.

## Product surfaces

Target surfaces:

1. Authenticated web app: current Next.js app.
2. Marketing site: Astro app under `apps/marketing` for Cadence, BehaviorLog,
   docs links, and example bundles.
3. Desktop app: active local-first Tauri v2, Vite, React, and SQLite track in
   `docs/DESKTOP_BUILD.md`, targeting macOS 14+ on Apple Silicon.
4. Mobile app: future local-first app following the desktop direction.

The desktop track adds `apps/desktop`, `packages/core`, and `packages/ui`
incrementally. Next.js stays at the repository root. Broader restructuring
remains deferred. See `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`.

## Core screens

1. Timeline
2. Behaviors
3. Export & Import
4. Settings

## Public website scope

The current Next.js app includes sparse public account-information routes:
`/terms`, `/privacy`, and `/trust`. These are not the marketing site.
They exist so users can review product boundaries, privacy, portability, and
account-deletion behavior before signing in.

The marketing site is a simple Astro site under `apps/marketing`,
SEO-conscious from launch, and visually consistent with
`docs/PRODUCT_SPEC.md` and `DESIGN.md`.

Launch routes:

- `/`: Cadence-led landing page that introduces BehaviorLog as the open
  portability standard
- `/faq`: frequently asked questions about product philosophy, privacy, time
  tracking, and BehaviorLog portability
- `/docs`: technical docs entry point for Cadence, BehaviorLog,
  machine-readable mirrors, and future docs structure
- `/examples`: sanitized sample bundle page
- `/about`: philosophy, governance, scope boundaries, and open-source posture

Primary calls to action:

- Try Cadence
- Read BehaviorLog
- Download Example Bundle
- View on GitHub
- Log in

Marketing posture:

- Cadence is the site brand, homepage lead, and public product name.
- BehaviorLog is the open bundle standard and portability layer behind Cadence
  exports and imports.
- The marketing header uses the Cadence mark and name only.
- `/cadence` and `/standard` redirect to `/`; neither route has a dedicated
  page or machine-readable mirror.
- `/docs` should grow toward familiar developer-docs sections such as Guides,
  Reference, Examples, Agent policy, and Schema history while keeping
  agent-readable outputs first-class.

The marketing site also publishes `llms.txt`, `llms-full.txt`, Markdown
mirrors, a route manifest, sitemap, and robots output. It does not include
marketing cookies or analytics.

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

Behaviors own one or more schedules. Each schedule has one recurrence pattern
and one or more time entries. Adding a time adds another time entry under the
same recurrence. Adding a schedule creates another recurrence pattern.

Examples:
- Daily at 11:00 PM
- Every 2 days at 11:00 PM

Those examples are two schedules, even though they share a time.

### Schedule

A recurrence pattern plus one or more exact-time or time-range entries for a
behavior.

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

Each explicit manual status change updates the occurrence snapshot and appends
one status-history event atomically. Repeating the already-current resolved
choice is a no-op; a correction or clear creates a linked event. Note-only
edits do not change status timestamps or append status events.

Submitted occurrence decisions can be corrected later. The immediate correction
path is the Needs decision modal: prior-day rows resolved today may remain
visible in their original prior-day group through the current local day, with
the same Timeline row cues. This retention is derived from status timing, not a
stored modal-origin flag. Completed and Not Completed retained rows use
resolved-row labels, with correction available from the expanded row. After
that local-day window, later corrections should be deliberate and
behavior-specific, using the Behaviors screen's behavior date review rather
than turning Timeline into a past-history browser. Inside that review only, a
resolved occurrence can use Clear decision to return to Unresolved. Clear
decision does not appear as a global Timeline or Needs decision control.

### Occurrence time tracking

An active behavior can start elapsed-time tracking from its current-day
Timeline occurrence or from an occurrence that remains visible in Needs
decision. Needs decision eligibility includes prior unresolved occurrences and
prior decisions retained through the current local day. Future occurrences,
archived behaviors, and prior resolved occurrences outside that retention
window cannot start a new timing session. Stop and reset remain available for
persisted timing data.

## Day boundary

The day resets at local midnight.

Default timezone:
`America/New_York`

## Behavior creation

Required fields:
- Title
- Schedule with at least one recurrence pattern and one exact time or time range

Optional fields:
- Description
- Category
- Browser notifications toggle
- Email reminder toggle
- Reminder offset

Browser notifications default to on for each behavior.

Email reminders default to off.

Public launch includes a minimal first-run setup prompt after first login:

- create first behavior
- request browser notification permission
- import data when import exists
- point to Settings timezone confirmation when useful

The setup prompt is optional, appears as a non-modal pop-up, can be dismissed
locally, and routes into the existing Behaviors, Settings, and Export controls
instead of creating a separate wizard.
A denied or blocked browser notification permission counts as a completed
onboarding decision because recovery happens in browser site settings; Cadence
continues to work without browser reminders until permission is allowed again.

Preset time ranges:
- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

A single behavior can have multiple schedules and multiple time entries in one
day. The system generates one occurrence per matching schedule time entry, then
merges overlapping generated occurrences that share the same behavior, local
date, start time, and end-time/range identity. Partial completion for multi-time
behaviors is derived only from mixed occurrence statuses; it is not a stored
status.

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

Import apply must use the exact persisted merge preview the user accepted. The
server verifies that preview run's bundle, local-data, and combined preview
fingerprints before writing, refuses stale or mismatched input, and retains the
accepted preview relationship on the applied import run for audit. It must not
silently recompute and apply a different plan.

V1 does not need structured measurement fields. For measurements, the user can write values in the behavior title, description, or occurrence note. The one narrow exception is elapsed occurrence time: a user may persist start/stop sessions for one occurrence, with the displayed total derived from stopped intervals. It is not a measurement template, target, or status signal.

Example:
- Behavior title: "Take body measurements"
- Description: "Weight, hips, waist, chest. Add values in the note."

## Behavior review and adherence

The Behaviors screen is the primary behavior object surface. It combines
behavior setup, collapsed behavior metadata, range-based adherence, and
deliberate behavior date review. This is a UI composition change over the
existing analytics resolver/service contract, not a separate data model.

Behavior review should be basic:
- Overall adherence at the top of the Behaviors screen
- Completed and Not Completed counts by active behavior
- Optional compact resolved counts by category
- 7/30/90-day windows, defaulting to 30 days
- `completed` and `not_completed` detail counts, with `unresolved` kept as a neutral heatmap and review state
- A completion-intensity calendar heatmap for overall adherence
- Per-behavior charts or heatmaps where useful
- Per-behavior tracking start date, visible in compact MM-DD-YY text and marked
  in the per-behavior calendar when it falls inside the selected range
- Day-level representation of full completion, partial completion, and not completed when a behavior has multiple occurrences in one day
- A way to review one behavior's occurrences on a selected day from the
  behavior-level calendar, with non-empty cells presented as the review entry
  point and empty cells remaining passive
- Default adherence rate excludes unresolved

When a behavior has stopped timing sessions in the selected 7, 30, or 90-day
range, its compact outcome metadata shows `Average tracked time`. Cadence sums
stopped sessions for each occurrence, then takes the arithmetic mean of those
occurrence totals. Untimed occurrences and occurrences with only a running
session are excluded. The line remains hidden when no recorded occurrence total
exists in the selected range.

Review selected day shows `Tracked time` only when an occurrence has stopped
time or a running session. A stopped total shows its recorded duration, a
running-only session shows `In progress`, and both states show both labels.
The existing Review disclosure exposes `Reset tracked time`, which removes all
of that occurrence's timing sessions without changing Status or Note.

The Overall adherence range selector sits directly above the overall calendar.
The selected date range appears under the adherence percentage in compact
month-day wording, and the calendar legend is vertically listed to the right of
the calendar on desktop.

When nonzero, the top-level adherence summary Unresolved count should match the
Timeline Needs decision count: active unresolved occurrences before the current
local day, regardless of the selected Behaviors range. Hide the top summary
Unresolved row when the count is zero. Current-day unresolved occurrences may
still appear as unresolved in the overall heatmap, behavior heatmaps, and
behavior date review rows, but they are not shown as per-behavior or category
count rows and are not included in the top summary Unresolved count until they
become prior-day unresolved.

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
- App JSON snapshot
- BehaviorLog bundle export
- Markdown AI summary

Exports should include:
- Behaviors
- Categories
- Occurrences
- Statuses
- Status event history in Full JSON and the BehaviorLog bundle
- Append-only behavior title and description definition history in Full JSON
  and as an optional Cadence file in BehaviorLog
- Append-only behavior schedule, reminder, category, timezone, and active-state
  configuration history in Full JSON and as an optional Cadence file in
  BehaviorLog
- Nullable Occurrence configuration-event lineage in Full JSON and BehaviorLog
- Notes

Behavior definition and configuration history is export and agent context, not
an in-app revision browser. Full JSON and BehaviorLog include full previous and
next snapshots by default for included Behaviors, including events older than
the selected Occurrence range. Archived filtering applies to both histories.
The Markdown summary reports counts and supports schedule-period segmentation
without causal or clinical claims. JSONL and CSV remain unchanged current
snapshot formats.

Historical definitions and configuration can be sensitive. The Export & Import
screen must disclose their default inclusion. Current BehaviorLog import and
restore replay definition history. Configuration history remains export
context. They create the current schedule graph only and preserve historical
Occurrences as detached schedule snapshots, so old and current recurrence
graphs never become simultaneously active.

Time tracking is excluded from exports by default because exact timestamps can
reveal activity patterns. The Export & Import option uses
`include_time_tracking=1` only after explicit selection. Enabled exports scope
sessions to included occurrences and archived-behavior rules. Import and restore
replay safely mapped standard time sessions. A conflicting running session is
skipped with a warning. `docs/EXPORT_FORMATS.md` owns these portability rules.

Account deletion and export should be first-class before broad public launch,
consistent with the BehaviorLog portability posture.

The Settings screen implements account deletion for the signed-in account. The
user must acknowledge the export reminder and type the account email, or
`DELETE` when no email is available. The server verifies a server-only
service-role client, hard-deletes the Supabase auth user, then attempts global
sign-out for current-browser cleanup. Any failure before deletion leaves the
account and session unchanged. Auth deletion removes server session rows and
refresh capability; issued access-token JWTs remain valid only until expiry.

Public launch monitoring is limited to privacy-safe operational events in
server/runtime logs. It may report route names, coarse failure categories,
methods, and numeric counts, but must not include behavior titles,
descriptions, occurrence notes, account emails, push endpoints, subscription
keys, provider secrets, tokens, request bodies, uploaded bundles, or reminder
message bodies.

## Offline and PWA behavior

Web offline support, offline writes, and PWA caching remain deferred.

Desktop tracking works offline against SQLite with or without an account. Local
mode remains complete and requires no login. Tickets 116–122 add optional
Google account linking, automatic eventual synchronization while the app runs,
conflict review, and explicit disconnect choices within the four-screen model.
Account mode synchronizes product records, histories, provenance, hosted
delivery history, and browser/email reminder preferences. It keeps credentials,
push subscriptions, native reminder state, OS capabilities, and local files
device-local. `docs/DESKTOP_BUILD.md#planned-account-mode` owns the complete
field, snapshot, retry, first-link, and conflict contract.
Local Settings exposes the exact Application Support data path, Reveal in
Finder, Back Up, Restore, account, timezone, onboarding, and native reminder
controls. Raw database Restore remains local-mode only.

Desktop native reminders target 30 days and schedule nearest eligible reminders
first. Show the actual contiguous coverage verified through OS readback and
clearly disclose a shorter OS-limited horizon or unavailable verification.
Do not assume a universal request cap. Reconcile on launch, resume, local day
change, and relevant mutations. No background helper is authorized. Desktop
email delivery remains out of scope. Tickets 116–122 activate the current
outbox/cursor scaffold for optional synchronization.

Future offline/PWA work is tracked in `/docs/FUTURE_UPDATES.md`.

## In scope

- Google login
- Many independent single-account users
- Behavior creation/edit/archive
- Categories
- Recurrence rules
- Timeline-first interface
- Notes
- Browser notifications by default
- Optional email reminders
- Basic analytics
- JSONL/CSV/full JSON/BehaviorLog export
- Account deletion with export reminder and typed confirmation
- Public Terms, Privacy, and Trust routes
- Simple onboarding for first behavior, notification permission, import, and timezone
- Privacy-safe monitoring/error reporting
- Repeatable many-user RLS smoke QA
- Public Astro marketing site when explicitly ticketed
- Local-first macOS tracking parity under Tickets 107–114
- Optional desktop Google account linking and synchronization under Tickets 116–122
- Incremental shared domain code and design tokens, with preserved web APIs

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
- Web offline writes
- Payment/subscription infrastructure
- Admin dashboard
- Automatic missed status
- Any third manual completion status beyond Completed and Not Completed
- AI coaching or speech features in the launch web app
- Marketing/product emails at launch
- Intel desktop releases, desktop email delivery, and closed-app background synchronization
