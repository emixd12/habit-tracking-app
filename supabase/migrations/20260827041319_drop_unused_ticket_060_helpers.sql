begin;

drop function if exists cadence_private.repair_empty_behavior_schedules(timestamptz);
drop function if exists cadence_private.ticket_060_matches_recurrence(jsonb, date, date);

commit;
