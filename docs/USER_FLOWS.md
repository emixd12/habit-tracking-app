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
1. Needs decision
2. Current day
3. Next 7 days
4. Additional future days when the user chooses to show more

Needs decision contains only prior-day unresolved occurrences. It is not a general past timeline.

Users should not browse previous days as ordinary timeline sections in v1.

Each day section should list active behavior occurrences in chronological order by scheduled time.

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

Collapsed resolved cards show:
- Scheduled time
- Behavior title
- Resolved status

Resolved cards should have a distinct visual state and should hide the primary action buttons.

Clicking a card outside the completion buttons expands it.

Expanded cards show:
- Description
- Category
- Schedule details
- Note field
- Option to change a resolved status

Categories are visible only in expanded card details.

If an occurrence is unresolved after the end of its local day, it appears in Needs decision and is visually highlighted. This is a derived UI state based on date and `unresolved`; it must not write a different stored status.

## Behavior flow

The Behaviors screen shows active behaviors first as compact cards.

Behavior create/edit is a full page accessible from the sidebar navigation.

Behavior form fields:
- Title
- Description
- Category
- Recurrence
- Scheduled time
- Browser reminder enabled
- Email reminder enabled
- Reminder offset
- Active/archive

Scheduled time is required.

The recurrence editor should use segmented presets first, with advanced options below.

Archived behaviors appear in a separate archived section and do not appear on the timeline.

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
