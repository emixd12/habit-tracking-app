# Date and Time Strategy

This app is recurrence-heavy. Date/time drift is one of the highest-risk areas for future agents, so this strategy is locked before resolver implementation begins.

## Product decisions

- Default timezone: `America/New_York`.
- User timezone is stored on `profiles.timezone` and copied to each behavior as `behaviors.timezone`.
- Day boundary is local midnight in the behavior/user timezone.
- Needs decision is derived from `status === "unresolved"` and `local_date` before today's local date.
- The system does not auto-mark unresolved occurrences as missed.

## Storage model

Use both an instant and a local calendar date:

- `occurrences.scheduled_for timestamptz`: exact UTC instant for a scheduled occurrence.
- `occurrences.local_date date`: calendar date in the occurrence's timezone.
- `behavior_schedule_slots.start_time time`: local wall-clock time or range
  start chosen by the user.
- `behavior_schedule_slots.end_time time`: local range end for preset ranges.
- `behaviors.scheduled_time time`: first schedule slot start time kept for
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
- User timezone change policy if a future ticket permits changing profile timezone after behaviors exist.

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
