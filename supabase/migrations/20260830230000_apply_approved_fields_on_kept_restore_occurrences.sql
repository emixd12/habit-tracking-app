-- Keep the Occurrence identity while applying separately accepted Note/status actions.
begin;

CREATE OR REPLACE FUNCTION public.apply_behaviorlog_restore(restore_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  apply_run_id uuid := nullif(restore_payload ->> 'apply_run_id', '')::uuid;
  v_accepted_preview_run_id uuid :=
    nullif(restore_payload ->> 'accepted_preview_run_id', '')::uuid;
  v_accepted_preview_fingerprint text :=
    nullif(restore_payload ->> 'accepted_preview_fingerprint', '');
  accepted_local_data_fingerprint text :=
    nullif(restore_payload ->> 'accepted_local_data_fingerprint', '');
  accepted_bundle_fingerprint text :=
    nullif(restore_payload ->> 'accepted_bundle_fingerprint', '');
  accepted_bundle_payload_fingerprint text :=
    nullif(restore_payload ->> 'accepted_bundle_payload_fingerprint', '');
  apply_payload_digest text :=
    nullif(restore_payload ->> 'apply_payload_digest', '');
  computed_apply_payload_digest text;
  accepted_preview_run public.behaviorlog_import_runs%rowtype;
  apply_run public.behaviorlog_import_runs%rowtype;
  existing_applied_run public.behaviorlog_import_runs%rowtype;
  prepared_payload jsonb := restore_payload;
  payload_key text;
  action_key text;
  prepared_behaviors jsonb := '[]'::jsonb;
  behavior_value jsonb;
  category_name text;
  category_id uuid;
  precondition_value jsonb;
  current_updated_at timestamptz;
  product_result jsonb;
  kept_occurrence_update_count integer := 0;
  definition_event_count integer := 0;
  time_session_count integer := 0;
  mapping_count integer := 0;
  applied_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'apply_behaviorlog_restore requires an authenticated user'
      using errcode = '42501';
  end if;

  if jsonb_typeof(restore_payload) is distinct from 'object'
    or apply_run_id is null
    or v_accepted_preview_run_id is null
    or v_accepted_preview_fingerprint is null
    or accepted_local_data_fingerprint is null
    or accepted_bundle_fingerprint is null
    or accepted_bundle_payload_fingerprint is null
    or apply_payload_digest is null
  then
    raise exception 'apply_behaviorlog_restore requires an exact accepted preview identity'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select preview_run.*
  into accepted_preview_run
  from public.behaviorlog_import_runs as preview_run
  where preview_run.user_id = current_user_id
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
      is distinct from accepted_local_data_fingerprint
    or accepted_preview_run.dry_run_summary ->> 'bundleFingerprint'
      is distinct from accepted_bundle_fingerprint
    or accepted_preview_run.bundle_fingerprint
      is distinct from accepted_bundle_fingerprint
    or accepted_preview_run.dry_run_summary ->> 'bundlePayloadFingerprint'
      is distinct from accepted_bundle_payload_fingerprint
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
    or accepted_preview_run.dry_run_summary #>
      '{statusHistoryPolicy,selected}'
      is distinct from '"preserve_append_only_history"'::jsonb
    or accepted_preview_run.dry_run_summary #>
      '{statusHistoryPolicy,applySupportedInThisTicket}'
      is distinct from 'true'::jsonb
  then
    raise exception 'Accepted restore preview is not safe to apply';
  end if;

  select candidate_run.*
  into apply_run
  from public.behaviorlog_import_runs as candidate_run
  where candidate_run.user_id = current_user_id
    and candidate_run.id = apply_run_id
    and candidate_run.import_mode = 'restore_apply'
    and candidate_run.accepted_preview_run_id = v_accepted_preview_run_id
    and candidate_run.accepted_preview_fingerprint = v_accepted_preview_fingerprint
  for update;

  if not found then
    raise exception 'Restore apply run was not found for the exact accepted preview';
  end if;

  computed_apply_payload_digest := encode(
    extensions.digest(
      convert_to((restore_payload - 'apply_payload_digest')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if apply_run.dry_run_summary ->> 'applyPayloadDigest'
      is distinct from apply_payload_digest
    or computed_apply_payload_digest is distinct from apply_payload_digest
  then
    raise exception 'Restore apply payload digest does not match its locked ledger';
  end if;

  select applied_run.*
  into existing_applied_run
  from public.behaviorlog_import_runs as applied_run
  where applied_run.user_id = current_user_id
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
      set status = 'cancelled', completed_at = now(), failure_message = null
      where user_id = current_user_id
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

  if jsonb_typeof(coalesce(restore_payload -> 'mappings', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(restore_payload -> 'preconditions', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(restore_payload -> 'behavior_definition_events', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(restore_payload -> 'time_sessions', '[]'::jsonb)) <> 'array'
  then
    raise exception 'Restore portability payload arrays are malformed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
    ) as row
    where row ->> 'record_type' not in (
      'behavior', 'schedule', 'occurrence', 'status_event',
      'behavior_definition_event', 'time_session', 'note', 'intervention'
    )
      or nullif(row ->> 'local_id', '') is null
      or row ->> 'expectation' not in ('absent', 'unchanged')
      or (
        row ->> 'expectation' = 'unchanged'
        and nullif(row ->> 'expected_updated_at', '') is null
      )
      or (
        row ->> 'expectation' = 'absent'
        and nullif(row ->> 'expected_updated_at', '') is not null
      )
  ) or exists (
    select 1
    from jsonb_array_elements(
      coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
    ) as row
    group by row ->> 'record_type', row ->> 'local_id'
    having count(*) > 1
  ) then
    raise exception 'Restore row precondition is malformed or duplicated';
  end if;

  for precondition_value in
    select value
    from jsonb_array_elements(
      coalesce(restore_payload -> 'preconditions', '[]'::jsonb)
    )
  loop
    current_updated_at := null;

    case precondition_value ->> 'record_type'
      when 'behavior' then
        select updated_at into current_updated_at from public.behaviors
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
      when 'schedule' then
        select updated_at into current_updated_at from public.behavior_schedule_slots
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
      when 'occurrence' then
        select updated_at into current_updated_at from public.occurrences
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
      when 'status_event' then
        select updated_at into current_updated_at from public.occurrence_status_events
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
      when 'behavior_definition_event' then
        select updated_at into current_updated_at from public.behavior_definition_events
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
      when 'time_session' then
        select updated_at into current_updated_at from public.occurrence_time_sessions
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
      when 'note' then
        select updated_at into current_updated_at from public.imported_notes
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
      when 'intervention' then
        select updated_at into current_updated_at from public.imported_interventions
        where user_id = current_user_id
          and id = (precondition_value ->> 'local_id')::uuid;
    end case;

    if precondition_value ->> 'expectation' = 'absent'
      and current_updated_at is not null
    then
      raise exception 'Restore row appeared after preview'
        using errcode = 'P0001';
    elsif precondition_value ->> 'expectation' = 'unchanged'
      and current_updated_at is distinct from
        (precondition_value ->> 'expected_updated_at')::timestamptz
    then
      raise exception 'Restore row changed after preview'
        using errcode = 'P0001';
    end if;
  end loop;

  if exists (
    with accepted_actions as (
      select 'behavior'::text as record_type, action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,behaviors}', '[]'::jsonb)
      ) action_row
      union all select 'schedule', action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,schedules}', '[]'::jsonb)
      ) action_row
      union all select 'occurrence', action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,occurrences}', '[]'::jsonb)
      ) action_row
      union all select 'status_event', action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,statusEvents}', '[]'::jsonb)
      ) action_row
      union all select 'behavior_definition_event', action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,definitionEvents}', '[]'::jsonb)
      ) action_row
      union all select 'time_session', action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,timeSessions}', '[]'::jsonb)
      ) action_row
      union all select 'note', action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,importedNotes}', '[]'::jsonb)
      ) action_row
      union all select 'intervention', action_row from jsonb_array_elements(
        coalesce(accepted_preview_run.dry_run_summary #> '{actions,importedInterventions}', '[]'::jsonb)
      ) action_row
    ), mapping_input as (
      select row ->> 'record_type' as record_type,
        nullif(btrim(row ->> 'external_id'), '') as external_id,
        nullif(row ->> 'local_id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'mappings', '[]'::jsonb)
      ) row
    )
    select 1
    from mapping_input
    left join accepted_actions
      on accepted_actions.record_type = mapping_input.record_type
      and accepted_actions.action_row ->> 'externalId' = mapping_input.external_id
    where accepted_actions.action_row is null
      or accepted_actions.action_row ->> 'action' not in ('create', 'replace', 'keep')
      or (
        accepted_actions.action_row ->> 'action' <> 'create'
        and nullif(accepted_actions.action_row ->> 'localId', '')::uuid
          is distinct from mapping_input.local_id
      )
  ) then
    raise exception 'Restore provenance mapping is outside the accepted preview actions';
  end if;

  -- Keep rows remain part of the accepted read graph and provenance mappings,
  -- but are never rewritten from a lossy portable representation.
  for payload_key, action_key in
    select * from (values
      ('behaviors', 'behaviors'), ('schedules', 'schedules'),
      ('occurrences', 'occurrences'), ('status_events', 'statusEvents'),
      ('behavior_definition_events', 'definitionEvents'),
      ('time_sessions', 'timeSessions'), ('imported_notes', 'importedNotes'),
      ('imported_interventions', 'importedInterventions')
    ) as keys(payload_key, action_key)
  loop
    prepared_payload := jsonb_set(prepared_payload, array[payload_key], coalesce((
      select jsonb_agg(input_row.value order by input_row.ordinality)
      from jsonb_array_elements(coalesce(restore_payload -> payload_key, '[]'::jsonb))
        with ordinality input_row(value, ordinality)
      where not exists (
        select 1 from jsonb_array_elements(coalesce(
          accepted_preview_run.dry_run_summary #> array['actions', action_key], '[]'::jsonb
        )) accepted_action
        where accepted_action ->> 'action' = 'keep'
          and accepted_action ->> 'localId' = input_row.value ->> 'id'
      )
    ), '[]'::jsonb), true);
  end loop;

  for behavior_value in
    select value
    from jsonb_array_elements(
      coalesce(prepared_payload -> 'behaviors', '[]'::jsonb)
    )
  loop
    category_name := nullif(btrim(behavior_value ->> 'category_name'), '');
    category_id := null;

    if category_name is not null then
      select category.id
      into category_id
      from public.categories as category
      where category.user_id = current_user_id
        and lower(regexp_replace(btrim(category.name), '\s+', ' ', 'g')) =
          lower(regexp_replace(category_name, '\s+', ' ', 'g'))
      order by category.sort_order, category.id
      limit 1;

      if category_id is null then
        insert into public.categories (user_id, name, sort_order)
        values (
          current_user_id,
          category_name,
          coalesce((select max(sort_order) + 1 from public.categories where user_id = current_user_id), 0)
        )
        returning id into category_id;
      end if;
    end if;

    prepared_behaviors := prepared_behaviors || jsonb_build_array(
      jsonb_set(
        behavior_value,
        '{category_id}',
        coalesce(to_jsonb(category_id::text), 'null'::jsonb),
        true
      )
    );
  end loop;

  prepared_payload := jsonb_set(
    prepared_payload,
    '{behaviors}',
    prepared_behaviors,
    true
  );

  product_result := public.apply_behaviorlog_restore_product_writes(
    prepared_payload
  );

  -- The schedule snapshot can be Keep while a Note or status-history action is
  -- separately approved. Apply only those fields; preserve the kept identity.
  with kept_occurrences as (
    select incoming,
      exists (
        select 1 from jsonb_array_elements(coalesce(
          accepted_preview_run.dry_run_summary #> '{actions,inlineOccurrenceNotes}', '[]'::jsonb
        )) action_row
        where action_row ->> 'localId' = incoming ->> 'id'
          and action_row ->> 'action' in ('create', 'replace')
      ) as changes_note,
      exists (
        select 1 from jsonb_array_elements(coalesce(prepared_payload -> 'status_events', '[]'::jsonb)) event_row
        where event_row ->> 'occurrence_id' = incoming ->> 'id'
      ) as changes_status
    from jsonb_array_elements(coalesce(restore_payload -> 'occurrences', '[]'::jsonb)) incoming
    where exists (
      select 1 from jsonb_array_elements(coalesce(
        accepted_preview_run.dry_run_summary #> '{actions,occurrences}', '[]'::jsonb
      )) action_row
      where action_row ->> 'localId' = incoming ->> 'id' and action_row ->> 'action' = 'keep'
    )
  )
  update public.occurrences as occurrence
  set note = case when kept.changes_note then kept.incoming ->> 'note' else occurrence.note end,
    status = case when kept.changes_status then kept.incoming ->> 'status' else occurrence.status end,
    completed_at = case when kept.changes_status then nullif(kept.incoming ->> 'completed_at', '')::timestamptz else occurrence.completed_at end,
    status_marked_at = case when kept.changes_status then nullif(kept.incoming ->> 'status_marked_at', '')::timestamptz else occurrence.status_marked_at end
  from kept_occurrences kept
  where occurrence.user_id = current_user_id and occurrence.id = (kept.incoming ->> 'id')::uuid
    and (kept.changes_note or kept.changes_status);
  get diagnostics kept_occurrence_update_count = row_count;
  product_result := jsonb_set(product_result, '{upserted_occurrences}', to_jsonb(
    coalesce((product_result ->> 'upserted_occurrences')::integer, 0) + kept_occurrence_update_count
  ), true);


  insert into public.behavior_definition_events (
    id, user_id, behavior_id, previous_title, next_title,
    previous_description, next_description, changed_fields,
    recorded_at, source, reason
  )
  select
    (row ->> 'id')::uuid,
    current_user_id,
    (row ->> 'behavior_id')::uuid,
    row ->> 'previous_title',
    row ->> 'next_title',
    row ->> 'previous_description',
    row ->> 'next_description',
    array(select jsonb_array_elements_text(row -> 'changed_fields')),
    (row ->> 'recorded_at')::timestamptz,
    'import',
    row ->> 'reason'
  from jsonb_array_elements(
    coalesce(prepared_payload -> 'behavior_definition_events', '[]'::jsonb)
  ) row
  order by (row ->> 'recorded_at')::timestamptz, row ->> 'id';
  get diagnostics definition_event_count = row_count;

  insert into public.occurrence_time_sessions (
    id, user_id, occurrence_id, behavior_id, started_at, stopped_at
  )
  select
    (row ->> 'id')::uuid,
    current_user_id,
    (row ->> 'occurrence_id')::uuid,
    (row ->> 'behavior_id')::uuid,
    (row ->> 'started_at')::timestamptz,
    nullif(row ->> 'stopped_at', '')::timestamptz
  from jsonb_array_elements(
    coalesce(prepared_payload -> 'time_sessions', '[]'::jsonb)
  ) row
  order by
    (nullif(row ->> 'stopped_at', '') is null),
    (row ->> 'started_at')::timestamptz,
    row ->> 'id'
  on conflict (id) do update
  set
    occurrence_id = excluded.occurrence_id,
    behavior_id = excluded.behavior_id,
    started_at = excluded.started_at,
    stopped_at = excluded.stopped_at
  where occurrence_time_sessions.user_id = current_user_id;
  get diagnostics time_session_count = row_count;

  if exists (
    with mapping_input as (
      select row ->> 'record_type' as record_type,
        nullif(btrim(row ->> 'external_id'), '') as external_id,
        nullif(row ->> 'local_id', '')::uuid as local_id
      from jsonb_array_elements(
        coalesce(restore_payload -> 'mappings', '[]'::jsonb)
      ) row
    ), owned_targets as (
      select 'behavior'::text record_type, id local_id from public.behaviors where user_id = current_user_id
      union all select 'schedule', id from public.behavior_schedule_slots where user_id = current_user_id
      union all select 'occurrence', id from public.occurrences where user_id = current_user_id
      union all select 'status_event', id from public.occurrence_status_events where user_id = current_user_id
      union all select 'behavior_definition_event', id from public.behavior_definition_events where user_id = current_user_id
      union all select 'time_session', id from public.occurrence_time_sessions where user_id = current_user_id
      union all select 'note', id from public.imported_notes where user_id = current_user_id
      union all select 'intervention', id from public.imported_interventions where user_id = current_user_id
    )
    select 1
    from mapping_input
    left join owned_targets using (record_type, local_id)
    where mapping_input.record_type not in (
      'behavior', 'schedule', 'occurrence', 'status_event',
      'behavior_definition_event', 'time_session', 'note', 'intervention'
    )
      or mapping_input.external_id is null
      or mapping_input.local_id is null
      or owned_targets.local_id is null
  ) then
    raise exception 'Restore provenance mapping target is invalid or not user-owned';
  end if;

  insert into public.behaviorlog_import_record_mappings (
    user_id, import_run_id, record_type, external_id, local_id
  )
  select
    current_user_id,
    apply_run_id,
    row ->> 'record_type',
    btrim(row ->> 'external_id'),
    (row ->> 'local_id')::uuid
  from jsonb_array_elements(
    coalesce(restore_payload -> 'mappings', '[]'::jsonb)
  ) row;
  get diagnostics mapping_count = row_count;

  product_result := product_result || jsonb_build_object(
    'behavior_definition_events', definition_event_count,
    'time_sessions', time_session_count,
    'provenance_mappings', mapping_count
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
  where user_id = current_user_id
    and id = apply_run_id
    and status = 'previewed';

  if not found then
    raise exception 'Restore apply ledger result could not be recorded atomically';
  end if;

  return product_result || jsonb_build_object(
    'applied_run_id', apply_run_id,
    'applied_run_started_at', apply_run.started_at,
    'applied_run_completed_at', applied_at,
    'already_applied', false
  );
end;
$function$;

commit;
