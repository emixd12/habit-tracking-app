-- Ticket 110: current tracking schema; no hosted/provider/auth tables.
CREATE TABLE profiles (
    created_at TEXT NOT NULL,
    display_name TEXT,
    email TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    timezone TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (length(trim(timezone)) > 0)
) STRICT;

CREATE TABLE categories (
    created_at TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    CHECK (length(trim(name)) > 0),
    CHECK (sort_order >= 0)
) STRICT;

CREATE TABLE behaviors (
    active INTEGER NOT NULL CHECK (active IN (0,1)),
    archived_at TEXT,
    browser_reminder_enabled INTEGER NOT NULL CHECK (browser_reminder_enabled IN (0,1)),
    category_id TEXT,
    created_at TEXT NOT NULL,
    current_configuration_event_id TEXT,
    description TEXT,
    email_reminder_enabled INTEGER NOT NULL CHECK (email_reminder_enabled IN (0,1)),
    id TEXT PRIMARY KEY NOT NULL,
    recurrence_rule TEXT NOT NULL CHECK (recurrence_rule IS NULL OR json_valid(recurrence_rule)),
    reminder_offset_minutes INTEGER NOT NULL,
    scheduled_time TEXT NOT NULL,
    timezone TEXT NOT NULL,
    title TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
    FOREIGN KEY (user_id, id, current_configuration_event_id) REFERENCES behavior_configuration_events(user_id, behavior_id, id) DEFERRABLE INITIALLY DEFERRED,
    CHECK (length(trim(title)) > 0),
    CHECK (length(trim(timezone)) > 0),
    CHECK (json_type(recurrence_rule) = 'object')
) STRICT;

CREATE TABLE behavior_schedules (
    behavior_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    recurrence_rule TEXT NOT NULL CHECK (recurrence_rule IS NULL OR json_valid(recurrence_rule)),
    sort_order INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, behavior_id) REFERENCES behaviors(user_id, id) ON DELETE CASCADE,
    UNIQUE (user_id, behavior_id, id),
    CHECK (sort_order >= 0),
    CHECK (json_type(recurrence_rule) = 'object')
) STRICT;

CREATE TABLE behavior_schedule_slots (
    behavior_id TEXT NOT NULL,
    behavior_schedule_id TEXT,
    created_at TEXT NOT NULL,
    end_time TEXT,
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    preset TEXT,
    sort_order INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, behavior_id) REFERENCES behaviors(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, behavior_id, behavior_schedule_id) REFERENCES behavior_schedules(user_id, behavior_id, id) ON DELETE CASCADE,
    UNIQUE (user_id, behavior_id, id),
    CHECK (kind IN ('exact','range')),
    CHECK (preset IS NULL OR preset IN ('morning','afternoon','evening','night')),
    CHECK ((kind = 'exact' AND preset IS NULL AND end_time IS NULL) OR (kind = 'range' AND end_time IS NOT NULL AND start_time <> end_time)),
    CHECK (sort_order >= 0)
) STRICT;

CREATE TABLE behavior_definition_events (
    behavior_id TEXT NOT NULL,
    changed_fields TEXT NOT NULL CHECK (changed_fields IS NULL OR json_valid(changed_fields)),
    created_at TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    next_description TEXT,
    next_title TEXT NOT NULL,
    previous_description TEXT,
    previous_title TEXT,
    reason TEXT,
    recorded_at TEXT NOT NULL,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, behavior_id) REFERENCES behaviors(user_id, id) ON DELETE CASCADE,
    CHECK (source IN ('manual','import','system')),
    CHECK (json_array_length(changed_fields) > 0)
) STRICT;

CREATE TABLE behavior_configuration_events (
    behavior_id TEXT NOT NULL,
    changed_fields TEXT NOT NULL CHECK (changed_fields IS NULL OR json_valid(changed_fields)),
    created_at TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    effective_local_date TEXT NOT NULL,
    event_kind TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    next_configuration TEXT NOT NULL CHECK (next_configuration IS NULL OR json_valid(next_configuration)),
    previous_configuration TEXT CHECK (previous_configuration IS NULL OR json_valid(previous_configuration)),
    reason_code TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    source TEXT NOT NULL,
    timezone TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, behavior_id) REFERENCES behaviors(user_id, id) ON DELETE CASCADE,
    UNIQUE (user_id, behavior_id, id),
    CHECK (event_kind IN ('baseline','revision')),
    CHECK (source IN ('manual','import','system')),
    CHECK (json_array_length(changed_fields) > 0),
    CHECK (json_type(next_configuration) = 'object'),
    CHECK ((event_kind = 'baseline' AND previous_configuration IS NULL) OR (event_kind = 'revision' AND json_type(previous_configuration) = 'object' AND previous_configuration <> next_configuration))
) STRICT;

