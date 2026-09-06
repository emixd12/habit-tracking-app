begin;
do $$
declare
  note jsonb := '{"id":"11111111-1111-4111-8111-111111111111","archived_at":"2026-09-01T12:00:00Z","updated_at":"2026-09-01T12:00:00Z","note":"Program finished"}'::jsonb;
  invalid jsonb;
begin
  if not cadence_private.valid_behavior_archive_notes('[]') or
    not cadence_private.valid_behavior_archive_notes(jsonb_build_array(note)) then
    raise exception 'Valid archive history was rejected.';
  end if;
  foreach invalid in array array[
    'null'::jsonb,
    jsonb_build_array(note, note),
    jsonb_build_array(note || '{"unexpected":true}'),
    jsonb_build_array(note || '{"note":""}'),
    jsonb_build_array(note || '{"note":" padded "}'),
    jsonb_build_array(note || jsonb_build_object('note', repeat('x', 2001))),
    jsonb_build_array(note || jsonb_build_object('note', repeat('😀', 1001))),
    jsonb_build_array(note || '{"updated_at":"2026-08-01T12:00:00Z"}')
  ] loop
    if cadence_private.valid_behavior_archive_notes(invalid) then
      raise exception 'Invalid archive history was accepted.';
    end if;
  end loop;
end $$;
rollback;
