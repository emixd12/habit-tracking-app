begin;

create schema if not exists cadence_advisor_private;
revoke all on schema cadence_advisor_private from public, anon, authenticated, service_role;
grant usage on schema cadence_advisor_private to authenticated;

create table cadence_advisor_private.daily_brief_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  include_calendar boolean not null default false,
  revision bigint not null default 0 check (revision between 0 and 2147483647),
  calendar_connection_generation bigint,
  calendar_selection_revision bigint,
  updated_at timestamptz not null default statement_timestamp(),
  check (
    (include_calendar and calendar_connection_generation is not null and calendar_selection_revision is not null)
    or (not include_calendar and calendar_connection_generation is null and calendar_selection_revision is null)
  )
);

create table cadence_advisor_private.daily_brief_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  local_date date not null,
  timezone text not null,
  preference_revision bigint not null check (preference_revision between 0 and 2147483647),
  status text not null check (status in ('pending', 'completed', 'failed')),
  lease_token uuid,
  started_at timestamptz not null,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  primary key (user_id, installation_id),
  check (
    (status = 'pending' and lease_token is not null and lease_expires_at = started_at + interval '75 seconds' and finished_at is null)
    or (status in ('completed', 'failed') and lease_token is not null and lease_expires_at is null and finished_at is not null)
  )
);

create index daily_brief_runs_owner_active_idx
  on cadence_advisor_private.daily_brief_runs (user_id, lease_expires_at)
  where status = 'pending';

create table cadence_advisor_private.daily_brief_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation_starts timestamptz[] not null default '{}'
    check (cardinality(generation_starts) <= 6),
  updated_at timestamptz not null default statement_timestamp()
);

alter table cadence_advisor_private.daily_brief_preferences enable row level security;
alter table cadence_advisor_private.daily_brief_preferences force row level security;
alter table cadence_advisor_private.daily_brief_runs enable row level security;
alter table cadence_advisor_private.daily_brief_runs force row level security;
alter table cadence_advisor_private.daily_brief_rate_limits enable row level security;
alter table cadence_advisor_private.daily_brief_rate_limits force row level security;

create policy daily_brief_preferences_owner_only
  on cadence_advisor_private.daily_brief_preferences
  as restrictive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy daily_brief_runs_owner_only
  on cadence_advisor_private.daily_brief_runs
  as restrictive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy daily_brief_rate_limits_owner_only
  on cadence_advisor_private.daily_brief_rate_limits
  as restrictive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on all tables in schema cadence_advisor_private
  from public, anon, authenticated, service_role;

create function cadence_advisor_private.current_daily_brief_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  jwt_session_id text := (select auth.jwt() ->> 'session_id');
begin
  if actor_id is null
    or jwt_session_id is null
    or jwt_session_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or not exists (
      select 1
      from auth.sessions as auth_session
      where auth_session.id = jwt_session_id::uuid
        and auth_session.user_id = actor_id
        and (auth_session.not_after is null or auth_session.not_after > pg_catalog.clock_timestamp())
    )
  then
    raise exception 'A current authenticated session is required.' using errcode = '42501';
  end if;

  return actor_id;
end;
$$;

