# Date and Time Strategy

This app is recurrence-heavy. Date/time drift is one of the highest-risk areas for future agents, so this strategy is locked before resolver implementation begins.

## Product decisions

- Default timezone: `America/New_York`.
- User timezone is stored on `profiles.timezone` and copied to each behavior as `behaviors.timezone`.
- Settings can update `profiles.timezone`. A user-approved timezone change also updates active behaviors to the new timezone and resyncs future unresolved occurrences. Past occurrences and resolved occurrences remain historical records.
- Settings commits the profile timezone, every active Behavior timezone,
  configuration history, and one stale sync marker in one owner-scoped
  transaction. Occurrence sync runs afterward and remains safe to retry.
- Browser timezone detection uses `Intl.DateTimeFormat().resolvedOptions().timeZone`; it does not use geolocation or request location permission.
- Day boundary is local midnight in the behavior/user timezone.
- Needs decision is derived from `status === "unresolved"` and `local_date` before today's local date.
- The system does not auto-mark unresolved occurrences as missed.

## Storage model

Use both an instant and a local calendar date:

- `occurrences.scheduled_for timestamptz`: exact UTC instant for a scheduled occurrence.
- `occurrences.local_date date`: calendar date in the occurrence's timezone.
- `behavior_schedules.recurrence_rule jsonb`: recurrence pattern for one
  schedule under a behavior.
- `behavior_schedule_slots.start_time time`: local wall-clock time or range
  start chosen by the user for one schedule time entry.
- `behavior_schedule_slots.end_time time`: local range end for time ranges.
- `behaviors.scheduled_time time`: first schedule time-entry start kept for
  compatibility and simple ordering.
- `occurrences.schedule_*`: snapshot fields preserving the exact time or range
  label source for historical occurrence rows.
- `behaviors.timezone text`: IANA timezone name, default `America/New_York`.

`local_date` is not a convenience cache to ignore. It is the stable grouping key for timeline sections, Needs decision, export, and analytics.

## Implementation library

Use Temporal for timezone-aware calculations. Until native Temporal is universally available in the app runtime, future implementation should add `@js-temporal/polyfill` and import from it in resolver/service code that performs timezone math.

Do not introduce Moment, Luxon, date-fns, date-fns-tz, Day.js, or ad hoc `Date` arithmetic for recurrence or day-boundary logic unless this document is explicitly changed.

Allowed uses of JavaScript `Date`:

- Accepting or returning instants at API boundaries where existing libraries require `Date`.
- Serializing/deserializing `timestamptz` values.
- Tests that convert fixed instants into Temporal values.

Disallowed patterns:

- Parsing `YYYY-MM-DD` with `new Date("YYYY-MM-DD")`.
- Deriving local midnight by subtracting offsets manually.
- Using server timezone as user timezone.
- Calling `new Date()` inside resolvers.

## Resolver contract

Resolver functions must receive time context explicitly. `now is injected`; resolvers do not read the clock.

Example shape:

```ts
export type TimeContext = {
  now: Temporal.Instant;
  timezone: string;
};
```

Recurrence resolvers should produce:

```ts
{
  scheduledFor: Temporal.Instant;
  localDate: string; // ISO YYYY-MM-DD in the behavior timezone
}
```

Services may convert `Temporal.Instant` to database strings. Repositories should persist values; they should not decide recurrence.

## DST and edge cases

Agents must test these cases when implementing recurrence:

- Daily scheduled time around spring-forward and fall-back transitions.
- Weekly schedule across a DST boundary.
- Monthly day 31 fallback in February and April.
- Local midnight boundary for Needs decision.
- Behavior timezone different from the server timezone.
- User timezone changes should preserve past and resolved occurrence history while regenerating future unresolved rows through the occurrence generation service.

For nonexistent local times during spring-forward, prefer the next valid local time. For repeated local times during fall-back, prefer the earlier occurrence unless the product docs are updated with a different policy.

## Database and API formatting

- Store `timestamptz` as ISO strings from UTC instants.
- Store `local_date` as ISO calendar date string `YYYY-MM-DD`.
- Do not store locale-formatted dates.
- UI may format display dates with `Intl.DateTimeFormat`, using the explicit user timezone.

## Tests are source-of-truth evidence

The following tests are required before recurrence/timeline/status work is complete:

- `tests/recurrence.resolver.test.ts`: generation ranges, intervals, weekdays, monthly fallback, DST behavior.
- `tests/timeline.resolver.test.ts`: local-date grouping and Needs decision boundary.
- `tests/status.resolver.test.ts`: status transition timestamps and no automatic missed state.

Run `npm run resolvers:check` after adding any date/time resolver.

## Day-progress and external-event contracts (Tickets 132–136)

The synthetic layout contract derives day start and next-day start through
Temporal in the explicit Timeline timezone. A day can span 23 or 25 hours.
Never divide elapsed time by a hardcoded 24-hour duration. Timed event spans,
item anchors, and the current-time dot share a monotonic piecewise mapping.
Measured row geometry can change spacing without changing any actual instant.
Equal-time rows share a temporal anchor while retaining readable vertical spacing.

Timed external events use half-open instant intervals. Overnight events retain
one identity and clip to each intersected local day for display. All-day events
use a start date and exclusive end date, never invented midnight durations.
All-day events do not participate in timed-overlap warnings.

The external snapshot request uses an inclusive displayed local-date range.
The provider adapter converts its inclusive end date to the next local midnight
in the requested IANA timezone. That boundary can cross a daylight-saving
transition. Do not add 24 hours to derive it. The normalized all-day event end
remains exclusive even though the snapshot request end remains inclusive.

A timed event with an unspecified provider end retains its compatibility
`endAt` for clipping, but exposes unknown duration. It cannot establish a free
interval. Recurrence instance identity uses the provider's original start fact.
Cancellation tombstones retain that identity so an atomic cache replacement can
remove the correct instance. Provider revision, busy/free, and current-user
response remain source facts. They do not authorize schedule or status changes.

The estimate window is the preceding ninety complete local days:
`[today - 90 days, today)`. Today is excluded. Three distinct Completed
Occurrences with positive stopped totals establish a sample. Any running
session excludes its Occurrence. Estimates remain a separate contract from
the existing analytics range and averages. The implementation lives in
`packages/core/src/resolvers/timeline-context.resolver.ts`. It never changes
recorded timing, a Behavior schedule, or an Occurrence status.

## Ticket 088 sync freshness

Web Behavior creation reads the current profile timezone from the repository,
bypassing the read cache and ignoring submitted timezone values. The form sends
no hidden timezone. Existing state-version and configuration-event comparisons
guard sync completion; a concurrent edit leaves the account stale for retry.
Freshness summaries derive timezone from the actual generation windows. Mixed
windows retain the existing `multiple` marker and cannot claim one profile zone.
