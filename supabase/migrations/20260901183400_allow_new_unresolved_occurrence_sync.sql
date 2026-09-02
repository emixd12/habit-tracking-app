-- New Unresolved Occurrences establish state; they do not transition status.
begin;

do $$
declare
  definition text;
  original text := 'and (stored_value is null or stored_value -> ''status'' is distinct from write #> ''{value,status}'')';
  corrected text := 'and ((stored_value is not null and stored_value -> ''status'' is distinct from write #> ''{value,status}'') or (stored_value is null and write #>> ''{value,status}'' <> ''unresolved''))';
  original_count integer;
  corrected_count integer;
  insert_original text := $patch$    execute format(
      'insert into %1$s select (jsonb_populate_record(null::%1$s, $1)).* '
      'on conflict (id) do update set %2$s', table_name, update_list
    ) using write_value;$patch$;
  insert_corrected text := $patch$    write_kind := update_list;
    select string_agg(format('%I', attribute.attname), ',' order by attribute.attnum)
    into update_list
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = table_name::regclass and attribute.attnum > 0
      and not attribute.attisdropped and attribute.attgenerated = '';
    execute format(
      'insert into %1$s (%3$s) select %3$s from jsonb_populate_record(null::%1$s, $1) '
      'on conflict (id) do update set %2$s', table_name, write_kind, update_list
    ) using write_value;$patch$;
begin
  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    execute replace(definition, original, corrected);
  elsif original_count = 0 and corrected_count = 1 then
    null;
  else
    raise exception 'The account-sync Occurrence history guard changed unexpectedly.';
  end if;
  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;
  original_count := (length(definition) - length(replace(definition, insert_original, ''))) / length(insert_original);
  corrected_count := (length(definition) - length(replace(definition, insert_corrected, ''))) / length(insert_corrected);
  if original_count = 1 and corrected_count = 0 then
    execute replace(definition, insert_original, insert_corrected);
  elsif original_count = 0 and corrected_count = 1 then
    null;
  else
    raise exception 'The account-sync generated-column insert changed unexpectedly.';
  end if;
end
$$;

commit;
