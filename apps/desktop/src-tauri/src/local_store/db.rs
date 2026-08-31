use super::rows::{Profile, StoredRow};
use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension,
    TransactionBehavior,
};
use serde_json::{json, Map, Value};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{path::Path, time::Duration};

pub type Result<T> = std::result::Result<T, String>;
pub const READ_LIMIT: usize = 100_000;
pub(super) const MIGRATIONS: &[(i64, &str, &str)] = &[
    (
        1,
        "current_local_model",
        include_str!("../../migrations/0001_current_local_model.sql"),
    ),
    (
        2,
        "native_reminder_coverage",
        include_str!("../../migrations/0002_native_reminder_coverage.sql"),
    ),
    (
        3,
        "bound_behaviorlog_plans",
        include_str!("../../migrations/0003_bound_behaviorlog_plans.sql"),
    ),
    (
        4,
        "status_history_cascade",
        include_str!("../../migrations/0004_status_history_cascade.sql"),
    ),
    (
        5,
        "domain_preview_revision",
        include_str!("../../migrations/0005_domain_preview_revision.sql"),
    ),
    (
        6,
        "passive_intervention_channels",
        include_str!("../../migrations/0006_passive_intervention_channels.sql"),
    ),
];

pub fn open(path: &Path) -> Result<Connection> {
    let mut db = Connection::open(path).map_err(error)?;
    #[cfg(unix)]
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|_| "The local database permissions could not be restricted.")?;
    db.busy_timeout(Duration::from_secs(5)).map_err(error)?;
    db.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(error)?;
    migrate(&mut db, MIGRATIONS)?;
    seed(&mut db)?;
    Ok(db)
}

pub(super) fn migrate(db: &mut Connection, migrations: &[(i64, &str, &str)]) -> Result<()> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(error)?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;").map_err(error)?;
    let latest: i64 = tx
        .query_row(
            "SELECT coalesce(max(version),0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(error)?;
    if latest > migrations.last().map_or(0, |migration| migration.0) {
        return Err("The local database needs a newer Cadence version.".into());
    }
    for (version, name, sql) in migrations {
        let applied: Option<(String, String)> = tx
            .query_row(
                "SELECT name, source FROM schema_migrations WHERE version=?1",
                [version],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(error)?;
        if let Some((old_name, old_sql)) = applied {
            if old_name != *name || old_sql != *sql {
                return Err("An applied SQLite migration differs from this build. The database was not changed.".into());
            }
        } else {
            tx.execute_batch(sql).map_err(error)?;
            tx.execute("INSERT INTO schema_migrations VALUES (?1,?2,?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'))", params![version,name,sql]).map_err(error)?;
        }
    }
    tx.commit().map_err(error)
}

pub(super) fn seed(db: &mut Connection) -> Result<()> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(error)?;
    let exists: bool = tx
        .query_row("SELECT EXISTS(SELECT 1 FROM profiles)", [], |row| {
            row.get(0)
        })
        .map_err(error)?;
    if !exists {
        let now: String = tx
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |row| {
                row.get(0)
            })
            .map_err(error)?;
        let id = uuid(&tx)?;
        tx.execute("INSERT INTO profiles (id,email,display_name,timezone,created_at,updated_at) VALUES (?1,'',NULL,'America/New_York',?2,?2)", params![id,now]).map_err(error)?;
        for (order, name) in [
            "Medical",
            "Grooming",
            "Fitness",
            "Food / Drink",
            "Home",
            "Measurements",
            "Admin",
            "Other",
        ]
        .iter()
        .enumerate()
        {
            tx.execute("INSERT INTO categories (id,user_id,name,sort_order,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)", params![uuid(&tx)?,id,name,order as i64,now]).map_err(error)?;
        }
        tx.execute("INSERT INTO occurrence_sync_state (user_id,timezone,last_synced_local_date,synced_through_local_date,last_successful_sync_at,stale,stale_reason,last_sync_behavior_count,last_sync_created_count,last_sync_updated_count,last_sync_deleted_count,state_version,created_at,updated_at) VALUES (?1,'America/New_York',NULL,NULL,NULL,1,'never_synced',0,0,0,0,0,?2,?2)", params![id,now]).map_err(error)?;
        tx.execute("INSERT INTO mutation_outbox (mutation_id,user_id,operation,request_json,result_json,created_at) VALUES (?1,?2,'initializeProfile','{}',?3,?4)", params![uuid(&tx)?,id,json!({"profileId":id}).to_string(),now]).map_err(error)?;
    }
    tx.commit().map_err(error)
}

fn uuid(db: &Connection) -> Result<String> {
    db.query_row("SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))", [], |row| row.get(0)).map_err(error)
}

pub fn profile(db: &Connection) -> Result<Profile> {
    read::<Profile>(db, "SELECT * FROM profiles", &[])?
        .into_iter()
        .next()
        .ok_or_else(|| "Local profile is unavailable.".into())
}

