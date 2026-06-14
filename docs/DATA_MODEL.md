# Data Model

Use Supabase Postgres.

All user-owned tables must include `user_id`.

Exception: `profiles` uses `id` as the authenticated user's id (`auth.users.id`) instead of a separate `user_id`; its RLS ownership rule is `id = auth.uid()`.

All user-owned tables must have Row Level Security policies.

Use migrations for all schema changes.

Schema operations are CLI-first. Use `docs/SUPABASE_WORKFLOW.md` for local stack, migration, hosted deployment, and local/hosted congruence rules. Do not change the hosted database directly outside git-tracked migrations.

After schema changes, regenerate TypeScript database types from Supabase CLI output and commit them with the migration.

## Tables

### `profiles`

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `categories`

```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Default categories:
- Medical
- Grooming
- Fitness
- Food / Drink
- Home
- Measurements
- Admin
- Other

### `behaviors`

```sql
create table behaviors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,

  title text not null,
  description text,

  recurrence_rule jsonb not null,
  scheduled_time time not null,
  timezone text not null default 'America/New_York',

  browser_reminder_enabled boolean not null default true,
  email_reminder_enabled boolean not null default false,
  reminder_offset_minutes int not null default 0,

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
```

`scheduled_time` stores the first schedule slot start time for compatibility,
sorting, and simple summaries. The schedule source of truth is
`behavior_schedule_slots`.

### `behavior_schedule_slots`

```sql
create table behavior_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null references behaviors(id) on delete cascade,

  kind text not null check (kind in ('exact', 'range')),
  preset text check (preset in ('morning', 'afternoon', 'evening', 'night')),
  start_time time not null,
  end_time time,
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (behavior_id, start_time)
);
```

Supported range presets:

- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

Each behavior must have at least one schedule slot. A behavior can have multiple
slots in a day. Occurrence generation creates one occurrence per matching
schedule slot for each recurrence day.

### `occurrences`

```sql
create table occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null references behaviors(id) on delete cascade,
  behavior_schedule_slot_id uuid references behavior_schedule_slots(id) on delete set null,

  scheduled_for timestamptz not null,
  local_date date not null,
  schedule_kind text not null check (schedule_kind in ('exact', 'range')),
  schedule_preset text check (schedule_preset in ('morning', 'afternoon', 'evening', 'night')),
  schedule_start_time time not null,
  schedule_end_time time,

  status text not null default 'unresolved'
    check (status in ('unresolved', 'completed', 'not_completed')),

  completed_at timestamptz,
  status_marked_at timestamptz,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (behavior_id, scheduled_for),
  unique (user_id, id, behavior_id)
);
```

`status` is the current-status snapshot for fast Timeline, Analytics, and
app-native export reads. Status history is stored separately in
`occurrence_status_events`.

### `occurrence_status_events`

```sql
create table occurrence_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_id uuid not null,
  behavior_id uuid not null,

  previous_status text
    check (previous_status is null or previous_status in ('unresolved', 'completed', 'not_completed')),
  status text not null
    check (status in ('unresolved', 'completed', 'not_completed')),
  status_semantics text not null
    check (status_semantics in (
      'explicit_user_mark',
      'explicit_user_correction',
      'imported_explicit',
      'system_rule_declared',
      'ambiguous_import'
    )),

  recorded_at timestamptz not null,
  effective_at timestamptz,
  local_date date not null,
  timezone text not null default 'America/New_York',

  source_capture_method text not null default 'manual_tap'
    check (source_capture_method in (
      'manual_tap',
      'manual_text',
      'system_generated',
      'imported',
      'inferred',
      'derived',
      'ai_generated',
      'unknown'
    )),
  source_confidence text not null default 'high'
    check (source_confidence in (
      'high',
      'medium',
      'low',
      'ambiguous',
      'unknown'
    )),
  revises_event_id uuid,
  reason_code text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  foreign key (user_id, revises_event_id)
    references occurrence_status_events(user_id, id)
    on delete set null (revises_event_id),
  foreign key (user_id, occurrence_id, behavior_id)
    references occurrences(user_id, id, behavior_id)
    on delete cascade
);
```

This table is the internal append-only status history used for BehaviorLog
alignment. On first manual resolution, store `explicit_user_mark`. When a user
changes one resolved status to another, store `explicit_user_correction` and
link `revises_event_id` to the latest prior status event for that occurrence.

Backfilled rows for pre-event resolved occurrences use
`previous_status = 'unresolved'`, `status_semantics = 'explicit_user_mark'`,
`source_capture_method = 'manual_tap'`, and `source_confidence = 'high'`.

BehaviorLog import validation starts as a dry-run preview. The create-only core
import path may then insert clearly new behaviors, compatible schedule slots,
occurrences, and status events from a valid accepted preview with
`import_mode = 'create_missing_only'`.

Merge-preview import is also dry-run only. It may compare imported records
against local records and store the generated preview snapshot in
`behaviorlog_import_runs` with `import_mode = 'merge_preview'`, but it must not
insert, update, restore, overwrite, delete, deduplicate, or otherwise mutate
product records.

Create-only import rules:

- Use `behaviorlog_import_runs` as the auditable preview/apply ledger.
- Use `behaviorlog_import_record_mappings` to map external BehaviorLog ids to
  local Cadence ids for idempotence and provenance.
- Insert occurrences as `unresolved` first, then append imported
  `occurrence_status_events`, then update the occurrence current-status snapshot
  from the latest imported event for that occurrence.
- Treat `occurrences.jsonl.current_status` as a snapshot only. Do not synthesize
  explicit status history from the snapshot during import.
- Preserve `unresolved` as unresolved; do not convert silence into
  `not_completed`.
- Skip unsupported recurrence profiles or schedule windows with warnings.
- Do not merge, restore, overwrite, delete, or deduplicate local product records
  by mutation in create-only mode.
- Do not import notes, interventions, Context/Profile records, Analytics Profile
  records, optional CSV-only data, or provider side effects until a later ticket
  explicitly adds that write path.

Merge-preview rules:

- Emit user-reviewable deterministic actions: `create_new`,
  `map_to_existing`, `skip_existing`, and `conflict_requires_decision`.
- Use existing `behaviorlog_import_record_mappings` as provenance evidence when
  deciding whether an imported BehaviorLog id maps to a local record.
- Compare behaviors by mapped id, title/category identity, source original id,
  archive state, and compatible schedule shape.
- Compare schedules by mapped behavior, recurrence profile, recurrence payload,
  timezone, active dates, and exact-time or preset range slot shape.
- Compare occurrences by mapped behavior, mapped schedule, `scheduled_for_utc`,
  `local_date`, and timezone.
- Compare status events by mapped occurrence, external event id, recorded time,
  status, status semantics, and revision target.
- Keep `status_events.jsonl` authoritative over occurrence `current_status`
  snapshots. `unresolved` remains a valid unresolved state, not a failure.
- Treat status events as append-only history. Merge preview may identify an
  existing duplicate event, but future writes must not overwrite local history.
- Parse optional `data/notes.jsonl` and include note sensitivity/source metadata
  in preview details. Only occurrence-attached, non-AI notes can be planned for
  product import. Behavior, status-event, review, and AI-generated notes are
  skipped with warnings.
- High or restricted note sensitivity must produce a preview warning before any
  accepted plan can import that note body.
- Preview Intervention Profile records for user review only. Intervention and
  reminder-delivery writes belong to the intervention-import ticket.

User-approved merge apply rules:

- Apply only import runs with `import_mode = 'merge_by_user_approved_plan'`
  that contain an accepted Ticket 020 `mergePreview` snapshot in
  `dry_run_summary`.
- Refuse to apply while any accepted action remains
  `conflict_requires_decision`.
- For `create_new`, use the same create safeguards as create-only import:
  create compatible behaviors, schedule slots, and occurrences only when the
  validated plan can represent them in Cadence.
- For `map_to_existing`, write provenance mappings only. Do not overwrite local
  behavior, schedule, or occurrence fields except for the limited occurrence-note
  fill rules below.
- Append status events that are not already mapped or duplicated. Preserve
  `revises_event_id` when both the imported event and revision target have
  local mappings.
- Update occurrence current-status snapshots only after status events are
  appended and only when the imported event is the latest event by effective
  time, then recorded time, then stable id tie-breaker.
- Do not replace a local explicit high-confidence status decision with an
  ambiguous or lower-confidence imported status event.
- Applying the same accepted plan must be idempotent through
  `behaviorlog_import_record_mappings`.
- If apply fails after partial work, mark the import run `failed` with the
  failure message. Do not silently continue after inconsistent parent mappings.
- Occurrence-attached notes may fill `occurrences.note` only when the target
  occurrence has been created, mapped, or otherwise safely identified and the
  current local note is empty. The note mapping uses the target occurrence id as
  `local_id`.
- If the local occurrence note is non-empty and differs from the imported note,
  merge preview must emit `occurrence_note_conflict`; apply must not change it
  unless a later explicit merge-plan decision model is accepted.
- Note imports must not update occurrence status fields, status-event history,
  reminder deliveries, analytics inputs, or adherence logic.
- Do not write interventions, Context/Profile records, Analytics Profile records,
  optional CSV-only data, reminder deliveries, or provider side effects in this
  phase.

### `behaviorlog_import_runs`

```sql
create table behaviorlog_import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  bundle_format text not null,
  schema_version text,
  manifest_sha256 text,
  bundle_fingerprint text,

  producer_name text,
  producer_version text,
  subject_id_strategy text,
  privacy_redaction_level text,

  import_mode text not null
    check (
      import_mode in (
        'preview_only',
        'create_missing_only',
        'merge_preview',
        'merge_by_user_approved_plan'
      )
    ),
  dry_run_summary jsonb not null default '{}'::jsonb,
  status text not null default 'previewed'
    check (status in ('previewed', 'applied', 'failed', 'cancelled')),
  failure_message text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

