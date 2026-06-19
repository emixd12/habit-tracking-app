create table public.imported_interventions (
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
  source_capture_method text not null default 'unknown'
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
  source_confidence text not null default 'unknown'
    check (
      source_confidence in (
        'high',
        'medium',
        'low',
        'ambiguous',
        'unknown'
      )
    ),
  redacted_sensitivity_indicators jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  unique (import_run_id, external_id),
  constraint imported_interventions_import_run_owner_fkey
    foreign key (user_id, import_run_id)
    references public.behaviorlog_import_runs(user_id, id)
    on delete cascade,
  constraint imported_interventions_behavior_owner_fkey
    foreign key (user_id, behavior_id)
    references public.behaviors(user_id, id)
    on delete set null (behavior_id),
  constraint imported_interventions_occurrence_owner_fkey
    foreign key (user_id, occurrence_id)
    references public.occurrences(user_id, id)
    on delete set null (occurrence_id),
  constraint imported_interventions_external_id_nonempty
    check (length(btrim(external_id)) > 0),
  constraint imported_interventions_behavior_external_id_nonempty
    check (length(btrim(behavior_external_id)) > 0),
  constraint imported_interventions_occurrence_external_id_nonempty
    check (length(btrim(occurrence_external_id)) > 0),
  constraint imported_interventions_type_nonempty
    check (
      intervention_type is null
      or length(btrim(intervention_type)) > 0
    ),
  constraint imported_interventions_redaction_object_check
    check (jsonb_typeof(redacted_sensitivity_indicators) = 'object'),
  constraint imported_interventions_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index imported_interventions_user_import_run_idx
  on public.imported_interventions (user_id, import_run_id, created_at desc, id desc);

create index imported_interventions_user_behavior_idx
  on public.imported_interventions (user_id, behavior_id, scheduled_send_at desc)
  where behavior_id is not null;

create index imported_interventions_user_occurrence_idx
  on public.imported_interventions (user_id, occurrence_id, scheduled_send_at desc)
  where occurrence_id is not null;

create index imported_interventions_user_status_idx
  on public.imported_interventions (user_id, delivery_status, scheduled_send_at desc);

create trigger set_imported_interventions_updated_at
  before update on public.imported_interventions
  for each row execute function public.set_updated_at();

alter table public.imported_interventions enable row level security;

create policy imported_interventions_select_own
  on public.imported_interventions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy imported_interventions_insert_own
  on public.imported_interventions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy imported_interventions_update_own
  on public.imported_interventions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy imported_interventions_delete_own
  on public.imported_interventions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all
  on table public.imported_interventions
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.imported_interventions
  to authenticated, service_role;
