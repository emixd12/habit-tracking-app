begin;

drop trigger set_behaviors_updated_at on public.behaviors;

alter table public.behaviors
  add column current_configuration_event_id uuid;

alter table public.occurrences
  add column behavior_configuration_event_id uuid;

alter table public.occurrence_sync_state
  add column state_version bigint not null default 0;

alter table public.behaviors
  add constraint behaviors_current_configuration_event_owner_fkey
  foreign key (user_id, id, current_configuration_event_id)
  references public.behavior_configuration_events(user_id, behavior_id, id)
  deferrable initially deferred;

alter table public.occurrences
  add constraint occurrences_configuration_event_owner_fkey
  foreign key (user_id, behavior_id, behavior_configuration_event_id)
  references public.behavior_configuration_events(user_id, behavior_id, id)
  deferrable initially deferred;

update public.behaviors as behavior
set current_configuration_event_id = (
  select event.id
  from public.behavior_configuration_events as event
  where event.user_id = behavior.user_id
    and event.behavior_id = behavior.id
    and event.next_configuration =
      cadence_private.current_behavior_configuration_snapshot(
        behavior.user_id,
        behavior.id
      )
  order by event.created_at desc, event.recorded_at desc, event.id desc
  limit 1
);

do $$
begin
  if exists (
    select 1
    from public.behaviors
    where current_configuration_event_id is null
  ) then
    raise exception 'Every Behavior must have a matching current configuration event.'
      using errcode = '23502';
  end if;
end;
$$;

create trigger set_behaviors_updated_at
  before update of
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
    archived_at
  on public.behaviors
  for each row execute function public.set_updated_at();

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

  update public.behaviors
  set current_configuration_event_id = created_event_id
  where user_id = target_user_id
    and id = target_behavior_id;

  if not found then
    raise exception 'Configuration event Behavior does not exist.'
      using errcode = '23503';
  end if;

  return created_event_id;
end;
$$;

create index occurrences_user_configuration_event_idx
  on public.occurrences (user_id, behavior_configuration_event_id)
  where behavior_configuration_event_id is not null;

create or replace function cadence_private.increment_occurrence_sync_state_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.state_version := old.state_version + 1;
  return new;
end;
$$;

create trigger increment_occurrence_sync_state_version
  before update on public.occurrence_sync_state
  for each row execute function
    cadence_private.increment_occurrence_sync_state_version();

create or replace function cadence_private.clear_occurrence_configuration_lineage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.behavior_configuration_event_id := null;
  return new;
end;
$$;

