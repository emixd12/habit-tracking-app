alter table public.behaviorlog_import_runs
  drop constraint if exists behaviorlog_import_runs_apply_requires_accepted_preview_check;

alter table public.behaviorlog_import_runs
  add constraint behaviorlog_import_runs_apply_requires_accepted_preview_check
  check (
    import_mode not in (
      'create_missing_only',
      'merge_by_user_approved_plan',
      'restore_apply'
    )
    or (
      accepted_preview_run_id is not null
      and accepted_preview_fingerprint is not null
    )
  ) not valid;

create unique index behaviorlog_import_runs_one_applied_restore_per_preview_idx
  on public.behaviorlog_import_runs (
    user_id,
    accepted_preview_run_id,
    accepted_preview_fingerprint
  )
  where import_mode = 'restore_apply'
    and status = 'applied'
    and accepted_preview_run_id is not null
    and accepted_preview_fingerprint is not null;

alter function public.apply_behaviorlog_restore(jsonb)
  rename to apply_behaviorlog_restore_product_writes;

alter function public.apply_behaviorlog_restore_product_writes(jsonb)
  set search_path = '';

revoke all
  on function public.apply_behaviorlog_restore_product_writes(jsonb)
  from public, anon, authenticated, service_role;

create function public.bind_behaviorlog_restore_apply_payload(
  restore_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_apply_run_id uuid := nullif(restore_payload ->> 'apply_run_id', '')::uuid;
  v_accepted_preview_run_id uuid :=
    nullif(restore_payload ->> 'accepted_preview_run_id', '')::uuid;
  v_accepted_preview_fingerprint text :=
    nullif(restore_payload ->> 'accepted_preview_fingerprint', '');
  v_payload_digest text;
  apply_run public.behaviorlog_import_runs%rowtype;
begin
  if v_user_id is null then
    raise exception 'bind_behaviorlog_restore_apply_payload requires an authenticated user';
  end if;

  if jsonb_typeof(restore_payload) is distinct from 'object'
    or v_apply_run_id is null
    or v_accepted_preview_run_id is null
    or v_accepted_preview_fingerprint is null
  then
    raise exception 'Restore payload binding requires an exact apply identity';
  end if;

  select candidate_run.*
  into apply_run
  from public.behaviorlog_import_runs as candidate_run
  where candidate_run.user_id = v_user_id
    and candidate_run.id = v_apply_run_id
    and candidate_run.import_mode = 'restore_apply'
    and candidate_run.status = 'previewed'
    and candidate_run.accepted_preview_run_id = v_accepted_preview_run_id
    and candidate_run.accepted_preview_fingerprint =
      v_accepted_preview_fingerprint
  for update;

  if not found then
    raise exception 'Pending restore apply run was not found for payload binding';
  end if;

  v_payload_digest := encode(
    extensions.digest(
      convert_to(
        (restore_payload - 'apply_payload_digest')::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if apply_run.dry_run_summary ->> 'applyPayloadDigest' is not null
    and apply_run.dry_run_summary ->> 'applyPayloadDigest'
      is distinct from v_payload_digest
  then
    raise exception 'Restore apply run is already bound to a different payload';
  end if;

  update public.behaviorlog_import_runs
  set dry_run_summary = jsonb_set(
    dry_run_summary,
    '{applyPayloadDigest}',
    to_jsonb(v_payload_digest),
    true
  )
  where user_id = v_user_id
    and id = v_apply_run_id
    and status = 'previewed';

  if not found then
    raise exception 'Restore apply payload digest could not be persisted';
  end if;

  return v_payload_digest;
end;
$$;

revoke all
  on function public.bind_behaviorlog_restore_apply_payload(jsonb)
  from public, anon, authenticated, service_role;
grant execute
  on function public.bind_behaviorlog_restore_apply_payload(jsonb)
  to authenticated;

create function public.apply_behaviorlog_restore(
  restore_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_apply_run_id uuid := nullif(restore_payload ->> 'apply_run_id', '')::uuid;
  v_accepted_preview_run_id uuid :=
    nullif(restore_payload ->> 'accepted_preview_run_id', '')::uuid;
  v_accepted_preview_fingerprint text :=
    nullif(restore_payload ->> 'accepted_preview_fingerprint', '');
  v_accepted_local_data_fingerprint text :=
    nullif(restore_payload ->> 'accepted_local_data_fingerprint', '');
  v_accepted_bundle_fingerprint text :=
    nullif(restore_payload ->> 'accepted_bundle_fingerprint', '');
  v_accepted_bundle_payload_fingerprint text :=
    nullif(restore_payload ->> 'accepted_bundle_payload_fingerprint', '');
  v_apply_payload_digest text :=
    nullif(restore_payload ->> 'apply_payload_digest', '');
  v_computed_apply_payload_digest text;
  accepted_preview_run public.behaviorlog_import_runs%rowtype;
  apply_run public.behaviorlog_import_runs%rowtype;
  existing_applied_run public.behaviorlog_import_runs%rowtype;
  product_result jsonb;
  mapping_count int := 0;
  expected_mapping_count int := 0;
  definition_event_count int := 0;
  expected_definition_event_count int := 0;
  applied_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'apply_behaviorlog_restore requires an authenticated user';
  end if;

  if v_apply_run_id is null
    or v_accepted_preview_run_id is null
    or v_accepted_preview_fingerprint is null
    or v_accepted_local_data_fingerprint is null
    or v_accepted_bundle_fingerprint is null
    or v_accepted_bundle_payload_fingerprint is null
    or v_apply_payload_digest is null
  then
    raise exception 'apply_behaviorlog_restore requires an exact accepted preview identity';
  end if;

  select preview_run.*
  into accepted_preview_run
  from public.behaviorlog_import_runs as preview_run
  where preview_run.user_id = v_user_id
    and preview_run.id = v_accepted_preview_run_id
    and preview_run.import_mode = 'restore_preview'
    and preview_run.status = 'previewed'
  for update;

  if not found then
    raise exception 'Accepted restore preview was not found for the authenticated user';
  end if;

  if accepted_preview_run.dry_run_summary ->> 'previewFingerprint'
      is distinct from v_accepted_preview_fingerprint
    or accepted_preview_run.dry_run_summary ->> 'localDataFingerprint'
      is distinct from v_accepted_local_data_fingerprint
    or accepted_preview_run.dry_run_summary ->> 'bundleFingerprint'
      is distinct from v_accepted_bundle_fingerprint
    or accepted_preview_run.bundle_fingerprint
      is distinct from v_accepted_bundle_fingerprint
    or accepted_preview_run.dry_run_summary ->> 'bundlePayloadFingerprint'
      is distinct from v_accepted_bundle_payload_fingerprint
  then
    raise exception 'Restore apply does not match the exact accepted preview';
  end if;

  if accepted_preview_run.dry_run_summary -> 'valid'
      is distinct from 'true'::jsonb
    or accepted_preview_run.dry_run_summary -> 'errorCount'
      is distinct from '0'::jsonb
    or accepted_preview_run.dry_run_summary -> 'errors'
      is distinct from '[]'::jsonb
    or accepted_preview_run.dry_run_summary #>
      '{summary,unsupportedActionCount}' is distinct from '0'::jsonb
    or accepted_preview_run.dry_run_summary #>
      '{summary,skippedCount}' is distinct from '0'::jsonb
  then
    raise exception 'Accepted restore preview contains invalid, unsupported, or skipped actions';
  end if;

  if accepted_preview_run.dry_run_summary #>
      '{statusHistoryPolicy,selected}'
      is distinct from '"preserve_append_only_history"'::jsonb
    or accepted_preview_run.dry_run_summary #>
      '{statusHistoryPolicy,applySupportedInThisTicket}'
      is distinct from 'true'::jsonb
  then
    raise exception 'Accepted restore status-history policy is preview-only';
  end if;

  select candidate_run.*
  into apply_run
  from public.behaviorlog_import_runs as candidate_run
  where candidate_run.user_id = v_user_id
    and candidate_run.id = v_apply_run_id
    and candidate_run.import_mode = 'restore_apply'
    and candidate_run.accepted_preview_run_id = v_accepted_preview_run_id
    and candidate_run.accepted_preview_fingerprint = v_accepted_preview_fingerprint
  for update;

  if not found then
    raise exception 'Restore apply run was not found for the exact accepted preview';
  end if;

  v_computed_apply_payload_digest := encode(
    extensions.digest(
      convert_to(
        (restore_payload - 'apply_payload_digest')::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if apply_run.dry_run_summary ->> 'applyPayloadDigest'
      is distinct from v_apply_payload_digest
    or v_computed_apply_payload_digest is distinct from v_apply_payload_digest
  then
    raise exception 'Restore apply payload digest does not match its locked ledger';
  end if;

  select applied_run.*
  into existing_applied_run
  from public.behaviorlog_import_runs as applied_run
  where applied_run.user_id = v_user_id
    and applied_run.import_mode = 'restore_apply'
    and applied_run.status = 'applied'
    and applied_run.accepted_preview_run_id = v_accepted_preview_run_id
    and applied_run.accepted_preview_fingerprint = v_accepted_preview_fingerprint
  order by applied_run.completed_at asc nulls last, applied_run.id asc
  limit 1;

  if found then
    if apply_run.id <> existing_applied_run.id
      and apply_run.status = 'previewed'
    then
      update public.behaviorlog_import_runs
      set
        status = 'cancelled',
        failure_message = null,
        completed_at = now(),
        dry_run_summary = jsonb_set(
          dry_run_summary,
          '{idempotency}',
          jsonb_build_object(
            'alreadyApplied', true,
            'appliedRunId', existing_applied_run.id
          ),
          true
        )
      where user_id = v_user_id
        and id = apply_run.id
        and status = 'previewed';
    end if;

    return coalesce(
      existing_applied_run.dry_run_summary -> 'applyResult',
      '{}'::jsonb
    ) || jsonb_build_object(
      'applied_run_id', existing_applied_run.id,
      'applied_run_started_at', existing_applied_run.started_at,
      'applied_run_completed_at', existing_applied_run.completed_at,
      'already_applied', true
    );
  end if;

  if apply_run.status <> 'previewed' then
    raise exception 'Restore apply run is not available to apply';
  end if;

  if jsonb_typeof(coalesce(restore_payload -> 'mappings', '[]'::jsonb)) <> 'array' then
    raise exception 'Restore provenance mappings must be a JSON array';
  end if;

  if jsonb_typeof(
    coalesce(restore_payload -> 'behavior_definition_events', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'Restore behavior definition events must be a JSON array';
  end if;

  if jsonb_typeof(
    coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'Restore row preconditions must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
    ) as row
    where nullif(row ->> 'record_type', '') is null
      or row ->> 'record_type' not in (
      'behavior',
      'schedule',
      'occurrence',
      'status_event',
      'note',
      'intervention'
    )
      or nullif(row ->> 'local_id', '') is null
      or nullif(row ->> 'expectation', '') is null
      or row ->> 'expectation' not in ('absent', 'unchanged')
      or (
        row ->> 'expectation' = 'unchanged'
        and nullif(row ->> 'expected_updated_at', '') is null
      )
      or (
        row ->> 'expectation' = 'absent'
        and nullif(row ->> 'expected_updated_at', '') is not null
      )
  ) then
    raise exception 'Restore row precondition is malformed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
    ) as row
    group by row ->> 'record_type', row ->> 'local_id'
    having count(*) > 1
  ) then
    raise exception 'Restore row preconditions must be unique';
  end if;

  if exists (
    with affected_rows as (
      select
        'behavior'::text as record_type,
        nullif(row ->> 'id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'behaviors', '[]'::jsonb)
      ) as row
      union
      select 'behavior', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'archive_behavior_ids', '[]'::jsonb)
      )
      union
      select 'schedule', nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'schedules', '[]'::jsonb)
      ) as row
      union
      select 'schedule', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_schedule_ids', '[]'::jsonb)
      )
      union
      select 'occurrence', nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'occurrences', '[]'::jsonb)
      ) as row
      union
      select 'occurrence', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_occurrence_ids', '[]'::jsonb)
      )
      union
      select 'occurrence', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'clear_occurrence_note_ids', '[]'::jsonb)
      )
      union
      select 'status_event', nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'status_events', '[]'::jsonb)
      ) as row
      union
      select 'status_event', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_status_event_ids', '[]'::jsonb)
      )
      union
      select 'note', nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'imported_notes', '[]'::jsonb)
      ) as row
      union
      select 'note', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_imported_note_ids', '[]'::jsonb)
      )
      union
      select 'intervention', nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'imported_interventions', '[]'::jsonb)
      ) as row
      union
      select 'intervention', value::uuid
      from jsonb_array_elements_text(
        coalesce(
          restore_payload -> 'delete_imported_intervention_ids',
          '[]'::jsonb
        )
      )
    ),
    precondition_rows as (
      select
        row ->> 'record_type' as record_type,
        nullif(row ->> 'local_id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
      ) as row
    )
    select 1
    from affected_rows
    full join precondition_rows using (record_type, local_id)
    where affected_rows.local_id is null
      or precondition_rows.local_id is null
  ) then
    raise exception 'Restore row preconditions do not exactly cover the affected payload';
  end if;

  if exists (
    with accepted_actions as (
      select 'behavior'::text as record_type, action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,behaviors}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'schedule', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,schedules}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'occurrence', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,occurrences}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'status_event', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,statusEvents}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'note', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,importedNotes}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'intervention', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,importedInterventions}',
          '[]'::jsonb
        )
      ) as action_row
    ),
    mapping_input as (
      select
        row ->> 'record_type' as record_type,
        nullif(btrim(row ->> 'external_id'), '') as external_id,
        nullif(row ->> 'local_id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'mappings', '[]'::jsonb)
      ) as row
    )
    select 1
    from mapping_input
    left join accepted_actions
      on accepted_actions.record_type = mapping_input.record_type
      and accepted_actions.action_row ->> 'externalId' =
        mapping_input.external_id
    where accepted_actions.action_row is null
      or accepted_actions.action_row ->> 'action' not in (
        'create', 'replace', 'keep'
      )
      or (
        accepted_actions.action_row ->> 'action' <> 'create'
        and nullif(accepted_actions.action_row ->> 'localId', '')::uuid
          is distinct from mapping_input.local_id
      )
  ) then
    raise exception 'Restore provenance mapping is outside the accepted preview actions';
  end if;

  if jsonb_array_length(
    coalesce(restore_payload -> 'delete_status_event_ids', '[]'::jsonb)
  ) <> 0 then
    raise exception 'Append-only status-history restore cannot delete status events';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(restore_payload -> 'status_events', '[]'::jsonb)
    ) as status_row
    left join jsonb_array_elements(
      coalesce(
        accepted_preview_run.dry_run_summary #> '{actions,statusEvents}',
        '[]'::jsonb
      )
    ) as action_row
      on action_row ->> 'externalId' = status_row ->> 'external_id'
    where action_row is null
      or action_row ->> 'action' <> 'create'
  ) then
    raise exception 'Append-only status-history restore may only create accepted status events';
  end if;

  if exists (
    with destructive_input as (
      select 'behavior'::text as record_type, 'archive'::text as action_kind,
        value::uuid as local_id
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'archive_behavior_ids', '[]'::jsonb)
      )
      union all
      select 'schedule', 'delete', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_schedule_ids', '[]'::jsonb)
      )
      union all
      select 'occurrence', 'delete', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_occurrence_ids', '[]'::jsonb)
      )
      union all
      select 'inline_occurrence_note', 'delete', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'clear_occurrence_note_ids', '[]'::jsonb)
      )
      union all
      select 'note', 'delete', value::uuid
      from jsonb_array_elements_text(
        coalesce(restore_payload -> 'delete_imported_note_ids', '[]'::jsonb)
      )
      union all
      select 'intervention', 'delete', value::uuid
      from jsonb_array_elements_text(
        coalesce(
          restore_payload -> 'delete_imported_intervention_ids',
          '[]'::jsonb
        )
      )
    ),
    accepted_destructive as (
      select 'behavior'::text as record_type, action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,behaviors}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'schedule', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,schedules}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'occurrence', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,occurrences}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'inline_occurrence_note', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #>
            '{actions,inlineOccurrenceNotes}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'note', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,importedNotes}',
          '[]'::jsonb
        )
      ) as action_row
      union all
      select 'intervention', action_row
      from jsonb_array_elements(
        coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,importedInterventions}',
          '[]'::jsonb
        )
      ) as action_row
    )
    select 1
    from destructive_input
    left join accepted_destructive
      on accepted_destructive.record_type = destructive_input.record_type
      and accepted_destructive.action_row ->> 'action' =
        destructive_input.action_kind
      and nullif(accepted_destructive.action_row ->> 'localId', '')::uuid =
        destructive_input.local_id
    where accepted_destructive.action_row is null
  ) then
    raise exception 'Restore destructive target is outside the accepted preview actions';
  end if;

  perform behavior.id
  from public.behaviors as behavior
  join jsonb_array_elements(
    coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
  ) as row
    on row ->> 'record_type' = 'behavior'
    and row ->> 'expectation' = 'unchanged'
    and (row ->> 'local_id')::uuid = behavior.id
  where behavior.user_id = v_user_id
  order by behavior.id
  for update of behavior;

  perform schedule.id
  from public.behavior_schedule_slots as schedule
  join jsonb_array_elements(
    coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
  ) as row
    on row ->> 'record_type' = 'schedule'
    and row ->> 'expectation' = 'unchanged'
    and (row ->> 'local_id')::uuid = schedule.id
  where schedule.user_id = v_user_id
  order by schedule.id
  for update of schedule;

  perform occurrence.id
  from public.occurrences as occurrence
  join jsonb_array_elements(
    coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
  ) as row
    on row ->> 'record_type' = 'occurrence'
    and row ->> 'expectation' = 'unchanged'
    and (row ->> 'local_id')::uuid = occurrence.id
  where occurrence.user_id = v_user_id
  order by occurrence.id
  for update of occurrence;

  perform status_event.id
  from public.occurrence_status_events as status_event
  join jsonb_array_elements(
    coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
  ) as row
    on row ->> 'record_type' = 'status_event'
    and row ->> 'expectation' = 'unchanged'
    and (row ->> 'local_id')::uuid = status_event.id
  where status_event.user_id = v_user_id
  order by status_event.id
  for update of status_event;

  perform note.id
  from public.imported_notes as note
  join jsonb_array_elements(
    coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
  ) as row
    on row ->> 'record_type' = 'note'
    and row ->> 'expectation' = 'unchanged'
    and (row ->> 'local_id')::uuid = note.id
  where note.user_id = v_user_id
  order by note.id
  for update of note;

  perform intervention.id
  from public.imported_interventions as intervention
  join jsonb_array_elements(
    coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
  ) as row
    on row ->> 'record_type' = 'intervention'
    and row ->> 'expectation' = 'unchanged'
    and (row ->> 'local_id')::uuid = intervention.id
  where intervention.user_id = v_user_id
  order by intervention.id
  for update of intervention;

  if exists (
    with precondition_rows as (
      select
        row ->> 'record_type' as record_type,
        (row ->> 'local_id')::uuid as local_id,
        row ->> 'expectation' as expectation,
        nullif(row ->> 'expected_updated_at', '')::timestamptz
          as expected_updated_at
      from jsonb_array_elements(
        coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
      ) as row
    ),
    current_rows as (
      select 'behavior'::text as record_type, id as local_id, user_id, updated_at
      from public.behaviors
      union all
      select 'schedule', id, user_id, updated_at
      from public.behavior_schedule_slots
      union all
      select 'occurrence', id, user_id, updated_at
      from public.occurrences
      union all
      select 'status_event', id, user_id, updated_at
      from public.occurrence_status_events
      union all
      select 'note', id, user_id, updated_at
      from public.imported_notes
      union all
      select 'intervention', id, user_id, updated_at
      from public.imported_interventions
    )
    select 1
    from precondition_rows
    left join current_rows using (record_type, local_id)
    where (
      precondition_rows.expectation = 'absent'
      and current_rows.local_id is not null
    )
      or (
        precondition_rows.expectation = 'unchanged'
        and (
          current_rows.local_id is null
          or current_rows.user_id is distinct from v_user_id
          or current_rows.updated_at is distinct from
            precondition_rows.expected_updated_at
        )
      )
  ) then
    raise exception 'Restore target changed after preview; preview the restore again';
  end if;

  if exists (
    with behavior_input as (
      select
        nullif(row ->> 'id', '')::uuid as behavior_id,
        row
      from jsonb_array_elements(
        coalesce(restore_payload -> 'behaviors', '[]'::jsonb)
      ) as row
    ),
    definition_event_input as (
      select
        nullif(row ->> 'behavior_id', '')::uuid as behavior_id,
        row
      from jsonb_array_elements(
        coalesce(
          restore_payload -> 'behavior_definition_events',
          '[]'::jsonb
        )
      ) as row
    )
    select 1
    from definition_event_input as event_input
    left join behavior_input using (behavior_id)
    left join public.behaviors as current_behavior
      on current_behavior.user_id = v_user_id
      and current_behavior.id = event_input.behavior_id
    where event_input.behavior_id is null
      or behavior_input.behavior_id is null
      or event_input.row ->> 'event_kind' is null
      or event_input.row ->> 'event_kind' not in ('baseline', 'transition')
      or event_input.row ->> 'source' is distinct from 'import'
      or event_input.row ->> 'reason' is distinct from 'behaviorlog_restore'
      or nullif(event_input.row ->> 'recorded_at', '') is null
      or jsonb_typeof(event_input.row -> 'changed_fields') is distinct from 'array'
      or event_input.row ->> 'next_title' is distinct from
        behavior_input.row ->> 'title'
      or event_input.row ->> 'next_description' is distinct from
        behavior_input.row ->> 'description'
      or (
        event_input.row ->> 'event_kind' = 'baseline'
        and (
          current_behavior.id is not null
          or event_input.row ->> 'previous_title' is not null
          or event_input.row ->> 'previous_description' is not null
          or event_input.row ->> 'expected_previous_title' is not null
          or event_input.row ->> 'expected_previous_description' is not null
        )
      )
      or (
        event_input.row ->> 'event_kind' = 'transition'
        and (
          current_behavior.id is null
          or current_behavior.title is distinct from
            event_input.row ->> 'expected_previous_title'
          or current_behavior.description is distinct from
            event_input.row ->> 'expected_previous_description'
          or event_input.row ->> 'previous_title' is null
        )
      )
  ) then
    raise exception 'Restore behavior definition history does not match the locked behavior transition';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(
        restore_payload -> 'behavior_definition_events',
        '[]'::jsonb
      )
    ) as row
    group by row ->> 'behavior_id'
    having count(*) > 1
  ) then
    raise exception 'Restore may write at most one definition event per behavior';
  end if;

  if exists (
    with behavior_input as (
      select nullif(row ->> 'id', '')::uuid as behavior_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'behaviors', '[]'::jsonb)
      ) as row
    ),
    baseline_input as (
      select nullif(row ->> 'behavior_id', '')::uuid as behavior_id
      from jsonb_array_elements(
        coalesce(
          restore_payload -> 'behavior_definition_events',
          '[]'::jsonb
        )
      ) as row
      where row ->> 'event_kind' = 'baseline'
    )
    select 1
    from behavior_input
    left join public.behaviors as current_behavior
      on current_behavior.user_id = v_user_id
      and current_behavior.id = behavior_input.behavior_id
    left join baseline_input using (behavior_id)
    where current_behavior.id is null
      and baseline_input.behavior_id is null
  ) then
    raise exception 'Every newly restored behavior requires an atomic definition baseline';
  end if;

  if exists (
    with behavior_input as (
      select
        nullif(row ->> 'id', '')::uuid as behavior_id,
        row
      from jsonb_array_elements(
        coalesce(restore_payload -> 'behaviors', '[]'::jsonb)
      ) as row
    ),
    transition_input as (
      select nullif(row ->> 'behavior_id', '')::uuid as behavior_id
      from jsonb_array_elements(
        coalesce(
          restore_payload -> 'behavior_definition_events',
          '[]'::jsonb
        )
      ) as row
      where row ->> 'event_kind' = 'transition'
    )
    select 1
    from behavior_input
    join public.behaviors as current_behavior
      on current_behavior.user_id = v_user_id
      and current_behavior.id = behavior_input.behavior_id
    left join transition_input using (behavior_id)
    where (
      current_behavior.title is distinct from behavior_input.row ->> 'title'
      or current_behavior.description is distinct from
        behavior_input.row ->> 'description'
    )
      and transition_input.behavior_id is null
  ) then
    raise exception 'Every restored definition change requires an atomic transition event';
  end if;

  if exists (
    with payload_records as (
      select
        'behavior'::text as record_type,
        nullif(btrim(row ->> 'external_id'), '') as external_id,
        nullif(row ->> 'id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'behaviors', '[]'::jsonb)
      ) as row
      union all
      select
        'schedule',
        nullif(btrim(row ->> 'external_id'), ''),
        nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'schedules', '[]'::jsonb)
      ) as row
      union all
      select
        'occurrence',
        nullif(btrim(row ->> 'external_id'), ''),
        nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'occurrences', '[]'::jsonb)
      ) as row
      union all
      select
        'status_event',
        nullif(btrim(row ->> 'external_id'), ''),
        nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'status_events', '[]'::jsonb)
      ) as row
      union all
      select
        'note',
        nullif(btrim(row ->> 'external_id'), ''),
        nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'imported_notes', '[]'::jsonb)
      ) as row
      union all
      select
        'intervention',
        nullif(btrim(row ->> 'external_id'), ''),
        nullif(row ->> 'id', '')::uuid
      from jsonb_array_elements(
        coalesce(restore_payload -> 'imported_interventions', '[]'::jsonb)
      ) as row
    ),
    mapping_input as (
      select
        row ->> 'record_type' as record_type,
        nullif(btrim(row ->> 'external_id'), '') as external_id,
        nullif(row ->> 'local_id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'mappings', '[]'::jsonb)
      ) as row
    )
    select 1
    from payload_records
    left join mapping_input using (record_type, external_id, local_id)
    where payload_records.external_id is null
      or payload_records.local_id is null
      or mapping_input.local_id is null
  ) then
    raise exception 'Every restored record requires matching provenance in the same transaction';
  end if;

  product_result := public.apply_behaviorlog_restore_product_writes(restore_payload);

  expected_definition_event_count := jsonb_array_length(
    coalesce(restore_payload -> 'behavior_definition_events', '[]'::jsonb)
  );

  insert into public.behavior_definition_events (
    user_id,
    behavior_id,
    previous_title,
    next_title,
    previous_description,
    next_description,
    changed_fields,
    recorded_at,
    source,
    reason
  )
  select
    v_user_id,
    (row ->> 'behavior_id')::uuid,
    row ->> 'previous_title',
    row ->> 'next_title',
    row ->> 'previous_description',
    row ->> 'next_description',
    array(
      select jsonb_array_elements_text(row -> 'changed_fields')
    ),
    (row ->> 'recorded_at')::timestamptz,
    row ->> 'source',
    row ->> 'reason'
  from jsonb_array_elements(
    coalesce(restore_payload -> 'behavior_definition_events', '[]'::jsonb)
  ) as row;
  get diagnostics definition_event_count = row_count;

  if definition_event_count <> expected_definition_event_count then
    raise exception 'Restore behavior definition events were not written completely';
  end if;

  product_result := jsonb_set(
    product_result,
    '{behavior_definition_events}',
    to_jsonb(definition_event_count),
    true
  );

  expected_mapping_count := jsonb_array_length(
    coalesce(restore_payload -> 'mappings', '[]'::jsonb)
  );

  if exists (
    with mapping_input as (
      select
        row ->> 'record_type' as record_type,
        nullif(btrim(row ->> 'external_id'), '') as external_id,
        nullif(row ->> 'local_id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'mappings', '[]'::jsonb)
      ) as row
    ),
    owned_targets as (
      select 'behavior'::text as record_type, id as local_id
      from public.behaviors
      where user_id = v_user_id
      union all
      select 'schedule', id
      from public.behavior_schedule_slots
      where user_id = v_user_id
      union all
      select 'occurrence', id
      from public.occurrences
      where user_id = v_user_id
      union all
      select 'status_event', id
      from public.occurrence_status_events
      where user_id = v_user_id
      union all
      select 'note', id
      from public.imported_notes
      where user_id = v_user_id
      union all
      select 'intervention', id
      from public.imported_interventions
      where user_id = v_user_id
    )
    select 1
    from mapping_input
    left join owned_targets using (record_type, local_id)
    where mapping_input.record_type not in (
      'behavior',
      'schedule',
      'occurrence',
      'status_event',
      'note',
      'intervention'
    )
      or mapping_input.external_id is null
      or mapping_input.local_id is null
      or owned_targets.local_id is null
  ) then
    raise exception 'Restore provenance mapping target is invalid or not user-owned';
  end if;

  insert into public.behaviorlog_import_record_mappings (
    user_id,
    import_run_id,
    record_type,
    external_id,
    local_id
  )
  select
    v_user_id,
    v_apply_run_id,
    row ->> 'record_type',
    btrim(row ->> 'external_id'),
    (row ->> 'local_id')::uuid
  from jsonb_array_elements(
    coalesce(restore_payload -> 'mappings', '[]'::jsonb)
  ) as row;
  get diagnostics mapping_count = row_count;

  if mapping_count <> expected_mapping_count then
    raise exception 'Restore provenance mappings were not written completely';
  end if;

  product_result := jsonb_set(
    product_result,
    '{provenance_mappings}',
    to_jsonb(mapping_count),
    true
  );
  applied_at := now();

  update public.behaviorlog_import_runs
  set
    status = 'applied',
    failure_message = null,
    completed_at = applied_at,
    dry_run_summary = jsonb_set(
      dry_run_summary,
      '{applyResult}',
      product_result,
      true
    )
  where user_id = v_user_id
    and id = v_apply_run_id
    and status = 'previewed';

  if not found then
    raise exception 'Restore apply ledger result could not be recorded atomically';
  end if;

  return product_result || jsonb_build_object(
    'applied_run_id', v_apply_run_id,
    'applied_run_started_at', apply_run.started_at,
    'applied_run_completed_at', applied_at,
    'already_applied', false
  );
end;
$$;

revoke all on function public.apply_behaviorlog_restore(jsonb) from public;
revoke all on function public.apply_behaviorlog_restore(jsonb) from anon;
revoke all on function public.apply_behaviorlog_restore(jsonb) from service_role;
grant execute on function public.apply_behaviorlog_restore(jsonb) to authenticated;
