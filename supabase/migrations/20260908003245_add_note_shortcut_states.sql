begin;

create function cadence_private.note_shortcut_entries_valid(entries jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry jsonb;
  evidence jsonb;
  entry_keys text[] := '{}';
  evidence_ids text[];
  entry_key text;
  shortcut_text text;
  normalized_text text;
  accepted_texts text[] := '{}';
  accepted_count integer := 0;
  proposed_count integer := 0;
begin
  if entries is null or jsonb_typeof(entries) <> 'array'
    or jsonb_array_length(entries) > 128
  then
    return false;
  end if;

  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry) <> 'object'
      or not (entry ?& array['key', 'text', 'status', 'source', 'evidence', 'created_at', 'expires_at'])
      or (entry - array['key', 'text', 'status', 'source', 'evidence', 'created_at', 'expires_at']) <> '{}'::jsonb
      or jsonb_typeof(entry -> 'key') <> 'string'
      or coalesce(entry ->> 'key', '') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(entry -> 'status') <> 'string'
      or entry ->> 'status' not in ('proposed', 'accepted', 'dismissed')
      or jsonb_typeof(entry -> 'source') <> 'string'
      or entry ->> 'source' not in ('repeated_text', 'model')
      or jsonb_typeof(entry -> 'evidence') <> 'array'
      or jsonb_array_length(entry -> 'evidence') > 100
      or jsonb_typeof(entry -> 'created_at') <> 'string'
      or jsonb_typeof(entry -> 'expires_at') not in ('string', 'null')
    then
      return false;
    end if;

    entry_key := entry ->> 'key';
    if entry_key = any(entry_keys) then return false; end if;
    entry_keys := array_append(entry_keys, entry_key);
    perform (entry ->> 'created_at')::timestamptz;
    if jsonb_typeof(entry -> 'expires_at') = 'string' then
      perform (entry ->> 'expires_at')::timestamptz;
    end if;

    evidence_ids := '{}';
    for evidence in select value from jsonb_array_elements(entry -> 'evidence') loop
      if jsonb_typeof(evidence) <> 'object'
        or not (evidence ?& array['occurrence_id', 'note_hash'])
        or (evidence - array['occurrence_id', 'note_hash']) <> '{}'::jsonb
        or jsonb_typeof(evidence -> 'occurrence_id') <> 'string'
        or jsonb_typeof(evidence -> 'note_hash') <> 'string'
        or coalesce(evidence ->> 'occurrence_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(evidence ->> 'note_hash', '') !~ '^[a-f0-9]{64}$'
        or evidence ->> 'occurrence_id' = any(evidence_ids)
      then
        return false;
      end if;
      evidence_ids := array_append(evidence_ids, evidence ->> 'occurrence_id');
    end loop;

    if entry ->> 'status' = 'dismissed' then
      if jsonb_typeof(entry -> 'text') <> 'null'
        or jsonb_array_length(entry -> 'evidence') <> 0
        or jsonb_typeof(entry -> 'expires_at') <> 'string'
      then
        return false;
      end if;
    else
      if jsonb_typeof(entry -> 'text') <> 'string' then return false; end if;
      shortcut_text := entry ->> 'text';
      normalized_text := normalize(
        regexp_replace(
          regexp_replace(shortcut_text, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
          '[[:space:]]+', ' ', 'g'
        ),
        NFKC
      );
      if char_length(shortcut_text) not between 1 and 160
        or shortcut_text <> normalized_text
        or shortcut_text ~ '[[:cntrl:]]'
        or shortcut_text ~ U&'[\200B\200C\200D\2060\FEFF]'
        or lower(shortcut_text) ~ '(ignore.*(previous|instructions?)|(system|assistant|developer)[[:space:]]*:|system prompt|developer message|output a completed status)'
      then
        return false;
      end if;
    end if;

    if entry ->> 'status' = 'accepted' then
      accepted_count := accepted_count + 1;
      if lower(shortcut_text) = any(accepted_texts) then return false; end if;
      accepted_texts := array_append(accepted_texts, lower(shortcut_text));
      if jsonb_array_length(entry -> 'evidence') <> 0
        or jsonb_typeof(entry -> 'expires_at') <> 'null'
      then
        return false;
      end if;
    elsif entry ->> 'status' = 'proposed' then
      proposed_count := proposed_count + 1;
      if jsonb_array_length(entry -> 'evidence') < 3
        or jsonb_typeof(entry -> 'expires_at') <> 'string'
      then
        return false;
      end if;
    end if;
  end loop;

  -- Reserve capacity for removal of edited accepted text and its original pattern.
  return accepted_count <= 20 and proposed_count <= 5
    and jsonb_array_length(entries) + accepted_count <= 128;
exception when others then
  return false;
end;
$$;

create function cadence_private.note_shortcut_exclusions_valid(exclusions jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  occurrence_id jsonb;
  seen text[] := '{}';
begin
  if exclusions is null or jsonb_typeof(exclusions) <> 'array'
    or jsonb_array_length(exclusions) > 100000
  then
    return false;
  end if;
  for occurrence_id in select value from jsonb_array_elements(exclusions) loop
    if jsonb_typeof(occurrence_id) <> 'string'
      or coalesce(occurrence_id #>> '{}', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or occurrence_id #>> '{}' = any(seen)
    then
      return false;
    end if;
    seen := array_append(seen, occurrence_id #>> '{}');
  end loop;
  return true;
end;
$$;

revoke all on function cadence_private.note_shortcut_entries_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function cadence_private.note_shortcut_exclusions_valid(jsonb)
  from public, anon, authenticated, service_role;

create table public.note_shortcut_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  behavior_id uuid,
  enabled boolean not null default false,
  entries jsonb not null default '[]'::jsonb,
  excluded_occurrence_ids jsonb not null default '[]'::jsonb,
  revision integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (user_id, id),
  constraint note_shortcut_states_behavior_owner_fkey
    foreign key (user_id, behavior_id)
    references public.behaviors(user_id, id)
    on delete cascade,
  constraint note_shortcut_states_identity_valid check (
    (id = 'global' and behavior_id is null)
    or (behavior_id is not null and id = behavior_id::text)
  ),
  constraint note_shortcut_states_revision_valid check (revision >= 0),
  constraint note_shortcut_states_entries_valid check (
    cadence_private.note_shortcut_entries_valid(entries)
    and (id <> 'global' or entries = '[]'::jsonb)
  ),
  constraint note_shortcut_states_exclusions_valid check (
    cadence_private.note_shortcut_exclusions_valid(excluded_occurrence_ids)
    and (id <> 'global' or excluded_occurrence_ids = '[]'::jsonb)
  )
);

create index note_shortcut_states_user_behavior_idx
  on public.note_shortcut_states(user_id, behavior_id)
  where behavior_id is not null;

alter table public.note_shortcut_states enable row level security;
create policy note_shortcut_states_select_own
  on public.note_shortcut_states for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.note_shortcut_states
  from public, anon, authenticated, service_role;
grant select on table public.note_shortcut_states to authenticated;

create function cadence_private.read_note_shortcut_context_for_owner(
  owner_id uuid,
  target_behavior_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  behavior_value jsonb;
  state_value jsonb;
  global_state_value jsonb;
  note_values jsonb;
  imported_ids jsonb;
  source_count bigint;
  source_bytes bigint;
  imported_count bigint;
  context_value jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if target_behavior_id is not null then
    select jsonb_build_object(
      'id', behavior.id,
      'user_id', behavior.user_id,
      'active', behavior.active,
      'timezone', behavior.timezone
    ) into behavior_value
    from public.behaviors behavior
    where behavior.user_id = owner_id and behavior.id = target_behavior_id;
  end if;

  select to_jsonb(shortcut_state) into global_state_value
  from public.note_shortcut_states shortcut_state
  where shortcut_state.user_id = owner_id and shortcut_state.id = 'global';

  if target_behavior_id is null then
    state_value := global_state_value;
    note_values := '[]'::jsonb;
    imported_ids := '[]'::jsonb;
  else
    select to_jsonb(shortcut_state) into state_value
    from public.note_shortcut_states shortcut_state
    where shortcut_state.user_id = owner_id
      and shortcut_state.id = target_behavior_id::text;

    select count(*), coalesce(sum(octet_length(occurrence.note) + 512), 0)
    into source_count, source_bytes
    from public.occurrences occurrence
    where occurrence.user_id = owner_id
      and occurrence.behavior_id = target_behavior_id
      and nullif(btrim(occurrence.note), '') is not null
      and char_length(occurrence.note) <= 2000;
    if source_count > 100000 then
      raise exception 'A Note shortcut source collection exceeds 100,000 rows.'
        using errcode = '54000';
    end if;
    if source_bytes > 67108864 then
      raise exception 'The Note shortcut context exceeds 64 MiB.' using errcode = '54000';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', occurrence.id,
      'user_id', occurrence.user_id,
      'behavior_id', occurrence.behavior_id,
      'note', occurrence.note,
      'local_date', occurrence.local_date,
      'scheduled_for', occurrence.scheduled_for
    ) order by occurrence.local_date desc, occurrence.scheduled_for desc, occurrence.id), '[]'::jsonb)
    into note_values
    from public.occurrences occurrence
    where occurrence.user_id = owner_id
      and occurrence.behavior_id = target_behavior_id
      and nullif(btrim(occurrence.note), '') is not null
      and char_length(occurrence.note) <= 2000;

    select count(distinct provenance.local_id) into imported_count
    from public.behaviorlog_import_record_mappings provenance
    join public.occurrences occurrence
      on occurrence.user_id = provenance.user_id
     and occurrence.id = provenance.local_id
    where provenance.user_id = owner_id
      and provenance.record_type = 'occurrence'
      and occurrence.behavior_id = target_behavior_id;
    if imported_count > 100000 then
      raise exception 'A Note shortcut import provenance collection exceeds 100,000 rows.'
        using errcode = '54000';
    end if;

    select coalesce(jsonb_agg(mapping.local_id::text order by mapping.local_id::text), '[]'::jsonb)
    into imported_ids
    from (
      select distinct provenance.local_id
      from public.behaviorlog_import_record_mappings provenance
      join public.occurrences occurrence
        on occurrence.user_id = provenance.user_id
       and occurrence.id = provenance.local_id
      where provenance.user_id = owner_id
        and provenance.record_type = 'occurrence'
        and occurrence.behavior_id = target_behavior_id
    ) mapping;
  end if;

  context_value := jsonb_build_object(
    'state', coalesce(state_value, 'null'::jsonb),
    'globalState', coalesce(global_state_value, 'null'::jsonb),
    'behavior', coalesce(behavior_value, 'null'::jsonb),
    'notes', note_values,
    'importedOccurrenceIds', imported_ids
  );
  if octet_length(context_value::text) > 67108864 then
    raise exception 'The Note shortcut context exceeds 64 MiB.' using errcode = '54000';
  end if;
  return context_value;
end;
$$;

revoke all on function cadence_private.read_note_shortcut_context_for_owner(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function cadence_private.read_note_shortcut_context_for_owner(uuid, uuid)
  to authenticated;

create function public.read_note_shortcut_context(target_behavior_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select cadence_private.read_note_shortcut_context_for_owner((select auth.uid()), target_behavior_id)
$$;

revoke all on function public.read_note_shortcut_context(uuid)
  from public, anon, service_role;
grant execute on function public.read_note_shortcut_context(uuid) to authenticated;

-- Like the guarded occurrence-status write RPC, this mutation uses the table
-- owner's rights so authenticated clients cannot bypass its full-context CAS.
create function public.commit_note_shortcut_state(
  expected_context jsonb,
  next_state jsonb,
  require_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  target_behavior_id uuid;
  target_id text;
  current_context jsonb;
  result public.note_shortcut_states;
begin
  if owner_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if jsonb_typeof(expected_context) is distinct from 'object'
    or jsonb_typeof(next_state) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(expected_context)) <> 5
    or not (expected_context ?& array['state', 'globalState', 'behavior', 'notes', 'importedOccurrenceIds'])
    or (select count(*) from jsonb_object_keys(next_state)) <> 8
    or not (next_state ?& array['id', 'user_id', 'behavior_id', 'enabled', 'entries', 'excluded_occurrence_ids', 'revision', 'updated_at'])
    or next_state ->> 'user_id' is distinct from owner_id::text
    or jsonb_typeof(next_state -> 'revision') <> 'number'
    or (next_state ->> 'revision')::numeric <> trunc((next_state ->> 'revision')::numeric)
    or (next_state ->> 'revision')::numeric not between 1 and 2147483647
  then
    raise exception 'Invalid Note shortcut commit.' using errcode = '22023';
  end if;

  target_id := next_state ->> 'id';
  if target_id = 'global' then
    if jsonb_typeof(next_state -> 'behavior_id') <> 'null' then
      raise exception 'Invalid global Note shortcut state.' using errcode = '22023';
    end if;
  else
    begin target_behavior_id := target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid Note shortcut Behavior.' using errcode = '22023';
    end;
    if next_state ->> 'behavior_id' is distinct from target_behavior_id::text then
      raise exception 'Invalid Note shortcut Behavior.' using errcode = '22023';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  perform 1 from public.note_shortcut_states
    where user_id = owner_id and id in ('global', target_id)
    order by id for update;
  if target_behavior_id is not null then
    perform 1 from public.behaviors
      where user_id = owner_id and id = target_behavior_id for update;
    perform 1 from public.occurrences
      where user_id = owner_id and behavior_id = target_behavior_id
      order by id for update;
    perform 1 from public.behaviorlog_import_record_mappings
      where user_id = owner_id and record_type = 'occurrence'
        and local_id in (
          select id from public.occurrences
          where user_id = owner_id and behavior_id = target_behavior_id
        )
      order by id for update;
  end if;

  current_context := cadence_private.read_note_shortcut_context_for_owner(owner_id, target_behavior_id);
  if target_behavior_id is not null and current_context -> 'behavior' = 'null'::jsonb then
    raise exception 'Behavior not found.' using errcode = '42501';
  end if;
  if current_context is distinct from expected_context then
    raise exception 'This shortcut changed elsewhere. Refresh and try again.' using errcode = 'P0001';
  end if;
  if (next_state ->> 'revision')::integer
      <> coalesce((current_context #>> '{state,revision}')::integer, 0) + 1
  then
    raise exception 'This shortcut changed elsewhere. Refresh and try again.' using errcode = 'P0001';
  end if;
  if require_enabled and (
    target_behavior_id is null
    or coalesce((current_context #>> '{globalState,enabled}')::boolean, false) is not true
    or coalesce((current_context #>> '{state,enabled}')::boolean, false) is not true
    or coalesce((current_context #>> '{behavior,active}')::boolean, false) is not true
  ) then
    raise exception 'Enable Note shortcuts globally and for this active Behavior first.' using errcode = 'P0001';
  end if;

  insert into public.note_shortcut_states as shortcut_state (
    user_id, id, behavior_id, enabled, entries,
    excluded_occurrence_ids, revision, updated_at
  ) values (
    owner_id,
    target_id,
    target_behavior_id,
    (next_state ->> 'enabled')::boolean,
    next_state -> 'entries',
    next_state -> 'excluded_occurrence_ids',
    (next_state ->> 'revision')::integer,
    (next_state ->> 'updated_at')::timestamptz
  ) on conflict (user_id, id) do update set
    behavior_id = excluded.behavior_id,
    enabled = excluded.enabled,
    entries = excluded.entries,
    excluded_occurrence_ids = excluded.excluded_occurrence_ids,
    revision = excluded.revision,
    updated_at = excluded.updated_at
  returning * into result;

  return to_jsonb(result);
end;
$$;

revoke all on function public.commit_note_shortcut_state(jsonb, jsonb, boolean)
  from public, anon, service_role;
grant execute on function public.commit_note_shortcut_state(jsonb, jsonb, boolean)
  to authenticated;

-- Direct state writes stay revoked. This RPC binds ownership to auth.uid() and
-- commits the Note and exclusion in one transaction.
create function public.update_occurrence_note_with_shortcut(
  target_occurrence_id uuid,
  expected_note text,
  next_note text,
  used_shortcut boolean
)
returns setof public.occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  occurrence_value public.occurrences;
  shortcut_state public.note_shortcut_states;
begin
  if owner_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if used_shortcut is distinct from true then
    raise exception 'The shortcut Note update flag is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select * into occurrence_value
  from public.occurrences occurrence
  where occurrence.user_id = owner_id and occurrence.id = target_occurrence_id
  for update;
  if not found or occurrence_value.note is distinct from expected_note then
    return;
  end if;

  select * into shortcut_state
  from public.note_shortcut_states state
  where state.user_id = owner_id and state.id = occurrence_value.behavior_id::text
  for update;
  if not found then
    insert into public.note_shortcut_states (
      user_id, id, behavior_id, enabled, entries,
      excluded_occurrence_ids, revision, updated_at
    ) values (
      owner_id, occurrence_value.behavior_id::text, occurrence_value.behavior_id,
      false, '[]'::jsonb, '[]'::jsonb, 0, statement_timestamp()
    ) returning * into shortcut_state;
  end if;
  if jsonb_array_length(shortcut_state.excluded_occurrence_ids) >= 100000
    and not (shortcut_state.excluded_occurrence_ids ? target_occurrence_id::text)
  then
    raise exception 'The Note shortcut exclusion history is full.' using errcode = '54000';
  end if;

  update public.note_shortcut_states state set
    excluded_occurrence_ids = case
      when state.excluded_occurrence_ids ? target_occurrence_id::text
        then state.excluded_occurrence_ids
      else state.excluded_occurrence_ids || to_jsonb(target_occurrence_id::text)
    end,
    revision = state.revision + 1,
    updated_at = statement_timestamp()
  where state.user_id = owner_id and state.id = occurrence_value.behavior_id::text;

  update public.occurrences occurrence set note = next_note
  where occurrence.user_id = owner_id and occurrence.id = target_occurrence_id
  returning occurrence.* into occurrence_value;
  return next occurrence_value;
end;
$$;

revoke all on function public.update_occurrence_note_with_shortcut(uuid, text, text, boolean)
  from public, anon, service_role;
grant execute on function public.update_occurrence_note_with_shortcut(uuid, text, text, boolean)
  to authenticated;

-- Include shortcut state in schema-version-1 account snapshots. Existing clients
-- reject the new closed entity kind, while fingerprints prevent silent omission.
do $migration$
declare
  definition text;
  anchor text;
begin
  select pg_get_functiondef('public.read_account_sync_snapshot()'::regprocedure) into definition;
  anchor := $a$    union all select 'reminder_delivery', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.reminder_deliveries r where r.user_id = current_user_id$a$;
  if position(anchor in definition) = 0 then raise exception 'Account snapshot changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || $patch$
    union all select 'note_shortcut_state', r.id, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.note_shortcut_states r where r.user_id = current_user_id$patch$);

  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;

  anchor := $a$  row_id uuid;
  table_name text;$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync declarations changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$  row_id uuid;
  target_behavior_id uuid;
  table_name text;$patch$);

  anchor := $a$      'imported_intervention', 'reminder_delivery'
    )$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync kind list changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$      'imported_intervention', 'reminder_delivery', 'note_shortcut_state'
    )$patch$);

  anchor := $a$    else
      begin row_id := (write ->> 'id')::uuid;$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync validation branch changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$    elsif write_kind = 'note_shortcut_state' then
      if write ->> 'id' <> 'global' then
        begin target_behavior_id := (write ->> 'id')::uuid;
        exception when invalid_text_representation then
          raise exception 'The Note shortcut state ID is invalid.' using errcode = '22023';
        end;
      else
        target_behavior_id := null;
      end if;
      if write ->> 'operation' = 'upsert' and (
        write #>> '{value,id}' is distinct from write ->> 'id'
        or (select count(*) from jsonb_object_keys(write -> 'value')) <> 7
        or not ((write -> 'value') ?& array['id', 'behavior_id', 'enabled', 'entries', 'excluded_occurrence_ids', 'revision', 'updated_at'])
        or (target_behavior_id is null and jsonb_typeof(write #> '{value,behavior_id}') <> 'null')
        or (target_behavior_id is not null and write #>> '{value,behavior_id}' is distinct from target_behavior_id::text)
      ) then
        raise exception 'The Note shortcut state write is invalid.' using errcode = '22023';
      end if;
      if target_behavior_id is not null and not exists (
        select 1 from public.behaviors behavior
        where behavior.user_id = current_user_id and behavior.id = target_behavior_id
      ) then
        raise exception 'The Note shortcut Behavior does not belong to this account.' using errcode = '42501';
      end if;
      select cadence_private.normalize_account_sync_row(to_jsonb(state) - 'user_id') into stored_value
      from public.note_shortcut_states state
      where state.user_id = current_user_id and state.id = write ->> 'id'
      for update;
    else
      begin row_id := (write ->> 'id')::uuid;$patch$);

  anchor := $a$      when 'imported_intervention' then 13 when 'reminder_delivery' then 14 end,$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync upsert order changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$      when 'imported_intervention' then 13 when 'reminder_delivery' then 14
      when 'note_shortcut_state' then 15 end,$patch$);

  anchor := $a$    if write_kind = 'profile' then
      update public.profiles set timezone = write #>> '{value,timezone}' where id = current_user_id;
      continue;
    end if;
    row_id := (write ->> 'id')::uuid;$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync upsert branch changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$    if write_kind = 'profile' then
      update public.profiles set timezone = write #>> '{value,timezone}' where id = current_user_id;
      continue;
    elsif write_kind = 'note_shortcut_state' then
      write_value := (write -> 'value') || jsonb_build_object('user_id', current_user_id);
      insert into public.note_shortcut_states as state
      select (jsonb_populate_record(null::public.note_shortcut_states, write_value)).*
      on conflict (user_id, id) do update set
        behavior_id = excluded.behavior_id, enabled = excluded.enabled,
        entries = excluded.entries, excluded_occurrence_ids = excluded.excluded_occurrence_ids,
        revision = excluded.revision, updated_at = excluded.updated_at;
      continue;
    end if;
    row_id := (write ->> 'id')::uuid;$patch$);

  anchor := $a$      when 'reminder_delivery' then 0 when 'time_session' then 1 when 'occurrence' then 2$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync delete order changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$      when 'note_shortcut_state' then -1
      when 'reminder_delivery' then 0 when 'time_session' then 1 when 'occurrence' then 2$patch$);

  anchor := $a$    write_kind := write ->> 'kind';
    row_id := (write ->> 'id')::uuid;$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync delete branch changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$    write_kind := write ->> 'kind';
    if write_kind = 'note_shortcut_state' then
      delete from public.note_shortcut_states
      where user_id = current_user_id and id = write ->> 'id';
      continue;
    end if;
    row_id := (write ->> 'id')::uuid;$patch$);

  execute definition;
end
$migration$;

commit;
