# User Flows

This document describes the main v1 screens, modules, and user flows.

Cadence is a public product with multiple planned surfaces, but the current
implemented product flows include the authenticated web app and the sibling
Astro marketing site. Marketing flows stay out of the logged-in app and should
not add promotional copy inside the authenticated tracker.

## Public site flow

Implemented public account-information routes:

- `/terms`: sparse product terms
- `/privacy`: privacy notes for account, behavior, reminder, export, import,
  and deletion data
- `/trust`: manual-status, account-isolation, portability, and reminder
  boundary notes

Implemented public marketing routes in the Astro site under `apps/marketing`:

- `/`: Cadence-led landing page that introduces BehaviorLog as the open
  portability standard
- `/cadence`: product page for the tracker
- `/standard`: BehaviorLog Bundle overview and adoption case, surfaced in
  navigation as BehaviorLog
- `/docs`: technical docs entry point for Cadence, BehaviorLog,
  machine-readable mirrors, and future docs structure
- `/examples`: sanitized sample bundle page
- `/about`: philosophy, governance, scope boundaries, and open-source posture

Primary actions:

- Try Cadence
- Read BehaviorLog
- Download Example Bundle
- View on GitHub
- Log in

The site should be simple, static-first, and SEO-conscious. It should not tease
desktop/mobile apps before those surfaces are real or intentionally announced.
It also publishes `llms.txt`, `llms-full.txt`, Markdown mirrors, a public route
manifest, sitemap, and robots output for agents and crawlers.

## First-run onboarding flow

Public web launch includes a minimal onboarding path after Google login.

Steps:

1. Create first behavior.
2. Request browser notification permission.
3. Import data when import exists.
4. Point to Settings timezone confirmation when useful.

Onboarding should stay thin. It should reuse existing app controls and should
not become a broad setup wizard. The Timeline may show a dismissible first-run
setup pop-up while required setup items remain incomplete. The pop-up is fixed
over the page instead of appearing before the feed. Its actions route to:

- `/behaviors#create-behavior`
- `/settings#notifications`
- `/settings#timezone`
- `/export#behaviorlog-import`

Import is optional and does not block setup completion.
If browser notifications are denied or already blocked, that permission state
counts as a completed onboarding decision because the app cannot unblock it from
inside Cadence. The user can still use the tracker and may re-enable browser
reminders later from browser site settings plus Settings.

## App shell

The app uses a fixed retractable sidebar on desktop and a drawer on mobile.

Desktop behavior:
- Expanded rail is 16rem wide.
- Collapsed rail is 4rem wide.
- Main content shifts with matching left padding at large breakpoints.
- The logo button toggles the rail. In collapsed mode, hovering the logo shows
  the expand icon in the same 64px square.
- The desktop sidebar header does not draw a bottom divider.
- Navigation and account rows keep a fixed 64px icon/avatar column so expanded
  and collapsed icon positions match.
- Labels fade and collapse visually but remain in the DOM.
- The account row continues to open Settings. A quiet Sign out POST control
  sits directly below it; expanded desktop shows its icon and label, while the
  collapsed rail shows an icon-only cell with the accessible name and tooltip
  Sign out.

Mobile behavior:
- The collapsed rail is not used under 1024px.
- A sticky 64px top header opens a 60vw left drawer.
- The mobile drawer header does not draw a bottom divider.
- The drawer closes from backdrop click, Escape, the close button, a navigation
  click, or a left swipe.
- Edge swipe from the first 20px of the viewport opens the drawer.
- Focus stays inside the open drawer and body scrolling is locked.
- Sign out appears below the account row and closes the drawer when submitted.

Primary navigation:
1. Timeline
2. Behaviors
3. Export & Import
4. Settings

The default authenticated route is:
`/timeline`

The root route should eventually redirect authenticated users to `/timeline`.

Do not use `/dashboard` for the primary app screen.

Signing out submits POST `/auth/sign-out`, ends the current Supabase session,
and redirects to `/login?signedout=1`. Login announces the focused polite status
**Signed out.** Only the exact `signedout=1` query value enables that notice;
GET does not sign out.

Categories should not appear in navigation or timeline filtering.

## Timeline flow

The Timeline is the primary screen.

The current day should be visually prominent and should begin the forward timeline.