pub fn owner(db: &Connection, profile_id: &str) -> Result<()> {
    valid_id(profile_id)?;
    if profile(db)?.id != profile_id {
        return Err("The operation does not belong to the local profile.".into());
    }
    Ok(())
}

pub fn read<T: StoredRow>(db: &Connection, sql: &str, values: &[SqlValue]) -> Result<Vec<T>> {
    let mut statement = db.prepare(sql).map_err(error)?;
    let columns: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();
    let mut cursor = statement.query(params_from_iter(values)).map_err(error)?;
    let mut output = Vec::new();
    while let Some(row) = cursor.next().map_err(error)? {
        if output.len() == READ_LIMIT {
            return Err(
                "The local read exceeds 100,000 rows; no partial result was returned.".into(),
            );
        }
        let mut object = Map::new();
        for (index, name) in columns.iter().enumerate() {
            let raw: SqlValue = row.get(index).map_err(error)?;
            let value = match raw {
                SqlValue::Null => Value::Null,
                SqlValue::Integer(number) if T::BOOL_COLUMNS.contains(&name.as_str()) => {
                    Value::Bool(number != 0)
                }
                SqlValue::Integer(number) => json!(number),
                SqlValue::Text(text) if T::JSON_COLUMNS.contains(&name.as_str()) => {
                    serde_json::from_str(&text).map_err(|_| "Stored JSON is invalid.")?
                }
                SqlValue::Text(text) => Value::String(text),
                _ => return Err("A stored row has an unsupported field type.".into()),
            };
            object.insert(name.clone(), value);
        }
        output.push(
            serde_json::from_value(Value::Object(object))
                .map_err(|_| "A stored row does not match the current model.")?,
        );
    }
    Ok(output)
}

pub fn owned<T: StoredRow>(db: &Connection, profile_id: &str) -> Result<Vec<T>> {
    read(
        db,
        &format!("SELECT * FROM {} WHERE user_id=?1", T::TABLE),
        &[profile_id.to_string().into()],
    )
}

pub fn by_id<T: StoredRow>(db: &Connection, profile_id: &str, id: &str) -> Result<T> {
    valid_id(id)?;
    read(
        db,
        &format!("SELECT * FROM {} WHERE user_id=?1 AND id=?2", T::TABLE),
        &[profile_id.to_string().into(), id.to_string().into()],
    )?
    .into_iter()
    .next()
    .ok_or_else(|| "The owned record was not found.".into())
}

fn fields<T: StoredRow>(row: &T) -> Result<Vec<(String, SqlValue)>> {
    let object = serde_json::to_value(row).map_err(|_| "The row could not be encoded.")?;
    let object = object.as_object().ok_or("A row must be an object.")?;
    let mut fields = Vec::new();
    for (key, value) in object {
        if key == "schedule_range_identity" {
            continue;
        }
        let converted = match value {
            Value::Null => SqlValue::Null,
            Value::Bool(value) => SqlValue::Integer(i64::from(*value)),
            Value::Number(value) => SqlValue::Integer(
                value
                    .as_i64()
                    .ok_or("A stored number must be an integer.")?,
            ),
            Value::String(value) if !T::JSON_COLUMNS.contains(&key.as_str()) => {
                SqlValue::Text(value.clone())
            }
            _ if T::JSON_COLUMNS.contains(&key.as_str()) => SqlValue::Text(value.to_string()),
            _ => return Err("Unexpected row field type.".into()),
        };
        fields.push((key.clone(), converted));
    }
    Ok(fields)
}

pub fn insert<T: StoredRow>(db: &Connection, profile_id: &str, row: &T) -> Result<()> {
    validate_row(profile_id, row)?;
    let fields = fields(row)?;
    let columns = fields
        .iter()
        .map(|(name, _)| name.as_str())
        .collect::<Vec<_>>()
        .join(",");
    let placeholders = vec!["?"; fields.len()].join(",");
    db.execute(
        &format!(
            "INSERT INTO {} ({columns}) VALUES ({placeholders})",
            T::TABLE
        ),
        params_from_iter(fields.into_iter().map(|(_, value)| value)),
    )
    .map_err(error)?;
    Ok(())
}

