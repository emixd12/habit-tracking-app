alter table public.reminder_deliveries
  add column import_run_id uuid,
  add column imported_intervention_id uuid,
  add constraint reminder_deliveries_import_provenance_pair_check
    check (
      (import_run_id is null and imported_intervention_id is null)
      or (import_run_id is not null and imported_intervention_id is not null)
    ),
  add constraint reminder_deliveries_import_run_owner_fkey
    foreign key (user_id, import_run_id)
    references public.behaviorlog_import_runs(user_id, id),
  add constraint reminder_deliveries_imported_intervention_owner_fkey
    foreign key (user_id, imported_intervention_id)
    references public.imported_interventions(user_id, id);

create unique index reminder_deliveries_imported_intervention_id_key
  on public.reminder_deliveries (imported_intervention_id)
  where imported_intervention_id is not null;

create index reminder_deliveries_user_import_run_idx
  on public.reminder_deliveries (user_id, import_run_id, scheduled_send_at)
  where import_run_id is not null;
