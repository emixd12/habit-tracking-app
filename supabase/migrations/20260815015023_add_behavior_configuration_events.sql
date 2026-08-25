create table public.behavior_configuration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null,

  event_kind text not null
    check (event_kind in ('baseline', 'revision')),
  previous_configuration jsonb,
  next_configuration jsonb not null,
  changed_fields text[] not null,

  recorded_at timestamptz not null,
  effective_at timestamptz not null,
  effective_local_date date not null,
  timezone text not null,
  source text not null
    check (source in ('manual', 'import', 'system')),
  reason_code text not null check (btrim(reason_code) <> ''),
  created_at timestamptz not null default now(),

  unique (user_id, id),
  unique (user_id, behavior_id, id),
  constraint behavior_configuration_events_behavior_owner_fkey
    foreign key (user_id, behavior_id)
    references public.behaviors(user_id, id)
    on delete cascade,
  constraint behavior_configuration_events_snapshot_shape_check
    check (
      jsonb_typeof(next_configuration) = 'object'
      and (
        (event_kind = 'baseline' and previous_configuration is null)
        or (
          event_kind = 'revision'
          and jsonb_typeof(previous_configuration) = 'object'
          and previous_configuration is distinct from next_configuration
        )
      )
    ),
  constraint behavior_configuration_events_changed_fields_check
    check (
      cardinality(changed_fields) > 0
      and changed_fields <@ array[
        'category_id',
        'schedule_graph',
        'browser_reminder_enabled',
        'email_reminder_enabled',
        'reminder_offset_minutes',
        'active',
        'timezone'
      ]::text[]
    ),
  constraint behavior_configuration_events_timezone_check
    check (
      timezone = next_configuration ->> 'timezone'
      and effective_local_date = (effective_at at time zone timezone)::date
    )
);

create index behavior_configuration_events_user_recorded_idx
  on public.behavior_configuration_events (user_id, recorded_at, id);

create index behavior_configuration_events_behavior_effective_idx
  on public.behavior_configuration_events (
    user_id,
    behavior_id,
    effective_at,
    recorded_at,
    id
  );

alter table public.behavior_configuration_events enable row level security;

create policy behavior_configuration_events_select_own
  on public.behavior_configuration_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.behavior_configuration_events from authenticated;
grant select on table public.behavior_configuration_events to authenticated;

create or replace function cadence_private.current_behavior_configuration_snapshot(
  target_user_id uuid,
  target_behavior_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'category_id', behavior.category_id,
    'schedule_graph', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'recurrence_rule', schedule.recurrence_rule,
            'sort_order', schedule.sort_order,
            'time_entries', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'kind', slot.kind,
                    'preset', slot.preset,
                    'start_time', slot.start_time::text,
                    'end_time', case
                      when slot.end_time is null then null
                      else to_jsonb(slot.end_time::text)
                    end,
                    'sort_order', slot.sort_order
                  )
                  order by slot.sort_order, slot.start_time, slot.id
                )
                from public.behavior_schedule_slots as slot
                where slot.user_id = schedule.user_id
                  and slot.behavior_id = schedule.behavior_id
                  and slot.behavior_schedule_id = schedule.id
              ),
              '[]'::jsonb
            )
          )
          order by schedule.sort_order, schedule.id
        )
        from public.behavior_schedules as schedule
        where schedule.user_id = behavior.user_id
          and schedule.behavior_id = behavior.id
      ),
      '[]'::jsonb
    ),
    'browser_reminder_enabled', behavior.browser_reminder_enabled,
    'email_reminder_enabled', behavior.email_reminder_enabled,
    'reminder_offset_minutes', behavior.reminder_offset_minutes,
    'active', behavior.active,
    'timezone', behavior.timezone
  )
  from public.behaviors as behavior
  where behavior.user_id = target_user_id
    and behavior.id = target_behavior_id;
$$;

