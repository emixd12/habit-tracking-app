alter table public.behaviorlog_import_runs
  drop constraint if exists behaviorlog_import_runs_import_mode_check;

alter table public.behaviorlog_import_runs
  add constraint behaviorlog_import_runs_import_mode_check
  check (
    import_mode in (
      'preview_only',
      'create_missing_only',
      'merge_preview',
      'merge_by_user_approved_plan',
      'restore_preview',
      'restore_apply'
    )
  );

create or replace function public.apply_behaviorlog_restore(
  restore_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  affected_count int;
  result jsonb := jsonb_build_object(
    'archived_behaviors', 0,
    'deleted_schedules', 0,
    'deleted_occurrences', 0,
    'deleted_status_events', 0,
    'deleted_inline_notes', 0,
    'deleted_imported_notes', 0,
    'deleted_imported_interventions', 0,
    'upserted_behaviors', 0,
    'upserted_schedules', 0,
    'upserted_occurrences', 0,
    'upserted_status_events', 0,
    'upserted_imported_notes', 0,
    'upserted_imported_interventions', 0
  );
begin
  if current_user_id is null then
    raise exception 'apply_behaviorlog_restore requires an authenticated user';
  end if;

  update public.behaviors
  set
    active = false,
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where user_id = current_user_id
    and id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'archive_behavior_ids', '[]'::jsonb)
      )
    );
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{archived_behaviors}', to_jsonb(affected_count), false);

  delete from public.imported_interventions
  where user_id = current_user_id
    and id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_imported_intervention_ids', '[]'::jsonb)
      )
    );
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{deleted_imported_interventions}', to_jsonb(affected_count), false);

  delete from public.imported_notes
  where user_id = current_user_id
    and id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_imported_note_ids', '[]'::jsonb)
      )
    );
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{deleted_imported_notes}', to_jsonb(affected_count), false);

  update public.occurrences
  set note = null, updated_at = now()
  where user_id = current_user_id
    and id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'clear_occurrence_note_ids', '[]'::jsonb)
      )
    );
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{deleted_inline_notes}', to_jsonb(affected_count), false);

  delete from public.occurrence_status_events
  where user_id = current_user_id
    and id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_status_event_ids', '[]'::jsonb)
      )
    );
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{deleted_status_events}', to_jsonb(affected_count), false);

  delete from public.occurrences
  where user_id = current_user_id
    and id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_occurrence_ids', '[]'::jsonb)
      )
    );
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{deleted_occurrences}', to_jsonb(affected_count), false);

  delete from public.behavior_schedule_slots
  where user_id = current_user_id
    and id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_schedule_ids', '[]'::jsonb)
      )
    );
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{deleted_schedules}', to_jsonb(affected_count), false);

  insert into public.behaviors (
    id,
    user_id,
    category_id,
    title,
    description,
    recurrence_rule,
    scheduled_time,
    timezone,
    browser_reminder_enabled,
    email_reminder_enabled,
    reminder_offset_minutes,
    active,
    archived_at,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(row ->> 'id', '')::uuid, gen_random_uuid()),
    current_user_id,
    nullif(row ->> 'category_id', '')::uuid,
    row ->> 'title',
    nullif(row ->> 'description', ''),
    row -> 'recurrence_rule',
    (row ->> 'scheduled_time')::time,
    row ->> 'timezone',
    coalesce((row ->> 'browser_reminder_enabled')::boolean, true),
    coalesce((row ->> 'email_reminder_enabled')::boolean, false),
    coalesce((row ->> 'reminder_offset_minutes')::int, 0),
    coalesce((row ->> 'active')::boolean, true),
    nullif(row ->> 'archived_at', '')::timestamptz,
    coalesce(nullif(row ->> 'created_at', '')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(restore_payload -> 'behaviors', '[]'::jsonb)) as row
  on conflict (import_run_id, external_id) do update set
    category_id = excluded.category_id,
    title = excluded.title,
    description = excluded.description,
    recurrence_rule = excluded.recurrence_rule,
    scheduled_time = excluded.scheduled_time,
    timezone = excluded.timezone,
    browser_reminder_enabled = excluded.browser_reminder_enabled,
    email_reminder_enabled = excluded.email_reminder_enabled,
    reminder_offset_minutes = excluded.reminder_offset_minutes,
    active = excluded.active,
    archived_at = excluded.archived_at,
    updated_at = now()
  where public.behaviors.user_id = current_user_id;
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{upserted_behaviors}', to_jsonb(affected_count), false);

  insert into public.behavior_schedule_slots (
    id,
    user_id,
    behavior_id,
    kind,
    preset,
    start_time,
    end_time,
    sort_order,
    created_at,
    updated_at
  )
  select
    (row ->> 'id')::uuid,
    current_user_id,
    (row ->> 'behavior_id')::uuid,
    row ->> 'kind',
    nullif(row ->> 'preset', ''),
    (row ->> 'start_time')::time,
    nullif(row ->> 'end_time', '')::time,
    coalesce((row ->> 'sort_order')::int, 0),
    now(),
    now()
  from jsonb_array_elements(coalesce(restore_payload -> 'schedules', '[]'::jsonb)) as row
  on conflict (id) do update set
    behavior_id = excluded.behavior_id,
    kind = excluded.kind,
    preset = excluded.preset,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    sort_order = excluded.sort_order,
    updated_at = now()
  where public.behavior_schedule_slots.user_id = current_user_id;
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{upserted_schedules}', to_jsonb(affected_count), false);

  insert into public.occurrences (
    id,
    user_id,
    behavior_id,
    behavior_schedule_slot_id,
    scheduled_for,
    local_date,
    schedule_kind,
    schedule_preset,
    schedule_start_time,
    schedule_end_time,
    status,
    completed_at,
    status_marked_at,
    note,
    created_at,
    updated_at
  )
  select
    (row ->> 'id')::uuid,
    current_user_id,
    (row ->> 'behavior_id')::uuid,
    nullif(row ->> 'behavior_schedule_slot_id', '')::uuid,
    (row ->> 'scheduled_for')::timestamptz,
    (row ->> 'local_date')::date,
    row ->> 'schedule_kind',
    nullif(row ->> 'schedule_preset', ''),
    (row ->> 'schedule_start_time')::time,
    nullif(row ->> 'schedule_end_time', '')::time,
    row ->> 'status',
    nullif(row ->> 'completed_at', '')::timestamptz,
    nullif(row ->> 'status_marked_at', '')::timestamptz,
    nullif(row ->> 'note', ''),
    coalesce(nullif(row ->> 'created_at', '')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(restore_payload -> 'occurrences', '[]'::jsonb)) as row
  on conflict (id) do update set
    behavior_id = excluded.behavior_id,
    behavior_schedule_slot_id = excluded.behavior_schedule_slot_id,
    scheduled_for = excluded.scheduled_for,
    local_date = excluded.local_date,
    schedule_kind = excluded.schedule_kind,
    schedule_preset = excluded.schedule_preset,
    schedule_start_time = excluded.schedule_start_time,
    schedule_end_time = excluded.schedule_end_time,
    status = excluded.status,
    completed_at = excluded.completed_at,
    status_marked_at = excluded.status_marked_at,
    note = excluded.note,
    updated_at = now()
  where public.occurrences.user_id = current_user_id;
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{upserted_occurrences}', to_jsonb(affected_count), false);

  insert into public.occurrence_status_events (
    id,
    user_id,
    occurrence_id,
    behavior_id,
    previous_status,
    status,
    status_semantics,
    recorded_at,
    effective_at,
    local_date,
    timezone,
    source_capture_method,
    source_confidence,
    revises_event_id,
    reason_code,
    created_at,
    updated_at
  )
  select
    (row ->> 'id')::uuid,
    current_user_id,
    (row ->> 'occurrence_id')::uuid,
    (row ->> 'behavior_id')::uuid,
    nullif(row ->> 'previous_status', ''),
    row ->> 'status',
    row ->> 'status_semantics',
    (row ->> 'recorded_at')::timestamptz,
    nullif(row ->> 'effective_at', '')::timestamptz,
    (row ->> 'local_date')::date,
    row ->> 'timezone',
    row ->> 'source_capture_method',
    row ->> 'source_confidence',
    nullif(row ->> 'revises_event_id', '')::uuid,
    nullif(row ->> 'reason_code', ''),
    now(),
    now()
  from jsonb_array_elements(coalesce(restore_payload -> 'status_events', '[]'::jsonb)) as row
  on conflict (id) do update set
    occurrence_id = excluded.occurrence_id,
    behavior_id = excluded.behavior_id,
    previous_status = excluded.previous_status,
    status = excluded.status,
    status_semantics = excluded.status_semantics,
    recorded_at = excluded.recorded_at,
    effective_at = excluded.effective_at,
    local_date = excluded.local_date,
    timezone = excluded.timezone,
    source_capture_method = excluded.source_capture_method,
    source_confidence = excluded.source_confidence,
    revises_event_id = excluded.revises_event_id,
    reason_code = excluded.reason_code,
    updated_at = now()
  where public.occurrence_status_events.user_id = current_user_id;
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{upserted_status_events}', to_jsonb(affected_count), false);

  insert into public.imported_notes (
    id,
    user_id,
    import_run_id,
    external_id,
    target_type,
    target_external_id,
    target_local_id,
    body_markdown,
    note_role,
    sensitivity,
    source_original_id,
    source_capture_method,
    source_confidence,
    imported_created_at,
    imported_updated_at,
    metadata,
    created_at,
    updated_at
  )
  select
    (row ->> 'id')::uuid,
    current_user_id,
    (row ->> 'import_run_id')::uuid,
    row ->> 'external_id',
    row ->> 'target_type',
    row ->> 'target_external_id',
    nullif(row ->> 'target_local_id', '')::uuid,
    row ->> 'body_markdown',
    row ->> 'note_role',
    nullif(row ->> 'sensitivity', ''),
    nullif(row ->> 'source_original_id', ''),
    row ->> 'source_capture_method',
    row ->> 'source_confidence',
    (row ->> 'imported_created_at')::timestamptz,
    nullif(row ->> 'imported_updated_at', '')::timestamptz,
    coalesce(row -> 'metadata', '{}'::jsonb),
    now(),
    now()
  from jsonb_array_elements(coalesce(restore_payload -> 'imported_notes', '[]'::jsonb)) as row
  on conflict (id) do update set
    import_run_id = excluded.import_run_id,
    external_id = excluded.external_id,
    target_type = excluded.target_type,
    target_external_id = excluded.target_external_id,
    target_local_id = excluded.target_local_id,
    body_markdown = excluded.body_markdown,
    note_role = excluded.note_role,
    sensitivity = excluded.sensitivity,
    source_original_id = excluded.source_original_id,
    source_capture_method = excluded.source_capture_method,
    source_confidence = excluded.source_confidence,
    imported_created_at = excluded.imported_created_at,
    imported_updated_at = excluded.imported_updated_at,
    metadata = excluded.metadata,
    updated_at = now()
  where public.imported_notes.user_id = current_user_id;
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{upserted_imported_notes}', to_jsonb(affected_count), false);

  insert into public.imported_interventions (
    id,
    user_id,
    import_run_id,
    external_id,
    behavior_external_id,
    occurrence_external_id,
    behavior_id,
    occurrence_id,
    intervention_type,
    channel,
    delivery_status,
    scheduled_send_at,
    sent_at,
    failure_reason,
    source_original_id,
    source_capture_method,
    source_confidence,
    redacted_sensitivity_indicators,
    metadata,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(row ->> 'id', '')::uuid, gen_random_uuid()),
    current_user_id,
    (row ->> 'import_run_id')::uuid,
    row ->> 'external_id',
    row ->> 'behavior_external_id',
    row ->> 'occurrence_external_id',
    nullif(row ->> 'behavior_id', '')::uuid,
    nullif(row ->> 'occurrence_id', '')::uuid,
    nullif(row ->> 'intervention_type', ''),
    row ->> 'channel',
    row ->> 'delivery_status',
    (row ->> 'scheduled_send_at')::timestamptz,
    nullif(row ->> 'sent_at', '')::timestamptz,
    nullif(row ->> 'failure_reason', ''),
    nullif(row ->> 'source_original_id', ''),
    row ->> 'source_capture_method',
    row ->> 'source_confidence',
    coalesce(row -> 'redacted_sensitivity_indicators', '{}'::jsonb),
    coalesce(row -> 'metadata', '{}'::jsonb),
    now(),
    now()
  from jsonb_array_elements(coalesce(restore_payload -> 'imported_interventions', '[]'::jsonb)) as row
  on conflict (import_run_id, external_id) do update set
    import_run_id = excluded.import_run_id,
    external_id = excluded.external_id,
    behavior_external_id = excluded.behavior_external_id,
    occurrence_external_id = excluded.occurrence_external_id,
    behavior_id = excluded.behavior_id,
    occurrence_id = excluded.occurrence_id,
    intervention_type = excluded.intervention_type,
    channel = excluded.channel,
    delivery_status = excluded.delivery_status,
    scheduled_send_at = excluded.scheduled_send_at,
    sent_at = excluded.sent_at,
    failure_reason = excluded.failure_reason,
    source_original_id = excluded.source_original_id,
    source_capture_method = excluded.source_capture_method,
    source_confidence = excluded.source_confidence,
    redacted_sensitivity_indicators = excluded.redacted_sensitivity_indicators,
    metadata = excluded.metadata,
    updated_at = now()
  where public.imported_interventions.user_id = current_user_id;
  get diagnostics affected_count = row_count;
  result := jsonb_set(result, '{upserted_imported_interventions}', to_jsonb(affected_count), false);

  return result;
end;
$$;

grant execute on function public.apply_behaviorlog_restore(jsonb) to authenticated;
