create table public.behavior_definition_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null,

  previous_title text,
  next_title text not null,
  previous_description text,
  next_description text,
  changed_fields text[] not null,

  recorded_at timestamptz not null,
  source text not null default 'manual'
    check (source in ('manual', 'import', 'system')),
  reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, id),
  constraint behavior_definition_events_behavior_owner_fkey
    foreign key (user_id, behavior_id)
    references public.behaviors(user_id, id)
    on delete cascade,
  constraint behavior_definition_events_changed_fields_check
    check (
      changed_fields = array['title']::text[]
      or changed_fields = array['description']::text[]
      or changed_fields = array['title', 'description']::text[]
    ),
  constraint behavior_definition_events_changed_values_check
    check (
      ('title' = any(changed_fields)) = (previous_title is distinct from next_title)
      and ('description' = any(changed_fields)) =
        (previous_description is distinct from next_description)
    )
);

create index behavior_definition_events_user_recorded_idx
  on public.behavior_definition_events (user_id, recorded_at, id);

create index behavior_definition_events_behavior_recorded_idx
  on public.behavior_definition_events (behavior_id, recorded_at, id);

create trigger set_behavior_definition_events_updated_at
  before update on public.behavior_definition_events
  for each row execute function public.set_updated_at();

alter table public.behavior_definition_events enable row level security;

create policy behavior_definition_events_select_own
  on public.behavior_definition_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy behavior_definition_events_insert_own
  on public.behavior_definition_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.behavior_definition_events from authenticated;
grant select, insert on table public.behavior_definition_events to authenticated;

create or replace function public.create_behavior_with_definition_event(
  behavior_payload jsonb,
  definition_event_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  created_behavior public.behaviors;
  recorded_at timestamptz;
  behavior_created_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if definition_event_plan is null then
    raise exception 'Definition event plan is required.' using errcode = '23502';
  end if;

  if behavior_payload ->> 'title' is distinct from
      definition_event_plan ->> 'next_title'
    or behavior_payload ->> 'description' is distinct from
      definition_event_plan ->> 'next_description' then
    raise exception 'Definition event plan does not match behavior payload.'
      using errcode = '22023';
  end if;

  recorded_at := (definition_event_plan ->> 'recorded_at')::timestamptz;
  behavior_created_at := coalesce(
    nullif(behavior_payload ->> 'created_at', '')::timestamptz,
    recorded_at
  );

  if recorded_at is null or behavior_created_at is distinct from recorded_at then
    raise exception 'Initial definition event must match behavior creation time.'
      using errcode = '22023';
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
    (behavior_payload ->> 'archived_at')::timestamptz,
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
    recorded_at,
    definition_event_plan ->> 'source',
    definition_event_plan ->> 'reason'
  );

  return to_jsonb(created_behavior);
end;
$$;

create or replace function public.update_behavior_with_definition_event(
  target_behavior_id uuid,
  behavior_payload jsonb,
  expected_definition jsonb,
  definition_event_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_behavior public.behaviors;
  updated_behavior public.behaviors;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if expected_definition is null
    or jsonb_typeof(expected_definition) <> 'object'
    or not (expected_definition ? 'stored_title')
    or not (expected_definition ? 'stored_description')
    or not (expected_definition ? 'normalized_title')
    or not (expected_definition ? 'normalized_description')
  then
    raise exception 'An exact expected behavior definition is required.'
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

  if current_behavior.title is distinct from
      expected_definition ->> 'stored_title'
    or current_behavior.description is distinct from
      expected_definition ->> 'stored_description'
  then
    raise exception 'Behavior definition changed after it was read.'
      using errcode = '40001';
  end if;

  if definition_event_plan is null then
    if behavior_payload ->> 'title' is distinct from
        expected_definition ->> 'stored_title'
      or behavior_payload ->> 'description' is distinct from
        expected_definition ->> 'stored_description'
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

  update public.behaviors
  set
    category_id = (behavior_payload ->> 'category_id')::uuid,
    title = behavior_payload ->> 'title',
    description = behavior_payload ->> 'description',
    recurrence_rule = behavior_payload -> 'recurrence_rule',
    scheduled_time = (behavior_payload ->> 'scheduled_time')::time,
    browser_reminder_enabled =
      (behavior_payload ->> 'browser_reminder_enabled')::boolean,
    email_reminder_enabled =
      (behavior_payload ->> 'email_reminder_enabled')::boolean,
    reminder_offset_minutes =
      (behavior_payload ->> 'reminder_offset_minutes')::integer,
    active = (behavior_payload ->> 'active')::boolean,
    archived_at = (behavior_payload ->> 'archived_at')::timestamptz
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
      updated_behavior.id,
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

  return to_jsonb(updated_behavior);
end;
$$;

revoke all on function public.create_behavior_with_definition_event(jsonb, jsonb)
  from public;
revoke all on function public.create_behavior_with_definition_event(jsonb, jsonb)
  from anon;
grant execute on function public.create_behavior_with_definition_event(jsonb, jsonb)
  to authenticated;

revoke all on function public.update_behavior_with_definition_event(uuid, jsonb, jsonb, jsonb)
  from public;
revoke all on function public.update_behavior_with_definition_event(uuid, jsonb, jsonb, jsonb)
  from anon;
grant execute on function public.update_behavior_with_definition_event(uuid, jsonb, jsonb, jsonb)
  to authenticated;

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
select
  behaviors.user_id,
  behaviors.id,
  null,
  behaviors.title,
  null,
  behaviors.description,
  case
    when behaviors.description is null
      then array['title']::text[]
    else array['title', 'description']::text[]
  end,
  behaviors.created_at,
  'system',
  'baseline_backfill'
from public.behaviors;
