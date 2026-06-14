# User Flows

This document describes the main v1 screens, modules, and user flows.

Cadence is a public product with multiple planned surfaces, but the current
implemented flow remains the authenticated web app. Marketing flows belong to a
future Astro site and should not add promotional copy inside the logged-in app.

## Public site flow

Planned public marketing routes:

- `/`: combined landing page explaining Cadence and BehaviorLog
- `/cadence`: product page for the tracker
- `/standard`: BehaviorLog Bundle overview and adoption case
- `/docs`: docs entry point that mostly links to GitHub files at launch
- `/examples`: optional sample bundle page or homepage section
- `/about`: optional philosophy, governance, privacy, or project page/section

Primary actions:

- Try Cadence
- Read the Standard
- Download Example Bundle
- View on GitHub

The site should be simple, static-first, and SEO-conscious. It should not tease
desktop/mobile apps before those surfaces are real or intentionally announced.

## First-run onboarding flow

Public web launch may add a minimal onboarding path after Google login.

Steps:

1. Create first behavior.
2. Request browser notification permission.
3. Import data when import exists.
4. Detect timezone automatically when possible and allow manual override.

Onboarding should stay thin. It should reuse existing app controls and should
not become a broad setup wizard.

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
visible Timeline page title or explanatory helper copy above the feed.

Timeline order:
1. Floating Needs decision button
2. Current day
3. Next 7 days
4. Additional future days when the user chooses to show more

Needs decision contains only prior-day unresolved occurrences. It is not a general past timeline.

The Needs decision button is fixed to the lower right of the Timeline screen, shows the current number of prior unresolved occurrences, and opens a modal with the grouped prior-day occurrences. On mobile, it spans the lower safe-area width as one bottom action.
The count and label sit on one continuous button surface without an internal divider.

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
- Completed text-link action
- Not Completed text-link action

Completed cards should have a distinct visual state and should hide the primary status actions.

Not Completed cards should visually return to the original unresolved card treatment while exposing both status actions so the logged action can be approved or changed without expanding the card. The stored status remains `not_completed` on that occurrence instance.

Clicking a card outside the status actions expands it.

Expanded cards show:
- Description
- Category
- Schedule details
- Note field
- Option to change a Completed status

Expanded details sit on the normal page background. The note save action is an
underlined text action, matching the Completed and Not Completed controls.
An expanded occurrence holds the same blue background used on row hover, rather
than adding a separate details box.

BehaviorLog imports may fill this occurrence Note field only when an accepted
merge plan identifies the target occurrence safely and the local note is empty.
Imported behavior notes, status-event notes, review notes, and AI-generated
notes are not displayed as product notes in v1. Imported notes are user-review
context only; they do not change status, adherence, analytics, or reminder
behavior.

Categories are visible only in expanded card details.

If an occurrence is unresolved after the end of its local day, it appears in the Needs decision modal and is visually highlighted. This is a derived UI state based on date and `unresolved`; it must not write a different stored status.

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

Show a binary calendar heatmap for overall adherence.

Show behavior-level counts and charts.

For behaviors that occur more than once in a day, represent full completion, partial completion, and not completed day states.

The user should be able to inspect occurrences that were not completed on a selected day.

Category-level counts can appear as a compact secondary section.

## Export flow

The Export screen supports:
- JSONL
- CSV
- Full JSON backup
- BehaviorLog bundle
- Markdown AI summary

Exports should support download and copy where practical.

The AI summary should be downloadable as `.md`.

Export options:
- Last 7 days
- Last 30 days
- Last 90 days
- All time
- Include archived behaviors

## Settings flow

Settings includes:
- Profile/email from Google sign-in when available
- Timezone
- Notification permission status
- Browser notification permission control
- Global browser notification setting
- Global email notification setting if needed
- Lightweight category editing

Timezone should be detected automatically when browser/location permission allows it.

If automatic detection is unavailable, the user can manually select their timezone.

Do not include destructive data actions in v1.
