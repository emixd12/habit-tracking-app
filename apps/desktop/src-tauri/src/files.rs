use crate::local_store::{is_local_mode, require_local_mode, LocalStore};
use std::path::Path;
use tauri::Manager;

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
fn validate(filename: &str, bytes: &[u8]) -> Result<(), String> {
    if filename.is_empty()
        || filename.len() > 160
        || filename.starts_with('.')
        || !filename
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
        || !["jsonl", "csv", "json", "md", "zip"].contains(
            &Path::new(filename)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or(""),
        )
    {
        return Err("Choose a supported Cadence export filename.".into());
    }
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(
            "This export exceeds the local 64 MiB file limit. Choose a shorter date range.".into(),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn save_export(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    validate(&filename, &bytes)?;
    let (sender, receiver) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(choose_path(&filename));
    })
    .map_err(|_| "The native save dialog could not open.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = receiver
            .recv()
            .map_err(|_| "The native save dialog did not return.")??;
        let Some(path) = path else { return Ok(false) };
        write_export(&path, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(|_| "The export file task failed.")?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDatabaseInfo {
    path: String,
    local_mode: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectResult {
    path: String,
    profile_id: String,
    backup_path: Option<String>,
}

fn database_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "The Application Support folder is unavailable.")?
        .join("cadence.sqlite3"))
}

#[tauri::command]
pub fn local_database_info(
    app: tauri::AppHandle,
    store: tauri::State<'_, LocalStore>,
) -> Result<LocalDatabaseInfo, String> {
    let db = store.0.lock().map_err(|_| "SQLite lock is unavailable.")?;
    Ok(LocalDatabaseInfo {
        path: database_path(&app)?.to_string_lossy().into_owned(),
        local_mode: is_local_mode(&db)?,
    })
}

#[tauri::command]
pub async fn reveal_local_database(app: tauri::AppHandle) -> Result<(), String> {
    let path = database_path(&app)?;
    let (sender, receiver) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(reveal_path(&path));
    })
    .map_err(|_| "Finder could not be opened.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv()
            .map_err(|_| "Finder did not return a result.".to_string())?
    })
    .await
    .map_err(|_| "The Finder task failed.".to_string())?
}

#[tauri::command]
pub async fn backup_local_database(app: tauri::AppHandle) -> Result<bool, String> {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "The system clock is unavailable.")?
        .as_secs();
    let filename = format!("cadence-backup-{seconds}");
    let (sender, receiver) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(choose_database_path(&filename, false));
    })
    .map_err(|_| "The native backup dialog could not open.")?;
    let live = database_path(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let destination = receiver
            .recv()
            .map_err(|_| "The native backup dialog did not return.")??;
        let Some(destination) = destination else {
            return Ok(false);
        };
        let state = handle.state::<LocalStore>();
        crate::local_store::backup_database(state.inner(), &live, &destination)?;
        Ok(true)
    })
    .await
    .map_err(|_| "The backup task failed.".to_string())?
}

#[tauri::command]
pub async fn create_protected_local_backup(app: tauri::AppHandle) -> Result<String, String> {
    let live = database_path(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<LocalStore>();
        crate::local_store::protected_backup_database(state.inner(), &live)
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|_| "The protected backup task failed.".to_string())?
}

#[tauri::command]
pub async fn disconnect_keep_local_copy(app: tauri::AppHandle) -> Result<DisconnectResult, String> {
    let live = database_path(&app)?;
    let handle = app.clone();
    let profile_id = tauri::async_runtime::spawn_blocking(move || {
        crate::local_store::disconnect_keep_local_copy(handle.state::<LocalStore>().inner())
    })
    .await
    .map_err(|_| "The account disconnect task failed.".to_string())??;
    Ok(DisconnectResult {
        path: live.to_string_lossy().into_owned(),
        profile_id,
        backup_path: None,
    })
}

