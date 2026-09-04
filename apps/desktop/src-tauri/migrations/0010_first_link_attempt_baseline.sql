ALTER TABLE account_first_link_attempts ADD COLUMN pre_attempt_baseline_json TEXT
  CHECK (pre_attempt_baseline_json IS NULL OR (length(pre_attempt_baseline_json) <= 67108864 AND json_valid(pre_attempt_baseline_json)));
