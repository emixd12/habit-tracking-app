\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values('13400000-0000-4000-8000-000000000001','authenticated','authenticated','calendar-one@example.invalid','{}','{}'),
('13400000-0000-4000-8000-000000000002','authenticated','authenticated','calendar-two@example.invalid','{}','{}');
insert into auth.identities(provider_id,user_id,identity_data,provider)
values('calendar-one','13400000-0000-4000-8000-000000000001','{"sub":"calendar-one"}','google'),
('calendar-two','13400000-0000-4000-8000-000000000002','{"sub":"calendar-two"}','google');
set local role service_role;
select public.calendar_begin_attempt('13400000-0000-4000-8000-000000000001','calendar-one',repeat('a',64),'sealed-verifier',0,'web','');
select public.calendar_begin_attempt('13400000-0000-4000-8000-000000000002','calendar-two',repeat('b',64),'sealed-verifier',0,'web','');
do $$ begin
 if public.calendar_consume_attempt(repeat('a',64)) is null then raise exception 'consume failed'; end if;
 if public.calendar_consume_attempt(repeat('a',64)) is not null then raise exception 'replay allowed'; end if;
 if public.calendar_install_credential('13400000-0000-4000-8000-000000000001','calendar-two',0,repeat('a',64),'sealed') then raise exception 'wrong subject accepted'; end if;
 if not public.calendar_install_credential('13400000-0000-4000-8000-000000000001','calendar-one',0,repeat('a',64),'sealed') then raise exception 'install failed'; end if;
 if public.calendar_install_credential('13400000-0000-4000-8000-000000000001','calendar-one',0,repeat('a',64),'stale') then raise exception 'stale install accepted'; end if;
 if public.calendar_read_credential('13400000-0000-4000-8000-000000000001','calendar-one',1) <> 'sealed' then raise exception 'credential missing'; end if;
 perform public.calendar_disconnect('13400000-0000-4000-8000-000000000001','calendar-one',1,'disconnected');
 if public.calendar_read_credential('13400000-0000-4000-8000-000000000001','calendar-one',1) is not null then raise exception 'credential retained'; end if;
 if public.calendar_install_credential('13400000-0000-4000-8000-000000000001','calendar-one',0,repeat('a',64),'late') then raise exception 'late callback resurrected'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.google_calendar_connections) <> 1 then raise exception 'connection isolation'; end if;
 if (select count(*) from public.google_calendar_preferences) <> 1 then raise exception 'preferences isolation'; end if;
 if has_function_privilege('authenticated','public.calendar_read_credential(uuid,text,bigint)','EXECUTE') then raise exception 'credential RPC exposed'; end if;
 if has_function_privilege('anon','public.calendar_consume_attempt(text)','EXECUTE') then raise exception 'attempt RPC exposed'; end if;
 if has_schema_privilege('authenticated','cadence_calendar_private','USAGE') then raise exception 'private schema exposed'; end if;
 if has_table_privilege('authenticated','public.google_calendar_connections','UPDATE') then raise exception 'connection writable'; end if;
 update public.google_calendar_preferences set visible=false where user_id='13400000-0000-4000-8000-000000000002';
 if found then raise exception 'cross account update'; end if;
 update public.google_calendar_preferences set selected_calendar_ids=array['synthetic'] where user_id='13400000-0000-4000-8000-000000000001';
 if (select selection_revision from public.google_calendar_preferences) <> 2 then raise exception 'selection revision failed'; end if;
end $$;
reset role;
rollback;