The Timeline feed starts directly with the current-day section. Do not show a
visible Timeline page title or explanatory helper copy above the feed. The
dismissible first-run setup prompt is a fixed pop-up for accounts that have not
completed required launch setup items, so it does not become feed content.

Timeline order:
1. Floating Needs decision button
2. Current day
3. Next 7 days
4. Additional future days when the user chooses to show more

Needs decision contains prior-day unresolved occurrences. It is not a general
past timeline. As a correction affordance, occurrences decided from Needs
decision, or otherwise resolved today while still belonging to a prior local
day, may remain visible in their original prior-day group through the current
local day. This retention is derived from status timing and does not store a
separate modal-origin flag.

The Needs decision button is fixed to the lower right of the Timeline screen, shows the current number of prior unresolved occurrences, and opens a modal with the grouped prior-day occurrences. On mobile, it spans the lower safe-area width as one bottom action.
The count and label sit on one continuous button surface without an internal divider.
The count includes unresolved prior-day occurrences only. It does not include
same-day retained rows that were already marked Completed or Not Completed from
the modal or another correction surface.
The open modal should not show a visible global Needs decision title or total
count. Its date groups are the visible structure and should start at the top of
the scroll area, with the close control pinned over the top-right corner. Each
group stretches to the same modal gutter on the left and right, shows the date,
then shows a count of unresolved items left to decide for that date. The date
header text may leave room for the overlaid close control.
When the unresolved count is zero but retained rows remain, the launcher should
clarify that the modal reviews decisions from today, and the date group should
state `None left to decide` without describing the past date as today.

Users should not browse previous days as ordinary timeline sections in v1.

Each day section should list active behavior occurrences by scheduled time.

When one behavior has multiple occurrences on the same local day, group those
occurrences together as a stack. The group is ordered by its earliest
occurrence, and each scheduled time or time range remains its own occurrence row
inside the group.

Do not show a "1 of 2 completed" label, progress fill, or stored partial status
for grouped behavior rows. Partial completion is only derived from the mixed
states of the individual occurrence rows. Completed, unresolved, and Not
Completed rows keep the existing single-occurrence visual treatments. Not
Completed rows continue to show both status actions without separate
current-choice styling, and each status action applies only to the occurrence
row where it appears.

If a day has no occurrences, show:

```text
No behaviors on this day
```

## Occurrence card flow

Collapsed unresolved cards show:
- Scheduled time
- Behavior title
- Completed text-link action
- Not Completed text-link action

Preset time ranges show their short label in collapsed rows, such as Morning or
Evening, rather than the full clock range.

Status text-link actions are underlined by default. All status action underlines use the same thin weight.

Collapsed occurrence rows are compact and unboxed. They should not draw a perimeter border around each behavior row. Rows keep a compact horizontal inset on both desktop and mobile.
On mobile, scheduled time, behavior title, and unresolved status actions share one horizontal row when the status actions are visible. Completed and Not Completed keep at least a 44px tap target and same-line labels; the scheduled time and behavior title may compact and truncate before those action targets shrink. Do not add a chevron or separate disclosure icon.

Collapsed Completed cards show:
- Scheduled time
- Behavior title
- Resolved status

Collapsed Not Completed cards show:
- Scheduled time
- Behavior title
- Resolved status

Completed cards should have a distinct visual state and should hide the primary status actions.

Not Completed cards use the red accent treatment, show Not Completed as the
collapsed status, and hide primary status actions like Completed cards. The
stored status remains `not_completed` on that occurrence instance, and the UI
must not call it missed or failed.

Clicking a card outside the status actions expands it.

Expanded cards keep their detail content inside the native disclosure element
and show:
- Description
- Category
- Schedule details
- Note field
- Option to change a Completed or Not Completed status

Expanded details sit on the normal page background without a top divider. The
detail block has a small left inset. Spacing should be measured optically
between rendered text and field edges: the largest gap is between the collapsed
row content and the first detail label and should measure 20px optically. The
next-largest gap is between detail pairs, and the smallest gap is shared by
detail label/value, Note
label/textarea, and textarea/Save note relationships. The note save action is
an underlined text action, matching the Completed and Not Completed controls.
An expanded occurrence holds the same blue background used on row hover, rather
than adding a separate details box.