create or replace function cadence_private.behavior_configuration_changed_fields(
  previous_configuration jsonb,
  next_configuration jsonb
)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when previous_configuration is null then array[
      'category_id',
      'schedule_graph',
      'browser_reminder_enabled',
      'email_reminder_enabled',
      'reminder_offset_minutes',
      'active',
      'timezone'
    ]::text[]
    else array_remove(array[
      case when previous_configuration -> 'category_id'
        is distinct from next_configuration -> 'category_id'
        then 'category_id' end,
      case when previous_configuration -> 'schedule_graph'
        is distinct from next_configuration -> 'schedule_graph'
        then 'schedule_graph' end,
      case when previous_configuration -> 'browser_reminder_enabled'
        is distinct from next_configuration -> 'browser_reminder_enabled'
        then 'browser_reminder_enabled' end,
      case when previous_configuration -> 'email_reminder_enabled'
        is distinct from next_configuration -> 'email_reminder_enabled'
        then 'email_reminder_enabled' end,
      case when previous_configuration -> 'reminder_offset_minutes'
        is distinct from next_configuration -> 'reminder_offset_minutes'
        then 'reminder_offset_minutes' end,
      case when previous_configuration -> 'active'
        is distinct from next_configuration -> 'active'
        then 'active' end,
      case when previous_configuration -> 'timezone'
        is distinct from next_configuration -> 'timezone'
        then 'timezone' end
    ]::text[], null)
  end;
$$;

