use crate::local_store::LocalStore;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{collections::HashSet, path::Path, sync::Mutex};
use tauri::State;

pub struct CalendarCache(pub Mutex<Connection>);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarCacheRequest {
    account_id: String,
    connection_generation: i64,
    selection_revision: i64,
    start_local_date: String,
    end_local_date: String,
    timezone: String,
    selected_calendar_ids: Vec<String>,
    hidden_calendar_ids: Vec<String>,
    visible: bool,
    show_all_day: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarCachedSnapshot {
    request: CalendarCacheRequest,
    snapshot_json: String,
}

pub fn open(path: &Path) -> Result<CalendarCache, String> {
    let db = Connection::open(path).map_err(error)?;
    #[cfg(unix)]
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|_| "Calendar cache permissions could not be restricted.".to_string())?;
    initialize(&db)?;
    Ok(CalendarCache(Mutex::new(db)))
}

fn initialize(db: &Connection) -> Result<(), String> {
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(error)?;
    db.execute_batch(
        "PRAGMA journal_mode=DELETE;
         PRAGMA secure_delete=ON;
         CREATE TABLE IF NOT EXISTS cache_fence(id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
         INSERT OR IGNORE INTO cache_fence(id,value) VALUES(1,0);
         CREATE TABLE IF NOT EXISTS pending_refresh(
           request_id TEXT PRIMARY KEY, fence INTEGER NOT NULL, account_id TEXT NOT NULL,
           connection_generation INTEGER NOT NULL, selection_revision INTEGER NOT NULL,
           start_local_date TEXT NOT NULL, end_local_date TEXT NOT NULL, timezone TEXT NOT NULL,
           selected_calendar_ids_json TEXT NOT NULL, hidden_calendar_ids_json TEXT NOT NULL,
           visible INTEGER NOT NULL, show_all_day INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS complete_snapshot(
           id INTEGER PRIMARY KEY CHECK(id=1), account_id TEXT NOT NULL,
           connection_generation INTEGER NOT NULL, selection_revision INTEGER NOT NULL,
           start_local_date TEXT NOT NULL, end_local_date TEXT NOT NULL, timezone TEXT NOT NULL,
           selected_calendar_ids_json TEXT NOT NULL, hidden_calendar_ids_json TEXT NOT NULL,
           visible INTEGER NOT NULL, show_all_day INTEGER NOT NULL, snapshot_json TEXT NOT NULL
         );",
    ).map_err(error)
}

#[tauri::command]
pub fn calendar_cache_begin(
    cache: State<'_, CalendarCache>,
    store: State<'_, LocalStore>,
    request: CalendarCacheRequest,
    request_id: String,
) -> Result<(), String> {
    let auth = store.0.lock().map_err(|_| "SQLite lock is unavailable.")?;
    let mut cache = cache
        .0
        .lock()
        .map_err(|_| "Calendar cache lock is unavailable.")?;
    begin(&auth, &mut cache, &request, &request_id)
}

#[tauri::command]
pub fn calendar_cache_read(
    cache: State<'_, CalendarCache>,
    store: State<'_, LocalStore>,
    request: CalendarCacheRequest,
) -> Result<Option<String>, String> {
    let auth = store.0.lock().map_err(|_| "SQLite lock is unavailable.")?;
    let mut cache = cache
        .0
        .lock()
        .map_err(|_| "Calendar cache lock is unavailable.")?;
    read(&auth, &mut cache, &request)
}

#[tauri::command]
pub fn calendar_cache_read_current(
    cache: State<'_, CalendarCache>,
    store: State<'_, LocalStore>,
    account_id: String,
    start_local_date: String,
    end_local_date: String,
    timezone: String,
) -> Result<Option<CalendarCachedSnapshot>, String> {
    let auth = store.0.lock().map_err(|_| "SQLite lock is unavailable.")?;
    let mut cache = cache
        .0
        .lock()
        .map_err(|_| "Calendar cache lock is unavailable.")?;
    read_current(
        &auth,
        &mut cache,
        &account_id,
        &start_local_date,
        &end_local_date,
        &timezone,
    )
}

#[tauri::command]
pub fn calendar_cache_replace(
    cache: State<'_, CalendarCache>,
    store: State<'_, LocalStore>,
    request: CalendarCacheRequest,
    request_id: String,
    snapshot_json: String,
) -> Result<(), String> {
    let auth = store.0.lock().map_err(|_| "SQLite lock is unavailable.")?;
    let mut cache = cache
        .0
        .lock()
        .map_err(|_| "Calendar cache lock is unavailable.")?;
    replace(&auth, &mut cache, &request, &request_id, &snapshot_json)
}

#[tauri::command]
pub fn calendar_cache_clear(cache: State<'_, CalendarCache>) -> Result<(), String> {
    let mut cache = cache
        .0
        .lock()
        .map_err(|_| "Calendar cache lock is unavailable.")?;
    clear(&mut cache)
}

fn account_id(auth: &Connection) -> Result<Option<String>, String> {
    auth.query_row(
        "SELECT hosted_user_id FROM account_link_metadata LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(|_| "Account metadata could not be read.".into())
}

fn require_account(
    auth: &Connection,
    cache: &mut Connection,
    expected: &str,
) -> Result<(), String> {
    if account_id(auth)?.as_deref() == Some(expected) {
        return Ok(());
    }
    clear(cache)?;
    Err("Calendar cache does not match the linked account.".into())
}

fn validate_request(request: &CalendarCacheRequest) -> Result<String, String> {
    let ids: HashSet<&str> = request
        .selected_calendar_ids
        .iter()
        .map(String::as_str)
        .collect();
    let date = |value: &str| {
        value.len() == 10 && value.as_bytes()[4] == b'-' && value.as_bytes()[7] == b'-'
    };
    let hidden: HashSet<&str> = request
        .hidden_calendar_ids
        .iter()
        .map(String::as_str)
        .collect();
    if request.account_id.is_empty()
        || request.account_id.len() > 128
        || request.connection_generation < 1
        || request.selection_revision < 0
        || !date(&request.start_local_date)
        || !date(&request.end_local_date)
        || request.start_local_date > request.end_local_date
        || request.timezone.is_empty()
        || request.timezone.len() > 128
        || request.selected_calendar_ids.is_empty()
        || request.selected_calendar_ids.len() > 32
        || ids.len() != request.selected_calendar_ids.len()
        || hidden.len() != request.hidden_calendar_ids.len()
        || request
            .selected_calendar_ids
            .iter()
            .any(|id| id.is_empty() || id.len() > 1024)
        || request.hidden_calendar_ids.len() > 32
        || request
            .hidden_calendar_ids
            .iter()
            .any(|id| !ids.contains(id.as_str()))
    {
        return Err("Calendar cache request is invalid.".into());
    }
    serde_json::to_string(&request.selected_calendar_ids).map_err(error)
}

fn begin(
    auth: &Connection,
    cache: &mut Connection,
    request: &CalendarCacheRequest,
    request_id: &str,
) -> Result<(), String> {
    let ids = validate_request(request)?;
    if request_id.is_empty() || request_id.len() > 128 {
        return Err("Calendar refresh request is invalid.".into());
    }
    require_account(auth, cache, &request.account_id)?;
    let tx = cache
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(error)?;
    let fence: i64 = tx
        .query_row("SELECT value FROM cache_fence WHERE id=1", [], |row| {
            row.get(0)
        })
        .map_err(error)?;
    tx.execute("DELETE FROM pending_refresh", [])
        .map_err(error)?;
    let hidden = serde_json::to_string(&request.hidden_calendar_ids).map_err(error)?;
    tx.execute("DELETE FROM complete_snapshot WHERE NOT (account_id=?1 AND connection_generation=?2 AND selection_revision=?3 AND start_local_date=?4 AND end_local_date=?5 AND timezone=?6 AND selected_calendar_ids_json=?7 AND hidden_calendar_ids_json=?8 AND visible=?9 AND show_all_day=?10)",
        params![request.account_id,request.connection_generation,request.selection_revision,request.start_local_date,request.end_local_date,request.timezone,ids,hidden,request.visible,request.show_all_day]).map_err(error)?;
    tx.execute("INSERT INTO pending_refresh(request_id,fence,account_id,connection_generation,selection_revision,start_local_date,end_local_date,timezone,selected_calendar_ids_json,hidden_calendar_ids_json,visible,show_all_day) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![request_id,fence,request.account_id,request.connection_generation,request.selection_revision,request.start_local_date,request.end_local_date,request.timezone,ids,hidden,request.visible,request.show_all_day]).map_err(error)?;
    tx.commit().map_err(error)
}

fn read(
    auth: &Connection,
    cache: &mut Connection,
    request: &CalendarCacheRequest,
) -> Result<Option<String>, String> {
    let ids = validate_request(request)?;
    require_account(auth, cache, &request.account_id)?;
    let hidden = serde_json::to_string(&request.hidden_calendar_ids).map_err(error)?;
    cache.query_row("SELECT snapshot_json FROM complete_snapshot WHERE id=1 AND account_id=?1 AND connection_generation=?2 AND selection_revision=?3 AND start_local_date=?4 AND end_local_date=?5 AND timezone=?6 AND selected_calendar_ids_json=?7 AND hidden_calendar_ids_json=?8 AND visible=?9 AND show_all_day=?10",
        params![request.account_id,request.connection_generation,request.selection_revision,request.start_local_date,request.end_local_date,request.timezone,ids,hidden,request.visible,request.show_all_day], |row| row.get(0))
        .optional().map_err(error)
}

fn read_current(
    auth: &Connection,
    cache: &mut Connection,
    account: &str,
    start: &str,
    end: &str,
    timezone: &str,
) -> Result<Option<CalendarCachedSnapshot>, String> {
    require_account(auth, cache, account)?;
    let stored: Option<(i64,i64,String,String,bool,bool,String)> = cache.query_row(
        "SELECT connection_generation,selection_revision,selected_calendar_ids_json,hidden_calendar_ids_json,visible,show_all_day,snapshot_json FROM complete_snapshot WHERE id=1 AND account_id=?1 AND start_local_date=?2 AND end_local_date=?3 AND timezone=?4",
        params![account,start,end,timezone],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?)),
    ).optional().map_err(error)?;
    let Some((
        connection_generation,
        selection_revision,
        selected,
        hidden,
        visible,
        show_all_day,
        snapshot_json,
    )) = stored
    else {
        let has_snapshot: bool = cache.query_row("SELECT EXISTS(SELECT 1 FROM complete_snapshot)", [], |row| row.get(0)).map_err(error)?;
        if has_snapshot { clear(cache)?; }
        return Ok(None);
    };
    let request = CalendarCacheRequest {
        account_id: account.into(),
        connection_generation,
        selection_revision,
        start_local_date: start.into(),
        end_local_date: end.into(),
        timezone: timezone.into(),
        selected_calendar_ids: serde_json::from_str(&selected).map_err(error)?,
        hidden_calendar_ids: serde_json::from_str(&hidden).map_err(error)?,
        visible,
        show_all_day,
    };
    validate_request(&request)?;
    verify_snapshot(&snapshot_json, &request)?;
    Ok(Some(CalendarCachedSnapshot {
        request,
        snapshot_json,
    }))
}

fn replace(
    auth: &Connection,
    cache: &mut Connection,
    request: &CalendarCacheRequest,
    request_id: &str,
    snapshot_json: &str,
) -> Result<(), String> {
    let ids = validate_request(request)?;
    if snapshot_json.len() > 16 * 1024 * 1024 {
        return Err("Calendar snapshot is too large.".into());
    }
    verify_snapshot(snapshot_json, request)?;
    require_account(auth, cache, &request.account_id)?;
    let tx = cache
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(error)?;
    let hidden = serde_json::to_string(&request.hidden_calendar_ids).map_err(error)?;
    let pending: Option<i64> = tx.query_row("SELECT fence FROM pending_refresh WHERE request_id=?1 AND account_id=?2 AND connection_generation=?3 AND selection_revision=?4 AND start_local_date=?5 AND end_local_date=?6 AND timezone=?7 AND selected_calendar_ids_json=?8 AND hidden_calendar_ids_json=?9 AND visible=?10 AND show_all_day=?11",
        params![request_id,request.account_id,request.connection_generation,request.selection_revision,request.start_local_date,request.end_local_date,request.timezone,ids,hidden,request.visible,request.show_all_day], |row| row.get(0)).optional().map_err(error)?;
    let fence: i64 = tx
        .query_row("SELECT value FROM cache_fence WHERE id=1", [], |row| {
            row.get(0)
        })
        .map_err(error)?;
    if pending != Some(fence) {
        return Err("Calendar refresh was cleared or superseded.".into());
    }
    tx.execute("DELETE FROM complete_snapshot", [])
        .map_err(error)?;
    tx.execute("INSERT INTO complete_snapshot(id,account_id,connection_generation,selection_revision,start_local_date,end_local_date,timezone,selected_calendar_ids_json,hidden_calendar_ids_json,visible,show_all_day,snapshot_json) VALUES(1,?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![request.account_id,request.connection_generation,request.selection_revision,request.start_local_date,request.end_local_date,request.timezone,ids,hidden,request.visible,request.show_all_day,snapshot_json]).map_err(error)?;
    tx.execute("DELETE FROM pending_refresh", [])
        .map_err(error)?;
    tx.commit().map_err(error)
}

fn verify_snapshot(snapshot_json: &str, request: &CalendarCacheRequest) -> Result<(), String> {
    let value: Value = serde_json::from_str(snapshot_json)
        .map_err(|_| "Calendar snapshot JSON is invalid.".to_string())?;
    let range = value
        .get("requestedRange")
        .and_then(Value::as_object)
        .ok_or("Calendar snapshot range is missing.")?;
    let selected = range
        .get("selectedCalendarIds")
        .and_then(Value::as_array)
        .and_then(|values| {
            values
                .iter()
                .map(|value| value.as_str().map(str::to_owned))
                .collect::<Option<Vec<_>>>()
        });
    let exact = value.get("schemaVersion").and_then(Value::as_str) == Some("1.0.0")
        && value.get("accountId").and_then(Value::as_str) == Some(request.account_id.as_str())
        && value.get("connectionGeneration").and_then(Value::as_i64)
            == Some(request.connection_generation)
        && value.get("completeness").and_then(Value::as_str) == Some("complete")
        && range.get("startLocalDate").and_then(Value::as_str)
            == Some(request.start_local_date.as_str())
        && range.get("endLocalDate").and_then(Value::as_str)
            == Some(request.end_local_date.as_str())
        && range.get("timezone").and_then(Value::as_str) == Some(request.timezone.as_str())
        && selected.as_ref() == Some(&request.selected_calendar_ids);
    if exact {
        Ok(())
    } else {
        Err("Calendar snapshot does not match the refresh request.".into())
    }
}

fn clear(cache: &mut Connection) -> Result<(), String> {
    let tx = cache
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(error)?;
    tx.execute("UPDATE cache_fence SET value=value+1 WHERE id=1", [])
        .map_err(error)?;
    tx.execute("DELETE FROM pending_refresh", [])
        .map_err(error)?;
    tx.execute("DELETE FROM complete_snapshot", [])
        .map_err(error)?;
    tx.commit().map_err(error)
}

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auth(account: Option<&str>) -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE account_link_metadata(hosted_user_id TEXT);")
            .unwrap();
        if let Some(id) = account {
            db.execute("INSERT INTO account_link_metadata VALUES(?1)", [id])
                .unwrap();
        }
        db
    }
    fn cache() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        db
    }
    fn request() -> CalendarCacheRequest {
        CalendarCacheRequest {
            account_id: "account-a".into(),
            connection_generation: 2,
            selection_revision: 3,
            start_local_date: "2026-09-16".into(),
            end_local_date: "2026-09-18".into(),
            timezone: "America/New_York".into(),
            selected_calendar_ids: vec!["primary".into()],
            hidden_calendar_ids: vec![],
            visible: true,
            show_all_day: true,
        }
    }
    fn snapshot(request: &CalendarCacheRequest) -> String {
        serde_json::json!({"schemaVersion":"1.0.0","accountId":request.account_id,"connectionGeneration":request.connection_generation,"completeness":"complete","requestedRange":{"startLocalDate":request.start_local_date,"endLocalDate":request.end_local_date,"timezone":request.timezone,"selectedCalendarIds":request.selected_calendar_ids}}).to_string()
    }

    #[test]
    fn isolates_accounts_and_exact_ranges() {
        let mut db = cache();
        let linked = auth(Some("account-a"));
        let request = request();
        begin(&linked, &mut db, &request, "one").unwrap();
        replace(&linked, &mut db, &request, "one", &snapshot(&request)).unwrap();
        assert!(read(&linked, &mut db, &request).unwrap().is_some());
        assert_eq!(
            read_current(
                &linked,
                &mut db,
                "account-a",
                "2026-09-16",
                "2026-09-18",
                "America/New_York"
            )
            .unwrap()
            .unwrap()
            .request
            .selection_revision,
            3
        );
        let mut changed = request.clone();
        changed.end_local_date = "2026-09-19".into();
        assert!(read(&linked, &mut db, &changed).unwrap().is_none());
        let mut hidden = request.clone();
        hidden.visible = false;
        assert!(read(&linked, &mut db, &hidden).unwrap().is_none());
        assert!(read(&auth(Some("account-b")), &mut db, &request).is_err());
        assert!(
            db.query_row::<i64, _, _>("SELECT count(*) FROM complete_snapshot", [], |row| row
                .get(0))
                .unwrap()
                == 0
        );
    }

    #[test]
    fn evicts_out_of_range_cache_on_offline_reconciliation() {
        let mut db = cache();
        let linked = auth(Some("account-a"));
        let request = request();
        begin(&linked, &mut db, &request, "one").unwrap();
        replace(&linked, &mut db, &request, "one", &snapshot(&request)).unwrap();
        assert!(read_current(&linked, &mut db, "account-a", "2026-09-17", "2026-09-19", "America/New_York").unwrap().is_none());
        assert!(read(&linked, &mut db, &request).unwrap().is_none());
    }

    #[test]
    fn clear_and_new_requests_fence_late_responses() {
        let mut db = cache();
        let linked = auth(Some("account-a"));
        let request = request();
        begin(&linked, &mut db, &request, "late").unwrap();
        clear(&mut db).unwrap();
        assert!(replace(&linked, &mut db, &request, "late", &snapshot(&request)).is_err());
        begin(&linked, &mut db, &request, "old").unwrap();
        begin(&linked, &mut db, &request, "new").unwrap();
        assert!(replace(&linked, &mut db, &request, "old", &snapshot(&request)).is_err());
        replace(&linked, &mut db, &request, "new", &snapshot(&request)).unwrap();
    }

    #[test]
    fn rejects_partial_or_mismatched_snapshots_without_replacement() {
        let mut db = cache();
        let linked = auth(Some("account-a"));
        let request = request();
        begin(&linked, &mut db, &request, "one").unwrap();
        let partial = snapshot(&request).replace("\"complete\"", "\"incomplete\"");
        assert!(replace(&linked, &mut db, &request, "one", &partial).is_err());
        assert!(read(&linked, &mut db, &request).unwrap().is_none());
    }

    #[cfg(unix)]
    #[test]
    fn creates_an_owner_only_file_separate_from_the_main_store() {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!(
            "cadence-calendar-cache-permissions-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let cache = open(&path).unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        drop(cache);
        std::fs::remove_file(path).unwrap();
    }
}
