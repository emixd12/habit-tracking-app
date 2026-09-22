begin;

-- The authorized public-landmark probe already reserved one USD0.50 slot
-- locally on September 22. Carry it into the hosted lifetime allowance.
-- Local databases with that reservation retain their existing counter.
insert into public.travel_route_global_quota (utc_date, attempt_count)
values ('2026-09-22', 1)
on conflict (utc_date) do nothing;

commit;
