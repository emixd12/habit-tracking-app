# Export Formats

## Goals

Exports should be easy to read by:
- ChatGPT or another AI assistant
- A spreadsheet
- A future restore/import process

Exports are also part of Cadence's public-product posture: the app should act
as a practical producer and demonstration surface for the BehaviorLog Bundle
standard.

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
- Include occurrence notes, off by default. Download API routes use
  `include_notes=1` to opt in.
- Include time tracking, off by default. Exact session timestamps can reveal
  activity patterns. Only `include_time_tracking=1` opts in; disabled exports
  do not read timing rows or expose timing fields, files, counts, or filenames.

Behavior definition history has a separate privacy posture from occurrence
notes. Full JSON and BehaviorLog exports include full prior and next title and
description values by default for every included behavior. The Markdown
summary includes the revision count and agent guidance, but does not repeat the
revision text. Historical definitions can contain sensitive context, so the
Export & Import screen discloses this default before download. Ticket 057 does
not add a separate history option.

## JSONL

One event per line.

Occurrence event:

```json
{"type":"occurrence","local_date":"2026-06-05","scheduled_for":"2026-06-05T22:00:00-04:00","schedule":"10:00 PM","behavior_title":"Brush teeth","category":"Grooming","status":"completed","status_marked_at":"2026-06-05T22:08:00-04:00","note":null}
```

Occurrence `note` remains present in the app-native JSONL shape. It is `null`
unless the include-notes option is selected.

JSONL occurrence rows are current snapshots. `status_marked_at` is the latest
mark on that snapshot, not the complete decision trail.

App-native JSONL remains a compact snapshot format and does not include
behavior definition events. Use Full JSON or BehaviorLog when definition
history is needed.

When time tracking is selected, JSONL appends ordered `time_session` records
with session, occurrence, and behavior IDs, start/stop instants, and nullable
`duration_seconds`. Running sessions retain a null stop and duration.
Markdown reports stopped-session count and recorded total per behavior, then
averages the summed stopped-session total for each timed occurrence. It never
lists exact session timestamps.

Behavior event:

```json
{"type":"behavior","behavior_title":"Brush teeth","category":"Grooming","description":"Night brushing","recurrence_rule":{"frequency":"daily","interval":1},"scheduled_time":"22:00","schedules":[{"id":"schedule-1","recurrenceRule":{"frequency":"daily","interval":1},"timeEntries":[{"id":"slot-1","kind":"exact","preset":null,"startTime":"22:00","endTime":null,"sortOrder":0,"label":"10:00 PM"}],"sortOrder":0}],"schedule_slots":[{"id":"slot-1","kind":"exact","preset":null,"startTime":"22:00","endTime":null,"sortOrder":0,"label":"10:00 PM"}],"browser_reminder_enabled":true,"email_reminder_enabled":false}
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

The `note` column remains present. Note cells are empty unless the
include-notes option is selected.

CSV rows are current snapshots. `status_marked_at` must not be interpreted as
complete status history.

CSV does not include behavior definition events. Use Full JSON or BehaviorLog
when definition history is needed.

When time tracking is selected, CSV adds `tracked_duration_seconds`,
`time_session_count`, and `time_sessions`. The latter is one escaped JSON array
of included raw sessions per occurrence. Stopped sessions alone contribute to
the derived total.

Cadence neutralizes spreadsheet formula prefixes in CSV columns that can carry
user-controlled free text. Before normal CSV quoting, a protected cell whose
first non-whitespace character is `=`, `+`, `-`, or `@` receives a leading
apostrophe. Protected app-native columns are behavior title, category, and
note. Protected BehaviorLog projections are behavior title, description,
category, success definition, and status-event reason code. Machine-generated
structured values such as signed UTC offsets, timestamps, stable IDs, and
status vocabulary remain exact. JSON and JSONL exports retain the original
text unchanged.

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
  "occurrences": [],
  "status_events": [],
  "behavior_definition_events": []
}
```

