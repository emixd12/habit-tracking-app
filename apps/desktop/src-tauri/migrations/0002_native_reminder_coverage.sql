CREATE TABLE native_reminder_coverage (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('complete','limited','unverified')),
    target_through TEXT NOT NULL,
    scheduled_through TEXT NOT NULL,
    first_unscheduled_at TEXT,
    expected_count INTEGER NOT NULL CHECK (expected_count >= 0),
    scheduled_count INTEGER NOT NULL CHECK (scheduled_count >= 0 AND scheduled_count <= expected_count),
    missing_ids TEXT NOT NULL CHECK (json_valid(missing_ids) AND json_type(missing_ids)='array'),
    reason TEXT,
    verified_at TEXT,
    updated_at TEXT NOT NULL,
    dataset_revision INTEGER NOT NULL CHECK (dataset_revision >= 0),
    CHECK ((status='unverified' AND verified_at IS NULL) OR (status IN ('complete','limited') AND verified_at IS NOT NULL))
) STRICT;
