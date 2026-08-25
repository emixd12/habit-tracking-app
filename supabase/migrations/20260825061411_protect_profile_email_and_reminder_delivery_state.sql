revoke insert, update, delete on table public.profiles from authenticated;
grant update (timezone) on table public.profiles to authenticated;

create or replace function public.sync_profile_email_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = coalesce(new.email, '')
    where id = new.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email_from_auth_user();

revoke all on function public.sync_profile_email_from_auth_user() from public;
revoke all on function public.sync_profile_email_from_auth_user() from anon;
revoke all on function public.sync_profile_email_from_auth_user() from authenticated;

create or replace function public.guard_reminder_delivery_state_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    if old.status in ('sent', 'failed') and new.status = 'pending' then
      raise exception using
        errcode = '42501',
        message = 'terminal reminder deliveries cannot return to pending';
    end if;

    if old.processing_started_at is not null
       and new.processing_started_at is null then
      raise exception using
        errcode = '42501',
        message = 'reminder delivery processing claims cannot be cleared';
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_reminder_delivery_state_update
  before update on public.reminder_deliveries
  for each row execute function public.guard_reminder_delivery_state_update();

revoke all on function public.guard_reminder_delivery_state_update() from public;
revoke all on function public.guard_reminder_delivery_state_update() from anon;
revoke all on function public.guard_reminder_delivery_state_update() from authenticated;
