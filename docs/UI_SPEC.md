# UI Spec

## Design direction

Sparse, clean, checklist-like.

The app should feel like a personal cockpit, not a productivity platform.

Cadence is now a public product, but the authenticated app should not become
marketing-heavy. Public explanation, SEO content, standard adoption, and GitHub
links belong on the sibling Astro marketing site. The app remains direct and
work-focused after login.

Avoid:
- Dense dashboards
- Gamified streaks
- Social language
- Motivational copy
- Excessive modals
- Productivity-app sprawl

## Primary navigation

Use a fixed retractable sidebar on desktop and a drawer on mobile.

On desktop, the sidebar remains fixed while page content scrolls. Expanded
width is 16rem. Collapsed width is 4rem. Width changes animate over 200ms, and
the main content uses matching large-breakpoint left padding so content never
sits underneath the fixed rail.

The desktop sidebar uses a stable 64px icon column in both states. Header,
navigation, and footer account rows keep icons or avatar centered in that
column. Labels remain in the DOM and collapse visually with `opacity-0`,
`pointer-events-none`, `w-0`, and `overflow-hidden`; expanded labels use
`opacity-100` and `whitespace-nowrap`.
The desktop sidebar header does not draw a bottom divider.

Expanded navigation applies hover and active treatment to the whole row.
Collapsed navigation applies hover and active treatment only to the 64px icon
cell so the rail feels like square targets. The active route uses the Timeline
row hover fill with foreground text. Inactive hover uses the Surface fill.
Primary navigation rows should be flush with no gap between row containers.

On mobile, do not use the collapsed rail. Use a sticky 64px top header that
opens a left drawer. The drawer is 60vw wide, max 60vw, and closes from its
backdrop, Escape, the close button, navigation, or a left swipe. Opening from
the first 20px viewport edge is supported. While open, the drawer traps focus
and locks body scrolling. A narrow drawer shadow is allowed for separation from
the backdrop. The mobile drawer header does not draw a bottom divider.

Use five primary screens:

1. Timeline
2. Behaviors
3. Analytics
4. Export
5. Settings

The Timeline screen is the default screen after login.

Route:
`/timeline`

Categories should not appear in navigation or timeline filtering.

## Public marketing site

The marketing site uses Cadence's existing product voice and design tokens, but
it is a separate Astro shell under `apps/marketing` rather than part of the
authenticated app shell.

Launch marketing routes:

- `/`
- `/cadence`
- `/standard`
- `/docs`
- `/examples`
- `/about`

Primary calls to action:

- Try Cadence
- Read BehaviorLog
- Download Example Bundle
- View on GitHub
- Log in

The marketing site should be SEO-conscious with semantic content structure,
metadata, canonical URLs, social preview metadata, sitemap/robots support, and
fast static pages. It also exposes `llms.txt`, `llms-full.txt`, Markdown
mirrors, and a public route manifest for agents. Do not add heavy client-side
marketing interactions unless a specific page needs them.

Cadence should lead the homepage as the product and site brand. BehaviorLog is
the open bundle standard and portability layer behind Cadence exports and
imports. Keep the existing Cadence mark, use the square ledger visual system,
and show only the Cadence logo and name in the marketing header. The stable
route `/standard` may remain, but visible navigation should call the page
BehaviorLog. Marketing header links use the same underlined text-action
convention as content buttons, without a divider under the header. The
persistent Log in action uses the same primitive with stronger weight to
distinguish it from the route links.

No public design-system page is launch scope. `/design-system` remains
dev-only.

## Timeline screen

This is the main screen.

The current day should be prominent and should begin the forward timeline.

Do not show a visible Timeline page title or explanatory helper text above the
feed. A decorative transparent Cadence horse-line-and-dot image may sit directly
above the feed with no extra top or bottom margin and span the full app content
width; the first Timeline day section should still be the current-day section.
Optional first-run setup appears as a dismissible pop-up so it does not push the
feed down while required launch setup items remain incomplete.

### First-run setup

The first-run prompt is a fixed, non-modal pop-up shown on Timeline only while
required setup items remain incomplete and the user has not dismissed it in the
current browser. It should:

- Link to the existing create-behavior, notification, timezone, and import
  controls.
- Treat import as optional.
- Never request notification permission on page load.
- Use compact list rows, quiet dividers, and factual state labels such as Done,
  Not enabled, Blocked, Confirmed, Review, and Optional.
- Provide a Skip setup control.
- Avoid motivational copy, progress gamification, an inline takeover, or a
  wizard.

Users should not browse previous days as normal timeline sections. Prior
unresolved occurrences appear only in the Needs decision modal, with one narrow
exception: occurrences just decided from Needs decision may remain visible in
that modal through the current local day so the user can correct an accidental
tap.

Timeline access:

### Needs decision

Unresolved occurrences before today.