create trigger clear_occurrence_configuration_lineage
  before update of
    behavior_id,
    behavior_schedule_slot_id,
    scheduled_for,
    local_date,
    schedule_kind,
    schedule_preset,
    schedule_start_time,
    schedule_end_time
  on public.occurrences
  for each row execute function
    cadence_private.clear_occurrence_configuration_lineage();

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
  on conflict (behavior_id, scheduled_for) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count <> jsonb_array_length(occurrence_inserts) then
    raise exception 'Occurrence insert targets changed after planning.'
      using errcode = 'P0001';
  end if;

  with planned as (
    select *
    from jsonb_to_recordset(occurrence_updates) as update_plan(
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
  update public.occurrences as occurrence
  set
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
    and occurrence.scheduled_for = planned.scheduled_for
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

create or replace function public.mark_occurrence_sync_fresh_if_configuration_current(
  target_user_id uuid,
  expected_behavior_configuration_events jsonb,
  expected_sync_state_exists boolean,
  expected_sync_state_version bigint,
  target_timezone text,
  target_last_synced_local_date date,
  target_synced_through_local_date date,
  target_last_successful_sync_at timestamptz,
  target_behavior_count integer,
  target_created_count integer,
  target_updated_count integer,
  target_deleted_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  current_sync_state_version bigint;
  current_sync_state_exists boolean;
  persisted_state public.occurrence_sync_state;
begin
  if target_user_id is null
    or expected_sync_state_exists is null
    or target_timezone is null
    or target_last_synced_local_date is null
    or target_synced_through_local_date is null
    or target_last_successful_sync_at is null
  then
    raise exception 'Occurrence sync freshness metadata is required.'
      using errcode = '23502';
  end if;

  if (
    authenticated_user_id is null
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
  ) or (
    authenticated_user_id is not null
    and authenticated_user_id is distinct from target_user_id
  ) then
    raise exception 'Occurrence sync owner does not match the authenticated user.'
      using errcode = '42501';
  end if;

  expected_behavior_configuration_events := coalesce(
    expected_behavior_configuration_events,
    '[]'::jsonb
  );

  if jsonb_typeof(expected_behavior_configuration_events) <> 'array'
    or (
      expected_sync_state_exists
      and coalesce(expected_sync_state_version, -1) < 0
    )
    or (
      not expected_sync_state_exists
      and expected_sync_state_version is distinct from -1
    )
    or target_last_synced_local_date > target_synced_through_local_date
    or target_behavior_count < 0
    or target_created_count < 0
    or target_updated_count < 0
    or target_deleted_count < 0
  then
    raise exception 'Occurrence sync freshness plan is malformed.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(expected_behavior_configuration_events) as expected(
      behavior_id uuid,
      configuration_event_id uuid
    )
    where expected.behavior_id is null
      or expected.configuration_event_id is null
  ) or (
    select count(*)
    from (
      select distinct expected.behavior_id
      from jsonb_to_recordset(expected_behavior_configuration_events) as expected(
        behavior_id uuid,
        configuration_event_id uuid
      )
    ) as unique_behaviors
  ) <> jsonb_array_length(expected_behavior_configuration_events)
    or target_behavior_count <>
      jsonb_array_length(expected_behavior_configuration_events)
  then
    raise exception 'Occurrence sync expected Behavior set is malformed.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user_id::text, 0)
  );

  select state.state_version
  into current_sync_state_version
  from public.occurrence_sync_state as state
  where state.user_id = target_user_id
  for update;
  current_sync_state_exists := found;

  if current_sync_state_exists is distinct from expected_sync_state_exists
    or (
      expected_sync_state_exists
      and current_sync_state_version is distinct from expected_sync_state_version
    )
  then
    raise exception 'Occurrence sync state changed after occurrence sync planning.'
      using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.behaviors
    where user_id = target_user_id
  ) <> jsonb_array_length(expected_behavior_configuration_events)
    or exists (
      select 1
      from public.behaviors as behavior
      where behavior.user_id = target_user_id
        and not exists (
          select 1
          from jsonb_to_recordset(expected_behavior_configuration_events) as expected(
            behavior_id uuid,
            configuration_event_id uuid
          )
          where expected.behavior_id = behavior.id
            and expected.configuration_event_id =
              behavior.current_configuration_event_id
        )
    )
  then
    raise exception 'Behavior configuration changed after occurrence sync planning.'
      using errcode = 'P0001';
  end if;

  insert into public.occurrence_sync_state (
    user_id,
    timezone,
    last_synced_local_date,
    synced_through_local_date,
    last_successful_sync_at,
    stale,
    stale_reason,
    last_sync_behavior_count,
    last_sync_created_count,
    last_sync_updated_count,
    last_sync_deleted_count
  )
  values (
    target_user_id,
    target_timezone,
    target_last_synced_local_date,
    target_synced_through_local_date,
    target_last_successful_sync_at,
    false,
    null,
    target_behavior_count,
    target_created_count,
    target_updated_count,
    target_deleted_count
  )
  on conflict (user_id) do update
  set
    timezone = excluded.timezone,
    last_synced_local_date = excluded.last_synced_local_date,
    synced_through_local_date = excluded.synced_through_local_date,
    last_successful_sync_at = excluded.last_successful_sync_at,
    stale = false,
    stale_reason = null,
    last_sync_behavior_count = excluded.last_sync_behavior_count,
    last_sync_created_count = excluded.last_sync_created_count,
    last_sync_updated_count = excluded.last_sync_updated_count,
    last_sync_deleted_count = excluded.last_sync_deleted_count
  where expected_sync_state_exists
    and public.occurrence_sync_state.state_version =
      expected_sync_state_version
  returning * into persisted_state;

  if not found then
    raise exception 'Occurrence sync state changed during freshness persistence.'
      using errcode = 'P0001';
  end if;

  return to_jsonb(persisted_state);
end;
$$;

revoke insert, update on table public.occurrences from authenticated;

revoke insert, update on table public.occurrence_sync_state from authenticated;

grant insert (
  id,
  user_id,
  behavior_id,
  behavior_schedule_slot_id,
  scheduled_for,
  local_date,
  schedule_kind,
  schedule_preset,
  schedule_start_time,
  schedule_end_time,
  status,
  completed_at,
  status_marked_at,
  note,
  created_at,
  updated_at
) on public.occurrences to authenticated;

grant update (
  status,
  completed_at,
  status_marked_at,
  note
) on public.occurrences to authenticated;

grant insert (
  user_id,
  timezone,
  last_synced_local_date,
  synced_through_local_date,
  last_successful_sync_at,
  stale,
  stale_reason,
  last_sync_behavior_count,
  last_sync_created_count,
  last_sync_updated_count,
  last_sync_deleted_count,
  created_at,
  updated_at
) on public.occurrence_sync_state to authenticated;

grant update (
  user_id,
  timezone,
  last_synced_local_date,
  synced_through_local_date,
  last_successful_sync_at,
  stale,
  stale_reason,
  last_sync_behavior_count,
  last_sync_created_count,
  last_sync_updated_count,
  last_sync_deleted_count
) on public.occurrence_sync_state to authenticated;

revoke all on function cadence_private.insert_behavior_configuration_event(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb
)
  from public, anon, authenticated, service_role;

revoke all on function cadence_private.increment_occurrence_sync_state_version()
  from public, anon, authenticated, service_role;

revoke all on function cadence_private.clear_occurrence_configuration_lineage()
  from public, anon, authenticated, service_role;

revoke all on function public.apply_occurrence_generation_plan(
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.apply_occurrence_generation_plan(
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to authenticated, service_role;

revoke all on function public.mark_occurrence_sync_fresh_if_configuration_current(
  uuid,
  jsonb,
  boolean,
  bigint,
  text,
  date,
  date,
  timestamptz,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.mark_occurrence_sync_fresh_if_configuration_current(
  uuid,
  jsonb,
  boolean,
  bigint,
  text,
  date,
  date,
  timestamptz,
  integer,
  integer,
  integer,
  integer
) to authenticated, service_role;

commit;
