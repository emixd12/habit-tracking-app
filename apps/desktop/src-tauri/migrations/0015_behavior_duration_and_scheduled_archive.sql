ALTER TABLE behaviors ADD COLUMN default_duration_minutes INTEGER
CHECK (default_duration_minutes IS NULL OR default_duration_minutes BETWEEN 1 AND 1440);

ALTER TABLE behaviors ADD COLUMN end_date TEXT
CHECK (
  end_date IS NULL OR (
    length(end_date) = 10
    AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND substr(end_date, 1, 4) <> '0000'
    AND date(end_date, '+0 days') = end_date
  )
);

ALTER TABLE behaviors ADD COLUMN auto_archived_at TEXT
CHECK (auto_archived_at IS NULL OR (active = 0 AND archived_at IS NOT NULL));
