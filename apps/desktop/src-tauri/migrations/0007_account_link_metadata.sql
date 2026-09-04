CREATE TABLE account_link_metadata (
  local_profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  hosted_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  authenticated_at TEXT NOT NULL
);
