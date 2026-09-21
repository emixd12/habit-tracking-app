begin;

create schema if not exists cadence_advisor_private;
revoke all on schema cadence_advisor_private from public, anon, authenticated, service_role;
grant usage on schema cadence_advisor_private to authenticated;

create table cadence_advisor_private.day_context_read_admissions (
  lease_token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (
    char_length(client_id) between 1 and 128
    and client_id ~ '^[A-Za-z0-9._-]+$'
  ),
  started_at timestamptz not null,
  lease_expires_at timestamptz not null,
  released_at timestamptz,
  check (lease_expires_at = started_at + interval '60 seconds'),
  check (released_at is null or released_at >= started_at)
);

create index day_context_read_admissions_owner_started_idx
  on cadence_advisor_private.day_context_read_admissions (user_id, started_at);
create index day_context_read_admissions_active_lease_idx
  on cadence_advisor_private.day_context_read_admissions (user_id, client_id, lease_expires_at)
  where released_at is null;

alter table cadence_advisor_private.day_context_read_admissions enable row level security;
alter table cadence_advisor_private.day_context_read_admissions force row level security;
create policy day_context_read_admissions_owner_only
  on cadence_advisor_private.day_context_read_admissions
  as restrictive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table cadence_advisor_private.day_context_read_admissions
  from public, anon, authenticated, service_role;

create function cadence_advisor_private.acquire_day_context_read(p_client_id text)
returns table (lease_token uuid, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  observed_at timestamptz;
  active_until timestamptz;
  first_start timestamptz;
  lease uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_client_id is null
    or char_length(p_client_id) not between 1 and 128
    or p_client_id !~ '^[A-Za-z0-9._-]+$'
  then
    raise exception 'Advisor client is invalid.' using errcode = '22023';
  end if;

  -- The owner lock makes the client lease and account-wide start limit atomic.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':advisor-day-context-read', 0)
  );
  observed_at := pg_catalog.clock_timestamp();

  -- Cleanup runs only when this owner makes another read. It is not a strict retention timer.
  delete from cadence_advisor_private.day_context_read_admissions as admission
  where admission.user_id = actor_id
    and admission.started_at < observed_at - interval '1 day';

  select admission.lease_expires_at
  into active_until
  from cadence_advisor_private.day_context_read_admissions as admission
  where admission.user_id = actor_id
    and admission.client_id = p_client_id
    and admission.released_at is null
    and admission.lease_expires_at > observed_at
  order by admission.lease_expires_at desc
  limit 1;

  if active_until is not null then
    return query select null::uuid, greatest(
      1,
      ceil(extract(epoch from active_until - observed_at))::integer
    );
    return;
  end if;

  select min(admission.started_at)
  into first_start
  from cadence_advisor_private.day_context_read_admissions as admission
  where admission.user_id = actor_id
    and admission.started_at > observed_at - interval '60 seconds';

  if (
    select count(*)
    from cadence_advisor_private.day_context_read_admissions as admission
    where admission.user_id = actor_id
      and admission.started_at > observed_at - interval '60 seconds'
  ) >= 6 then
    return query select null::uuid, greatest(
      1,
      ceil(extract(epoch from first_start + interval '60 seconds' - observed_at))::integer
    );
    return;
  end if;

  insert into cadence_advisor_private.day_context_read_admissions as admission (
    user_id,
    client_id,
    started_at,
    lease_expires_at
  )
  values (
    actor_id,
    p_client_id,
    observed_at,
    observed_at + interval '60 seconds'
  )
  returning admission.lease_token into lease;

  return query select lease, null::integer;
end;
$$;

create function cadence_advisor_private.release_day_context_read(
  p_client_id text,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  observed_at timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_client_id is null
    or char_length(p_client_id) not between 1 and 128
    or p_client_id !~ '^[A-Za-z0-9._-]+$'
    or p_lease_token is null
  then
    raise exception 'Advisor lease is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':advisor-day-context-read', 0)
  );
  observed_at := pg_catalog.clock_timestamp();

  delete from cadence_advisor_private.day_context_read_admissions as admission
  where admission.user_id = actor_id
    and admission.started_at < observed_at - interval '1 day';

  update cadence_advisor_private.day_context_read_admissions as admission
  set released_at = observed_at
  where admission.user_id = actor_id
    and admission.client_id = p_client_id
    and admission.lease_token = p_lease_token
    and admission.released_at is null
    and admission.lease_expires_at >= observed_at;

  return found;
end;
$$;

create function public.acquire_advisor_day_context_read(p_client_id text)
returns table (lease_token uuid, retry_after_seconds integer)
language sql
security invoker
set search_path = ''
as $$
  select * from cadence_advisor_private.acquire_day_context_read(p_client_id);
$$;

create function public.release_advisor_day_context_read(
  p_client_id text,
  p_lease_token uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select cadence_advisor_private.release_day_context_read(p_client_id, p_lease_token);
$$;

revoke all on function cadence_advisor_private.acquire_day_context_read(text)
  from public, anon, authenticated, service_role;
revoke all on function cadence_advisor_private.release_day_context_read(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.acquire_advisor_day_context_read(text)
  from public, anon, authenticated, service_role;
revoke all on function public.release_advisor_day_context_read(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function cadence_advisor_private.acquire_day_context_read(text) to authenticated;
grant execute on function cadence_advisor_private.release_day_context_read(text, uuid) to authenticated;
grant execute on function public.acquire_advisor_day_context_read(text) to authenticated;
grant execute on function public.release_advisor_day_context_read(text, uuid) to authenticated;

comment on table cadence_advisor_private.day_context_read_admissions is
  'Operational per-owner advisor read lease and start metadata. No context or provider content is stored.';

commit;
