begin;

do $migration$
declare
  function_definition text;
  corrected_definition text;
begin
  function_definition := pg_get_functiondef(
    'cadence_private.apply_behaviorlog_import(jsonb)'::regprocedure
  );
  corrected_definition := replace(
    function_definition,
    'apply_behaviorlog_import.behavior_id',
    '(behavior_ids ->> (row_value ->> ''behaviorExternalId''))::uuid'
  );
  corrected_definition := replace(
    corrected_definition,
    'end))::integer + 1))',
    'end)::text[])::integer + 1))'
  );
  corrected_definition := replace(
    corrected_definition,
    'jsonb_set(result, case when action_value',
    'jsonb_set(result, (case when action_value'
  );
  corrected_definition := replace(
    corrected_definition,
    '''{skipped,schedules}'' end,',
    '''{skipped,schedules}'' end)::text[],'
  );
  corrected_definition := replace(
    corrected_definition,
    '''{skipped,occurrences}'' end,',
    '''{skipped,occurrences}'' end)::text[],'
  );
  corrected_definition := replace(
    corrected_definition,
    '''{skipped,statusEvents}'' end,',
    '''{skipped,statusEvents}'' end)::text[],'
  );
  corrected_definition := replace(
    corrected_definition,
    '''{skipped,interventions}'' end,',
    '''{skipped,interventions}'' end)::text[],'
  );
  corrected_definition := replace(
    corrected_definition,
    '  occurrence_id uuid;',
    E'  occurrence_id uuid;\n  v_snapshot_occurrence_id uuid;'
  );
  corrected_definition := replace(
    corrected_definition,
    E'for occurrence_id in\n      select distinct event.occurrence_id',
    E'for v_snapshot_occurrence_id in\n      select distinct event.occurrence_id'
  );
  corrected_definition := replace(
    corrected_definition,
    'apply_behaviorlog_import.occurrence_id',
    'v_snapshot_occurrence_id'
  );
  corrected_definition := replace(
    corrected_definition,
    'where user_id = current_user_id and id = occurrence_id;',
    'where user_id = current_user_id and id = v_snapshot_occurrence_id;'
  );
  corrected_definition := replace(
    corrected_definition,
    E'select 1 from public.behaviorlog_import_record_mappings\n        where user_id = current_user_id and import_run_id = apply_run.id\n          and record_type = ''status_event'' and local_id =',
    E'select 1 from public.behaviorlog_import_record_mappings as imported_mapping\n        where imported_mapping.user_id = current_user_id\n          and imported_mapping.import_run_id = apply_run.id\n          and imported_mapping.record_type = ''status_event''\n          and imported_mapping.local_id ='
  );
  corrected_definition := replace(
    corrected_definition,
    E'select local_id from public.behaviorlog_import_record_mappings\n            where user_id = current_user_id and import_run_id = apply_run.id\n              and record_type = ''status_event''',
    E'select imported_mapping.local_id\n            from public.behaviorlog_import_record_mappings as imported_mapping\n            where imported_mapping.user_id = current_user_id\n              and imported_mapping.import_run_id = apply_run.id\n              and imported_mapping.record_type = ''status_event'''
  );
  if corrected_definition = function_definition then
    raise exception 'Expected import schedule-owner reference was not found';
  end if;
  execute corrected_definition;

  function_definition := pg_get_functiondef(
    'public.apply_behaviorlog_import(jsonb)'::regprocedure
  );
  corrected_definition := replace(
    function_definition,
    E',\n        updated_at = statement_timestamp()',
    ''
  );
  if corrected_definition = function_definition then
    raise exception 'Expected configuration-event updated_at assignment was not found';
  end if;
  execute corrected_definition;

  function_definition := pg_get_functiondef(
    'public.apply_behaviorlog_restore(jsonb)'::regprocedure
  );
  corrected_definition := replace(
    function_definition,
    '  accepted_preview_run_id uuid :=',
    '  v_accepted_preview_run_id uuid :='
  );
  corrected_definition := replace(
    corrected_definition,
    'or accepted_preview_run_id is null',
    'or v_accepted_preview_run_id is null'
  );
  corrected_definition := replace(
    corrected_definition,
    'preview_run.id = accepted_preview_run_id',
    'preview_run.id = v_accepted_preview_run_id'
  );
  corrected_definition := replace(
    corrected_definition,
    'candidate_run.accepted_preview_run_id = accepted_preview_run_id',
    'candidate_run.accepted_preview_run_id = v_accepted_preview_run_id'
  );
  corrected_definition := replace(
    corrected_definition,
    'applied_run.accepted_preview_run_id = accepted_preview_run_id',
    'applied_run.accepted_preview_run_id = v_accepted_preview_run_id'
  );
  corrected_definition := replace(
    corrected_definition,
    '  accepted_preview_fingerprint text :=',
    '  v_accepted_preview_fingerprint text :='
  );
  corrected_definition := replace(
    corrected_definition,
    'or accepted_preview_fingerprint is null',
    'or v_accepted_preview_fingerprint is null'
  );
  corrected_definition := replace(
    corrected_definition,
    'is distinct from accepted_preview_fingerprint',
    'is distinct from v_accepted_preview_fingerprint'
  );
  corrected_definition := replace(
    corrected_definition,
    'candidate_run.accepted_preview_fingerprint = accepted_preview_fingerprint',
    'candidate_run.accepted_preview_fingerprint = v_accepted_preview_fingerprint'
  );
  corrected_definition := replace(
    corrected_definition,
    'applied_run.accepted_preview_fingerprint = accepted_preview_fingerprint',
    'applied_run.accepted_preview_fingerprint = v_accepted_preview_fingerprint'
  );
  if corrected_definition = function_definition then
    raise exception 'Expected restore preview variables were not found';
  end if;
  execute corrected_definition;
end;
$migration$;

commit;
