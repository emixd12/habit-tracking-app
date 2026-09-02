-- A missing hosted row is SQL NULL, while an insert plan carries JSON null.
-- Normalize the former without duplicating the account-sync function body.
do $$
declare
  definition text;
  original text := 'if stored_value is distinct from write -> ''expected'' then';
  corrected text := 'if coalesce(stored_value, ''null''::jsonb) is distinct from write -> ''expected'' then';
  original_count integer;
  corrected_count integer;
begin
  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    execute replace(definition, original, corrected);
  elsif original_count = 0 and corrected_count = 1 then
    null;
  else
    raise exception 'The account-sync compare-and-set definition changed unexpectedly.';
  end if;
end
$$;
