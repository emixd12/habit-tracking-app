create table public.behavior_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null references public.behaviors(id) on delete cascade,

  recurrence_rule jsonb not null,
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  constraint behavior_schedules_behavior_owner_fkey
    foreign key (user_id, behavior_id)
    references public.behaviors(user_id, id)
    on delete cascade
);

create index behavior_schedules_behavior_sort_idx
  on public.behavior_schedules (behavior_id, sort_order, id);

create index behavior_schedules_user_behavior_idx
  on public.behavior_schedules (user_id, behavior_id);

create trigger set_behavior_schedules_updated_at
  before update on public.behavior_schedules
  for each row execute function public.set_updated_at();

alter table public.behavior_schedules enable row level security;

create policy behavior_schedules_select_own
  on public.behavior_schedules for select
  to authenticated
  using (user_id = auth.uid());

create policy behavior_schedules_insert_own
  on public.behavior_schedules for insert
  to authenticated
  with check (user_id = auth.uid());

create policy behavior_schedules_update_own
  on public.behavior_schedules for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy behavior_schedules_delete_own
  on public.behavior_schedules for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.behavior_schedules to authenticated;

alter table public.behavior_schedule_slots
  add column behavior_schedule_id uuid;

alter table public.behavior_schedule_slots
  drop constraint if exists behavior_schedule_slots_shape_check;

alter table public.behavior_schedule_slots
  add constraint behavior_schedule_slots_shape_check
    check (
      (
        kind = 'exact'
        and preset is null
        and end_time is null
      )
      or
      (
        kind = 'range'
        and end_time is not null
      )
    );

alter table public.occurrences
  drop constraint if exists occurrences_schedule_snapshot_shape_check;

alter table public.occurrences
  add constraint occurrences_schedule_snapshot_shape_check
    check (
      (
        schedule_kind = 'exact'
        and schedule_preset is null
        and schedule_end_time is null
      )
      or
      (
        schedule_kind = 'range'
        and schedule_end_time is not null
      )
    );

insert into public.behavior_schedules (
  user_id,
  behavior_id,
  recurrence_rule,
  sort_order,
  created_at,
  updated_at
)
select
  behaviors.user_id,
  behaviors.id,
  behaviors.recurrence_rule,
  0,
  behaviors.created_at,
  behaviors.updated_at
from public.behaviors;

update public.behavior_schedule_slots
set behavior_schedule_id = behavior_schedules.id
from public.behavior_schedules
where behavior_schedule_slots.user_id = behavior_schedules.user_id
  and behavior_schedule_slots.behavior_id = behavior_schedules.behavior_id
  and behavior_schedules.sort_order = 0;

alter table public.behavior_schedule_slots
  add constraint behavior_schedule_slots_schedule_owner_fkey
    foreign key (user_id, behavior_schedule_id)
    references public.behavior_schedules(user_id, id)
    on delete cascade;

drop index if exists public.behavior_schedule_slots_behavior_sort_idx;

alter table public.behavior_schedule_slots
  drop constraint if exists behavior_schedule_slots_behavior_id_start_time_key;

create index behavior_schedule_slots_behavior_sort_idx
  on public.behavior_schedule_slots (
    behavior_id,
    behavior_schedule_id,
    sort_order,
    start_time
  );

create unique index behavior_schedule_slots_schedule_start_time_key
  on public.behavior_schedule_slots (behavior_schedule_id, start_time)
  where behavior_schedule_id is not null;

create unique index behavior_schedule_slots_legacy_behavior_start_time_key
  on public.behavior_schedule_slots (behavior_id, start_time)
  where behavior_schedule_id is null;
