use super::db::{self, error, Result};
use rusqlite::{
    backup::{Backup, StepResult},
    Connection, OpenFlags,
};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const PREVIOUS_IDENTITY: &str = "app.cadence.desktop-spike";
const CURRENT_IDENTITY: &str = "app.cadence.desktop";
const DATABASE: &str = "cadence.sqlite3";

// Startup-only operation. Both paths come from fixed native application identities,
// never from a command argument, archive, or frontend-selected path.
pub(super) fn adopt(directory: &Path) -> Result<()> {
    if directory.file_name().and_then(|name| name.to_str()) != Some(CURRENT_IDENTITY) {
        return Ok(());
    }
    let destination = directory.join(DATABASE);
    if regular_file(&destination)? {
        // An existing final-identity database wins. Never merge or replace it, and never
        // let an empty/corrupt partial file silently receive a newly seeded profile.
        profile_id(&read_only(&destination)?)?;
        return Ok(());
    }
    let previous = directory
        .parent()
        .ok_or("The Cadence application support directory is unavailable.")?
        .join(PREVIOUS_IDENTITY)
        .join(DATABASE);
    if !regular_file(&previous)? {
        let unfinished = fs::read_dir(directory)
            .map_err(|_| "The Cadence application directory could not be inspected.")?
            .any(|entry| {
                entry.map_or(true, |entry| {
                    entry.file_name().to_str().is_some_and(|name| {
                        name.starts_with(".cadence-adoption-") && name.ends_with(".sqlite3")
                    })
                })
            });
        if unfinished {
            return Err("An unfinished Cadence adoption exists but the original database is missing. No new profile was created.".into());
        }
        return Ok(());
    }
    let staged = prepare_copy(&previous, directory)?;
    publish(&staged, &destination)
}

fn regular_file(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err("Cadence database adoption requires regular database files. The original data was retained.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err("The Cadence database could not be inspected. The original data was retained.".into()),
    }
}

fn read_only(path: &Path) -> Result<Connection> {
    let db = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| {
        "The existing Cadence database could not be opened. No new profile was created."
    })?;
    db.busy_timeout(Duration::from_secs(2)).map_err(error)?;
    Ok(db)
}

fn profile_id(db: &Connection) -> Result<String> {
    let (count, id): (i64, Option<String>) = db
        .query_row("SELECT count(*),min(id) FROM profiles", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|_| {
            "The existing Cadence database has no readable profile. No new profile was created."
        })?;
    if count != 1 {
        return Err(
            "The existing Cadence database must contain one profile. No new profile was created."
                .into(),
        );
    }
    let id = id.ok_or("The existing Cadence profile is missing.")?;
    db::valid_id(&id)?;
    Ok(id)
}

fn verify(db: &Connection) -> Result<String> {
    let integrity: String = db
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(error)?;
    if integrity != "ok" {
        return Err("The existing Cadence database failed its integrity check. The original data was retained.".into());
    }
    let violations: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_foreign_key_check)",
            [],
            |row| row.get(0),
        )
        .map_err(error)?;
    if violations {
        return Err("The existing Cadence database has invalid ownership or history references. The original data was retained.".into());
    }
    profile_id(db)
}

struct StagedDatabase {
    path: PathBuf,
    profile_id: String,
}
impl Drop for StagedDatabase {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        for suffix in ["-wal", "-shm", "-journal"] {
            let mut path = self.path.as_os_str().to_os_string();
            path.push(suffix);
            let _ = fs::remove_file(PathBuf::from(path));
        }
    }
}

fn prepare_copy(previous: &Path, directory: &Path) -> Result<StagedDatabase> {
    let source = read_only(previous)?;
    source.execute_batch("BEGIN").map_err(error)?;
    // Establish one read snapshot, including committed WAL pages, before copying.
    let source_profile = verify(&source)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "The system clock is unavailable.")?
        .as_nanos();
    let path = directory.join(format!(
        ".cadence-adoption-{}-{nonce}.sqlite3",
        std::process::id()
    ));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(&path).map_err(|_| {
        "The Cadence adoption staging file could not be created. The original data was retained."
    })?;
    let staged = StagedDatabase {
        path,
        profile_id: source_profile,
    };
    let mut destination = Connection::open(&staged.path).map_err(error)?;
    destination
        .busy_timeout(Duration::from_secs(2))
        .map_err(error)?;
    {
        let backup = Backup::new(&source, &mut destination).map_err(error)?;
        let started = Instant::now();
        loop {
            if started.elapsed() > Duration::from_secs(30) {
                return Err("Cadence database adoption timed out. Close the previous app and try again; the original data was retained.".into());
            }
            match backup.step(256).map_err(error)? {
                StepResult::Done => break,
                StepResult::More => {},
                StepResult::Busy | StepResult::Locked => return Err("The previous Cadence database is busy. Close the previous app and try again; the original data was retained.".into()),
                _ => return Err("Cadence database adoption did not complete. The original data was retained.".into()),
            }
        }
    }
    destination.close().map_err(|(_, failure)| error(failure))?;
    // Apply tracked migrations to the copy only. Source validation above prevents seeding.
    let destination = db::open(&staged.path)?;
    if verify(&destination)? != staged.profile_id {
        return Err("Cadence database adoption did not preserve the local profile.".into());
    }
    // Publish one self-contained database. Never copy a live SQLite main file alone.
    destination
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;")
        .map_err(error)?;
    destination.close().map_err(|(_, failure)| error(failure))?;
    source.close().map_err(|(_, failure)| error(failure))?;
    fs::File::open(&staged.path).and_then(|file| file.sync_all())
        .map_err(|_| "The adopted Cadence database could not be synchronized. The original data was retained.")?;
    Ok(staged)
}

