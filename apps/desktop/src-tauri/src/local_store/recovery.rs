use super::db::{self, error, Result};
use rusqlite::{params, types::ValueRef, Connection, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};

const PLAN: &str = "commitNativeReminderPlan";
const COVERAGE: &str = "recordNativeReminderCoverage";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Stage {
    BackupPending,
    BackupVerified,
    CleanupCommitted,
    CompactionComplete,
    RollbackPending,
    ReopenVerified,
    BackupDeletionPending,
    BackupDeleted,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
struct FileIdentity {
    device: u64,
    inode: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub database_bytes: u64,
    pub wal_bytes: u64,
    pub shm_bytes: u64,
    pub recovery_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReport {
    pub state: String,
    pub backup_path: Option<PathBuf>,
    pub before: StorageUsage,
    pub after: Option<StorageUsage>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Marker {
    version: u8,
    state: Stage,
    backup_path: PathBuf,
    backup_identity: Option<FileIdentity>,
    rollback_path: PathBuf,
    rollback_identity: Option<FileIdentity>,
    fingerprint: String,
    sequence_high_water: i64,
    before: StorageUsage,
    after: Option<StorageUsage>,
}

fn backup_path(live_path: &Path) -> Result<PathBuf> {
    Ok(live_path
        .parent()
        .ok_or("The database folder is unavailable.")?
        .join("Backups")
        .join(".cadence-protected-storage-recovery.sqlite3"))
}

fn backup_staging_path(backup_path: &Path) -> PathBuf {
    backup_path.with_extension("sqlite3.partial")
}

fn rollback_path(live_path: &Path) -> Result<PathBuf> {
    live_path
        .parent()
        .ok_or("The database folder is unavailable.")?;
    Ok(live_path.with_extension("recovery-rollback.sqlite3"))
}

#[cfg(unix)]
fn file_identity(path: &Path) -> Result<FileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "A storage recovery file is unavailable.".to_string())?;
    Ok(FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(not(unix))]
fn file_identity(_path: &Path) -> Result<FileIdentity> {
    Err("Storage recovery file identity is unavailable.".into())
}

fn require_identity(path: &Path, expected: FileIdentity) -> Result<()> {
    if file_identity(path)? != expected {
        return Err("A storage recovery file was replaced. Cadence preserved it.".into());
    }
    Ok(())
}

fn reserve_owned_file(path: &Path) -> Result<FileIdentity> {
    #[cfg(unix)]
    use std::os::unix::fs::OpenOptionsExt;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let file = options
        .open(path)
        .map_err(|_| "A storage recovery file path is already in use.")?;
    file.sync_all()
        .map_err(|_| "A storage recovery file could not be synchronized.")?;
    file_identity(path)
}

fn remove_owned_file(path: &Path, expected: FileIdentity) -> Result<()> {
    require_identity(path, expected)?;
    std::fs::remove_file(path)
        .map_err(|_| "A storage recovery file could not be replaced.".to_string())
}

fn marker_path(live_path: &Path) -> Result<PathBuf> {
    let directory = live_path
        .parent()
        .ok_or("The database folder is unavailable.")?;
    Ok(directory.join(".cadence-storage-recovery.json"))
}

fn validate_recovery_backup_path(live_path: &Path, backup_path: &Path) -> Result<()> {
    if backup_path != self::backup_path(live_path)? {
        return Err("The storage recovery backup path is invalid.".into());
    }
    Ok(())
}

fn validate_rollback_path(live_path: &Path, path: &Path) -> Result<()> {
    if path != self::rollback_path(live_path)? {
        return Err("The storage recovery rollback path is invalid.".into());
    }
    Ok(())
}

fn sidecar_size(path: &Path, suffix: &str) -> u64 {
    std::fs::metadata(format!("{}{suffix}", path.as_os_str().to_string_lossy()))
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

fn file_set_size(path: &Path) -> u64 {
    std::fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
        + sidecar_size(path, "-wal")
        + sidecar_size(path, "-shm")
        + sidecar_size(path, "-journal")
}

fn file_set_exists(path: &Path) -> bool {
    path.exists()
        || ["-wal", "-shm", "-journal"].iter().any(|suffix| {
            std::fs::symlink_metadata(format!("{}{suffix}", path.as_os_str().to_string_lossy()))
                .is_ok()
        })
}

fn usage(live_path: &Path, recovery_files: &[&Path]) -> StorageUsage {
    let database_bytes = std::fs::metadata(live_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let wal_bytes = sidecar_size(live_path, "-wal");
    let shm_bytes = sidecar_size(live_path, "-shm");
    let recovery_bytes = recovery_files.iter().map(|path| file_set_size(path)).sum();
    StorageUsage {
        database_bytes,
        wal_bytes,
        shm_bytes,
        recovery_bytes,
        total_bytes: database_bytes + wal_bytes + shm_bytes + recovery_bytes,
    }
}

fn recovery_usage(live_path: &Path, marker_file: &Path, marker: &Marker) -> StorageUsage {
    let backup_staging = backup_staging_path(&marker.backup_path);
    usage(
        live_path,
        &[
            marker.backup_path.as_path(),
            backup_staging.as_path(),
            marker.rollback_path.as_path(),
            marker_file,
        ],
    )
}

fn write_marker(path: &Path, marker: &Marker) -> Result<()> {
    #[cfg(unix)]
    use std::os::unix::fs::OpenOptionsExt;
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(marker).map_err(|_| "The recovery marker is invalid.")?;
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(&temporary)
        .map_err(|_| "The recovery marker could not be saved.")?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "The recovery marker could not be saved.")?;
    std::fs::rename(&temporary, path).map_err(|_| "The recovery marker could not be published.")?;
    if let Some(parent) = path.parent() {
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| "The recovery marker folder could not be synchronized.")?;
    }
    Ok(())
}

fn read_marker(path: &Path) -> Result<Option<Marker>> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("The recovery marker could not be read.".into()),
    };
    let marker: Marker = serde_json::from_slice(&bytes)
        .map_err(|_| "The recovery marker is invalid.".to_string())?;
    if marker.version != 1 {
        return Err("The recovery marker needs a newer Cadence version.".into());
    }
    Ok(Some(marker))
}

