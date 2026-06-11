# User Flows

This document describes the main v1 screens, modules, and user flows.

## App shell

The app uses a retractable sidebar on desktop and mobile.

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

Timeline order:
1. Floating Needs decision button
2. Current day
3. Next 7 days
4. Additional future days when the user chooses to show more

Needs decision contains only prior-day unresolved occurrences. It is not a general past timeline.

The Needs decision button is fixed to the lower right of the Timeline screen, shows the current number of prior unresolved occurrences, and opens a modal with the grouped prior-day occurrences.

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
Completed rows continue to show both status buttons, with Not Completed
indicated as the current choice, and each status button applies only to the
occurrence row where it appears.

If a day has no occurrences, show:

```text
No behaviors on this day
```

## Occurrence card flow

Collapsed unresolved cards show:
- Scheduled time
- Behavior title
- Completed button
- Not Completed button

Collapsed Completed cards show:
- Scheduled time
- Behavior title
- Resolved status

Collapsed Not Completed cards show:
- Scheduled time
- Behavior title
- Completed button
- Not Completed button, indicated as the current choice

Completed cards should have a distinct visual state and should hide the primary action buttons.

Not Completed cards should visually return to the original unresolved card treatment while exposing both buttons so the logged action can be approved or changed without expanding the card. The stored status remains `not_done` on that occurrence instance.

Clicking a card outside the completion buttons expands it.

Expanded cards show:
- Description
- Category
- Schedule details
- Note field
- Option to change a Completed status

Categories are visible only in expanded card details.

If an occurrence is unresolved after the end of its local day, it appears in the Needs decision modal and is visually highlighted. This is a derived UI state based on date and `unresolved`; it must not write a different stored status.

## Behavior flow

The Behaviors screen shows active behaviors first as compact cards.

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