This is an app-native backup of categories, behaviors, occurrence snapshots,
and the append-only `occurrence_status_events` history for exported
occurrences. The `occurrences` array remains the current snapshot surface.
Use `status_events` to analyze corrections or logging chronology:

- `recorded_at` is when Cadence logged the explicit decision.
- `effective_at` is the decision's stated effective time when present.
- `revises_event_id` links a correction to the latest prior event when known.

The additive `status_events` root preserves compatibility for existing readers
of the unchanged category, behavior, and occurrence snapshot arrays. BehaviorLog
remains the interoperable and restore-oriented export format; its
`data/status_events.jsonl` remains the authoritative standard record.

`behavior_definition_events` is the append-only history for behavior title and
description definitions. Each record includes:

When time tracking is selected, Full JSON also adds the optional root
`time_sessions`. Each raw session includes a nullable derived
`duration_seconds`; running sessions remain null. The root is omitted entirely
when time tracking is not selected.

- `id` and `behavior_id`
- full `previous_title` and `next_title` values
- full `previous_description` and `next_description` values
- canonical `changed_fields` in `title`, then `description` order
- `recorded_at`, `source`, optional schema-only `reason`, `created_at`, and
  `updated_at`

Events are filtered to behaviors included by the archived-behavior option. The
complete event trail for those behaviors is included even when the selected
occurrence range is 7, 30, or 90 days. Events sort by `recorded_at`, then `id`,
so equal-timestamp exports remain deterministic. Baseline events use the
behavior creation time and preserve the initial definition with null previous
values.

Behavior records include `schedules[]` as the current app-native schedule
structure. `recurrence_rule`, `scheduled_time`, and `schedule_slots` remain in
app-native exports for backward compatibility with old records and older tools.
Occurrence `note` values are `null` unless the include-notes option is selected.

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
- `data/notes.jsonl` when include-notes is selected and exported occurrences
  contain notes
- `data/interventions.jsonl` when exported occurrences have reminder deliveries
- `raw/cadence/behavior_definition_events.jsonl`
- `raw/cadence/occurrence_time_sessions.jsonl` only when time tracking is
  selected
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
- `raw/cadence/behavior_definition_events.jsonl` is an optional app-specific
  BehaviorLog file. It contains the same sorted records as Full JSON
  `behavior_definition_events`, is listed and hashed in the manifest with
  `required: false` and `schema_ref: null`, and does not add a non-standard core
  record type.
- `manifest.json.extensions.app.cadence.behavior_definition_history` declares
  the file path, record count, `recorded_at`/`id` ordering, and current
  `export_only` import/restore support.
- `raw/cadence/occurrence_time_sessions.jsonl` is an optional, hashed
  Cadence-specific JSONL file. Its records include `session_id`, occurrence and
  behavior IDs, start/stop instants, and nullable derived duration. The manifest
  declares its path, record count, `started_at`/`session_id` ordering, and
  `export_only` support. It includes only sessions attached to occurrences in
  the selected range and archived-behavior scope.

The upstream standard lives at:
`https://github.com/emixd12/BehaviorLog-Bundle`
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

`raw/cadence/behavior_definition_events.jsonl` is an optional Cadence export
file. Current import, merge preview/apply, and restore preview/apply verify its
manifest entry and hash through normal bundle validation, but do not parse or
replay its revision records. These workflows use the current title and
description snapshots in `data/behaviors.jsonl`: create-only and approved-merge
creates record a local `source = import` baseline, while restore records a local
import baseline or definition transition for the snapshot it applies. Those
locally generated events do not reconstruct the bundle's earlier revision
trail. Full JSON has no import or restore path. Users should retain the original
Full JSON or BehaviorLog export when they need to preserve the complete
revision trail outside Cadence.

`raw/cadence/occurrence_time_sessions.jsonl` follows the same hash validation.
Cadence validates its record shape and export-only declaration, but import,
merge, restore preview, and restore apply never replay timing sessions.

