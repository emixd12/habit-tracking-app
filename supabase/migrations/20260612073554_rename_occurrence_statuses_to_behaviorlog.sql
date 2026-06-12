alter table public.occurrences
  drop constraint if exists occurrences_status_check;

update public.occurrences
set status = case status
  when 'done' then 'completed'
  when 'not_done' then 'not_completed'
  else status
end
where status in ('done', 'not_done');

alter table public.occurrences
  alter column status set default 'unresolved',
  add constraint occurrences_status_check
    check (status in ('unresolved', 'completed', 'not_completed'));
