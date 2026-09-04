begin;

-- Restore the intentional UPDATE OF contract for restore and generation writes.
create or replace function cadence_private.clear_occurrence_configuration_lineage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.behavior_configuration_event_id := null;
  return new;
end;
$$;

-- Status-only account-sync upserts must not name unchanged scheduling columns.
do $$
declare
  definition text;
  original text := $patch$    where attribute.attrelid = table_name::regclass and attribute.attnum > 0
      and not attribute.attisdropped and attribute.attgenerated = '' and attribute.attname <> 'id';$patch$;
  corrected text := $patch$    where attribute.attrelid = table_name::regclass and attribute.attnum > 0
      and not attribute.attisdropped and attribute.attgenerated = '' and attribute.attname <> 'id'
      and (write_kind <> 'occurrence'
        or attribute.attname not in ('behavior_id', 'behavior_schedule_slot_id', 'scheduled_for', 'local_date', 'schedule_kind', 'schedule_preset', 'schedule_start_time', 'schedule_end_time')
        or write -> 'expected' -> attribute.attname is distinct from write -> 'value' -> attribute.attname);$patch$;
  original_count integer;
  corrected_count integer;
begin
  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    execute replace(definition, original, corrected);
  elsif original_count = 0 and corrected_count = 1 then
    null;
  else
    raise exception 'The account-sync occurrence update-column filter changed unexpectedly.';
  end if;
end
$$;

commit;