fn available_bytes(path: &Path) -> Result<u64> {
    let output = Command::new("/bin/df")
        .args(["-Pk"])
        .arg(path)
        .output()
        .map_err(|_| "Storage recovery could not read available disk space.")?;
    if !output.status.success() {
        return Err("Storage recovery could not read available disk space.".into());
    }
    let blocks = std::str::from_utf8(&output.stdout)
        .map_err(|_| "Storage recovery received invalid disk-space data.")?
        .lines()
        .last()
        .and_then(|line| line.split_whitespace().nth(3))
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or("Storage recovery could not parse available disk space.")?;
    blocks
        .checked_mul(1024)
        .ok_or_else(|| "Storage recovery received invalid disk-space data.".into())
}

fn preflight(live_path: &Path, bytes: u64) -> Result<()> {
    #[cfg(test)]
    FAIL_PREFLIGHT.with(|fail| {
        if fail.replace(false) {
            return Err("Cadence needs more free space before storage recovery.".to_string());
        }
        Ok(())
    })?;
    let directory = live_path
        .parent()
        .ok_or("The database folder is unavailable.")?;
    if available_bytes(directory)? < bytes {
        return Err("Cadence needs more free space before storage recovery.".into());
    }
    Ok(())
}

pub(super) fn preflight_initial(live_path: &Path) -> Result<()> {
    let marker = read_marker(&marker_path(live_path)?)?;
    if marker
        .as_ref()
        .is_some_and(|marker| marker.state != Stage::BackupPending || marker.backup_path.is_file())
    {
        return Ok(());
    }
    let live = usage(live_path, &[]);
    preflight(
        live_path,
        live.database_bytes
            .saturating_add(live.wal_bytes)
            .saturating_mul(3),
    )
}

fn digest_part(hasher: &mut Sha256, bytes: &[u8]) {
    hasher.update((bytes.len() as u64).to_be_bytes());
    hasher.update(bytes);
}