Every explicit status mark, correction, Unmark, or Clear decision updates the current
occurrence snapshot and appends one status-history event atomically. Repeating
the already-current resolved choice does not create a duplicate event. Saving a
Note without a status change preserves both status timestamps and status
history.

BehaviorLog imports may fill this occurrence Note field only when an accepted
import plan identifies the target occurrence safely, the imported note is not
AI-generated, and the local note is empty. Imported behavior notes,
status-event notes, review notes, and conflicting occurrence notes are stored as
passive imported-note records instead of product notes on Timeline or
Behaviors. Imported notes are user-review context only; they do not change
status, adherence, analytics, or reminder behavior.

Categories are visible only in expanded card details.

If an occurrence is unresolved after the end of its local day, it appears in the Needs decision modal and is visually highlighted. This is a derived UI state based on date and `unresolved`; it must not write a different stored status.

When a prior-day occurrence is marked Completed or Not Completed today, the row
should remain available in the modal until the next local midnight in the user's
timezone. It should stay in its original local-day group rather than moving into
a separate recent-decisions section. Completed rows keep the same blue resolved
treatment as Timeline rows. Not Completed rows use the same resolved-row
structure with the red accent treatment and Not Completed label. Expanding
either resolved row exposes status correction and Note editing. After the next
local midnight, these retained resolved rows no longer appear in Needs decision.

## Behavior flow

The Behaviors screen is the primary behavior object surface. It shows active
behaviors first as compact unboxed records separated by quiet divider lines,
with behavior setup metadata and range-based behavior review in the same row.
Behavior description text appears in the record as a labeled Description block
without local divider lines. Occurrence-specific text remains a Note.

Behavior create/edit is accessible from the Behaviors page. When behaviors
already exist, creation is opened from a simple in-page disclosure so the
existing behavior ledger stays primary. When no behaviors exist, the creation
disclosure may open by default.

Behavior form fields:
- Title
- Description
- Category
- Schedules
  - Recurrence pattern per schedule
  - One or more exact times or time ranges per schedule
- Browser notifications enabled
- Email reminder enabled
- Reminder offset
- Active/archive

At least one schedule and one time entry are required. Add time keeps the user
inside the same recurrence pattern. Add schedule creates a new recurrence
pattern. Behavior-level reminder settings apply to all generated occurrences in
v1.

Cancel discards the complete unsaved behavior draft and restores the values
present when the create or edit form opened. This includes recurrence details,
schedule and time rows, exact times or ranges, reminder choices, and active
state.

The recurrence editor should use segmented presets first, with advanced options below.

Archived behaviors appear in a separate low-priority bottom disclosure and do
not appear on the timeline. Archived behaviors can be restored from that
section.

Archive and Restore save the behavior active-state change and a durable
occurrence/reminder stale marker in one transaction. If either write fails,
both roll back. Once the transaction commits, immediate reconciliation is
best-effort and a failure remains available for background retry through the
saved marker.

Active behavior rows keep Archive behavior at the end of Details and Settings
so the collapsed row remains focused on review metrics and the behavior
calendar.

Categories are edited in Settings.

The Behaviors screen distinguishes two edit modes:

- Behavior settings edits change the recurring behavior definition, schedule,
  category, description, and reminder settings.
- Behavior date review revisits or corrects a specific dated occurrence record.
  It shows Date of behavior, Time of behavior, Status, and Note as plain rows.
  Date and time are display-only in this review path.

## Reminder flow

Browser notifications are enabled by default for every behavior.

Browser notification permission is requested from Settings through a control that triggers the browser permission prompt.

Email reminders are disabled by default and can be enabled per behavior.

Behavior-specific reminder settings live on the behavior create/edit page.

V1 does not need a test notification button.

## Behavior review flow

Behavior review on the Behaviors screen defaults to the last 30 days.

Show overall adherence at the top.

The overall calendar is part of the Overall adherence area rather than a
separate boxed section. The date range selector sits directly above the
overall calendar, the selected date range appears under the adherence
percentage in compact month-day wording, and the legend is vertically listed
to the right of the calendar on desktop.

The top summary Unresolved count should match the Timeline Needs decision
count, so it includes only active unresolved occurrences before the current
local day, regardless of the selected Behaviors range.

Show a completion-intensity calendar heatmap for overall adherence. A fully
completed day uses the full completed color; partial completion uses a lighter
blue proportional to the completed share; days with resolved occurrences but
no completed occurrences use the red accent treatment.

