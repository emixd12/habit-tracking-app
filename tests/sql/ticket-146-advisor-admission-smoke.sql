\set ON_ERROR_STOP on

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data
)
values
  ('14600000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ticket-146-admission-one@example.invalid', '{}', '{}'),
  ('14600000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ticket-146-admission-two@example.invalid', '{}', '{}'),
  ('14600000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'ticket-146-admission-three@example.invalid', '{}', '{}');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '14600000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  first_admission record;
  decision record;
  client_number integer;
begin
  select * into first_admission
  from public.acquire_advisor_day_context_read('private-consumer');
  if first_admission.lease_token is null or first_admission.retry_after_seconds is not null then
    raise exception 'First owner lease was not granted.';
  end if;

  -- This is the same owner/client boundary backed by the advisory lock in the RPC.
  select * into decision
  from public.acquire_advisor_day_context_read('private-consumer');
  if decision.lease_token is not null
    or decision.retry_after_seconds is null
    or decision.retry_after_seconds not between 1 and 60 then
    raise exception 'Concurrent owner/client lease was not denied.';
  end if;

  for client_number in 2..6 loop
    select * into decision
    from public.acquire_advisor_day_context_read('private-consumer-' || client_number);
    if decision.lease_token is null or decision.retry_after_seconds is not null then
      raise exception 'Owner start % was not granted.', client_number;
    end if;
  end loop;

  select * into decision
  from public.acquire_advisor_day_context_read('private-consumer-7');
  if decision.lease_token is not null
    or decision.retry_after_seconds is null
    or decision.retry_after_seconds not between 1 and 60 then
    raise exception 'The account-wide six-start limit allowed a client bypass.';
  end if;

  begin
    perform public.acquire_advisor_day_context_read('bad client id');
    raise exception 'Invalid client id was accepted.';
  exception when sqlstate '22023' then
    null;
  end;

  if not has_schema_privilege('authenticated', 'cadence_advisor_private', 'USAGE')
    or has_table_privilege('authenticated', 'cadence_advisor_private.day_context_read_admissions', 'SELECT')
    or has_table_privilege('authenticated', 'cadence_advisor_private.day_context_read_admissions', 'INSERT')
    or has_table_privilege('authenticated', 'cadence_advisor_private.day_context_read_admissions', 'UPDATE')
    or has_table_privilege('authenticated', 'cadence_advisor_private.day_context_read_admissions', 'DELETE') then
    raise exception 'Authenticated users do not have the intended helper access or can read admission state.';
  end if;
  if has_function_privilege(
    'service_role',
    'public.acquire_advisor_day_context_read(text)',
    'EXECUTE'
  ) then
    raise exception 'Service role can invoke advisor admission.';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '14600000-0000-4000-8000-000000000002',
  true
);

do $$
declare
  first_admission record;
  second_admission record;
begin
  select * into first_admission
  from public.acquire_advisor_day_context_read('private-consumer');
  if first_admission.lease_token is null then
    raise exception 'Second owner did not receive an isolated lease.';
  end if;

  if public.release_advisor_day_context_read(
    'private-consumer',
    gen_random_uuid()
  ) then
    raise exception 'Unknown lease was released.';
  end if;
  if not public.release_advisor_day_context_read(
    'private-consumer',
    first_admission.lease_token
  ) then
    raise exception 'Owner could not release its lease.';
  end if;

  select * into second_admission
  from public.acquire_advisor_day_context_read('private-consumer');
  if second_admission.lease_token is null then
    raise exception 'Released lease continued to block the owner.';
  end if;
  if public.release_advisor_day_context_read(
    'private-consumer',
    first_admission.lease_token
  ) then
    raise exception 'An old lease released a newer read.';
  end if;
end;
$$;

reset role;
insert into cadence_advisor_private.day_context_read_admissions (
  user_id,
  client_id,
  started_at,
  lease_expires_at
)
values (
  '14600000-0000-4000-8000-000000000003',
  'private-consumer',
  statement_timestamp() - interval '2 minutes',
  statement_timestamp() - interval '60 seconds'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '14600000-0000-4000-8000-000000000003',
  true
);

do $$
declare
  decision record;
begin
  select * into decision
  from public.acquire_advisor_day_context_read('private-consumer');
  if decision.lease_token is null then
    raise exception 'An expired lease continued to block a new read.';
  end if;
end;
$$;

reset role;
rollback;
