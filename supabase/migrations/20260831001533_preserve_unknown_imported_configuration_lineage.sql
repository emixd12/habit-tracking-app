begin;

-- Imported occurrences did not originate under the newly created operational
-- configuration. Source history remains in the approved import ledger.
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
    E'select current_configuration_event_id into configuration_event_id\n      from public.behaviors where user_id = current_user_id and id = behavior_id;',
    'configuration_event_id := null;'
  );
  if corrected_definition = function_definition then
    raise exception 'Expected imported occurrence configuration assignment was not found';
  end if;
  execute corrected_definition;
end;
$migration$;

commit;