Show behavior-level Completed and Not Completed counts plus calendars inside
each active behavior row. Unresolved remains visible through neutral heatmap
and behavior date review states, but not as a behavior or category count row.

Each behavior count row shows when that behavior started being tracked. When
the tracking start day is within the selected range, the behavior calendar marks
that day.

For behaviors that occur more than once in a day, represent full completion, partial completion, and not completed day states.

The user should be able to select a non-empty cell in a behavior calendar and
review that behavior's occurrences on that day inside the selected behavior
row. The overall calendar remains a passive adherence summary. Behavior date
review is the deliberate later correction path for submitted occurrence
decisions after the Needs decision same-day retention window has passed.
Actionable behavior calendar cells should make that path clear through labels
or titles such as "open day review" while empty cells remain passive.

Behavior date review should:
- Use an explicit heading such as Review selected day.
- Show that behavior's occurrences for the selected local date when rows exist,
  not only Not Completed occurrences.
- Show occurrence details as plain Date of behavior, Time of behavior, Status,
  and Note text.
- Keep status corrections behind the per-occurrence Review disclosure. A
  resolved occurrence can use Clear decision there to return to Unresolved;
  an expanded, just-decided Timeline occurrence uses Unmark for the same
  correction. Needs decision does not expose either as a global action.
- Display empty notes as italic No note.
- Hide correction controls behind a per-occurrence Review disclosure until the
  user chooses to review that occurrence.
- Allow individual Completed and Not Completed corrections through the same
  status service used by Timeline.
- Allow occurrence Note edits.
- Refresh Behaviors counts, adherence, heatmaps, and behavior date rows after a
  correction.
- Avoid internal divider lines that visually compete with the behavior-row
  separators.
- Avoid an empty review panel when the selected behavior day has no occurrences.
- Avoid bulk edit, all-time search, automatic suggestions, AI coaching, or
  gamified language.

Category-level counts can appear as a compact secondary section.

## Export & Import flow

The `/export` screen is labeled Export & Import. It supports:
- JSONL
- CSV
- Full JSON backup
- BehaviorLog bundle
- Markdown AI summary
- BehaviorLog bundle import

Exports should support download and copy where practical.

The AI summary should be downloadable as `.md`.

Export options:
- Last 7 days
- Last 30 days
- Last 90 days
- All time
- Include archived behaviors
- Include occurrence notes, off by default

Full JSON and BehaviorLog include behavior title and description revision
history by default for the behaviors in the export. This is not a separate
option in Ticket 057. Before download, the screen explains that the history
contains full prior and next text and may contain sensitive context. The
Markdown summary reports the number of revision events and gives agent guidance
without repeating the historical text. JSONL and CSV remain current snapshots.

Behavior definition events follow behavior inclusion rather than the selected
occurrence date range. A 7, 30, or 90 day export therefore includes the complete
definition trail for each included behavior, ordered by `recorded_at`, then
`id`. Excluding archived behaviors also excludes their definition events.

BehaviorLog import flow:
1. Upload a `.behaviorlog.zip` bundle from the Export & Import screen. Cadence
   authenticates the account before archive extraction and rejects bundles
   that exceed its parser-side entry-count, extracted-size, compression-ratio,
   or 2 MB compressed-size limit. The UI checks `file.size` before submission,
   and the server repeats the same check with the factual error **This file is
   larger than the 2 MB limit for BehaviorLog bundles.**
2. Review validation errors, warnings, conflicts, privacy notes, note
   sensitivity warnings, intervention preview counts, passive imported
   intervention storage counts, dropped/redacted intervention field summaries,
   unsupported field counts, imported-note record counts, inline
   occurrence-note fill counts, and merge actions.
3. Apply create-only import only when the dry-run is valid and has no unsafe
   merge decisions.
4. Apply a merge plan only when all actions are supported safe actions and the
   user explicitly confirms the write from the exact accepted persisted
   `merge_preview` run.
5. Confirm high or restricted note sensitivity separately when those notes would
   be imported.
6. On apply, the base64 archive travels once in the form. The server recomputes
   its SHA-256 and compares it with the raw-archive fingerprint retained from
   the accepted preview, then re-parses and verifies the preview-run identity
   plus matching bundle, local-data, and combined preview fingerprints. It
   rejects stale, altered, mismatched, or unaccepted preview data and requires a
   fresh preview instead of recomputing a replacement plan silently.
