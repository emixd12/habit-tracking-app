begin;

alter table public.behaviorlog_import_record_mappings
  drop constraint if exists behaviorlog_import_record_mappings_record_type_check;

alter table public.behaviorlog_import_record_mappings
  add constraint behaviorlog_import_record_mappings_record_type_check
  check (
    record_type in (
      'behavior',
      'schedule',
      'occurrence',
      'status_event',
      'behavior_definition_event',
      'time_session',
      'note',
      'intervention'
    )
  );

-- Preserve Ticket 084's transactional implementation as the core writer.
-- The public wrapper enriches its accepted preview before the core call and
-- appends portable history inside the same database transaction afterward.
alter function public.apply_behaviorlog_import(jsonb)
  set schema cadence_private;

revoke all on function cadence_private.apply_behaviorlog_import(jsonb)
  from public, anon, authenticated, service_role;

create function public.apply_behaviorlog_import(import_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  adjusted_payload jsonb := import_payload;
  preview jsonb;
  core_result jsonb;
  result jsonb;
  apply_run_id uuid;
  import_mode text := import_payload ->> 'import_mode';
  rules_present boolean := coalesce(
    (import_payload ->> 'intervention_rules_present')::boolean,
    false
  );
  behavior_pair record;
  group_pair record;
  schedule_row record;
  row_value jsonb;
  action_value jsonb;
  local_behavior_id uuid;
  local_occurrence_id uuid;
  local_event_id uuid;
  local_session_id uuid;
  target_parent_id uuid;
  source_parent_id uuid;
  current_configuration_event_id uuid;
  configuration_snapshot jsonb;
  slot_order integer;
  parent_order integer;
  has_imported_baseline boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if rules_present then
    select jsonb_set(
      adjusted_payload,
      '{preview,plan,behaviors}',
      coalesce(
        jsonb_agg(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                behavior.value,
                '{cadenceBrowserReminderEnabled}',
                to_jsonb(
                  exists (
                    select 1
                    from jsonb_array_elements(
                      coalesce(
                        adjusted_payload #> '{preview,plan,interventionRules}',
                        '[]'::jsonb
                      )
                    ) as rule
                    where rule ->> 'behaviorExternalId' =
                        behavior.value ->> 'externalId'
                      and rule ->> 'action' = 'create'
                      and coalesce((rule ->> 'enabled')::boolean, false)
                      and rule ->> 'interventionType' = 'reminder'
                      and rule ->> 'channel' = 'browser_push'
                  )
                ),
                true
              ),
              '{cadenceEmailReminderEnabled}',
              to_jsonb(
                exists (
                  select 1
                  from jsonb_array_elements(
                    coalesce(
                      adjusted_payload #> '{preview,plan,interventionRules}',
                      '[]'::jsonb
                    )
                  ) as rule
                  where rule ->> 'behaviorExternalId' =
                      behavior.value ->> 'externalId'
                    and rule ->> 'action' = 'create'
                    and coalesce((rule ->> 'enabled')::boolean, false)
                    and rule ->> 'interventionType' = 'reminder'
                    and rule ->> 'channel' = 'email'
                )
              ),
              true
            ),
            '{cadenceReminderOffsetMinutes}',
            to_jsonb(
              coalesce(
                (
                  select greatest(0, -(rule ->> 'offsetMinutes')::integer)
                  from jsonb_array_elements(
                    coalesce(
                      adjusted_payload #> '{preview,plan,interventionRules}',
                      '[]'::jsonb
                    )
                  ) as rule
                  where rule ->> 'behaviorExternalId' =
                      behavior.value ->> 'externalId'
                    and rule ->> 'action' = 'create'
                    and coalesce((rule ->> 'enabled')::boolean, false)
                    and rule ->> 'interventionType' = 'reminder'
                    and rule ->> 'channel' in ('browser_push', 'email')
                    and rule ->> 'offsetMinutes' is not null
                  order by rule ->> 'externalId'
                  limit 1
                ),
                0
              )
            ),
            true
          )
          order by behavior.ordinality
        ),
        '[]'::jsonb
      ),
      true
    )
    into adjusted_payload
    from jsonb_array_elements(
      coalesce(adjusted_payload #> '{preview,plan,behaviors}', '[]'::jsonb)
    ) with ordinality as behavior(value, ordinality);
  end if;

  core_result := cadence_private.apply_behaviorlog_import(adjusted_payload);

  if core_result ->> 'status' is distinct from 'applied' then
    return core_result;
  end if;

  -- Ticket 084 returns the stored enriched result for a repeated accepted
  -- preview. Do not replay the portability rows a second time.
  if core_result #> '{created,definitionEvents}' is not null
    and core_result #> '{created,timeSessions}' is not null
  then
    return core_result;
  end if;

  result := core_result;
  preview := adjusted_payload -> 'preview';
  apply_run_id := nullif(core_result #>> '{import_run,id}', '')::uuid;

  result := jsonb_set(
    result,
    '{created,definitionEvents}',
    '0'::jsonb,
    true
  );
  result := jsonb_set(result, '{created,timeSessions}', '0'::jsonb, true);
  result := jsonb_set(result, '{mapped,definitionEvents}', '0'::jsonb, true);
  result := jsonb_set(result, '{mapped,timeSessions}', '0'::jsonb, true);
  result := jsonb_set(result, '{skipped,definitionEvents}', '0'::jsonb, true);
  result := jsonb_set(result, '{skipped,timeSessions}', '0'::jsonb, true);

  -- Ticket 077: collapse exported slots that share one Cadence schedule parent.
  for behavior_pair in
    select mapping.external_id, mapping.local_id
    from public.behaviorlog_import_record_mappings as mapping
    where mapping.user_id = current_user_id
      and mapping.import_run_id = apply_run_id
      and mapping.record_type = 'behavior'
      and (
        import_mode = 'create_missing_only'
        or cadence_private.behaviorlog_import_action(
          preview,
          'behaviors',
          mapping.external_id
        ) ->> 'action' = 'create_new'
      )
    order by mapping.external_id
  loop
    local_behavior_id := behavior_pair.local_id;
    parent_order := 0;

    for group_pair in
      select
        coalesce(
          schedule ->> 'cadenceBehaviorScheduleId',
          schedule ->> 'externalId'
        ) as parent_key,
        min(schedule ->> 'externalId') as first_external_id
      from jsonb_array_elements(
        coalesce(preview #> '{plan,schedules}', '[]'::jsonb)
      ) as schedule
      where schedule ->> 'behaviorExternalId' = behavior_pair.external_id
        and schedule ->> 'action' = 'create'
        and coalesce(
          schedule ->> 'cadenceImportRole',
          'current_configuration'
        ) <> 'historical_reference_only'
      group by coalesce(
        schedule ->> 'cadenceBehaviorScheduleId',
        schedule ->> 'externalId'
      )
      having count(
        distinct cadence_private.behaviorlog_import_schedule_shape(schedule)
          -> 'recurrence_rule'
      ) = 1
        and count(*) = count(
          distinct coalesce(
            schedule ->> 'localTime',
            schedule ->> 'windowStartLocal'
          )
        )
      order by min(schedule ->> 'externalId')
    loop
      select slot.behavior_schedule_id
      into target_parent_id
      from public.behaviorlog_import_record_mappings as mapping
      join public.behavior_schedule_slots as slot
        on slot.user_id = mapping.user_id
       and slot.id = mapping.local_id
      where mapping.user_id = current_user_id
        and mapping.import_run_id = apply_run_id
        and mapping.record_type = 'schedule'
        and mapping.external_id = group_pair.first_external_id;

      if target_parent_id is null then
        continue;
      end if;

      update public.behavior_schedules
      set sort_order = parent_order,
        updated_at = statement_timestamp()
      where user_id = current_user_id
        and id = target_parent_id
        and behavior_id = local_behavior_id;

      slot_order := 0;
      for schedule_row in
        select schedule ->> 'externalId' as external_id
        from jsonb_array_elements(
          coalesce(preview #> '{plan,schedules}', '[]'::jsonb)
        ) as schedule
        where schedule ->> 'behaviorExternalId' = behavior_pair.external_id
          and schedule ->> 'action' = 'create'
          and coalesce(
            schedule ->> 'cadenceBehaviorScheduleId',
            schedule ->> 'externalId'
          ) = group_pair.parent_key
        order by schedule ->> 'externalId'
      loop
        select slot.behavior_schedule_id
        into source_parent_id
        from public.behaviorlog_import_record_mappings as mapping
        join public.behavior_schedule_slots as slot
          on slot.user_id = mapping.user_id
         and slot.id = mapping.local_id
        where mapping.user_id = current_user_id
          and mapping.import_run_id = apply_run_id
          and mapping.record_type = 'schedule'
          and mapping.external_id = schedule_row.external_id;

        update public.behavior_schedule_slots as slot
        set behavior_schedule_id = target_parent_id,
          sort_order = slot_order,
          updated_at = statement_timestamp()
        from public.behaviorlog_import_record_mappings as mapping
        where mapping.user_id = current_user_id
          and mapping.import_run_id = apply_run_id
          and mapping.record_type = 'schedule'
          and mapping.external_id = schedule_row.external_id
          and slot.user_id = mapping.user_id
          and slot.id = mapping.local_id
          and slot.behavior_id = local_behavior_id;

        if source_parent_id is distinct from target_parent_id then
          delete from public.behavior_schedules as parent
          where parent.user_id = current_user_id
            and parent.id = source_parent_id
            and parent.behavior_id = local_behavior_id
            and not exists (
              select 1
              from public.behavior_schedule_slots as remaining_slot
              where remaining_slot.user_id = current_user_id
                and remaining_slot.behavior_schedule_id = parent.id
            );
        end if;

        slot_order := slot_order + 1;
      end loop;

      parent_order := parent_order + 1;
    end loop;

    select behavior.current_configuration_event_id
    into current_configuration_event_id
    from public.behaviors as behavior
    where behavior.user_id = current_user_id
      and behavior.id = local_behavior_id;

    if current_configuration_event_id is not null then
      configuration_snapshot :=
        cadence_private.current_behavior_configuration_snapshot(
          current_user_id,
          local_behavior_id
        );
      update public.behavior_configuration_events as configuration_event
      set next_configuration = configuration_snapshot,
        changed_fields = cadence_private.behavior_configuration_changed_fields(
          null,
          configuration_snapshot
        ),
        updated_at = statement_timestamp()
      where configuration_event.user_id = current_user_id
        and configuration_event.id = current_configuration_event_id
        and configuration_event.previous_configuration is null;
    end if;
  end loop;

  -- Ticket 074: replace the synthetic baseline only when a portable baseline
  -- exists for a Behavior that this apply created.
  for behavior_pair in
    select mapping.external_id, mapping.local_id
    from public.behaviorlog_import_record_mappings as mapping
    where mapping.user_id = current_user_id
      and mapping.import_run_id = apply_run_id
      and mapping.record_type = 'behavior'
      and (
        import_mode = 'create_missing_only'
        or cadence_private.behaviorlog_import_action(
          preview,
          'behaviors',
          mapping.external_id
        ) ->> 'action' = 'create_new'
      )
    order by mapping.external_id
  loop
    local_behavior_id := behavior_pair.local_id;
    select exists (
      select 1
      from jsonb_array_elements(
        coalesce(preview #> '{plan,definitionEvents}', '[]'::jsonb)
      ) as event
      where event ->> 'behaviorExternalId' = behavior_pair.external_id
        and event ->> 'eventKind' = 'baseline'
        and event ->> 'action' = 'create'
        and event ->> 'nextTitle' is not null
    ) into has_imported_baseline;

    if not has_imported_baseline then
      continue;
    end if;

    delete from public.behavior_definition_events
    where user_id = current_user_id
      and behavior_id = local_behavior_id
      and source = 'import'
      and reason = 'behaviorlog_import';

    for row_value in
      select event
      from jsonb_array_elements(
        coalesce(preview #> '{plan,definitionEvents}', '[]'::jsonb)
      ) as event
      where event ->> 'behaviorExternalId' = behavior_pair.external_id
        and event ->> 'action' = 'create'
        and event ->> 'nextTitle' is not null
        and (
          event ->> 'previousTitle' is distinct from event ->> 'nextTitle'
          or event ->> 'previousDescription' is distinct from
            event ->> 'nextDescription'
        )
      order by (event ->> 'recordedAtUtc')::timestamptz,
        event ->> 'externalId'
    loop
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
      ) values (
        current_user_id,
        local_behavior_id,
        row_value ->> 'previousTitle',
        row_value ->> 'nextTitle',
        row_value ->> 'previousDescription',
        row_value ->> 'nextDescription',
        array_remove(
          array[
            case
              when row_value ->> 'previousTitle' is distinct from
                  row_value ->> 'nextTitle'
              then 'title'
              else null
            end,
            case
              when row_value ->> 'previousDescription' is distinct from
                  row_value ->> 'nextDescription'
              then 'description'
              else null
            end
          ]::text[],
          null
        ),
        (row_value ->> 'recordedAtUtc')::timestamptz,
        'import',
        row_value ->> 'reasonCode'
      )
      returning id into local_event_id;

      insert into public.behaviorlog_import_record_mappings (
        user_id,
        import_run_id,
        record_type,
        external_id,
        local_id
      ) values (
        current_user_id,
        apply_run_id,
        'behavior_definition_event',
        row_value ->> 'externalId',
        local_event_id
      );

      result := jsonb_set(
        result,
        '{created,definitionEvents}',
        to_jsonb(
          coalesce((result #>> '{created,definitionEvents}')::integer, 0) + 1
        ),
        true
      );
      result := jsonb_set(
        result,
        '{created,mappings}',
        to_jsonb(coalesce((result #>> '{created,mappings}')::integer, 0) + 1),
        true
      );
    end loop;
  end loop;

  -- Ticket 074: safely mapped sessions replay after occurrence mappings exist.
  for row_value in
    select session
    from jsonb_array_elements(
      coalesce(preview #> '{plan,timeSessions}', '[]'::jsonb)
    ) as session
    order by (session ->> 'startedAtUtc')::timestamptz,
      session ->> 'externalId'
  loop
    action_value := case
      when import_mode = 'merge_by_user_approved_plan' then
        cadence_private.behaviorlog_import_action(
          preview,
          'timeSessions',
          row_value ->> 'externalId'
        )
      else null
    end;

    if row_value ->> 'action' <> 'create'
      or (
        import_mode = 'merge_by_user_approved_plan'
        and action_value ->> 'action' not in ('create_new', 'map_to_existing')
      )
    then
      result := jsonb_set(
        result,
        '{skipped,timeSessions}',
        to_jsonb(
          coalesce((result #>> '{skipped,timeSessions}')::integer, 0) + 1
        ),
        true
      );
      continue;
    end if;

    if action_value ->> 'action' = 'map_to_existing' then
      local_session_id := nullif(action_value ->> 'localId', '')::uuid;
      if exists (
        select 1
        from public.occurrence_time_sessions
        where user_id = current_user_id
          and id = local_session_id
      ) then
        insert into public.behaviorlog_import_record_mappings (
          user_id, import_run_id, record_type, external_id, local_id
        ) values (
          current_user_id, apply_run_id, 'time_session',
          row_value ->> 'externalId', local_session_id
        );
        result := jsonb_set(
          result,
          '{mapped,timeSessions}',
          to_jsonb(
            coalesce((result #>> '{mapped,timeSessions}')::integer, 0) + 1
          ),
          true
        );
        result := jsonb_set(
          result,
          '{created,mappings}',
          to_jsonb(coalesce((result #>> '{created,mappings}')::integer, 0) + 1),
          true
        );
      end if;
      continue;
    end if;

    select occurrence_mapping.local_id, behavior_mapping.local_id
    into local_occurrence_id, local_behavior_id
    from public.behaviorlog_import_record_mappings as occurrence_mapping
    join public.behaviorlog_import_record_mappings as behavior_mapping
      on behavior_mapping.user_id = occurrence_mapping.user_id
     and behavior_mapping.import_run_id = occurrence_mapping.import_run_id
     and behavior_mapping.record_type = 'behavior'
     and behavior_mapping.external_id = row_value ->> 'behaviorExternalId'
    where occurrence_mapping.user_id = current_user_id
      and occurrence_mapping.import_run_id = apply_run_id
      and occurrence_mapping.record_type = 'occurrence'
      and occurrence_mapping.external_id = row_value ->> 'occurrenceExternalId';

    if local_occurrence_id is null
      or local_behavior_id is null
      or not exists (
        select 1
        from public.occurrences as occurrence
        where occurrence.user_id = current_user_id
          and occurrence.id = local_occurrence_id
          and occurrence.behavior_id = local_behavior_id
      )
      or (
        row_value ->> 'stoppedAtUtc' is null
        and exists (
          select 1
          from public.occurrence_time_sessions as running_session
          where running_session.user_id = current_user_id
            and running_session.occurrence_id = local_occurrence_id
            and running_session.stopped_at is null
        )
      )
    then
      result := jsonb_set(
        result,
        '{skipped,timeSessions}',
        to_jsonb(
          coalesce((result #>> '{skipped,timeSessions}')::integer, 0) + 1
        ),
        true
      );
      result := jsonb_set(
        result,
        '{warnings}',
        coalesce(result -> 'warnings', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'severity', 'warning',
            'code', 'time_session_replay_skipped',
            'message', format(
              'Time session %s was skipped because its mapped parents or running-session invariant were unavailable.',
              row_value ->> 'externalId'
            ),
            'file', 'data/time_sessions.jsonl'
          )
        ),
        true
      );
      continue;
    end if;

    insert into public.occurrence_time_sessions (
      user_id,
      occurrence_id,
      behavior_id,
      started_at,
      stopped_at
    ) values (
      current_user_id,
      local_occurrence_id,
      local_behavior_id,
      (row_value ->> 'startedAtUtc')::timestamptz,
      nullif(row_value ->> 'stoppedAtUtc', '')::timestamptz
    )
    returning id into local_session_id;

    insert into public.behaviorlog_import_record_mappings (
      user_id,
      import_run_id,
      record_type,
      external_id,
      local_id
    ) values (
      current_user_id,
      apply_run_id,
      'time_session',
      row_value ->> 'externalId',
      local_session_id
    );

    result := jsonb_set(
      result,
      '{created,timeSessions}',
      to_jsonb(coalesce((result #>> '{created,timeSessions}')::integer, 0) + 1),
      true
    );
    result := jsonb_set(
      result,
      '{created,mappings}',
      to_jsonb(coalesce((result #>> '{created,mappings}')::integer, 0) + 1),
      true
    );
  end loop;

  update public.behaviorlog_import_runs
  set dry_run_summary = jsonb_set(
    dry_run_summary,
    '{applyResult}',
    result - 'import_run',
    true
  )
  where user_id = current_user_id
    and id = apply_run_id;

  select to_jsonb(run.*)
  into row_value
  from public.behaviorlog_import_runs as run
  where run.user_id = current_user_id
    and run.id = apply_run_id;

  return (result - 'import_run') || jsonb_build_object('import_run', row_value);
end;
$$;

revoke all on function public.apply_behaviorlog_import(jsonb) from public, anon;
grant execute on function public.apply_behaviorlog_import(jsonb) to authenticated;

commit;
