begin;

create function cadence_private.behavior_end_date_boundary(
  end_date date,
  timezone text
)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  with local_value as (
    select end_date::timestamp as local_timestamp
  ), default_value as (
    select
      local_timestamp,
      local_timestamp at time zone timezone as default_instant
    from local_value
  ), nearby_offsets as (
    select
      local_timestamp,
      default_instant,
      (sample_instant at time zone timezone) -
        (sample_instant at time zone 'UTC') as utc_offset
    from default_value
    cross join lateral unnest(array[
      default_instant - interval '1 day',
      default_instant,
      default_instant + interval '1 day'
    ]) as sample(sample_instant)
  ), candidates as (
    select
      default_instant,
      (local_timestamp - utc_offset) at time zone 'UTC' as candidate_instant,
      local_timestamp
    from nearby_offsets
  )
  select coalesce(
    min(candidate_instant) filter (
      where candidate_instant at time zone timezone = local_timestamp
    ),
    min(default_instant)
  )
  from candidates;
$$;

create function cadence_private.archive_due_behaviors_for_owner(
  target_user_id uuid,
  processed_at timestamptz,
  batch_limit integer
)
returns table (behavior_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  candidate record;
  previous_configuration jsonb;
  next_configuration jsonb;
  changed_fields text[];
  configuration_event_id uuid;
  archived_at_text text;
begin
  if processed_at is null then
    raise exception 'Archive processing time is required.' using errcode = '23502';
  end if;

  if batch_limit is null or batch_limit < 1 or batch_limit > 100 then
    raise exception 'Archive batch limit must be between 1 and 100.' using errcode = '22023';
  end if;

  archived_at_text := to_char(
    processed_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );

  for candidate in
    select behavior.id, behavior.user_id
    from public.behaviors as behavior
    where behavior.active
      and behavior.end_date is not null
      and (processed_at at time zone behavior.timezone)::date >= behavior.end_date
      and (target_user_id is null or behavior.user_id = target_user_id)
    order by behavior.user_id, behavior.end_date, behavior.id
    limit batch_limit
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate.user_id::text, 0)
    );

    select behavior.*
    into candidate
    from public.behaviors as behavior
    where behavior.user_id = candidate.user_id
      and behavior.id = candidate.id
      and behavior.active
      and behavior.end_date is not null
      and (processed_at at time zone behavior.timezone)::date >= behavior.end_date
    for update;

    if not found then
      continue;
    end if;

    previous_configuration := cadence_private.current_behavior_configuration_snapshot(
      candidate.user_id,
      candidate.id
    );

    update public.behaviors as behavior
    set
      active = false,
      archived_at = processed_at,
      auto_archived_at = processed_at,
      archive_notes = behavior.archive_notes || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'archived_at', archived_at_text,
        'note', 'Automatically archived on the end date.',
        'updated_at', archived_at_text
      ))
    where behavior.user_id = candidate.user_id
      and behavior.id = candidate.id;

    next_configuration := cadence_private.current_behavior_configuration_snapshot(
      candidate.user_id,
      candidate.id
    );
    changed_fields := cadence_private.behavior_configuration_changed_fields(
      previous_configuration,
      next_configuration
    );

    if changed_fields is distinct from array['active']::text[] then
      raise exception 'Automatic archive changed unexpected configuration fields.'
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
      candidate.user_id,
      candidate.id,
      'revision',
      previous_configuration,
      next_configuration,
      changed_fields,
      processed_at,
      cadence_private.behavior_end_date_boundary(
        candidate.end_date,
        candidate.timezone
      ),
      candidate.end_date,
      candidate.timezone,
      'system',
      'behavior_end_date_reached'
    )
    returning id into configuration_event_id;

    update public.behaviors as behavior
    set current_configuration_event_id = configuration_event_id
    where behavior.user_id = candidate.user_id
      and behavior.id = candidate.id;

    insert into public.occurrence_sync_state (
      user_id,
      timezone,
      stale,
      stale_reason
    )
    values (
      candidate.user_id,
      candidate.timezone,
      true,
      'behavior_changed'
    )
    on conflict on constraint occurrence_sync_state_pkey do update
    set
      timezone = excluded.timezone,
      stale = true,
      stale_reason = 'behavior_changed';

    update public.reminder_deliveries as delivery
    set
      status = 'cancelled',
      error = null
    from public.occurrences as occurrence
    where occurrence.user_id = candidate.user_id
      and occurrence.behavior_id = candidate.id
      and delivery.user_id = occurrence.user_id
      and delivery.occurrence_id = occurrence.id
      and delivery.status = 'pending';

    behavior_id := candidate.id;
    user_id := candidate.user_id;
    return next;
  end loop;
end;
$$;

create function public.archive_my_due_behaviors(
  batch_limit integer default 100
)
returns table (behavior_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  select archived.behavior_id, archived.user_id
  from cadence_private.archive_due_behaviors_for_owner(
    current_user_id,
    clock_timestamp(),
    batch_limit
  ) as archived;
end;
$$;

create function public.archive_due_behaviors(
  processed_at timestamptz,
  batch_limit integer default 100
)
returns table (behavior_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'Service-role authentication is required.' using errcode = '42501';
  end if;

  return query
  select archived.behavior_id, archived.user_id
  from cadence_private.archive_due_behaviors_for_owner(
    null,
    processed_at,
    batch_limit
  ) as archived;
end;
$$;

revoke all on function cadence_private.archive_due_behaviors_for_owner(
  uuid,
  timestamptz,
  integer
) from public, anon, authenticated, service_role;

revoke all on function cadence_private.behavior_end_date_boundary(date, text)
  from public, anon, authenticated, service_role;

revoke all on function public.archive_my_due_behaviors(integer) from public, anon;
grant execute on function public.archive_my_due_behaviors(integer) to authenticated;

revoke all on function public.archive_due_behaviors(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.archive_due_behaviors(timestamptz, integer)
  to service_role;

commit;