7. Review recent import runs for status, mode, timestamps, failure message, and
   the accepted preview relationship when present.

The import area states that definition revision events are export-only in this
release. Import and restore validate the optional Cadence file through the
manifest but use only the current title and description snapshots from
`data/behaviors.jsonl`; they do not apply the revision trail. The user should
retain the source export when that history must remain portable.

The import flow must not add full restore, destructive overwrite, generalized
notes browsing, or intervention-to-reminder writes during preview/apply.

BehaviorLog restore preview flow:
1. Parse a trusted `.behaviorlog.zip` backup through the restore preview
   service.
2. Review which records would be created, replaced, archived, deleted, kept, or
   skipped across behaviors, schedule slots, occurrences, status events, inline
   occurrence notes, passive imported notes, and passive imported interventions.
3. Review non-restorable fields: auth identity, profile email, browser
   permissions, push subscriptions, provider accounts, provider secrets, and
   external provider state.
4. Review sensitivity and redaction warnings before any future destructive
   apply flow.

Restore preview is read-only. A later restore apply flow must require the
accepted preview fingerprint, fresh-backup acknowledgement, typed confirmation,
sensitivity acknowledgement when relevant, and stale-preview refusal before any
destructive write.

BehaviorLog restore apply flow:
1. Start from a valid restore preview on the Export & Import screen.
2. Confirm that a fresh backup was created or downloaded.
3. Type `RESTORE`.
4. Acknowledge high or restricted note sensitivity when the preview contains
   those notes.
5. Submit apply. The server re-parses the bundle, re-gathers the current local
   graph, verifies that its raw SHA-256 matches the accepted preview, and
   refuses the apply if the archive, preview, or local-data fingerprint is
   stale.
6. Review the applied or failed restore run in Restore history.

Restore apply can archive, replace, or delete behavior data according to the
accepted preview. It does not restore account identity, profile email, browser
permissions, push subscriptions, provider accounts, provider secrets, or
external provider state, and it does not call reminder providers.

Imported intervention promotion is separate from the Export import apply flow.
When exposed, it must require explicit selection of stored
`imported_interventions` rows and a separate confirmation before any operational
`reminder_deliveries` rows are created or linked. It should not be added to the
Export & Import screen unless a scoped UI ticket calls for it.

## Settings flow

Settings includes:
- Profile/email from Google sign-in when available
- Timezone
- Current-device browser notification status
- Current-device browser notification enable control
- Global email notification setting if needed
- Lightweight category editing
- Trust, Privacy, and Terms links
- Account deletion

Timezone detection uses the browser/OS timezone reported by `Intl.DateTimeFormat().resolvedOptions().timeZone`; it does not request location permission.

The user can apply the detected timezone or manually enter an IANA timezone. Saving updates the profile timezone, updates active behavior schedules to that timezone, and resyncs future unresolved occurrences. Past and resolved occurrence history stays unchanged.
The Settings UI should state this impact before submit so the user understands
that future unresolved rows change while past and resolved history does not.

When the user clicks Enable notifications on this device, Settings requests
browser notification permission if the browser still allows prompting, then
saves the current browser's push subscription after permission is allowed. If
the browser reports notifications are blocked, Settings shows the blocked state
and persistently asks the user to allow the origin in browser or site settings
before returning. A Refresh this device action remains available after reload
so the user can re-check delivery readiness. If the initial subscription check
fails, Settings settles into a factual not-enabled state with a retry action;
first-run setup likewise remains available instead of hanging or disappearing.

Account deletion requires the signed-in user to acknowledge the export reminder
and type the account email, or `DELETE` if no email is available. The server
signs out the account globally and deletes the Supabase auth user through a
server-only service-role client, relying on the database ownership cascades to
remove hosted Cadence records. On success, Login focuses and announces the
`Account deleted.` confirmation reached by the deletion redirect.
The client should mirror those gates by disabling the destructive submit until
the acknowledgement and exact typed confirmation are present; the server still
enforces the same requirements.

Do not include destructive data actions in v1 except explicit account deletion
and dedicated BehaviorLog restore work. Restore preview is read-only; restore
apply requires its own explicit review, confirmation, and stale-preview gates.
