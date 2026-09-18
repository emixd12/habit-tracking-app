begin;

alter table public.behaviors
  add column default_duration_minutes integer
    check (default_duration_minutes between 1 and 1440),
  add column end_date date
    check (end_date between date '0001-01-01' and date '9999-12-31'),
  add column auto_archived_at timestamptz,
  add constraint behaviors_auto_archive_marker_valid
    check (
      auto_archived_at is null
      or (isfinite(auto_archived_at) and not active and archived_at is not null)
    );

-- Patch the established atomic writers and bounded read projections without
-- changing their public signatures.
do $migration$
declare definition text; anchor text; delete_start integer;
begin
  select pg_get_functiondef('public.create_behavior_with_schedule_graph(jsonb,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  anchor := E'    archive_notes,\n    created_at,';
  if position(anchor in definition) = 0 then raise exception 'Behavior create columns changed unexpectedly.'; end if;
  definition := replace(definition, anchor, E'    archive_notes,\n    default_duration_minutes,\n    end_date,\n    auto_archived_at,\n    created_at,');
  anchor := $a$    coalesce(behavior_payload -> 'archive_notes', '[]'::jsonb),$a$;
  if position(anchor in definition) = 0 then raise exception 'Behavior create values changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$
    nullif(behavior_payload ->> 'default_duration_minutes', '')::integer,
    nullif(behavior_payload ->> 'end_date', '')::date,
    nullif(behavior_payload ->> 'auto_archived_at', '')::timestamptz,$patch$);

  select pg_get_functiondef('public.update_behavior_with_schedule_graph(uuid,jsonb,jsonb,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  anchor := $a$    archive_notes = coalesce(behavior_payload -> 'archive_notes', current_behavior.archive_notes)$a$;
  if position(anchor in definition) = 0 then raise exception 'Behavior update changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$,
    default_duration_minutes = case when behavior_payload ? 'default_duration_minutes'
      then nullif(behavior_payload ->> 'default_duration_minutes', '')::integer
      else current_behavior.default_duration_minutes end,
    end_date = case when behavior_payload ? 'end_date'
      then nullif(behavior_payload ->> 'end_date', '')::date
      else current_behavior.end_date end,
    auto_archived_at = case when behavior_payload ? 'auto_archived_at'
      then nullif(behavior_payload ->> 'auto_archived_at', '')::timestamptz
      else current_behavior.auto_archived_at end$patch$);

  select pg_get_functiondef('public.get_export_page_read_bundle(date,date)'::regprocedure) into definition;
  anchor := $a$            'archive_notes', b.archive_notes,$a$;
  if position(anchor in definition) = 0 then raise exception 'Export projection changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$
            'default_duration_minutes', b.default_duration_minutes,
            'end_date', b.end_date,
            'auto_archived_at', b.auto_archived_at,$patch$);

  select pg_get_functiondef('cadence_private.apply_behaviorlog_import(jsonb)'::regprocedure) into definition;
  anchor := 'active, archived_at,';
  if position(anchor in definition) = 0 then raise exception 'Import columns changed unexpectedly.'; end if;
  definition := replace(definition, anchor, 'active, default_duration_minutes, end_date, auto_archived_at, archived_at,');
  anchor := $a$        nullif(row_value ->> 'archivedAtUtc', '')::timestamptz,$a$;
  if position(anchor in definition) = 0 then raise exception 'Import values changed unexpectedly.'; end if;
  execute replace(definition, anchor, $patch$        nullif(row_value ->> 'expectedDurationMinutes', '')::integer,
        nullif(row_value ->> 'cadenceEndDate', '')::date,
        nullif(row_value ->> 'cadenceAutoArchivedAt', '')::timestamptz,
$patch$ || anchor);

  select pg_get_functiondef('public.apply_behaviorlog_restore_product_writes(jsonb)'::regprocedure) into definition;
  anchor := E'    active,\n    archived_at,\n    archive_notes,';
  if position(anchor in definition) = 0 then raise exception 'Restore columns changed unexpectedly.'; end if;
  definition := replace(definition, anchor, E'    active,\n    default_duration_minutes,\n    end_date,\n    auto_archived_at,\n    archived_at,\n    archive_notes,');
  anchor := $a$    nullif(row ->> 'archived_at', '')::timestamptz,$a$;
  if position(anchor in definition) = 0 then raise exception 'Restore values changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$    nullif(row ->> 'default_duration_minutes', '')::integer,
    nullif(row ->> 'end_date', '')::date,
    nullif(row ->> 'auto_archived_at', '')::timestamptz,
