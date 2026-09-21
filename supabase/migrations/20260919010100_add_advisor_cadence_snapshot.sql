begin;

create function cadence_private.advisor_cadence_snapshot_payload(
  owner_id uuid,
  target_local_date date,
  history_start_local_date date,
  selected_behavior_ids uuid[],
  history_occurrence_limit integer,
  history_session_limit integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with authorized_owner as (
    select owner_id as id
    where owner_id = (select auth.uid())
  ), selected_behaviors as (
    select behavior.*
    from public.behaviors as behavior
    join authorized_owner as owner on owner.id = behavior.user_id
    where behavior.user_id = owner_id
      and behavior.id = any(selected_behavior_ids)
      and behavior.active
    order by behavior.id
  ), day_occurrences as (
    select occurrence.*
    from public.occurrences as occurrence
    join selected_behaviors as behavior on behavior.id = occurrence.behavior_id
    where occurrence.user_id = owner_id
      and occurrence.local_date = target_local_date
    order by occurrence.scheduled_for, occurrence.id
    limit 201
  ), history_occurrences as (
    select occurrence.*
    from public.occurrences as occurrence
    join selected_behaviors as behavior on behavior.id = occurrence.behavior_id
    where occurrence.user_id = owner_id
      and occurrence.local_date >= history_start_local_date
      and occurrence.local_date < target_local_date
      and occurrence.status = 'completed'
    order by occurrence.local_date desc, occurrence.id
    limit history_occurrence_limit + 1
  ), history_sessions as (
    select session.*
    from public.occurrence_time_sessions as session
    join history_occurrences as occurrence on occurrence.id = session.occurrence_id
    where session.user_id = owner_id
    order by session.started_at, session.id
    limit history_session_limit + 1
  )
  select jsonb_build_object(
    'timezone', profile.timezone,
    'profileUpdatedAt', profile.updated_at,
    'behaviors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', behavior.id,
        'title', behavior.title,
        'defaultDurationMinutes', behavior.default_duration_minutes,
        'currentConfigurationEventId', behavior.current_configuration_event_id,
        'updatedAt', behavior.updated_at,
        'endDate', behavior.end_date
      ) order by behavior.id)
      from selected_behaviors as behavior
    ), '[]'::jsonb),
    'occurrences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', occurrence.id,
        'behaviorId', occurrence.behavior_id,
        'behaviorConfigurationEventId', occurrence.behavior_configuration_event_id,
        'scheduledFor', occurrence.scheduled_for,
        'localDate', occurrence.local_date,
        'scheduleKind', occurrence.schedule_kind,
        'scheduleStartTime', occurrence.schedule_start_time,
        'scheduleEndTime', occurrence.schedule_end_time,
        'status', occurrence.status,
        'updatedAt', occurrence.updated_at
      ) order by occurrence.scheduled_for, occurrence.id)
      from day_occurrences as occurrence
    ), '[]'::jsonb),
    'historyOccurrences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', occurrence.id,
        'behaviorId', occurrence.behavior_id,
        'localDate', occurrence.local_date,
        'status', occurrence.status
      ) order by occurrence.local_date desc, occurrence.id)
      from history_occurrences as occurrence
    ), '[]'::jsonb),
    'historySessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', session.id,
        'occurrenceId', session.occurrence_id,
        'behaviorId', session.behavior_id,
        'startedAt', session.started_at,
        'stoppedAt', session.stopped_at
      ) order by session.started_at, session.id)
      from history_sessions as session
    ), '[]'::jsonb),
    'syncState', (
      select to_jsonb(sync_state)
      from (
        select state.timezone, state.last_synced_local_date,
          state.synced_through_local_date, state.last_successful_sync_at,
          state.stale, state.stale_reason, state.state_version, state.updated_at
        from public.occurrence_sync_state as state
        where state.user_id = owner_id
      ) as sync_state
    ),
    'dueArchiveCount', (
      select count(*)
      from public.behaviors as behavior
      where behavior.user_id = owner_id
        and behavior.id = any(selected_behavior_ids)
        and behavior.active
        and behavior.end_date is not null
        and target_local_date >= behavior.end_date
    ),
    'staleConfigurationCount', (
      select count(*)
      from day_occurrences as occurrence
      join selected_behaviors as behavior on behavior.id = occurrence.behavior_id
      where occurrence.status = 'unresolved'
        and occurrence.behavior_configuration_event_id is distinct from behavior.current_configuration_event_id
    )
  )
  from public.profiles as profile
  join authorized_owner as owner on owner.id = profile.id
  where profile.id = owner_id;
