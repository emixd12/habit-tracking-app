do $$
declare
  restore_function_definition text;
  corrected_function_definition text;
  defective_behavior_conflict_target text := 'from jsonb_array_elements(coalesce(restore_payload -> ''behaviors'', ''[]''::jsonb)) as row
  on conflict (import_run_id, external_id) do update set';
  corrected_behavior_conflict_target text := 'from jsonb_array_elements(coalesce(restore_payload -> ''behaviors'', ''[]''::jsonb)) as row
  on conflict (id) do update set';
begin
  select pg_get_functiondef('public.apply_behaviorlog_restore(jsonb)'::regprocedure)
  into restore_function_definition;

  if restore_function_definition is null then
    raise exception 'public.apply_behaviorlog_restore(jsonb) is missing';
  end if;

  if position(defective_behavior_conflict_target in restore_function_definition) = 0 then
    raise exception 'Expected defective behavior restore conflict target was not found';
  end if;

  corrected_function_definition := replace(
    restore_function_definition,
    defective_behavior_conflict_target,
    corrected_behavior_conflict_target
  );

  execute corrected_function_definition;
end;
$$;

revoke all on function public.apply_behaviorlog_restore(jsonb) from public;
revoke all on function public.apply_behaviorlog_restore(jsonb) from anon;
grant execute on function public.apply_behaviorlog_restore(jsonb) to authenticated;
