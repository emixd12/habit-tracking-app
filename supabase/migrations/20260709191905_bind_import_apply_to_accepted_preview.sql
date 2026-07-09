alter table public.behaviorlog_import_runs
  add column accepted_preview_run_id uuid,
  add column accepted_preview_fingerprint text;

alter table public.behaviorlog_import_runs
  add constraint behaviorlog_import_runs_accepted_preview_owner_fkey
  foreign key (user_id, accepted_preview_run_id)
  references public.behaviorlog_import_runs(user_id, id)
  on delete restrict;

alter table public.behaviorlog_import_runs
  add constraint behaviorlog_import_runs_accepted_preview_fingerprint_check
  check (
    accepted_preview_fingerprint is null
    or accepted_preview_fingerprint ~ '^[a-f0-9]{64}$'
  );

alter table public.behaviorlog_import_runs
  add constraint behaviorlog_import_runs_apply_requires_accepted_preview_check
  check (
    import_mode not in ('create_missing_only', 'merge_by_user_approved_plan')
    or (
      accepted_preview_run_id is not null
      and accepted_preview_fingerprint is not null
    )
  ) not valid;

create index behaviorlog_import_runs_user_accepted_preview_idx
  on public.behaviorlog_import_runs (user_id, accepted_preview_run_id)
  where accepted_preview_run_id is not null;
