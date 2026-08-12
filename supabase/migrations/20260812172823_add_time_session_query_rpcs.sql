begin;

create index occurrence_time_sessions_user_started_id_idx
  on public.occurrence_time_sessions (user_id, started_at asc, id asc);

create or replace function public.list_my_occurrence_time_sessions(
  occurrence_ids pg_catalog.uuid[]
)
returns table (
  id pg_catalog.uuid,
  user_id pg_catalog.uuid,
  occurrence_id pg_catalog.uuid,
  behavior_id pg_catalog.uuid,
  started_at pg_catalog.timestamptz,
  stopped_at pg_catalog.timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id pg_catalog.uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if occurrence_ids is null or pg_catalog.cardinality(occurrence_ids) = 0 then
    return;
  end if;

  if pg_catalog.cardinality(occurrence_ids) > 2000 then
    raise exception 'A maximum of 2000 occurrence IDs is allowed per call.'
      using errcode = '22023';
  end if;

  return query
  select
    session.id,
    session.user_id,
    session.occurrence_id,
    session.behavior_id,
    session.started_at,
    session.stopped_at
  from public.occurrence_time_sessions as session
  join (
    select distinct requested_occurrence_id
    from pg_catalog.unnest(occurrence_ids)
      as requested_occurrence(requested_occurrence_id)
  ) as requested
    on requested.requested_occurrence_id = session.occurrence_id
  where session.user_id = current_user_id
  order by session.started_at asc, session.id asc;
end;
$$;

create or replace function public.list_my_occurrence_time_session_history(
  range_start_local_date pg_catalog.date,
  range_end_local_date pg_catalog.date,
  include_archived pg_catalog.bool,
  through_started_at pg_catalog.timestamptz,
  cursor_started_at pg_catalog.timestamptz,
  cursor_session_id pg_catalog.uuid,
  page_size pg_catalog.int4
)
returns table (
  id pg_catalog.uuid,
  user_id pg_catalog.uuid,
  occurrence_id pg_catalog.uuid,
  behavior_id pg_catalog.uuid,
  started_at pg_catalog.timestamptz,
  stopped_at pg_catalog.timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id pg_catalog.uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if range_start_local_date is null
    or range_end_local_date is null
    or include_archived is null
    or through_started_at is null
  then
    raise exception 'History range, archive choice, and high-water instant are required.'
      using errcode = '22023';
  end if;

  if range_start_local_date > range_end_local_date then
    raise exception 'History range start must not follow its end.'
      using errcode = '22023';
  end if;

  if (cursor_started_at is null and cursor_session_id is not null)
    or (cursor_started_at is not null and cursor_session_id is null)
  then
    raise exception 'History cursor fields must both be null or both be supplied.'
      using errcode = '22023';
  end if;

  if page_size is null or page_size < 1 or page_size > 1000 then
    raise exception 'History page size must be between 1 and 1000.'
      using errcode = '22023';
  end if;

  return query
  select
    session.id,
    session.user_id,
    session.occurrence_id,
    session.behavior_id,
    session.started_at,
    session.stopped_at
  from public.occurrences as occurrence
  join public.occurrence_time_sessions as session
    on session.user_id = occurrence.user_id
    and session.occurrence_id = occurrence.id
    and session.behavior_id = occurrence.behavior_id
  join public.behaviors as behavior
    on behavior.user_id = occurrence.user_id
    and behavior.id = occurrence.behavior_id
  where occurrence.user_id = current_user_id
    and session.user_id = current_user_id
    and behavior.user_id = current_user_id
    and occurrence.local_date between range_start_local_date and range_end_local_date
    and (include_archived or behavior.active)
    and session.started_at <= through_started_at
    and (
      cursor_started_at is null
      or (session.started_at, session.id) > (cursor_started_at, cursor_session_id)
    )
  order by session.started_at asc, session.id asc
  limit page_size;
end;
$$;

revoke all on function public.list_my_occurrence_time_sessions(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_occurrence_time_sessions(uuid[])
  to authenticated;

revoke all on function public.list_my_occurrence_time_session_history(
  date,
  date,
  boolean,
  timestamptz,
  timestamptz,
  uuid,
  integer
)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_occurrence_time_session_history(
  date,
  date,
  boolean,
  timestamptz,
  timestamptz,
  uuid,
  integer
)
  to authenticated;

commit;
