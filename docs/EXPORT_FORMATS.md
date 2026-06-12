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
- BehaviorLog bundle
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
{"type":"occurrence","local_date":"2026-06-05","scheduled_for":"2026-06-05T22:00:00-04:00","schedule":"10:00 PM","behavior_title":"Brush teeth","category":"Grooming","status":"completed","status_marked_at":"2026-06-05T22:08:00-04:00","note":null}
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

## BehaviorLog bundle

The BehaviorLog bundle is the interoperability export. It is downloaded as
`.behaviorlog.zip` and contains:

- `manifest.json`
- `schema.json`
- `README.md`
- `AGENTS.md`
- `data/behaviors.jsonl`
- `data/schedules.jsonl`
- `data/occurrences.jsonl`
- `data/status_events.jsonl`
- `data/notes.jsonl` when exported occurrences contain notes
- `data/interventions.jsonl` when exported occurrences have reminder deliveries
- `csv/behaviors.csv`
- `csv/schedules.csv`
- `csv/occurrences.csv`
- `csv/status_events.csv`

Core alignment rules:

- Status vocabulary is `unresolved`, `completed`, and `not_completed`.
- `occurrences.jsonl` includes `current_status` as a snapshot only.
- `status_events.jsonl` is the status-history source of truth.
- Local analysis should use `local_date` plus an IANA `timezone`.
- UTC timestamps are used for ordering events.
- Required files are listed in `manifest.json` with SHA-256 hashes.
- App-specific fields live under the `app.cadence` extension namespace.
- Core record top-level fields must match the BehaviorLog core schema; custom
  producer fields belong under `extensions`.
- CSV files under `csv/` are optional Level 2 migration views. They are derived
  from the matching authoritative JSONL records, include stable ID columns for
  joins, and are listed in `manifest.json` as `required: false` with
  `media_type: "text/csv"`.
- If app-specific extension data appears in a CSV view, it is encoded in one
  `extensions` JSON string column instead of expanding producer-specific fields
  into top-level CSV columns.
- Reminder deliveries are exported through the optional Intervention Profile as
  `data/interventions.jsonl`. Intervention records reference exported
  `behavior_id` and `occurrence_id`, preserve reminder channel, scheduled send
  time, sent time, delivery status, and sanitized failure reason, and keep
  Cadence-specific delivery metadata under `extensions.app.cadence`.
- Intervention records must not include email bodies, push payload bodies, API
  keys, provider secrets, raw push endpoints, browser subscription keys, or other
  sensitive transport details.

If a resolved occurrence has no internal status event, the exporter may emit a
derived medium-confidence status event from the occurrence snapshot so legacy
rows remain interoperable.

### BehaviorLog import validation dry-run

The import milestone is validation and preview only. It can read a
`.behaviorlog.zip`, validate bundle structure, and return a dry-run plan. It
must not write imported data to Supabase, merge records, restore backups,
overwrite local rows, delete rows, or deduplicate by mutation.

Required bundle files:

- `manifest.json`
- `schema.json`
- `README.md`
- `AGENTS.md`
- `data/behaviors.jsonl`
- `data/schedules.jsonl`
- `data/occurrences.jsonl`
- `data/status_events.jsonl`

`data/notes.jsonl` is optional.

Import validation rules:

- Validate `manifest.json` format, schema version, listed files, and SHA-256
  hashes for every listed file.
- Validate JSONL parsing with file and row errors that can be shown to the user
  later.
- Validate supported record types for behavior, schedule, occurrence,
  status-event, and optional note rows.
- Reject unknown top-level fields in core records. The preview may still report
  them in `unsupportedFields`, but the bundle is not valid unless custom fields
  are moved under `extensions`.
- Map parsed rows into an internal dry-run plan with records that would be
  created or skipped.
- Detect likely conflicts with existing local behaviors, occurrences, and
  status events, but do not resolve them in this milestone.
- Preserve status semantics, source capture method, source confidence, and
  `revises_event_id` from `status_events.jsonl`.
- Treat `occurrences.jsonl` `current_status` as a current snapshot only.
  Status history comes from `status_events.jsonl`.
- Use `local_date` plus IANA `timezone` for day grouping and conflict preview.
- Return counts, warnings, conflicts, unsupported fields, and skipped records in
  the preview.
- Optional `data/interventions.jsonl` files may be hash-validated through the
  manifest but are ignored by the current import dry-run. Import writes or
  intervention merge behavior require a later product/data-model update.

## AI summary

Markdown-compatible plain text summary for a selected range.

The AI summary should be copyable and downloadable as `.md`.

Example:

```text
Behavior adherence summary, 2026-05-06 to 2026-06-05

Overall:
- Completed: 84
- Not Completed: 12
- Unresolved: 3
- Default adherence: 84 / (84 + 12) = 87.5%

By behavior:
- Brush teeth: 24 completed, 4 not completed, 1 unresolved, 85.7% adherence
- Drink matcha: 27 completed, 1 not completed, 2 unresolved, 96.4% adherence

By category:
- Grooming: 40 completed, 8 not completed, 1 unresolved
- Medical: 30 completed, 1 not completed, 0 unresolved
```

## Resolver contract

Export formatting belongs in:

`/lib/resolvers/export.resolver.ts`

BehaviorLog import validation belongs in:

`/lib/resolvers/behaviorlog-import.resolver.ts`

The resolver should accept structured rows and return:
- JSONL string
- CSV string
- JSON backup object/string
- BehaviorLog bundle files
- AI summary string

The resolver should not query Supabase directly.

## Required tests

- JSONL emits one valid JSON object per line.
- CSV escapes commas, quotes, and newlines.
- Full JSON includes categories, behaviors, and occurrences.
- AI summary calculates adherence correctly.
- Unresolved occurrences are excluded from default adherence.
- BehaviorLog bundle includes required files, manifest hashes, schedules,
  occurrences, status events, and notes when notes exist.
- BehaviorLog export synthesizes status events for resolved legacy occurrences
  that do not yet have internal `occurrence_status_events` rows.
- BehaviorLog import validation accepts a bundle generated by the export
  resolver, validates hashes and JSONL rows, preserves status-event semantics,
  detects local conflicts, and does not synthesize history from
  `current_status`.
- BehaviorLog core conformance materializes a resolver-generated bundle as a
  temporary `.behaviorlog/` directory and runs the pinned upstream
  `emixd12/BehaviorLog-Bundle` reference validator snapshot recorded in
  `tests/fixtures/behaviorlog-reference/SNAPSHOT.md`.
- BehaviorLog CSV views match their authoritative JSONL source record counts
  and stable IDs, escape commas, quotes, and newlines, and keep extension data
  in a single JSON string column.
- BehaviorLog Intervention Profile export emits reminder deliveries as optional
  `intervention` records, validates their references through the conformance
  harness, represents pending/sent/failed/cancelled statuses, lists and hashes
  `data/interventions.jsonl` in the manifest, and redacts sensitive transport
  details.
