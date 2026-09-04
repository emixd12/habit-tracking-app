CREATE TABLE account_sync_baselines (
  local_profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  hosted_user_id TEXT NOT NULL UNIQUE,
  choice TEXT NOT NULL CHECK (choice IN ('import','ignore','hydrate')),
  idempotency_key TEXT NOT NULL UNIQUE,
  local_fingerprint TEXT NOT NULL CHECK (length(local_fingerprint) = 64),
  hosted_fingerprint TEXT NOT NULL CHECK (length(hosted_fingerprint) = 64),
  baseline_fingerprint TEXT NOT NULL CHECK (length(baseline_fingerprint) = 64),
  baseline_json TEXT NOT NULL CHECK (json_valid(baseline_json)),
  backup_path TEXT,
  completed_at TEXT NOT NULL
);
