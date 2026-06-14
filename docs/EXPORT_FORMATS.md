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

### BehaviorLog import validation, tracking, and create-only apply

The import path can read a `.behaviorlog.zip`, validate bundle structure, and
return a dry-run plan. The tracking layer persists auditable import runs and
external-to-local record mappings. Create-only apply may write product data only
for records that remain `action: "create"` in a valid dry-run preview and only
when the import run mode is `create_missing_only`.

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
- Parse optional `data/notes.jsonl` rows with note role, sensitivity label, and
  source metadata preserved in the preview plan.
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
- Optional `data/interventions.jsonl` files are parsed for an Intervention
  Profile preview. The importer validates JSONL rows, record type, manifest
  hash, channel, delivery status, and behavior/occurrence references, then
  marks every intervention as `preview_only`.
- Intervention preview returns counts by reminder channel, delivery status, and
  linked behavior. It also warns when rows contain message bodies, raw
  endpoints, provider identifiers or secrets, subscription keys, recipient
  identifiers, or similar sensitive delivery payload.
- Intervention preview must not create `reminder_deliveries`, schedule sends,
  cancel sends, retry sends, call Sequenzy, call Web Push, or call any
  notification provider.

Import tracking rules:

- Each preview or apply attempt can create one `behaviorlog_import_runs` row.
- Import runs record bundle format, schema version, manifest SHA-256, a
  deterministic bundle fingerprint, producer name/version, subject id strategy,
  privacy redaction level, import mode, dry-run summary snapshot, status, and
  start/completion timestamps.
- Import run status values are `previewed`, `applied`, `failed`, and
  `cancelled`.
- Import modes are `preview_only`, `create_missing_only`, `merge_preview`, and
  `merge_by_user_approved_plan`.
- `behaviorlog_import_record_mappings` maps external BehaviorLog ids to local
  Cadence ids by import run and record type.
- Mapping record types are `behavior`, `schedule`, `occurrence`,
  `status_event`, `note`, and `intervention`.
- Mapping inserts are idempotent for the same import run, record type, and
  external id. Later import phases should reuse these mappings instead of
  inventing separate provenance stores.

Create-only apply rules:

- Create missing behaviors from `data/behaviors.jsonl` when they have at least
  one compatible schedule.
- Match imported behavior categories to existing local categories by normalized
  name. Do not create categories in this import mode.
- Create compatible schedule slots from `data/schedules.jsonl` using Cadence's
  supported recurrence and schedule-slot model.
- Supported recurrence profile is `behaviorlog.calendar_simple.v1` with daily,
  every N days, weekly weekdays, every N weeks on weekdays, and monthly day-N
  rules.
- Exact schedules use `local_time`. Range schedules must match Cadence preset
  windows: morning, afternoon, evening, or night.
- Create missing occurrences from `data/occurrences.jsonl` as `unresolved`
  first.
- Append imported `data/status_events.jsonl` rows into
  `occurrence_status_events` and then update occurrence `status`,
  `completed_at`, and `status_marked_at` from the latest imported event for
  that occurrence.
- A resolved `current_status` snapshot without a supporting status event remains
  a warning; the importer does not synthesize explicit history from the
  snapshot.
- Reapplying the same accepted create-only import run must not duplicate
  behaviors, schedules, occurrences, status events, or mappings.
- Create-only apply must not merge, overwrite, restore, delete, import notes,
  import interventions, import optional profile data, import CSV-only data, or
  trigger notification/provider side effects.

Merge-preview rules:

- Merge preview uses authoritative JSONL files under `data/`; CSV files remain
  optional derived views and are ignored for merge decisions.
- Merge preview emits deterministic actions for each imported core record:
  `create_new`, `map_to_existing`, `skip_existing`, or
  `conflict_requires_decision`.
- Conflict codes and human-readable reasons must be stable enough to present
  for user review and to feed a later user-approved merge plan.
- Behavior comparisons use existing import mappings, source original id,
  title/category identity, archive state, and compatible schedule shape.
- Schedule comparisons use mapped behavior, recurrence profile, recurrence
  payload, timezone, active date bounds, and exact-time or preset range slot.
- Occurrence comparisons use mapped behavior/schedule plus
  `scheduled_for_utc`, `local_date`, and timezone.
- Status-event comparisons use external event id, mapped occurrence, recorded
  time, status, status semantics, and revision target.
- `status_events.jsonl` remains the status-history authority. The occurrence
  `current_status` field is a snapshot only, and unresolved is never converted
  to a failure state.
- The merge-preview output includes a privacy/profile summary, including
  redaction level and whether notes or interventions are present.
- Optional notes are previewed with sensitivity/source metadata. Only
  occurrence-attached, non-AI notes can plan a product write. Behavior,
  status-event, review, and AI-generated notes are skipped with warnings.
- High or restricted note sensitivity must produce a preview warning before the
  note can be accepted for import.
- If a mapped or created target occurrence has an empty local note, merge preview
  may emit an accepted safe-fill note action. If the local note is non-empty and
  differs, merge preview must emit `occurrence_note_conflict` and require an
  explicit decision before any change.
- `data/interventions.jsonl` rows remain preview-only. Intervention preview
  must not create reminder deliveries, schedule sends, cancel sends, retry
  sends, or call notification providers.
- A generated merge preview may be stored in `behaviorlog_import_runs` with
  `import_mode = 'merge_preview'`; this write is limited to the import ledger
  and must not mutate product records.

User-approved merge apply rules:

- Applying a merge plan requires an import run with
  `import_mode = 'merge_by_user_approved_plan'` and an accepted Ticket 020
  `mergePreview` snapshot stored in `dry_run_summary`.
- Apply refuses plans that still contain `conflict_requires_decision`.
- `create_new` actions use the same compatibility checks as create-only import.
- `map_to_existing` actions create provenance mappings without overwriting local
  behavior, schedule, or occurrence fields, except for accepted occurrence-note
  safe fills described below.
- Imported status events are append-only. The current occurrence snapshot is
  updated only after appending events and only when the imported event is latest
  by effective time, recorded time, and stable id tie-breaker.
- Ambiguous or lower-confidence imported events must not replace an existing
  local explicit high-confidence status decision.
- Accepted note actions may fill `occurrences.note` only for occurrence-attached,
  non-AI notes when the target occurrence is safely identified and the current
  local note is empty. Note mappings use the local occurrence id.
- Note apply must not update occurrence status fields, status events, analytics
  inputs, adherence logic, reminder deliveries, or provider state.
- Interventions remain preview/provenance-only here; imported intervention
  records must not be written into operational reminder-delivery tables unless
  a later passive history model explicitly changes scope.
- Merge apply must be idempotent for the same accepted run through
  `behaviorlog_import_record_mappings`, and failed partial attempts mark the
  import run `failed`.

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
- BehaviorLog merge preview covers `create_new`, `map_to_existing`,
  `skip_existing`, and `conflict_requires_decision` actions, stable conflict
  reasons, privacy/redaction summaries, optional note sensitivity/source
  preview, occurrence-note safe-fill/conflict decisions, optional intervention
  preview counts/sensitive-payload warnings, and status-event authority over
  occurrence snapshots.
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
