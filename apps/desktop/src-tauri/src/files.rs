use std::path::Path;

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
