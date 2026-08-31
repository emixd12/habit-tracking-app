-- BehaviorLog 0.3 expands passive Intervention history. Operational delivery
-- channels and statuses remain unchanged. The shared importer stores planned
-- as the existing pending value.
-- Keep foreign keys enabled. Park the paired operational provenance links
-- while replacing their parent table, then restore them in this transaction.
CREATE TEMP TABLE cadence_intervention_links_v6 (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    import_run_id TEXT NOT NULL,
    imported_intervention_id TEXT NOT NULL,
    PRIMARY KEY (user_id,id)
) WITHOUT ROWID;
INSERT INTO cadence_intervention_links_v6
SELECT id,user_id,import_run_id,imported_intervention_id FROM reminder_deliveries
WHERE imported_intervention_id IS NOT NULL;
UPDATE reminder_deliveries SET import_run_id=NULL,imported_intervention_id=NULL
WHERE imported_intervention_id IS NOT NULL;

CREATE TABLE imported_interventions_v6 (
    behavior_external_id TEXT NOT NULL,
    behavior_id TEXT,
    channel TEXT NOT NULL,
    created_at TEXT NOT NULL,
    delivery_status TEXT NOT NULL,
    external_id TEXT NOT NULL,
    failure_reason TEXT,
    id TEXT PRIMARY KEY NOT NULL,
    import_run_id TEXT NOT NULL,
    intervention_type TEXT,
    metadata TEXT NOT NULL CHECK (metadata IS NULL OR json_valid(metadata)),
    occurrence_external_id TEXT NOT NULL,
    occurrence_id TEXT,
    redacted_sensitivity_indicators TEXT NOT NULL CHECK (redacted_sensitivity_indicators IS NULL OR json_valid(redacted_sensitivity_indicators)),
    scheduled_send_at TEXT NOT NULL,
    sent_at TEXT,
    source_capture_method TEXT NOT NULL,
    source_confidence TEXT NOT NULL,
    source_original_id TEXT,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, import_run_id) REFERENCES behaviorlog_import_runs(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (behavior_id) REFERENCES behaviors(id) ON DELETE SET NULL,
    FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id, behavior_id) REFERENCES behaviors(user_id, id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (user_id, occurrence_id) REFERENCES occurrences(user_id, id) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (import_run_id, external_id),
    CHECK (channel IN ('browser_push','email','sms','mobile_push','in_app','calendar_notification','voice_assistant','webhook','other','none')),
    CHECK (delivery_status IN ('pending','sent','delivered','failed','cancelled','suppressed','unknown'))
) STRICT;

INSERT INTO imported_interventions_v6 SELECT * FROM imported_interventions;
DROP TRIGGER imported_interventions_data_revision_insert;
DROP TRIGGER imported_interventions_data_revision_update;
DROP TRIGGER imported_interventions_data_revision_delete;
DROP TABLE imported_interventions;
ALTER TABLE imported_interventions_v6 RENAME TO imported_interventions;

UPDATE reminder_deliveries
SET import_run_id=(SELECT link.import_run_id FROM cadence_intervention_links_v6 link WHERE link.id=reminder_deliveries.id AND link.user_id=reminder_deliveries.user_id),
    imported_intervention_id=(SELECT link.imported_intervention_id FROM cadence_intervention_links_v6 link WHERE link.id=reminder_deliveries.id AND link.user_id=reminder_deliveries.user_id)
WHERE EXISTS(SELECT 1 FROM cadence_intervention_links_v6 link WHERE link.id=reminder_deliveries.id AND link.user_id=reminder_deliveries.user_id);
DROP TABLE cadence_intervention_links_v6;

-- Copying identical history must not stale an already reviewed import plan.
CREATE TRIGGER imported_interventions_data_revision_insert AFTER INSERT ON imported_interventions BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER imported_interventions_data_revision_update AFTER UPDATE ON imported_interventions WHEN OLD.behavior_external_id IS NOT NEW.behavior_external_id OR OLD.behavior_id IS NOT NEW.behavior_id OR OLD.channel IS NOT NEW.channel OR OLD.created_at IS NOT NEW.created_at OR OLD.delivery_status IS NOT NEW.delivery_status OR OLD.external_id IS NOT NEW.external_id OR OLD.failure_reason IS NOT NEW.failure_reason OR OLD.id IS NOT NEW.id OR OLD.import_run_id IS NOT NEW.import_run_id OR OLD.intervention_type IS NOT NEW.intervention_type OR OLD.metadata IS NOT NEW.metadata OR OLD.occurrence_external_id IS NOT NEW.occurrence_external_id OR OLD.occurrence_id IS NOT NEW.occurrence_id OR OLD.redacted_sensitivity_indicators IS NOT NEW.redacted_sensitivity_indicators OR OLD.scheduled_send_at IS NOT NEW.scheduled_send_at OR OLD.sent_at IS NOT NEW.sent_at OR OLD.source_capture_method IS NOT NEW.source_capture_method OR OLD.source_confidence IS NOT NEW.source_confidence OR OLD.source_original_id IS NOT NEW.source_original_id OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER imported_interventions_data_revision_delete AFTER DELETE ON imported_interventions BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;
