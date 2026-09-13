-- Keep the existing fingerprint bytes and privileges. PL/pgSQL caches the
-- recursive branch queries instead of planning the SQL function at every node.
create or replace function cadence_private.canonical_account_sync_json(value jsonb)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  serialized text;
begin
  case jsonb_typeof(value)
    when 'object' then
      select '{' || coalesce(string_agg(to_json(key)::text || ':' || cadence_private.canonical_account_sync_json(item), ',' order by key collate "C"), '') || '}'
      into serialized
      from jsonb_each(value) entry(key, item);
    when 'array' then
      select '[' || coalesce(string_agg(cadence_private.canonical_account_sync_json(item), ',' order by ordinality), '') || ']'
      into serialized
      from jsonb_array_elements(value) with ordinality entry(item, ordinality);
    else
      serialized := value::text;
  end case;
  return serialized;
end;
$$;