create function cadence_advisor_private.daily_brief_calendar_fence_is_current(
  p_user_id uuid,
  p_include_calendar boolean,
  p_connection_generation bigint,
  p_selection_revision bigint
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select p_user_id = cadence_advisor_private.current_daily_brief_user()
    and (not p_include_calendar or exists (
    select 1
    from public.google_calendar_connections as connection
    join public.google_calendar_preferences as preference
      on preference.user_id = connection.user_id
    where connection.user_id = p_user_id
      and connection.status = 'connected'
      and connection.generation = p_connection_generation
      and preference.selection_revision = p_selection_revision
  ));
$$;

create function cadence_advisor_private.read_daily_brief_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := cadence_advisor_private.current_daily_brief_user();
  preference cadence_advisor_private.daily_brief_preferences%rowtype;
begin
  select * into preference
  from cadence_advisor_private.daily_brief_preferences
  where user_id = actor_id;

  return jsonb_build_object(
    'enabled', coalesce(preference.enabled, false),
    'include_calendar', coalesce(preference.include_calendar, false),
    'revision', coalesce(preference.revision, 0),
    'calendar_connection_generation', preference.calendar_connection_generation,
    'calendar_selection_revision', preference.calendar_selection_revision
  );
end;
$$;

create function cadence_advisor_private.save_daily_brief_preferences(
  p_enabled boolean,
  p_include_calendar boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := cadence_advisor_private.current_daily_brief_user();
  current_revision bigint;
  next_revision bigint;
  connection_generation bigint;
  selection_revision bigint;
begin
  if p_enabled is null or p_include_calendar is null
    or (not p_enabled and p_include_calendar)
    or p_expected_revision is null or p_expected_revision not between 0 and 2147483647
  then
    raise exception 'Daily Brief preferences are invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':daily-brief', 0)
  );

  select preference.revision into current_revision
  from cadence_advisor_private.daily_brief_preferences as preference
  where preference.user_id = actor_id
  for update;
  current_revision := coalesce(current_revision, 0);

  if current_revision <> p_expected_revision or current_revision = 2147483647 then
    raise exception 'Daily Brief preferences changed.' using errcode = '40001';
  end if;

  if p_include_calendar then
    select connection.generation, preference.selection_revision
      into connection_generation, selection_revision
    from public.google_calendar_connections as connection
    join public.google_calendar_preferences as preference
      on preference.user_id = connection.user_id
    where connection.user_id = actor_id
      and connection.status = 'connected';

    if connection_generation is null or selection_revision is null then
      raise exception 'A connected Calendar selection is required.' using errcode = '55000';
    end if;
  end if;

  next_revision := current_revision + 1;
  insert into cadence_advisor_private.daily_brief_preferences as preference (
    user_id,
    enabled,
    include_calendar,
    revision,
    calendar_connection_generation,
    calendar_selection_revision,
    updated_at
  ) values (
    actor_id,
    p_enabled,
    p_include_calendar,
    next_revision,
    connection_generation,
    selection_revision,
    statement_timestamp()
  )
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    include_calendar = excluded.include_calendar,
    revision = excluded.revision,
    calendar_connection_generation = excluded.calendar_connection_generation,
    calendar_selection_revision = excluded.calendar_selection_revision,
    updated_at = excluded.updated_at;

  delete from cadence_advisor_private.daily_brief_runs
  where user_id = actor_id;

  return jsonb_build_object(
    'enabled', p_enabled,
    'include_calendar', p_include_calendar,
    'revision', next_revision,
    'calendar_connection_generation', connection_generation,
    'calendar_selection_revision', selection_revision
  );
end;
$$;

create function cadence_advisor_private.begin_daily_brief(
  p_installation_id uuid,
  p_retry boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := cadence_advisor_private.current_daily_brief_user();
  observed_at timestamptz;
  preference cadence_advisor_private.daily_brief_preferences%rowtype;
  existing cadence_advisor_private.daily_brief_runs%rowtype;
  active_until timestamptz;
  owner_timezone text;
  owner_local_date date;
  recent_starts timestamptz[] := '{}';
  lease uuid;
  row_count integer;
begin
  if p_installation_id is null or p_retry is null
    or p_expected_revision is null or p_expected_revision not between 0 and 2147483647
  then
    raise exception 'Daily Brief request is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':daily-brief', 0)
  );
  observed_at := pg_catalog.clock_timestamp();

  select * into preference
  from cadence_advisor_private.daily_brief_preferences
  where user_id = actor_id
  for update;

  if preference.user_id is null or not preference.enabled
    or preference.revision <> p_expected_revision
  then
    raise exception 'Daily Brief preferences changed or are disabled.' using errcode = '40001';
  end if;

  if not cadence_advisor_private.daily_brief_calendar_fence_is_current(
    actor_id,
    preference.include_calendar,
    preference.calendar_connection_generation,
    preference.calendar_selection_revision
  ) then
    raise exception 'Daily Brief Calendar disclosure changed.' using errcode = '40001';
  end if;

  select coalesce(profile.timezone, 'America/New_York') into owner_timezone
  from public.profiles as profile
  where profile.id = actor_id;
  owner_timezone := coalesce(owner_timezone, 'America/New_York');
  owner_local_date := (observed_at at time zone owner_timezone)::date;

  select * into existing
  from cadence_advisor_private.daily_brief_runs as run
  where run.user_id = actor_id
    and run.installation_id = p_installation_id
  for update;

  if existing.user_id is not null
    and existing.local_date = owner_local_date
    and existing.preference_revision = preference.revision
  then
    if existing.status = 'completed' then
      return jsonb_build_object('state', 'already_attempted');
    end if;
    if existing.status = 'pending' and existing.lease_expires_at > observed_at then
      return jsonb_build_object(
        'state', 'pending',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from existing.lease_expires_at - observed_at))::integer)
      );
    end if;
    if not p_retry then
      return jsonb_build_object('state', 'already_attempted');
    end if;
  end if;

  -- A retry with no current attempt is an initial acquisition. This covers a
  -- client-side failure before admission and an installation evicted by the cap.
  -- Completed attempts remain suppressed above; active attempts remain pending.

  select max(run.lease_expires_at) into active_until
  from cadence_advisor_private.daily_brief_runs as run
  where run.user_id = actor_id
    and run.status = 'pending'
    and run.lease_expires_at > observed_at;
  if active_until is not null then
    return jsonb_build_object(
      'state', 'pending',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from active_until - observed_at))::integer)
    );
  end if;

  select coalesce(array_agg(started_at order by started_at), '{}') into recent_starts
  from cadence_advisor_private.daily_brief_rate_limits as admission
  cross join lateral unnest(admission.generation_starts) as start_entry(started_at)
  where admission.user_id = actor_id
    and started_at > observed_at - interval '60 seconds';

  if cardinality(recent_starts) >= 6 then
    return jsonb_build_object(
      'state', 'rate_limited',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from recent_starts[1] + interval '60 seconds' - observed_at))::integer)
    );
  end if;

  if existing.user_id is null then
    select count(*) into row_count
    from cadence_advisor_private.daily_brief_runs
    where user_id = actor_id;

    if row_count >= 8 then
      delete from cadence_advisor_private.daily_brief_runs as run
      where run.user_id = actor_id
        and run.installation_id = (
          select candidate.installation_id
          from cadence_advisor_private.daily_brief_runs as candidate
          where candidate.user_id = actor_id
            and (candidate.status <> 'pending' or candidate.lease_expires_at <= observed_at)
          order by coalesce(candidate.finished_at, candidate.lease_expires_at, candidate.started_at), candidate.installation_id
          limit 1
        );
    end if;
  end if;

  lease := gen_random_uuid();
  insert into cadence_advisor_private.daily_brief_runs as run (
    user_id,
    installation_id,
    local_date,
    timezone,
    preference_revision,
    status,
    lease_token,
    started_at,
    lease_expires_at,
    finished_at
  ) values (
    actor_id,
    p_installation_id,
    owner_local_date,
    owner_timezone,
    preference.revision,
    'pending',
    lease,
    observed_at,
    observed_at + interval '75 seconds',
    null
  )
  on conflict (user_id, installation_id) do update set
    local_date = excluded.local_date,
    timezone = excluded.timezone,
    preference_revision = excluded.preference_revision,
    status = excluded.status,
    lease_token = excluded.lease_token,
    started_at = excluded.started_at,
    lease_expires_at = excluded.lease_expires_at,
    finished_at = null;

  recent_starts := array_append(recent_starts, observed_at);
  insert into cadence_advisor_private.daily_brief_rate_limits as admission (
    user_id,
    generation_starts,
    updated_at
  ) values (
    actor_id,
    recent_starts,
    observed_at
  )
  on conflict (user_id) do update set
    generation_starts = excluded.generation_starts,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'state', 'acquired',
    'lease_token', lease,
    'local_date', owner_local_date
  );
