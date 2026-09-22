begin;

alter table public.behaviors
  add column location_text text,
  add constraint behaviors_location_text_valid check (
    location_text is null or (
      length(btrim(location_text)) between 1 and 500
      and location_text = btrim(location_text)
      and location_text !~ '[[:cntrl:]]'
    )
  );

alter table public.behavior_configuration_events
  drop constraint behavior_configuration_events_changed_fields_check;

alter table public.behavior_configuration_events
  add constraint behavior_configuration_events_changed_fields_check
  check (
    cardinality(changed_fields) > 0
    and changed_fields <@ array[
      'category_id', 'location_text', 'schedule_graph',
      'browser_reminder_enabled', 'email_reminder_enabled',
      'reminder_offset_minutes', 'active', 'timezone'
    ]::text[]
  );

-- Canonicalize pre-travel history once so later revisions have an exact
-- previous snapshot. Existing revisions remain location-neutral.
update public.behavior_configuration_events
set
  previous_configuration = case
    when previous_configuration is null then null
    else previous_configuration || jsonb_build_object('location_text', null)
  end,
  next_configuration = next_configuration || jsonb_build_object('location_text', null),
  changed_fields = case
    when event_kind = 'baseline' and not ('location_text' = any(changed_fields))
      then array_append(changed_fields, 'location_text')
    else changed_fields
  end;

create or replace function cadence_private.current_behavior_configuration_snapshot(
  target_user_id uuid,
  target_behavior_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'category_id', behavior.category_id,
    'location_text', behavior.location_text,
    'schedule_graph', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recurrence_rule', schedule.recurrence_rule,
        'sort_order', schedule.sort_order,
        'time_entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'kind', slot.kind,
            'preset', slot.preset,
            'start_time', slot.start_time::text,
            'end_time', case when slot.end_time is null then null else to_jsonb(slot.end_time::text) end,
            'sort_order', slot.sort_order
          ) order by slot.sort_order, slot.start_time, slot.id)
          from public.behavior_schedule_slots slot
          where slot.user_id = schedule.user_id
            and slot.behavior_id = schedule.behavior_id
            and slot.behavior_schedule_id = schedule.id
        ), '[]'::jsonb)
      ) order by schedule.sort_order, schedule.id)
      from public.behavior_schedules schedule
      where schedule.user_id = behavior.user_id and schedule.behavior_id = behavior.id
    ), '[]'::jsonb),
    'browser_reminder_enabled', behavior.browser_reminder_enabled,
    'email_reminder_enabled', behavior.email_reminder_enabled,
    'reminder_offset_minutes', behavior.reminder_offset_minutes,
    'active', behavior.active,
    'timezone', behavior.timezone
  )
  from public.behaviors behavior
  where behavior.user_id = target_user_id and behavior.id = target_behavior_id;
$$;

create or replace function cadence_private.behavior_configuration_changed_fields(
  previous_configuration jsonb,
  next_configuration jsonb
)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when previous_configuration is null then array[
    'category_id', 'location_text', 'schedule_graph',
    'browser_reminder_enabled', 'email_reminder_enabled',
    'reminder_offset_minutes', 'active', 'timezone'
  ]::text[] else array_remove(array[
    case when previous_configuration -> 'category_id' is distinct from next_configuration -> 'category_id' then 'category_id' end,
    case when previous_configuration -> 'location_text' is distinct from next_configuration -> 'location_text' then 'location_text' end,
    case when previous_configuration -> 'schedule_graph' is distinct from next_configuration -> 'schedule_graph' then 'schedule_graph' end,
    case when previous_configuration -> 'browser_reminder_enabled' is distinct from next_configuration -> 'browser_reminder_enabled' then 'browser_reminder_enabled' end,
    case when previous_configuration -> 'email_reminder_enabled' is distinct from next_configuration -> 'email_reminder_enabled' then 'email_reminder_enabled' end,
    case when previous_configuration -> 'reminder_offset_minutes' is distinct from next_configuration -> 'reminder_offset_minutes' then 'reminder_offset_minutes' end,
    case when previous_configuration -> 'active' is distinct from next_configuration -> 'active' then 'active' end,
    case when previous_configuration -> 'timezone' is distinct from next_configuration -> 'timezone' then 'timezone' end
  ]::text[], null) end;
