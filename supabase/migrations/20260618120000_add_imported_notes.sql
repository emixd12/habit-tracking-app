create table public.imported_notes (
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
  constraint imported_notes_import_run_owner_fkey
    foreign key (user_id, import_run_id)
    references public.behaviorlog_import_runs(user_id, id)
    on delete cascade,
  constraint imported_notes_external_id_nonempty
    check (length(btrim(external_id)) > 0),
  constraint imported_notes_target_external_id_nonempty
    check (length(btrim(target_external_id)) > 0),
  constraint imported_notes_body_markdown_nonempty
    check (length(btrim(body_markdown)) > 0),
  constraint imported_notes_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index imported_notes_user_import_run_idx
  on public.imported_notes (user_id, import_run_id, created_at desc, id desc);

create index imported_notes_user_target_idx
  on public.imported_notes (user_id, target_type, target_local_id)
  where target_local_id is not null;

create index imported_notes_user_external_target_idx
  on public.imported_notes (user_id, target_type, target_external_id);

create trigger set_imported_notes_updated_at
  before update on public.imported_notes
  for each row execute function public.set_updated_at();

alter table public.imported_notes enable row level security;

create policy imported_notes_select_own
  on public.imported_notes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy imported_notes_insert_own
  on public.imported_notes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy imported_notes_update_own
  on public.imported_notes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy imported_notes_delete_own
  on public.imported_notes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all
  on table public.imported_notes
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.imported_notes
  to authenticated, service_role;
