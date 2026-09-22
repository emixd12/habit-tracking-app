ALTER TABLE behaviors ADD COLUMN location_text TEXT
  CHECK (location_text IS NULL OR (
    length(trim(location_text)) BETWEEN 1 AND 500
    AND location_text = trim(location_text)
  ));

CREATE TABLE travel_settings (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  base_location_text TEXT,
  mode TEXT,
  navigation_preference TEXT,
  routing_consent_at TEXT,
  onboarding_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (base_location_text IS NULL OR (
    length(trim(base_location_text)) BETWEEN 1 AND 500
    AND base_location_text = trim(base_location_text)
  )),
  CHECK (mode IS NULL OR mode IN ('walking','cycling','transit','driving')),
  CHECK (navigation_preference IS NULL OR navigation_preference IN ('google_maps','apple_maps')),
  CHECK (enabled = 0 OR (mode IS NOT NULL AND routing_consent_at IS NOT NULL)),
  CHECK (routing_consent_at IS NULL OR routing_consent_at <= updated_at),
  CHECK (onboarding_completed_at IS NULL OR onboarding_completed_at <= updated_at)
) STRICT;

CREATE TRIGGER profiles_create_default_travel_settings
AFTER INSERT ON profiles
BEGIN
  INSERT OR IGNORE INTO travel_settings(user_id,created_at,updated_at)
  VALUES(new.id,new.created_at,new.created_at)
  ;
END;

INSERT OR IGNORE INTO travel_settings(user_id,created_at,updated_at)
SELECT id,created_at,created_at FROM profiles;