$$;

-- Extend the authenticated graph writers in place. Their existing bodies
-- include later conflict and history hardening that this migration preserves.
do $graph_writers$
declare
  definition text;
  anchor text;
begin
  select pg_get_functiondef('public.create_behavior_with_schedule_graph(jsonb,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  anchor := $a$    description,
    recurrence_rule,$a$;
  if position(anchor in definition) = 0 then raise exception 'Behavior create columns changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$    description,
    location_text,
    recurrence_rule,$patch$);
  anchor := $a$    behavior_payload ->> 'description',
    behavior_payload -> 'recurrence_rule',$a$;
  if position(anchor in definition) = 0 then raise exception 'Behavior create values changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$    behavior_payload ->> 'description',
    nullif(behavior_payload ->> 'location_text', ''),
    behavior_payload -> 'recurrence_rule',$patch$);
  execute definition;

  select pg_get_functiondef('public.update_behavior_with_schedule_graph(uuid,jsonb,jsonb,jsonb,timestamp with time zone,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  anchor := $a$    description = behavior_payload ->> 'description',
    recurrence_rule = behavior_payload -> 'recurrence_rule',$a$;
  if position(anchor in definition) = 0 then raise exception 'Behavior update fields changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$    description = behavior_payload ->> 'description',
    location_text = nullif(behavior_payload ->> 'location_text', ''),
    recurrence_rule = behavior_payload -> 'recurrence_rule',$patch$);
  execute definition;
end
$graph_writers$;

create table public.travel_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  base_location_text text,
  mode text,
  navigation_preference text,
  routing_consent_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint travel_settings_base_location_valid check (
    base_location_text is null or (
      length(btrim(base_location_text)) between 1 and 500
      and base_location_text = btrim(base_location_text)
      and base_location_text !~ '[[:cntrl:]]'
    )
  ),
  constraint travel_settings_mode_valid check (
    mode is null or mode in ('walking', 'cycling', 'transit', 'driving')
  ),
  constraint travel_settings_navigation_valid check (
    navigation_preference is null or navigation_preference in ('google_maps', 'apple_maps')
  ),
  constraint travel_settings_enabled_valid check (
    not enabled or (mode is not null and routing_consent_at is not null)
  ),
  constraint travel_settings_consent_order_valid check (
    routing_consent_at is null or routing_consent_at <= updated_at
  ),
  constraint travel_settings_onboarding_order_valid check (
    onboarding_completed_at is null or onboarding_completed_at <= updated_at
  )
);

alter table public.travel_settings enable row level security;

create policy travel_settings_select_own
  on public.travel_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy travel_settings_update_own
  on public.travel_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.travel_settings from public, anon, authenticated;
grant select, update on table public.travel_settings to authenticated;

create function cadence_private.create_default_travel_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.travel_settings (user_id, created_at, updated_at)
  values (new.id, new.created_at, new.created_at)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function cadence_private.create_default_travel_settings()
  from public, anon, authenticated, service_role;

create trigger profiles_create_default_travel_settings
after insert on public.profiles
for each row execute function cadence_private.create_default_travel_settings();

insert into public.travel_settings (user_id, created_at, updated_at)
select profile.id, profile.created_at, profile.created_at
from public.profiles profile
on conflict (user_id) do nothing;

-- Travel settings share the existing singleton profile sync entity. This keeps
-- timezone and travel preferences atomic without introducing another entity ID.
do $migration$
declare
  definition text;
  anchor text;