$$;

create function public.read_advisor_cadence_snapshot(
  target_local_date date,
  history_start_local_date date,
  selected_behavior_ids uuid[],
  history_occurrence_limit integer,
  history_session_limit integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  owner_timezone text;
  payload jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select profile.timezone into owner_timezone
  from public.profiles as profile
  where profile.id = owner_id;
  if owner_timezone is null then
    raise exception 'Advisor profile is unavailable.' using errcode = 'P0002';
  end if;
  if target_local_date is null or history_start_local_date is null
    or target_local_date is distinct from (statement_timestamp() at time zone owner_timezone)::date
    or history_start_local_date is distinct from target_local_date - 90 then
    raise exception 'A valid advisor date range is required.' using errcode = '22023';
  end if;
  if selected_behavior_ids is null or cardinality(selected_behavior_ids) > 100
    or cardinality(selected_behavior_ids) <> cardinality(array(select distinct unnest(selected_behavior_ids))) then
    raise exception 'Advisor Behavior selection is invalid.' using errcode = '22023';
  end if;
  if history_occurrence_limit is distinct from 10000 or history_session_limit is distinct from 20000 then
    raise exception 'Advisor history limits are fixed.' using errcode = '22023';
  end if;

  payload := cadence_private.advisor_cadence_snapshot_payload(
    owner_id,
    target_local_date,
    history_start_local_date,
    selected_behavior_ids,
    history_occurrence_limit,
    history_session_limit
  );
  if payload is null then
    raise exception 'Advisor profile is unavailable.' using errcode = 'P0002';
  end if;

  return payload || jsonb_build_object(
    'observedAt', clock_timestamp(),
    'revision', encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex')
  );
end;
$$;

create function public.read_advisor_cadence_revision(
  target_local_date date,
  history_start_local_date date,
  selected_behavior_ids uuid[],
  history_occurrence_limit integer,
  history_session_limit integer
)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  owner_timezone text;
  payload jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select profile.timezone into owner_timezone
  from public.profiles as profile
  where profile.id = owner_id;
  if owner_timezone is null then
    raise exception 'Advisor profile is unavailable.' using errcode = 'P0002';
  end if;
  if target_local_date is null or history_start_local_date is null
    or target_local_date is distinct from (statement_timestamp() at time zone owner_timezone)::date
    or history_start_local_date is distinct from target_local_date - 90
    or selected_behavior_ids is null or cardinality(selected_behavior_ids) > 100
    or history_occurrence_limit is distinct from 10000 or history_session_limit is distinct from 20000 then
    raise exception 'Advisor revision request is invalid.' using errcode = '22023';
  end if;

  payload := cadence_private.advisor_cadence_snapshot_payload(
    owner_id,
    target_local_date,
    history_start_local_date,
    selected_behavior_ids,
    history_occurrence_limit,
    history_session_limit
  );
  if payload is null then
    raise exception 'Advisor profile is unavailable.' using errcode = 'P0002';
  end if;
  return encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function public.read_advisor_cadence_snapshot(date, date, uuid[], integer, integer) from public, anon, service_role;
revoke all on function public.read_advisor_cadence_revision(date, date, uuid[], integer, integer) from public, anon, service_role;
revoke all on function cadence_private.advisor_cadence_snapshot_payload(uuid, date, date, uuid[], integer, integer) from public, anon, authenticated, service_role;
grant execute on function cadence_private.advisor_cadence_snapshot_payload(uuid, date, date, uuid[], integer, integer) to authenticated;
grant execute on function public.read_advisor_cadence_snapshot(date, date, uuid[], integer, integer) to authenticated;
grant execute on function public.read_advisor_cadence_revision(date, date, uuid[], integer, integer) to authenticated;

commit;
