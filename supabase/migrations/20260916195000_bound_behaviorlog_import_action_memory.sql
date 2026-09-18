begin;

-- The SQL-language helper retains a copy of the entire preview per invocation
-- in its function context. PL/pgSQL releases the lookup's expression context
-- on return, bounding memory while preserving the exact first-match lookup.
create or replace function cadence_private.behaviorlog_import_action(
  preview jsonb,
  action_group text,
  external_id text
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if preview ? '_cadenceActionIndex' then
    return preview #> array['_cadenceActionIndex', action_group, external_id];
  end if;
  select action into result
  from jsonb_array_elements(
    coalesce(preview #> array['mergePreview', 'actions', action_group], '[]'::jsonb)
  ) as action
  where action ->> 'externalId' = external_id
  limit 1;
  return result;
end;
$$;

-- Build the lookup once, rather than scanning every action for every record.
-- Ordered aggregation retains the first match, including for legacy callers.
create or replace function cadence_private.index_behaviorlog_import_actions(preview jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select (preview - '_cadenceActionIndex') || jsonb_build_object('_cadenceActionIndex',
    coalesce(jsonb_object_agg(groups.key, (
      select coalesce(jsonb_object_agg(action ->> 'externalId', action order by ordinal desc), '{}'::jsonb)
      from jsonb_array_elements(groups.value) with ordinality as entries(action, ordinal)
    )), '{}'::jsonb))
  from jsonb_each(coalesce(preview #> '{mergePreview,actions}', '{}'::jsonb)) as groups;
$$;
revoke all on function cadence_private.index_behaviorlog_import_actions(jsonb) from public, anon, authenticated;

do $migration$
declare
  original text;
  patched text;
begin
  original := pg_get_functiondef('cadence_private.apply_behaviorlog_import(jsonb)'::regprocedure);
  patched := replace(original, $$preview jsonb := import_payload -> 'preview';$$,
    $$preview jsonb := cadence_private.index_behaviorlog_import_actions(import_payload -> 'preview');$$);
  if patched = original and position('cadence_private.index_behaviorlog_import_actions' in original) = 0 then raise exception 'Import preview initializer not found'; end if;
  patched := regexp_replace(patched,
    $pattern$cadence_private\.behaviorlog_import_action\(\s*preview,\s*('[^']+'),\s*([^)]*)\)$pattern$,
    $replacement$(preview #> array['_cadenceActionIndex', \1, \2])$replacement$, 'g');
  if position('cadence_private.behaviorlog_import_action(' in patched) > 0 then
    raise exception 'An import action lookup was not indexed';
  end if;
  execute patched;
  original := pg_get_functiondef('public.apply_behaviorlog_import(jsonb)'::regprocedure);
  patched := replace(original, $$preview := adjusted_payload -> 'preview';$$,
    $$preview := cadence_private.index_behaviorlog_import_actions(adjusted_payload -> 'preview');$$);
  if patched = original and position('cadence_private.index_behaviorlog_import_actions' in original) = 0 then raise exception 'Portability preview initializer not found'; end if;
  patched := regexp_replace(patched,
    $pattern$cadence_private\.behaviorlog_import_action\(\s*preview,\s*('[^']+'),\s*([^)]*)\)$pattern$,
    $replacement$(preview #> array['_cadenceActionIndex', \1, \2])$replacement$, 'g');
  if position('cadence_private.behaviorlog_import_action(' in patched) > 0 then
    raise exception 'An import action lookup was not indexed';
  end if;
  -- Counters must not copy the multi-megabyte import ledger for each row.
  -- The final response already reloads that ledger after all writes.
  patched := replace(patched, 'result := core_result;', $$result := core_result - 'import_run';$$);
  execute patched;
end;
$migration$;

-- Large atomic imports outgrow the normal eight-second interactive deadline.
alter function public.apply_behaviorlog_import(jsonb) set statement_timeout = '60s';
-- Full-history fingerprinting exceeds the default eight-second read timeout.
-- Stay inside the desktop's existing 30-second synchronization deadline.
alter function public.read_account_sync_snapshot() set statement_timeout = '25s';
notify pgrst, 'reload schema';

commit;
