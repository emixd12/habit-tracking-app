begin;

do $migration$
declare
  definition text;
  original text;
  corrected text;
  original_count integer;
  corrected_count integer;
begin
  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure)
  into definition;

  original := $patch$      if write_kind = 'occurrence' and write ->> 'operation' = 'delete'
        and stored_value ->> 'status' <> 'unresolved'
      then
        raise exception 'Resolved Occurrences are protected from synchronization deletion.' using errcode = 'P0001';
      end if;$patch$;
  corrected := $patch$      if write_kind = 'occurrence' and write ->> 'operation' = 'delete' then
        if stored_value ->> 'status' <> 'unresolved'
          or coalesce(btrim(stored_value ->> 'note'), '') <> ''
          or exists (
            select 1 from public.occurrence_status_events status_event
            where status_event.user_id = current_user_id and status_event.occurrence_id = row_id
          )
          or exists (
            select 1 from public.occurrence_time_sessions time_session
            where time_session.user_id = current_user_id and time_session.occurrence_id = row_id
          )
        then
          raise exception 'An Occurrence with a Note, status history, tracked time, or resolved status is protected from synchronization deletion.' using errcode = 'P0001';
        end if;
        if exists (
          select 1
          from public.reminder_deliveries delivery
          where delivery.user_id = current_user_id
            and delivery.occurrence_id = row_id
            and not exists (
              select 1
              from jsonb_array_elements(sync_payload #> '{plan,writes}') reminder_write
              where reminder_write ->> 'kind' = 'reminder_delivery'
                and reminder_write ->> 'id' = delivery.id::text
                and reminder_write ->> 'operation' = 'delete'
                and reminder_write #>> '{expected,occurrence_id}' = row_id::text
            )
        ) then
          raise exception 'Every attached reminder must be deleted with its Occurrence.' using errcode = 'P0001';
        end if;
      end if;

      if write_kind = 'reminder_delivery' then
        if write ->> 'operation' = 'delete' and not exists (
            select 1
            from jsonb_array_elements(sync_payload #> '{plan,writes}') occurrence_write
            where occurrence_write ->> 'kind' = 'occurrence'
              and occurrence_write ->> 'id' = write #>> '{expected,occurrence_id}'
              and occurrence_write ->> 'operation' = 'delete'
          )
        then
          raise exception 'A reminder can be deleted only with its Occurrence.' using errcode = 'P0001';
        elsif write ->> 'operation' = 'upsert' and exists (
            select 1
            from jsonb_array_elements(sync_payload #> '{plan,writes}') occurrence_write
            where occurrence_write ->> 'kind' = 'occurrence'
              and occurrence_write ->> 'id' = write #>> '{value,occurrence_id}'
              and occurrence_write ->> 'operation' = 'delete'
          )
        then
          raise exception 'A retained reminder must reference a retained Occurrence.' using errcode = 'P0001';
        end if;
      end if;$patch$;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    definition := replace(definition, original, corrected);
  elsif original_count <> 0 or corrected_count <> 1 then
    raise exception 'The account-sync Occurrence deletion guard changed unexpectedly.';
  end if;

  original := $patch$      if write_kind in (
        'behavior', 'import_run', 'imported_note',
        'imported_intervention', 'reminder_delivery'
      ) and write ->> 'operation' = 'delete' then$patch$;
  corrected := $patch$      if write_kind in (
        'behavior', 'import_run', 'imported_note', 'imported_intervention',
        'time_session'
      ) and write ->> 'operation' = 'delete' then$patch$;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    definition := replace(definition, original, corrected);
  elsif original_count <> 0 or corrected_count <> 1 then
    raise exception 'The account-sync protected-row guard changed unexpectedly.';
  end if;

  execute definition;
end
$migration$;

commit;
