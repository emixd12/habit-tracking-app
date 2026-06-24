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

- `/`: landing page led by BehaviorLog as the standard and Cadence as the
  demonstration product
- `/cadence`: product page for the tracker
- `/standard`: BehaviorLog Bundle overview and adoption case
- `/docs`: agent-first technical docs entry point
- `/examples`: sanitized sample bundle page
- `/about`: philosophy, governance, scope boundaries, and open-source posture

Primary actions:

- Try Cadence
- Read the Standard
- Download Example Bundle
- View on GitHub

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

Mobile behavior:
- The collapsed rail is not used under 1024px.
- A sticky 64px top header opens a 60vw left drawer.
- The mobile drawer header does not draw a bottom divider.
- The drawer closes from backdrop click, Escape, the close button, a navigation
  click, or a left swipe.
- Edge swipe from the first 20px of the viewport opens the drawer.
- Focus stays inside the open drawer and body scrolling is locked.

Primary navigation:
1. Timeline
2. Behaviors
3. Analytics
4. Export
5. Settings

The default authenticated route is:
`/timeline`

The root route should eventually redirect authenticated users to `/timeline`.

Do not use `/dashboard` for the primary app screen.

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
decision may remain visible in their original prior-day group through the
current local day.

The Needs decision button is fixed to the lower right of the Timeline screen, shows the current number of prior unresolved occurrences, and opens a modal with the grouped prior-day occurrences. On mobile, it spans the lower safe-area width as one bottom action.
The count and label sit on one continuous button surface without an internal divider.
The count includes unresolved prior-day occurrences only. It does not include
same-day retained rows that were already marked Completed or Not Completed from
the modal.
The open modal should not show a visible global Needs decision title or total
count. Its date groups are the visible structure and should start at the top of
the scroll area, with the close control pinned over the top-right corner. Each
group stretches to the same modal gutter on the left and right, shows the date,
then shows a count of unresolved items left to decide for that date. The date
header text may leave room for the overlaid close control.

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

Collapsed occurrence rows are compact and unboxed. They should not draw a perimeter border around each behavior row.
On mobile, scheduled time and behavior title appear first, then status actions sit on a full-width touch row before any expanded details. Do not add a chevron or separate disclosure icon.

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

Expanded cards show:
- Description
- Category
- Schedule details
- Note field
- Option to change a Completed or Not Completed status

Expanded details sit on the normal page background. The note save action is an
underlined text action, matching the Completed and Not Completed controls.
An expanded occurrence holds the same blue background used on row hover, rather
than adding a separate details box.

BehaviorLog imports may fill this occurrence Note field only when an accepted
import plan identifies the target occurrence safely, the imported note is not
AI-generated, and the local note is empty. Imported behavior notes,
status-event notes, review notes, and conflicting occurrence notes are stored as
passive imported-note records instead of product notes on Timeline or
Behaviors. Imported notes are user-review context only; they do not change
status, adherence, analytics, or reminder behavior.

Categories are visible only in expanded card details.

If an occurrence is unresolved after the end of its local day, it appears in the Needs decision modal and is visually highlighted. This is a derived UI state based on date and `unresolved`; it must not write a different stored status.

When a user marks a Needs decision row Completed or Not Completed, the row
should remain available in the modal until the next local midnight in the
user's timezone. It should stay in its original local-day group rather than
moving into a separate recent-decisions section. Completed rows keep the same
blue resolved treatment as Timeline rows. Not Completed rows use the same
resolved-row structure with the red accent treatment and Not Completed label.
Expanding either resolved row exposes status correction and Note editing. After
the next local midnight, these retained resolved rows no longer appear in Needs
decision.

## Behavior flow

The Behaviors screen shows active behaviors first as compact unboxed records
separated by quiet divider lines.
Behavior description text appears in the record as a labeled Notes block
without local divider lines.

Behavior create/edit is accessible from the Behaviors page. When behaviors
already exist, creation is opened from a simple in-page disclosure so the
existing behavior ledger stays primary. When no behaviors exist, the creation
disclosure may open by default.

Behavior form fields:
- Title
- Description
- Category
- Recurrence
- Schedule with one or more exact times or preset time ranges
- Browser reminder enabled
- Email reminder enabled
- Reminder offset
- Active/archive

At least one schedule slot is required.

The recurrence editor should use segmented presets first, with advanced options below.

Archived behaviors appear in a separate archived section and do not appear on
the timeline. Archived behaviors can be restored from that section.

Categories are edited in Settings.

## Reminder flow

Browser reminders are enabled by default for every behavior.

Browser notification permission is requested from Settings through a control that triggers the browser permission prompt.