fn semantic_fingerprint(db: &Connection) -> Result<String> {
    let mut tables = db
        .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_migrations' ORDER BY name")
        .map_err(error)?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error)?;
    tables.retain(|table| table != "storage_recovery");
    let mut hasher = Sha256::new();
    for table in tables {
        digest_part(&mut hasher, table.as_bytes());
        let escaped = table.replace('"', "\"\"");
        let columns = db
            .prepare(&format!("PRAGMA table_info(\"{escaped}\")"))
            .map_err(error)?
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        for column in &columns {
            digest_part(&mut hasher, column.as_bytes());
        }
        let order = (1..=columns.len())
            .map(|index| index.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let filter = if table == "mutation_outbox" {
            format!(" WHERE operation NOT IN ('{PLAN}','{COVERAGE}')")
        } else {
            String::new()
        };
        let mut statement = db
            .prepare(&format!(
                "SELECT * FROM \"{escaped}\"{filter} ORDER BY {order}"
            ))
            .map_err(error)?;
        let column_count = statement.column_count();
        let mut rows = statement.query([]).map_err(error)?;
        while let Some(row) = rows.next().map_err(error)? {
            hasher.update([0xff]);
            for index in 0..column_count {
                match row.get_ref(index).map_err(error)? {
                    ValueRef::Null => hasher.update([0]),
                    ValueRef::Integer(value) => {
                        hasher.update([1]);
                        hasher.update(value.to_be_bytes());
                    }
                    ValueRef::Real(value) => {
                        hasher.update([2]);
                        hasher.update(value.to_bits().to_be_bytes());
                    }
                    ValueRef::Text(value) => {
                        hasher.update([3]);
                        digest_part(&mut hasher, value);
                    }
                    ValueRef::Blob(value) => {
                        hasher.update([4]);
                        digest_part(&mut hasher, value);
                    }
                }
            }
        }
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn high_water(db: &Connection) -> Result<i64> {
    db.query_row(
        "SELECT coalesce(max(sequence),0) FROM mutation_outbox",
        [],
        |row| row.get(0),
    )
    .map_err(error)
}

fn stage_name(stage: Stage) -> String {
    match stage {
        Stage::BackupPending => "backup_pending",
        Stage::BackupVerified => "backup_verified",
        Stage::CleanupCommitted => "cleanup_committed",
        Stage::CompactionComplete => "compaction_complete",
        Stage::RollbackPending => "rollback_pending",
        Stage::ReopenVerified => "reopen_verified",
        Stage::BackupDeletionPending => "backup_deletion_pending",
        Stage::BackupDeleted => "backup_deleted",
    }
    .into()
}

fn request_hash(request_json: &str) -> String {
    serde_json::from_str::<String>(request_json)
        .ok()
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .unwrap_or_else(|| format!("{:x}", Sha256::digest(request_json.as_bytes())))
}

pub(super) fn compact_receipts(tx: &Transaction<'_>) -> Result<()> {
    #[cfg(test)]
    FAIL_CLEANUP.with(|fail| {
        if fail.replace(false) {
            return Err("injected cleanup failure".to_string());
        }
        Ok(())
    })?;
    let retained = {
        let mut statement = tx
            .prepare(&format!(
                "SELECT sequence,mutation_id,user_id,operation,request_json,created_at \
                 FROM mutation_outbox WHERE operation IN ('{PLAN}','{COVERAGE}') \
                 AND sequence IN (SELECT max(sequence) FROM mutation_outbox \
                 WHERE operation IN ('{PLAN}','{COVERAGE}') GROUP BY user_id,operation) \
                 ORDER BY sequence"
            ))
            .map_err(error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        rows
    };
    tx.execute(
        &format!("DELETE FROM mutation_outbox WHERE operation IN ('{PLAN}','{COVERAGE}')"),
        [],
    )
    .map_err(error)?;
    for (sequence, mutation_id, user_id, operation, request_json, created_at) in retained {
        tx.execute(
            "INSERT INTO mutation_outbox(sequence,mutation_id,user_id,operation,request_json,result_json,created_at,synced_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?7)",
            params![sequence, mutation_id, user_id, operation, serde_json::to_string(&request_hash(&request_json)).unwrap(), serde_json::json!({"revision":sequence}).to_string(), created_at],
        )
        .map_err(error)?;
    }
    Ok(())
}

#[cfg(test)]
thread_local! {
    static FAIL_CLEANUP: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    static FAIL_PREFLIGHT: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

#[cfg(test)]
pub(super) fn fail_next_cleanup() {
    FAIL_CLEANUP.with(|fail| fail.set(true));
}

#[cfg(test)]
pub(super) fn fail_next_preflight() {
    FAIL_PREFLIGHT.with(|fail| fail.set(true));
}

fn validate_after(db: &Connection, marker: &Marker) -> Result<()> {
    db::validate_backup(db)?;
    if semantic_fingerprint(db)? != marker.fingerprint {
        return Err("Storage recovery changed protected local data.".into());
    }
    let current = high_water(db)?;
    if current != marker.sequence_high_water {
        return Err("Storage recovery changed the mutation sequence high-water mark.".into());
    }
    Ok(())
}

fn reset_owned_file(path: &Path, expected: FileIdentity) -> Result<()> {
    require_identity(path, expected)?;
    let file = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|_| "A storage recovery file could not be prepared.")?;
    file.sync_all()
        .map_err(|_| "A storage recovery file could not be synchronized.".to_string())
}

fn sync_parent(path: &Path) -> Result<()> {
    File::open(
        path.parent()
            .ok_or("The storage recovery folder is unavailable.")?,
    )
    .and_then(|directory| directory.sync_all())
    .map_err(|_| "The storage recovery folder could not be synchronized.".into())
}

fn backup_matches(marker: &Marker) -> bool {
    Connection::open_with_flags(
        &marker.backup_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(error)
    .and_then(|backup| {
        db::validate_backup(&backup)?;
        Ok(semantic_fingerprint(&backup)? == marker.fingerprint
            && high_water(&backup)? == marker.sequence_high_water)
    })
    .unwrap_or(false)
}

fn complete_backup(
    db: &Connection,
    marker_file: &Path,
    marker: &mut Marker,
    point: Option<Interrupt>,
) -> Result<()> {
    std::fs::create_dir_all(
        marker
            .backup_path
            .parent()
            .ok_or("The protected backup folder is unavailable.")?,
    )
    .map_err(|_| "The protected backup folder could not be created.")?;
    let staged = backup_staging_path(&marker.backup_path);
    if marker.backup_path.exists() && staged.exists() {
        return Err("Multiple storage recovery backup files exist. Cadence preserved them.".into());
    }
    if marker.backup_path.exists() {
        let identity = marker
            .backup_identity
            .ok_or("The storage recovery backup is not owned by this repair.")?;
        require_identity(&marker.backup_path, identity)?;
        if backup_matches(marker) {
            return Ok(());
        }
        validate_after(db, marker)?;
        reset_owned_file(&marker.backup_path, identity)?;
        db::online_copy(db, &marker.backup_path)?;
        require_identity(&marker.backup_path, identity)?;
        if !backup_matches(marker) {
            return Err("The storage recovery backup could not be verified.".into());
        }
        return Ok(());
    }
    let identity = if staged.exists() {
        let identity = marker
            .backup_identity
            .ok_or("The storage recovery staging file is not owned by this repair.")?;
        require_identity(&staged, identity)?;
        reset_owned_file(&staged, identity)?;
        identity
    } else {
        if marker.backup_identity.is_some() {
            return Err("The owned storage recovery backup is unavailable.".into());
        }
        let identity = reserve_owned_file(&staged)?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::BackupReservedUntracked)?;
        marker.backup_identity = Some(identity);
        write_marker(marker_file, marker)?;
        identity
    };
    #[cfg(test)]
    if point == Some(InterruptAfter::BackupPartial) {
        std::fs::write(&staged, b"partial backup copy").unwrap();
        interrupted(point, InterruptAfter::BackupPartial)?;
    }
    #[cfg(not(test))]
    let _ = point;
    db::online_copy(db, &staged)?;
    require_identity(&staged, identity)?;
    std::fs::rename(&staged, &marker.backup_path)
        .map_err(|_| "The storage recovery backup could not be published.")?;
    sync_parent(&marker.backup_path)?;
    require_identity(&marker.backup_path, identity)?;
    if !backup_matches(marker) {
        return Err("The storage recovery backup could not be verified.".into());
    }
    Ok(())
}

fn complete_rollback(
    db: &mut Connection,
    live_path: &Path,
    marker_file: &Path,
    marker: &mut Marker,
    point: Option<Interrupt>,
) -> Result<()> {
    let backup_identity = marker
        .backup_identity
        .ok_or("The storage recovery backup has no ownership identity.")?;
    require_identity(&marker.backup_path, backup_identity)?;
    if !backup_matches(marker) {
        return Err("The storage recovery backup could not be verified.".into());
    }
    if !marker.rollback_path.exists() {
        if let Some(identity) = marker.rollback_identity {
            if file_identity(live_path)? != identity {
                return Err("The owned storage recovery rollback file is unavailable.".into());
            }
            validate_after(db, marker)?;
            marker.state = Stage::BackupVerified;
            marker.rollback_identity = None;
            write_marker(marker_file, marker)?;
            return Ok(());
        }
        let identity = reserve_owned_file(&marker.rollback_path)?;
        marker.rollback_identity = Some(identity);
        write_marker(marker_file, marker)?;
    } else {
        let identity = marker
            .rollback_identity
            .ok_or("The storage recovery rollback file is not owned by this repair.")?;
        reset_owned_file(&marker.rollback_path, identity)?;
    }
    let rollback_identity = marker.rollback_identity.unwrap();
    #[cfg(test)]
    if point == Some(InterruptAfter::RollbackPartial) {
        std::fs::write(&marker.rollback_path, b"partial rollback copy").unwrap();
        interrupted(point, InterruptAfter::RollbackPartial)?;
    }
    #[cfg(not(test))]
    let _ = point;
    let source = Connection::open_with_flags(
        &marker.backup_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(error)?;
    db::online_copy(&source, &marker.rollback_path)?;
    require_identity(&marker.rollback_path, rollback_identity)?;
    let placeholder = Connection::open_in_memory().map_err(error)?;
    let old = std::mem::replace(db, placeholder);
    drop(old);
    db::remove_sidecars(live_path);
    std::fs::rename(&marker.rollback_path, live_path)
        .map_err(|_| "The storage recovery rollback could not be published.")?;
    sync_parent(live_path)?;
    *db = db::connect(live_path)?;
    validate_after(db, marker)?;
    #[cfg(test)]
    interrupted(point, InterruptAfter::RollbackRenamed)?;
    marker.state = Stage::BackupVerified;
    marker.rollback_identity = None;
    write_marker(marker_file, marker)
}

fn rollback(
    db: &mut Connection,
    live_path: &Path,
    marker_file: &Path,
    marker: &mut Marker,
    point: Option<Interrupt>,
) -> Result<()> {
    marker.state = Stage::RollbackPending;
    marker.rollback_identity = None;
    write_marker(marker_file, marker)?;
    complete_rollback(db, live_path, marker_file, marker, point)
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum InterruptAfter {
    BackupPending,
    BackupReservedUntracked,
    BackupPartial,
    BackupCopied,
    BackupVerified,
    CleanupCommitted,
    CompactionComplete,
    ReopenVerified,
    BackupDeletionPending,
    BackupUnlinked,
    BackupDeleted,
    ReopenFailure,
    RollbackPartial,
    RollbackRenamed,
}

#[cfg(test)]
fn interrupted(point: Option<InterruptAfter>, expected: InterruptAfter) -> Result<()> {
    if point == Some(expected) {
        Err("injected recovery interruption".into())
    } else {
        Ok(())
    }
}

pub(super) fn run(db: &mut Connection, live_path: &Path) -> Result<()> {
    #[cfg(test)]
    return run_inner(db, live_path, None);
    #[cfg(not(test))]
    run_inner(db, live_path, None)
}

#[cfg(test)]
pub(super) fn run_interrupted(
    db: &mut Connection,
    live_path: &Path,
    point: InterruptAfter,
) -> Result<()> {
    run_inner(db, live_path, Some(point))
}

#[cfg(test)]
type Interrupt = InterruptAfter;
#[cfg(not(test))]
type Interrupt = ();

fn run_inner(db: &mut Connection, live_path: &Path, point: Option<Interrupt>) -> Result<()> {
    #[cfg(not(test))]
    let _ = point;
    let marker_file = marker_path(live_path)?;
    let mut marker = read_marker(&marker_file)?;
    if marker.is_none() && db::schema_version(db)? >= 14 {
        return Ok(());
    }
    if marker.is_none() {
        let before = usage(live_path, &[]);
        let required = before
            .database_bytes
            .saturating_add(before.wal_bytes)
            .saturating_mul(3);
        preflight(live_path, required)?;
        let fingerprint = semantic_fingerprint(db)?;
        let sequence_high_water = high_water(db)?;
        let backup_path = backup_path(live_path)?;
        let rollback_path = rollback_path(live_path)?;
        if [
            backup_path.as_path(),
            backup_staging_path(&backup_path).as_path(),
            rollback_path.as_path(),
        ]
        .iter()
        .any(|path| file_set_exists(path))
        {
            return Err(
                "A storage recovery file path is already in use. Cadence preserved it.".into(),
            );
        }
        marker = Some(Marker {
            version: 1,
            state: Stage::BackupPending,
            backup_path,
            backup_identity: None,
            rollback_path,
            rollback_identity: None,
            fingerprint,
            sequence_high_water,
            before,
            after: None,
        });
        write_marker(&marker_file, marker.as_ref().unwrap())?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::BackupPending)?;
    }
    let mut marker = marker.unwrap();
    validate_recovery_backup_path(live_path, &marker.backup_path)?;
    validate_rollback_path(live_path, &marker.rollback_path)?;
    if marker.state == Stage::RollbackPending {
        complete_rollback(db, live_path, &marker_file, &mut marker, point)?;
    }
    if marker.state == Stage::BackupPending {
        complete_backup(db, &marker_file, &mut marker, point)?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::BackupCopied)?;
        marker.state = Stage::BackupVerified;
        write_marker(&marker_file, &marker)?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::BackupVerified)?;
    }
    if !marker.backup_path.is_file()
        && !matches!(
            marker.state,
            Stage::BackupDeletionPending | Stage::BackupDeleted
        )
    {
        return Err("The protected storage recovery backup is unavailable.".into());
    }
    if matches!(
        marker.state,
        Stage::BackupVerified | Stage::CleanupCommitted | Stage::CompactionComplete
    ) {
        let identity = marker
            .backup_identity
            .ok_or("The storage recovery backup has no ownership identity.")?;
        require_identity(&marker.backup_path, identity)?;
        if !backup_matches(&marker) {
            return Err("The storage recovery backup changed. Cadence preserved it.".into());
        }
    }
    if marker.state == Stage::BackupVerified {
        if let Err(failure) = db::migrate(db, db::MIGRATIONS) {
            return Err(failure);
        }
        if let Err(failure) = validate_after(db, &marker) {
            rollback(db, live_path, &marker_file, &mut marker, point)?;
            return Err(failure);
        }
        marker.state = Stage::CleanupCommitted;
        write_marker(&marker_file, &marker)?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::CleanupCommitted)?;
    }
    if marker.state == Stage::CleanupCommitted {
        let live = usage(live_path, &[]);
        preflight(
            live_path,
            live.database_bytes
                .saturating_add(live.wal_bytes)
                .saturating_mul(2),
        )?;
        let compact = db.execute_batch(
            "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
        );
        if let Err(failure) = compact
            .map_err(error)
            .and_then(|_| validate_after(db, &marker))
        {
            rollback(db, live_path, &marker_file, &mut marker, point)?;
            return Err(failure);
        }
        marker.state = Stage::CompactionComplete;
        write_marker(&marker_file, &marker)?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::CompactionComplete)?;
    }
    if marker.state == Stage::CompactionComplete {
        #[cfg(test)]
        if matches!(
            point,
            Some(
                InterruptAfter::ReopenFailure
                    | InterruptAfter::RollbackPartial
                    | InterruptAfter::RollbackRenamed
            )
        ) {
            rollback(db, live_path, &marker_file, &mut marker, point)?;
            return Err("injected reopen failure".into());
        }
        let placeholder = Connection::open_in_memory().map_err(error)?;
        let old = std::mem::replace(db, placeholder);
        drop(old);
        let reopened = db::connect(live_path).and_then(|candidate| {
            validate_after(&candidate, &marker)?;
            Ok(candidate)
        });
        match reopened {
            Ok(reopened) => *db = reopened,
            Err(failure) => {
                rollback(db, live_path, &marker_file, &mut marker, point)?;
                return Err(failure);
            }
        }
        marker.state = Stage::ReopenVerified;
        write_marker(&marker_file, &marker)?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::ReopenVerified)?;
    }
    if marker.state == Stage::ReopenVerified {
        for _ in 0..3 {
            let after = recovery_usage(live_path, &marker_file, &marker);
            if marker.after.as_ref() == Some(&after) {
                break;
            }
            marker.after = Some(after);
            write_marker(&marker_file, &marker)?;
        }
    }
    if marker.state == Stage::BackupDeletionPending {
        if marker.backup_path.exists() {
            let identity = marker
                .backup_identity
                .ok_or("The storage recovery backup has no ownership identity.")?;
            require_identity(&marker.backup_path, identity)?;
            if !backup_matches(&marker) {
                return Err("The storage recovery backup changed. Cadence preserved it.".into());
            }
            remove_owned_file(&marker.backup_path, identity)?;
        }
        marker.state = Stage::BackupDeleted;
        for _ in 0..3 {
            let after = recovery_usage(live_path, &marker_file, &marker);
            if marker.after.as_ref() == Some(&after) {
                break;
            }
            marker.after = Some(after);
            write_marker(&marker_file, &marker)?;
        }
    }
    Ok(())
}