create or replace function cadence_private.insert_behavior_configuration_event(
  target_user_id uuid,
  target_behavior_id uuid,
  previous_configuration jsonb,
  next_configuration jsonb,
  configuration_event_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_event_kind text := case
    when previous_configuration is null then 'baseline'
    else 'revision'
  end;
  expected_changed_fields text[] :=
    cadence_private.behavior_configuration_changed_fields(
      previous_configuration,
      next_configuration
    );
  planned_changed_fields text[];
  planned_recorded_at timestamptz;
  planned_effective_at timestamptz;
  planned_effective_local_date date;
  planned_timezone text;
  created_event_id uuid;
begin
  if (select auth.uid()) is distinct from target_user_id then
    raise exception 'Configuration event owner does not match the authenticated user.'
      using errcode = '42501';
  end if;

  if configuration_event_plan is null
    or jsonb_typeof(configuration_event_plan) <> 'object'
  then
    raise exception 'Configuration event plan is required.'
      using errcode = '23502';
  end if;

  planned_changed_fields := array(
    select jsonb_array_elements_text(
      configuration_event_plan -> 'changed_fields'
    )
  );
  planned_recorded_at :=
    (configuration_event_plan ->> 'recorded_at')::timestamptz;
  planned_effective_at :=
    (configuration_event_plan ->> 'effective_at')::timestamptz;
  planned_effective_local_date :=
    (configuration_event_plan ->> 'effective_local_date')::date;
  planned_timezone := configuration_event_plan ->> 'timezone';

  if configuration_event_plan ->> 'event_kind' is distinct from expected_event_kind
    or configuration_event_plan -> 'previous_configuration'
      is distinct from coalesce(previous_configuration, 'null'::jsonb)
    or configuration_event_plan -> 'next_configuration'
      is distinct from next_configuration
    or planned_changed_fields is distinct from expected_changed_fields
    or cardinality(expected_changed_fields) = 0
    or planned_recorded_at is null
    or planned_effective_at is null
    or planned_timezone is distinct from next_configuration ->> 'timezone'
    or planned_effective_local_date is distinct from
      (planned_effective_at at time zone planned_timezone)::date
  then
    raise exception 'Configuration event plan does not match behavior state.'
      using errcode = '22023';
  end if;

  insert into public.behavior_configuration_events (
    user_id,
    behavior_id,
    event_kind,
    previous_configuration,
    next_configuration,
    changed_fields,
    recorded_at,
    effective_at,
    effective_local_date,
    timezone,
    source,
    reason_code
  )
  values (
    target_user_id,
    target_behavior_id,
    expected_event_kind,
    previous_configuration,
    next_configuration,
    expected_changed_fields,
    planned_recorded_at,
    planned_effective_at,
    planned_effective_local_date,
    planned_timezone,
    configuration_event_plan ->> 'source',
    configuration_event_plan ->> 'reason_code'
  )
  returning id into created_event_id;

  return created_event_id;
end;
$$;

insert into public.behavior_configuration_events (
  user_id,
  behavior_id,
  event_kind,
  previous_configuration,
  next_configuration,
  changed_fields,
  recorded_at,
  effective_at,
  effective_local_date,
  timezone,
  source,
  reason_code
)
select
  behavior.user_id,
  behavior.id,
  'baseline',
  null,
  cadence_private.current_behavior_configuration_snapshot(
    behavior.user_id,
    behavior.id
  ),
  array[
    'category_id',
    'schedule_graph',
    'browser_reminder_enabled',
    'email_reminder_enabled',
    'reminder_offset_minutes',
    'active',
    'timezone'
  ]::text[],
  statement_timestamp(),
  statement_timestamp(),
  (statement_timestamp() at time zone behavior.timezone)::date,
  behavior.timezone,
  'system',
  'history_capture_started'
from public.behaviors as behavior;

create or replace function public.create_behavior_with_schedule_graph(
  behavior_payload jsonb,
  definition_event_plan jsonb,
  configuration_event_plan jsonb,
  schedule_graph jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  created_behavior public.behaviors;
  created_configuration jsonb;
  definition_recorded_at timestamptz;
  behavior_created_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  perform cadence_private.validate_behavior_schedule_graph(schedule_graph);

  if definition_event_plan is null then
    raise exception 'Definition event plan is required.' using errcode = '23502';
  end if;

  if behavior_payload ->> 'title' is distinct from
      definition_event_plan ->> 'next_title'
    or behavior_payload ->> 'description' is distinct from
      definition_event_plan ->> 'next_description'
  then
    raise exception 'Definition event plan does not match behavior payload.'
      using errcode = '22023';
  end if;

  definition_recorded_at :=
    (definition_event_plan ->> 'recorded_at')::timestamptz;
  behavior_created_at := coalesce(
    nullif(behavior_payload ->> 'created_at', '')::timestamptz,
    definition_recorded_at
  );

  if definition_recorded_at is null
    or behavior_created_at is distinct from definition_recorded_at
  then
    raise exception 'Initial definition event must match behavior creation time.'
      using errcode = '22023';
  end if;

  if nullif(behavior_payload ->> 'category_id', '') is not null
    and not exists (
      select 1
      from public.categories
      where id = (behavior_payload ->> 'category_id')::uuid
        and user_id = current_user_id
    )
  then
    raise exception 'Behavior category does not belong to the authenticated user.'
      using errcode = '42501';
  end if;

  insert into public.behaviors (
    user_id,
    category_id,
    title,
    description,
    recurrence_rule,
    scheduled_time,
    timezone,
    browser_reminder_enabled,
    email_reminder_enabled,
    reminder_offset_minutes,
    active,
    archived_at,
    created_at,
    updated_at
  )
  values (
    current_user_id,
    (behavior_payload ->> 'category_id')::uuid,
    behavior_payload ->> 'title',
    behavior_payload ->> 'description',
    behavior_payload -> 'recurrence_rule',
    (behavior_payload ->> 'scheduled_time')::time,
    behavior_payload ->> 'timezone',
    (behavior_payload ->> 'browser_reminder_enabled')::boolean,
    (behavior_payload ->> 'email_reminder_enabled')::boolean,
    (behavior_payload ->> 'reminder_offset_minutes')::integer,
    (behavior_payload ->> 'active')::boolean,
    nullif(behavior_payload ->> 'archived_at', '')::timestamptz,
    behavior_created_at,
    behavior_created_at
  )
  returning * into created_behavior;

  insert into public.behavior_definition_events (
    user_id,
    behavior_id,
    previous_title,
    next_title,
    previous_description,
    next_description,
    changed_fields,
    recorded_at,
    source,
    reason
  )
  values (
    current_user_id,
    created_behavior.id,
    definition_event_plan ->> 'previous_title',
    definition_event_plan ->> 'next_title',
    definition_event_plan ->> 'previous_description',
    definition_event_plan ->> 'next_description',
    array(
      select jsonb_array_elements_text(
        definition_event_plan -> 'changed_fields'
      )
    ),
    definition_recorded_at,
    definition_event_plan ->> 'source',
    definition_event_plan ->> 'reason'
  );

  perform cadence_private.replace_behavior_schedule_graph(
    current_user_id,
    created_behavior.id,
    schedule_graph
  );

  created_configuration :=
    cadence_private.current_behavior_configuration_snapshot(
      current_user_id,
      created_behavior.id
    );
  perform cadence_private.insert_behavior_configuration_event(
    current_user_id,
    created_behavior.id,
    null,
    created_configuration,
    configuration_event_plan
  );

  insert into public.occurrence_sync_state (
    user_id,
    timezone,
    stale,
    stale_reason
  )
  values (
    current_user_id,
    created_behavior.timezone,
    true,
    'behavior_changed'
  )
  on conflict (user_id) do update
  set
    timezone = excluded.timezone,
    stale = true,
    stale_reason = 'behavior_changed';

  return to_jsonb(created_behavior);
end;
$$;

create or replace function public.update_behavior_with_schedule_graph(
  target_behavior_id uuid,
  behavior_payload jsonb,
  expected_definition jsonb,
  expected_schedule_graph jsonb,
  expected_updated_at timestamptz,
  definition_event_plan jsonb,
  configuration_event_plan jsonb,
  schedule_graph jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_behavior public.behaviors;
  updated_behavior public.behaviors;
  current_schedule_graph jsonb;
  previous_configuration jsonb;
  next_configuration jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  perform cadence_private.validate_behavior_schedule_graph(schedule_graph);

  if expected_definition is null
    or jsonb_typeof(expected_definition) <> 'object'
    or expected_schedule_graph is null
    or jsonb_typeof(expected_schedule_graph) <> 'array'
    or expected_updated_at is null
  then
    raise exception 'Exact expected behavior and schedule state is required.'
      using errcode = '22023';
  end if;

  select *
  into current_behavior
  from public.behaviors
  where id = target_behavior_id
    and user_id = current_user_id
  for update;

  if not found then
    return null;
  end if;

  current_schedule_graph := cadence_private.current_behavior_schedule_graph(
    current_user_id,
    target_behavior_id
  );

  if current_behavior.updated_at is distinct from expected_updated_at
    or current_schedule_graph is distinct from expected_schedule_graph
    or current_behavior.title is distinct from
      expected_definition ->> 'stored_title'
    or current_behavior.description is distinct from
      expected_definition ->> 'stored_description'
  then
    raise exception 'Behavior schedule graph changed after it was read.'
      using errcode = '40001';
  end if;

  if definition_event_plan is null then
    if behavior_payload ->> 'title' is distinct from current_behavior.title
      or behavior_payload ->> 'description'
        is distinct from current_behavior.description
    then
      raise exception 'A changed behavior definition requires an event plan.'
        using errcode = '22023';
    end if;
  elsif behavior_payload ->> 'title' is distinct from
      definition_event_plan ->> 'next_title'
    or behavior_payload ->> 'description' is distinct from
      definition_event_plan ->> 'next_description'
    or definition_event_plan ->> 'previous_title' is distinct from
      expected_definition ->> 'normalized_title'
    or definition_event_plan ->> 'previous_description' is distinct from
      expected_definition ->> 'normalized_description'
  then
    raise exception 'Definition event plan does not match expected and next definitions.'
      using errcode = '22023';
  end if;

  if nullif(behavior_payload ->> 'category_id', '') is not null
    and not exists (
      select 1
      from public.categories
      where id = (behavior_payload ->> 'category_id')::uuid
        and user_id = current_user_id
    )
  then
    raise exception 'Behavior category does not belong to the authenticated user.'
      using errcode = '42501';
  end if;

  previous_configuration :=
    cadence_private.current_behavior_configuration_snapshot(
      current_user_id,
      target_behavior_id
    );

  update public.behaviors
  set
    category_id = (behavior_payload ->> 'category_id')::uuid,
    title = behavior_payload ->> 'title',
    description = behavior_payload ->> 'description',
    recurrence_rule = behavior_payload -> 'recurrence_rule',
    scheduled_time = (behavior_payload ->> 'scheduled_time')::time,
    timezone = coalesce(
      nullif(behavior_payload ->> 'timezone', ''),
      current_behavior.timezone
    ),
    browser_reminder_enabled =
      (behavior_payload ->> 'browser_reminder_enabled')::boolean,
    email_reminder_enabled =
      (behavior_payload ->> 'email_reminder_enabled')::boolean,
    reminder_offset_minutes =
      (behavior_payload ->> 'reminder_offset_minutes')::integer,
    active = (behavior_payload ->> 'active')::boolean,
    archived_at = nullif(behavior_payload ->> 'archived_at', '')::timestamptz
  where id = target_behavior_id
    and user_id = current_user_id
  returning * into updated_behavior;

  if definition_event_plan is not null then
    insert into public.behavior_definition_events (
      user_id,
      behavior_id,
      previous_title,
      next_title,
      previous_description,
      next_description,
      changed_fields,
      recorded_at,
      source,
      reason
    )
    values (
      current_user_id,
      target_behavior_id,
      definition_event_plan ->> 'previous_title',
      definition_event_plan ->> 'next_title',
      definition_event_plan ->> 'previous_description',
      definition_event_plan ->> 'next_description',
      array(
        select jsonb_array_elements_text(
          definition_event_plan -> 'changed_fields'
        )
      ),
      (definition_event_plan ->> 'recorded_at')::timestamptz,
      definition_event_plan ->> 'source',
      definition_event_plan ->> 'reason'
    );
  end if;

  perform cadence_private.replace_behavior_schedule_graph(
    current_user_id,
    target_behavior_id,
    schedule_graph
  );

  next_configuration :=
    cadence_private.current_behavior_configuration_snapshot(
      current_user_id,
      target_behavior_id
    );

  if previous_configuration is distinct from next_configuration then
    if configuration_event_plan is null
      or configuration_event_plan = 'null'::jsonb
    then
      raise exception 'A changed behavior configuration requires an event plan.'
        using errcode = '22023';
    end if;

    perform cadence_private.insert_behavior_configuration_event(
      current_user_id,
      target_behavior_id,
      previous_configuration,
      next_configuration,
      configuration_event_plan
    );
  elsif configuration_event_plan is not null
    and configuration_event_plan <> 'null'::jsonb
  then
    raise exception 'An unchanged behavior configuration cannot create an event.'
      using errcode = '22023';
  end if;

  insert into public.occurrence_sync_state (
    user_id,
    timezone,
    stale,
    stale_reason
  )
  values (
    current_user_id,
    updated_behavior.timezone,
    true,
    'behavior_changed'
  )
  on conflict (user_id) do update
  set
    timezone = excluded.timezone,
    stale = true,
    stale_reason = 'behavior_changed';

  return to_jsonb(updated_behavior);
end;
$$;

drop function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb);
drop function public.update_behavior_with_schedule_graph(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  jsonb,
  jsonb
);

create or replace function public.update_profile_and_behavior_timezones_with_config_events(
  target_timezone text,
  expected_profile_timezone text,
  behavior_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles;
  current_behavior public.behaviors;
  behavior_change jsonb;
  previous_configuration jsonb;
  next_configuration jsonb;
  configuration_event_plan jsonb;
  active_behavior_count integer;
  changed_behavior_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  if target_timezone is null
    or btrim(target_timezone) = ''
    or behavior_changes is null
    or jsonb_typeof(behavior_changes) <> 'array'
  then
    raise exception 'Timezone change input is malformed.' using errcode = '22023';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  if current_profile.timezone is distinct from expected_profile_timezone then
    raise exception 'Profile timezone changed after it was read.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(behavior_changes) as change
    group by change ->> 'behavior_id'
    having count(*) > 1
  ) then
    raise exception 'Timezone behavior changes must be unique.'
      using errcode = '22023';
  end if;

  select count(*)
  into active_behavior_count
  from public.behaviors
  where user_id = current_user_id
    and active = true;

  if active_behavior_count <> jsonb_array_length(behavior_changes) then
    raise exception 'Active behavior set changed after it was read.'
      using errcode = '40001';
  end if;

  update public.profiles
  set timezone = target_timezone
  where id = current_user_id;

  for current_behavior in
    select *
    from public.behaviors
    where user_id = current_user_id
      and active = true
    order by id
    for update
  loop
    select change
    into behavior_change
    from jsonb_array_elements(behavior_changes) as change
    where nullif(change ->> 'behavior_id', '')::uuid = current_behavior.id;

    if not found
      or nullif(behavior_change ->> 'expected_updated_at', '')::timestamptz
        is distinct from current_behavior.updated_at
    then
      raise exception 'Active behavior changed after it was read.'
        using errcode = '40001';
    end if;

    previous_configuration :=
      cadence_private.current_behavior_configuration_snapshot(
        current_user_id,
        current_behavior.id
      );
    next_configuration := jsonb_set(
      previous_configuration,
      '{timezone}',
      to_jsonb(target_timezone),
      true
    );
    configuration_event_plan := nullif(
      behavior_change -> 'configuration_event_plan',
      'null'::jsonb
    );

    if previous_configuration is distinct from next_configuration then
      update public.behaviors
      set timezone = target_timezone
      where user_id = current_user_id
        and id = current_behavior.id;

      perform cadence_private.insert_behavior_configuration_event(
        current_user_id,
        current_behavior.id,
        previous_configuration,
        next_configuration,
        configuration_event_plan
      );
      changed_behavior_count := changed_behavior_count + 1;
    elsif configuration_event_plan is not null then
      raise exception 'An unchanged behavior configuration cannot create an event.'
        using errcode = '22023';
    end if;
  end loop;

  insert into public.occurrence_sync_state (
    user_id,
    timezone,
    stale,
    stale_reason
  )
  values (
    current_user_id,
    target_timezone,
    true,
    'timezone_changed'
  )
  on conflict (user_id) do update
  set
    timezone = excluded.timezone,
    stale = true,
    stale_reason = 'timezone_changed';

  return jsonb_build_object(
    'active_behavior_count', active_behavior_count,
    'changed_behavior_count', changed_behavior_count,
    'profile_changed', current_profile.timezone is distinct from target_timezone
  );
end;
$$;

create or replace function public.apply_behaviorlog_restore_with_configuration_events(
  restore_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  apply_run_id uuid := nullif(restore_payload ->> 'apply_run_id', '')::uuid;
  apply_run_status text;
  event_plan jsonb;
  affected_behavior_id uuid;
  previous_configuration jsonb;
  next_configuration jsonb;
  previous_configurations jsonb := '{}'::jsonb;
  derived_schedule_graph jsonb;
  derived_schedule_graphs jsonb := '{}'::jsonb;
  current_schedule_graph jsonb;
  affected_behavior_ids uuid[] := array[]::uuid[];
  matching_event_count integer;
  changed_configuration_count integer := 0;
  restore_result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  if jsonb_typeof(
    coalesce(restore_payload -> 'behavior_configuration_events', '[]'::jsonb)
  ) <> 'array'
  then
    raise exception 'Restore behavior configuration events must be an array.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(restore_payload -> 'behavior_configuration_events', '[]'::jsonb)
    ) as plan
    group by plan ->> 'behavior_id'
    having count(*) > 1
  ) then
    raise exception 'Restore configuration event plans must be unique per behavior.'
      using errcode = '22023';
  end if;

  select status
  into apply_run_status
  from public.behaviorlog_import_runs
  where user_id = current_user_id
    and id = apply_run_id
  for update;

  if not found then
    raise exception 'Restore apply run was not found.' using errcode = 'P0002';
  end if;

  if apply_run_status = 'previewed' then
    select coalesce(array_agg(distinct target_id order by target_id), array[]::uuid[])
    into affected_behavior_ids
    from (
      select value::uuid as target_id
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'archive_behavior_ids', '[]'::jsonb)
      )
      union all
      select (value ->> 'id')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'behaviors', '[]'::jsonb)
      )
      union all
      select (value ->> 'behavior_id')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'schedules', '[]'::jsonb)
      )
      union all
      select slot.behavior_id
      from public.behavior_schedule_slots as slot
      where slot.user_id = current_user_id
        and slot.id in (
          select value::uuid
          from jsonb_array_elements_text(
            coalesce(restore_payload -> 'delete_schedule_ids', '[]'::jsonb)
          )
        )
    ) as affected(target_id)
    where target_id is not null;

    perform 1
    from public.behaviors
    where user_id = current_user_id
      and id = any(affected_behavior_ids)
    order by id
    for update;

    foreach affected_behavior_id in array affected_behavior_ids
    loop
      previous_configuration :=
        cadence_private.current_behavior_configuration_snapshot(
          current_user_id,
          affected_behavior_id
        );
      previous_configurations := jsonb_set(
        previous_configurations,
        array[affected_behavior_id::text],
        coalesce(previous_configuration, 'null'::jsonb),
        true
      );

      if exists (
        select 1
        from jsonb_array_elements(
          coalesce(restore_payload -> 'behaviors', '[]'::jsonb)
        ) as restored_behavior
        where nullif(restored_behavior ->> 'id', '')::uuid = affected_behavior_id
      ) then
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'recurrence_rule', restored_schedule -> 'recurrence_rule',
              'sort_order',
                (restored_schedule ->> 'configuration_sort_order')::integer,
              'time_entries', jsonb_build_array(
                jsonb_build_object(
                  'id', restored_schedule ->> 'id',
                  'kind', restored_schedule ->> 'kind',
                  'preset', restored_schedule ->> 'preset',
                  'start_time', restored_schedule ->> 'start_time',
                  'end_time', restored_schedule ->> 'end_time',
                  'sort_order', 0
                )
              )
            )
            order by
              (restored_schedule ->> 'configuration_sort_order')::integer,
              restored_schedule ->> 'id'
          ),
          '[]'::jsonb
        )
        into derived_schedule_graph
        from jsonb_array_elements(
          coalesce(restore_payload -> 'schedules', '[]'::jsonb)
        ) as restored_schedule
        where nullif(restored_schedule ->> 'behavior_id', '')::uuid =
          affected_behavior_id;
      else
        current_schedule_graph :=
          cadence_private.current_behavior_schedule_graph(
            current_user_id,
            affected_behavior_id
          );

        if affected_behavior_id = any(array(
          select value::uuid
          from jsonb_array_elements_text(
            coalesce(restore_payload -> 'archive_behavior_ids', '[]'::jsonb)
          )
        )) then
          derived_schedule_graph := current_schedule_graph;
        else
          select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', schedule ->> 'id',
              'recurrence_rule', schedule -> 'recurrence_rule',
              'sort_order', (schedule ->> 'sort_order')::integer,
              'time_entries', (
                select coalesce(jsonb_agg(time_entry), '[]'::jsonb)
                from jsonb_array_elements(schedule -> 'time_entries') as time_entry
                where not exists (
                  select 1
                  from jsonb_array_elements_text(
                    coalesce(
                      restore_payload -> 'delete_schedule_ids',
                      '[]'::jsonb
                    )
                  ) as deleted_schedule_id
                  where deleted_schedule_id::uuid =
                    nullif(time_entry ->> 'id', '')::uuid
                )
              )
            )
            order by (schedule ->> 'sort_order')::integer, schedule ->> 'id'
          ),
          '[]'::jsonb
          )
          into derived_schedule_graph
          from jsonb_array_elements(current_schedule_graph) as schedule
          where exists (
            select 1
            from jsonb_array_elements(schedule -> 'time_entries') as time_entry
            where not exists (
              select 1
              from jsonb_array_elements_text(
                coalesce(restore_payload -> 'delete_schedule_ids', '[]'::jsonb)
              ) as deleted_schedule_id
              where deleted_schedule_id::uuid =
                nullif(time_entry ->> 'id', '')::uuid
            )
          );
        end if;
      end if;

      perform cadence_private.validate_behavior_schedule_graph(
        derived_schedule_graph
      );
      derived_schedule_graphs := jsonb_set(
        derived_schedule_graphs,
        array[affected_behavior_id::text],
        derived_schedule_graph,
        true
      );
    end loop;
  end if;

  restore_result := public.apply_behaviorlog_restore(restore_payload);

  if coalesce((restore_result ->> 'already_applied')::boolean, false) then
    return restore_result;
  end if;

  foreach affected_behavior_id in array affected_behavior_ids
  loop
    perform cadence_private.replace_behavior_schedule_graph(
      current_user_id,
      affected_behavior_id,
      derived_schedule_graphs -> affected_behavior_id::text
    );
  end loop;

  foreach affected_behavior_id in array affected_behavior_ids
  loop
    previous_configuration := nullif(
      previous_configurations -> affected_behavior_id::text,
      'null'::jsonb
    );
    next_configuration :=
      cadence_private.current_behavior_configuration_snapshot(
        current_user_id,
        affected_behavior_id
      );

    select count(*)
    into matching_event_count
    from jsonb_array_elements(
      coalesce(restore_payload -> 'behavior_configuration_events', '[]'::jsonb)
    ) as plan
    where nullif(plan ->> 'behavior_id', '')::uuid = affected_behavior_id;

    if previous_configuration is distinct from next_configuration then
      if next_configuration is null or matching_event_count <> 1 then
        raise exception 'Restore requires exactly one event for every changed configuration.'
          using errcode = '22023';
      end if;

      select value
      into event_plan
      from jsonb_array_elements(
        restore_payload -> 'behavior_configuration_events'
      )
      where nullif(value ->> 'behavior_id', '')::uuid = affected_behavior_id;

      perform cadence_private.insert_behavior_configuration_event(
        current_user_id,
        affected_behavior_id,
        previous_configuration,
        next_configuration,
        event_plan - 'behavior_id'
      );
      changed_configuration_count := changed_configuration_count + 1;
    elsif matching_event_count <> 0 then
      raise exception 'An unchanged restore configuration cannot create an event.'
        using errcode = '22023';
    end if;
  end loop;

  if jsonb_array_length(
    coalesce(restore_payload -> 'behavior_configuration_events', '[]'::jsonb)
  ) <> changed_configuration_count then
    raise exception 'Restore configuration event targets do not match affected behaviors.'
      using errcode = '22023';
  end if;

  return jsonb_set(
    restore_result,
    '{behavior_configuration_events}',
    to_jsonb(changed_configuration_count),
    true
  );