CREATE TABLE occurrences (
    behavior_configuration_event_id TEXT,
    behavior_id TEXT NOT NULL,
    behavior_schedule_slot_id TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    local_date TEXT NOT NULL,
    note TEXT,
    schedule_end_time TEXT,
    schedule_kind TEXT NOT NULL,
    schedule_preset TEXT,
    schedule_range_identity INTEGER GENERATED ALWAYS AS (CASE WHEN schedule_kind = 'exact' THEN -1 ELSE (CAST(substr(schedule_end_time,1,2) AS INTEGER)*3600 + CAST(substr(schedule_end_time,4,2) AS INTEGER)*60 + CAST(substr(schedule_end_time,7,2) AS INTEGER))*1000000 + CAST(substr(substr(coalesce(schedule_end_time,''),10) || '000000',1,6) AS INTEGER) END) STORED,
    schedule_start_time TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    status TEXT NOT NULL,
    status_marked_at TEXT,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, behavior_id) REFERENCES behaviors(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (behavior_schedule_slot_id) REFERENCES behavior_schedule_slots(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id, behavior_id, behavior_schedule_slot_id) REFERENCES behavior_schedule_slots(user_id, behavior_id, id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (user_id, behavior_id, behavior_configuration_event_id) REFERENCES behavior_configuration_events(user_id, behavior_id, id) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (user_id, id, behavior_id),
    UNIQUE (behavior_id, local_date, schedule_start_time, schedule_range_identity),
    CHECK (status IN ('unresolved','completed','not_completed')),
    CHECK (schedule_kind IN ('exact','range')),
    CHECK (schedule_preset IS NULL OR schedule_preset IN ('morning','afternoon','evening','night')),
    CHECK ((schedule_kind = 'exact' AND schedule_preset IS NULL AND schedule_end_time IS NULL) OR (schedule_kind = 'range' AND schedule_end_time IS NOT NULL AND schedule_start_time <> schedule_end_time))
) STRICT;

CREATE TABLE occurrence_status_events (
    behavior_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    effective_at TEXT,
    id TEXT PRIMARY KEY NOT NULL,
    local_date TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    previous_status TEXT,
    reason_code TEXT,
    recorded_at TEXT NOT NULL,
    revises_event_id TEXT,
    source_capture_method TEXT NOT NULL,
    source_confidence TEXT NOT NULL,
    status TEXT NOT NULL,
    status_semantics TEXT NOT NULL,
    timezone TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, occurrence_id, behavior_id) REFERENCES occurrences(user_id, id, behavior_id) ON DELETE CASCADE,
    FOREIGN KEY (revises_event_id) REFERENCES occurrence_status_events(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id, revises_event_id) REFERENCES occurrence_status_events(user_id, id) DEFERRABLE INITIALLY DEFERRED,
    CHECK (status IN ('unresolved','completed','not_completed')),
    CHECK (previous_status IS NULL OR previous_status IN ('unresolved','completed','not_completed')),
    CHECK (status_semantics IN ('explicit_user_mark','explicit_user_correction','imported_explicit','system_rule_declared','ambiguous_import'))
) STRICT;

CREATE TABLE occurrence_time_sessions (
    behavior_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    occurrence_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, occurrence_id, behavior_id) REFERENCES occurrences(user_id, id, behavior_id) ON DELETE CASCADE,
    CHECK (stopped_at IS NULL OR julianday(stopped_at) >= julianday(started_at))
) STRICT;

CREATE TABLE occurrence_sync_state (
    created_at TEXT NOT NULL,
    last_successful_sync_at TEXT,
    last_sync_behavior_count INTEGER NOT NULL,
    last_sync_created_count INTEGER NOT NULL,
    last_sync_deleted_count INTEGER NOT NULL,
    last_sync_updated_count INTEGER NOT NULL,
    last_synced_local_date TEXT,
    stale INTEGER NOT NULL CHECK (stale IN (0,1)),
    stale_reason TEXT,
    state_version INTEGER NOT NULL,
    synced_through_local_date TEXT,
    timezone TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    CHECK (state_version >= 0)
) STRICT;

CREATE TABLE reminder_deliveries (
    channel TEXT NOT NULL,
    created_at TEXT NOT NULL,
    error TEXT,
    id TEXT PRIMARY KEY NOT NULL,
    import_run_id TEXT,
    imported_intervention_id TEXT,
    occurrence_id TEXT NOT NULL,
    processing_started_at TEXT,
    scheduled_send_at TEXT NOT NULL,
    sent_at TEXT,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, occurrence_id) REFERENCES occurrences(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, import_run_id) REFERENCES behaviorlog_import_runs(user_id, id),
    FOREIGN KEY (user_id, imported_intervention_id) REFERENCES imported_interventions(user_id, id),
    UNIQUE (occurrence_id, channel, scheduled_send_at),
    CHECK (channel IN ('browser_push','email')),
    CHECK (status IN ('pending','sent','failed','cancelled')),
    CHECK ((import_run_id IS NULL) = (imported_intervention_id IS NULL))
) STRICT;

