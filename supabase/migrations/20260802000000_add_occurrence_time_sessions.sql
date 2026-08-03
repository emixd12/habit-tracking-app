create table public.occurrence_time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_id uuid not null,
  behavior_id uuid not null,
  started_at timestamptz not null,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint occurrence_time_sessions_stopped_at_check
    check (stopped_at is null or stopped_at >= started_at),
  constraint occurrence_time_sessions_occurrence_owner_fkey
    foreign key (user_id, occurrence_id, behavior_id)
    references public.occurrences(user_id, id, behavior_id)
    on delete cascade
);

create unique index occurrence_time_sessions_one_running_per_occurrence_idx
  on public.occurrence_time_sessions (user_id, occurrence_id)
  where stopped_at is null;

create index occurrence_time_sessions_user_occurrence_started_idx
  on public.occurrence_time_sessions (user_id, occurrence_id, started_at desc, id desc);

create index occurrence_time_sessions_user_behavior_started_idx
  on public.occurrence_time_sessions (user_id, behavior_id, started_at desc, id desc);

create trigger set_occurrence_time_sessions_updated_at
  before update on public.occurrence_time_sessions
  for each row execute function public.set_updated_at();

alter table public.occurrence_time_sessions enable row level security;

create policy occurrence_time_sessions_select_own
  on public.occurrence_time_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy occurrence_time_sessions_insert_own
  on public.occurrence_time_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy occurrence_time_sessions_update_own
  on public.occurrence_time_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy occurrence_time_sessions_delete_own
  on public.occurrence_time_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.occurrence_time_sessions from authenticated;
grant select, insert, update, delete on table public.occurrence_time_sessions to authenticated;
