begin;

do $$
begin
  if exists (
    select 1
    from public.behavior_schedule_slots as slot
    join public.behavior_schedules as schedule
      on schedule.user_id = slot.user_id
     and schedule.id = slot.behavior_schedule_id
    where slot.behavior_schedule_id is not null
      and slot.behavior_id <> schedule.behavior_id
  ) then
    raise exception 'Behavior schedule slots contain cross-Behavior schedule references.';
  end if;
end;
$$;

alter table public.behavior_schedules
  add constraint behavior_schedules_owner_behavior_id_key
  unique (user_id, behavior_id, id);

alter table public.behavior_schedule_slots
  add constraint behavior_schedule_slots_schedule_behavior_owner_fkey
  foreign key (user_id, behavior_id, behavior_schedule_id)
  references public.behavior_schedules(user_id, behavior_id, id)
  on delete cascade
  not valid;

alter table public.behavior_schedule_slots
  validate constraint behavior_schedule_slots_schedule_behavior_owner_fkey;

commit;
