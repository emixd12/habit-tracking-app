\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
  ('14600000-0000-4000-8000-000000000001','authenticated','authenticated','advisor-one@example.invalid','{}','{}'),
  ('14600000-0000-4000-8000-000000000002','authenticated','authenticated','advisor-two@example.invalid','{}','{}');
insert into public.profiles(id,email,timezone)
values
  ('14600000-0000-4000-8000-000000000001','advisor-one@example.invalid','America/New_York'),
  ('14600000-0000-4000-8000-000000000002','advisor-two@example.invalid','America/New_York')
on conflict (id) do update set timezone = excluded.timezone;
insert into public.behaviors(id,user_id,title,recurrence_rule,scheduled_time,timezone)
values
  ('14610000-0000-4000-8000-000000000001','14600000-0000-4000-8000-000000000001','Owner one','{"type":"daily"}','08:00','America/New_York'),
  ('14610000-0000-4000-8000-000000000002','14600000-0000-4000-8000-000000000002','Owner two','{"type":"daily"}','09:00','America/New_York');
insert into public.occurrences(id,user_id,behavior_id,scheduled_for,local_date,schedule_kind,schedule_start_time,status)
values
  ('14620000-0000-4000-8000-000000000001','14600000-0000-4000-8000-000000000001','14610000-0000-4000-8000-000000000001',date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York' + interval '8 hours',(now() at time zone 'America/New_York')::date,'exact','08:00','unresolved'),
  ('14620000-0000-4000-8000-000000000002','14600000-0000-4000-8000-000000000002','14610000-0000-4000-8000-000000000002',date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York' + interval '9 hours',(now() at time zone 'America/New_York')::date,'exact','09:00','unresolved'),
  ('14620000-0000-4000-8000-000000000011','14600000-0000-4000-8000-000000000001','14610000-0000-4000-8000-000000000001',(date_trunc('day', now() at time zone 'America/New_York') - interval '3 days') at time zone 'America/New_York' + interval '8 hours',(now() at time zone 'America/New_York')::date - 3,'exact','08:00','completed'),
  ('14620000-0000-4000-8000-000000000012','14600000-0000-4000-8000-000000000001','14610000-0000-4000-8000-000000000001',(date_trunc('day', now() at time zone 'America/New_York') - interval '2 days') at time zone 'America/New_York' + interval '8 hours',(now() at time zone 'America/New_York')::date - 2,'exact','08:00','not_completed'),
  ('14620000-0000-4000-8000-000000000013','14600000-0000-4000-8000-000000000001','14610000-0000-4000-8000-000000000001',(date_trunc('day', now() at time zone 'America/New_York') - interval '1 day') at time zone 'America/New_York' + interval '8 hours',(now() at time zone 'America/New_York')::date - 1,'exact','08:00','unresolved');
insert into public.occurrence_sync_state(user_id,timezone,last_synced_local_date,synced_through_local_date,last_successful_sync_at,stale,stale_reason)
values
  ('14600000-0000-4000-8000-000000000001','America/New_York',(now() at time zone 'America/New_York')::date,(now() at time zone 'America/New_York')::date,now(),false,null),
  ('14600000-0000-4000-8000-000000000002','America/New_York',(now() at time zone 'America/New_York')::date,(now() at time zone 'America/New_York')::date,now(),false,null);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14600000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  target date := (now() at time zone 'America/New_York')::date;
  snapshot jsonb;
  before_revision text;
begin
  snapshot := public.read_advisor_cadence_snapshot(
    target,
    target - 90,
    array['14610000-0000-4000-8000-000000000001','14610000-0000-4000-8000-000000000002']::uuid[],
    10000,
    20000
  );
  if jsonb_array_length(snapshot -> 'behaviors') <> 1
    or snapshot #>> '{behaviors,0,title}' <> 'Owner one'
    or jsonb_array_length(snapshot -> 'occurrences') <> 1 then
    raise exception 'advisor snapshot crossed owner boundary';
  end if;
  if jsonb_array_length(snapshot -> 'historyOccurrences') <> 3
    or (select array_agg(item ->> 'status' order by item ->> 'status') from jsonb_array_elements(snapshot -> 'historyOccurrences') as item)
      is distinct from array['completed','not_completed','unresolved'] then
    raise exception 'advisor snapshot did not return all history statuses';
  end if;
  before_revision := snapshot ->> 'revision';
  perform set_config('cadence_test.advisor_revision', before_revision, true);
  if has_function_privilege('anon','public.read_advisor_cadence_snapshot(date,date,uuid[],integer,integer)','EXECUTE') then raise exception 'anon advisor snapshot access'; end if;
  if has_function_privilege('service_role','public.read_advisor_cadence_snapshot(date,date,uuid[],integer,integer)','EXECUTE') then raise exception 'service-role advisor snapshot access'; end if;
  if has_function_privilege('service_role','cadence_private.advisor_cadence_snapshot_payload(uuid,date,date,uuid[],integer,integer)','EXECUTE') then raise exception 'service-role private helper access'; end if;
end $$;

reset role;
update public.behaviors set title = 'Owner one revised' where id = '14610000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  target date := (now() at time zone 'America/New_York')::date;
begin
  if public.read_advisor_cadence_revision(target,target - 90,array['14610000-0000-4000-8000-000000000001']::uuid[],10000,20000) = current_setting('cadence_test.advisor_revision') then
    raise exception 'advisor revision fence did not change';
  end if;
end $$;
reset role;
rollback;