pub fn report(live_path: &Path) -> Result<Option<RecoveryReport>> {
    let marker_file = marker_path(live_path)?;
    let marker = read_marker(&marker_file)?;
    if let Some(marker) = &marker {
        validate_recovery_backup_path(live_path, &marker.backup_path)?;
    }
    Ok(marker.map(|marker| {
        let current = recovery_usage(live_path, &marker_file, &marker);
        RecoveryReport {
            state: stage_name(marker.state),
            backup_path: (marker.state != Stage::BackupDeleted)
                .then_some(marker.backup_path.clone()),
            before: marker.before.clone(),
            after: Some(current),
        }
    }))
}

pub(super) fn delete_backup(live_path: &Path) -> Result<RecoveryReport> {
    delete_backup_inner(live_path, None)
}

#[cfg(test)]
pub(super) fn delete_backup_interrupted(
    live_path: &Path,
    point: InterruptAfter,
) -> Result<RecoveryReport> {
    delete_backup_inner(live_path, Some(point))
}

fn delete_backup_inner(live_path: &Path, point: Option<Interrupt>) -> Result<RecoveryReport> {
    #[cfg(not(test))]
    let _ = point;
    let marker_file = marker_path(live_path)?;
    let mut marker = read_marker(&marker_file)?.ok_or("Storage recovery has not run.")?;
    validate_recovery_backup_path(live_path, &marker.backup_path)?;
    if !matches!(
        marker.state,
        Stage::ReopenVerified | Stage::BackupDeletionPending
    ) {
        return Err("Storage recovery must verify reopen before deleting its backup.".into());
    }
    if marker.state == Stage::ReopenVerified {
        let identity = marker
            .backup_identity
            .ok_or("The storage recovery backup has no ownership identity.")?;
        require_identity(&marker.backup_path, identity)?;
        if !backup_matches(&marker) {
            return Err("The storage recovery backup could not be verified.".into());
        }
        marker.state = Stage::BackupDeletionPending;
        write_marker(&marker_file, &marker)?;
        #[cfg(test)]
        interrupted(point, InterruptAfter::BackupDeletionPending)?;
    }
    if marker.backup_path.exists() {
        let identity = marker
            .backup_identity
            .ok_or("The storage recovery backup has no ownership identity.")?;
        require_identity(&marker.backup_path, identity)?;
        if !backup_matches(&marker) {
            return Err("The storage recovery backup changed. Cadence preserved it.".into());
        }
        remove_owned_file(&marker.backup_path, identity)?;
    }
    #[cfg(test)]
    interrupted(point, InterruptAfter::BackupUnlinked)?;
    marker.state = Stage::BackupDeleted;
    for _ in 0..3 {
        let after = recovery_usage(live_path, &marker_file, &marker);
        if marker.after.as_ref() == Some(&after) {
            break;
        }
        marker.after = Some(after);
        write_marker(&marker_file, &marker)?;
    }
    #[cfg(test)]
    interrupted(point, InterruptAfter::BackupDeleted)?;
    Ok(RecoveryReport {
        state: stage_name(marker.state),
        backup_path: None,
        before: marker.before,
        after: marker.after,
    })
}
