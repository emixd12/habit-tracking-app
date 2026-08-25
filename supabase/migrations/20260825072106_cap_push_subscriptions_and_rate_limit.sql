begin;

alter table public.launch_rate_limits
  drop constraint launch_rate_limits_action_check;

alter table public.launch_rate_limits
  add constraint launch_rate_limits_action_check
  check (action in ('export_download', 'push_subscription_registration'));

create or replace function public.consume_launch_rate_limit(p_action text)
returns table (
  allowed boolean,
  limit_count integer,
  remaining integer,
  reset_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  observed_at timestamptz := statement_timestamp();
  window_seconds integer := 60;
  rate_limit_record public.launch_rate_limits%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required to consume a launch rate limit.'
      using errcode = '42501';
  end if;

  if p_action not in ('export_download', 'push_subscription_registration') then
    raise exception 'Unsupported launch rate limit action.'
      using errcode = '22023';
  end if;

  limit_count := 6;

  insert into public.launch_rate_limits as launch_rate_limit (
    user_id,
    action,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (
    actor_id,
    p_action,
    observed_at,
    1,
    observed_at
  )
  on conflict (user_id, action) do update
  set
    window_started_at = case
      when launch_rate_limit.window_started_at
        + make_interval(secs => window_seconds) <= observed_at
        then observed_at
      else launch_rate_limit.window_started_at
    end,
    attempt_count = case
      when launch_rate_limit.window_started_at
        + make_interval(secs => window_seconds) <= observed_at
        then 1
      else launch_rate_limit.attempt_count + 1
    end,
    updated_at = observed_at
  returning launch_rate_limit.* into rate_limit_record;

  return query
  select
    rate_limit_record.attempt_count <= limit_count,
    limit_count,
    greatest(0, limit_count - rate_limit_record.attempt_count),
    rate_limit_record.window_started_at
      + make_interval(secs => window_seconds),
    greatest(
      1,
      ceil(
        extract(
          epoch from (
            rate_limit_record.window_started_at
              + make_interval(secs => window_seconds)
              - observed_at
          )
        )
      )::integer
    );
end;
$$;

revoke all on function public.consume_launch_rate_limit(text) from public;
revoke all on function public.consume_launch_rate_limit(text) from anon;
revoke all on function public.consume_launch_rate_limit(text) from service_role;
grant execute on function public.consume_launch_rate_limit(text) to authenticated;

lock table public.push_subscriptions in share row exclusive mode;

with ranked_active_subscriptions as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc, created_at desc, id desc
    ) as subscription_rank
  from public.push_subscriptions
  where active
)
update public.push_subscriptions as subscription
set active = false
from ranked_active_subscriptions as ranked
where subscription.id = ranked.id
  and ranked.subscription_rank > 20;

create or replace function public.enforce_push_subscription_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not new.active then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text, 82020)
  );

  update public.push_subscriptions as subscription
  set active = false
  where subscription.id in (
    select active_subscription.id
    from public.push_subscriptions as active_subscription
    where active_subscription.user_id = new.user_id
      and active_subscription.active
      and active_subscription.id <> new.id
    order by
      active_subscription.updated_at desc,
      active_subscription.created_at desc,
      active_subscription.id desc
    offset 19
  );

  return new;
end;
$$;

drop trigger if exists enforce_push_subscription_cap_after_write
  on public.push_subscriptions;

create trigger enforce_push_subscription_cap_after_write
  after insert or update of active on public.push_subscriptions
  for each row execute function public.enforce_push_subscription_cap();

revoke all on function public.enforce_push_subscription_cap() from public;
revoke all on function public.enforce_push_subscription_cap() from anon;
revoke all on function public.enforce_push_subscription_cap() from authenticated;
revoke all on function public.enforce_push_subscription_cap() from service_role;

comment on function public.enforce_push_subscription_cap() is
  'Serializes active push writes per owner and keeps the registering row plus the 19 most recently used active rows.';

commit;
