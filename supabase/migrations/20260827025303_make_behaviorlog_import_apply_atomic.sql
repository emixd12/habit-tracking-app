begin;

create unique index behaviorlog_import_runs_one_applied_import_per_preview_idx
  on public.behaviorlog_import_runs (user_id, accepted_preview_run_id)
  where import_mode in ('create_missing_only', 'merge_by_user_approved_plan')
    and status = 'applied'
    and accepted_preview_run_id is not null;

create or replace function cadence_private.behaviorlog_import_recurrence_rule(
  recurrence jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case recurrence ->> 'type'
    when 'daily' then jsonb_build_object(
      'frequency', 'daily',
      'interval', (recurrence ->> 'interval')::integer
    )
    when 'every_n_days' then jsonb_build_object(
      'frequency', 'interval_days',
      'intervalDays', (recurrence ->> 'interval')::integer
    )
    when 'weekly_on_weekdays' then jsonb_build_object(
      'frequency', 'weekly',
      'interval', 1,
      'daysOfWeek', recurrence -> 'weekdays'
    )
    when 'every_n_weeks_on_weekdays' then jsonb_build_object(
      'frequency', 'weekly',
      'interval', (recurrence ->> 'interval')::integer,
      'daysOfWeek', recurrence -> 'weekdays'
    )
    when 'monthly_on_day' then jsonb_build_object(
      'frequency', 'monthly',
      'interval', (recurrence ->> 'interval')::integer,
      'dayOfMonth', (recurrence ->> 'day')::integer
    )
    else null
  end;
$$;

create or replace function cadence_private.behaviorlog_import_action(
  preview jsonb,
  action_group text,
  external_id text
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select action
  from jsonb_array_elements(
    coalesce(preview #> array['mergePreview', 'actions', action_group], '[]'::jsonb)
  ) as action
  where action ->> 'externalId' = external_id
  limit 1;
$$;

create or replace function cadence_private.behaviorlog_import_schedule_shape(
  schedule jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when schedule ->> 'recurrenceProfile' <> 'behaviorlog.calendar_simple.v1'
      then null
    when cadence_private.behaviorlog_import_recurrence_rule(
      schedule -> 'recurrence'
    ) is null then null
    when nullif(schedule ->> 'windowStartLocal', '') is not null
      and nullif(schedule ->> 'windowEndLocal', '') is not null
      then jsonb_build_object(
        'recurrence_rule', cadence_private.behaviorlog_import_recurrence_rule(
          schedule -> 'recurrence'
        ),
        'kind', 'range',
        'preset', coalesce(
          nullif(schedule ->> 'cadenceSchedulePreset', ''),
          case concat(
            schedule ->> 'windowStartLocal',
            '/',
            schedule ->> 'windowEndLocal'
          )
            when '06:00/12:00' then 'morning'
            when '12:00/18:00' then 'afternoon'
            when '18:00/00:00' then 'evening'
            when '00:00/06:00' then 'night'
            else null
          end
        ),
        'start_time', schedule ->> 'windowStartLocal',
        'end_time', schedule ->> 'windowEndLocal'
      )
    when nullif(schedule ->> 'localTime', '') is not null
      then jsonb_build_object(
        'recurrence_rule', cadence_private.behaviorlog_import_recurrence_rule(
          schedule -> 'recurrence'
        ),
        'kind', 'exact',
        'preset', null,
        'start_time', schedule ->> 'localTime',
        'end_time', null
      )
    else null
  end;
$$;

create or replace function public.apply_behaviorlog_import(import_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  v_accepted_preview_run_id uuid :=
    nullif(import_payload ->> 'accepted_preview_run_id', '')::uuid;
  v_accepted_preview_fingerprint text :=
    import_payload ->> 'accepted_preview_fingerprint';
  v_import_mode text := import_payload ->> 'import_mode';
  v_completed_at timestamptz :=
    coalesce(nullif(import_payload ->> 'completed_at', '')::timestamptz, statement_timestamp());
  run_payload jsonb := import_payload -> 'run';
  preview jsonb := import_payload -> 'preview';
  accepted_run public.behaviorlog_import_runs;
  existing_run public.behaviorlog_import_runs;
  apply_run public.behaviorlog_import_runs;
  result jsonb := jsonb_build_object(
    'created', jsonb_build_object(
      'behaviors', 0, 'schedules', 0, 'occurrences', 0,
      'statusEvents', 0, 'notes', 0, 'interventions', 0, 'mappings', 0
    ),
    'mapped', jsonb_build_object(
      'behaviors', 0, 'schedules', 0, 'occurrences', 0,
      'statusEvents', 0, 'notes', 0, 'interventions', 0
    ),
    'skipped', jsonb_build_object(
      'behaviors', 0, 'schedules', 0, 'occurrences', 0,
      'statusEvents', 0, 'notes', 0, 'interventions', 0
    ),
    'warnings', coalesce(preview -> 'warnings', '[]'::jsonb)
  );
  behavior_ids jsonb := '{}'::jsonb;
  schedule_ids jsonb := '{}'::jsonb;
  occurrence_ids jsonb := '{}'::jsonb;
  status_event_ids jsonb := '{}'::jsonb;
  prior_configurations jsonb := '{}'::jsonb;
  row_value jsonb;
  action_value jsonb;
  schedule_value jsonb;
  behavior_value jsonb;
  event_value jsonb;
  note_value jsonb;
  intervention_value jsonb;
  local_id uuid;
  behavior_id uuid;
  schedule_id uuid;
  slot_id uuid;
  occurrence_id uuid;
  event_id uuid;
  category_id uuid;
  configuration_event_id uuid;
  previous_configuration jsonb;
  next_configuration jsonb;
  event_plan jsonb;
  schedule_sort_order integer;
  note_body text;
  target_local_id uuid;
  v_failure_message text;
  created_count integer;
  mapped_count integer;
  skipped_count integer;
  pair_value record;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if v_accepted_preview_run_id is null
    or v_accepted_preview_fingerprint !~ '^[a-f0-9]{64}$'
    or v_import_mode not in ('create_missing_only', 'merge_by_user_approved_plan')
    or jsonb_typeof(run_payload) <> 'object'
    or jsonb_typeof(preview) <> 'object'
  then
    raise exception 'BehaviorLog import apply payload is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_user_id::text || ':' || v_accepted_preview_run_id::text,
      0
    )
  );

  select *
  into accepted_run
  from public.behaviorlog_import_runs
  where user_id = current_user_id
    and id = v_accepted_preview_run_id
    and import_mode = 'merge_preview'
    and status = 'previewed'
    and dry_run_summary ->> 'previewFingerprint' = v_accepted_preview_fingerprint
  for update;

  if not found then
    raise exception 'Accepted BehaviorLog import preview was not found.'
      using errcode = '22023';
  end if;

  if preview ->> 'previewFingerprint' is distinct from v_accepted_preview_fingerprint
    or preview ->> 'bundleFingerprint' is distinct from
      accepted_run.dry_run_summary ->> 'bundleFingerprint'
    or preview ->> 'localDataFingerprint' is distinct from
      accepted_run.dry_run_summary ->> 'localDataFingerprint'
  then
    raise exception 'BehaviorLog import preview binding is stale.' using errcode = '22023';
  end if;

  select *
  into existing_run
  from public.behaviorlog_import_runs as candidate
  where candidate.user_id = current_user_id
    and candidate.accepted_preview_run_id = v_accepted_preview_run_id
    and candidate.import_mode in ('create_missing_only', 'merge_by_user_approved_plan')
    and candidate.status = 'applied'
  order by candidate.completed_at, candidate.id
  limit 1;

  if found then
    return (existing_run.dry_run_summary -> 'applyResult') || jsonb_build_object(
      'status', 'applied',
      'import_run', to_jsonb(existing_run)
    );
  end if;

  insert into public.behaviorlog_import_runs (
    user_id, bundle_format, schema_version, manifest_sha256,
    bundle_fingerprint, producer_name, producer_version,
    subject_id_strategy, privacy_redaction_level, import_mode,
    accepted_preview_run_id, accepted_preview_fingerprint,
    dry_run_summary, status, started_at, completed_at
  )
  values (
    current_user_id,
    run_payload ->> 'bundle_format',
    run_payload ->> 'schema_version',
    run_payload ->> 'manifest_sha256',
    run_payload ->> 'bundle_fingerprint',
    run_payload ->> 'producer_name',
    run_payload ->> 'producer_version',
    run_payload ->> 'subject_id_strategy',
    run_payload ->> 'privacy_redaction_level',
    v_import_mode,
    v_accepted_preview_run_id,
    v_accepted_preview_fingerprint,
    run_payload -> 'dry_run_summary',
    'previewed',
    v_completed_at,
    null
  )
  returning * into apply_run;

  begin
    if coalesce((preview ->> 'valid')::boolean, false) is not true
      or jsonb_array_length(coalesce(preview -> 'errors', '[]'::jsonb)) > 0
      or jsonb_array_length(
        coalesce(preview #> array['mergePreview', 'conflicts'], '[]'::jsonb)
      ) > 0
    then
      raise exception 'BehaviorLog import preview cannot be applied.' using errcode = '22023';
    end if;

    for row_value in
      select value from jsonb_array_elements(coalesce(preview #> array['plan', 'behaviors'], '[]'::jsonb))
    loop
      action_value := cadence_private.behaviorlog_import_action(
        preview, 'behaviors', row_value ->> 'externalId'
      );

      if v_import_mode = 'merge_by_user_approved_plan'
        and action_value ->> 'action' in ('map_to_existing', 'skip_existing')
      then
        local_id := nullif(action_value ->> 'localId', '')::uuid;
        if local_id is not null then
          if not exists (
            select 1 from public.behaviors
            where user_id = current_user_id and id = local_id
          ) then
            raise exception 'Mapped BehaviorLog behavior no longer exists.';
          end if;
          behavior_ids := jsonb_set(
            behavior_ids,
            array[row_value ->> 'externalId'],
            to_jsonb(local_id::text),
            true
          );
          insert into public.behaviorlog_import_record_mappings (
            user_id, import_run_id, record_type, external_id, local_id
          ) values (
            current_user_id, apply_run.id, 'behavior',
            row_value ->> 'externalId', local_id
          );
          result := jsonb_set(result, '{created,mappings}',
            to_jsonb((result #>> '{created,mappings}')::integer + 1));
          result := jsonb_set(result, '{mapped,behaviors}',
            to_jsonb((result #>> '{mapped,behaviors}')::integer + 1));
        else
          result := jsonb_set(result, '{skipped,behaviors}',
            to_jsonb((result #>> '{skipped,behaviors}')::integer + 1));
        end if;
        continue;
      end if;

      if row_value ->> 'action' <> 'create'
        or (
          v_import_mode = 'merge_by_user_approved_plan'
          and action_value ->> 'action' <> 'create_new'
        )
      then
        result := jsonb_set(result, '{skipped,behaviors}',
          to_jsonb((result #>> '{skipped,behaviors}')::integer + 1));
        continue;
      end if;

      select schedule
      into schedule_value
      from jsonb_array_elements(coalesce(preview #> array['plan', 'schedules'], '[]'::jsonb)) as schedule
      where schedule ->> 'behaviorExternalId' = row_value ->> 'externalId'
        and schedule ->> 'action' = 'create'
        and coalesce(schedule ->> 'cadenceImportRole', 'current_configuration')
          <> 'historical_reference_only'
        and cadence_private.behaviorlog_import_schedule_shape(schedule) is not null
      order by schedule ->> 'externalId'
      limit 1;

      if schedule_value is null then
        result := jsonb_set(result, '{skipped,behaviors}',
          to_jsonb((result #>> '{skipped,behaviors}')::integer + 1));
        continue;
      end if;

      schedule_value := cadence_private.behaviorlog_import_schedule_shape(schedule_value);
      select category.id
      into category_id
      from public.categories as category
      where category.user_id = current_user_id
        and lower(regexp_replace(btrim(category.name), '\s+', ' ', 'g')) in (
          lower(regexp_replace(btrim(coalesce(row_value ->> 'cadenceCategoryName', '')), '\s+', ' ', 'g')),
          lower(regexp_replace(btrim(coalesce(row_value ->> 'category', '')), '\s+', ' ', 'g'))
        )
      order by case
        when lower(regexp_replace(btrim(category.name), '\s+', ' ', 'g')) =
          lower(regexp_replace(btrim(coalesce(row_value ->> 'cadenceCategoryName', '')), '\s+', ' ', 'g'))
        then 0 else 1 end, category.id
      limit 1;

      behavior_id := gen_random_uuid();
      insert into public.behaviors (
        id, user_id, category_id, title, description, recurrence_rule,
        scheduled_time, timezone, browser_reminder_enabled,
        email_reminder_enabled, reminder_offset_minutes, active, archived_at,
        created_at, updated_at
      ) values (
        behavior_id, current_user_id, category_id,
        row_value ->> 'title', row_value ->> 'description',
        schedule_value -> 'recurrence_rule',
        (schedule_value ->> 'start_time')::time,
        (select schedule ->> 'timezone'
         from jsonb_array_elements(preview #> array['plan', 'schedules']) as schedule
         where schedule ->> 'behaviorExternalId' = row_value ->> 'externalId'
           and schedule ->> 'action' = 'create'
         order by schedule ->> 'externalId' limit 1),
        coalesce((row_value ->> 'cadenceBrowserReminderEnabled')::boolean, true),
        coalesce((row_value ->> 'cadenceEmailReminderEnabled')::boolean, false),
        coalesce((row_value ->> 'cadenceReminderOffsetMinutes')::integer, 0),
        case when nullif(row_value ->> 'archivedAtUtc', '') is not null
          then false else coalesce((row_value ->> 'cadenceActive')::boolean, true) end,
        nullif(row_value ->> 'archivedAtUtc', '')::timestamptz,
        coalesce(nullif(row_value ->> 'createdAtUtc', '')::timestamptz, v_completed_at),
        coalesce(nullif(row_value ->> 'createdAtUtc', '')::timestamptz, v_completed_at)
      );

      insert into public.behavior_definition_events (
        user_id, behavior_id, previous_title, next_title,
        previous_description, next_description, changed_fields,
        recorded_at, source, reason
      ) values (
        current_user_id, behavior_id, null, row_value ->> 'title',
        null, row_value ->> 'description',
        case when row_value ->> 'description' is null
          then array['title']::text[]
          else array['title', 'description']::text[] end,
        coalesce(nullif(row_value ->> 'createdAtUtc', '')::timestamptz, v_completed_at),
        'import', 'behaviorlog_import'
      );

      schedule_sort_order := 0;
      for event_value in
        select schedule
        from jsonb_array_elements(coalesce(preview #> array['plan', 'schedules'], '[]'::jsonb)) as schedule
        where schedule ->> 'behaviorExternalId' = row_value ->> 'externalId'
          and schedule ->> 'action' = 'create'
          and coalesce(schedule ->> 'cadenceImportRole', 'current_configuration')
            <> 'historical_reference_only'
          and cadence_private.behaviorlog_import_schedule_shape(schedule) is not null
        order by schedule ->> 'externalId'
      loop
        schedule_value := cadence_private.behaviorlog_import_schedule_shape(event_value);
        schedule_id := gen_random_uuid();
        slot_id := gen_random_uuid();
        insert into public.behavior_schedules (
          id, user_id, behavior_id, recurrence_rule, sort_order
        ) values (
          schedule_id, current_user_id, behavior_id,
          schedule_value -> 'recurrence_rule', schedule_sort_order
        );
        insert into public.behavior_schedule_slots (
          id, user_id, behavior_id, behavior_schedule_id, kind, preset,
          start_time, end_time, sort_order
        ) values (
          slot_id, current_user_id, behavior_id, schedule_id,
          schedule_value ->> 'kind', schedule_value ->> 'preset',
          (schedule_value ->> 'start_time')::time,
          nullif(schedule_value ->> 'end_time', '')::time, 0
        );
        schedule_ids := jsonb_set(
          schedule_ids, array[event_value ->> 'externalId'],
          to_jsonb(slot_id::text), true
        );
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (
          current_user_id, apply_run.id, 'schedule',
          event_value ->> 'externalId', slot_id
        );
        result := jsonb_set(result, '{created,schedules}',
          to_jsonb((result #>> '{created,schedules}')::integer + 1));
        result := jsonb_set(result, '{created,mappings}',
          to_jsonb((result #>> '{created,mappings}')::integer + 1));
        schedule_sort_order := schedule_sort_order + 1;
      end loop;

      next_configuration := cadence_private.current_behavior_configuration_snapshot(
        current_user_id, behavior_id
      );
      event_plan := jsonb_build_object(
        'event_kind', 'baseline',
        'previous_configuration', null,
        'next_configuration', next_configuration,
        'changed_fields', to_jsonb(cadence_private.behavior_configuration_changed_fields(null, next_configuration)),
        'recorded_at', v_completed_at,
        'effective_at', v_completed_at,
        'effective_local_date', (v_completed_at at time zone (next_configuration ->> 'timezone'))::date,
        'timezone', next_configuration ->> 'timezone',
        'source', 'import',
        'reason_code', 'behaviorlog_import'
      );
      configuration_event_id := cadence_private.insert_behavior_configuration_event(
        current_user_id, behavior_id, null, next_configuration, event_plan
      );

      behavior_ids := jsonb_set(
        behavior_ids, array[row_value ->> 'externalId'],
        to_jsonb(behavior_id::text), true
      );
      insert into public.behaviorlog_import_record_mappings (
        user_id, import_run_id, record_type, external_id, local_id
      ) values (
        current_user_id, apply_run.id, 'behavior',
        row_value ->> 'externalId', behavior_id
      );
      result := jsonb_set(result, '{created,behaviors}',
        to_jsonb((result #>> '{created,behaviors}')::integer + 1));
      result := jsonb_set(result, '{created,mappings}',
        to_jsonb((result #>> '{created,mappings}')::integer + 1));
    end loop;

    -- Merge-only schedules may append to an existing mapped Behavior.
    if v_import_mode = 'merge_by_user_approved_plan' then
      for row_value in
        select schedule
        from jsonb_array_elements(coalesce(preview #> array['plan', 'schedules'], '[]'::jsonb)) as schedule
        where cadence_private.behaviorlog_import_action(
          preview, 'schedules', schedule ->> 'externalId'
        ) ->> 'action' = 'create_new'
          and cadence_private.behaviorlog_import_schedule_shape(schedule) is not null
          and not (schedule_ids ? (schedule ->> 'externalId'))
        order by schedule ->> 'behaviorExternalId', schedule ->> 'externalId'
      loop
        behavior_id := nullif(behavior_ids ->> (row_value ->> 'behaviorExternalId'), '')::uuid;
        if behavior_id is null then
          raise exception 'Imported schedule parent Behavior is missing.';
        end if;
        if not (prior_configurations ? behavior_id::text) then
          previous_configuration := cadence_private.current_behavior_configuration_snapshot(
            current_user_id, behavior_id
          );
          prior_configurations := jsonb_set(
            prior_configurations, array[behavior_id::text], previous_configuration, true
          );
        end if;
        select coalesce(max(sort_order), -1) + 1
        into schedule_sort_order
        from public.behavior_schedules as stored_schedule
        where stored_schedule.user_id = current_user_id
          and stored_schedule.behavior_id = apply_behaviorlog_import.behavior_id;
        schedule_value := cadence_private.behaviorlog_import_schedule_shape(row_value);
        schedule_id := gen_random_uuid();
        slot_id := gen_random_uuid();
        insert into public.behavior_schedules (
          id, user_id, behavior_id, recurrence_rule, sort_order
        ) values (
          schedule_id, current_user_id, behavior_id,
          schedule_value -> 'recurrence_rule', schedule_sort_order
        );
        insert into public.behavior_schedule_slots (
          id, user_id, behavior_id, behavior_schedule_id, kind, preset,
          start_time, end_time, sort_order
        ) values (
          slot_id, current_user_id, behavior_id, schedule_id,
          schedule_value ->> 'kind', schedule_value ->> 'preset',
          (schedule_value ->> 'start_time')::time,
          nullif(schedule_value ->> 'end_time', '')::time, 0
        );
        schedule_ids := jsonb_set(
          schedule_ids, array[row_value ->> 'externalId'],
          to_jsonb(slot_id::text), true
        );
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (
          current_user_id, apply_run.id, 'schedule',
          row_value ->> 'externalId', slot_id
        );
        result := jsonb_set(result, '{created,schedules}',
          to_jsonb((result #>> '{created,schedules}')::integer + 1));
        result := jsonb_set(result, '{created,mappings}',
          to_jsonb((result #>> '{created,mappings}')::integer + 1));
      end loop;

      for pair_value in select key, value from jsonb_each(prior_configurations)
      loop
        behavior_id := pair_value.key::uuid;
        previous_configuration := pair_value.value;
        next_configuration := cadence_private.current_behavior_configuration_snapshot(
          current_user_id, behavior_id
        );
        event_plan := jsonb_build_object(
          'event_kind', 'revision',
          'previous_configuration', previous_configuration,
          'next_configuration', next_configuration,
          'changed_fields', to_jsonb(cadence_private.behavior_configuration_changed_fields(previous_configuration, next_configuration)),
          'recorded_at', v_completed_at,
          'effective_at', v_completed_at,
          'effective_local_date', (v_completed_at at time zone (next_configuration ->> 'timezone'))::date,
          'timezone', next_configuration ->> 'timezone',
          'source', 'import',
          'reason_code', 'behaviorlog_import'
        );
        perform cadence_private.insert_behavior_configuration_event(
          current_user_id, behavior_id, previous_configuration, next_configuration, event_plan
        );
      end loop;
    end if;

    -- Persist map/skip schedule actions that did not create a new slot.
    for row_value in
      select value from jsonb_array_elements(coalesce(preview #> array['plan', 'schedules'], '[]'::jsonb))
    loop
      if schedule_ids ? (row_value ->> 'externalId') then continue; end if;
      action_value := cadence_private.behaviorlog_import_action(
        preview, 'schedules', row_value ->> 'externalId'
      );
      local_id := nullif(action_value ->> 'localId', '')::uuid;
      if v_import_mode = 'merge_by_user_approved_plan' and local_id is not null then
        if not exists (
          select 1 from public.behavior_schedule_slots
          where user_id = current_user_id and id = local_id
        ) then raise exception 'Mapped BehaviorLog schedule no longer exists.'; end if;
        schedule_ids := jsonb_set(schedule_ids, array[row_value ->> 'externalId'], to_jsonb(local_id::text), true);
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (current_user_id, apply_run.id, 'schedule', row_value ->> 'externalId', local_id);
        result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
        result := jsonb_set(result, case when action_value ->> 'action' = 'map_to_existing' then '{mapped,schedules}' else '{skipped,schedules}' end,
          to_jsonb((result #>> (case when action_value ->> 'action' = 'map_to_existing' then '{mapped,schedules}' else '{skipped,schedules}' end))::integer + 1));
      else
        result := jsonb_set(result, '{skipped,schedules}', to_jsonb((result #>> '{skipped,schedules}')::integer + 1));
      end if;
    end loop;

    for row_value in
      select value from jsonb_array_elements(coalesce(preview #> array['plan', 'occurrences'], '[]'::jsonb))
    loop
      action_value := cadence_private.behaviorlog_import_action(preview, 'occurrences', row_value ->> 'externalId');
      local_id := case when v_import_mode = 'merge_by_user_approved_plan'
        then nullif(action_value ->> 'localId', '')::uuid else null end;
      if local_id is not null then
        if not exists (select 1 from public.occurrences where user_id = current_user_id and id = local_id)
          then raise exception 'Mapped BehaviorLog occurrence no longer exists.'; end if;
        occurrence_ids := jsonb_set(occurrence_ids, array[row_value ->> 'externalId'], to_jsonb(local_id::text), true);
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (current_user_id, apply_run.id, 'occurrence', row_value ->> 'externalId', local_id);
        result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
        result := jsonb_set(result, case when action_value ->> 'action' = 'map_to_existing' then '{mapped,occurrences}' else '{skipped,occurrences}' end,
          to_jsonb((result #>> (case when action_value ->> 'action' = 'map_to_existing' then '{mapped,occurrences}' else '{skipped,occurrences}' end))::integer + 1));
        continue;
      end if;
      if row_value ->> 'action' <> 'create'
        or (v_import_mode = 'merge_by_user_approved_plan' and action_value ->> 'action' <> 'create_new')
      then
        result := jsonb_set(result, '{skipped,occurrences}', to_jsonb((result #>> '{skipped,occurrences}')::integer + 1));
        continue;
      end if;
      behavior_id := nullif(behavior_ids ->> (row_value ->> 'behaviorExternalId'), '')::uuid;
      schedule_value := (select schedule from jsonb_array_elements(preview #> array['plan', 'schedules']) as schedule
        where schedule ->> 'externalId' = row_value ->> 'scheduleExternalId' limit 1);
      event_value := cadence_private.behaviorlog_import_schedule_shape(schedule_value);
      slot_id := case when coalesce((row_value ->> 'importWithDetachedScheduleSnapshot')::boolean, false)
        then null else nullif(schedule_ids ->> (row_value ->> 'scheduleExternalId'), '')::uuid end;
      if behavior_id is null or event_value is null
        or (not coalesce((row_value ->> 'importWithDetachedScheduleSnapshot')::boolean, false) and slot_id is null)
      then raise exception 'Imported occurrence parent is missing.'; end if;
      occurrence_id := gen_random_uuid();
      select current_configuration_event_id into configuration_event_id
      from public.behaviors where user_id = current_user_id and id = behavior_id;
      insert into public.occurrences (
        id, user_id, behavior_id, behavior_schedule_slot_id,
        behavior_configuration_event_id, scheduled_for, local_date,
        schedule_kind, schedule_preset, schedule_start_time, schedule_end_time,
        status, completed_at, status_marked_at, created_at, updated_at
      ) values (
        occurrence_id, current_user_id, behavior_id, slot_id,
        configuration_event_id, (row_value ->> 'scheduledForUtc')::timestamptz,
        (row_value ->> 'localDate')::date, event_value ->> 'kind',
        event_value ->> 'preset', (event_value ->> 'start_time')::time,
        nullif(event_value ->> 'end_time', '')::time,
        'unresolved', null, null,
        coalesce(nullif(row_value ->> 'generatedAtUtc', '')::timestamptz, v_completed_at),
        coalesce(nullif(row_value ->> 'generatedAtUtc', '')::timestamptz, v_completed_at)
      );
      occurrence_ids := jsonb_set(occurrence_ids, array[row_value ->> 'externalId'], to_jsonb(occurrence_id::text), true);
      insert into public.behaviorlog_import_record_mappings (
        user_id, import_run_id, record_type, external_id, local_id
      ) values (current_user_id, apply_run.id, 'occurrence', row_value ->> 'externalId', occurrence_id);
      result := jsonb_set(result, '{created,occurrences}', to_jsonb((result #>> '{created,occurrences}')::integer + 1));
      result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
    end loop;

    for row_value in
      select value from jsonb_array_elements(coalesce(preview #> array['plan', 'statusEvents'], '[]'::jsonb))
      order by (value ->> 'recordedAtUtc')::timestamptz, value ->> 'externalId'
    loop
      action_value := cadence_private.behaviorlog_import_action(preview, 'statusEvents', row_value ->> 'externalId');
      local_id := case when v_import_mode = 'merge_by_user_approved_plan'
        then nullif(action_value ->> 'localId', '')::uuid else null end;
      if local_id is not null then
        status_event_ids := jsonb_set(status_event_ids, array[row_value ->> 'externalId'], to_jsonb(local_id::text), true);
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (current_user_id, apply_run.id, 'status_event', row_value ->> 'externalId', local_id);
        result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
        result := jsonb_set(result, case when action_value ->> 'action' = 'map_to_existing' then '{mapped,statusEvents}' else '{skipped,statusEvents}' end,
          to_jsonb((result #>> (case when action_value ->> 'action' = 'map_to_existing' then '{mapped,statusEvents}' else '{skipped,statusEvents}' end))::integer + 1));
        continue;
      end if;
      if row_value ->> 'action' <> 'create'
        or (v_import_mode = 'merge_by_user_approved_plan' and action_value ->> 'action' <> 'create_new')
      then result := jsonb_set(result, '{skipped,statusEvents}', to_jsonb((result #>> '{skipped,statusEvents}')::integer + 1)); continue; end if;
      occurrence_id := nullif(occurrence_ids ->> (row_value ->> 'occurrenceExternalId'), '')::uuid;
      behavior_id := nullif(behavior_ids ->> (row_value ->> 'behaviorExternalId'), '')::uuid;
      if occurrence_id is null or behavior_id is null then raise exception 'Imported status event parent is missing.'; end if;
      event_id := gen_random_uuid();
      insert into public.occurrence_status_events (
        id, user_id, occurrence_id, behavior_id, previous_status, status,
        status_semantics, recorded_at, effective_at, local_date, timezone,
        source_capture_method, source_confidence, revises_event_id, reason_code
      ) values (
        event_id, current_user_id, occurrence_id, behavior_id,
        nullif(row_value ->> 'previousStatus', ''), row_value ->> 'status',
        row_value ->> 'statusSemantics', (row_value ->> 'recordedAtUtc')::timestamptz,
        nullif(row_value ->> 'effectiveAtUtc', '')::timestamptz,
        (row_value ->> 'localDate')::date, row_value ->> 'timezone',
        row_value ->> 'sourceCaptureMethod', row_value ->> 'sourceConfidence',
        nullif(status_event_ids ->> (row_value ->> 'revisesEventId'), '')::uuid,
        row_value ->> 'reasonCode'
      );
      status_event_ids := jsonb_set(status_event_ids, array[row_value ->> 'externalId'], to_jsonb(event_id::text), true);
      insert into public.behaviorlog_import_record_mappings (
        user_id, import_run_id, record_type, external_id, local_id
      ) values (current_user_id, apply_run.id, 'status_event', row_value ->> 'externalId', event_id);
      result := jsonb_set(result, '{created,statusEvents}', to_jsonb((result #>> '{created,statusEvents}')::integer + 1));
      result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
    end loop;

    -- Only the latest overall event may update the occurrence snapshot.
    for occurrence_id in
      select distinct event.occurrence_id
      from public.occurrence_status_events as event
      join public.behaviorlog_import_record_mappings as mapping
        on mapping.user_id = current_user_id
       and mapping.import_run_id = apply_run.id
       and mapping.record_type = 'status_event'
       and mapping.local_id = event.id
    loop
      select to_jsonb(event.*)
      into event_value
      from public.occurrence_status_events as event
      where event.user_id = current_user_id
        and event.occurrence_id = apply_behaviorlog_import.occurrence_id
      order by coalesce(event.effective_at, event.recorded_at) desc,
        event.recorded_at desc, event.id desc
      limit 1;
      if exists (
        select 1 from public.behaviorlog_import_record_mappings
        where user_id = current_user_id and import_run_id = apply_run.id
          and record_type = 'status_event' and local_id = (event_value ->> 'id')::uuid
      ) and not exists (
        select 1 from public.occurrence_status_events as local_event
        where local_event.user_id = current_user_id
          and local_event.occurrence_id = apply_behaviorlog_import.occurrence_id
          and local_event.id not in (
            select local_id from public.behaviorlog_import_record_mappings
            where user_id = current_user_id and import_run_id = apply_run.id
              and record_type = 'status_event'
          )
          and local_event.status_semantics in ('explicit_user_mark', 'explicit_user_correction')
          and local_event.source_confidence = 'high'
          and local_event.status <> event_value ->> 'status'
          and (
            event_value ->> 'status_semantics' = 'ambiguous_import'
            or event_value ->> 'source_confidence' in ('medium', 'low', 'ambiguous', 'unknown')
          )
      ) then
        update public.occurrences
        set status = event_value ->> 'status',
          completed_at = case when event_value ->> 'status' = 'completed'
            then coalesce((event_value ->> 'effective_at')::timestamptz, (event_value ->> 'recorded_at')::timestamptz)
            else null end,
          status_marked_at = (event_value ->> 'recorded_at')::timestamptz
        where user_id = current_user_id and id = occurrence_id;
      end if;
    end loop;

    for note_value in
      select value from jsonb_array_elements(coalesce(preview #> array['plan', 'notes'], '[]'::jsonb))
    loop
      action_value := cadence_private.behaviorlog_import_action(preview, 'notes', note_value ->> 'externalId');
      if note_value ->> 'action' = 'skip' or note_value ->> 'noteRole' = 'ai_generated'
        or (v_import_mode = 'merge_by_user_approved_plan' and action_value ->> 'action' = 'skip_existing')
      then result := jsonb_set(result, '{skipped,notes}', to_jsonb((result #>> '{skipped,notes}')::integer + 1)); continue; end if;
      if v_import_mode = 'merge_by_user_approved_plan' and action_value ->> 'action' = 'map_to_existing' then
        local_id := nullif(action_value ->> 'localId', '')::uuid;
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (current_user_id, apply_run.id, 'note', note_value ->> 'externalId', local_id);
        result := jsonb_set(result, '{mapped,notes}', to_jsonb((result #>> '{mapped,notes}')::integer + 1));
        result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
        continue;
      end if;
      note_body := nullif(btrim(replace(note_value ->> 'bodyMarkdown', E'\r\n', E'\n')), '');
      if note_body is null then result := jsonb_set(result, '{skipped,notes}', to_jsonb((result #>> '{skipped,notes}')::integer + 1)); continue; end if;
      target_local_id := case note_value ->> 'attachedToType'
        when 'behavior' then nullif(behavior_ids ->> (note_value ->> 'attachedToId'), '')::uuid
        when 'occurrence' then nullif(occurrence_ids ->> (note_value ->> 'attachedToId'), '')::uuid
        when 'status_event' then nullif(status_event_ids ->> (note_value ->> 'attachedToId'), '')::uuid
        else null end;
      if note_value ->> 'attachedToType' <> 'review' and target_local_id is null
        then raise exception 'Imported note target is missing.'; end if;
      select imported_note.id
      into local_id
      from public.imported_notes as imported_note
      where imported_note.user_id = current_user_id
        and imported_note.external_id = note_value ->> 'externalId'
        and imported_note.target_type = note_value ->> 'attachedToType'
        and imported_note.target_external_id = note_value ->> 'attachedToId'
      order by imported_note.created_at, imported_note.id
      limit 1;
      if found then
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (
          current_user_id, apply_run.id, 'note',
          note_value ->> 'externalId', local_id
        );
        result := jsonb_set(result, '{created,mappings}',
          to_jsonb((result #>> '{created,mappings}')::integer + 1));
        if v_import_mode = 'merge_by_user_approved_plan' then
          result := jsonb_set(result, '{mapped,notes}',
            to_jsonb((result #>> '{mapped,notes}')::integer + 1));
        else
          result := jsonb_set(result, '{skipped,notes}',
            to_jsonb((result #>> '{skipped,notes}')::integer + 1));
        end if;
        continue;
      end if;
      local_id := gen_random_uuid();
      insert into public.imported_notes (
        id, user_id, import_run_id, external_id, target_type,
        target_external_id, target_local_id, body_markdown, note_role,
        sensitivity, source_original_id, source_capture_method,
        source_confidence, imported_created_at, imported_updated_at, metadata
      ) values (
        local_id, current_user_id, apply_run.id, note_value ->> 'externalId',
        note_value ->> 'attachedToType', note_value ->> 'attachedToId', target_local_id,
        note_body, note_value ->> 'noteRole', note_value ->> 'sensitivity',
        note_value ->> 'sourceOriginalId', note_value ->> 'sourceCaptureMethod',
        note_value ->> 'sourceConfidence', (note_value ->> 'createdAtUtc')::timestamptz,
        nullif(note_value ->> 'updatedAtUtc', '')::timestamptz,
        jsonb_build_object(
          'noteDecision', action_value #>> '{metadata,noteDecision}',
          'attachment', jsonb_build_object('type', note_value ->> 'attachedToType', 'externalId', note_value ->> 'attachedToId', 'localId', target_local_id),
          'passiveImportedNote', true, 'analyticsStatusSideEffects', false
        )
      );
      insert into public.behaviorlog_import_record_mappings (
        user_id, import_run_id, record_type, external_id, local_id
      ) values (current_user_id, apply_run.id, 'note', note_value ->> 'externalId', local_id);
      if note_value ->> 'attachedToType' = 'occurrence'
        and action_value #>> '{metadata,noteDecision}' in ('fill_created_occurrence_note', 'fill_empty_occurrence_note')
      then update public.occurrences set note = note_body
        where user_id = current_user_id and id = target_local_id and coalesce(btrim(note), '') = ''; end if;
      result := jsonb_set(result, '{created,notes}', to_jsonb((result #>> '{created,notes}')::integer + 1));
      result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
    end loop;

    for intervention_value in
      select value from jsonb_array_elements(coalesce(preview #> array['plan', 'interventions'], '[]'::jsonb))
    loop
      action_value := cadence_private.behaviorlog_import_action(preview, 'interventions', intervention_value ->> 'externalId');
      if v_import_mode = 'merge_by_user_approved_plan' and action_value ->> 'action' in ('map_to_existing', 'skip_existing') then
        local_id := nullif(action_value ->> 'localId', '')::uuid;
        if local_id is not null then
          insert into public.behaviorlog_import_record_mappings (
            user_id, import_run_id, record_type, external_id, local_id
          ) values (current_user_id, apply_run.id, 'intervention', intervention_value ->> 'externalId', local_id);
          result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
        end if;
        result := jsonb_set(result, case when action_value ->> 'action' = 'map_to_existing' then '{mapped,interventions}' else '{skipped,interventions}' end,
          to_jsonb((result #>> (case when action_value ->> 'action' = 'map_to_existing' then '{mapped,interventions}' else '{skipped,interventions}' end))::integer + 1));
        continue;
      end if;
      if nullif(intervention_value ->> 'scheduledSendAtUtc', '') is null then
        result := jsonb_set(result, '{skipped,interventions}', to_jsonb((result #>> '{skipped,interventions}')::integer + 1)); continue;
      end if;
      local_id := gen_random_uuid();
      insert into public.imported_interventions (
        id, user_id, import_run_id, external_id, behavior_external_id,
        occurrence_external_id, behavior_id, occurrence_id, intervention_type,
        channel, delivery_status, scheduled_send_at, sent_at, failure_reason,
        source_original_id, source_capture_method, source_confidence,
        redacted_sensitivity_indicators, metadata
      ) values (
        local_id, current_user_id, apply_run.id, intervention_value ->> 'externalId',
        intervention_value ->> 'behaviorExternalId', intervention_value ->> 'occurrenceExternalId',
        nullif(behavior_ids ->> (intervention_value ->> 'behaviorExternalId'), '')::uuid,
        nullif(occurrence_ids ->> (intervention_value ->> 'occurrenceExternalId'), '')::uuid,
        intervention_value ->> 'interventionType', intervention_value ->> 'channel',
        intervention_value ->> 'deliveryStatus', (intervention_value ->> 'scheduledSendAtUtc')::timestamptz,
        nullif(intervention_value ->> 'sentAtUtc', '')::timestamptz,
        intervention_value ->> 'failureReason', intervention_value ->> 'sourceOriginalId',
        intervention_value ->> 'sourceCaptureMethod', intervention_value ->> 'sourceConfidence',
        jsonb_build_object(
          'droppedSensitiveFields', coalesce(intervention_value #> '{storageDecision,droppedSensitiveFields}', '[]'::jsonb),
          'redactedFields', coalesce(intervention_value #> '{storageDecision,redactedFields}', '[]'::jsonb),
          'containsSensitiveDeliveryPayload',
            jsonb_array_length(coalesce(intervention_value #> '{storageDecision,droppedSensitiveFields}', '[]'::jsonb)) > 0
            or jsonb_array_length(coalesce(intervention_value #> '{storageDecision,redactedFields}', '[]'::jsonb)) > 0,
          'rawMessageBodyStored', false, 'rawEndpointStored', false, 'recipientIdentifiersStored', false
        ),
        jsonb_build_object(
          'interventionDecision', action_value #>> '{metadata,interventionDecision}',
          'storageDecision', intervention_value -> 'storageDecision',
          'passiveImportedIntervention', true,
          'reminderDeliverySideEffects', false, 'providerSideEffects', false
        )
      );
      insert into public.behaviorlog_import_record_mappings (
        user_id, import_run_id, record_type, external_id, local_id
      ) values (current_user_id, apply_run.id, 'intervention', intervention_value ->> 'externalId', local_id);
      result := jsonb_set(result, '{created,interventions}', to_jsonb((result #>> '{created,interventions}')::integer + 1));
      result := jsonb_set(result, '{created,mappings}', to_jsonb((result #>> '{created,mappings}')::integer + 1));
    end loop;

    insert into public.occurrence_sync_state (user_id, timezone, stale, stale_reason)
    values (
      current_user_id,
      coalesce((select timezone from public.profiles where id = current_user_id), 'America/New_York'),
      true,
      'behaviorlog_import_applied'
    )
    on conflict (user_id) do update set
      stale = true,
      stale_reason = 'behaviorlog_import_applied',
      state_version = public.occurrence_sync_state.state_version + 1;

  exception when others then
    get stacked diagnostics v_failure_message = message_text;
    update public.behaviorlog_import_runs
    set status = 'failed',
      failure_message = v_failure_message,
      completed_at = v_completed_at
    where user_id = current_user_id and id = apply_run.id
    returning * into apply_run;
    return jsonb_build_object(
      'status', 'failed',
      'failure_message', v_failure_message,
      'import_run', to_jsonb(apply_run)
    );
  end;

  result := result || jsonb_build_object('status', 'applied');
  update public.behaviorlog_import_runs
  set status = 'applied', failure_message = null,
    completed_at = v_completed_at,
    dry_run_summary = dry_run_summary || jsonb_build_object('applyResult', result)
  where user_id = current_user_id and id = apply_run.id
  returning * into apply_run;

  return result || jsonb_build_object('import_run', to_jsonb(apply_run));
end;
$$;

revoke all on function public.apply_behaviorlog_import(jsonb) from public;
grant execute on function public.apply_behaviorlog_import(jsonb) to authenticated;

commit;
