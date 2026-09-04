begin;

-- Serialize every account apply, lock cross-account insert identities, and keep
-- immutable receipts small. Replayed receipts are valid only while their
-- resulting hosted snapshot remains current.
do $migration$
declare
  definition text;
  original text;
  corrected text;
  original_count integer;
  corrected_count integer;
begin
  select pg_get_functiondef('cadence_private.apply_account_sync_plan(jsonb)'::regprocedure) into definition;

  original := 'perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || '':'' || v_idempotency_key, 0));';
  corrected := 'perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));';
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    definition := replace(definition, original, corrected);
  elsif original_count <> 0 or corrected_count <> 1 then
    raise exception 'The account-sync account lock changed unexpectedly.';
  end if;

  original := $patch$    return stored_receipt.result_json;$patch$;
  corrected := $patch$    current_snapshot := public.read_account_sync_snapshot();
    if current_snapshot ->> 'fingerprint' <> stored_receipt.result_fingerprint then
      raise exception 'The account changed after this synchronization receipt. Replan against the current snapshot.' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'status', 'applied',
      'fingerprint', stored_receipt.result_fingerprint,
      'snapshot', current_snapshot
    );$patch$;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    definition := replace(definition, original, corrected);
  elsif original_count <> 0 or corrected_count <> 1 then
    raise exception 'The account-sync receipt replay changed unexpectedly.';
  end if;

  original := $patch$      execute format(
        'select exists(select 1 from %s owned_row where id = $1 and user_id <> $2)',
        table_name
      ) into other_owner using row_id, current_user_id;$patch$;
  corrected := $patch$      perform pg_advisory_xact_lock(hashtextextended(table_name || ':' || row_id::text, 0));
      execute format(
        'select exists(select 1 from %s owned_row where id = $1 and user_id <> $2)',
        table_name
      ) into other_owner using row_id, current_user_id;$patch$;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    definition := replace(definition, original, corrected);
  elsif original_count <> 0 or corrected_count <> 1 then
    raise exception 'The account-sync entity lock changed unexpectedly.';
  end if;

  original := $patch$    sync_payload ->> 'hostedFingerprint', current_snapshot ->> 'fingerprint', result
  );$patch$;
  corrected := $patch$    sync_payload ->> 'hostedFingerprint', current_snapshot ->> 'fingerprint', jsonb_build_object('status', 'applied')
  );$patch$;
  original_count := (length(definition) - length(replace(definition, original, ''))) / length(original);
  corrected_count := (length(definition) - length(replace(definition, corrected, ''))) / length(corrected);
  if original_count = 1 and corrected_count = 0 then
    definition := replace(definition, original, corrected);
  elsif original_count <> 0 or corrected_count <> 1 then
    raise exception 'The account-sync receipt storage changed unexpectedly.';
  end if;

  execute definition;
end
$migration$;

update public.account_sync_apply_receipts
set result_json = jsonb_build_object('status', 'applied')
where result_json <> jsonb_build_object('status', 'applied');

commit;
