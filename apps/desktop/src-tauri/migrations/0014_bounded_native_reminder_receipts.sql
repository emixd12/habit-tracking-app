-- Recovery marker transitions:
-- backup_verified -> cleanup_committed -> compaction_complete -> reopen_verified.
-- An explicit owner deletion choice adds backup_deletion_pending -> backup_deleted;
-- absent a choice retains the backup.
CREATE UNIQUE INDEX mutation_outbox_latest_native_reminder_receipt
ON mutation_outbox(user_id, operation)
WHERE operation IN ('commitNativeReminderPlan', 'recordNativeReminderCoverage');
