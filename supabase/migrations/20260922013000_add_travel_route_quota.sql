begin;

create table public.travel_route_owner_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table public.travel_route_global_quota (
  utc_date date primary key,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.travel_route_owner_quota enable row level security;
alter table public.travel_route_global_quota enable row level security;

create policy "Users can read their own travel route quota"
on public.travel_route_owner_quota
for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.travel_route_owner_quota from public, anon, authenticated;
grant select on table public.travel_route_owner_quota to authenticated;
revoke all on table public.travel_route_global_quota from public, anon, authenticated;

create or replace function public.consume_travel_route_quota()
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  observed_at timestamptz := statement_timestamp();
  actor_timezone text;
  owner_local_date date;
  owner_attempt_count integer;
  global_attempt_count integer;
  owner_limit constant integer := 6;
  global_limit constant integer := 100;
  initial_budget_refreshes constant integer := 40;
begin
  if actor_id is null then
    raise exception 'Authentication is required to consume a travel route quota.'
      using errcode = '42501';
  end if;

  select timezone into actor_timezone from public.profiles where id = actor_id;
  if actor_timezone is null then
    raise exception 'Profile timezone is required to consume a travel route quota.'
      using errcode = '22023';
  end if;
  owner_local_date := (observed_at at time zone actor_timezone)::date;

  -- Initial, nonrenewing USD20 allowance: reserve USD0.50 per admitted refresh.
  -- At most 19 geocodes (USD0.005 each) and 18 routes (USD0.015 each),
  -- including driving refinement and the batch retry, cost at most USD0.365.
  -- Prices: Google Maps global list, verified 2026-09-22; ignore free credits.
  -- Keep every global quota row: their lifetime sum is the reservation ledger.
  -- ponytail: serialize this 40-refresh pilot; use a budget row if volume grows.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cadence.travel_route_initial_budget', 0));
  if (select coalesce(sum(attempt_count), 0) from public.travel_route_global_quota) >= initial_budget_refreshes then
    return query select false, 86400;
    return;
  end if;

  insert into public.travel_route_owner_quota as quota (
    user_id, local_date, attempt_count, updated_at
  ) values (
    actor_id, owner_local_date, 1, observed_at
  ) on conflict (user_id, local_date) do update set
    attempt_count = quota.attempt_count + 1,
    updated_at = observed_at
  returning quota.attempt_count into owner_attempt_count;

  if owner_attempt_count > owner_limit then
    return query select false, greatest(1, ceil(extract(epoch from (((owner_local_date + 1)::timestamp at time zone actor_timezone) - observed_at)))::integer);
    return;
  end if;

  insert into public.travel_route_global_quota as quota (
    utc_date, attempt_count, updated_at
  ) values (
    (observed_at at time zone 'UTC')::date, 1, observed_at
  ) on conflict (utc_date) do update set
    attempt_count = quota.attempt_count + 1,
    updated_at = observed_at
  returning quota.attempt_count into global_attempt_count;

  if global_attempt_count > global_limit then
    return query select false, greatest(1, ceil(extract(epoch from ((((observed_at at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC') - observed_at)))::integer);
    return;
  end if;

  return query select true, 0;
end;
$$;

revoke all on function public.consume_travel_route_quota() from public;
revoke all on function public.consume_travel_route_quota() from anon;
revoke all on function public.consume_travel_route_quota() from service_role;
grant execute on function public.consume_travel_route_quota() to authenticated;

comment on table public.travel_route_owner_quota is
  'Owner-local-day route recomputation admission counters. No locations or provider responses are stored.';
comment on table public.travel_route_global_quota is
  'Permanent global UTC-day admission counters; lifetime total enforces the nonrenewing initial USD20 allowance at USD0.50 reserved per refresh. Do not prune or reset without explicit budget authorization. No provider data is stored.';
comment on function public.consume_travel_route_quota() is
  'Atomically applies owner/day and global/day caps plus the nonrenewing 40-refresh initial budget before provider calls. Reservations are never refunded.';

commit;
