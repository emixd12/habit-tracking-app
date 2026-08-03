do $migration$
declare
  function_signature constant regprocedure :=
    'public.apply_occurrence_status_transition(uuid,text,uuid,text,timestamptz,timestamptz,text,timestamptz,timestamptz,text,text,boolean)'::regprocedure;
  function_definition text;
  retryable_error_marker constant text := 'using errcode = ''40001'';';
  nonretryable_error_marker constant text := 'using errcode = ''P0001'';';
  retryable_error_count integer;
begin
  function_definition := pg_get_functiondef(function_signature);
  retryable_error_count := (
    length(function_definition) -
    length(replace(function_definition, retryable_error_marker, ''))
  ) / length(retryable_error_marker);

  if retryable_error_count <> 2 then
    raise exception
      'Expected exactly two retryable contention errors in apply_occurrence_status_transition; found %.',
      retryable_error_count;
  end if;

  -- 40001 means serialization_failure. PostgREST retries that SQLSTATE, but
  -- these branches report accepted application-level stale plans. P0001 keeps
  -- the same error message and transaction rollback without a retry loop.
  execute replace(
    function_definition,
    retryable_error_marker,
    nonretryable_error_marker
  );
end;
$migration$;

comment on function public.apply_occurrence_status_transition(
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  boolean
) is
  'Atomically applies one resolver-planned manual occurrence status transition, appends its status event, cancels pending reminders when planned, and rejects stale plans with a non-retryable application error.';