begin
  select pg_get_functiondef('public.read_account_sync_snapshot()'::regprocedure) into definition;
  anchor := $a$    select 'profile', 'profile', jsonb_build_object('timezone', p.timezone)
    from public.profiles p where p.id = current_user_id$a$;
  if position(anchor in definition) = 0 then raise exception 'Account snapshot profile changed unexpectedly.'; end if;
  execute replace(definition, anchor, $patch$    select 'profile', 'profile', cadence_private.normalize_account_sync_row(jsonb_build_object(
      'timezone', p.timezone,
      'travel_enabled', settings.enabled,
      'base_location_text', settings.base_location_text,
      'travel_mode', settings.mode,
      'navigation_preference', settings.navigation_preference,
      'routing_consent_at', settings.routing_consent_at,
      'onboarding_completed_at', settings.onboarding_completed_at,
      'updated_at', settings.updated_at
    ))
    from public.profiles p
    join public.travel_settings settings on settings.user_id = p.id
    where p.id = current_user_id$patch$);

  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;

  anchor := $a$        or (select count(*) from jsonb_object_keys(write -> 'value')) <> 1
        or not ((write -> 'value') ? 'timezone')$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync profile validation changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$        or (select count(*) from jsonb_object_keys(write -> 'value')) <> 8
        or not ((write -> 'value') ?& array[
          'timezone', 'travel_enabled', 'base_location_text', 'travel_mode',
          'navigation_preference', 'routing_consent_at',
          'onboarding_completed_at', 'updated_at'
        ])
        or jsonb_typeof(write #> '{value,travel_enabled}') is distinct from 'boolean'
        or (write #>> '{value,travel_mode}' is not null and write #>> '{value,travel_mode}' not in ('walking','cycling','transit','driving'))
        or (write #>> '{value,navigation_preference}' is not null and write #>> '{value,navigation_preference}' not in ('google_maps','apple_maps'))
        or (coalesce((write #>> '{value,travel_enabled}')::boolean, false) and (
          write #>> '{value,travel_mode}' is null or write #>> '{value,routing_consent_at}' is null
        ))$patch$);

  anchor := $a$      select jsonb_build_object('timezone', profile.timezone) into stored_value
      from public.profiles profile where profile.id = current_user_id for update;$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync stored profile read changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$      select cadence_private.normalize_account_sync_row(jsonb_build_object(
        'timezone', profile.timezone,
        'travel_enabled', settings.enabled,
        'base_location_text', settings.base_location_text,
        'travel_mode', settings.mode,
        'navigation_preference', settings.navigation_preference,
        'routing_consent_at', settings.routing_consent_at,
        'onboarding_completed_at', settings.onboarding_completed_at,
        'updated_at', settings.updated_at
      )) into stored_value
      from public.profiles profile
      join public.travel_settings settings on settings.user_id = profile.id
      where profile.id = current_user_id
      for update of profile, settings;$patch$);

  anchor := $a$      update public.profiles set timezone = write #>> '{value,timezone}' where id = current_user_id;
      continue;$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync profile apply changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$      update public.profiles set timezone = write #>> '{value,timezone}' where id = current_user_id;
      update public.travel_settings set
        enabled = (write #>> '{value,travel_enabled}')::boolean,
        base_location_text = write #>> '{value,base_location_text}',
        mode = write #>> '{value,travel_mode}',
        navigation_preference = write #>> '{value,navigation_preference}',
        routing_consent_at = nullif(write #>> '{value,routing_consent_at}', '')::timestamptz,
        onboarding_completed_at = nullif(write #>> '{value,onboarding_completed_at}', '')::timestamptz,
        updated_at = (write #>> '{value,updated_at}')::timestamptz
      where user_id = current_user_id;
      continue;$patch$);

  -- Adding a Behavior location changes routing provenance and requires the
  -- existing append-only Behavior configuration event.
  anchor := $a$      'default_duration_minutes', 'end_date', 'auto_archived_at'
    ])$a$;
  if position(anchor in definition) = 0 then raise exception 'Account sync Behavior compatibility guard changed unexpectedly.'; end if;
  definition := replace(definition, anchor, $patch$      'default_duration_minutes', 'end_date', 'auto_archived_at', 'location_text'
    ])$patch$);

  execute definition;
end
$migration$;

comment on column public.behaviors.location_text is
  'Optional user-authored destination text. Device samples and provider results are never stored here.';
comment on table public.travel_settings is
  'Owner-authored travel preferences and consent only. No device position, provider geocode, route result, or Calendar/model grant belongs here.';

commit;
