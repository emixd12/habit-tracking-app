use super::*;
use rusqlite::{params, Connection};
use serde_json::json;
use std::path::{Path, PathBuf};

fn directory(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "cadence-repair-{label}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&path).unwrap();
    path
}

fn id(value: u64) -> String {
    format!("90000000-0000-4000-a000-{value:012}")
}

fn schema_thirteen(path: &Path, receipts: usize) -> (Connection, String, i64) {
    let mut db = Connection::open(path).unwrap();
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
        .unwrap();
    db::migrate(&mut db, &db::MIGRATIONS[..13]).unwrap();
    db::seed(&mut db).unwrap();
    let profile = db::profile(&db).unwrap().id;
    let digest = "a".repeat(64);
    db.execute(
        "INSERT INTO account_link_metadata VALUES(?1,'hosted-recovery','owner@example.test','2026-09-08T12:00:00Z')",
        [&profile],
    )
    .unwrap();
    db.execute(
        "INSERT INTO account_sync_baselines VALUES(?1,'hosted-recovery','hydrate',?2,?2,?2,?2,'{}',NULL,'2026-09-08T12:00:00Z')",
        params![profile, digest],
    )
    .unwrap();
    let tx = db.transaction().unwrap();
    let payload = json!({"payload":"x".repeat(16 * 1024)}).to_string();
    for index in 0..receipts {
        let operation = if index % 2 == 0 {
            "commitNativeReminderPlan"
        } else {
            "recordNativeReminderCoverage"
        };
        tx.execute(
            "INSERT INTO mutation_outbox(mutation_id,user_id,operation,request_json,result_json,created_at) VALUES(?1,?2,?3,?4,'{}','2026-09-08T12:00:00Z')",
            params![id(index as u64 + 1), profile, operation, payload],
        )
        .unwrap();
    }
    tx.commit().unwrap();
    let high_water = db
        .query_row("SELECT max(sequence) FROM mutation_outbox", [], |row| {
            row.get(0)
        })
        .unwrap();
    (db, profile, high_water)
}

