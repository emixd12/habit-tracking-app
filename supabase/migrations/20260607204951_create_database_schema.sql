create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name)
);

create table public.behaviors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  title text not null,
  description text,
  recurrence_rule jsonb not null,
  scheduled_time time not null,
  timezone text not null default 'America/New_York',
  browser_reminder_enabled boolean not null default true,
  email_reminder_enabled boolean not null default false,
  reminder_offset_minutes int not null default 0 check (reminder_offset_minutes >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, id),
  constraint behaviors_category_id_fkey
    foreign key (category_id)
    references public.categories(id)
    on delete set null,
  constraint behaviors_category_owner_fkey
    foreign key (user_id, category_id)
    references public.categories(user_id, id)
    on delete set null (category_id)
);

create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  behavior_id uuid not null references public.behaviors(id) on delete cascade,
  scheduled_for timestamptz not null,
  local_date date not null,
  status text not null default 'unresolved'
    check (status in ('unresolved', 'done', 'not_done')),
  completed_at timestamptz,
  status_marked_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (behavior_id, scheduled_for),
  unique (user_id, id),
  constraint occurrences_behavior_owner_fkey
    foreign key (user_id, behavior_id)
    references public.behaviors(user_id, id)
    on delete cascade
);

create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  channel text not null check (channel in ('browser_push', 'email')),
  scheduled_send_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id, channel, scheduled_send_at),
  constraint reminder_deliveries_occurrence_owner_fkey
    foreign key (user_id, occurrence_id)
    references public.occurrences(user_id, id)
    on delete cascade
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index categories_user_sort_order_idx
  on public.categories (user_id, sort_order, name);

create index behaviors_user_active_idx
  on public.behaviors (user_id, active, scheduled_time);

create index occurrences_user_local_date_idx
  on public.occurrences (user_id, local_date, scheduled_for);

create index occurrences_user_status_idx
  on public.occurrences (user_id, status, local_date);

create index reminder_deliveries_due_idx
  on public.reminder_deliveries (status, scheduled_send_at)
  where status = 'pending';

create index reminder_deliveries_user_status_idx
  on public.reminder_deliveries (user_id, status, scheduled_send_at);

create index push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger set_behaviors_updated_at
  before update on public.behaviors
  for each row execute function public.set_updated_at();

create trigger set_occurrences_updated_at
  before update on public.occurrences
  for each row execute function public.set_updated_at();

create trigger set_reminder_deliveries_updated_at
  before update on public.reminder_deliveries
  for each row execute function public.set_updated_at();

create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.behaviors enable row level security;
alter table public.occurrences enable row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_delete_own
  on public.profiles for delete
  to authenticated
  using (id = auth.uid());

create policy categories_select_own
  on public.categories for select
  to authenticated
  using (user_id = auth.uid());

create policy categories_insert_own
  on public.categories for insert
  to authenticated
  with check (user_id = auth.uid());

create policy categories_update_own
  on public.categories for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy categories_delete_own
  on public.categories for delete
  to authenticated
  using (user_id = auth.uid());

create policy behaviors_select_own
  on public.behaviors for select
  to authenticated
  using (user_id = auth.uid());

create policy behaviors_insert_own
  on public.behaviors for insert
  to authenticated
  with check (user_id = auth.uid());

create policy behaviors_update_own
  on public.behaviors for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy behaviors_delete_own
  on public.behaviors for delete
  to authenticated
  using (user_id = auth.uid());

create policy occurrences_select_own
  on public.occurrences for select
  to authenticated
  using (user_id = auth.uid());

create policy occurrences_insert_own
  on public.occurrences for insert
  to authenticated
  with check (user_id = auth.uid());

create policy occurrences_update_own
  on public.occurrences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy occurrences_delete_own
  on public.occurrences for delete
  to authenticated
  using (user_id = auth.uid());

create policy reminder_deliveries_select_own
  on public.reminder_deliveries for select
  to authenticated
  using (user_id = auth.uid());

create policy reminder_deliveries_insert_own
  on public.reminder_deliveries for insert
  to authenticated
  with check (user_id = auth.uid());

create policy reminder_deliveries_update_own
  on public.reminder_deliveries for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy reminder_deliveries_delete_own
  on public.reminder_deliveries for delete
  to authenticated
  using (user_id = auth.uid());

create policy push_subscriptions_select_own
  on public.push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy push_subscriptions_update_own
  on public.push_subscriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.behaviors to authenticated;
grant select, insert, update, delete on table public.occurrences to authenticated;
grant select, insert, update, delete on table public.reminder_deliveries to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();

  insert into public.categories (user_id, name, sort_order)
  values
    (new.id, 'Medical', 0),
    (new.id, 'Grooming', 1),
    (new.id, 'Fitness', 2),
    (new.id, 'Food / Drink', 3),
    (new.id, 'Home', 4),
    (new.id, 'Measurements', 5),
    (new.id, 'Admin', 6),
    (new.id, 'Other', 7)
  on conflict (user_id, name) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public;

insert into public.profiles (id, email, display_name)
select
  users.id,
  coalesce(users.email, ''),
  nullif(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name'), '')
from auth.users
on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      updated_at = now();

insert into public.categories (user_id, name, sort_order)
select users.id, default_categories.name, default_categories.sort_order
from auth.users as users
cross join (
  values
    ('Medical', 0),
    ('Grooming', 1),
    ('Fitness', 2),
    ('Food / Drink', 3),
    ('Home', 4),
    ('Measurements', 5),
    ('Admin', 6),
    ('Other', 7)
) as default_categories(name, sort_order)
on conflict (user_id, name) do nothing;
