# UI Spec

## Design direction

Sparse, clean, checklist-like.

The app should feel like a personal cockpit, not a productivity platform.

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

## Timeline screen

This is the main screen.

The current day should be prominent and should begin the forward timeline.

Do not show a visible Timeline page title or explanatory helper text above the
feed. The first visible content should be the current-day section.

Users should not browse previous days as normal timeline sections. Prior unresolved occurrences appear only in the Needs decision modal.

Timeline access:

### Needs decision

Unresolved occurrences before today.

Needs decision is a derived UI state, not a stored occurrence status.

Needs decision should not interrupt the forward Timeline flow. It is opened from a floating button fixed to the lower right of the Timeline screen.

The floating button should:
- Show the number of prior unresolved occurrences.
- Use the primary action treatment when there is at least one occurrence to decide.
- Remain factual and non-punitive. Do not use error styling or missed/failure language.
- Use one continuous surface without an internal divider between the number and text.
- Open a modal that reveals all prior unresolved occurrences grouped by local day.

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
- Not Completed rows return to the original unresolved card treatment and show
  Completed and Not Completed text-link status actions without a separate
  current-choice cue.
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
- Current status when Completed
- Completed and Not Completed text-link status actions when unresolved or Not Completed

Preset time-range occurrences should use the short preset label in collapsed
Timeline rows, such as Morning or Evening, without the full clock range.

Status text-link actions should be underlined by default with the same thin underline. On hover or keyboard focus, the action text may gain non-reflowing emphasis without changing color or moving adjacent actions. Do not use underline thickness to indicate a saved status.

Occurrence rows should read as compact unboxed list rows. Do not draw a perimeter border around each Timeline behavior row.

In collapsed rows, the scheduled time, behavior title, and collapsed status/action text should be vertically centered within the row. Expanded rows may pin the status controls to the top-right so the details panel can span the row below.

Expanded card details should show:
- Description if present
- Category
- Behavior schedule
- Note field
- Option to change a Completed status. Not Completed rows keep their status
  controls visible in the collapsed row.

Categories should only be visible in the expanded card details.

Unresolved prior-day cards in the Needs decision modal should be visually highlighted so the user is clearly prompted to decide whether each occurrence was Completed or Not Completed. This highlight is derived from date and status; it must not write a different status.

Completed cards should remain visible with a distinct resolved state, hide the primary status actions, and clearly indicate Completed.

Not Completed cards should remain visible with the original unresolved card treatment and expose the same Completed and Not Completed text-link status actions as the original decision card so the user can immediately approve or change the logged action. This is a visual reset only; the stored status remains on that occurrence instance as `not_done`.

Clicking a Completed card should reveal the option to change the logged action. Do not require a confirmation step before changing a status.

Notes, category, description, and schedule details are hidden by default and revealed when the user clicks the card outside the status actions.

Status action behavior:
- Completed changes status to `done`
- Not Completed changes status to `not_done`
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

Browser notification permission is managed globally from Settings.

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

Archived behaviors should appear in a separate archived section and should not appear on the timeline.

Category editing belongs in Settings.

## Analytics screen

Default range:
- Last 30 days

Show:
- Overall adherence at the top
- Binary calendar heatmap for overall adherence
- Date range selector: 7 / 30 / 90 days
- Completion counts by behavior
- Per-behavior chart or calendar heatmap
- Full completion, partial completion, and not completed day states for behaviors that can occur multiple times in one day
- Not completed occurrences for a selected day
- Unresolved count
- Optional compact counts by category
- Default adherence rate

Default adherence excludes unresolved occurrences.

## Export screen

Show:
- Export JSONL
- Export CSV
- Export full JSON backup
- Copy AI summary
- Download AI summary as `.md`

Options:
- Last 7 days
- Last 30 days
- Last 90 days
- All time
- Include archived behaviors

Exports should support both download and copy where practical.

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

Timezone should be detected automatically when the browser/location permission allows it. If the user has not allowed automatic detection, provide a manual timezone selector.

Do not include a test notification button in v1.

Do not include destructive data actions in v1.

## Offline UI

Offline support is not part of v1.

Future offline behavior is tracked in `/docs/FUTURE_UPDATES.md`.
