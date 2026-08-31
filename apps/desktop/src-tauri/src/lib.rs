mod files;
mod local_store;
mod notifications;
mod storage;
mod updates;

#[cfg(feature = "contract-harness")]
pub fn run_local_store_contract(path: &std::path::Path) -> Result<(), String> {
    local_store::run_contract(path)
}

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};

#[tauri::command]
fn spike_read(database: State<'_, Mutex<Connection>>) -> Result<storage::Snapshot, String> {
    let connection = database.lock().map_err(|_| "SQLite lock is unavailable.")?;
    storage::read(&connection)
}

#[tauri::command]
fn spike_write(
    database: State<'_, Mutex<Connection>>,
    value: String,
    force_rollback: bool,
) -> Result<storage::Snapshot, String> {
    let mut connection = database.lock().map_err(|_| "SQLite lock is unavailable.")?;
    storage::write(&mut connection, &value, force_rollback)
}

pub fn run() {
    // Install the delegate before AppKit finishes launch, including notification launches.
    notifications::initialize();
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            local_store::adopt_previous_identity(&directory).map_err(std::io::Error::other)?;
            let database = storage::open(&directory.join("native-boundary-spike.sqlite3"))
                .map_err(std::io::Error::other)?;
            app.manage(Mutex::new(database));
            let local = local_store::open(&directory.join("cadence.sqlite3"))
                .map_err(std::io::Error::other)?;
            app.manage(local);
            if updates::is_configured(app.handle()) {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            notifications::attach(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spike_read,
            spike_write,
            notifications::native_notifications,
            notifications::native_events,
            local_store::local_store,
            files::save_export,
            updates::read_update_configuration,
            updates::restart_after_update
        ])
        .run(tauri::generate_context!())
        .expect("Cadence could not open its local data");
}
