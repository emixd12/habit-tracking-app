\set ON_ERROR_STOP on
begin;
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ticket-091-owner@example.invalid', '{}', '{}'),
('91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ticket-091-other@example.invalid', '{}', '{}');
insert into public.behaviors(id, user_id, title, recurrence_rule, scheduled_time, active)
values ('91000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000001', 'Summary active', '{"frequency":"daily","interval":1}', '09:00', true),
('91000000-0000-4000-8000-000000000012', '91000000-0000-4000-8000-000000000001', 'Summary inactive', '{"frequency":"daily","interval":1}', '09:00', false),
('91000000-0000-4000-8000-000000000013', '91000000-0000-4000-8000-000000000002', 'Other owner', '{"frequency":"daily","interval":1}', '09:00', true);
insert into public.occurrences(id, user_id, behavior_id, scheduled_for, local_date, schedule_start_time, status)
select ('91000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
 '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011',
 '2026-09-04T13:00:00Z'::timestamptz + n * interval '1 second', '2026-09-04', ('09:00'::time + n * interval '1 second'),
 case when n % 3 = 0 then 'completed' when n % 3 = 1 then 'not_completed' else 'unresolved' end
from generate_series(100, 1101) n;
insert into public.occurrences(user_id, behavior_id, scheduled_for, local_date, schedule_start_time, status)
values ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000012','2026-09-04T13:00:00Z','2026-09-04','09:00','completed'),
('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000013','2026-09-04T13:00:00Z','2026-09-04','09:00','completed'),
('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000011','2026-09-10T13:00:00Z','2026-09-10','09:00','unresolved');
insert into public.occurrence_time_sessions(user_id, occurrence_id, behavior_id, started_at, stopped_at)
values ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000100','91000000-0000-4000-8000-000000000011','2026-09-04T13:00:00Z','2026-09-04T13:01:00Z');
insert into public.occurrence_time_sessions(user_id, occurrence_id, behavior_id, started_at, stopped_at)
values ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000100','91000000-0000-4000-8000-000000000011','2026-09-04T15:00:00Z','2026-09-04T15:01:00Z');
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
do $$
declare summary jsonb;
begin
 summary := public.get_export_page_summary('2026-09-04','2026-09-04',false,true,'2026-09-04T14:00:00Z');
 assert summary = '{"behavior_count":1,"completed_count":334,"not_completed_count":334,"unresolved_count":334,"time_session_count":1}'::jsonb, 'Counts must include >1000 rows and exclude other owners/inactive behaviors';
 summary := public.get_export_page_summary('0001-01-01','9999-12-31',true,false,'2026-09-04T14:00:00Z');
 assert summary->>'behavior_count' = '2' and summary->>'completed_count' = '335' and summary->>'unresolved_count' = '335' and summary->>'time_session_count' = '0', 'All-time/archive/time-tracking options';
 summary := public.get_export_page_summary('2025-01-01','2025-01-02',false,false,'2026-09-04T14:00:00Z');
 assert summary->>'completed_count' = '0' and summary->>'unresolved_count' = '0', 'Empty range';
 begin
  perform public.get_export_page_summary('2026-09-05','2026-09-04',false,false,'2026-09-04T14:00:00Z');
  raise exception 'Invalid range accepted';
 exception when invalid_parameter_value then null;
 end;
end;
$$;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000002';
do $$ begin
 assert public.get_export_page_summary('2026-09-04','2026-09-04',true,true,'2026-09-04T14:00:00Z')->>'completed_count' = '1', 'Second owner isolation';
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon', 'public.get_export_page_summary(date,date,boolean,boolean,timestamptz)', 'execute'), 'Anonymous execute denied';
 assert not has_function_privilege('service_role', 'public.get_export_page_summary(date,date,boolean,boolean,timestamptz)', 'execute'), 'No service-role API';
end $$;
rollback;
\echo 'Ticket 091 summary SQL passed; fixtures rolled back.'
