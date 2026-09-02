begin;

-- Full-row account-sync upserts must not clear unchanged occurrence lineage.
create or replace function cadence_private.clear_occurrence_configuration_lineage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.behavior_id, new.behavior_schedule_slot_id, new.scheduled_for,
      new.local_date, new.schedule_kind, new.schedule_preset,
      new.schedule_start_time, new.schedule_end_time)
    is distinct from
     (old.behavior_id, old.behavior_schedule_slot_id, old.scheduled_for,
      old.local_date, old.schedule_kind, old.schedule_preset,
      old.schedule_start_time, old.schedule_end_time)
  then
    new.behavior_configuration_event_id := null;
  end if;
  return new;
end;
$$;

commit;
