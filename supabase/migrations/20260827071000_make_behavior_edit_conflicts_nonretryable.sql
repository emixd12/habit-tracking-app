begin;

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
      using errcode = 'P0001';
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

commit;
