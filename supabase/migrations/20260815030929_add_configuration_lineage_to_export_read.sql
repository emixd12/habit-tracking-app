create or replace function public.get_export_page_read_bundle(
  range_start_local_date date,
  range_end_local_date date
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with authenticated_user as (
  select auth.uid() as user_id
),
filtered_occurrences as (
  select o.*
  from public.occurrences o
  join authenticated_user au on au.user_id = o.user_id
  where o.local_date <= range_end_local_date
    and (
      range_start_local_date is null
      or o.local_date >= range_start_local_date
    )
)
select jsonb_build_object(
  'profile',
    (
      select to_jsonb(profile_row)
      from (
        select p.timezone
        from public.profiles p
        where p.id = au.user_id
      ) profile_row
    ),
  'sync_state',
    (
      select to_jsonb(sync_state_row)
      from (
        select
          s.timezone,
          s.last_synced_local_date,
          s.synced_through_local_date,
          s.last_successful_sync_at,
          s.stale,
          s.stale_reason,
          s.state_version,
          s.last_sync_behavior_count,
          s.last_sync_created_count,
          s.last_sync_updated_count,
          s.last_sync_deleted_count,
          s.created_at,
          s.updated_at
        from public.occurrence_sync_state s
        where s.user_id = au.user_id
      ) sync_state_row
    ),
  'categories',
    coalesce(
      (
        select jsonb_agg(to_jsonb(category_row) order by category_row.sort_order, category_row.name)
        from (
          select
            c.id,
            c.name,
            c.sort_order,
            c.created_at,
            c.updated_at
          from public.categories c
          where c.user_id = au.user_id
        ) category_row
      ),
      '[]'::jsonb
    ),
  'behaviors',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'category_id', b.category_id,
            'category',
              case
                when c.id is null then null
                else jsonb_build_object(
                  'id', c.id,
                  'name', c.name
                )
              end,
            'title', b.title,
            'description', b.description,
            'recurrence_rule', b.recurrence_rule,
            'scheduled_time', b.scheduled_time,
            'schedule_slots',
              coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', slot.id,
                      'behavior_id', slot.behavior_id,
                      'kind', slot.kind,
                      'preset', slot.preset,
                      'start_time', slot.start_time,
                      'end_time', slot.end_time,
                      'sort_order', slot.sort_order,
                      'created_at', slot.created_at,
                      'updated_at', slot.updated_at
                    )
                    order by slot.sort_order, slot.start_time
                  )
                  from public.behavior_schedule_slots slot
                  where slot.user_id = au.user_id
                    and slot.behavior_id = b.id
                ),
                '[]'::jsonb
              ),
            'timezone', b.timezone,
            'browser_reminder_enabled', b.browser_reminder_enabled,
            'email_reminder_enabled', b.email_reminder_enabled,
            'reminder_offset_minutes', b.reminder_offset_minutes,
            'active', b.active,
            'archived_at', b.archived_at,
            'current_configuration_event_id', b.current_configuration_event_id,
            'created_at', b.created_at,
            'updated_at', b.updated_at
          )
          order by b.active desc, b.scheduled_time, b.title
        )
        from public.behaviors b
        left join public.categories c
          on c.user_id = au.user_id
         and c.id = b.category_id
        where b.user_id = au.user_id
      ),
      '[]'::jsonb
    ),
  'occurrences',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'behavior_id', o.behavior_id,
            'behavior_schedule_slot_id', o.behavior_schedule_slot_id,
            'behavior_configuration_event_id', o.behavior_configuration_event_id,
            'scheduled_for', o.scheduled_for,
            'local_date', o.local_date,
            'schedule_kind', o.schedule_kind,
            'schedule_preset', o.schedule_preset,
            'schedule_start_time', o.schedule_start_time,
            'schedule_end_time', o.schedule_end_time,
            'status', o.status,
            'completed_at', o.completed_at,
            'status_marked_at', o.status_marked_at,
            'note', o.note,
            'created_at', o.created_at,
            'updated_at', o.updated_at
          )
          order by o.local_date, o.scheduled_for
        )
        from filtered_occurrences o
      ),
      '[]'::jsonb
    ),
  'status_events',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'occurrence_id', e.occurrence_id,
            'behavior_id', e.behavior_id,
            'previous_status', e.previous_status,
            'status', e.status,
            'status_semantics', e.status_semantics,
            'recorded_at', e.recorded_at,
            'effective_at', e.effective_at,
            'local_date', e.local_date,
            'timezone', e.timezone,
            'source_capture_method', e.source_capture_method,
            'source_confidence', e.source_confidence,
            'revises_event_id', e.revises_event_id,
            'reason_code', e.reason_code,
            'created_at', e.created_at,
            'updated_at', e.updated_at
          )
          order by e.recorded_at, e.id
        )
        from public.occurrence_status_events e
        where e.user_id = au.user_id
          and exists (
            select 1
            from filtered_occurrences o
            where o.id = e.occurrence_id
          )
      ),
      '[]'::jsonb
    ),
  'reminder_deliveries',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'occurrence_id', d.occurrence_id,
            'channel', d.channel,
            'scheduled_send_at', d.scheduled_send_at,
            'sent_at', d.sent_at,
            'status', d.status,
            'error', d.error,
            'processing_started_at', d.processing_started_at,
            'created_at', d.created_at,
            'updated_at', d.updated_at
          )
          order by d.scheduled_send_at, d.id
        )
        from public.reminder_deliveries d
        where d.user_id = au.user_id
          and exists (
            select 1
            from filtered_occurrences o
            where o.id = d.occurrence_id
          )
      ),
      '[]'::jsonb
    )
)
from authenticated_user au;
$$;

revoke all on function public.get_export_page_read_bundle(date, date) from public;
revoke all on function public.get_export_page_read_bundle(date, date) from anon;
grant execute on function public.get_export_page_read_bundle(date, date) to authenticated;
