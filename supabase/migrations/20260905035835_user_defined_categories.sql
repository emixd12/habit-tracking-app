begin;

alter table public.categories add column description text;

-- Preserve every ID, assignment, and original name when distinguishing legacy duplicates.
with duplicates as (
  select id, row_number() over (partition by user_id, lower(btrim(name) collate "C") order by sort_order, id) as ordinal
  from public.categories
)
update public.categories c set name = c.name || ' [' || c.id::text || ']'
from duplicates d where d.id = c.id and d.ordinal > 1;
create unique index categories_owner_normalized_name on public.categories(user_id, lower(btrim(name) collate "C"));
alter table public.categories add constraint categories_description_length check (char_length(description) <= 2000);

-- Validate every writer, including import and synchronization. Preserve unchanged legacy names.
create function cadence_private.validate_category_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.categories c where c.id=new.id and c.user_id=new.user_id and c.name=new.name) then return new; end if;
  if char_length(new.name) not between 1 and 120 or new.name <> btrim(new.name)
    or new.name ~ '[[:cntrl:]]' then
    raise exception 'Enter a category name of 1–120 characters without control characters.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger categories_validate_name before insert or update on public.categories
for each row execute function cadence_private.validate_category_name();

create function public.manage_categories(expected_categories jsonb, next_categories jsonb, behavior_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  category public.categories;
  expected jsonb;
  candidate jsonb;
  behavior public.behaviors;
  change jsonb;
  previous_snapshot jsonb;
  next_snapshot jsonb;
  removed_ids uuid[];
begin
  if owner_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  if jsonb_typeof(expected_categories) is distinct from 'array' or jsonb_typeof(next_categories) is distinct from 'array'
    or jsonb_typeof(behavior_changes) is distinct from 'array' or jsonb_array_length(next_categories) > 1000 then
    raise exception 'Invalid category plan.' using errcode = '22023';
  end if;
  perform 1 from public.categories where user_id = owner_id order by id for update;
  if (select count(*) from public.categories where user_id = owner_id) <> jsonb_array_length(expected_categories)
    or (select count(distinct x->>'id') from jsonb_array_elements(expected_categories) x) <> jsonb_array_length(expected_categories)
    or (select count(distinct x->>'id') from jsonb_array_elements(next_categories) x) <> jsonb_array_length(next_categories) then
    raise exception 'Categories changed. Refresh Settings and review your changes.';
  end if;
  for category in select * from public.categories where user_id = owner_id loop
    select x into expected from jsonb_array_elements(expected_categories) x where (x->>'id')::uuid = category.id;
    if not found or (expected->>'updated_at')::timestamptz is distinct from category.updated_at
      or expected->>'name' is distinct from category.name
      or expected->>'description' is distinct from category.description
      or (expected->>'sort_order')::integer is distinct from category.sort_order then
      raise exception 'Categories changed. Refresh Settings and review your changes.';
    end if;
  end loop;
  select coalesce(array_agg(c.id), '{}'::uuid[]) into removed_ids from public.categories c
    where c.user_id = owner_id and not exists(select 1 from jsonb_array_elements(next_categories) x where (x->>'id')::uuid = c.id);
  perform 1 from public.behaviors where user_id = owner_id and category_id = any(removed_ids) order by id for update;
  if (select count(*) from public.behaviors where user_id = owner_id and category_id = any(removed_ids)) <> jsonb_array_length(behavior_changes)
    or (select count(distinct x->>'behavior_id') from jsonb_array_elements(behavior_changes) x) <> jsonb_array_length(behavior_changes) then
    raise exception 'Category assignments changed. Refresh Settings before deleting.';
  end if;
  for behavior in select * from public.behaviors where user_id = owner_id and category_id = any(removed_ids) order by id loop
    select x into change from jsonb_array_elements(behavior_changes) x where (x->>'behavior_id')::uuid = behavior.id;
    if not found or (change->>'expected_updated_at')::timestamptz is distinct from behavior.updated_at then
      raise exception 'A Behavior changed. Refresh Settings before deleting its category.';
    end if;
    previous_snapshot := cadence_private.current_behavior_configuration_snapshot(owner_id, behavior.id);
    next_snapshot := jsonb_set(previous_snapshot, '{category_id}', 'null'::jsonb);
    update public.behaviors set category_id = null where id = behavior.id and user_id = owner_id;
    perform cadence_private.insert_behavior_configuration_event(owner_id, behavior.id, previous_snapshot, next_snapshot, change->'configuration_event_plan');
  end loop;
  delete from public.categories where user_id = owner_id and id = any(removed_ids);
  for candidate in select x from jsonb_array_elements(next_categories) x loop
    if jsonb_typeof(candidate->'name') is distinct from 'string'
      or jsonb_typeof(candidate->'sort_order') is distinct from 'number'
      or (candidate ? 'description' and jsonb_typeof(candidate->'description') not in ('string','null'))
      or (not exists(select 1 from public.categories c where c.user_id=owner_id and c.id=(candidate->>'id')::uuid and c.name=candidate->>'name')
        and (char_length(candidate->>'name') not between 1 and 120
          or candidate->>'name' <> btrim(candidate->>'name')
          or candidate->>'name' ~ '[[:cntrl:]]'))
      or char_length(candidate->>'description') > 2000
      or (candidate->>'sort_order')::integer < 0 then
      raise exception 'Invalid category name, description, or order.' using errcode = '22023';
    end if;
    if exists(select 1 from public.categories where id = (candidate->>'id')::uuid and user_id <> owner_id) then
      raise exception 'Category belongs to another account.' using errcode = '42501';
    end if;
    insert into public.categories(id, user_id, name, description, sort_order)
      values ((candidate->>'id')::uuid, owner_id, candidate->>'name', nullif(candidate->>'description',''), (candidate->>'sort_order')::integer)
    on conflict(id) do update set name=excluded.name, description=excluded.description, sort_order=excluded.sort_order
      where public.categories.user_id = owner_id and (public.categories.name,public.categories.description,public.categories.sort_order)
        is distinct from (excluded.name,excluded.description,excluded.sort_order);
  end loop;
end;
$$;
revoke all on function public.manage_categories(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.manage_categories(jsonb,jsonb,jsonb) to authenticated;

-- Reject old sync writes before they can erase a field absent from their contract.
do $migration$
declare definition text;
  anchor text := $anchor$    write_value := (write -> 'value') || jsonb_build_object('user_id', current_user_id);$anchor$;
begin
  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Account sync function changed unexpectedly.';
  end if;
  execute replace(definition, anchor, $patch$
    if write_kind = 'category' and not ((write -> 'value') ? 'description') then
      raise exception 'Update Cadence before synchronizing category changes.' using errcode = '22023';
    end if;
$patch$ || anchor);
end
$migration$;

-- Extend existing projections without forking their concurrency boundaries.
do $migration$
declare definition text; anchor text;
begin
  select pg_get_functiondef('public.get_export_page_read_bundle(date,date)'::regprocedure) into definition;
  anchor := '            c.name,';
  if position(anchor in definition) = 0 then raise exception 'Export category projection changed unexpectedly.'; end if;
  execute replace(definition, anchor, anchor || E'\n            c.description,');

  select pg_get_functiondef('public.apply_behaviorlog_restore(jsonb)'::regprocedure) into definition;
  anchor := 'insert into public.categories (user_id, name, sort_order)';
  if position(anchor in definition) = 0 then raise exception 'Restore category creation changed unexpectedly.'; end if;
  definition := replace(definition, anchor, 'insert into public.categories (user_id, name, description, sort_order)');
  anchor := E'          category_name,\n          coalesce';
  if position(anchor in definition) = 0 then raise exception 'Restore category values changed unexpectedly.'; end if;
  execute replace(definition, anchor, $patch$          category_name,
          nullif(behavior_value ->> 'category_description', ''),
          coalesce$patch$);
end
$migration$;

commit;
