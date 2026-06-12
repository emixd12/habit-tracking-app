alter table public.occurrences
  add constraint occurrences_user_id_id_behavior_id_key
    unique (user_id, id, behavior_id);

create table public.occurrence_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_id uuid not null,
  behavior_id uuid not null,

  previous_status text
    check (
      previous_status is null
      or previous_status in ('unresolved', 'completed', 'not_completed')
    ),
  status text not null
    check (status in ('unresolved', 'completed', 'not_completed')),
  status_semantics text not null
    check (
      status_semantics in (
        'explicit_user_mark',
        'explicit_user_correction',
        'imported_explicit',
        'system_rule_declared',
        'ambiguous_import'
      )
    ),

  recorded_at timestamptz not null,
  effective_at timestamptz,
  local_date date not null,
  timezone text not null default 'America/New_York',

  source_capture_method text not null default 'manual_tap'
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
  source_confidence text not null default 'high'
    check (
      source_confidence in (
        'high',
        'medium',
        'low',
        'ambiguous',
        'unknown'
      )
    ),
  revises_event_id uuid,
  reason_code text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  constraint occurrence_status_events_revises_event_owner_fkey
    foreign key (user_id, revises_event_id)
    references public.occurrence_status_events(user_id, id)
    on delete set null (revises_event_id),
  constraint occurrence_status_events_occurrence_owner_fkey
    foreign key (user_id, occurrence_id, behavior_id)
    references public.occurrences(user_id, id, behavior_id)
    on delete cascade
);

create index occurrence_status_events_user_recorded_idx
  on public.occurrence_status_events (user_id, recorded_at, id);

create index occurrence_status_events_user_occurrence_recorded_idx
  on public.occurrence_status_events (user_id, occurrence_id, recorded_at, id);

create index occurrence_status_events_behavior_recorded_idx
  on public.occurrence_status_events (behavior_id, recorded_at, id);

create index occurrence_status_events_revises_event_id_idx
  on public.occurrence_status_events (revises_event_id)
  where revises_event_id is not null;

create trigger set_occurrence_status_events_updated_at
  before update on public.occurrence_status_events
  for each row execute function public.set_updated_at();

alter table public.occurrence_status_events enable row level security;

create policy occurrence_status_events_select_own
  on public.occurrence_status_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy occurrence_status_events_insert_own
  on public.occurrence_status_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.occurrence_status_events from authenticated;
grant select, insert on table public.occurrence_status_events to authenticated;

insert into public.occurrence_status_events (
  user_id,
  occurrence_id,
  behavior_id,
  previous_status,
  status,
  status_semantics,
  recorded_at,
  effective_at,
  local_date,
  timezone,
  source_capture_method,
  source_confidence
)
select
  occurrences.user_id,
  occurrences.id,
  occurrences.behavior_id,
  'unresolved',
  occurrences.status,
  'explicit_user_mark',
  coalesce(
    occurrences.status_marked_at,
    occurrences.completed_at,
    occurrences.updated_at,
    occurrences.created_at
  ),
  coalesce(occurrences.completed_at, occurrences.status_marked_at),
  occurrences.local_date,
  coalesce(behaviors.timezone, 'America/New_York'),
  'manual_tap',
  'high'
from public.occurrences
join public.behaviors
  on behaviors.id = occurrences.behavior_id
where occurrences.status in ('completed', 'not_completed');
