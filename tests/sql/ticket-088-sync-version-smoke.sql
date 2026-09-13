\set ON_ERROR_STOP on
begin;
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('88000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ticket-088-owner@example.invalid', '{}', '{}');
set local role authenticated;
set local request.jwt.claim.sub = '88000000-0000-4000-8000-000000000001';
insert into public.occurrence_sync_state(user_id, stale, stale_reason)
values ('88000000-0000-4000-8000-000000000001', true, 'behavior_changed')
on conflict (user_id) do update set stale = true, stale_reason = 'behavior_changed';
do $$
declare expected_version bigint; result jsonb;
begin
 select state_version into expected_version from public.occurrence_sync_state
 where user_id = auth.uid();
 -- A writer changes the marker after the worker captures its generation.
 update public.occurrence_sync_state set stale = true, stale_reason = 'behavior_changed'
 where user_id = auth.uid();
 begin
  perform public.mark_occurrence_sync_fresh_if_configuration_current(
   auth.uid(), '[]'::jsonb, true, expected_version, 'America/New_York',
   '2026-09-04', '2026-10-04', '2026-09-04T13:00:00Z', 0, 0, 0, 0);
  raise exception 'Stale generation was accepted';
 exception when sqlstate 'P0001' then
  if sqlerrm <> 'Occurrence sync state changed after occurrence sync planning.' then raise; end if;
 end;
 assert (select stale from public.occurrence_sync_state where user_id=auth.uid()), 'Concurrent change must stay stale';
 select state_version into expected_version from public.occurrence_sync_state where user_id = auth.uid();
 result := public.mark_occurrence_sync_fresh_if_configuration_current(
   auth.uid(), '[]'::jsonb, true, expected_version, 'America/New_York',
   '2026-09-04', '2026-10-04', '2026-09-04T13:00:00Z', 0, 0, 0, 0);
 assert result->>'stale' = 'false', 'Next generation succeeds';
 result := public.mark_occurrence_sync_fresh_if_configuration_current(
   auth.uid(), '[]'::jsonb, true, (result->>'state_version')::bigint, 'America/New_York',
   '2026-09-04', '2026-10-04', '2026-09-04T13:00:00Z', 0, 0, 0, 0);
 assert result->>'last_sync_created_count' = '0' and result->>'stale' = 'false', 'Retry is idempotent';
end $$;
rollback;
\echo 'Ticket 088 sync version passed; fixtures rolled back.'