This table is the auditable import ledger. It records BehaviorLog bundle and
schema metadata, manifest/fingerprint hashes, producer information, privacy
profile hints, the requested import mode, a dry-run summary snapshot, status,
and start/completion timestamps. It does not mean imported product records have
been written; `status = 'previewed'` only means the bundle was validated and
previewed.

### `behaviorlog_import_record_mappings`

```sql
create table behaviorlog_import_record_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_run_id uuid not null,

  record_type text not null
    check (
      record_type in (
        'behavior',
        'schedule',
        'occurrence',
        'status_event',
        'note',
        'intervention'
      )
    ),
  external_id text not null,
  local_id uuid not null,

  created_at timestamptz not null default now(),

  unique (import_run_id, record_type, external_id)
);
```

Mapping rows connect external BehaviorLog record ids to local Cadence ids for a
single import run. The unique constraint makes repeated mapping inserts
idempotent for the same run, record type, and external id. The table supports
behavior, schedule, occurrence, status event, note, and intervention mappings so
later import phases can share one provenance contract.

### `reminder_deliveries`

```sql
create table reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_id uuid not null references occurrences(id) on delete cascade,

  channel text not null check (channel in ('browser_push', 'email')),
  scheduled_send_at timestamptz not null,
  sent_at timestamptz,
  processing_started_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),

  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `push_subscriptions`

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  endpoint text not null,
  p256dh text not null,
  auth text not null,

  user_agent text,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `exports`

Optional. Only implement if useful for export history.

```sql
create table exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  export_type text not null check (export_type in ('jsonl', 'csv', 'json_backup', 'behaviorlog_bundle')),
  created_at timestamptz not null default now()
);
```

## RLS requirements

For every user-owned table:
- Select only where `user_id = auth.uid()`
- Insert only where `user_id = auth.uid()`
- Update only where `user_id = auth.uid()`
- Delete only where `user_id = auth.uid()`

Exception: `occurrence_status_events` is append-only for normal app code. It
allows authenticated select and insert for owned rows, but does not expose
authenticated update or delete policies. Database-level cascades may still
remove events when their owning occurrence is removed.

For `profiles`, use `id = auth.uid()` because the primary key is the authenticated user's id.

Normal app code should use the authenticated user context.

Do not expose the service-role key to client-side code.

## Behavior edits and occurrence preservation

When a behavior changes:
- Future unresolved occurrences may be regenerated.
- Past occurrences are preserved.
- Resolved occurrences are preserved.
- Archived behaviors generate no new occurrences.
- Occurrences preserve schedule snapshots so historical rows still display the
  time or range that existed when they were generated.

## Occurrence uniqueness

Use:

```sql
unique (behavior_id, scheduled_for)
unique (user_id, id, behavior_id)
```

Occurrence generation must be idempotent.

The `(user_id, id, behavior_id)` uniqueness constraint exists so status events
can enforce same-user ownership for their occurrence and behavior snapshot.
