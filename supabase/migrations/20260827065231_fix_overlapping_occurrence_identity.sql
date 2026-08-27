begin;

create or replace function cadence_private.ticket_085_matches_recurrence(
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
      raise exception 'Unsupported recurrence frequency in occurrence repair.'
        using errcode = '22023';
  end case;
end;
$$;

drop table if exists pg_temp.ticket_085_occurrence_backfill;

create temporary table ticket_085_occurrence_backfill on commit drop as
with matching_slots as (
  select
    seed.user_id,
    seed.behavior_id,
    seed.local_date,
    slots.id as behavior_schedule_slot_id,
    behaviors.current_configuration_event_id as behavior_configuration_event_id,
    slots.kind as schedule_kind,
    slots.preset as schedule_preset,
    slots.start_time as schedule_start_time,
    slots.end_time as schedule_end_time,
    case
      when slots.kind = 'exact' then -1::bigint
      else (extract(epoch from slots.end_time) * 1000000)::bigint
    end as schedule_range_identity,
    cadence_private.ticket_060_compatible_instant(
      seed.local_date,
      slots.start_time,
      behaviors.timezone
    ) as scheduled_for,
    schedules.sort_order as schedule_sort_order,
    slots.sort_order as slot_sort_order
  from public.occurrences as seed
  join public.behaviors as behaviors
    on behaviors.user_id = seed.user_id
   and behaviors.id = seed.behavior_id
  join public.behavior_schedules as schedules
    on schedules.user_id = seed.user_id
   and schedules.behavior_id = seed.behavior_id
  join public.behavior_schedule_slots as slots
    on slots.user_id = schedules.user_id
   and slots.behavior_id = schedules.behavior_id
   and slots.behavior_schedule_id = schedules.id
   and slots.start_time = seed.schedule_start_time
  where seed.local_date >=
      (schedules.created_at at time zone behaviors.timezone)::date
    and cadence_private.ticket_085_matches_recurrence(
      schedules.recurrence_rule,
      (behaviors.created_at at time zone behaviors.timezone)::date,
      seed.local_date
    )
), overlapping_slots as (
  select
    user_id,
    behavior_id,
    local_date,
    schedule_start_time
  from matching_slots
  group by user_id, behavior_id, local_date, schedule_start_time
  having count(distinct schedule_range_identity) > 1
)
select distinct on (
  candidates.user_id,
  candidates.behavior_id,
  candidates.local_date,
  candidates.schedule_start_time,
  candidates.schedule_range_identity
)
  candidates.user_id,
  candidates.behavior_id,
  candidates.behavior_schedule_slot_id,
  candidates.behavior_configuration_event_id,
  candidates.scheduled_for,
  candidates.local_date,
  candidates.schedule_kind,
  candidates.schedule_preset,
  candidates.schedule_start_time,
  candidates.schedule_end_time,
  candidates.schedule_range_identity
from matching_slots as candidates
join overlapping_slots as overlapping
  using (user_id, behavior_id, local_date, schedule_start_time)
where not exists (
  select 1
  from public.occurrences as existing
  where existing.user_id = candidates.user_id
    and existing.behavior_id = candidates.behavior_id
    and existing.local_date = candidates.local_date
    and existing.schedule_start_time = candidates.schedule_start_time
    and case
      when existing.schedule_kind = 'exact' then -1::bigint
      else (extract(epoch from existing.schedule_end_time) * 1000000)::bigint
    end = candidates.schedule_range_identity
)
order by
  candidates.user_id,
  candidates.behavior_id,
  candidates.local_date,
  candidates.schedule_start_time,
  candidates.schedule_range_identity,
  candidates.schedule_sort_order,
  candidates.slot_sort_order,
  candidates.behavior_schedule_slot_id;

do $$
declare
  missing_occurrence_count bigint;
  affected_account_count bigint;
  conflicting_existing_count bigint;
begin
  select count(*), count(distinct user_id)
  into missing_occurrence_count, affected_account_count
  from pg_temp.ticket_085_occurrence_backfill;

  raise notice
    'Ticket 085 detected % duplicate-suppressed occurrence(s) across % account(s).',
    missing_occurrence_count,
    affected_account_count;

  select count(*)
  into conflicting_existing_count
  from (
    select 1
    from public.occurrences
    group by
      behavior_id,
      local_date,
      schedule_start_time,
      case
        when schedule_kind = 'exact' then -1::bigint
        else (extract(epoch from schedule_end_time) * 1000000)::bigint
      end
    having count(*) > 1
  ) as conflicts;

  if conflicting_existing_count > 0 then
    raise exception
      'Ticket 085 found % existing occurrence identity conflict(s); no rows were changed.',
      conflicting_existing_count
      using errcode = '23505';
  end if;
end;
$$;

alter table public.occurrences
  drop constraint if exists occurrences_behavior_id_scheduled_for_key;

alter table public.occurrences
  add column if not exists schedule_range_identity bigint
  generated always as (
    case
      when schedule_kind = 'exact' then -1::bigint
      else (extract(epoch from schedule_end_time) * 1000000)::bigint
    end
  ) stored;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'occurrences_schedule_identity_key'
      and conrelid = 'public.occurrences'::regclass
  ) then
    alter table public.occurrences
      add constraint occurrences_schedule_identity_key
      unique (
        behavior_id,
        local_date,
        schedule_start_time,
        schedule_range_identity
      );
  end if;