Import validation rules:

- Validate `manifest.json` format, schema version, listed files, and SHA-256
  hashes for every listed file.
- Accept the manifest-listed optional Cadence definition-history file without
  treating it as a core record file. Its rows remain export-only in this
  ticket.
- Validate JSONL parsing with file and row errors that can be shown to the user
  later.
- Validate supported record types for behavior, schedule, occurrence,
  status-event, and optional note rows.
- Parse optional `data/notes.jsonl` rows with note role, sensitivity label,
  source metadata, source original id, created/updated timestamps, and
  attachment target preserved in the preview plan.
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
- Intervention preview must show the passive history fields that will be stored
  in `imported_interventions` and the sensitive delivery fields that will be
  dropped or redacted. Intervention preview must not create
  `reminder_deliveries`, schedule sends, cancel sends, retry sends, call
  Sequenzy, call Web Push, or call any notification provider.

Import tracking rules:

- Each preview or apply attempt can create one `behaviorlog_import_runs` row.
- Import runs record bundle format, schema version, manifest SHA-256, a
  deterministic bundle fingerprint, producer name/version, subject id strategy,
  privacy redaction level, import mode, dry-run summary snapshot, status, and
  start/completion timestamps.
- Import run status values are `previewed`, `applied`, `failed`, and
  `cancelled`.
- Import modes are `preview_only`, `create_missing_only`, `merge_preview`,
  `merge_by_user_approved_plan`, `restore_preview`, and `restore_apply`.
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
- Exact schedules use `local_time`. Range schedules use
  `window_start_local`/`window_end_local`; preset labels such as morning,
  afternoon, evening, and night are optional Cadence metadata.
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
- Create-only apply may store non-AI behavior, occurrence, status-event, and
  review notes in `imported_notes` after their attachment target is created or
  mapped. Occurrence-attached notes may also fill `occurrences.note` only when
  the imported occurrence is safely identified and the local note is empty.
- Create-only apply may store `data/interventions.jsonl` rows as passive
  `imported_interventions` history with sanitized failure reasons, source
  metadata, redaction indicators, external behavior/occurrence ids, and local
  ids when known.
- Create-only apply must not merge, overwrite, restore, delete, import optional
  profile data, import CSV-only data, write `reminder_deliveries`, or trigger
  notification/provider side effects. Imported intervention promotion is a
  separate explicit selected-and-confirmed workflow after passive history
  exists.

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
- Behavior title/category identity uses the authoritative BehaviorLog category
  for cross-product matching. When both the imported and local records also
  provide a Cadence display category, that display category must match too;
  canonical `health_wellness` does not make `Medical` and `Measurements`
  interchangeable.
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
- Optional notes are previewed with role, sensitivity/source metadata, source
  original id, timestamps, attachment target, and a storage decision. Non-AI
  behavior, occurrence, status-event, and review notes can plan passive
  `imported_notes` rows. AI-generated notes are skipped with warnings.
- High or restricted note sensitivity must produce a preview warning and require
  explicit privacy acknowledgement before the note can be accepted for import.
- Import preview must distinguish an inline occurrence-note fill from a general
  passive imported note record. If a mapped or created target occurrence has an
  empty local note, merge preview may emit an inline safe-fill decision in
  addition to the passive note-record decision. If the local note is non-empty
  and differs, preview still plans the passive imported note row but must not
  plan an inline replacement.
- `data/interventions.jsonl` rows may plan passive imported intervention
  history. Merge preview must show stored fields, dropped/redacted sensitive
  fields, and no reminder-delivery/provider side effects.
- A generated merge preview may be stored in `behaviorlog_import_runs` with
  `import_mode = 'merge_preview'`; this write is limited to the import ledger
  and must not mutate product records.

User-approved merge apply rules:

- Applying a merge plan requires an import run with
  `import_mode = 'merge_by_user_approved_plan'` and an accepted Ticket 020
  `mergePreview` snapshot stored in `dry_run_summary`.
