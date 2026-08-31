-- Preview staleness follows domain rows, independently of OS reminder receipts and ledgers.
CREATE TABLE local_data_revision (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision >= 0)
) STRICT;
INSERT INTO local_data_revision (user_id,revision) SELECT id,0 FROM profiles;
CREATE TRIGGER profile_data_revision_insert AFTER INSERT ON profiles BEGIN
    INSERT INTO local_data_revision(user_id,revision) VALUES(NEW.id,1);
END;

CREATE TRIGGER profiles_data_revision_update AFTER UPDATE ON profiles WHEN OLD.created_at IS NOT NEW.created_at OR OLD.display_name IS NOT NEW.display_name OR OLD.email IS NOT NEW.email OR OLD.id IS NOT NEW.id OR OLD.timezone IS NOT NEW.timezone OR OLD.updated_at IS NOT NEW.updated_at BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.id; END;

CREATE TRIGGER categories_data_revision_insert AFTER INSERT ON categories BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER categories_data_revision_update AFTER UPDATE ON categories WHEN OLD.created_at IS NOT NEW.created_at OR OLD.id IS NOT NEW.id OR OLD.name IS NOT NEW.name OR OLD.sort_order IS NOT NEW.sort_order OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER categories_data_revision_delete AFTER DELETE ON categories BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER behaviors_data_revision_insert AFTER INSERT ON behaviors BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behaviors_data_revision_update AFTER UPDATE ON behaviors WHEN OLD.active IS NOT NEW.active OR OLD.archived_at IS NOT NEW.archived_at OR OLD.browser_reminder_enabled IS NOT NEW.browser_reminder_enabled OR OLD.category_id IS NOT NEW.category_id OR OLD.created_at IS NOT NEW.created_at OR OLD.current_configuration_event_id IS NOT NEW.current_configuration_event_id OR OLD.description IS NOT NEW.description OR OLD.email_reminder_enabled IS NOT NEW.email_reminder_enabled OR OLD.id IS NOT NEW.id OR OLD.recurrence_rule IS NOT NEW.recurrence_rule OR OLD.reminder_offset_minutes IS NOT NEW.reminder_offset_minutes OR OLD.scheduled_time IS NOT NEW.scheduled_time OR OLD.timezone IS NOT NEW.timezone OR OLD.title IS NOT NEW.title OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behaviors_data_revision_delete AFTER DELETE ON behaviors BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER behavior_schedules_data_revision_insert AFTER INSERT ON behavior_schedules BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_schedules_data_revision_update AFTER UPDATE ON behavior_schedules WHEN OLD.behavior_id IS NOT NEW.behavior_id OR OLD.created_at IS NOT NEW.created_at OR OLD.id IS NOT NEW.id OR OLD.recurrence_rule IS NOT NEW.recurrence_rule OR OLD.sort_order IS NOT NEW.sort_order OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_schedules_data_revision_delete AFTER DELETE ON behavior_schedules BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER behavior_schedule_slots_data_revision_insert AFTER INSERT ON behavior_schedule_slots BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_schedule_slots_data_revision_update AFTER UPDATE ON behavior_schedule_slots WHEN OLD.behavior_id IS NOT NEW.behavior_id OR OLD.behavior_schedule_id IS NOT NEW.behavior_schedule_id OR OLD.created_at IS NOT NEW.created_at OR OLD.end_time IS NOT NEW.end_time OR OLD.id IS NOT NEW.id OR OLD.kind IS NOT NEW.kind OR OLD.preset IS NOT NEW.preset OR OLD.sort_order IS NOT NEW.sort_order OR OLD.start_time IS NOT NEW.start_time OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_schedule_slots_data_revision_delete AFTER DELETE ON behavior_schedule_slots BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER behavior_definition_events_data_revision_insert AFTER INSERT ON behavior_definition_events BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_definition_events_data_revision_update AFTER UPDATE ON behavior_definition_events WHEN OLD.behavior_id IS NOT NEW.behavior_id OR OLD.changed_fields IS NOT NEW.changed_fields OR OLD.created_at IS NOT NEW.created_at OR OLD.id IS NOT NEW.id OR OLD.next_description IS NOT NEW.next_description OR OLD.next_title IS NOT NEW.next_title OR OLD.previous_description IS NOT NEW.previous_description OR OLD.previous_title IS NOT NEW.previous_title OR OLD.reason IS NOT NEW.reason OR OLD.recorded_at IS NOT NEW.recorded_at OR OLD.source IS NOT NEW.source OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_definition_events_data_revision_delete AFTER DELETE ON behavior_definition_events BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER behavior_configuration_events_data_revision_insert AFTER INSERT ON behavior_configuration_events BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_configuration_events_data_revision_update AFTER UPDATE ON behavior_configuration_events WHEN OLD.behavior_id IS NOT NEW.behavior_id OR OLD.changed_fields IS NOT NEW.changed_fields OR OLD.created_at IS NOT NEW.created_at OR OLD.effective_at IS NOT NEW.effective_at OR OLD.effective_local_date IS NOT NEW.effective_local_date OR OLD.event_kind IS NOT NEW.event_kind OR OLD.id IS NOT NEW.id OR OLD.next_configuration IS NOT NEW.next_configuration OR OLD.previous_configuration IS NOT NEW.previous_configuration OR OLD.reason_code IS NOT NEW.reason_code OR OLD.recorded_at IS NOT NEW.recorded_at OR OLD.source IS NOT NEW.source OR OLD.timezone IS NOT NEW.timezone OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behavior_configuration_events_data_revision_delete AFTER DELETE ON behavior_configuration_events BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER occurrences_data_revision_insert AFTER INSERT ON occurrences BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER occurrences_data_revision_update AFTER UPDATE ON occurrences WHEN OLD.behavior_configuration_event_id IS NOT NEW.behavior_configuration_event_id OR OLD.behavior_id IS NOT NEW.behavior_id OR OLD.behavior_schedule_slot_id IS NOT NEW.behavior_schedule_slot_id OR OLD.completed_at IS NOT NEW.completed_at OR OLD.created_at IS NOT NEW.created_at OR OLD.id IS NOT NEW.id OR OLD.local_date IS NOT NEW.local_date OR OLD.note IS NOT NEW.note OR OLD.schedule_end_time IS NOT NEW.schedule_end_time OR OLD.schedule_kind IS NOT NEW.schedule_kind OR OLD.schedule_preset IS NOT NEW.schedule_preset OR OLD.schedule_start_time IS NOT NEW.schedule_start_time OR OLD.scheduled_for IS NOT NEW.scheduled_for OR OLD.status IS NOT NEW.status OR OLD.status_marked_at IS NOT NEW.status_marked_at OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER occurrences_data_revision_delete AFTER DELETE ON occurrences BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER occurrence_status_events_data_revision_insert AFTER INSERT ON occurrence_status_events BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER occurrence_status_events_data_revision_update AFTER UPDATE ON occurrence_status_events WHEN OLD.behavior_id IS NOT NEW.behavior_id OR OLD.created_at IS NOT NEW.created_at OR OLD.effective_at IS NOT NEW.effective_at OR OLD.id IS NOT NEW.id OR OLD.local_date IS NOT NEW.local_date OR OLD.occurrence_id IS NOT NEW.occurrence_id OR OLD.previous_status IS NOT NEW.previous_status OR OLD.reason_code IS NOT NEW.reason_code OR OLD.recorded_at IS NOT NEW.recorded_at OR OLD.revises_event_id IS NOT NEW.revises_event_id OR OLD.source_capture_method IS NOT NEW.source_capture_method OR OLD.source_confidence IS NOT NEW.source_confidence OR OLD.status IS NOT NEW.status OR OLD.status_semantics IS NOT NEW.status_semantics OR OLD.timezone IS NOT NEW.timezone OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER occurrence_status_events_data_revision_delete AFTER DELETE ON occurrence_status_events BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER occurrence_time_sessions_data_revision_insert AFTER INSERT ON occurrence_time_sessions BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER occurrence_time_sessions_data_revision_update AFTER UPDATE ON occurrence_time_sessions WHEN OLD.behavior_id IS NOT NEW.behavior_id OR OLD.created_at IS NOT NEW.created_at OR OLD.id IS NOT NEW.id OR OLD.occurrence_id IS NOT NEW.occurrence_id OR OLD.started_at IS NOT NEW.started_at OR OLD.stopped_at IS NOT NEW.stopped_at OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER occurrence_time_sessions_data_revision_delete AFTER DELETE ON occurrence_time_sessions BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER imported_notes_data_revision_insert AFTER INSERT ON imported_notes BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER imported_notes_data_revision_update AFTER UPDATE ON imported_notes WHEN OLD.body_markdown IS NOT NEW.body_markdown OR OLD.created_at IS NOT NEW.created_at OR OLD.external_id IS NOT NEW.external_id OR OLD.id IS NOT NEW.id OR OLD.import_run_id IS NOT NEW.import_run_id OR OLD.imported_created_at IS NOT NEW.imported_created_at OR OLD.imported_updated_at IS NOT NEW.imported_updated_at OR OLD.metadata IS NOT NEW.metadata OR OLD.note_role IS NOT NEW.note_role OR OLD.sensitivity IS NOT NEW.sensitivity OR OLD.source_capture_method IS NOT NEW.source_capture_method OR OLD.source_confidence IS NOT NEW.source_confidence OR OLD.source_original_id IS NOT NEW.source_original_id OR OLD.target_external_id IS NOT NEW.target_external_id OR OLD.target_local_id IS NOT NEW.target_local_id OR OLD.target_type IS NOT NEW.target_type OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER imported_notes_data_revision_delete AFTER DELETE ON imported_notes BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER imported_interventions_data_revision_insert AFTER INSERT ON imported_interventions BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER imported_interventions_data_revision_update AFTER UPDATE ON imported_interventions WHEN OLD.behavior_external_id IS NOT NEW.behavior_external_id OR OLD.behavior_id IS NOT NEW.behavior_id OR OLD.channel IS NOT NEW.channel OR OLD.created_at IS NOT NEW.created_at OR OLD.delivery_status IS NOT NEW.delivery_status OR OLD.external_id IS NOT NEW.external_id OR OLD.failure_reason IS NOT NEW.failure_reason OR OLD.id IS NOT NEW.id OR OLD.import_run_id IS NOT NEW.import_run_id OR OLD.intervention_type IS NOT NEW.intervention_type OR OLD.metadata IS NOT NEW.metadata OR OLD.occurrence_external_id IS NOT NEW.occurrence_external_id OR OLD.occurrence_id IS NOT NEW.occurrence_id OR OLD.redacted_sensitivity_indicators IS NOT NEW.redacted_sensitivity_indicators OR OLD.scheduled_send_at IS NOT NEW.scheduled_send_at OR OLD.sent_at IS NOT NEW.sent_at OR OLD.source_capture_method IS NOT NEW.source_capture_method OR OLD.source_confidence IS NOT NEW.source_confidence OR OLD.source_original_id IS NOT NEW.source_original_id OR OLD.updated_at IS NOT NEW.updated_at OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER imported_interventions_data_revision_delete AFTER DELETE ON imported_interventions BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;

CREATE TRIGGER behaviorlog_import_record_mappings_data_revision_insert AFTER INSERT ON behaviorlog_import_record_mappings BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behaviorlog_import_record_mappings_data_revision_update AFTER UPDATE ON behaviorlog_import_record_mappings WHEN OLD.created_at IS NOT NEW.created_at OR OLD.external_id IS NOT NEW.external_id OR OLD.id IS NOT NEW.id OR OLD.import_run_id IS NOT NEW.import_run_id OR OLD.local_id IS NOT NEW.local_id OR OLD.record_type IS NOT NEW.record_type OR OLD.user_id IS NOT NEW.user_id BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=NEW.user_id; END;

CREATE TRIGGER behaviorlog_import_record_mappings_data_revision_delete AFTER DELETE ON behaviorlog_import_record_mappings BEGIN UPDATE local_data_revision SET revision=revision+1 WHERE user_id=OLD.user_id; END;
