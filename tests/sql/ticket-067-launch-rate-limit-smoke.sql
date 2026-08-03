\set ON_ERROR_STOP on

begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '67000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'ticket-067-rate-limit@example.invalid',
  '',
  '2026-08-01T00:00:00Z',
  '{"provider":"email","providers":["email"]}',
  '{}',
  '2026-08-01T00:00:00Z',
  '2026-08-01T00:00:00Z'
);

set local role authenticated;
set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000001';

do $$
declare
  attempt_number integer;
  decision record;
  direct_write_blocked boolean := false;
begin
  for attempt_number in 1..7 loop
    select *
    into strict decision
    from public.consume_launch_rate_limit('export_download');

    if decision.limit_count <> 6 then
      raise exception 'Expected a fixed limit of six.';
    end if;

    if decision.allowed <> (attempt_number <= 6) then
      raise exception 'Unexpected decision for attempt %.', attempt_number;
    end if;

    if decision.remaining <> greatest(0, 6 - attempt_number) then
      raise exception 'Unexpected remaining count for attempt %.', attempt_number;
    end if;

    if decision.retry_after_seconds < 1 or decision.retry_after_seconds > 60 then
      raise exception 'Unexpected retry interval for attempt %.', attempt_number;
    end if;
  end loop;

  if (
    select attempt_count
    from public.launch_rate_limits
    where action = 'export_download'
  ) <> 7 then
    raise exception 'The account counter did not retain all seven attempts.';
  end if;

  begin
    update public.launch_rate_limits
    set attempt_count = 1
    where action = 'export_download';
  exception
    when insufficient_privilege then
      direct_write_blocked := true;
  end;

  if not direct_write_blocked then
    raise exception 'Authenticated direct counter writes must remain blocked.';
  end if;
end;
$$;

reset role;
rollback;
