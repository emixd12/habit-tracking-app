# Recurrence Rules

## Supported recurrence types

V1 supports:

1. Daily
2. Every N days
3. Weekly on selected weekdays
4. Every N weeks on selected weekdays
5. Monthly on day N

Do not implement natural-language recurrence in v1.

Do not expose raw cron syntax in the user interface.

## TypeScript shape

```ts
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type RecurrenceRule =
  | {
      frequency: "daily";
      interval: number;
    }
  | {
      frequency: "interval_days";
      intervalDays: number;
    }
  | {
      frequency: "weekly";
      interval: number;
      daysOfWeek: Weekday[];
    }
  | {
      frequency: "monthly";
      interval: number;
      dayOfMonth: number;
    };
```

## Scheduled time

Each behavior must have a `scheduled_time`.

Use local time in the user's timezone.

Example:
- `22:00`
- `09:30`

## Timezone

All rules are evaluated in the user's timezone.

Default:
`America/New_York`

## Day boundary

Local midnight.

The current-day timeline section covers:
- local date at 00:00:00 through local date at 23:59:59.999

Unresolved items before today's local date appear under Needs decision.

## Monthly fallback

If a behavior is scheduled for day 31 and the month has fewer days, schedule it on the last day of the month.

Examples:
- January 31 -> January 31
- February 31 -> February 28 or February 29 in leap years
- April 31 -> April 30

## Occurrence generation range

The system should maintain generated occurrences for:
- Prior unresolved items
- Today
- The next 30 days

## Idempotence

Occurrence generation must be idempotent.

Running generation twice must not create duplicates.

The unique key is:
`behavior_id + scheduled_for`

## Interval anchor

Interval-based rules need a stable local calendar anchor. The resolver accepts
an optional `anchorDate` as `YYYY-MM-DD` in the behavior timezone. Services
should pass the behavior's stable local start or created date when available.
If omitted, the resolver uses the local `rangeStart` date.

## Resolver contract

Implement recurrence expansion in:

`/lib/resolvers/recurrence.resolver.ts`

Function shape:

```ts
import type { Temporal } from "@js-temporal/polyfill";

export function resolveOccurrenceSchedule(input: {
  recurrenceRule: RecurrenceRule;
  scheduledTime: string;
  timezone: string;
  anchorDate?: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Array<{
  scheduledFor: Temporal.Instant;
  localDate: string;
}>;
```

The resolver must be pure:
- No database calls
- No React
- No browser APIs
- No email/push side effects

## Required tests

- Daily at 10 PM generates one occurrence per day.
- Every N days generates the correct interval.
- Weekly Friday generates only Fridays.
- Every other Sunday generates every 14 days.
- Weekly rule can support multiple weekdays.
- Monthly day 31 falls back to last day of short months.
- Timezone remains America/New_York.
- Local midnight boundary behaves correctly.
