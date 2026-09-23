begin;

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
  utc_date_value date := (statement_timestamp() at time zone 'UTC')::date;
  owner_attempt_count integer;
  global_attempt_count integer;
  owner_limit constant integer := 24;
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
  -- Counters record admissions only; rejected attempts change nothing (September 22, 2026).
  -- ponytail: serialize this 40-refresh pilot; use a budget row if volume grows.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cadence.travel_route_initial_budget', 0));
  if (select coalesce(sum(attempt_count), 0) from public.travel_route_global_quota) >= initial_budget_refreshes then
    return query select false, 86400;
    return;
  end if;

  select quota.attempt_count into owner_attempt_count
  from public.travel_route_owner_quota as quota
  where quota.user_id = actor_id and quota.local_date = owner_local_date;
  if coalesce(owner_attempt_count, 0) >= owner_limit then
    return query select false, greatest(1, ceil(extract(epoch from (((owner_local_date + 1)::timestamp at time zone actor_timezone) - observed_at)))::integer);
    return;
  end if;

  select quota.attempt_count into global_attempt_count
  from public.travel_route_global_quota as quota
  where quota.utc_date = utc_date_value;
  if coalesce(global_attempt_count, 0) >= global_limit then
    return query select false, greatest(1, ceil(extract(epoch from (((utc_date_value + 1)::timestamp at time zone 'UTC') - observed_at)))::integer);
    return;
  end if;

  insert into public.travel_route_owner_quota as quota (
    user_id, local_date, attempt_count, updated_at
  ) values (
    actor_id, owner_local_date, 1, observed_at
  ) on conflict (user_id, local_date) do update set
    attempt_count = quota.attempt_count + 1,
    updated_at = observed_at;

  insert into public.travel_route_global_quota as quota (
    utc_date, attempt_count, updated_at
  ) values (
    utc_date_value, 1, observed_at
  ) on conflict (utc_date) do update set
    attempt_count = quota.attempt_count + 1,
    updated_at = observed_at;

  return query select true, 0;
end;
$$;

revoke all on function public.consume_travel_route_quota() from public;
revoke all on function public.consume_travel_route_quota() from anon;
revoke all on function public.consume_travel_route_quota() from service_role;
grant execute on function public.consume_travel_route_quota() to authenticated;

comment on function public.consume_travel_route_quota() is
  'Atomically applies owner/day (24) and global/day (100) admission caps plus the nonrenewing 40-refresh initial budget before provider calls. Rejected attempts are not counted. Reservations are never refunded.';

commit;
