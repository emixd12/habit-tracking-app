begin;

create table public.account_sync_apply_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  baseline_fingerprint text not null check (baseline_fingerprint ~ '^[a-f0-9]{64}$'),
  local_fingerprint text not null check (local_fingerprint ~ '^[a-f0-9]{64}$'),
  hosted_fingerprint text not null check (hosted_fingerprint ~ '^[a-f0-9]{64}$'),
  result_fingerprint text not null check (result_fingerprint ~ '^[a-f0-9]{64}$'),
  result_json jsonb not null check (jsonb_typeof(result_json) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, idempotency_key),
  check (idempotency_key ~ '^[a-f0-9]{64}$')
);

alter table public.account_sync_apply_receipts enable row level security;

create policy account_sync_apply_receipts_select_own
  on public.account_sync_apply_receipts for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.account_sync_apply_receipts
  from public, anon, authenticated, service_role;
grant select on table public.account_sync_apply_receipts to authenticated;

create function cadence_private.canonical_account_sync_json(value jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case jsonb_typeof(value)
    when 'object' then '{' || coalesce((
      select string_agg(to_json(key)::text || ':' || cadence_private.canonical_account_sync_json(item), ',' order by key)
      from jsonb_each(value) entry(key, item)
    ), '') || '}'
    when 'array' then '[' || coalesce((
      select string_agg(cadence_private.canonical_account_sync_json(item), ',' order by ordinality)
      from jsonb_array_elements(value) with ordinality entry(item, ordinality)
    ), '') || ']'
    else value::text
  end
$$;

revoke all on function cadence_private.canonical_account_sync_json(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function cadence_private.canonical_account_sync_json(jsonb)
  to authenticated;

create function cadence_private.normalize_account_sync_row(value jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, case
    when (key ~ '_at$' or key = 'scheduled_for') and jsonb_typeof(item) = 'string'
      then to_jsonb(to_char((item #>> '{}')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    else item
  end), '{}'::jsonb)
  from jsonb_each(value) entry(key, item)
$$;

revoke all on function cadence_private.normalize_account_sync_row(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function cadence_private.normalize_account_sync_row(jsonb)
  to authenticated;

create function public.read_account_sync_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  entities jsonb;
  snapshot jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  with owned_entities(kind, id, value) as (
    select 'profile', 'profile', jsonb_build_object('timezone', p.timezone)
    from public.profiles p where p.id = current_user_id
    union all select 'category', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.categories r where r.user_id = current_user_id
    union all select 'behavior', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.behaviors r where r.user_id = current_user_id
    union all select 'schedule', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.behavior_schedules r where r.user_id = current_user_id
    union all select 'schedule_slot', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.behavior_schedule_slots r where r.user_id = current_user_id
    union all select 'definition_event', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.behavior_definition_events r where r.user_id = current_user_id
    union all select 'configuration_event', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.behavior_configuration_events r where r.user_id = current_user_id
    union all select 'occurrence', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.occurrences r where r.user_id = current_user_id
    union all select 'status_event', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.occurrence_status_events r where r.user_id = current_user_id
    union all select 'time_session', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.occurrence_time_sessions r where r.user_id = current_user_id
    union all select 'import_run', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.behaviorlog_import_runs r where r.user_id = current_user_id
    union all select 'mapping', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.behaviorlog_import_record_mappings r where r.user_id = current_user_id
    union all select 'imported_note', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.imported_notes r where r.user_id = current_user_id
    union all select 'imported_intervention', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.imported_interventions r where r.user_id = current_user_id
    union all select 'reminder_delivery', r.id::text, cadence_private.normalize_account_sync_row(to_jsonb(r) - 'user_id') from public.reminder_deliveries r where r.user_id = current_user_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('kind', kind, 'id', id, 'value', value)
      order by kind, id
    ),
    '[]'::jsonb
  )
  into entities
  from owned_entities;

  if exists (
    select 1
    from jsonb_array_elements(entities) entity
    group by entity ->> 'kind'
    having count(*) > 100000
  ) then
    raise exception 'An account synchronization collection exceeds 100,000 rows.'
      using errcode = '54000';
  end if;

  snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'userId', current_user_id,
    'fingerprint', encode(extensions.digest(convert_to(cadence_private.canonical_account_sync_json(coalesce((
      select jsonb_agg(jsonb_set(entity, '{value}', (entity -> 'value') - 'updated_at') order by entity ->> 'kind', entity ->> 'id')
      from jsonb_array_elements(entities) entity
    ), '[]'::jsonb)), 'UTF8'), 'sha256'), 'hex'),
    'entities', entities
  );

  if octet_length(snapshot::text) > 67108864 then
    raise exception 'The account synchronization snapshot exceeds 64 MiB.'
      using errcode = '54000';
  end if;

  return snapshot;
end;
$$;

create function cadence_private.apply_account_sync_plan(sync_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  v_idempotency_key text := sync_payload ->> 'idempotencyKey';
  request_fingerprint text;
  expected_plan_fingerprint text := sync_payload ->> 'planFingerprint';
  current_snapshot jsonb;
  result jsonb;
  stored_receipt public.account_sync_apply_receipts%rowtype;
  write jsonb;
  stored_value jsonb;
  row_id uuid;
  table_name text;
  update_list text;
  write_value jsonb;
  write_kind text;
  other_owner boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if jsonb_typeof(sync_payload) is distinct from 'object'
    or octet_length(sync_payload::text) > 67108864
    or coalesce(sync_payload ->> 'schemaVersion', '') <> '1'
    or coalesce(v_idempotency_key, '') !~ '^[a-f0-9]{64}$'
    or coalesce(sync_payload ->> 'baselineFingerprint', '') !~ '^[a-f0-9]{64}$'
    or coalesce(sync_payload ->> 'localFingerprint', '') !~ '^[a-f0-9]{64}$'
    or coalesce(sync_payload ->> 'hostedFingerprint', '') !~ '^[a-f0-9]{64}$'
    or coalesce(expected_plan_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(sync_payload -> 'plan') is distinct from 'object'
    or jsonb_typeof(sync_payload #> '{plan,writes}') is distinct from 'array'
    or coalesce(sync_payload #>> '{plan,mergedFingerprint}', '') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(coalesce(sync_payload #> '{plan,conflicts}', '[]'::jsonb)) is distinct from 'array'
    or jsonb_array_length(coalesce(sync_payload #> '{plan,conflicts}', '[]'::jsonb)) <> 0
  then
    raise exception 'The account synchronization payload is invalid.' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_object_keys(sync_payload -> 'plan')) <> 3
    or not ((sync_payload -> 'plan') ?& array['writes', 'mergedFingerprint', 'conflicts'])
  then
    raise exception 'The account synchronization plan has unsupported fields.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(sync_payload #> '{plan,writes}') item
    group by item ->> 'kind' having count(*) > 100000
  ) then
    raise exception 'An account synchronization write collection exceeds 100,000 rows.' using errcode = '54000';
  end if;

  if (select count(*) from jsonb_object_keys(sync_payload) as key) <> 8
    or not (sync_payload ?& array[
      'schemaVersion', 'idempotencyKey', 'baselineFingerprint', 'localFingerprint',
      'hostedFingerprint', 'planFingerprint', 'plan', 'attemptedAt'
    ])
  then
    raise exception 'The account synchronization payload has unsupported fields.' using errcode = '22023';
  end if;

  request_fingerprint := encode(
    extensions.digest(convert_to(cadence_private.canonical_account_sync_json(sync_payload - 'attemptedAt'), 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || v_idempotency_key, 0));

  select * into stored_receipt
  from public.account_sync_apply_receipts receipt
  where receipt.user_id = current_user_id
    and receipt.idempotency_key = v_idempotency_key;

  if found then
    if stored_receipt.request_fingerprint <> request_fingerprint then
      raise exception 'The account synchronization idempotency key was reused with another request.'
        using errcode = 'P0001';
    end if;
    return stored_receipt.result_json;
  end if;

  if expected_plan_fingerprint <> encode(
    extensions.digest(convert_to(cadence_private.canonical_account_sync_json(sync_payload -> 'plan'), 'UTF8'), 'sha256'),
    'hex'
  ) then
    raise exception 'The account synchronization plan fingerprint is invalid.' using errcode = '22023';
  end if;

  current_snapshot := public.read_account_sync_snapshot();
  if current_snapshot ->> 'fingerprint' <> sync_payload ->> 'hostedFingerprint' then
    raise exception 'The hosted account changed during synchronization.' using errcode = 'P0001';
  end if;

  -- Validate and lock every compare-and-set before the first product write.
  for write in
    select value
    from jsonb_array_elements(sync_payload #> '{plan,writes}')
    order by value ->> 'kind', value ->> 'id'
  loop
    write_kind := write ->> 'kind';
    if write_kind not in (
      'profile', 'category', 'behavior', 'schedule', 'schedule_slot',
      'definition_event', 'configuration_event', 'occurrence', 'status_event',
      'time_session', 'import_run', 'mapping', 'imported_note',
      'imported_intervention', 'reminder_delivery'
    )
      or write ->> 'operation' not in ('upsert', 'delete')
      or not (write ? 'expected')
      or (write ->> 'operation' = 'upsert' and (
        jsonb_typeof(write -> 'value') is distinct from 'object'
        or (write -> 'value') ? 'user_id'
        or (select count(*) from jsonb_object_keys(write)) <> 5
        or not (write ?& array['kind', 'id', 'operation', 'expected', 'value'])
      ))
      or (write ->> 'operation' = 'delete' and (
        write ? 'value'
        or (select count(*) from jsonb_object_keys(write)) <> 4
        or not (write ?& array['kind', 'id', 'operation', 'expected'])
      ))
    then
      raise exception 'The account synchronization hosted write is invalid.' using errcode = '22023';
    end if;

    if write_kind in (
      'definition_event', 'configuration_event', 'status_event',
      'mapping'
    ) and (
      write ->> 'operation' <> 'upsert' or write -> 'expected' <> 'null'::jsonb
    ) then
      raise exception 'Synchronized history and provenance are append-only.' using errcode = 'P0001';
    end if;

    if write_kind = 'profile' then
      if write ->> 'id' <> 'profile'
        or write ->> 'operation' <> 'upsert'
        or jsonb_typeof(write -> 'value') is distinct from 'object'
        or (select count(*) from jsonb_object_keys(write -> 'value')) <> 1
        or not ((write -> 'value') ? 'timezone')
      then
        raise exception 'The account synchronization profile write is invalid.' using errcode = '22023';
      end if;
      select jsonb_build_object('timezone', profile.timezone) into stored_value
      from public.profiles profile where profile.id = current_user_id for update;
      if stored_value -> 'timezone' is distinct from write #> '{value,timezone}'
        and exists (
          select 1 from public.behaviors behavior
          where behavior.user_id = current_user_id
            and not exists (
              select 1 from jsonb_array_elements(sync_payload #> '{plan,writes}') behavior_write
              where behavior_write ->> 'kind' = 'behavior'
                and behavior_write ->> 'id' = behavior.id::text
                and behavior_write ->> 'operation' = 'upsert'
                and behavior_write #> '{value,timezone}' = write #> '{value,timezone}'
            )
        )
      then
        raise exception 'A profile timezone change requires every Behavior timezone write.' using errcode = 'P0001';
      end if;
    else
      begin row_id := (write ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'The account synchronization row ID is invalid.' using errcode = '22023';
      end;

      if write ->> 'operation' = 'upsert'
        and write #>> '{value,id}' is distinct from row_id::text
      then
        raise exception 'The account synchronization row identity is invalid.' using errcode = '22023';
      end if;

      table_name := case write_kind
        when 'category' then 'public.categories'
        when 'behavior' then 'public.behaviors'
        when 'schedule' then 'public.behavior_schedules'
        when 'schedule_slot' then 'public.behavior_schedule_slots'
        when 'definition_event' then 'public.behavior_definition_events'
        when 'configuration_event' then 'public.behavior_configuration_events'
        when 'occurrence' then 'public.occurrences'
        when 'status_event' then 'public.occurrence_status_events'
        when 'time_session' then 'public.occurrence_time_sessions'
        when 'import_run' then 'public.behaviorlog_import_runs'
        when 'mapping' then 'public.behaviorlog_import_record_mappings'
        when 'imported_note' then 'public.imported_notes'
        when 'imported_intervention' then 'public.imported_interventions'
        when 'reminder_delivery' then 'public.reminder_deliveries'
      end;
      execute format(
        'select exists(select 1 from %s owned_row where id = $1 and user_id <> $2)',
        table_name
      ) into other_owner using row_id, current_user_id;
      if other_owner then
        raise exception 'The account synchronization row belongs to another account.' using errcode = '42501';
      end if;
      execute format(
        'select cadence_private.normalize_account_sync_row(to_jsonb(owned_row) - ''user_id'') from %s owned_row where user_id = $1 and id = $2 for update',
        table_name
      ) into stored_value using current_user_id, row_id;

      if write_kind = 'occurrence' and write ->> 'operation' = 'delete'
        and stored_value ->> 'status' <> 'unresolved'
      then
        raise exception 'Resolved Occurrences are protected from synchronization deletion.' using errcode = 'P0001';
      end if;

      if write_kind = 'occurrence' and write ->> 'operation' = 'upsert'
        and (stored_value is null or stored_value -> 'status' is distinct from write #> '{value,status}')
        and not exists (
          select 1 from jsonb_array_elements(sync_payload #> '{plan,writes}') event_write
          where event_write ->> 'kind' = 'status_event'
            and event_write ->> 'operation' = 'upsert'
            and event_write #>> '{value,occurrence_id}' = write ->> 'id'
            and event_write #> '{value,status}' = write #> '{value,status}'
        )
      then
        raise exception 'An Occurrence status change requires append-only status history.' using errcode = 'P0001';
      end if;

      if write_kind = 'behavior' and write ->> 'operation' = 'upsert' and stored_value is not null then
        if (stored_value -> 'title' is distinct from write #> '{value,title}'
          or stored_value -> 'description' is distinct from write #> '{value,description}')
          and not exists (
            select 1 from jsonb_array_elements(sync_payload #> '{plan,writes}') event_write
            where event_write ->> 'kind' = 'definition_event'
              and event_write ->> 'operation' = 'upsert'
              and event_write #>> '{value,behavior_id}' = write ->> 'id'
          )
        then
          raise exception 'A Behavior definition change requires append-only definition history.' using errcode = 'P0001';
        end if;
        if (stored_value - array['title','description','updated_at'])
            is distinct from ((write -> 'value') - array['title','description','updated_at'])
          and not exists (
            select 1 from jsonb_array_elements(sync_payload #> '{plan,writes}') event_write
            where event_write ->> 'kind' = 'configuration_event'
              and event_write ->> 'operation' = 'upsert'
              and event_write #>> '{value,behavior_id}' = write ->> 'id'
          )
        then
          raise exception 'A Behavior configuration change requires append-only configuration history.' using errcode = 'P0001';
        end if;
      end if;

      if write_kind = 'behavior' and write ->> 'operation' = 'upsert' and stored_value is null
        and (
          not exists (
            select 1 from jsonb_array_elements(sync_payload #> '{plan,writes}') event_write
            where event_write ->> 'kind' = 'definition_event'
              and event_write ->> 'operation' = 'upsert'
              and event_write #>> '{value,behavior_id}' = write ->> 'id'
          )
          or not exists (
            select 1 from jsonb_array_elements(sync_payload #> '{plan,writes}') event_write
            where event_write ->> 'kind' = 'configuration_event'
              and event_write ->> 'operation' = 'upsert'
              and event_write #>> '{value,behavior_id}' = write ->> 'id'
              and event_write #>> '{value,event_kind}' = 'baseline'
          )
        )
      then
        raise exception 'A new Behavior requires definition and configuration baselines.' using errcode = 'P0001';
      end if;

      if write_kind = 'category' and write ->> 'operation' = 'delete'
        and exists (
          select 1
          from public.behaviors behavior
          where behavior.user_id = current_user_id
            and behavior.category_id = row_id
            and not exists (
              select 1
              from jsonb_array_elements(sync_payload #> '{plan,writes}') behavior_write
              where behavior_write ->> 'kind' = 'behavior'
                and behavior_write ->> 'id' = behavior.id::text
                and behavior_write ->> 'operation' = 'upsert'
                and behavior_write -> 'expected' = cadence_private.normalize_account_sync_row(to_jsonb(behavior) - 'user_id')
                and behavior_write #>> '{value,category_id}' is distinct from row_id::text
            )
        )
      then
        raise exception 'A referenced Category requires guarded Behavior rewrites before deletion.' using errcode = 'P0001';
      end if;

      if write_kind in (
        'behavior', 'import_run', 'imported_note',
        'imported_intervention', 'reminder_delivery'
      ) and write ->> 'operation' = 'delete' then
        raise exception 'Synchronization preserves protected product and provenance rows.' using errcode = 'P0001';
      end if;
    end if;

    if stored_value is distinct from write -> 'expected' then
      raise exception 'The hosted row changed during synchronization.' using errcode = 'P0001';
    end if;
  end loop;

  -- Apply inserts and updates in parent-before-child order.
  for write in
    select value
    from jsonb_array_elements(sync_payload #> '{plan,writes}')
    where value ->> 'operation' = 'upsert'
    order by case value ->> 'kind'
      when 'profile' then 0 when 'category' then 1 when 'import_run' then 2
      when 'behavior' then 3 when 'schedule' then 4 when 'schedule_slot' then 5
      when 'definition_event' then 6 when 'configuration_event' then 7
      when 'occurrence' then 8 when 'status_event' then 9 when 'time_session' then 10
      when 'mapping' then 11 when 'imported_note' then 12
      when 'imported_intervention' then 13 when 'reminder_delivery' then 14 end,
      value ->> 'id'
  loop
    write_kind := write ->> 'kind';
    if write_kind = 'profile' then
      update public.profiles set timezone = write #>> '{value,timezone}' where id = current_user_id;
      continue;
    end if;
    row_id := (write ->> 'id')::uuid;
    table_name := case write_kind
      when 'category' then 'public.categories' when 'behavior' then 'public.behaviors'
      when 'schedule' then 'public.behavior_schedules' when 'schedule_slot' then 'public.behavior_schedule_slots'
      when 'definition_event' then 'public.behavior_definition_events' when 'configuration_event' then 'public.behavior_configuration_events'
      when 'occurrence' then 'public.occurrences' when 'status_event' then 'public.occurrence_status_events'
      when 'time_session' then 'public.occurrence_time_sessions' when 'import_run' then 'public.behaviorlog_import_runs'
      when 'mapping' then 'public.behaviorlog_import_record_mappings' when 'imported_note' then 'public.imported_notes'
      when 'imported_intervention' then 'public.imported_interventions' when 'reminder_delivery' then 'public.reminder_deliveries' end;
    write_value := (write -> 'value') || jsonb_build_object('user_id', current_user_id);
    select string_agg(format('%1$I = excluded.%1$I', attribute.attname), ',' order by attribute.attnum)
    into update_list
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = table_name::regclass and attribute.attnum > 0
      and not attribute.attisdropped and attribute.attgenerated = '' and attribute.attname <> 'id';
    execute format(
      'insert into %1$s select (jsonb_populate_record(null::%1$s, $1)).* '
      'on conflict (id) do update set %2$s', table_name, update_list
    ) using write_value;
  end loop;

  -- Delete children before parents. Append-only rows were rejected above.
  for write in
    select value
    from jsonb_array_elements(sync_payload #> '{plan,writes}')
    where value ->> 'operation' = 'delete'
    order by case value ->> 'kind'
      when 'reminder_delivery' then 0 when 'time_session' then 1 when 'occurrence' then 2
      when 'schedule_slot' then 3 when 'schedule' then 4 when 'behavior' then 5
      when 'category' then 6 when 'import_run' then 7 else 8 end,
      value ->> 'id'
  loop
    write_kind := write ->> 'kind';
    row_id := (write ->> 'id')::uuid;
    table_name := case write_kind
      when 'category' then 'public.categories' when 'behavior' then 'public.behaviors'
      when 'schedule' then 'public.behavior_schedules' when 'schedule_slot' then 'public.behavior_schedule_slots'
      when 'occurrence' then 'public.occurrences' when 'time_session' then 'public.occurrence_time_sessions'
      when 'import_run' then 'public.behaviorlog_import_runs' when 'reminder_delivery' then 'public.reminder_deliveries' end;
    if table_name is null then
      raise exception 'The account synchronization delete is unsupported.' using errcode = '22023';
    end if;
    execute format('delete from %s where user_id = $1 and id = $2', table_name)
      using current_user_id, row_id;
  end loop;

  current_snapshot := public.read_account_sync_snapshot();
  if current_snapshot ->> 'fingerprint' <> sync_payload #>> '{plan,mergedFingerprint}' then
    raise exception 'The hosted synchronization result differs from the accepted merge.' using errcode = 'P0001';
  end if;
  result := jsonb_build_object(
    'status', 'applied',
    'fingerprint', current_snapshot ->> 'fingerprint',
    'snapshot', current_snapshot
  );

  insert into public.account_sync_apply_receipts (
    user_id, idempotency_key, request_fingerprint, baseline_fingerprint,
    local_fingerprint, hosted_fingerprint, result_fingerprint, result_json
  ) values (
    current_user_id, v_idempotency_key, request_fingerprint,
    sync_payload ->> 'baselineFingerprint', sync_payload ->> 'localFingerprint',
    sync_payload ->> 'hostedFingerprint', current_snapshot ->> 'fingerprint', result
  );

  return result;
end;
$$;

revoke all on function cadence_private.apply_account_sync_plan(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function cadence_private.apply_account_sync_plan(jsonb)
  to authenticated;

create function public.apply_account_sync_plan(sync_payload jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select cadence_private.apply_account_sync_plan(sync_payload)
$$;

revoke all on function public.read_account_sync_snapshot() from public, anon, service_role;
grant execute on function public.read_account_sync_snapshot() to authenticated;
revoke all on function public.apply_account_sync_plan(jsonb) from public, anon, service_role;
grant execute on function public.apply_account_sync_plan(jsonb) to authenticated;

commit;
