alter table public.reminder_deliveries
  add column processing_started_at timestamptz;

create index reminder_deliveries_due_unclaimed_idx
  on public.reminder_deliveries (channel, scheduled_send_at)
  where status = 'pending' and processing_started_at is null;
