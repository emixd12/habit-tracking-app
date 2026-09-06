begin;

-- Archive history travels with the owner-scoped Behavior and its atomic writes.
alter table public.behaviors
  add column archive_notes jsonb not null default '[]'::jsonb;

create function cadence_private.valid_behavior_archive_notes(entries jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare entry jsonb; seen uuid[] := '{}'; entry_id uuid;
begin
  if entries is null or jsonb_typeof(entries) <> 'array' then return false; end if;
  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry) <> 'object'
      or not (entry ?& array['id', 'archived_at', 'note', 'updated_at'])
      or (entry - array['id', 'archived_at', 'note', 'updated_at']) <> '{}'::jsonb
      or jsonb_typeof(entry->'id') <> 'string'
      or jsonb_typeof(entry->'archived_at') <> 'string'
      or jsonb_typeof(entry->'updated_at') <> 'string'
      or jsonb_typeof(entry->'note') not in ('string', 'null')
      or length(entry->>'note') + length(regexp_replace(entry->>'note', U&'[\0001-\FFFF]', '', 'g')) > 2000
      or (jsonb_typeof(entry->'note') = 'string' and (entry->>'note' = ''
        or entry->>'note' <> regexp_replace(entry->>'note', '^\s+|\s+$', '', 'g')))
      or (entry->>'archived_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$'
      or (entry->>'updated_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$'
    then return false; end if;
    entry_id := (entry->>'id')::uuid;
    if entry_id = any(seen) then return false; end if;
    seen := array_append(seen, entry_id);
    perform (entry->>'archived_at')::timestamptz;
    perform (entry->>'updated_at')::timestamptz;
    if (entry->>'updated_at')::timestamptz < (entry->>'archived_at')::timestamptz then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function cadence_private.valid_behavior_archive_notes(jsonb) from public, anon;
grant execute on function cadence_private.valid_behavior_archive_notes(jsonb) to authenticated, service_role;
alter table public.behaviors add constraint behaviors_archive_notes_valid
  check (cadence_private.valid_behavior_archive_notes(archive_notes));

-- Patch the existing transactions, preserving their ownership/history/conflict checks.
do $migration$
declare definition text; anchor text;
begin
  select pg_get_functiondef('public.create_behavior_with_schedule_graph(jsonb,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  anchor := E'    archived_at,\n    created_at,';
  if position(anchor in definition) = 0 then raise exception 'Behavior create columns changed unexpectedly.'; end if;
  definition := replace(definition, anchor, E'    archived_at,\n    archive_notes,\n    created_at,');
  anchor := $a$    nullif(behavior_payload ->> 'archived_at', '')::timestamptz,$a$;
  if position(anchor in definition) = 0 then raise exception 'Behavior create values changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$
    coalesce(behavior_payload -> 'archive_notes', '[]'::jsonb),$patch$);

  select pg_get_functiondef('public.update_behavior_with_schedule_graph(uuid,jsonb,jsonb,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  anchor := $a$    archived_at = nullif(behavior_payload ->> 'archived_at', '')::timestamptz$a$;
  if position(anchor in definition) = 0 then raise exception 'Behavior update changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$,
    archive_notes = coalesce(behavior_payload -> 'archive_notes', current_behavior.archive_notes)$patch$);

  select pg_get_functiondef('public.get_export_page_read_bundle(date,date)'::regprocedure) into definition;
  anchor := $a$            'archived_at', b.archived_at,$a$;
  if position(anchor in definition) = 0 then raise exception 'Export projection changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$
            'archive_notes', b.archive_notes,$patch$);

  select pg_get_functiondef('cadence_private.apply_behaviorlog_import(jsonb)'::regprocedure) into definition;
  anchor := 'email_reminder_enabled, reminder_offset_minutes, active, archived_at,';
  if position(anchor in definition) = 0 then raise exception 'Import columns changed unexpectedly.'; end if;
  definition := replace(definition, anchor, anchor || ' archive_notes,');
  anchor := $a$        nullif(row_value ->> 'archivedAtUtc', '')::timestamptz,$a$;
  if position(anchor in definition) = 0 then raise exception 'Import values changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', note->>'id', 'archived_at', note->>'archivedAt',
          'note', note->'note', 'updated_at', note->>'updatedAt'
        ) order by ordinality) from jsonb_array_elements(
          coalesce(row_value->'cadenceArchiveNotes', '[]'::jsonb)
        ) with ordinality as entries(note, ordinality)), '[]'::jsonb),$patch$);

  select pg_get_functiondef('public.apply_behaviorlog_restore_product_writes(jsonb)'::regprocedure) into definition;
  anchor := E'    archived_at,\n    created_at,';
  if position(anchor in definition) = 0 then raise exception 'Restore columns changed unexpectedly.'; end if;
  definition := replace(definition, anchor, E'    archived_at,\n    archive_notes,\n    created_at,');
  anchor := $a$    nullif(row ->> 'archived_at', '')::timestamptz,$a$;
  if position(anchor in definition) = 0 then raise exception 'Restore values changed unexpectedly.'; end if;
  definition := replace(definition, anchor, anchor || $patch$
    coalesce(row -> 'archive_notes', '[]'::jsonb),$patch$);
  anchor := '    archived_at = excluded.archived_at,';
  if position(anchor in definition) = 0 then raise exception 'Restore update changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$
    archive_notes = case when exists (
      select 1 from jsonb_array_elements(restore_payload -> 'behaviors') source
      where source ->> 'id' = excluded.id::text and source ? 'archive_notes'
    ) then excluded.archive_notes else public.behaviors.archive_notes end,$patch$);

  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;
  anchor := $a$    write_value := (write -> 'value') || jsonb_build_object('user_id', current_user_id);$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync changed unexpectedly.'; end if;
  execute replace(definition, anchor, $patch$
    if write_kind = 'behavior' and not ((write -> 'value') ? 'archive_notes') then
      raise exception 'Update Cadence before synchronizing Behavior changes.' using errcode = '22023';
    end if;
$patch$ || anchor);
end
$migration$;

commit;