end;
$$;

insert into public.occurrences (
  user_id,
  behavior_id,
  behavior_schedule_slot_id,
  behavior_configuration_event_id,
  scheduled_for,
  local_date,
  schedule_kind,
  schedule_preset,
  schedule_start_time,
  schedule_end_time,
  status
)
select
  user_id,
  behavior_id,
  behavior_schedule_slot_id,
  behavior_configuration_event_id,
  scheduled_for,
  local_date,
  schedule_kind,
  schedule_preset,
  schedule_start_time,
  schedule_end_time,
  'unresolved'
from pg_temp.ticket_085_occurrence_backfill
on conflict (
  behavior_id,
  local_date,
  schedule_start_time,
  schedule_range_identity
) do nothing;

create or replace function public.apply_occurrence_generation_plan(
  target_user_id uuid,
  target_behavior_id uuid,
  expected_configuration_event_id uuid,
  plan_now timestamptz,
  occurrence_inserts jsonb,
  occurrence_updates jsonb,
  occurrence_deletes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  current_configuration_event_id uuid;
  inserted_count integer := 0;
  updated_count integer := 0;
  lineage_updated_count integer := 0;
  deleted_count integer := 0;
begin
  if target_user_id is null
    or target_behavior_id is null
    or expected_configuration_event_id is null
    or plan_now is null
  then
    raise exception 'Occurrence generation ownership, lineage, and time are required.'
      using errcode = '23502';
  end if;

  if (
    authenticated_user_id is null
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
  ) or (
    authenticated_user_id is not null
    and authenticated_user_id is distinct from target_user_id
  ) then
    raise exception 'Occurrence generation owner does not match the authenticated user.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(occurrence_inserts, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(occurrence_updates, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(occurrence_deletes, '[]'::jsonb)) <> 'array'
  then
    raise exception 'Occurrence generation plan arrays are malformed.'
      using errcode = '22023';
  end if;

  occurrence_inserts := coalesce(occurrence_inserts, '[]'::jsonb);
  occurrence_updates := coalesce(occurrence_updates, '[]'::jsonb);
  occurrence_deletes := coalesce(occurrence_deletes, '[]'::jsonb);

  select behavior.current_configuration_event_id
  into current_configuration_event_id
  from public.behaviors as behavior
  where behavior.user_id = target_user_id
    and behavior.id = target_behavior_id
  for update;

  if not found then
    raise exception 'Behavior not found for occurrence generation.'
      using errcode = 'P0002';
  end if;

  if current_configuration_event_id is null
    or current_configuration_event_id is distinct from
      expected_configuration_event_id
  then
    raise exception 'Behavior configuration changed after occurrence planning.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(occurrence_inserts) as planned(
      behavior_schedule_slot_id uuid,
      behavior_configuration_event_id uuid
    )
    where planned.behavior_configuration_event_id is distinct from
      expected_configuration_event_id
  ) or exists (
    select 1
    from jsonb_to_recordset(occurrence_updates) as planned(
      behavior_configuration_event_id uuid
    )
    where planned.behavior_configuration_event_id is not null
      and planned.behavior_configuration_event_id is distinct from
        expected_configuration_event_id
  ) then
    raise exception 'Occurrence generation plan has stale or foreign lineage.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(occurrence_inserts) as planned(
      behavior_schedule_slot_id uuid
    )
    left join public.behavior_schedule_slots as slot
      on slot.user_id = target_user_id
      and slot.behavior_id = target_behavior_id
      and slot.id = planned.behavior_schedule_slot_id
    where planned.behavior_schedule_slot_id is not null
      and slot.id is null
  ) or exists (
    select 1
    from jsonb_to_recordset(occurrence_updates) as planned(
      behavior_schedule_slot_id uuid
    )
    left join public.behavior_schedule_slots as slot
      on slot.user_id = target_user_id
      and slot.behavior_id = target_behavior_id
      and slot.id = planned.behavior_schedule_slot_id
    where planned.behavior_schedule_slot_id is not null
      and slot.id is null
  ) then
    raise exception 'Occurrence generation plan has a foreign schedule slot.'
      using errcode = '23503';
  end if;

  insert into public.occurrences (
    user_id,
    behavior_id,
    behavior_schedule_slot_id,
    behavior_configuration_event_id,
    scheduled_for,
    local_date,
    schedule_kind,
    schedule_preset,
    schedule_start_time,
    schedule_end_time,
    status
  )
  select
    target_user_id,
    target_behavior_id,
    planned.behavior_schedule_slot_id,
    expected_configuration_event_id,
    planned.scheduled_for,
    planned.local_date,
    planned.schedule_kind,
    planned.schedule_preset,
    planned.schedule_start_time,
    planned.schedule_end_time,
    'unresolved'
  from jsonb_to_recordset(occurrence_inserts) as planned(
    scheduled_for timestamptz,
    local_date date,
    behavior_schedule_slot_id uuid,
    behavior_configuration_event_id uuid,
    schedule_kind text,
    schedule_preset text,
    schedule_start_time time,
    schedule_end_time time
  )
  on conflict (
    behavior_id,
    local_date,
    schedule_start_time,
    schedule_range_identity
  ) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count <> jsonb_array_length(occurrence_inserts) then
    raise exception 'Occurrence insert targets changed after planning.'
      using errcode = 'P0001';
  end if;

  with planned as (
    select *
    from jsonb_to_recordset(occurrence_updates) as update_plan(
      id uuid,
      previous_scheduled_for timestamptz,
      scheduled_for timestamptz,
      local_date date,
      behavior_schedule_slot_id uuid,
      behavior_configuration_event_id uuid,
      schedule_kind text,
      schedule_preset text,
      schedule_start_time time,
      schedule_end_time time
    )
  )
  update public.occurrences as occurrence
  set
    scheduled_for = planned.scheduled_for,
    behavior_schedule_slot_id = planned.behavior_schedule_slot_id,
    local_date = planned.local_date,
    schedule_kind = planned.schedule_kind,
    schedule_preset = planned.schedule_preset,
    schedule_start_time = planned.schedule_start_time,
    schedule_end_time = planned.schedule_end_time
  from planned
  where occurrence.user_id = target_user_id
    and occurrence.behavior_id = target_behavior_id
    and occurrence.id = planned.id
    and occurrence.scheduled_for = planned.previous_scheduled_for
    and occurrence.status = 'unresolved'
    and occurrence.scheduled_for > plan_now
    and btrim(coalesce(occurrence.note, '')) = ''
    and not exists (
      select 1
      from public.occurrence_time_sessions as session
      where session.user_id = occurrence.user_id
        and session.behavior_id = occurrence.behavior_id
        and session.occurrence_id = occurrence.id
    )
    and occurrence.behavior_configuration_event_id is not null
    and planned.behavior_configuration_event_id =
      expected_configuration_event_id;

  get diagnostics updated_count = row_count;

  if updated_count <> jsonb_array_length(occurrence_updates) then
    raise exception 'Occurrence update targets changed after planning.'
      using errcode = 'P0001';
  end if;

  with planned as (
    select *
    from jsonb_to_recordset(occurrence_updates) as update_plan(
      id uuid,
      behavior_configuration_event_id uuid
    )
  )
  update public.occurrences as occurrence
  set behavior_configuration_event_id = expected_configuration_event_id
  from planned
  where occurrence.user_id = target_user_id
    and occurrence.behavior_id = target_behavior_id
    and occurrence.id = planned.id
    and occurrence.behavior_configuration_event_id is null
    and planned.behavior_configuration_event_id =
      expected_configuration_event_id;

  get diagnostics lineage_updated_count = row_count;

  if lineage_updated_count <> jsonb_array_length(occurrence_updates) then
    raise exception 'Occurrence lineage update targets changed after planning.'
      using errcode = 'P0001';
  end if;

  with planned as (
    select *
    from jsonb_to_recordset(occurrence_deletes) as delete_plan(
      id uuid,
      scheduled_for timestamptz,
      local_date date,
      behavior_schedule_slot_id uuid,
      behavior_configuration_event_id uuid,
      schedule_kind text,
      schedule_preset text,
      schedule_start_time time,
      schedule_end_time time
    )
  )
  delete from public.occurrences as occurrence
  using planned
  where occurrence.user_id = target_user_id
    and occurrence.behavior_id = target_behavior_id
    and occurrence.id = planned.id
    and occurrence.scheduled_for = planned.scheduled_for
    and occurrence.local_date = planned.local_date
    and occurrence.behavior_schedule_slot_id is not distinct from
      planned.behavior_schedule_slot_id
    and occurrence.behavior_configuration_event_id is not distinct from
      planned.behavior_configuration_event_id
    and occurrence.schedule_kind = planned.schedule_kind
    and occurrence.schedule_preset is not distinct from planned.schedule_preset
    and occurrence.schedule_start_time = planned.schedule_start_time
    and occurrence.schedule_end_time is not distinct from planned.schedule_end_time
    and occurrence.status = 'unresolved'
    and occurrence.scheduled_for > plan_now
    and btrim(coalesce(occurrence.note, '')) = ''
    and not exists (
      select 1
      from public.occurrence_time_sessions as session
      where session.user_id = occurrence.user_id
        and session.behavior_id = occurrence.behavior_id
        and session.occurrence_id = occurrence.id
    );

  get diagnostics deleted_count = row_count;

  if deleted_count <> jsonb_array_length(occurrence_deletes) then
    raise exception 'Occurrence delete targets changed after planning.'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'inserted_count', inserted_count,
    'updated_count', updated_count,
    'deleted_count', deleted_count
  );
end;
$$;

drop function cadence_private.ticket_085_matches_recurrence(jsonb, date, date);

commit;
