-- Direct history edits remain forbidden. SQLite may clear a revision link while
-- cascading the deletion of its entire owning Occurrence and status history.
DROP TRIGGER occurrence_status_events_append_only;
CREATE TRIGGER occurrence_status_events_append_only BEFORE UPDATE ON occurrence_status_events
WHEN EXISTS (SELECT 1 FROM occurrences WHERE user_id=OLD.user_id AND id=OLD.occurrence_id)
BEGIN SELECT RAISE(ABORT, 'History rows are append-only.'); END;