#[test]
fn ten_thousand_reconciliations_retain_two_compact_receipts() {
    let directory = directory("ten-thousand");
    let path = directory.join("cadence.sqlite3");
    let mut db = db::open(&path).unwrap();
    let profile_id = db::profile(&db).unwrap().id;
    let mut revision = reminder::revision(&db, &profile_id).unwrap();
    for cycle in 0..10_000_u64 {
        let plan = Request::CommitNativeReminderPlan {
            profile_id: profile_id.clone(),
            mutation_id: id(cycle * 2 + 1),
            now: "2026-09-08T12:00:00Z".into(),
            expected_revision: revision,
            reminders: vec![],
            cancel_ids: vec![],
        };
        revision = execute(&mut db, plan).unwrap()["revision"]
            .as_i64()
            .unwrap();
        let receipt = Request::RecordNativeReminderCoverage {
            profile_id: profile_id.clone(),
            mutation_id: id(cycle * 2 + 2),
            now: "2026-09-08T12:00:00Z".into(),
            expected_revision: revision,
            coverage: CoverageReceipt {
                status: "complete".into(),
                target_through: "2026-10-08T12:00:00Z".into(),
                scheduled_through: "2026-10-08T12:00:00Z".into(),
                first_unscheduled_at: None,
                expected_count: 0,
                scheduled_count: 0,
                missing_ids: vec![],
                reason: None,
                verified_at: Some("2026-09-08T12:00:00Z".into()),
            },
            observed: vec![],
        };
        revision = execute(&mut db, receipt).unwrap()["revision"]
            .as_i64()
            .unwrap();
    }
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM mutation_outbox WHERE operation IN ('commitNativeReminderPlan','recordNativeReminderCoverage')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap(),
        2
    );
    assert_eq!(reminder::revision(&db, &profile_id).unwrap(), revision);
    let maximum_payload: i64 = db
        .query_row(
            "SELECT max(length(request_json)+length(result_json)) FROM mutation_outbox WHERE operation IN ('commitNativeReminderPlan','recordNativeReminderCoverage')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(maximum_payload < 128);
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn retained_retry_returns_current_state_and_changed_or_stale_writes_fail() {
    let directory = directory("retry");
    let path = directory.join("cadence.sqlite3");
    let mut db = db::open(&path).unwrap();
    let profile_id = db::profile(&db).unwrap().id;
    let revision = reminder::revision(&db, &profile_id).unwrap();
    let plan = Request::CommitNativeReminderPlan {
        profile_id: profile_id.clone(),
        mutation_id: id(1),
        now: "2026-09-08T12:00:00Z".into(),
        expected_revision: revision,
        reminders: vec![],
        cancel_ids: vec![],
    };
    let planned = execute(&mut db, plan.clone()).unwrap();
    assert_eq!(execute(&mut db, plan.clone()).unwrap(), planned);
    let mut changed = plan.clone();
    if let Request::CommitNativeReminderPlan { cancel_ids, .. } = &mut changed {
        cancel_ids.push(id(999));
    }
    assert!(execute(&mut db, changed)
        .unwrap_err()
        .contains("different plan"));
    let mut stale = plan;
    if let Request::CommitNativeReminderPlan { mutation_id, .. } = &mut stale {
        *mutation_id = id(2);
    }
    assert!(execute(&mut db, stale)
        .unwrap_err()
        .contains("Data changed"));
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn migration_compacts_legacy_payloads_and_preserves_sequence_and_backup() {
    let directory = directory("migration");
    let path = directory.join("cadence.sqlite3");
    let (db, profile_id, high_water) = schema_thirteen(&path, 100);
    drop(db);
    let mut reopened = db::open(&path).unwrap();
    assert_eq!(
        db::schema_version(&reopened).unwrap(),
        db::MIGRATIONS.len() as i64
    );
    assert_eq!(
        reminder::revision(&reopened, &profile_id).unwrap(),
        high_water
    );
    assert_eq!(
        reopened
            .query_row(
                "SELECT count(*) FROM mutation_outbox WHERE operation IN ('commitNativeReminderPlan','recordNativeReminderCoverage')",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        2
    );
    let report = recovery::report(&path).unwrap().unwrap();
    assert!(report.backup_path.as_ref().unwrap().is_file());
    assert!(report.after.as_ref().unwrap().database_bytes < report.before.database_bytes);
    let next = execute(
        &mut reopened,
        Request::CommitNativeReminderPlan {
            profile_id,
            mutation_id: id(1000),
            now: "2026-09-08T12:00:00Z".into(),
            expected_revision: high_water,
            reminders: vec![],
            cancel_ids: vec![],
        },
    )
    .unwrap();
    assert_eq!(next["revision"], high_water + 1);
    drop(reopened);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn schema_twelve_applies_the_unchanged_thirteen_prerequisite_before_repair() {
    let directory = directory("schema-twelve");
    let path = directory.join("cadence.sqlite3");
    let mut db = Connection::open(&path).unwrap();
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
        .unwrap();
    db::migrate(&mut db, &db::MIGRATIONS[..12]).unwrap();
    db::seed(&mut db).unwrap();
    drop(db);
    let reopened = db::open(&path).unwrap();
    assert_eq!(
        db::schema_version(&reopened).unwrap(),
        db::MIGRATIONS.len() as i64
    );
    assert!(recovery::report(&path)
        .unwrap()
        .unwrap()
        .backup_path
        .unwrap()
        .is_file());
    drop(reopened);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn every_recovery_transition_resumes_without_another_backup() {
    for point in [
        recovery::InterruptAfter::BackupPending,
        recovery::InterruptAfter::BackupPartial,
        recovery::InterruptAfter::BackupCopied,
        recovery::InterruptAfter::BackupVerified,
        recovery::InterruptAfter::CleanupCommitted,
        recovery::InterruptAfter::CompactionComplete,
        recovery::InterruptAfter::ReopenVerified,
        recovery::InterruptAfter::ReopenFailure,
        recovery::InterruptAfter::RollbackPartial,
        recovery::InterruptAfter::RollbackRenamed,
    ] {
        let directory = directory(&format!("resume-{point:?}"));
        let path = directory.join("cadence.sqlite3");
        let (mut db, _, _) = schema_thirteen(&path, 6);
        assert!(recovery::run_interrupted(&mut db, &path, point).is_err());
        if point == recovery::InterruptAfter::RollbackPartial {
            let interrupted = recovery::report(&path).unwrap().unwrap();
            assert_eq!(interrupted.state, "rollback_pending");
            let backup = interrupted.backup_path.unwrap();
            let rollback = path.with_extension("recovery-rollback.sqlite3");
            let marker = directory.join(".cadence-storage-recovery.json");
            let expected = std::fs::metadata(backup).unwrap().len()
                + std::fs::metadata(rollback).unwrap().len()
                + std::fs::metadata(marker).unwrap().len();
            assert_eq!(interrupted.after.unwrap().recovery_bytes, expected);
        }
        drop(db);
        let reopened = db::open(&path).unwrap();
        assert_eq!(
            db::schema_version(&reopened).unwrap(),
            db::MIGRATIONS.len() as i64
        );
        let report = recovery::report(&path).unwrap().unwrap();
        assert!(report.backup_path.as_ref().unwrap().is_file());
        assert_eq!(
            std::fs::read_dir(directory.join("Backups"))
                .unwrap()
                .filter(|entry| {
                    entry
                        .as_ref()
                        .ok()
                        .and_then(|entry| {
                            entry
                                .path()
                                .extension()
                                .map(|extension| extension == "sqlite3")
                        })
                        .unwrap_or(false)
                })
                .count(),
            1
        );
        drop(reopened);
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[test]
fn cleanup_failure_rolls_back_and_owner_deletion_is_a_separate_transition() {
    let directory = directory("rollback-delete");
    let path = directory.join("cadence.sqlite3");
    let (mut db, profile_id, high_water) = schema_thirteen(&path, 4);
    recovery::fail_next_cleanup();
    assert!(recovery::run(&mut db, &path).is_err());
    assert_eq!(db::schema_version(&db).unwrap(), 13);
    assert_eq!(reminder::revision(&db, &profile_id).unwrap(), high_water);
    recovery::run(&mut db, &path).unwrap();
    let backup = recovery::report(&path)
        .unwrap()
        .unwrap()
        .backup_path
        .unwrap();
    assert!(
        recovery::delete_backup_interrupted(&path, recovery::InterruptAfter::BackupUnlinked)
            .is_err()
    );
    assert!(!backup.exists());
    recovery::run(&mut db, &path).unwrap();
    assert!(recovery::report(&path)
        .unwrap()
        .unwrap()
        .backup_path
        .is_none());
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn interrupted_partial_backup_is_replaced_at_the_tracked_path() {
    let directory = directory("partial-backup");
    let path = directory.join("cadence.sqlite3");
    let (mut db, _, _) = schema_thirteen(&path, 4);
    assert!(
        recovery::run_interrupted(&mut db, &path, recovery::InterruptAfter::BackupPartial).is_err()
    );
    let backups = directory.join("Backups");
    let backup = backups.join(".cadence-protected-storage-recovery.sqlite3");
    let partial = backups.join(".cadence-protected-storage-recovery.sqlite3.partial");
    assert!(partial.is_file());
    let interrupted = recovery::report(&path).unwrap().unwrap();
    assert_eq!(interrupted.state, "backup_pending");
    assert!(interrupted.after.unwrap().recovery_bytes > 0);
    drop(db);
    let reopened = db::open(&path).unwrap();
    assert!(!partial.exists());
    assert_eq!(
        recovery::report(&path).unwrap().unwrap().backup_path,
        Some(backup)
    );
    drop(reopened);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn preexisting_or_replaced_recovery_files_are_preserved() {
    let directory = directory("owned-files");
    let path = directory.join("cadence.sqlite3");
    let (mut db, _, _) = schema_thirteen(&path, 2);
    let backups = directory.join("Backups");
    std::fs::create_dir_all(&backups).unwrap();
    let backup = backups.join(".cadence-protected-storage-recovery.sqlite3");
    std::fs::write(&backup, b"user file before repair").unwrap();
    assert!(recovery::run(&mut db, &path).is_err());
    assert_eq!(std::fs::read(&backup).unwrap(), b"user file before repair");
    assert!(recovery::report(&path).unwrap().is_none());

    std::fs::remove_file(&backup).unwrap();
    recovery::run(&mut db, &path).unwrap();
    #[cfg(unix)]
    let original_identity = {
        use std::os::unix::fs::MetadataExt;
        let metadata = std::fs::metadata(&backup).unwrap();
        (metadata.dev(), metadata.ino())
    };
    std::fs::write(&backup, b"replacement user file").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = std::fs::metadata(&backup).unwrap();
        assert_eq!(original_identity, (metadata.dev(), metadata.ino()));
    }
    assert!(recovery::delete_backup(&path).is_err());
    assert_eq!(std::fs::read(&backup).unwrap(), b"replacement user file");
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn crash_before_staging_identity_is_durable_fails_closed() {
    let directory = directory("unowned-reservation");
    let path = directory.join("cadence.sqlite3");
    let (mut db, _, _) = schema_thirteen(&path, 2);
    assert!(recovery::run_interrupted(
        &mut db,
        &path,
        recovery::InterruptAfter::BackupReservedUntracked
    )
    .is_err());
    let partial = directory
        .join("Backups")
        .join(".cadence-protected-storage-recovery.sqlite3.partial");
    std::fs::write(&partial, b"unknown file after reservation crash").unwrap();
    drop(db);
    assert!(db::open(&path).is_err());
    assert_eq!(
        std::fs::read(&partial).unwrap(),
        b"unknown file after reservation crash"
    );
    let report = recovery::report(&path).unwrap().unwrap();
    assert_eq!(report.state, "backup_pending");
    assert!(report.after.unwrap().recovery_bytes > 0);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn replaced_owned_staging_file_is_preserved_and_not_adopted() {
    let directory = directory("replaced-staging");
    let path = directory.join("cadence.sqlite3");
    let (mut db, _, _) = schema_thirteen(&path, 2);
    assert!(
        recovery::run_interrupted(&mut db, &path, recovery::InterruptAfter::BackupPartial).is_err()
    );
    let partial = directory
        .join("Backups")
        .join(".cadence-protected-storage-recovery.sqlite3.partial");
    std::fs::remove_file(&partial).unwrap();
    std::fs::write(&partial, b"replacement user staging file").unwrap();
    drop(db);
    assert!(db::open(&path).is_err());
    assert_eq!(
        std::fs::read(&partial).unwrap(),
        b"replacement user staging file"
    );
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn every_backup_deletion_transition_resumes_without_touching_other_backups() {
    for point in [
        recovery::InterruptAfter::BackupDeletionPending,
        recovery::InterruptAfter::BackupUnlinked,
        recovery::InterruptAfter::BackupDeleted,
    ] {
        let directory = directory(&format!("delete-{point:?}"));
        let path = directory.join("cadence.sqlite3");
        let (mut db, _, _) = schema_thirteen(&path, 2);
        recovery::run(&mut db, &path).unwrap();
        let user_backup = directory.join("Backups").join("user-created.sqlite3");
        std::fs::write(&user_backup, b"user backup").unwrap();
        assert!(recovery::delete_backup_interrupted(&path, point).is_err());
        recovery::run(&mut db, &path).unwrap();
        let report = recovery::report(&path).unwrap().unwrap();
        assert_eq!(report.state, "backup_deleted");
        assert!(report.backup_path.is_none());
        assert!(user_backup.is_file());
        drop(db);
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[test]
fn insufficient_space_fails_before_backup_or_database_writes() {
    let directory = directory("space");
    let path = directory.join("cadence.sqlite3");
    let (mut db, profile_id, high_water) = schema_thirteen(&path, 4);
    recovery::fail_next_preflight();
    assert!(recovery::run(&mut db, &path)
        .unwrap_err()
        .contains("more free space"));
    assert_eq!(db::schema_version(&db).unwrap(), 13);
    assert_eq!(reminder::revision(&db, &profile_id).unwrap(), high_water);
    assert!(!directory.join("Backups").exists());
    assert!(recovery::report(&path).unwrap().is_none());
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn schema_twelve_low_space_fails_before_the_prerequisite_migration() {
    let directory = directory("schema-twelve-space");
    let path = directory.join("cadence.sqlite3");
    let mut db = Connection::open(&path).unwrap();
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
        .unwrap();
    db::migrate(&mut db, &db::MIGRATIONS[..12]).unwrap();
    db::seed(&mut db).unwrap();
    drop(db);
    recovery::fail_next_preflight();
    assert!(db::open(&path).is_err());
    let unchanged = db::connect(&path).unwrap();
    assert_eq!(db::schema_version(&unchanged).unwrap(), 12);
    drop(unchanged);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn resumed_maintenance_rejects_replaced_or_corrupted_protected_backup() {
    for point in [
        recovery::InterruptAfter::BackupVerified,
        recovery::InterruptAfter::CleanupCommitted,
        recovery::InterruptAfter::CompactionComplete,
    ] {
        for replace in [false, true] {
            let directory = directory(&format!("resume-backup-{point:?}-{replace}"));
            let path = directory.join("cadence.sqlite3");
            let (mut db, _, _) = schema_thirteen(&path, 6);
            assert!(recovery::run_interrupted(&mut db, &path, point).is_err());
            let version = db::schema_version(&db).unwrap();
            let backup = recovery::report(&path)
                .unwrap()
                .unwrap()
                .backup_path
                .unwrap();
            if replace {
                std::fs::rename(&backup, directory.join("original-backup.sqlite3")).unwrap();
            }
            std::fs::write(&backup, b"changed protected backup").unwrap();
            drop(db);
            let live_before = std::fs::read(&path).unwrap();
            let stage_before = recovery::report(&path).unwrap().unwrap().state;
            assert!(db::open(&path).is_err());
            assert_eq!(std::fs::read(&path).unwrap(), live_before);
            assert_eq!(
                recovery::report(&path).unwrap().unwrap().state,
                stage_before
            );
            assert_eq!(std::fs::read(&backup).unwrap(), b"changed protected backup");
            let db = db::connect(&path).unwrap();
            assert_eq!(db::schema_version(&db).unwrap(), version);
            db::validate_backup(&db).unwrap();
            drop(db);
            std::fs::remove_dir_all(directory).unwrap();
        }
    }
}
