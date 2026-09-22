-- Local-only: docker exec -i supabase_db_habit-tracking-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/sql/ticket-165-travel-budget-smoke.sql
begin;

do $$ begin
  if (select coalesce(sum(attempt_count), 0) from public.travel_route_global_quota) <> 1 then
    raise exception 'This smoke requires only the carried public-landmark reservation';
  end if;
end $$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('16500000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'travel-budget-' || i || '@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from generate_series(1, 8) i;

set local role authenticated;
do $$
declare i integer; j integer; admitted boolean; admitted_count integer := 0;
begin
  for i in 1..8 loop
    perform set_config('request.jwt.claim.sub', '16500000-0000-4000-8000-' || lpad(i::text, 12, '0'), true);
    for j in 1..7 loop
      select allowed into admitted from public.consume_travel_route_quota();
      if admitted then
        admitted_count := admitted_count + 1;
        if j > 6 then raise exception 'Owner daily cap exceeded'; end if;
      end if;
    end loop;
  end loop;
  if admitted_count <> 39 then
    raise exception 'Expected exactly 39 remaining reservations, got %', admitted_count;
  end if;
  begin
    update public.travel_route_global_quota set attempt_count = 1;
    raise exception 'Authenticated caller reset the budget';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A new day must not replenish the initial allowance.
update public.travel_route_global_quota set utc_date = utc_date - 1;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16500000-0000-4000-8000-000000000008', true);
do $$ begin
  if (select allowed from public.consume_travel_route_quota()) then
    raise exception 'The budget renewed at the day boundary';
  end if;
end $$;
reset role;

do $$ begin
  if (select sum(attempt_count) from public.travel_route_global_quota) <> 40 then
    raise exception 'Denied requests changed the lifetime reservation ledger';
  end if;
  if has_function_privilege('anon', 'public.consume_travel_route_quota()', 'EXECUTE') then
    raise exception 'Anonymous callers can consume the budget';
  end if;
end $$;

rollback;
