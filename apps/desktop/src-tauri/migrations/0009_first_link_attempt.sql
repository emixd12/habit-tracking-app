CREATE TABLE account_first_link_attempts (
  local_profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  hosted_user_id TEXT NOT NULL UNIQUE,
  choice TEXT NOT NULL CHECK (choice IN ('import','ignore','hydrate')),
  attempt_id TEXT NOT NULL,
  local_fingerprint TEXT NOT NULL CHECK (length(local_fingerprint) = 64),
  hosted_fingerprint TEXT NOT NULL CHECK (length(hosted_fingerprint) = 64),
  created_at TEXT NOT NULL
);