- Apply is bound to one persisted accepted `merge_preview` run. The request
  must identify that run and provide its bundle, local-data, and combined
  preview fingerprints; server-side verification rejects any unaccepted,
  missing, stale, altered, or mismatched preview data rather than silently
  recomputing a replacement plan.
- The resulting apply run retains the accepted preview-run reference and
  accepted preview fingerprint for audit. Raw bundle contents remain outside
  the import-run ledger.
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
- Accepted note actions store non-AI BehaviorLog notes as `imported_notes`
  records. Note mappings use the imported note row id.
- Accepted note actions may additionally fill `occurrences.note` only for
  occurrence-attached, non-AI notes when the target occurrence is safely
  identified and the current local note is empty.
- Note apply must not update occurrence status fields, status events, analytics
  inputs, adherence logic, reminder deliveries, or provider state.
- Accepted intervention actions store passive `imported_interventions` rows and
  provenance mappings. They must not write operational reminder-delivery rows,
  claim reminders, or call notification providers. Imported intervention
  promotion remains separate from merge apply and must require its own selected
  imported-intervention ids plus explicit confirmation.
- Merge apply must be idempotent for the same accepted run through
  `behaviorlog_import_record_mappings`, and failed partial attempts mark the
  import run `failed`.

User-facing import UI rules:

- The authenticated Export & Import screen at `/export` is the first-class
  import entry point.
- Uploads must be `.behaviorlog.zip` bundles; unsupported files should fail
  before preview.
- The compressed archive ceiling is 2 MB. Cadence authenticates
  the account before it reads archive entries, then rejects archives with more
  than 128 entries, an extracted entry larger than 32 MiB, more than 64 MiB
  extracted in total, or an entry whose declared compression ratio exceeds
  100:1. These bounds apply to import and restore, including accepted-preview
  apply.
- The Next.js Server Action request ceiling is 4 MB. A 2 MB ZIP is about
  2.7 MB when base64-encoded, leaving margin below Vercel's 4.5 MB Function
  request cap.
- Apply transports the base64 archive once in the submitted form. Action state
  retains only the SHA-256 fingerprint of the exact archive bytes accepted at
  preview. Apply recomputes that fingerprint, refuses a mismatch, and still
  re-parses and re-validates the submitted archive authoritatively.
- Preview persists an import-run ledger row and must not write product records.
- The UI must show validation output, dry-run counts, privacy notes,
  sensitivity warnings, intervention preview counts, passive intervention
  storage counts, dropped/redacted intervention field summaries, unsupported
  field counts, conflicts, merge actions, imported-note record counts, and
  inline occurrence-note fill counts before apply.
- High or restricted sensitivity notes require a dedicated acknowledgement
  before apply.
- Create-only apply is available only for valid dry-runs with no unsafe merge
  decisions.
- Merge apply requires supported safe actions, no unresolved conflict actions,
  and explicit user confirmation.
- Apply controls operate only on the exact accepted preview shown in the
  current review state. If the bundle or local data changes, the UI must show
  the server refusal, keep the prior preview available for review, and require
  a new preview before another apply attempt.
- Raw uploaded bundle contents are not stored in the import-run ledger.
- The Export & Import screen must disclose that the exported behavior
  definition revision trail is not replayed in this release. Import and restore
  use current behavior snapshots and record only the local import baseline or
  transition needed to keep subsequent Cadence history complete.
- Do not add full restore, destructive overwrite, generalized notes browsing, or
  intervention-to-reminder writes in this UI milestone.

### BehaviorLog restore preview

Restore preview is separate from create-only import and user-approved merge. It
is for understanding what a trusted BehaviorLog backup would do before any
destructive restore can be considered.

Restore preview rules:

- Restore preview must use a dedicated restore resolver, not merge preview.
- Preview accepts validated BehaviorLog bundle files plus the current
  user-owned local graph needed for comparison.
