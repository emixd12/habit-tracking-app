create schema if not exists cadence_private;

revoke all on schema cadence_private from public;
revoke all on schema cadence_private from anon;
revoke all on schema cadence_private from authenticated;

create or replace function cadence_private.ticket_060_compatible_instant(
  local_date date,
  local_time time,
  timezone_name text
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  local_timestamp timestamp := local_date + local_time;
  postgres_compatible_instant timestamptz;
  earliest_matching_instant timestamptz;
begin
  postgres_compatible_instant := local_timestamp at time zone timezone_name;

  select min(candidate)
  into earliest_matching_instant
  from pg_catalog.generate_series(
    postgres_compatible_instant - interval '1 day',
    postgres_compatible_instant + interval '1 day',
    interval '15 minutes'
  ) as candidate
  where candidate at time zone timezone_name = local_timestamp;

  return coalesce(earliest_matching_instant, postgres_compatible_instant);
end;
$$;

create or replace function cadence_private.ticket_060_matches_recurrence(
  recurrence_rule jsonb,
  anchor_date date,
  candidate_date date
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  frequency text := recurrence_rule ->> 'frequency';
  interval_value integer;
  weekday_name text;
  weeks_from_anchor integer;
  months_from_anchor integer;
  requested_day integer;
  last_day integer;
begin
  if candidate_date < anchor_date then
    return false;
  end if;

  case frequency
    when 'daily' then
      interval_value := (recurrence_rule ->> 'interval')::integer;
      return (candidate_date - anchor_date) % interval_value = 0;

    when 'interval_days' then
      interval_value := (recurrence_rule ->> 'intervalDays')::integer;
      return (candidate_date - anchor_date) % interval_value = 0;

    when 'weekly' then
      interval_value := (recurrence_rule ->> 'interval')::integer;
      weekday_name := case extract(isodow from candidate_date)::integer
        when 1 then 'monday'
        when 2 then 'tuesday'
        when 3 then 'wednesday'
        when 4 then 'thursday'
        when 5 then 'friday'
        when 6 then 'saturday'
        when 7 then 'sunday'
      end;
      weeks_from_anchor := (
        date_trunc('week', candidate_date)::date
        - date_trunc('week', anchor_date)::date
      ) / 7;
      return recurrence_rule -> 'daysOfWeek' ? weekday_name
        and weeks_from_anchor >= 0
        and weeks_from_anchor % interval_value = 0;

    when 'monthly' then
      interval_value := (recurrence_rule ->> 'interval')::integer;
      requested_day := (recurrence_rule ->> 'dayOfMonth')::integer;
      months_from_anchor :=
        (extract(year from candidate_date)::integer
          - extract(year from anchor_date)::integer) * 12
        + extract(month from candidate_date)::integer
        - extract(month from anchor_date)::integer;
      last_day := extract(
        day from date_trunc('month', candidate_date)
          + interval '1 month' - interval '1 day'
      )::integer;
      return months_from_anchor >= 0
        and months_from_anchor % interval_value = 0
        and extract(day from candidate_date)::integer
          = least(requested_day, last_day);

    else
      raise exception 'Unsupported recurrence frequency in schedule repair.'
        using errcode = '22023';
  end case;
end;
$$;

create or replace function cadence_private.repair_empty_behavior_schedules(
  repair_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  repaired_schedule_count integer := 0;
  repaired_slot_count integer := 0;
  repaired_occurrence_count integer := 0;
  affected_user_count integer := 0;
begin
  create temporary table if not exists ticket_060_repaired_schedules (
    schedule_id uuid primary key,
    user_id uuid not null,
    behavior_id uuid not null
  ) on commit drop;

  truncate table pg_temp.ticket_060_repaired_schedules;

  insert into pg_temp.ticket_060_repaired_schedules (
    schedule_id,
    user_id,
    behavior_id
  )
  select
    schedules.id,
    schedules.user_id,
    schedules.behavior_id
  from public.behavior_schedules as schedules
  join public.behaviors as behaviors
    on behaviors.user_id = schedules.user_id
   and behaviors.id = schedules.behavior_id
  where not exists (
    select 1
    from public.behavior_schedule_slots as slots
    where slots.user_id = schedules.user_id
      and slots.behavior_id = schedules.behavior_id
      and slots.behavior_schedule_id = schedules.id
  );

  get diagnostics repaired_schedule_count = row_count;

  select count(distinct user_id)
  into affected_user_count
  from pg_temp.ticket_060_repaired_schedules;

  insert into public.behavior_schedule_slots (
    user_id,
    behavior_id,
    behavior_schedule_id,
    kind,
    preset,
    start_time,
    end_time,
    sort_order
  )
  select
    repaired.user_id,
    repaired.behavior_id,
    repaired.schedule_id,
    'exact',
    null,
    behaviors.scheduled_time,
    null,
    0
  from pg_temp.ticket_060_repaired_schedules as repaired
  join public.behaviors as behaviors
    on behaviors.user_id = repaired.user_id
   and behaviors.id = repaired.behavior_id
  on conflict (behavior_schedule_id, start_time)
    where behavior_schedule_id is not null
    do nothing;

  get diagnostics repaired_slot_count = row_count;

  with repaired_candidates as (
    select
      repaired.user_id,
      repaired.behavior_id,
      slots.id as schedule_slot_id,
      slots.start_time,
      behaviors.timezone,
      schedules.recurrence_rule,
      (behaviors.created_at at time zone behaviors.timezone)::date as anchor_date,
      generated.local_date
    from pg_temp.ticket_060_repaired_schedules as repaired
    join public.behaviors as behaviors
      on behaviors.user_id = repaired.user_id
     and behaviors.id = repaired.behavior_id
     and behaviors.active = true
    join public.behavior_schedules as schedules
      on schedules.user_id = repaired.user_id
     and schedules.behavior_id = repaired.behavior_id
     and schedules.id = repaired.schedule_id
    join public.behavior_schedule_slots as slots
      on slots.user_id = repaired.user_id
     and slots.behavior_id = repaired.behavior_id
     and slots.behavior_schedule_id = repaired.schedule_id
     and slots.kind = 'exact'
     and slots.preset is null
     and slots.end_time is null
    cross join lateral (
      select generated_date::date as local_date
      from pg_catalog.generate_series(
        (behaviors.created_at at time zone behaviors.timezone)::date,
        (repair_now at time zone behaviors.timezone)::date + 30,
        interval '1 day'
      ) as generated_date
    ) as generated
    where cadence_private.ticket_060_matches_recurrence(
      schedules.recurrence_rule,
      (behaviors.created_at at time zone behaviors.timezone)::date,
      generated.local_date
    )
  )
  insert into public.occurrences (
    user_id,
    behavior_id,
    scheduled_for,
    local_date,
    status,
    behavior_schedule_slot_id,
    schedule_kind,
    schedule_preset,
    schedule_start_time,
    schedule_end_time
  )
  select
    candidates.user_id,
    candidates.behavior_id,
    cadence_private.ticket_060_compatible_instant(
      candidates.local_date,
      candidates.start_time,
      candidates.timezone
    ),
    candidates.local_date,
    'unresolved',
    candidates.schedule_slot_id,
    'exact',
    null,
    candidates.start_time,
    null
  from repaired_candidates as candidates
  on conflict (behavior_id, scheduled_for) do nothing;

  get diagnostics repaired_occurrence_count = row_count;

  insert into public.occurrence_sync_state (
    user_id,
    timezone,
    stale,
    stale_reason
  )
  select
    repaired.user_id,
    coalesce(profiles.timezone, 'America/New_York'),
    true,
    'manual_repair'
  from (
    select distinct user_id
    from pg_temp.ticket_060_repaired_schedules
  ) as repaired
  left join public.profiles as profiles
    on profiles.id = repaired.user_id
  on conflict (user_id) do update
  set
    stale = true,
    stale_reason = 'manual_repair';

  return jsonb_build_object(
    'repaired_schedules', repaired_schedule_count,
    'repaired_slots', repaired_slot_count,
    'repaired_occurrences', repaired_occurrence_count,
    'affected_users', affected_user_count
  );
end;
$$;

do $$
begin
  perform cadence_private.repair_empty_behavior_schedules(now());
end;
$$;

create or replace function cadence_private.validate_behavior_schedule_graph(
  schedule_graph jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  schedule_entry jsonb;
  time_entry jsonb;
  recurrence_rule jsonb;
  schedule_id text;
  time_entry_id text;
  schedule_sort_order text;
  time_entry_sort_order text;
  start_time text;
  end_time text;
  kind text;
  preset text;
  seen_schedule_ids text[] := array[]::text[];
  seen_time_entry_ids text[] := array[]::text[];
  seen_schedule_sort_orders text[] := array[]::text[];
  seen_time_entry_sort_orders text[];
  seen_start_times text[];
begin
  if schedule_graph is null
    or jsonb_typeof(schedule_graph) <> 'array'
    or jsonb_array_length(schedule_graph) = 0
    or jsonb_array_length(schedule_graph) > 6
  then
    raise exception 'A behavior needs between one and six schedules.'
      using errcode = '22023';
  end if;

  for schedule_entry in
    select value from jsonb_array_elements(schedule_graph)
  loop
    if jsonb_typeof(schedule_entry) <> 'object' then
      raise exception 'Every schedule must be an object.' using errcode = '22023';
    end if;

    schedule_id := nullif(schedule_entry ->> 'id', '');
    if schedule_id is not null then
      if schedule_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or array_position(seen_schedule_ids, schedule_id) is not null
      then
        raise exception 'Schedule ids must be unique valid UUIDs.'
          using errcode = '22023';
      end if;
      seen_schedule_ids := array_append(seen_schedule_ids, schedule_id);
    end if;

    schedule_sort_order := schedule_entry ->> 'sort_order';
    if not coalesce(schedule_sort_order ~ '^(0|[1-9][0-9]*)$', false)
      or array_position(seen_schedule_sort_orders, schedule_sort_order) is not null
    then
      raise exception 'Schedule sort orders must be unique non-negative integers.'
        using errcode = '22023';
    end if;
    seen_schedule_sort_orders := array_append(
      seen_schedule_sort_orders,
      schedule_sort_order
    );

    recurrence_rule := schedule_entry -> 'recurrence_rule';
    if recurrence_rule is null or jsonb_typeof(recurrence_rule) <> 'object' then
      raise exception 'Every schedule needs a recurrence rule.'
        using errcode = '22023';
    end if;

    case recurrence_rule ->> 'frequency'
      when 'daily' then
        if not coalesce(
          (recurrence_rule ->> 'interval') ~ '^[1-9][0-9]*$',
          false
        ) then
          raise exception 'Daily intervals must be positive integers.'
            using errcode = '22023';
        end if;

      when 'interval_days' then
        if not coalesce(
          (recurrence_rule ->> 'intervalDays') ~ '^[1-9][0-9]*$',
          false
        ) then
          raise exception 'Day intervals must be positive integers.'
            using errcode = '22023';
        end if;

      when 'weekly' then
        if not coalesce(
          (recurrence_rule ->> 'interval') ~ '^[1-9][0-9]*$',
          false
        )
          or jsonb_typeof(recurrence_rule -> 'daysOfWeek') <> 'array'
          or jsonb_array_length(recurrence_rule -> 'daysOfWeek') = 0
          or exists (
            select 1
            from jsonb_array_elements_text(
              recurrence_rule -> 'daysOfWeek'
            ) as weekday(value)
            where weekday.value not in (
              'monday',
              'tuesday',
              'wednesday',
              'thursday',
              'friday',
              'saturday',
              'sunday'
            )
          )
          or (
            select count(*)
            from jsonb_array_elements_text(recurrence_rule -> 'daysOfWeek')
          ) <> (
            select count(distinct value)
            from jsonb_array_elements_text(
              recurrence_rule -> 'daysOfWeek'
            ) as weekday(value)
          )
        then
          raise exception 'Weekly recurrence rules are malformed.'
            using errcode = '22023';
        end if;

      when 'monthly' then
        if not coalesce(
          (recurrence_rule ->> 'interval') ~ '^[1-9][0-9]*$',
          false
        )
          or not coalesce(
            (recurrence_rule ->> 'dayOfMonth') ~ '^([1-9]|[12][0-9]|3[01])$',
            false
          )
        then
          raise exception 'Monthly recurrence rules are malformed.'
            using errcode = '22023';
        end if;

      else
        raise exception 'Unsupported recurrence frequency.' using errcode = '22023';
    end case;

    if not (schedule_entry ? 'time_entries')
      or jsonb_typeof(schedule_entry -> 'time_entries') <> 'array'
      or jsonb_array_length(schedule_entry -> 'time_entries') = 0
      or jsonb_array_length(schedule_entry -> 'time_entries') > 8
    then
      raise exception 'Every schedule needs between one and eight time entries.'
        using errcode = '22023';
    end if;

    seen_time_entry_sort_orders := array[]::text[];
    seen_start_times := array[]::text[];

    for time_entry in
      select value from jsonb_array_elements(schedule_entry -> 'time_entries')
    loop
      if jsonb_typeof(time_entry) <> 'object' then
        raise exception 'Every time entry must be an object.'
          using errcode = '22023';
      end if;

      time_entry_id := nullif(time_entry ->> 'id', '');
      if time_entry_id is not null then
        if time_entry_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or array_position(seen_time_entry_ids, time_entry_id) is not null
        then
          raise exception 'Time entry ids must be unique valid UUIDs.'
            using errcode = '22023';
        end if;
        seen_time_entry_ids := array_append(seen_time_entry_ids, time_entry_id);
      end if;

      time_entry_sort_order := time_entry ->> 'sort_order';
      if not coalesce(time_entry_sort_order ~ '^(0|[1-9][0-9]*)$', false)
        or array_position(
          seen_time_entry_sort_orders,
          time_entry_sort_order
        ) is not null
      then
        raise exception 'Time entry sort orders must be unique non-negative integers.'
          using errcode = '22023';
      end if;
      seen_time_entry_sort_orders := array_append(
        seen_time_entry_sort_orders,
        time_entry_sort_order
      );

      start_time := time_entry ->> 'start_time';
      end_time := time_entry ->> 'end_time';
      kind := time_entry ->> 'kind';
      preset := time_entry ->> 'preset';

      if not coalesce(
        start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$',
        false
      )
        or array_position(seen_start_times, start_time) is not null
      then
        raise exception 'Time entry start times must be valid and unique within a schedule.'
          using errcode = '22023';
      end if;
      seen_start_times := array_append(seen_start_times, start_time);

      if kind = 'exact' then
        if preset is not null or end_time is not null then
          raise exception 'Exact time entries cannot have a preset or end time.'
            using errcode = '22023';
        end if;
      elsif kind = 'range' then
        if not coalesce(
          end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$',
          false
        )
          or start_time::time = end_time::time
          or (
            preset is not null
            and preset not in ('morning', 'afternoon', 'evening', 'night')
          )
        then
          raise exception 'Range time entries are malformed.'
            using errcode = '22023';
        end if;
      else
        raise exception 'Unsupported time entry kind.' using errcode = '22023';
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function cadence_private.current_behavior_schedule_graph(
  target_user_id uuid,
  target_behavior_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', schedules.id::text,
        'recurrence_rule', schedules.recurrence_rule,
        'sort_order', schedules.sort_order,
        'time_entries', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', slots.id::text,
                'kind', slots.kind,
                'preset', slots.preset,
                'start_time', slots.start_time::text,
                'end_time', case
                  when slots.end_time is null then null
                  else to_jsonb(slots.end_time::text)
                end,
                'sort_order', slots.sort_order
              )
              order by slots.sort_order, slots.start_time, slots.id
            )
            from public.behavior_schedule_slots as slots
            where slots.user_id = schedules.user_id
              and slots.behavior_id = schedules.behavior_id
              and slots.behavior_schedule_id = schedules.id
          ),
          '[]'::jsonb
        )
      )
      order by schedules.sort_order, schedules.id
    ),
    '[]'::jsonb
  )
  from public.behavior_schedules as schedules
  where schedules.user_id = target_user_id
    and schedules.behavior_id = target_behavior_id;