CREATE TABLE behaviorlog_import_runs (
    accepted_preview_fingerprint TEXT,
    accepted_preview_run_id TEXT,
    bundle_fingerprint TEXT,
    bundle_format TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    dry_run_summary TEXT NOT NULL CHECK (dry_run_summary IS NULL OR json_valid(dry_run_summary)),
    failure_message TEXT,
    id TEXT PRIMARY KEY NOT NULL,
    import_mode TEXT NOT NULL,
    manifest_sha256 TEXT,
    privacy_redaction_level TEXT,
    producer_name TEXT,
    producer_version TEXT,
    schema_version TEXT,
    started_at TEXT NOT NULL,
    status TEXT NOT NULL,
    subject_id_strategy TEXT,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, accepted_preview_run_id) REFERENCES behaviorlog_import_runs(user_id, id),
    CHECK (import_mode IN ('preview_only','create_missing_only','merge_preview','merge_by_user_approved_plan','restore_preview','restore_apply')),
    CHECK (status IN ('previewed','applied','failed','cancelled'))
) STRICT;

CREATE TABLE behaviorlog_import_record_mappings (
    created_at TEXT NOT NULL,
    external_id TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    import_run_id TEXT NOT NULL,
    local_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, import_run_id) REFERENCES behaviorlog_import_runs(user_id, id) ON DELETE CASCADE,
    UNIQUE (import_run_id, record_type, external_id),
    CHECK (record_type IN ('behavior','schedule','occurrence','status_event','behavior_definition_event','time_session','note','intervention'))
) STRICT;

CREATE TABLE imported_notes (
    body_markdown TEXT NOT NULL,
    created_at TEXT NOT NULL,
    external_id TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    import_run_id TEXT NOT NULL,
    imported_created_at TEXT NOT NULL,
    imported_updated_at TEXT,
    metadata TEXT NOT NULL CHECK (metadata IS NULL OR json_valid(metadata)),
    note_role TEXT NOT NULL,
    sensitivity TEXT,
    source_capture_method TEXT NOT NULL,
    source_confidence TEXT NOT NULL,
    source_original_id TEXT,
    target_external_id TEXT NOT NULL,
    target_local_id TEXT,
    target_type TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, import_run_id) REFERENCES behaviorlog_import_runs(user_id, id) ON DELETE CASCADE,
    UNIQUE (import_run_id, external_id),
    CHECK (target_type IN ('behavior','occurrence','status_event','review')),
    CHECK (note_role IN ('user','imported','system','ai_generated')),
    CHECK (sensitivity IS NULL OR sensitivity IN ('low','medium','high','restricted'))
) STRICT;

CREATE TABLE imported_interventions (
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
    CHECK (channel IN ('browser_push','email')),
    CHECK (delivery_status IN ('pending','sent','failed','cancelled'))
) STRICT;

CREATE UNIQUE INDEX local_profile_singleton ON profiles ((1));
CREATE UNIQUE INDEX slot_parent_start ON behavior_schedule_slots (behavior_schedule_id, start_time) WHERE behavior_schedule_id IS NOT NULL;
CREATE UNIQUE INDEX slot_legacy_start ON behavior_schedule_slots (behavior_id, start_time) WHERE behavior_schedule_id IS NULL;
CREATE UNIQUE INDEX one_running_session ON occurrence_time_sessions (user_id, occurrence_id) WHERE stopped_at IS NULL;
CREATE INDEX occurrences_owner_date ON occurrences (user_id, local_date, scheduled_for, id);
CREATE INDEX status_history_order ON occurrence_status_events (user_id, occurrence_id, recorded_at, created_at, id);
CREATE INDEX time_history_order ON occurrence_time_sessions (user_id, started_at, id);
CREATE INDEX definition_history_order ON behavior_definition_events (user_id, behavior_id, recorded_at, id);
CREATE INDEX configuration_history_order ON behavior_configuration_events (user_id, behavior_id, effective_at, recorded_at, id);
CREATE TABLE behavior_revisions (
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    behavior_id TEXT PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    FOREIGN KEY (user_id, behavior_id) REFERENCES behaviors(user_id, id) ON DELETE CASCADE
) STRICT;
CREATE TABLE native_reminder_state (
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    id TEXT PRIMARY KEY NOT NULL,
    occurrence_id TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    fire_at TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned','scheduled','cancelled','failed','delivered')),
    error TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, id),
    UNIQUE (occurrence_id, fire_at),
    FOREIGN KEY (user_id, occurrence_id) REFERENCES occurrences(user_id, id) ON DELETE CASCADE
) STRICT;
CREATE TABLE mutation_outbox (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    created_at TEXT NOT NULL,
    synced_at TEXT
) STRICT;
CREATE TABLE tombstones (
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    mutation_id TEXT NOT NULL REFERENCES mutation_outbox(mutation_id) DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY (user_id, entity_type, entity_id)
) STRICT;
CREATE TABLE sync_cursors (
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, name)
) STRICT;
CREATE TRIGGER behavior_definition_events_append_only BEFORE UPDATE ON behavior_definition_events BEGIN SELECT RAISE(ABORT, 'History rows are append-only.'); END;
CREATE TRIGGER behavior_configuration_events_append_only BEFORE UPDATE ON behavior_configuration_events BEGIN SELECT RAISE(ABORT, 'History rows are append-only.'); END;
CREATE TRIGGER occurrence_status_events_append_only BEFORE UPDATE ON occurrence_status_events BEGIN SELECT RAISE(ABORT, 'History rows are append-only.'); END;