- Preview is read-only for product data. It may persist an import-run ledger row
  with `import_mode = 'restore_preview'`, but it must not create, update,
  archive, delete, overwrite, deduplicate, schedule, send, cancel, or claim
  product records or reminders.
- Preview emits machine-readable create, replace, archive, delete, keep, and
  skip actions for behaviors, behavior schedule slots, occurrences, occurrence
  status events, inline occurrence notes, passive imported notes, and passive
  imported intervention-history records.
- Each action flags whether it is destructive. Replace, archive, and delete are
  destructive.
- Preview includes stable bundle, local-data, and preview fingerprints. A future
  restore apply must require the same preview fingerprint and refuse stale local
  data.
- BehaviorLog is behavior-data portability, not a full account image. Restore
  preview must state that auth identity, profile email, browser permissions,
  push subscriptions, provider accounts, provider secrets, and external
  provider state are not restored.
- JSONL is authoritative. CSV views are optional compatibility files and do not
  drive restore decisions.
- `status_events.jsonl` is authoritative for status history.
  `occurrences.jsonl.current_status` remains a current snapshot only.
- `unresolved` remains unresolved and must never be converted to
  `not_completed`.
- The default status-history policy is `preserve_append_only_history`.
  `replace_status_history` may appear only as a previewed future policy until a
  later ticket implements and verifies destructive apply behavior.
- High or restricted imported notes produce sensitivity warnings.
- Intervention preview keeps showing stored passive-history fields plus
  dropped/redacted sensitive fields. Restore preview must not write operational
  `reminder_deliveries` or call Sequenzy, Web Push, browser APIs, provider SDKs,
  or notification-processing routes.
- Unsupported schema versions, unsupported recurrence/schedule shapes, missing
  references, unknown core top-level fields, and records that cannot be safely
  mapped must produce validation errors or skip actions before any future apply
  can proceed.

### BehaviorLog restore apply

Restore apply is the destructive counterpart to restore preview and must consume
an accepted `restore_preview` run.

Restore apply rules:

- Apply requires an accepted restore preview snapshot stored on an import-run
  ledger row with `import_mode = 'restore_preview'`.
- Apply creates a separate `restore_apply` ledger row and records the accepted
  preview summary there before attempting writes.
- Apply requires all of the following server-side:
  - matching preview fingerprint,
  - matching local-data fingerprint,
  - matching accepted preview-run fingerprint fields,
  - typed confirmation `RESTORE`,
  - acknowledgement that the user created or downloaded a fresh backup,
  - high/restricted note acknowledgement when relevant,
  - no validation errors,
  - no skipped or unsupported restore actions.
- Apply refuses stale previews when local data has changed since preview.
- Apply uses a transaction-scoped database function for destructive product
  writes instead of a long multi-call Supabase client workflow.
- Apply preserves append-only status history by default. Status-history
  replacement remains a policy that must be present in the accepted preview
  before local status events can be deleted.
- Apply may archive, replace, or delete only records represented by the accepted
  restore contract. It must preserve user ownership and Supabase RLS boundaries.
- Apply may remove operational reminder deliveries only through normal
  dependency cascades from accepted occurrence deletes. It must not call
  Sequenzy, Web Push, browser APIs, provider SDKs, or notification-processing
  routes.
- Failed restore attempts mark the `restore_apply` run `failed` with a surfaced
  failure message. Because the destructive database work is executed by one
  database function call, partial failure should roll back inside the database
  transaction; errors before or after the function are reflected in the ledger.
- Applying the same accepted restore run is designed to be idempotent through
  deterministic core record ids and passive-history uniqueness on
  `import_run_id, external_id`.
- BehaviorLog external ids do not need to be database UUIDs. When an accepted
  create action has a non-UUID external id, such as Cadence schedule ids in the
  `sch_<uuid>` form, restore apply generates a deterministic local UUID for the
  product row, uses that UUID for child references, and writes a
  `behaviorlog_import_record_mappings` row preserving the original external id.

