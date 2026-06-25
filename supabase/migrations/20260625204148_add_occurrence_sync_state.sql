create table public.occurrence_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'America/New_York'
    check (char_length(timezone) > 0 and char_length(timezone) <= 128),
  last_synced_local_date date,
  synced_through_local_date date,
  last_successful_sync_at timestamptz,
  stale boolean not null default true,
  stale_reason text default 'never_synced',
  last_sync_behavior_count int not null default 0
    check (last_sync_behavior_count >= 0),
  last_sync_created_count int not null default 0
    check (last_sync_created_count >= 0),
  last_sync_updated_count int not null default 0
    check (last_sync_updated_count >= 0),
  last_sync_deleted_count int not null default 0
    check (last_sync_deleted_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint occurrence_sync_state_fresh_coverage_check
    check (
      stale
      or (
        stale_reason is null
        and last_synced_local_date is not null
        and synced_through_local_date is not null
        and synced_through_local_date >= last_synced_local_date
        and last_successful_sync_at is not null
      )
    )
);

create index occurrence_sync_state_stale_idx
  on public.occurrence_sync_state (user_id, stale);

create trigger set_occurrence_sync_state_updated_at
  before update on public.occurrence_sync_state
  for each row execute function public.set_updated_at();

alter table public.occurrence_sync_state enable row level security;

create policy occurrence_sync_state_select_own
  on public.occurrence_sync_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy occurrence_sync_state_insert_own
  on public.occurrence_sync_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy occurrence_sync_state_update_own
  on public.occurrence_sync_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy occurrence_sync_state_delete_own
  on public.occurrence_sync_state for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.occurrence_sync_state to authenticated;
