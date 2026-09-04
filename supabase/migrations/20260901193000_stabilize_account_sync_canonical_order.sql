-- Account-sync fingerprints use bytewise ordering on every platform.
do $$
declare
  definition text;
  original text := 'order by key)';
  corrected text := 'order by key collate "C")';
  original_count integer;
  corrected_count integer;
begin
  select pg_get_functiondef('cadence_private.canonical_account_sync_json(jsonb)'::regprocedure) into definition;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    execute replace(definition, original, corrected);
  elsif original_count = 0 and corrected_count = 1 then
    null;
  else
    raise exception 'The account-sync canonical key order changed unexpectedly.';
  end if;

  select pg_get_functiondef('public.read_account_sync_snapshot()'::regprocedure) into definition;
  original := 'order by kind, id';
  corrected := 'order by kind collate "C", id collate "C"';
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    definition := replace(definition, original, corrected);
  elsif original_count = 0 and corrected_count = 1 then
    null;
  else
    raise exception 'The account-sync snapshot entity order changed unexpectedly.';
  end if;

  original := 'order by entity ->> ''kind'', entity ->> ''id''';
  corrected := 'order by entity ->> ''kind'' collate "C", entity ->> ''id'' collate "C"';
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    execute replace(definition, original, corrected);
  elsif original_count = 0 and corrected_count = 1 then
    execute definition;
  else
    raise exception 'The account-sync fingerprint entity order changed unexpectedly.';
  end if;
end
$$;
