\set ON_ERROR_STOP on
begin;

-- A temporary copy of the deployed algorithm provides the compatibility oracle.
create temporary table canonical_fixture(value jsonb);
create function pg_temp.legacy_canonical(value jsonb)
returns text language sql immutable set search_path = '' as $$
  select case jsonb_typeof(value)
    when 'object' then '{' || coalesce((
      select string_agg(to_json(key)::text || ':' || pg_temp.legacy_canonical(item), ',' order by key collate "C")
      from jsonb_each(value) entry(key, item)
    ), '') || '}'
    when 'array' then '[' || coalesce((
      select string_agg(pg_temp.legacy_canonical(item), ',' order by ordinality)
      from jsonb_array_elements(value) with ordinality entry(item, ordinality)
    ), '') || ']'
    else value::text
  end
$$;

insert into canonical_fixture values
  (null), ('null'), ('true'), ('false'), ('0'), ('1.200'), ('-12.5'),
  ('""'), ('{}'), ('[]'),
  ('{"z":[],"a":{"b":false,"a":null}}'),
  ('["quote\"","slash\\","line\n","tab\t","é","😀",1e10]'),
  ('{"😀":1,"":2,"a":3,"A":4,"a a":5,"a\"":6}');

insert into canonical_fixture
select jsonb_agg(jsonb_build_object('kind','reminder_delivery','id',n::text,
  'value',jsonb_build_object('status','sent','processing_started_at','2026-09-11T03:00:00.000000Z',
  'sent_at','2026-09-11T03:00:00.000000Z','channel','browser_push','error',null,
  'metadata',jsonb_build_object('tags',jsonb_build_array('synthetic','quote"','line' || chr(10))))))
from generate_series(1,1500) n;

do $$
declare
  fixture record;
  sample jsonb;
  started timestamptz;
  previous_ms double precision;
  optimized_ms double precision;
begin
  for fixture in select value from canonical_fixture loop
    if cadence_private.canonical_account_sync_json(fixture.value)
      is distinct from pg_temp.legacy_canonical(fixture.value) then
      raise exception 'Canonical account-sync bytes changed.';
    end if;
  end loop;
  if cadence_private.canonical_account_sync_json('{"z":[],"a":{"b":false,"a":null}}')
    <> '{"a":{"a":null,"b":false},"z":[]}' then
    raise exception 'Canonical account-sync key ordering changed.';
  end if;
  select value into sample from canonical_fixture where jsonb_typeof(value)='array' and jsonb_array_length(value)=1500;
  started := clock_timestamp();
  perform pg_temp.legacy_canonical(sample);
  previous_ms := extract(epoch from clock_timestamp()-started)*1000;
  started := clock_timestamp();
  perform cadence_private.canonical_account_sync_json(sample);
  optimized_ms := extract(epoch from clock_timestamp()-started)*1000;
  raise notice 'Canonical bytes match; legacy % ms, optimized % ms.', previous_ms, optimized_ms;
end;
$$;
rollback;