$patch$ || anchor);
  anchor := '    archived_at = excluded.archived_at,';
  if position(anchor in definition) = 0 then raise exception 'Restore update changed unexpectedly.'; end if;
  execute replace(definition, anchor, $patch$    default_duration_minutes = case when exists (
      select 1 from jsonb_array_elements(restore_payload -> 'behaviors') source
      where source ->> 'id' = excluded.id::text and source ? 'default_duration_minutes'
    ) then excluded.default_duration_minutes else public.behaviors.default_duration_minutes end,
    end_date = case
      when excluded.active and not public.behaviors.active
        and coalesce(excluded.end_date, public.behaviors.end_date) <=
          (clock_timestamp() at time zone excluded.timezone)::date then null
      when exists (
      select 1 from jsonb_array_elements(restore_payload -> 'behaviors') source
      where source ->> 'id' = excluded.id::text and source ? 'end_date'
    ) then excluded.end_date else public.behaviors.end_date end,
    auto_archived_at = case when excluded.active then null when exists (
      select 1 from jsonb_array_elements(restore_payload -> 'behaviors') source
      where source ->> 'id' = excluded.id::text and source ? 'auto_archived_at'
    ) then excluded.auto_archived_at else public.behaviors.auto_archived_at end,
$patch$ || anchor);

  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;
  anchor := $a$    write_value := (write -> 'value') || jsonb_build_object('user_id', current_user_id);$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync changed unexpectedly.'; end if;
  execute replace(definition, anchor, $patch$    if write_kind = 'behavior' and not ((write -> 'value') ?& array[
      'default_duration_minutes', 'end_date', 'auto_archived_at'
    ]) then
      raise exception 'Update Cadence before synchronizing Behavior changes.' using errcode = '22023';
    end if;
$patch$ || anchor);
  -- Keep past-row protection except for bare generated rows excluded by the end date.
  select pg_get_functiondef('public.apply_occurrence_generation_plan(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  anchor := '  insert into public.occurrences (';
  if position(anchor in definition) = 0 then raise exception 'Occurrence insert anchor changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$  -- The Behavior row is already locked. Planning metadata can change without
  -- changing the legacy configuration snapshot, so validate the live boundary.
  if exists (
    select 1 from public.behaviors as behavior
    cross join jsonb_to_recordset(occurrence_inserts || occurrence_updates) as planned(local_date date)
    where behavior.user_id = target_user_id and behavior.id = target_behavior_id
      and behavior.end_date is not null and planned.local_date >= behavior.end_date
  ) then
    raise exception 'Behavior end date changed after occurrence planning.' using errcode = 'P0001';
  end if;

$patch$ || anchor);
  delete_start := position('delete from public.occurrences as occurrence' in definition);
  anchor := 'and occurrence.scheduled_for > plan_now';
  if delete_start = 0 or position(anchor in substring(definition from delete_start)) = 0 then
    raise exception 'Occurrence deletion guard changed unexpectedly.';
  end if;
  execute substring(definition from 1 for delete_start - 1) || replace(
    substring(definition from delete_start), anchor, $patch$and (
      occurrence.scheduled_for > plan_now
      or exists (
        select 1 from public.behaviors as behavior
        where behavior.id = target_behavior_id and behavior.user_id = target_user_id
          and behavior.end_date is not null and occurrence.local_date >= behavior.end_date
      )
    )$patch$
  );
end
$migration$;

commit;
