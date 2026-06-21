alter table public.behaviorlog_import_runs
  drop constraint if exists behaviorlog_import_runs_import_mode_check;

alter table public.behaviorlog_import_runs
  add constraint behaviorlog_import_runs_import_mode_check
  check (
    import_mode in (
      'preview_only',
      'create_missing_only',
      'merge_preview',
      'merge_by_user_approved_plan',
      'restore_preview'
    )
  );
