-- Preserve unchanged schedule and time-entry rows, including updated_at,
-- when another row in the accepted graph changes.
begin;

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

  -- Release only removed or changed start times. Unchanged rows must not fire
  -- updated_at triggers. Reserve times absent from both the current and final
  -- graph so retained subsecond times cannot collide with temporary values.
  with requested_slots as (
    select
      nullif(entry ->> 'id', '')::uuid as id,
      (entry ->> 'start_time')::time as start_time
    from jsonb_array_elements(schedule_graph) as schedule
    cross join lateral jsonb_array_elements(schedule -> 'time_entries') as entry
  ), owned_slots as (
    select slots.id, slots.start_time
    from public.behavior_schedule_slots as slots
    where slots.user_id = target_user_id
      and slots.behavior_id = target_behavior_id
  ), moving_slots as (
    select
      slots.id,
      row_number() over (order by slots.id) as temporary_position
    from owned_slots as slots
    where not exists (
      select 1 from requested_slots as requested
      where requested.id = slots.id
        and requested.start_time = slots.start_time
    )
  ), available_times as (
    select
      (time '00:00' + position * interval '1 microsecond')::time as start_time,
      row_number() over (order by position) as temporary_position
    from generate_series(1::bigint,
      (select count(*) from owned_slots)
      + (select count(*) from requested_slots)
      + (select count(*) from moving_slots)
    ) as candidates(position)
    where not exists (
      select 1 from owned_slots as slots
      where slots.start_time =
        (time '00:00' + position * interval '1 microsecond')::time
    ) and not exists (
      select 1 from requested_slots as requested
      where requested.start_time =
        (time '00:00' + position * interval '1 microsecond')::time
    )
  )
  update public.behavior_schedule_slots as slots
  set start_time = available_times.start_time
  from moving_slots
  join available_times using (temporary_position)
  where slots.id = moving_slots.id
    and slots.user_id = target_user_id
    and slots.behavior_id = target_behavior_id;

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
        and (
          recurrence_rule is distinct from schedule_entry -> 'recurrence_rule'
          or sort_order is distinct from (schedule_entry ->> 'sort_order')::integer
        )
      returning id into saved_schedule_id;

      if not found then
        select id into saved_schedule_id
        from public.behavior_schedules
        where id = requested_schedule_id
          and user_id = target_user_id
          and behavior_id = target_behavior_id
          and recurrence_rule is not distinct from schedule_entry -> 'recurrence_rule'
          and sort_order is not distinct from (schedule_entry ->> 'sort_order')::integer
        for update;
      end if;

      if not found then
        raise exception 'Behavior schedule graph changed after it was read.'
          using errcode = 'P0001';
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
          and row(behavior_schedule_id, kind, preset, start_time, end_time, sort_order)
            is distinct from row(
              saved_schedule_id,
              time_entry ->> 'kind',
              time_entry ->> 'preset',
              (time_entry ->> 'start_time')::time,
              nullif(time_entry ->> 'end_time', '')::time,
              (time_entry ->> 'sort_order')::integer
            )
        returning id into saved_time_entry_id;

        if not found then
          select id into saved_time_entry_id
          from public.behavior_schedule_slots
          where id = requested_time_entry_id
            and user_id = target_user_id
            and behavior_id = target_behavior_id
            and row(behavior_schedule_id, kind, preset, start_time, end_time, sort_order)
              is not distinct from row(
                saved_schedule_id,
                time_entry ->> 'kind',
                time_entry ->> 'preset',
                (time_entry ->> 'start_time')::time,
                nullif(time_entry ->> 'end_time', '')::time,
                (time_entry ->> 'sort_order')::integer
              )
          for update;
        end if;

        if not found then
          raise exception 'Behavior time-entry graph changed after it was read.'
            using errcode = 'P0001';
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

commit;