$$;

create or replace function cadence_private.replace_behavior_schedule_graph(
  target_user_id uuid,
  target_behavior_id uuid,
  schedule_graph jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  schedule_entry jsonb;
  time_entry jsonb;
  saved_schedule_id uuid;
  saved_time_entry_id uuid;
  requested_schedule_id uuid;
  requested_time_entry_id uuid;
  retained_schedule_ids uuid[] := array[]::uuid[];
  retained_time_entry_ids uuid[] := array[]::uuid[];
begin
  perform cadence_private.validate_behavior_schedule_graph(schedule_graph);

  with ranked_slots as (
    select
      slots.id,
      row_number() over (order by slots.id) as temporary_position
    from public.behavior_schedule_slots as slots
    where slots.user_id = target_user_id
      and slots.behavior_id = target_behavior_id
  )
  update public.behavior_schedule_slots as slots
  set start_time = (
    time '00:00' + ranked_slots.temporary_position * interval '1 microsecond'
  )::time
  from ranked_slots
  where slots.id = ranked_slots.id;

  for schedule_entry in
    select value
    from jsonb_array_elements(schedule_graph)
    order by (value ->> 'sort_order')::integer
  loop
    requested_schedule_id := nullif(schedule_entry ->> 'id', '')::uuid;

    if requested_schedule_id is null then
      insert into public.behavior_schedules (
        user_id,
        behavior_id,
        recurrence_rule,
        sort_order
      )
      values (
        target_user_id,
        target_behavior_id,
        schedule_entry -> 'recurrence_rule',
        (schedule_entry ->> 'sort_order')::integer
      )
      returning id into saved_schedule_id;
    else
      update public.behavior_schedules
      set
        recurrence_rule = schedule_entry -> 'recurrence_rule',
        sort_order = (schedule_entry ->> 'sort_order')::integer
      where id = requested_schedule_id
        and user_id = target_user_id
        and behavior_id = target_behavior_id
      returning id into saved_schedule_id;

      if not found then
        raise exception 'Behavior schedule graph changed after it was read.'
          using errcode = '40001';
      end if;
    end if;

    retained_schedule_ids := array_append(
      retained_schedule_ids,
      saved_schedule_id
    );

    for time_entry in
      select value
      from jsonb_array_elements(schedule_entry -> 'time_entries')
      order by (value ->> 'sort_order')::integer
    loop
      requested_time_entry_id := nullif(time_entry ->> 'id', '')::uuid;

      if requested_time_entry_id is null then
        insert into public.behavior_schedule_slots (
          user_id,
          behavior_id,
          behavior_schedule_id,
          kind,
          preset,
          start_time,
          end_time,
          sort_order
        )
        values (
          target_user_id,
          target_behavior_id,
          saved_schedule_id,
          time_entry ->> 'kind',
          time_entry ->> 'preset',
          (time_entry ->> 'start_time')::time,
          nullif(time_entry ->> 'end_time', '')::time,
          (time_entry ->> 'sort_order')::integer
        )
        returning id into saved_time_entry_id;
      else
        update public.behavior_schedule_slots
        set
          behavior_schedule_id = saved_schedule_id,
          kind = time_entry ->> 'kind',
          preset = time_entry ->> 'preset',
          start_time = (time_entry ->> 'start_time')::time,
          end_time = nullif(time_entry ->> 'end_time', '')::time,
          sort_order = (time_entry ->> 'sort_order')::integer
        where id = requested_time_entry_id
          and user_id = target_user_id
          and behavior_id = target_behavior_id
          and (
            behavior_schedule_id is null
            or behavior_schedule_id = saved_schedule_id
          )
        returning id into saved_time_entry_id;

        if not found then
          raise exception 'Behavior time-entry graph changed after it was read.'
            using errcode = '40001';
        end if;
      end if;

      retained_time_entry_ids := array_append(
        retained_time_entry_ids,
        saved_time_entry_id
      );
    end loop;
  end loop;

  delete from public.behavior_schedule_slots
  where user_id = target_user_id
    and behavior_id = target_behavior_id
    and not (id = any(retained_time_entry_ids));

  delete from public.behavior_schedules
  where user_id = target_user_id
    and behavior_id = target_behavior_id
    and not (id = any(retained_schedule_ids));
end;
$$;

create or replace function public.create_behavior_with_schedule_graph(
  behavior_payload jsonb,
  definition_event_plan jsonb,
  schedule_graph jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  created_behavior jsonb;
  created_behavior_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform cadence_private.validate_behavior_schedule_graph(schedule_graph);

  created_behavior := public.create_behavior_with_definition_event(
    behavior_payload,
    definition_event_plan
  );
  created_behavior_id := (created_behavior ->> 'id')::uuid;

  perform cadence_private.replace_behavior_schedule_graph(
    current_user_id,
    created_behavior_id,
    schedule_graph
  );

  insert into public.occurrence_sync_state (
    user_id,
    timezone,
    stale,
    stale_reason
  )
  values (
    current_user_id,
    created_behavior ->> 'timezone',
    true,
    'behavior_changed'
  )
  on conflict (user_id) do update
  set
    timezone = excluded.timezone,
    stale = true,
    stale_reason = 'behavior_changed';

  return created_behavior;
end;
$$;

create or replace function public.update_behavior_with_schedule_graph(
  target_behavior_id uuid,
  behavior_payload jsonb,
  expected_definition jsonb,
  expected_schedule_graph jsonb,
  expected_updated_at timestamptz,
  definition_event_plan jsonb,
  schedule_graph jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_behavior public.behaviors;
  current_schedule_graph jsonb;
  updated_behavior jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform cadence_private.validate_behavior_schedule_graph(schedule_graph);

  if expected_schedule_graph is null
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
  then
    raise exception 'Behavior schedule graph changed after it was read.'
      using errcode = '40001';
  end if;

  updated_behavior := public.update_behavior_with_definition_event(
    target_behavior_id,
    behavior_payload,
    expected_definition,
    definition_event_plan
  );

  if updated_behavior is null then
    return null;
  end if;

  perform cadence_private.replace_behavior_schedule_graph(
    current_user_id,
    target_behavior_id,
    schedule_graph
  );

  insert into public.occurrence_sync_state (
    user_id,
    timezone,
    stale,
    stale_reason
  )
  values (
    current_user_id,
    updated_behavior ->> 'timezone',
    true,
    'behavior_changed'
  )
  on conflict (user_id) do update
  set
    timezone = excluded.timezone,
    stale = true,
    stale_reason = 'behavior_changed';

  return updated_behavior;
end;
$$;

revoke all on function cadence_private.ticket_060_compatible_instant(date, time, text)
  from public;
revoke all on function cadence_private.ticket_060_matches_recurrence(jsonb, date, date)
  from public;
revoke all on function cadence_private.repair_empty_behavior_schedules(timestamptz)
  from public;
revoke all on function cadence_private.validate_behavior_schedule_graph(jsonb)
  from public;
revoke all on function cadence_private.current_behavior_schedule_graph(uuid, uuid)
  from public;
revoke all on function cadence_private.replace_behavior_schedule_graph(uuid, uuid, jsonb)
  from public;

grant usage on schema cadence_private to authenticated;
grant execute on function cadence_private.validate_behavior_schedule_graph(jsonb)
  to authenticated;
grant execute on function cadence_private.current_behavior_schedule_graph(uuid, uuid)
  to authenticated;
grant execute on function cadence_private.replace_behavior_schedule_graph(uuid, uuid, jsonb)
  to authenticated;

revoke all on function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb)
  from public;
revoke all on function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb)
  from anon;
grant execute on function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb)
  to authenticated;

revoke all on function public.update_behavior_with_schedule_graph(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  jsonb,
  jsonb
)
  from public;
revoke all on function public.update_behavior_with_schedule_graph(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  jsonb,
  jsonb
)
  from anon;
grant execute on function public.update_behavior_with_schedule_graph(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  jsonb,
  jsonb
)
  to authenticated;
