-- Counts only: opening Export must not materialize history or artifacts.
create function public.get_export_page_summary(
  range_start_local_date date,
  range_end_local_date date,
  include_archived boolean,
  include_time_tracking boolean,
  through_started_at timestamptz
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  result jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if range_start_local_date is null or range_end_local_date is null
    or range_start_local_date > range_end_local_date
    or include_archived is null or include_time_tracking is null
    or through_started_at is null then
    raise exception 'Invalid export summary options.' using errcode = '22023';
  end if;
  with selected_behaviors as materialized (
    select id from public.behaviors
    where user_id = owner_id and (include_archived or active)
  ), selected_occurrences as materialized (
    select o.id, o.status from public.occurrences o
    join selected_behaviors b on b.id = o.behavior_id
    where o.user_id = owner_id
      and o.local_date between range_start_local_date and range_end_local_date
  )
  select jsonb_build_object(
    'behavior_count', (select count(*) from selected_behaviors),
    'completed_count', count(*) filter (where status = 'completed'),
    'not_completed_count', count(*) filter (where status = 'not_completed'),
    'unresolved_count', count(*) filter (where status = 'unresolved'),
    'time_session_count', case when include_time_tracking then (
      select count(*) from public.occurrence_time_sessions t
      join selected_occurrences o on o.id = t.occurrence_id
      where t.user_id = owner_id and t.started_at <= through_started_at
    ) else 0 end
  ) into result from selected_occurrences;
  return result;
end;
$$;
revoke all on function public.get_export_page_summary(date, date, boolean, boolean, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.get_export_page_summary(date, date, boolean, boolean, timestamptz)
  to authenticated;
