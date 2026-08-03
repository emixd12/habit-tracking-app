create table public.launch_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('export_download')),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action)
);

alter table public.launch_rate_limits enable row level security;

create policy "Users can read their own launch rate limits"
on public.launch_rate_limits
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.launch_rate_limits from public, anon, authenticated;
grant select on table public.launch_rate_limits to authenticated;

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

  if p_action <> 'export_download' then
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
grant execute on function public.consume_launch_rate_limit(text) to authenticated;

comment on table public.launch_rate_limits is
  'Owner-scoped distributed counters for cost-amplifying authenticated actions.';

comment on function public.consume_launch_rate_limit(text) is
  'Atomically applies Cadence-owned fixed limits for authenticated costly actions.';
