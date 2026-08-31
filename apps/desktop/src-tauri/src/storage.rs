use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, PartialEq, Serialize)]
pub struct Snapshot {
    value: Option<String>,
    revision: i64,
}

pub fn open(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS native_spike (
                 id INTEGER PRIMARY KEY CHECK (id = 1),
                 value TEXT,
                 revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
             );
             INSERT OR IGNORE INTO native_spike (id) VALUES (1);",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

pub fn read(connection: &Connection) -> Result<Snapshot, String> {
    connection
        .query_row(
            "SELECT value, revision FROM native_spike WHERE id = 1",
            [],
            |row| {
                Ok(Snapshot {
                    value: row.get(0)?,
                    revision: row.get(1)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

pub fn write(
    connection: &mut Connection,
    value: &str,
    force_rollback: bool,
) -> Result<Snapshot, String> {
    if value.len() > 8192 {
        return Err("Spike values cannot exceed 8192 bytes.".into());
    }
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE native_spike SET value = ?1, revision = revision + 1 WHERE id = 1",
            [value],
        )
        .map_err(|error| error.to_string())?;
    if force_rollback {
        transaction.rollback().map_err(|error| error.to_string())?;
        return Err("Intentional spike failure: SQLite rolled back the value and revision.".into());
    }
    transaction.commit().map_err(|error| error.to_string())?;
    read(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn committed_values_survive_reopen_and_failed_mutations_rollback() {
        let path = std::env::temp_dir().join(format!(
            "cadence-native-spike-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut connection = open(&path).unwrap();
        assert_eq!(
            read(&connection).unwrap(),
            Snapshot {
                value: None,
                revision: 0
            }
        );
        write(&mut connection, "committed ✓", false).unwrap();
        assert!(write(&mut connection, "must disappear", true).is_err());
        assert!(write(&mut connection, &"x".repeat(8193), false).is_err());
        drop(connection);
        let connection = open(&path).unwrap();
        assert_eq!(
            read(&connection).unwrap(),
            Snapshot {
                value: Some("committed ✓".into()),
                revision: 1
            }
        );
        drop(connection);
        std::fs::remove_file(path).unwrap();
    }
}