### Imported intervention promotion

Imported intervention promotion may convert selected passive
`imported_interventions` rows into operational `reminder_deliveries` rows only
after explicit user selection and confirmation. This workflow operates on
stored passive history, not raw bundle files or import preview output.

Eligible records must be future pending reminders that safely link to a current
active behavior and unresolved occurrence. The imported channel and scheduled
send time must match what Cadence's current reminder resolver would generate
from the behavior's present reminder settings. Historical, sent, failed,
cancelled, dismissed, ambiguous, unresolved-parent, resolved-occurrence,
inactive-behavior, disabled-channel, or mismatched-current-setting records stay
passive.

Promotion writes only `reminder_deliveries` rows with `import_run_id` and
`imported_intervention_id` provenance. It must use the normal
occurrence/channel/scheduled-send idempotence key, must not create duplicate
operational sends, and must not call Sequenzy, Web Push, browser APIs, provider
SDKs, or notification-processing routes.

## AI summary

Markdown-compatible plain text summary for a selected range.

The AI summary should be copyable and downloadable as `.md`.

Occurrence notes are omitted by default. When include-notes is selected, the
summary includes a compact `Notes` section keyed by local date, behavior,
schedule, and status.

Every Markdown summary also includes concise status-history guidance. Agents
must treat occurrence rows as current snapshots and use Full JSON
`status_events` or BehaviorLog `data/status_events.jsonl` for corrections,
late logging, decision chronology, and adherence-timing analysis. Compare
`recorded_at` with `effective_at` when present, and follow
`revises_event_id`; this timing context must not change Cadence's stored status
or default adherence calculation. Markdown guidance does not add a
status-history UI or new source-capture values.

Every Markdown summary also reports how many behavior definition events are
included for the exported behaviors and directs agents to Full JSON
`behavior_definition_events` or BehaviorLog
`raw/cadence/behavior_definition_events.jsonl`. Agents should use the ordered
previous/next definitions when a rename or description change affects how past
occurrences should be interpreted. The summary does not repeat the full
historical text and definition events do not alter occurrence status or
adherence calculations.

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

## Prompt library

The Export screen includes a UI-only library of static prompt templates after
the AI summary. Users copy a template into their own assistant together with an
export of the same range. The templates are not included in exported bundles,
the BehaviorLog manifest, or the AI summary.

Every status-touching template carries the occurrence-snapshot versus
`status_events` semantics and states that Unresolved is missing decision data,
not failure. Templates also state which export format and options provide any
optional notes, status events, behavior definition history, or intervention
data they require.

The screen includes this sensitivity disclosure: "Whatever the export
contains, including notes and historical definitions when those options are
selected, becomes visible to the assistant you paste it into."

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
- Full JSON includes sorted all-time behavior definition events for included
  behaviors with full previous/next text and canonical `changed_fields`.
- AI summary calculates adherence correctly.
- AI summary omits notes by default and includes a compact notes section when
  include-notes is selected.
- Unresolved occurrences are excluded from default adherence.
- BehaviorLog bundle includes required files, manifest hashes, schedules,
  occurrences, status events, and notes only when include-notes is selected and
  notes exist.
- BehaviorLog includes the optional hashed Cadence definition-history file as
  `required: false` with no core schema reference, while remaining valid in the
  upstream conformance harness and Cadence dry-run importer.
- Markdown reports definition-history presence and gives rename/description
  guidance without reproducing sensitive revision text.
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
- App-native and BehaviorLog CSV views prefix formula-leading user-controlled
  text projections with an apostrophe before standard CSV escaping while
  preserving signed machine-generated values such as UTC offsets.
- BehaviorLog Intervention Profile export emits reminder deliveries as optional
  `intervention` records, validates their references through the conformance
  harness, represents pending/sent/failed/cancelled statuses, lists and hashes
  `data/interventions.jsonl` in the manifest, and redacts sensitive transport
  details.
