# Data Model

Use Supabase Postgres.

The web app may support many independent accounts. It is still single-player
per account: no shared workspaces, no collaboration records, and no social data
model are in scope.

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

Default categories are seeded for convenience and remain user-owned. Public
launch should allow users to add categories and remove default categories once
category management is fully scoped.

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

`recurrence_rule` and `scheduled_time` store the first schedule's recurrence
and first time-entry start for compatibility, sorting, and simple summaries.
The schedule source of truth is `behavior_schedules` plus
`behavior_schedule_slots`.

`timezone` is copied from `profiles.timezone` when a behavior is created. When
the user saves a new timezone in Settings, active behaviors are updated to the
new timezone and future unresolved occurrences are resynced. Archived behavior
rows and past or resolved occurrence history remain historical records.

### `behavior_definition_events`

```sql
create table behavior_definition_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null,

  previous_title text,
  next_title text not null,
  previous_description text,
  next_description text,
  changed_fields text[] not null,

  recorded_at timestamptz not null,
  source text not null default 'manual'
    check (source in ('manual', 'import', 'system')),
  reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  foreign key (user_id, behavior_id)
    references behaviors(user_id, id)
    on delete cascade
);
```

`behavior_definition_events` is append-only history for behavior title and
description definitions. The first row is a baseline: `previous_title` and
`previous_description` are null, `next_*` holds the initial definition, and
`recorded_at` matches the behavior's `created_at`. Existing behaviors are
backfilled with `source = 'system'`; normal Behavior form creates and edits use
`source = 'manual'`. Create-only and approved-merge imports write an atomic
`source = 'import'` baseline for each newly created behavior. Restore writes a
`source = 'import'` baseline for a created behavior or a transition for a
replaced normalized definition.

`changed_fields` is ordered as title, then description. A baseline always
includes `title` and includes `description` only when the initial description
is non-null. The migration backfill preserves the exact stored baseline text;
it does not silently trim legacy rows. Later rows include only definition
fields whose trimmed values changed, while still preserving the complete
previous and next title and description values. Category, schedule, reminder,
archive, and timezone-only changes do not create definition events. `reason`
is schema-only in the Behavior form; import paths use `behaviorlog_import` or
`behaviorlog_restore` as machine-readable provenance.

Authenticated app clients may select and insert their own rows. They have no
update or delete policy or grant for this table. Database cascades still remove
events when the owning behavior or account is deleted.

Manual Behavior form writes use the owner-scoped `SECURITY INVOKER` functions
`create_behavior_with_definition_event` and
`update_behavior_with_definition_event` for every Behavior form update. The
service passes the pure resolver's optional event plan into the function; SQL
validates the exact stored predecessor, its normalized form, and the next
definition but does not calculate changed fields. Create or update and any
event insertion commit or roll back as one statement transaction. Definition
updates lock the owned current behavior row and reject a stale predecessor,
including no-op and schedule-only submissions. A null event plan must preserve
the exact stored title and description bytes, so canonical-equivalent tabs or
Unicode edge whitespace cannot be rewritten without history. Schedule
replacement remains a follow-on repository operation after that guard passes.

Create-only and approved-merge BehaviorLog imports use the same atomic create
function with `source = 'import'`, and preserve the imported behavior
`created_at` as the baseline `recorded_at`. The destructive restore wrapper
locks existing restored behaviors, requires a resolver-planned baseline for
every new behavior and a transition for every title/description overwrite,
then inserts those events in the same transaction as product rows, provenance
mappings, and the applied-run ledger.

### `behavior_schedules`

```sql
create table behavior_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null references behaviors(id) on delete cascade,

  recurrence_rule jsonb not null,
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id)
);
```

Each behavior has one or more schedules. A schedule owns one recurrence pattern
and one or more time entries. Legacy behavior rows without child schedules are
normalized at runtime to one schedule using `behaviors.recurrence_rule`,
`behaviors.scheduled_time`, and any legacy flat schedule slots.

### `behavior_schedule_slots`

```sql
create table behavior_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null references behaviors(id) on delete cascade,
  behavior_schedule_id uuid,

  kind text not null check (kind in ('exact', 'range')),
  preset text check (preset is null or preset in ('morning', 'afternoon', 'evening', 'night')),
  start_time time not null,
  end_time time,
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  constraint behavior_schedule_slots_schedule_owner_fkey
    foreign key (user_id, behavior_schedule_id)
    references behavior_schedules(user_id, id)
    on delete cascade
);
```

