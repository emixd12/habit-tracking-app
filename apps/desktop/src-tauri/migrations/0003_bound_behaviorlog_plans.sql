CREATE TABLE behaviorlog_local_previews (
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    preview_run_id TEXT PRIMARY KEY NOT NULL,
    prepared_revision INTEGER NOT NULL CHECK (prepared_revision >= 0),
    preview_fingerprint TEXT NOT NULL CHECK (length(preview_fingerprint)=64),
    local_data_fingerprint TEXT NOT NULL CHECK (length(local_data_fingerprint)=64),
    bundle_fingerprint TEXT NOT NULL CHECK (length(bundle_fingerprint)=64),
    bundle_payload_fingerprint TEXT,
    plan_json TEXT CHECK (plan_json IS NULL OR json_valid(plan_json)),
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    apply_run_id TEXT,
    prepared_at TEXT NOT NULL,
    FOREIGN KEY (user_id, preview_run_id) REFERENCES behaviorlog_import_runs(user_id,id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, apply_run_id) REFERENCES behaviorlog_import_runs(user_id,id)
) STRICT;
CREATE UNIQUE INDEX one_applied_behaviorlog_preview ON behaviorlog_import_runs (user_id,accepted_preview_run_id)
WHERE status='applied' AND import_mode IN ('create_missing_only','merge_by_user_approved_plan','restore_apply');
