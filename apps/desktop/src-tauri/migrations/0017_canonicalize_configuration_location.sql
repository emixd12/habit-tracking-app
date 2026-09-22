-- Mirror the September 22, 2026 hosted travel canonicalization of
-- configuration history so local rows match hosted and the sync baseline.
DROP TRIGGER behavior_configuration_events_append_only;

UPDATE behavior_configuration_events
SET previous_configuration = json_set(previous_configuration, '$.location_text', json('null'))
WHERE previous_configuration IS NOT NULL
  AND json_type(previous_configuration) = 'object'
  AND json_type(previous_configuration, '$.location_text') IS NULL;

UPDATE behavior_configuration_events
SET next_configuration = json_set(next_configuration, '$.location_text', json('null'))
WHERE json_type(next_configuration) = 'object'
  AND json_type(next_configuration, '$.location_text') IS NULL;

UPDATE behavior_configuration_events
SET changed_fields = json_insert(changed_fields, '$[#]', 'location_text')
WHERE event_kind = 'baseline'
  AND json_type(changed_fields) = 'array'
  AND NOT EXISTS (SELECT 1 FROM json_each(changed_fields) WHERE value = 'location_text');

CREATE TRIGGER behavior_configuration_events_append_only BEFORE UPDATE ON behavior_configuration_events BEGIN SELECT RAISE(ABORT, 'History rows are append-only.'); END;