Supported range presets:

- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

Each schedule must have at least one time entry. A behavior can have multiple
schedules and multiple time entries per schedule. A nullable
`behavior_schedule_id` preserves legacy/import paths that only know flat
behavior-level slots; new writes should set it. Occurrence generation creates
one occurrence per matching schedule time entry, then merges duplicate
generated occurrences with the same behavior, local date, start time, and
end-time/range identity.

Current uniqueness is enforced with partial indexes:

- `(behavior_schedule_id, start_time)` where `behavior_schedule_id is not null`
- `(behavior_id, start_time)` where `behavior_schedule_id is null`

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

### `occurrence_sync_state`

```sql
create table occurrence_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,

  timezone text not null default 'America/New_York',
  last_synced_local_date date,
  synced_through_local_date date,
  last_successful_sync_at timestamptz,

  stale boolean not null default true,
  stale_reason text default 'never_synced',

  last_sync_behavior_count int not null default 0,
  last_sync_created_count int not null default 0,
  last_sync_updated_count int not null default 0,
  last_sync_deleted_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`occurrence_sync_state` is a per-user freshness contract for generated
occurrence rows. Write paths mark it stale when behavior schedules, account
timezone, or import/restore flows can affect generated occurrences. A successful
account occurrence sync marks it fresh with the local-date horizon that was
covered and aggregate counts for observability. Read routes still run the
existing sync until the freshness-aware route work is implemented.

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

Normal authenticated manual status changes call the owner-scoped
`public.apply_occurrence_status_transition(...)` database function. The
function locks the occurrence, compares both the current status and latest
status-event id with the service's resolver-planned predecessor, updates the
current snapshot, inserts exactly one event, and cancels pending reminders for
a newly resolved snapshot in the same statement transaction. Corrections use
the locked latest event as `revises_event_id` when one exists. A repeated tap
of an already-current resolved status is an idempotent no-op; an ABA-stale or
otherwise competing plan is rejected instead of creating a broken correction
chain. Note-only writes do not use this function and do not alter status
timestamps or history.

Do not backfill an absent internal event for a legacy resolved snapshot because
the snapshot cannot prove a manual action or high-confidence provenance. The
BehaviorLog exporter may instead emit a derived, medium-confidence event at
export time so the snapshot remains interoperable without changing internal
history.

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
- Import non-AI `data/notes.jsonl` records into `imported_notes` when their
  behavior, occurrence, status-event, or review attachment can be represented.
  Occurrence-attached notes may also fill `occurrences.note` only when the
  imported occurrence is safely identified and the current local note is empty.
- Import `data/interventions.jsonl` records into `imported_interventions` as
  passive delivery history. Store external behavior/occurrence ids and local
  behavior/occurrence ids when safely known. Drop or redact sensitive transport
  fields before storage.
- Do not import Context/Profile records, Analytics Profile records, optional
  CSV-only data, reminder deliveries, or provider side effects until a later
  ticket explicitly adds that write path.

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
- Parse optional `data/notes.jsonl` and include note role,
  sensitivity/source metadata, source original id, timestamps, attachment
  target, and storage decision details in preview output.
- Non-AI behavior, occurrence, status-event, and review notes may be planned as
  passive `imported_notes` rows. AI-generated notes are skipped with warnings.
- Occurrence-attached, non-AI notes may additionally plan an inline
  `occurrences.note` fill only when the target occurrence is safely identified
  and the current local note is empty. Conflicting occurrence notes are stored
  as passive imported notes and do not replace the local note.
- High or restricted note sensitivity must produce a preview warning and require
  explicit privacy acknowledgement before any accepted plan can import that note
  body.
- Preview Intervention Profile records with the passive history fields that
  will be stored and the sensitive delivery fields that will be dropped or
  redacted. Intervention merge actions may plan `imported_interventions` rows,
  but must not plan operational reminder deliveries.

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
- Note mappings use the imported note row id as `local_id`, not the attachment
  target id. This preserves provenance for behavior, occurrence, status-event,
  and review notes with one mapping contract.
- Occurrence-attached notes may fill `occurrences.note` only when the target
  occurrence has been created, mapped, or otherwise safely identified and the
  current local note is empty.
- If the local occurrence note is non-empty and differs from the imported note,
  apply still stores the passive imported note row but must not change
  `occurrences.note` unless a later explicit note-replacement decision model is
  accepted.
- Note imports must not update occurrence status fields, status-event history,
  reminder deliveries, analytics inputs, or adherence logic.
- Accepted intervention actions store passive `imported_interventions` rows and
  provenance mappings. They must not write `reminder_deliveries`, schedule,
  send, cancel, retry, claim reminders, or call providers.
- Do not write Context/Profile records, Analytics Profile records, optional
  CSV-only data, reminder deliveries, or provider side effects in this phase.

### `behaviorlog_import_runs`

```sql
create table behaviorlog_import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  bundle_format text not null,
  schema_version text,
  manifest_sha256 text,
  bundle_fingerprint text,
  accepted_preview_run_id uuid,
  accepted_preview_fingerprint text,

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
        'merge_by_user_approved_plan',
        'restore_preview',
        'restore_apply'
      )
    ),
  dry_run_summary jsonb not null default '{}'::jsonb,
  status text not null default 'previewed'
    check (status in ('previewed', 'applied', 'failed', 'cancelled')),
  failure_message text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  foreign key (user_id, accepted_preview_run_id)
    references behaviorlog_import_runs(user_id, id)
    on delete restrict
);
```

This table is the auditable import ledger. It records BehaviorLog bundle and
schema metadata, manifest/fingerprint hashes, producer information, privacy
profile hints, the requested import mode, a dry-run summary snapshot, status,
and start/completion timestamps. It does not mean imported product records have
been written; `status = 'previewed'` only means the bundle was validated and
previewed.

`merge_preview` rows store the accepted bundle fingerprint, local-data
fingerprint, and combined preview fingerprint in `dry_run_summary`. A
create-only or user-approved merge apply must reference one persisted, accepted
`merge_preview` row through `accepted_preview_run_id` and retain that row's
combined preview fingerprint in `accepted_preview_fingerprint`. Before writing,
the service rechecks the submitted bundle and current local graph against all
three accepted fingerprints. It rejects unaccepted preview data, a missing or
mismatched preview run, an altered bundle, changed local data, or a recomputed
preview that no longer matches. The applied ledger row therefore preserves the
auditable relationship to the exact reviewed preview without storing raw bundle
contents.

`restore_preview` rows are read-only restore previews. Their `dry_run_summary`
stores the restore preview fingerprint, local-data fingerprint, bundle
fingerprint, non-restorable account/provider/browser fields, destructive action
counts, sensitivity warnings, status-history policy planning, and
machine-readable create/replace/archive/delete/keep/skip actions. A
`restore_preview` row must not imply product records were restored.

BehaviorLog restore preview is behavior-data portability only. It can preview
destructive changes to behaviors, schedule slots, occurrences, status events,
inline occurrence notes, passive imported notes, and passive imported
intervention history, but it does not restore auth identity, profile email,
browser permissions, push subscriptions, provider accounts, provider secrets, or
external provider state.

Destructive restore apply uses `import_mode = 'restore_apply'` and requires a
previous accepted `restore_preview` snapshot. The service must require a
matching preview fingerprint, matching local-data fingerprint, explicit typed
confirmation, a fresh-backup acknowledgement, high/restricted note
acknowledgement when relevant, and stale-preview refusal before any archive,
replace, or delete operation is allowed.

Restore apply uses the transaction-scoped
`public.apply_behaviorlog_restore(restore_payload jsonb)` database function.
The function runs under the authenticated user context, filters every archive,
delete, update, and insert by `auth.uid()`, and applies the prepared restore
payload in dependency order. This keeps destructive restore atomic at the
database statement/function boundary instead of using a long multi-call client
workflow. The function is callable by the `authenticated` role only, not
`anon`, and it keeps behavior upserts keyed by the Behavior `id` primary key.
Internal trigger helpers such as `public.handle_new_user()` and
`public.set_updated_at()` are not directly executable by app roles.

The restore payload may archive behaviors absent from the bundle, delete local
schedule slots, occurrences, status events when a replacement policy is
explicitly selected, inline occurrence notes, passive imported notes, and
passive imported interventions according to the accepted preview. It may upsert
BehaviorLog-represented behaviors, schedule slots, occurrences,
occurrence-status events, passive imported notes, and passive imported
interventions. It must not restore auth identity, profile email, browser
permissions, push subscriptions, provider accounts, provider secrets, or
external provider state. It must not call notification providers or processing
routes.

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
later import phases can share one provenance contract. External ids are
BehaviorLog ids and may be non-UUID values; restore apply may map ids such as
`sch_<uuid>` to deterministic local UUID schedule-slot ids while preserving the
original external id here.

### `imported_notes`

```sql
create table imported_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_run_id uuid not null,
  external_id text not null,

  target_type text not null
    check (target_type in ('behavior', 'occurrence', 'status_event', 'review')),
  target_external_id text not null,
  target_local_id uuid,

  body_markdown text not null,
  note_role text not null
    check (note_role in ('user', 'imported', 'system', 'ai_generated')),
  sensitivity text
    check (
      sensitivity is null
      or sensitivity in ('low', 'medium', 'high', 'restricted')
  ),
  source_original_id text,
  source_capture_method text not null
    check (
      source_capture_method in (
        'manual_tap',
        'manual_text',
        'system_generated',
        'imported',
        'inferred',
        'derived',
        'ai_generated',
        'unknown'
      )
    ),
  source_confidence text not null
    check (
      source_confidence in (
        'high',
        'medium',
        'low',
        'ambiguous',
        'unknown'
      )
    ),
  imported_created_at timestamptz not null,
  imported_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  unique (import_run_id, external_id),
  foreign key (user_id, import_run_id)
    references behaviorlog_import_runs(user_id, id)
    on delete cascade
);
```

`imported_notes` stores passive BehaviorLog note context for behavior,
occurrence, status-event, and review attachments. `target_local_id` points to
the local behavior, occurrence, or status-event row when one is safely known;
review notes may have no local target. Because the attachment is polymorphic,
the application service must only set `target_local_id` from resolver-approved
mappings and must not use notes for status, adherence, reminder, or analytics
calculations. Note mappings in `behaviorlog_import_record_mappings` point to
`imported_notes.id`.

High and restricted sensitivity notes are allowed only after preview warnings
and explicit apply acknowledgement. AI-generated notes are skipped in v1.

### `imported_interventions`

```sql
create table imported_interventions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_run_id uuid not null,
  external_id text not null,

  behavior_external_id text not null,
  occurrence_external_id text not null,
  behavior_id uuid,
  occurrence_id uuid,

  intervention_type text,
  channel text not null check (channel in ('browser_push', 'email')),
  delivery_status text not null
    check (delivery_status in ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_send_at timestamptz not null,
  sent_at timestamptz,
  failure_reason text,

  source_original_id text,
  source_capture_method text not null,
  source_confidence text not null,
  redacted_sensitivity_indicators jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  unique (import_run_id, external_id),
  foreign key (user_id, import_run_id)
    references behaviorlog_import_runs(user_id, id)
    on delete cascade,
  foreign key (user_id, behavior_id)
    references behaviors(user_id, id)
    on delete set null (behavior_id),
  foreign key (user_id, occurrence_id)
    references occurrences(user_id, id)
    on delete set null (occurrence_id)
);
```

`imported_interventions` stores passive BehaviorLog Intervention Profile
history. It records the BehaviorLog intervention id, external behavior and
occurrence ids, local behavior and occurrence ids when known, intervention type,
channel, delivery status, scheduled/sent timestamps, sanitized failure reason,
source metadata, and redaction indicators. It must not contain raw provider
secrets, raw push endpoints, subscription keys, recipient identifiers, message
bodies, or raw provider payloads.

Rows are provenance and review context only. They do not create, schedule,
send, cancel, retry, claim, or otherwise mutate operational
`reminder_deliveries`. Intervention mappings in
`behaviorlog_import_record_mappings` point to `imported_interventions.id` and
make repeated accepted applies idempotent.

Imported intervention promotion is a separate opt-in workflow. It may convert
selected future pending reminder interventions into operational
`reminder_deliveries` only after explicit user selection and confirmation.
The promotion workflow must leave sent, failed, cancelled, dismissed, past,
ambiguous, unresolved-parent, resolved-occurrence, inactive-behavior,
disabled-channel, and current-setting-mismatched intervention rows as passive
history.

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
  import_run_id uuid,
  imported_intervention_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),

  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`import_run_id` and `imported_intervention_id` are nullable provenance fields
used only for explicit imported-intervention promotion. App-generated reminder
deliveries keep both fields null. Promoted deliveries must set both fields and
must still satisfy the normal idempotence key
`(occurrence_id, channel, scheduled_send_at)`, so promotion cannot create a
second operational delivery for the same occurrence/channel/send time.

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

### Account deletion

Public launch includes an account deletion path from Settings. The current
implementation requires an export acknowledgement and typed confirmation, signs
out the current Supabase session globally, then uses a server-only Supabase
service-role client to delete the authenticated `auth.users` row.

Deletion removes user-owned hosted records through the existing `on delete
cascade` ownership graph. Until a detailed retention policy is adopted, the
product posture is:

- retain user data while the account exists,
- delete user-owned records on account deletion,
- do not expose routine admin access to user behavior content,
- avoid sending sensitive behavior content to monitoring tools.

The first public-launch monitoring implementation reports privacy-safe
structured runtime events only. Monitoring context may include route names,
methods, coarse event names, and numeric counts. It must not include behavior
titles, behavior descriptions, occurrence notes, account emails, raw push
endpoints, subscription keys, provider secrets, tokens, request bodies, uploaded
BehaviorLog bundles, or reminder message bodies.

## RLS requirements

For every user-owned table:

- Select only where `user_id = auth.uid()`
- Insert only where `user_id = auth.uid()`
- Update only where `user_id = auth.uid()`
- Delete only where `user_id = auth.uid()`

Exceptions: `occurrence_status_events` and `behavior_definition_events` are
append-only for normal app code. They allow authenticated select and insert for
owned rows, but do not expose authenticated update or delete policies.
Database-level cascades may still remove events when their owning occurrence or
behavior is removed.

For `profiles`, use `id = auth.uid()` because the primary key is the authenticated user's id.

Normal app code should use the authenticated user context.

Do not expose the service-role key to client-side code.

Service-role access is reserved for narrow server-only maintenance,
scheduled-processing, or deletion workflows. It must not become the normal path
for user-facing reads or writes.

## Abuse and public-product protections

Before broad public launch, add standard protections around sensitive routes
and account creation:

- provider-level auth abuse protection where available,
- route/action validation for all mutations,
- practical rate limiting for public or secret-protected endpoints,
- a static RLS policy registry test covering every user-owned table,
- a repeatable multi-user RLS smoke command for local or hosted Supabase,
- monitoring that avoids sensitive behavior payloads,
- clear secret ownership for Supabase, Sequenzy, VAPID, and cron/process
  secrets.

Run `npm run smoke:rls` against the intended Supabase target when performing
hosted many-independent-user QA. The command creates two temporary auth users
with service-role access for setup and cleanup, then signs in through ordinary
publishable-key clients to verify that one user cannot read, insert, or update
another user's profile/category/behavior rows.

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

## Database functions

### `public.get_export_page_read_bundle(range_start_local_date date, range_end_local_date date)`

Ticket 043 adds a narrow Export-page read RPC to reduce repeated authenticated
Data API round trips. It returns one JSON bundle containing:

- profile timezone,
- occurrence sync state,
- categories,
- behaviors with category labels and schedule slots,
- occurrences in the selected export range,
- status events attached to those occurrences,
- reminder deliveries attached to those occurrences.

The function is `SECURITY INVOKER`, sets `search_path = public`, and filters
all user-owned rows to `(select auth.uid())`. It is executable by
`authenticated` only; `public` and `anon` execute privileges are revoked.

Export range resolution, occurrence freshness decisions, export formatting,
BehaviorLog bundle creation, and adherence math remain in TypeScript
services/resolvers. The RPC is a page-specific read bundle, not a generic data
access layer.

## Authenticated read cache

Ticket 044 adds a small server-side read-through cache for low-volatility
authenticated data. Cache keys include the authenticated `userId`, a bucket
name, and an optional variant such as an import-run limit. Keys must not include
emails, provider tokens, secrets, request bodies, behavior text, occurrence
notes, or push subscription material.

Cached buckets:

- `profile_timezone`
- `profile_settings`
- `behavior_list`
- `category_list`
- `behaviorlog_import_runs`

Cache misses still read through the ordinary authenticated Supabase client and
RLS. The cache does not use service-role access for normal app reads.

Invalidation is explicit:

- behavior create/update/archive/restore invalidates behavior/category/timezone
  read buckets,
- Settings timezone changes invalidate profile and behavior buckets,
- BehaviorLog import/restore previews and status updates invalidate import-run
  buckets,
- BehaviorLog import/restore applies invalidate behavior/category buckets,
- account deletion clears all cached buckets for the deleted user.

Occurrence rows, occurrence status events, reminder deliveries, push
subscriptions, and account deletion authorization data remain uncached.
