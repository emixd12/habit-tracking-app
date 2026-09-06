ALTER TABLE behaviors ADD COLUMN archive_notes TEXT NOT NULL DEFAULT '[]'
CHECK (json_valid(archive_notes) AND json_type(archive_notes) = 'array');