pub fn update<T: StoredRow>(db: &Connection, profile_id: &str, id: &str, row: &T) -> Result<()> {
    validate_row(profile_id, row)?;
    let object = serde_json::to_value(row).map_err(|_| "The row could not be encoded.")?;
    if object["id"] != id {
        return Err("A mutation cannot change a record ID.".into());
    }
    let fields: Vec<_> = fields(row)?
        .into_iter()
        .filter(|(name, _)| name != "id" && name != "user_id")
        .collect();
    let assignments = fields
        .iter()
        .map(|(name, _)| format!("{name}=?"))
        .collect::<Vec<_>>()
        .join(",");
    let mut values: Vec<_> = fields.into_iter().map(|(_, value)| value).collect();
    values.extend([profile_id.to_string().into(), id.to_string().into()]);
    let count = db
        .execute(
            &format!(
                "UPDATE {} SET {assignments} WHERE user_id=? AND id=?",
                T::TABLE
            ),
            params_from_iter(values),
        )
        .map_err(error)?;
    if count != 1 {
        return Err("The owned record changed before commit.".into());
    }
    Ok(())
}

pub fn validate_row<T: StoredRow>(profile_id: &str, row: &T) -> Result<()> {
    let value = serde_json::to_value(row).map_err(|_| "The row could not be encoded.")?;
    if value.to_string().len() > 1_048_576 {
        return Err("A local row exceeds one MiB.".into());
    }
    if value["user_id"] != profile_id {
        return Err("A row belongs to another profile.".into());
    }
    if let Some(id) = value.get("id").and_then(Value::as_str) {
        valid_id(id)?;
    }
    for (field, value) in value.as_object().ok_or("A row must be an object.")? {
        if let Some(text) = value.as_str() {
            if field.ends_with("_at") || field == "scheduled_for" {
                instant_key(text)?;
            }
            if field == "local_date" || field.ends_with("_local_date") {
                valid_date(text)?;
            }
            if matches!(
                field.as_str(),
                "scheduled_time"
                    | "start_time"
                    | "end_time"
                    | "schedule_start_time"
                    | "schedule_end_time"
            ) {
                valid_time(text)?;
            }
        }
    }
    Ok(())
}

pub fn valid_id(id: &str) -> Result<()> {
    if id.len() != 36
        || !id.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
    {
        return Err("A local identifier must be a UUID.".into());
    }
    Ok(())
}

pub fn valid_date(value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(i, c)| [4, 7].contains(&i) || c.is_ascii_digit())
    {
        return Err("A local date must use YYYY-MM-DD.".into());
    }
    let year = value[0..4].parse::<u32>().unwrap_or(0);
    let month = value[5..7].parse::<u32>().unwrap_or(0);
    let day = value[8..10].parse::<u32>().unwrap_or(0);
    let days = match month {
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    if year == 0 || day == 0 || day > days {
        return Err("The local date is invalid.".into());
    }
    Ok(())
}

pub fn valid_time(value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    if bytes.len() < 8
        || bytes[2] != b':'
        || bytes[5] != b':'
        || !bytes[..8]
            .iter()
            .enumerate()
            .all(|(i, c)| [2, 5].contains(&i) || c.is_ascii_digit())
    {
        return Err("Local times must use HH:mm:ss, optionally with microseconds.".into());
    }
    if value[0..2].parse::<u32>().unwrap_or(99) > 23
        || value[3..5].parse::<u32>().unwrap_or(99) > 59
        || value[6..8].parse::<u32>().unwrap_or(99) > 59
    {
        return Err("The local time is invalid.".into());
    }
    if bytes.len() > 8
        && (bytes[8] != b'.'
            || bytes.len() < 10
            || bytes.len() > 15
            || !bytes[9..].iter().all(u8::is_ascii_digit))
    {
        return Err("Local times support at most six fractional digits.".into());
    }
    if bytes.len() > 8 && bytes.last() == Some(&b'0') {
        return Err(
            "Local times must omit trailing fractional zeroes to preserve unique identity.".into(),
        );
    }
    Ok(())
}

// Comparable UTC keys retain nanoseconds; SQLite's floating-point datetime functions do not.
pub fn instant_key(value: &str) -> Result<String> {
    let bytes = value.as_bytes();
    if bytes.len() < 20 || bytes[10] != b'T' || bytes.last() != Some(&b'Z') || !value.is_ascii() {
        return Err("Instants must be UTC ISO strings ending in Z.".into());
    }
    valid_date(&value[..10])?;
    valid_time(&value[11..19])?;
    let fraction = &value[19..value.len() - 1];
    let digits = if fraction.is_empty() {
        ""
    } else {
        fraction
            .strip_prefix('.')
            .ok_or("Invalid UTC instant fraction.")?
    };
    if digits.len() > 9
        || (!fraction.is_empty() && digits.is_empty())
        || !digits.bytes().all(|c| c.is_ascii_digit())
    {
        return Err("UTC instants support at most nine fractional digits.".into());
    }
    Ok(format!("{}.{:0<9}", &value[..19], digits))
}

pub fn error(error: rusqlite::Error) -> String {
    match error {
        rusqlite::Error::SqliteFailure(code, _)
            if code.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            "A local ownership, uniqueness, history, or data constraint rejected the transaction."
                .into()
        }
        _ => format!("Local SQLite operation failed: {error}"),
    }
}