Needs decision is a derived UI state, not a stored occurrence status.

Needs decision should not interrupt the forward Timeline flow. It is opened from a floating button fixed to the lower right of the Timeline screen.

The floating button should:
- Show the number of prior unresolved occurrences.
- Use the reserved fixed-action treatment when there is at least one occurrence to decide.
- Remain factual and non-punitive. Do not use error styling or missed/failure language.
- Use one continuous surface without an internal divider between the number and text.
- On mobile, span the lower safe-area width as one bottom action so it stays easy to reach without covering the feed.
- Open a modal that reveals all prior unresolved occurrences grouped by local day.

The open modal should be led by the day feed, not by a global title or global
count. Keep the close control pinned over the modal's top-right corner without
reserving a header row; the first date group should start at the top of the
scroll area. The scroll area should keep equal left and right gutters to the
outer modal container; only the date header text row may reserve space for the
overlaid close control. Each date group should show the local date first, then a
line with how many unresolved occurrences are left to decide for that date. Date
groups use the normal white background rather than a grey container.

After the user marks a prior unresolved occurrence from the Needs decision
modal, that row should remain in its original local-day group until the next
local midnight in the user's timezone. Do not move it into a separate "Decided
just now" or similar section. Completed rows keep the same full blue Completed
state used on Timeline rows; expanding the row exposes Change status and Note
editing. Not Completed rows keep the same resolved-row behavior as Completed
rows: full red accent treatment, a collapsed Not Completed label, and status
correction from the expanded row. The Needs decision count
continues to count unresolved prior-day occurrences only, not retained decided
rows. When there are no unresolved rows but retained decided rows still exist,
the button may still open the modal with a zero count. Retention must be
derived from existing occurrence status timing and the local day boundary; do
not add a stored status or flag for it.

Example:

```text
Needs decision
Yesterday
- Brush teeth
- Take medication

Monday
- Laundry
```

### Current day

Current-day occurrences, ordered by scheduled time.

When the same behavior has multiple occurrences on the same local day, group
those same-day occurrences together as a stack. Groups are ordered by their
earliest occurrence. Each scheduled time or time range renders as its own
occurrence row inside the group.

For multi-time behavior groups:
- Do not use percentage or progress fill on the grouped row.
- Keep the existing single-occurrence visual language for each row.
- Completed rows use the existing full blue completed treatment.
- Unresolved rows use the existing unresolved treatment and show Completed and
  Not Completed text-link status actions.
- Not Completed rows use the red accent treatment, show the collapsed Not
  Completed label, and hide primary status actions just like Completed rows.
- Do not show a "1 of 2 completed" label.
- Do not add a partial-completion stored status.
- Partial completion is only a derived visual result of mixed row states within
  the grouped behavior.
- Status actions always apply to the specific occurrence row where they appear.

Example:

```text
Saturday, June 6
9:00 AM  Take medication
11:00 AM Drink matcha
10:00 PM Brush teeth
```

If a day has no scheduled behaviors, show:

```text
No behaviors on this day
```

### Future days

Show the next 7 days by default.

Each future day is its own section.

Provide a control to show more future days.

Do not show previous days except for unresolved prior-day items inside the Needs decision modal.

## Occurrence card

Collapsed card should show:
- Scheduled time
- Behavior title
- Current status when Completed or Not Completed
- Completed and Not Completed text-link status actions when unresolved

Preset time-range occurrences should use the short preset label in collapsed
Timeline rows, such as Morning or Evening, without the full clock range.

Status text-link actions should be underlined by default with the same thin underline. On hover-capable devices or keyboard focus, the action text may gain non-reflowing emphasis without changing color or moving adjacent actions. Do not use underline thickness to indicate a saved status.

Occurrence rows should read as compact unboxed list rows. Do not draw a perimeter border around each Timeline behavior row.

In collapsed rows, the scheduled time, behavior title, and collapsed status/action text should be vertically centered within the row. Expanded rows may pin the status controls to the top-right so the details panel can span the row below.
On mobile, keep scheduled time and behavior title first, then place Completed and Not Completed on their own full-width touch row for unresolved rows before expanded details. Mobile status and note actions should have at least a 44px tap target while still looking like underlined text actions. Do not add a chevron or separate disclosure icon.

Expanded card details should show:
- Description if present
- Category
- Behavior schedule
- Note field
- Option to change a Completed or Not Completed status.

Categories should only be visible in the expanded card details.

Unresolved prior-day cards in the Needs decision modal should be visually highlighted so the user is clearly prompted to decide whether each occurrence was Completed or Not Completed. This highlight is derived from date and status; it must not write a different status.

Completed cards should remain visible with a distinct resolved state, hide the primary status actions, and clearly indicate Completed.