Email reminders are disabled by default and can be enabled per behavior.

Behavior-specific reminder settings live on the behavior create/edit page.

V1 does not need a test notification button.

## Analytics flow

The Analytics screen defaults to the last 30 days.

Show overall adherence at the top.

The overall calendar is part of the Overall adherence area rather than a
separate boxed section. Its legend is hidden by default behind a See Legend
disclosure.

The top summary Unresolved count should match the Timeline Needs decision
count, so it includes only active unresolved occurrences before the current
local day, regardless of the selected Analytics range.

Show a completion-intensity calendar heatmap for overall adherence. A fully
completed day uses the full completed color; partial completion uses a lighter
blue proportional to the completed share; days with resolved occurrences but
no completed occurrences use the red accent treatment.

Show behavior-level counts and charts.

Each behavior count row shows when that behavior started being tracked. When
the tracking start day is within the selected range, the behavior calendar marks
that day.

For behaviors that occur more than once in a day, represent full completion, partial completion, and not completed day states.

The user should be able to select a non-empty cell in a behavior calendar and
review that behavior's occurrences on that day. The overall calendar remains a
passive adherence summary. Behavior-day review is the deliberate later
correction path for submitted occurrence decisions after the Needs decision
same-day retention window has passed.

Behavior-day review should:
- Show that behavior's occurrences for the selected local date when rows exist,
  not only Not Completed occurrences.
- Use a Behavior date heading for the selected day.
- Show occurrence details as plain Time of behavior, Status, and Note text.
- Display empty notes as italic No note.
- Hide correction controls behind a per-occurrence Review disclosure until the
  user chooses to review that occurrence.
- Allow individual Completed and Not Completed corrections through the same
  status service used by Timeline.
- Allow occurrence Note edits.
- Refresh Analytics counts, adherence, heatmaps, and behavior-day rows after a
  correction.
- Avoid internal divider lines that visually compete with the behavior-row
  separators.
- Avoid an empty review panel when the selected behavior day has no occurrences.
- Avoid bulk edit, all-time search, automatic suggestions, AI coaching, or
  gamified language.

Category-level counts can appear as a compact secondary section.

## Export flow

The Export screen supports:
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

BehaviorLog import flow:
1. Upload a `.behaviorlog.zip` bundle from the Export screen.
2. Review validation errors, warnings, conflicts, privacy notes, note
   sensitivity warnings, intervention preview counts, passive imported
   intervention storage counts, dropped/redacted intervention field summaries,
   imported-note record counts, inline occurrence-note fill counts, and merge
   actions.
3. Apply create-only import only when the dry-run is valid and has no unsafe
   merge decisions.
4. Apply a merge plan only when all actions are supported safe actions and the
   user explicitly confirms the write.
5. Confirm high or restricted note sensitivity separately when those notes would
   be imported.
6. Review recent import runs for status, mode, timestamps, and failure message
   when present.

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
1. Start from a valid restore preview on the Export screen.
2. Confirm that a fresh backup was created or downloaded.
3. Type `RESTORE`.
4. Acknowledge high or restricted note sensitivity when the preview contains
   those notes.
5. Submit apply. The server re-parses the bundle, re-gathers the current local
   graph, and refuses the apply if the preview or local-data fingerprint is
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
Export screen unless a scoped UI ticket calls for it.

## Settings flow

Settings includes:
- Profile/email from Google sign-in when available
- Timezone
- Notification permission status
- Browser notification permission control
- Global browser notification setting
- Global email notification setting if needed
- Lightweight category editing
- Trust, Privacy, and Terms links
- Account deletion

Timezone detection uses the browser/OS timezone reported by `Intl.DateTimeFormat().resolvedOptions().timeZone`; it does not request location permission.

The user can apply the detected timezone or manually enter an IANA timezone. Saving updates the profile timezone, updates active behavior schedules to that timezone, and resyncs future unresolved occurrences. Past and resolved occurrence history stays unchanged.

When the user clicks Save subscription for browser reminders, Settings requests
browser notification permission if the browser still allows prompting, then
saves the push subscription after permission is allowed. If the browser reports
notifications are blocked, Settings shows the blocked state and asks the user to
allow the origin in browser site settings before saving again.

Account deletion requires the signed-in user to acknowledge the export reminder
and type the account email, or `DELETE` if no email is available. The server
signs out the account globally and deletes the Supabase auth user through a
server-only service-role client, relying on the database ownership cascades to
remove hosted Cadence records.

Do not include destructive data actions in v1 except explicit account deletion
and dedicated BehaviorLog restore work. Restore preview is read-only; restore
apply requires its own explicit review, confirmation, and stale-preview gates.