fn publish(staged: &StagedDatabase, destination: &Path) -> Result<()> {
    // A hard link in the same directory atomically publishes the complete file and
    // cannot overwrite a destination created by another launch. Drop removes staging.
    match fs::hard_link(&staged.path, destination) {
        Ok(()) => {}
        Err(failure) if failure.kind() == std::io::ErrorKind::AlreadyExists => {
            regular_file(destination)?;
            if profile_id(&read_only(destination)?)? != staged.profile_id {
                return Err("Another Cadence database appeared during adoption. Neither database was replaced.".into());
            }
            return Ok(());
        }
        Err(_) => return Err(
            "The verified Cadence database could not be published. The original data was retained."
                .into(),
        ),
    }
    fs::File::open(destination.parent().ok_or("The Cadence application directory is unavailable.")?)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "The adopted Cadence database was published but its directory could not be synchronized. The original data was retained.")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    static FIXTURE_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "cadence-adoption-test-{}-{nonce}-{}",
                std::process::id(),
                FIXTURE_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            fs::create_dir_all(root.join(PREVIOUS_IDENTITY)).unwrap();
            fs::create_dir_all(root.join(CURRENT_IDENTITY)).unwrap();
            Self(root)
        }
        fn previous(&self) -> PathBuf {
            self.0.join(PREVIOUS_IDENTITY).join(DATABASE)
        }
        fn directory(&self) -> PathBuf {
            self.0.join(CURRENT_IDENTITY)
        }
        fn destination(&self) -> PathBuf {
            self.directory().join(DATABASE)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn interrupted_adoption_retries_without_publishing_stale_staging() {
        let fixture = Fixture::new();
        let source = db::open(&fixture.previous()).unwrap();
        let staged = prepare_copy(&fixture.previous(), &fixture.directory()).unwrap();
        let orphan = staged.path.clone();
        std::mem::forget(staged); // Simulate a crash after staging but before publication.
        assert!(!fixture.destination().exists());
        source
            .execute(
                "UPDATE profiles SET display_name='Latest committed name'",
                [],
            )
            .unwrap();
        adopt(&fixture.directory()).unwrap();
        let destination = read_only(&fixture.destination()).unwrap();
        assert_eq!(
            db::profile(&destination).unwrap(),
            db::profile(&source).unwrap()
        );
        assert!(orphan.exists());
        assert!(fixture.previous().exists());
        assert_eq!(verify(&destination).unwrap(), profile_id(&source).unwrap());
    }

    #[test]
    fn adoption_refuses_corruption_and_never_replaces_an_existing_database() {
        let fixture = Fixture::new();
        adopt(&fixture.directory()).unwrap();
        assert!(!fixture.destination().exists());
        fs::write(fixture.previous(), b"not a SQLite database").unwrap();
        assert!(adopt(&fixture.directory()).is_err());
        assert!(!fixture.destination().exists());
        fs::remove_file(fixture.previous()).unwrap();
        let source = db::open(&fixture.previous()).unwrap();
        let staged = prepare_copy(&fixture.previous(), &fixture.directory()).unwrap();
        let winner = db::open(&fixture.destination()).unwrap();
        let winner_profile = db::profile(&winner).unwrap();
        assert!(publish(&staged, &fixture.destination()).is_err());
        assert_eq!(db::profile(&winner).unwrap(), winner_profile);
        adopt(&fixture.directory()).unwrap();
        assert_eq!(db::profile(&winner).unwrap(), winner_profile);
        assert_ne!(profile_id(&source).unwrap(), winner_profile.id);
    }

    #[test]
    fn invalid_history_and_partial_destination_fail_without_new_profiles() {
        let fixture = Fixture::new();
        let source = db::open(&fixture.previous()).unwrap();
        source.execute_batch("PRAGMA foreign_keys=OFF; UPDATE categories SET user_id='00000000-0000-4000-a000-000000000099';").unwrap();
        assert!(adopt(&fixture.directory())
            .unwrap_err()
            .contains("references"));
        assert!(!fixture.destination().exists());
        fs::write(fixture.destination(), b"").unwrap();
        assert!(adopt(&fixture.directory()).is_err());
        assert_eq!(fs::metadata(fixture.destination()).unwrap().len(), 0);
    }

    #[test]
    fn orphaned_staging_without_source_cannot_seed_an_empty_profile() {
        let fixture = Fixture::new();
        fs::write(
            fixture
                .directory()
                .join(".cadence-adoption-interrupted.sqlite3"),
            b"recoverable staging",
        )
        .unwrap();
        assert!(adopt(&fixture.directory())
            .unwrap_err()
            .contains("original database is missing"));
        assert!(!fixture.destination().exists());
    }
}
