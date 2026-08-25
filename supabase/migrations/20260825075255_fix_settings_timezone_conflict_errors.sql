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
      using errcode = 'P0001';
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
      using errcode = 'P0001';
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
        using errcode = 'P0001';
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
