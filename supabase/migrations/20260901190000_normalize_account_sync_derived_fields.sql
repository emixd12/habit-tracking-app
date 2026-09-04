-- Derived occurrence identity is database-owned and must not cross the sync contract.
create or replace function cadence_private.normalize_account_sync_row(value jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, case
    when (key ~ '_at$' or key = 'scheduled_for') and jsonb_typeof(item) = 'string'
      then to_jsonb(to_char((item #>> '{}')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    else item
  end), '{}'::jsonb)
  from jsonb_each(value) entry(key, item)
  where key <> 'schedule_range_identity'
$$;
