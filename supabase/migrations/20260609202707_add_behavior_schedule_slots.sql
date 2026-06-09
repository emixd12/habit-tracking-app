create table public.behavior_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null references public.behaviors(id) on delete cascade,
  kind text not null check (kind in ('exact', 'range')),
  preset text check (preset in ('morning', 'afternoon', 'evening', 'night')),
  start_time time not null,
  end_time time,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (behavior_id, start_time),
  constraint behavior_schedule_slots_behavior_owner_fkey
    foreign key (user_id, behavior_id)
    references public.behaviors(user_id, id)
    on delete cascade,
  constraint behavior_schedule_slots_shape_check
    check (
      (
        kind = 'exact'
        and preset is null
        and end_time is null
      )
      or
      (
        kind = 'range'
        and preset is not null
        and end_time is not null
      )
    )
);

create index behavior_schedule_slots_behavior_sort_idx
  on public.behavior_schedule_slots (behavior_id, sort_order, start_time);

create index behavior_schedule_slots_user_behavior_idx
  on public.behavior_schedule_slots (user_id, behavior_id);

create trigger set_behavior_schedule_slots_updated_at
  before update on public.behavior_schedule_slots
  for each row execute function public.set_updated_at();

alter table public.behavior_schedule_slots enable row level security;

create policy behavior_schedule_slots_select_own
  on public.behavior_schedule_slots for select
  to authenticated
  using (user_id = auth.uid());

create policy behavior_schedule_slots_insert_own
  on public.behavior_schedule_slots for insert
  to authenticated
  with check (user_id = auth.uid());

create policy behavior_schedule_slots_update_own
  on public.behavior_schedule_slots for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy behavior_schedule_slots_delete_own
  on public.behavior_schedule_slots for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.behavior_schedule_slots to authenticated;

alter table public.occurrences
  add column behavior_schedule_slot_id uuid,
  add column schedule_kind text,
  add column schedule_preset text,
  add column schedule_start_time time,
  add column schedule_end_time time;

insert into public.behavior_schedule_slots (
  user_id,
  behavior_id,
  kind,
  preset,
  start_time,
  end_time,
  sort_order
)
select
  behaviors.user_id,
  behaviors.id,
  'exact',
  null,
  behaviors.scheduled_time,
  null,
  0
from public.behaviors
on conflict (behavior_id, start_time) do nothing;

update public.occurrences
set
  behavior_schedule_slot_id = schedule_slots.id,
  schedule_kind = 'exact',
  schedule_preset = null,
  schedule_start_time = behaviors.scheduled_time,
  schedule_end_time = null
from public.behaviors
join public.behavior_schedule_slots as schedule_slots
  on schedule_slots.behavior_id = behaviors.id
  and schedule_slots.start_time = behaviors.scheduled_time
where occurrences.behavior_id = behaviors.id;

alter table public.occurrences
  alter column schedule_kind set not null,
  alter column schedule_kind set default 'exact',
  alter column schedule_start_time set not null;

alter table public.occurrences
  add constraint occurrences_schedule_kind_check
    check (schedule_kind in ('exact', 'range')),
  add constraint occurrences_schedule_preset_check
    check (
      schedule_preset is null
      or schedule_preset in ('morning', 'afternoon', 'evening', 'night')
    ),
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
        and schedule_preset is not null
        and schedule_end_time is not null
      )
    ),
  add constraint occurrences_schedule_slot_owner_fkey
    foreign key (user_id, behavior_schedule_slot_id)
    references public.behavior_schedule_slots(user_id, id)
    on delete set null (behavior_schedule_slot_id);
