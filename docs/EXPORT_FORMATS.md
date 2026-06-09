# Export Formats

## Goals

Exports should be easy to read by:
- ChatGPT or another AI assistant
- A spreadsheet
- A future restore/import process

V1 export types:
- JSONL
- CSV
- Full JSON backup
- Markdown AI summary

Exports should support download and copy where practical.

Export options should include:
- Last 7 days
- Last 30 days
- Last 90 days
- All time
- Include archived behaviors

## JSONL

One event per line.

Occurrence event:

```json
{"type":"occurrence","local_date":"2026-06-05","scheduled_for":"2026-06-05T22:00:00-04:00","schedule":"10:00 PM","behavior_title":"Brush teeth","category":"Grooming","status":"done","status_marked_at":"2026-06-05T22:08:00-04:00","note":null}
```

Behavior event:

```json
{"type":"behavior","behavior_title":"Brush teeth","category":"Grooming","description":"Night brushing","recurrence_rule":{"frequency":"daily","interval":1},"scheduled_time":"22:00","schedule_slots":[{"id":"slot-1","kind":"exact","preset":null,"startTime":"22:00","endTime":null,"sortOrder":0,"label":"10:00 PM"}],"browser_reminder_enabled":true,"email_reminder_enabled":false}
```

Category event:

```json
{"type":"category","name":"Grooming","sort_order":2}
```

## CSV

Occurrence CSV columns:
- local_date
- scheduled_for
- schedule
- behavior_title
- category
- status
- status_marked_at
- note

CSV should open cleanly in spreadsheet software.

## Full JSON backup

Shape:

```json
{
  "exported_at": "2026-06-05T18:00:00-04:00",
  "profile": {
    "timezone": "America/New_York"
  },
  "categories": [],
  "behaviors": [],
  "occurrences": []
}
```

This is intended as a backup and possible future restore format.

## AI summary

Markdown-compatible plain text summary for a selected range.

The AI summary should be copyable and downloadable as `.md`.

Example:

```text
Behavior adherence summary, 2026-05-06 to 2026-06-05

Overall:
- Done: 84
- Not done: 12
- Unresolved: 3
- Default adherence: 84 / (84 + 12) = 87.5%

By behavior:
- Brush teeth: 24 done, 4 not done, 1 unresolved, 85.7% adherence
- Drink matcha: 27 done, 1 not done, 2 unresolved, 96.4% adherence

By category:
- Grooming: 40 done, 8 not done, 1 unresolved
- Medical: 30 done, 1 not done, 0 unresolved
```

## Resolver contract

Export formatting belongs in:

`/lib/resolvers/export.resolver.ts`

The resolver should accept structured rows and return:
- JSONL string
- CSV string
- JSON backup object/string
- AI summary string

The resolver should not query Supabase directly.

## Required tests

- JSONL emits one valid JSON object per line.
- CSV escapes commas, quotes, and newlines.
- Full JSON includes categories, behaviors, and occurrences.
- AI summary calculates adherence correctly.
- Unresolved occurrences are excluded from default adherence.
