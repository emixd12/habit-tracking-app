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

Use a retractable sidebar on both desktop and mobile.

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

Users should not browse previous days as normal timeline sections. Prior unresolved occurrences appear only in the Needs decision group.

Timeline sections:

### 1. Needs decision

Unresolved occurrences before today.

Needs decision is a derived UI state, not a stored occurrence status.

Example:

```text
Needs decision
Yesterday
- Brush teeth
- Take medication

Monday
- Laundry
```

### 2. Current day

Current-day occurrences, ordered by scheduled time.

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

### 3. Future days

Show the next 7 days by default.

Each future day is its own section.

Provide a control to show more future days.

Do not show previous days except for unresolved prior-day items in Needs decision.

## Occurrence card

Collapsed card should show:
- Scheduled time
- Behavior title
- Current status when resolved
- Completed and Not Completed buttons when unresolved

Expanded card details should show:
- Description if present
- Category
- Behavior schedule
- Note field
- Option to change an already logged status

Categories should only be visible in the expanded card details.

Unresolved prior-day cards in Needs decision should be visually highlighted so the user is clearly prompted to decide whether each occurrence was Completed or Not Completed. This highlight is derived from date and status; it must not write a different status.

Resolved cards should remain visible with a distinct resolved state. Resolved cards should hide the primary action buttons and clearly indicate Completed or Not Completed.

Clicking a resolved card should reveal the option to change the logged action. Do not require a confirmation step before changing a status.

Notes, category, description, and schedule details are hidden by default and revealed when the user clicks the card outside the completion buttons.

Button behavior:
- Completed changes status to `done`
- Not Completed changes status to `not_done`
- Note opens an inline edit field or compact modal in the expanded card state

Resolved occurrences can be changed later.

## Behavior form

The create/edit behavior view should be a full page accessible from the sidebar navigation.

Fields:
- Title
- Description
- Category
- Recurrence
- Scheduled time
- Browser reminder enabled, default on
- Email reminder toggle, default off
- Reminder offset
- Active/archive

Scheduled time is required.

## Recurrence editor

Support:
- Daily
- Every N days
- Weekly on selected weekdays
- Every N weeks on selected weekdays
- Monthly on day N

Use segmented presets first, with advanced options below.

Do not expose raw cron syntax.

Do not use natural language parsing in v1.

## Reminder editor

Behavior-specific fields:
- Browser reminder enabled, default on
- Email reminder toggle, default off
- Reminder offset:
  - At scheduled time
  - 15 minutes before
  - 1 hour before
  - 1 day before
  - 3 days before
  - Custom minutes/hours/days if easy

Browser notification permission is managed globally from Settings.

## Behaviors screen

Show active behaviors first as compact cards.

Each behavior card/list item should include:
- Title
- Category
- Recurrence summary
- Scheduled time
- Reminder indicators
- Edit
- Archive

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