#[tauri::command]
pub async fn disconnect_remove_account_data(
    app: tauri::AppHandle,
) -> Result<DisconnectResult, String> {
    let live = database_path(&app)?;
    let task_path = live.clone();
    let handle = app.clone();
    let (backup, profile_id) = tauri::async_runtime::spawn_blocking(move || {
        crate::local_store::disconnect_remove_account_data(
            handle.state::<LocalStore>().inner(),
            &task_path,
        )
    })
    .await
    .map_err(|_| "The account disconnect task failed.".to_string())??;
    Ok(DisconnectResult {
        path: live.to_string_lossy().into_owned(),
        profile_id,
        backup_path: Some(backup.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub async fn restore_local_database(
    app: tauri::AppHandle,
    confirmation: String,
) -> Result<Option<String>, String> {
    if confirmation != "RESTORE" {
        return Err("Type RESTORE to confirm replacement of local data.".into());
    }
    {
        let store = app.state::<LocalStore>();
        let db = store.0.lock().map_err(|_| "SQLite lock is unavailable.")?;
        require_local_mode(&db)?;
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(choose_database_path("", true));
    })
    .map_err(|_| "The native restore dialog could not open.")?;
    let live = database_path(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let source = receiver
            .recv()
            .map_err(|_| "The native restore dialog did not return.")??;
        let Some(source) = source else {
            return Ok(None);
        };
        let state = handle.state::<LocalStore>();
        let protected = crate::local_store::restore_database(state.inner(), &live, &source)?;
        Ok(Some(protected.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| "The restore task failed.".to_string())?
}

#[cfg(test)]
mod account_mode_tests {
    use super::*;

    #[test]
    fn database_info_mode_follows_account_metadata() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE account_link_metadata(local_profile_id TEXT PRIMARY KEY); INSERT INTO account_link_metadata VALUES('local-profile');").unwrap();
        assert!(!is_local_mode(&db).unwrap());
        db.execute("DELETE FROM account_link_metadata", []).unwrap();
        assert!(is_local_mode(&db).unwrap());
    }

    #[test]
    fn restore_guard_rejects_linked_mode_before_file_work() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE account_link_metadata(local_profile_id TEXT PRIMARY KEY); INSERT INTO account_link_metadata VALUES('local-profile');").unwrap();
        assert_eq!(
            require_local_mode(&db).unwrap_err(),
            "Disconnect the account before restoring a database."
        );
        db.execute("DELETE FROM account_link_metadata", []).unwrap();
        require_local_mode(&db).unwrap();
    }

    #[test]
    fn restore_rechecks_account_mode_after_the_picker_boundary() {
        let directory =
            std::env::temp_dir().join(format!("cadence-restore-mode-race-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        let live = directory.join("cadence.sqlite3");
        let backup = directory.join("backup.sqlite3");
        let store = crate::local_store::open(&live).unwrap();
        crate::local_store::backup_database(&store, &live, &backup).unwrap();
        {
            let db = store.0.lock().unwrap();
            let profile: String = db
                .query_row("SELECT id FROM profiles", [], |row| row.get(0))
                .unwrap();
            db.execute("INSERT INTO account_link_metadata VALUES(?1,'hosted-one',NULL,'2026-09-01T00:00:00Z')", [profile]).unwrap();
        }
        assert_eq!(
            crate::local_store::restore_database(&store, &live, &backup).unwrap_err(),
            "Disconnect the account before restoring a database."
        );
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg(target_os = "macos")]
fn choose_database_path(
    filename: &str,
    restore: bool,
) -> Result<Option<std::path::PathBuf>, String> {
    use std::ffi::{c_char, CStr, CString};
    use std::os::unix::ffi::OsStrExt;
    extern "C" {
        fn cadence_choose_database_backup_path(filename: *const c_char) -> *mut c_char;
        fn cadence_choose_database_restore_path() -> *mut c_char;
        fn cadence_free_export_path(path: *mut c_char);
    }
    let pointer = if restore {
        unsafe { cadence_choose_database_restore_path() }
    } else {
        let value = CString::new(filename).map_err(|_| "Invalid backup filename.")?;
        unsafe { cadence_choose_database_backup_path(value.as_ptr()) }
    };
    if pointer.is_null() {
        return Ok(None);
    }
    let path =
        unsafe { std::ffi::OsStr::from_bytes(CStr::from_ptr(pointer).to_bytes()).to_owned() };
    unsafe { cadence_free_export_path(pointer) };
    Ok(Some(path.into()))
}
#[cfg(not(target_os = "macos"))]
fn choose_database_path(_: &str, _: bool) -> Result<Option<std::path::PathBuf>, String> {
    Err("Local database dialogs require macOS.".into())
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), String> {
    use std::ffi::{c_char, CString};
    use std::os::unix::ffi::OsStrExt;
    extern "C" {
        fn cadence_reveal_database(path: *const c_char) -> bool;
    }
    let path =
        CString::new(path.as_os_str().as_bytes()).map_err(|_| "The database path is invalid.")?;
    if unsafe { cadence_reveal_database(path.as_ptr()) } {
        Ok(())
    } else {
        Err("Finder could not reveal the database.".into())
    }
}
#[cfg(not(target_os = "macos"))]
fn reveal_path(_: &Path) -> Result<(), String> {
    Err("Finder reveal requires macOS.".into())
}

#[cfg(target_os = "macos")]
fn choose_path(filename: &str) -> Result<Option<std::path::PathBuf>, String> {
    use std::ffi::{c_char, CStr, CString};
    use std::os::unix::ffi::OsStrExt;
    extern "C" {
        fn cadence_choose_export_path(filename: *const c_char) -> *mut c_char;
        fn cadence_free_export_path(path: *mut c_char);
    }
    let filename = CString::new(filename).map_err(|_| "Invalid export filename.")?;
    let pointer = unsafe { cadence_choose_export_path(filename.as_ptr()) };
    if pointer.is_null() {
        return Ok(None);
    }
    let path =
        unsafe { std::ffi::OsStr::from_bytes(CStr::from_ptr(pointer).to_bytes()).to_owned() };
    unsafe { cadence_free_export_path(pointer) };
    Ok(Some(path.into()))
}
#[cfg(not(target_os = "macos"))]
fn choose_path(_: &str) -> Result<Option<std::path::PathBuf>, String> {
    Err("Native export requires macOS.".into())
}

fn write_export(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    #[cfg(unix)]
    use std::os::unix::fs::OpenOptionsExt;
    let parent = path.parent().ok_or("The export folder is unavailable.")?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "The system clock is unavailable.")?
        .as_nanos();
    let temporary = parent.join(format!(
        ".cadence-export-{}-{nonce}.tmp",
        std::process::id()
    ));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(&temporary)
        .map_err(|_| "The export folder could not create a temporary file.")?;
    let result = (|| {
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|_| "The export could not be saved. The previous file was not replaced.")?;
    std::fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "The export was written, but its folder could not be synchronized. Verify the saved file before restoring data.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_rejects_paths_and_replaces_complete_files_only() {
        for name in ["../data.json", "/tmp/data.json", ".hidden.json", "data.exe"] {
            assert!(validate(name, b"data").is_err());
        }
        assert!(validate("cadence.behaviorlog.zip", b"data").is_ok());
        let directory =
            std::env::temp_dir().join(format!("cadence-export-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("backup.json");
        std::fs::write(&path, b"old").unwrap();
        write_export(&path, b"complete new export").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"complete new export");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        assert!(write_export(&directory, b"cannot replace a directory").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"complete new export");
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn directory_sync_failure_reports_the_file_that_was_already_written() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let directory =
            std::env::temp_dir().join(format!("cadence-export-sync-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        // Root bypasses directory permissions, so this fault requires a normal user.
        if std::fs::metadata(&directory).unwrap().uid() == 0 {
            std::fs::remove_dir_all(directory).unwrap();
            return;
        }
        let path = directory.join("backup.json");
        std::fs::write(&path, b"old").unwrap();
        // Write and search permit replacement. Lack of read permission prevents opening
        // the directory for synchronization after the replacement has completed.
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o300)).unwrap();
        let result = write_export(&path, b"complete new export");
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700)).unwrap();
        let message = result.unwrap_err();
        assert!(message.contains("export was written"), "{message}");
        assert!(!message.contains("was not replaced"));
        assert_eq!(std::fs::read(&path).unwrap(), b"complete new export");
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