end;
$$;

create function cadence_advisor_private.finish_daily_brief(
  p_installation_id uuid,
  p_lease_token uuid,
  p_success boolean,
  p_expected_revision bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := cadence_advisor_private.current_daily_brief_user();
  observed_at timestamptz;
  preference cadence_advisor_private.daily_brief_preferences%rowtype;
  owner_timezone text;
  owner_local_date date;
begin
  if p_installation_id is null or p_lease_token is null or p_success is null
    or p_expected_revision is null or p_expected_revision not between 0 and 2147483647
  then
    raise exception 'Daily Brief completion is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':daily-brief', 0)
  );
  observed_at := pg_catalog.clock_timestamp();

  select * into preference
  from cadence_advisor_private.daily_brief_preferences
  where user_id = actor_id;
  select coalesce(profile.timezone, 'America/New_York') into owner_timezone
  from public.profiles as profile
  where profile.id = actor_id;
  owner_timezone := coalesce(owner_timezone, 'America/New_York');
  owner_local_date := (observed_at at time zone owner_timezone)::date;

  -- A final application fence may fail after success was recorded. The same
  -- lease can downgrade that completed attempt, but it cannot complete twice.
  if not p_success then
    update cadence_advisor_private.daily_brief_runs as run
    set status = 'failed',
      finished_at = observed_at
    where run.user_id = actor_id
      and run.installation_id = p_installation_id
      and run.lease_token = p_lease_token
      and run.status = 'completed'
      and run.preference_revision = p_expected_revision;
    if found then
      return true;
    end if;
  end if;

  if preference.user_id is null or not preference.enabled
    or preference.revision <> p_expected_revision
    or not cadence_advisor_private.daily_brief_calendar_fence_is_current(
      actor_id,
      preference.include_calendar,
      preference.calendar_connection_generation,
      preference.calendar_selection_revision
    )
  then
    delete from cadence_advisor_private.daily_brief_runs as run
    where run.user_id = actor_id
      and run.installation_id = p_installation_id
      and run.lease_token = p_lease_token
      and run.status = 'pending';
    return false;
  end if;

  update cadence_advisor_private.daily_brief_runs as run
  set status = case when p_success then 'completed' else 'failed' end,
    lease_expires_at = null,
    finished_at = observed_at
  where run.user_id = actor_id
    and run.installation_id = p_installation_id
    and run.lease_token = p_lease_token
    and run.status = 'pending'
    and run.lease_expires_at >= observed_at
    and run.preference_revision = p_expected_revision
    and run.timezone = owner_timezone
    and run.local_date = owner_local_date;

  return found;
