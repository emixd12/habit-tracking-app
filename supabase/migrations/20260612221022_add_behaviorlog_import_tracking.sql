create table public.behaviorlog_import_runs (
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
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  constraint behaviorlog_import_runs_bundle_format_nonempty
    check (length(btrim(bundle_format)) > 0),
  constraint behaviorlog_import_runs_manifest_sha256_check
    check (
      manifest_sha256 is null
      or manifest_sha256 ~ '^[a-f0-9]{64}$'
    ),
  constraint behaviorlog_import_runs_bundle_fingerprint_check
    check (
      bundle_fingerprint is null
      or bundle_fingerprint ~ '^[a-f0-9]{64}$'
    ),
  constraint behaviorlog_import_runs_fingerprint_present_check
    check (manifest_sha256 is not null or bundle_fingerprint is not null),
  constraint behaviorlog_import_runs_dry_run_summary_object_check
    check (jsonb_typeof(dry_run_summary) = 'object')
);

create table public.behaviorlog_import_record_mappings (
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

  unique (user_id, id),
  unique (import_run_id, record_type, external_id),
  constraint behaviorlog_import_record_mappings_import_run_owner_fkey
    foreign key (user_id, import_run_id)
    references public.behaviorlog_import_runs(user_id, id)
    on delete cascade,
  constraint behaviorlog_import_record_mappings_external_id_nonempty
    check (length(btrim(external_id)) > 0)
);

create index behaviorlog_import_runs_user_started_idx
  on public.behaviorlog_import_runs (user_id, started_at desc, id desc);

create index behaviorlog_import_runs_user_status_idx
  on public.behaviorlog_import_runs (user_id, status, started_at desc);

create index behaviorlog_import_runs_user_bundle_fingerprint_idx
  on public.behaviorlog_import_runs (user_id, bundle_fingerprint)
  where bundle_fingerprint is not null;

create index behaviorlog_import_record_mappings_user_run_idx
  on public.behaviorlog_import_record_mappings (user_id, import_run_id);

create index behaviorlog_import_record_mappings_user_local_idx
  on public.behaviorlog_import_record_mappings (user_id, record_type, local_id);

create trigger set_behaviorlog_import_runs_updated_at
  before update on public.behaviorlog_import_runs
  for each row execute function public.set_updated_at();

alter table public.behaviorlog_import_runs enable row level security;
alter table public.behaviorlog_import_record_mappings enable row level security;

create policy behaviorlog_import_runs_select_own
  on public.behaviorlog_import_runs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy behaviorlog_import_runs_insert_own
  on public.behaviorlog_import_runs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy behaviorlog_import_runs_update_own
  on public.behaviorlog_import_runs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy behaviorlog_import_runs_delete_own
  on public.behaviorlog_import_runs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy behaviorlog_import_record_mappings_select_own
  on public.behaviorlog_import_record_mappings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy behaviorlog_import_record_mappings_insert_own
  on public.behaviorlog_import_record_mappings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy behaviorlog_import_record_mappings_update_own
  on public.behaviorlog_import_record_mappings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy behaviorlog_import_record_mappings_delete_own
  on public.behaviorlog_import_record_mappings for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all
  on table public.behaviorlog_import_runs
  from anon, authenticated, service_role;

revoke all
  on table public.behaviorlog_import_record_mappings
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.behaviorlog_import_runs
  to authenticated, service_role;

grant select, insert, update, delete
  on table public.behaviorlog_import_record_mappings
  to authenticated, service_role;