Not Completed cards should remain visible with the red accent treatment and a
collapsed Not Completed label. They should match Completed row structure except
for color and label; status correction remains available after expanding the
row. This is a factual recorded-state cue only; the stored status remains on
that occurrence instance as `not_completed`, and the UI must not call it missed
or failed.

Clicking a Completed or Not Completed card should reveal the option to change
the logged action. Do not require a confirmation step before changing a status.

Notes, category, description, and schedule details are hidden by default and revealed when the user clicks the card outside the status actions.
Expanded details should sit directly on the background surface without a grey
panel, enclosing border, or boxed card treatment. The Note textarea keeps its
field border, but Save note uses the same underlined text-action vocabulary as
Completed and Not Completed.
When an occurrence is open, the whole occurrence row should hold the same blue
background used by that row's hover state so the expanded content remains
visually attached to the behavior.

Status action behavior:
- Completed changes status to `completed`
- Not Completed changes status to `not_completed`
- A successful user-initiated change into Completed may play a short completion chime.
- Do not play a sound for Not Completed, note saves, page refreshes, or re-saving an already Completed occurrence.
- Note opens an inline edit field or compact modal in the expanded card state

Resolved occurrences can be changed later.

## Behavior form

The create/edit behavior view should be a full page accessible from the sidebar navigation.

On the Behaviors page, the create form should sit in the page flow without an
extra outer card border or outer padding. Inner field groups may still use
quiet dividers where they clarify structure.

Fields:
- Title
- Description
- Category
- Recurrence
- Schedule with one or more exact times or preset time ranges
- Browser reminder enabled, default on
- Email reminder toggle, default off
- Reminder offset
- Active/archive

At least one schedule slot is required.

Preset time ranges:
- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

Timezone is managed in Settings and should not be shown as a separate panel in
the behavior creation form.

Public launch includes a short first-run onboarding flow. It reuses the same
behavior form, notification permission control, import entry, and timezone
settings rather than creating a separate onboarding product.

## Recurrence editor

Support:
- Daily
- Every N days
- Weekly on selected weekdays
- Every N weeks on selected weekdays
- Monthly on day N

Use segmented presets first, with advanced options below.

The Recurrence editor should be an unframed form section, not a boxed panel.
Use smaller subsection heading text for options such as Every, On, and Day.

Do not expose raw cron syntax.

Do not use natural language parsing in v1.

## Reminder editor

Behavior-specific fields:
- Browser reminder enabled, default on
- Email reminder toggle, default off
- Reminder offset:
  - At scheduled start
  - 15 minutes before
  - 1 hour before
  - 1 day before
  - 3 days before
  - Custom minutes/hours/days if easy

Browser notification permission is managed globally from Settings. The Settings
save control should call the browser permission request from the user's click
when permission is still undecided, save a subscription after permission is
allowed, and show factual unblock copy when the browser reports permission is
blocked.

The Reminder editor should use the same unframed form-section treatment as the
Recurrence editor. Use a plain section heading and smaller subsection heading
text for options such as Reminder offset.

## Behaviors screen

Show active behaviors first as compact cards.

The behavior creation form should be available from the Behaviors page without
pushing existing behavior cards far below the first viewport. When behaviors
already exist, keep creation behind a simple in-page disclosure. When no
behaviors exist, the creation disclosure may open by default.

Each behavior card/list item should include:
- Title
- Category
- Recurrence summary
- Scheduled times or ranges
- Reminder indicators
- Edit
- Archive
- Restore for archived behaviors

Behavior records should not draw a perimeter border. Separate adjacent
behaviors with a single quiet divider line, and keep borders only on real
fields, controls, and status labels. Archive and Restore use underlined
text-action styling rather than bordered button chrome.
When a behavior has saved description text, show it as a small Notes block with
a visible label and no divider lines immediately above or below that block.

Archived behaviors should appear in a separate archived section and should not appear on the timeline.

Category editing belongs in Settings.

## Analytics screen

Default range:
- Last 30 days

Show:
- Overall adherence at the top
- Completion-intensity calendar heatmap for overall adherence
- Date range selector: 7 / 30 / 90 days
- Completion counts by behavior
- Per-behavior chart or calendar heatmap
- Tracking-since date for each behavior count row, plus a start marker in that
  behavior's calendar when the start day is inside the selected range
- Full completion, partial completion, and not completed day states for behaviors that can occur multiple times in one day
- Behavior-day occurrence review for correcting individual statuses and notes
- Unresolved count
- Optional compact counts by category
- Default adherence rate

The Analytics screen should read as one sparse report surface. Avoid boxed
section panels around Overall adherence, the calendar, Behavior counts, and
Category counts. Use single horizontal dividers where separation is needed.
The overall calendar belongs inside the Overall adherence area, and its legend
should stay hidden behind a simple See Legend disclosure by default.