end;
$$;

create function public.read_daily_brief_preferences()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select cadence_advisor_private.read_daily_brief_preferences();
$$;

create function public.save_daily_brief_preferences(
  p_enabled boolean,
  p_include_calendar boolean,
  p_expected_revision bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select cadence_advisor_private.save_daily_brief_preferences(
    p_enabled,
    p_include_calendar,
    p_expected_revision
  );
$$;

create function public.begin_daily_brief(
  p_installation_id uuid,
  p_retry boolean,
  p_expected_revision bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select cadence_advisor_private.begin_daily_brief(
    p_installation_id,
    p_retry,
    p_expected_revision
  );
$$;

create function public.finish_daily_brief(
  p_installation_id uuid,
  p_lease_token uuid,
  p_success boolean,
  p_expected_revision bigint
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select cadence_advisor_private.finish_daily_brief(
    p_installation_id,
    p_lease_token,
    p_success,
    p_expected_revision
  );
$$;

revoke all on function cadence_advisor_private.current_daily_brief_user() from public, anon, authenticated, service_role;
revoke all on function cadence_advisor_private.daily_brief_calendar_fence_is_current(uuid, boolean, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function cadence_advisor_private.read_daily_brief_preferences() from public, anon, authenticated, service_role;
revoke all on function cadence_advisor_private.save_daily_brief_preferences(boolean, boolean, bigint) from public, anon, authenticated, service_role;
revoke all on function cadence_advisor_private.begin_daily_brief(uuid, boolean, bigint) from public, anon, authenticated, service_role;
revoke all on function cadence_advisor_private.finish_daily_brief(uuid, uuid, boolean, bigint) from public, anon, authenticated, service_role;
revoke all on function public.read_daily_brief_preferences() from public, anon, authenticated, service_role;
revoke all on function public.save_daily_brief_preferences(boolean, boolean, bigint) from public, anon, authenticated, service_role;
revoke all on function public.begin_daily_brief(uuid, boolean, bigint) from public, anon, authenticated, service_role;
revoke all on function public.finish_daily_brief(uuid, uuid, boolean, bigint) from public, anon, authenticated, service_role;

grant execute on function cadence_advisor_private.current_daily_brief_user() to authenticated;
grant execute on function cadence_advisor_private.daily_brief_calendar_fence_is_current(uuid, boolean, bigint, bigint) to authenticated;
grant execute on function cadence_advisor_private.read_daily_brief_preferences() to authenticated;
grant execute on function cadence_advisor_private.save_daily_brief_preferences(boolean, boolean, bigint) to authenticated;
grant execute on function cadence_advisor_private.begin_daily_brief(uuid, boolean, bigint) to authenticated;
grant execute on function cadence_advisor_private.finish_daily_brief(uuid, uuid, boolean, bigint) to authenticated;
grant execute on function public.read_daily_brief_preferences() to authenticated;
grant execute on function public.save_daily_brief_preferences(boolean, boolean, bigint) to authenticated;
grant execute on function public.begin_daily_brief(uuid, boolean, bigint) to authenticated;
grant execute on function public.finish_daily_brief(uuid, uuid, boolean, bigint) to authenticated;

comment on table cadence_advisor_private.daily_brief_preferences is
  'Current first-party Daily Brief disclosure controls and source fences. No prompt or generated content is stored.';
comment on table cadence_advisor_private.daily_brief_runs is
  'Latest Daily Brief attempt per owner installation. Rows persist until replacement, disablement, or account deletion. No prompt or generated content is stored.';
comment on table cadence_advisor_private.daily_brief_rate_limits is
  'Bounded rolling generation-start timestamps for the account-wide six-start limit. No prompt or generated content is stored.';

commit;