end;
$$;

revoke all on function public.create_behavior_with_schedule_graph(
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public, anon, service_role;
grant execute on function public.create_behavior_with_schedule_graph(
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to authenticated;

revoke all on function public.update_behavior_with_schedule_graph(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) from public, anon, service_role;
grant execute on function public.update_behavior_with_schedule_graph(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to authenticated;

revoke all on function public.update_profile_and_behavior_timezones_with_config_events(
  text,
  text,
  jsonb
) from public, anon, service_role;
grant execute on function public.update_profile_and_behavior_timezones_with_config_events(
  text,
  text,
  jsonb
) to authenticated;

revoke all on function public.apply_behaviorlog_restore_with_configuration_events(jsonb)
  from public, anon, service_role;
grant execute on function public.apply_behaviorlog_restore_with_configuration_events(jsonb)
  to authenticated;

revoke all on function public.create_behavior_with_definition_event(jsonb, jsonb)
  from authenticated;
revoke all on function public.update_behavior_with_definition_event(
  uuid,
  jsonb,
  jsonb,
  jsonb
) from authenticated;
revoke insert on table public.behavior_definition_events from authenticated;
grant select on table public.behavior_definition_events to authenticated;

revoke all on function public.apply_behaviorlog_restore(jsonb)
  from authenticated;

revoke all on function cadence_private.current_behavior_configuration_snapshot(
  uuid,
  uuid
) from public, anon, authenticated, service_role;
revoke all on function cadence_private.behavior_configuration_changed_fields(
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;
revoke all on function cadence_private.insert_behavior_configuration_event(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;
revoke all on function cadence_private.replace_behavior_schedule_graph(
  uuid,
  uuid,
  jsonb
) from authenticated;

revoke insert, update, delete on table public.behaviors from authenticated;
revoke insert, update, delete on table public.behavior_schedules from authenticated;
revoke insert, update, delete on table public.behavior_schedule_slots from authenticated;

drop policy if exists categories_delete_own on public.categories;
revoke delete on table public.categories from authenticated;