The overall calendar is a passive adherence summary, not the correction entry
point. Later corrections start from a behavior row: selecting a non-empty
behavior calendar cell opens a compact Behavior date area inside that behavior
row. The behavior-day review should list only that behavior's occurrences for
the selected local date when rows exist, including Completed, Not Completed,
and Unresolved rows. It should use plain text labels for Time of behavior,
Status, and Note rather than chips, and empty notes should read as italic No
note. Correction controls stay hidden behind a per-occurrence Review disclosure
until the user chooses to review that occurrence. Inside the disclosure, Change
status and the Completed / Not Completed actions should sit on one row when
space allows, followed by the inline Note form. Do not use internal divider
lines that visually compete with the behavior-row separators. Do not add bulk
edit, all-time search, automatic suggestions, AI coaching, or gamified
language. Do not render an empty review panel when the selected behavior day
has no occurrences.

Default adherence excludes unresolved occurrences. The top summary Unresolved
count matches the Timeline Needs decision count: active unresolved occurrences
before the current local day, regardless of the selected Analytics range.
Current-day unresolved occurrences can still show as unresolved in heatmap
cells and behavior/category detail counts.

Overall calendar cells use completion intensity for completed share: 100%
Completed uses the full primary blue, and lower completion shares mix that blue
with the background in the same proportion. A 50% completed day should appear
as a half-strength blue cell. A day with resolved occurrences but no completed
occurrences uses the red accent treatment. Fully unresolved days use the
neutral unresolved treatment.

Behavior count rows should be divider-separated rather than boxed. Their
Completed, Not Completed, and Unresolved labels align vertically with the
numeric values in a right-hand column. Behavior calendar cells with occurrences
are selectable; empty cells remain passive. Behavior categories appear as
plain metadata text below the behavior name.

Overall and behavior calendar cells show a compact date label on hover or
keyboard focus while preserving the longer accessible label for screen readers
and native titles.

## Export screen

Show:
- Export JSONL
- Export CSV
- Export full JSON backup
- Export BehaviorLog bundle
- Copy AI summary
- Download AI summary as `.md`
- Import BehaviorLog bundle

Options:
- Last 7 days
- Last 30 days
- Last 90 days
- All time
- Include archived behaviors

Exports should support both download and copy where practical.

BehaviorLog import should live on the Export screen as a sparse ledger section.
The section accepts `.behaviorlog.zip` uploads, shows validation errors and
warnings before any product write, shows dry-run counts, privacy notes, note
sensitivity warnings, intervention preview counts, passive imported
intervention storage counts, dropped/redacted intervention field summaries,
imported-note record counts, inline occurrence-note fill counts, and merge
actions, and requires explicit confirmation before applying create-only or
supported user-approved merge plans.
If high or restricted sensitivity notes would be imported, apply controls must
also require a dedicated privacy acknowledgement. Do not add destructive
restore/overwrite controls, generalized notes browsing, or
intervention-to-reminder writes in this screen.

BehaviorLog restore preview may also appear on the Export screen when a restore
ticket is active. It should stay separate from create-only and merge import,
show create/replace/archive/delete/keep/skip counts, highlight destructive
replace/archive/delete actions, show non-restorable account/provider/browser
fields, show note sensitivity and intervention redaction warnings, and display
the preview fingerprint needed for stale-preview refusal. Preview itself must
not present as a completed restore and must not write product records.

Restore apply controls should appear only after a valid restore preview. They
must require a fresh-backup checkbox, typed `RESTORE` confirmation, and a
separate high/restricted note sensitivity acknowledgement when relevant. The UI
should show stale-preview or unsupported-action refusal as an alert and keep the
preview visible for review. Apply result or failure details should appear in the
Restore section history.

## Settings screen

Show:
- Profile/email from Google sign-in when available
- Timezone
- Notification permission status
- Control to request browser notification permission
- Global browser notification setting
- Global email notification setting if needed
- Lightweight category editing
- Export/backup links if not on Export page
- Trust, Privacy, and Terms links for public-product account context
- Account deletion with export acknowledgement and typed confirmation

Timezone detection should use the browser/OS timezone exposed by `Intl.DateTimeFormat().resolvedOptions().timeZone`; do not request geolocation or location permission. Settings should show the stored timezone, show the detected browser timezone when available, provide a Use detected timezone action, and allow manual IANA timezone entry. Saving a timezone updates the profile and active behavior schedules, then resyncs future unresolved occurrences while preserving past and resolved history.

Do not include a test notification button in v1.

Do not include destructive data actions in v1 except the explicit public-launch
account deletion path and dedicated BehaviorLog restore work. Restore preview is
read-only; restore apply must require explicit review, backup acknowledgement,
typed confirmation, and stale-preview refusal before destructive writes.

## Offline UI

Offline support is not part of v1.

Future offline behavior is tracked in `/docs/FUTURE_UPDATES.md`.
