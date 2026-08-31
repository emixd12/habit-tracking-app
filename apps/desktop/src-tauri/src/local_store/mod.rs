mod adoption;
mod behavior;
mod db;
mod export;
mod import;
mod import_write;
mod occurrence;
mod reminder;
pub mod rows;
#[cfg(test)]
mod tests;

use db::{error, Result};
use rows::*;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{path::Path, sync::Mutex};
use tauri::State;

pub struct LocalStore(pub Mutex<Connection>);
pub fn adopt_previous_identity(directory: &Path) -> Result<()> {
    adoption::adopt(directory)
}
pub fn open(path: &Path) -> Result<LocalStore> {
    Ok(LocalStore(Mutex::new(db::open(path)?)))
}

// Explicitly gated test transport. Production builds expose only the typed Tauri command.
#[cfg(feature = "contract-harness")]
pub fn run_contract(path: &Path) -> Result<()> {
    use std::io::{BufRead, Write};
    let directory = path
        .parent()
        .ok_or("A temporary database directory is required.")?
        .canonicalize()
        .map_err(|_| "The temporary database directory does not exist.")?;
    let temporary = std::env::temp_dir()
        .canonicalize()
        .map_err(|_| "The system temporary directory is unavailable.")?;
    if !directory.starts_with(temporary) && !directory.starts_with("/private/tmp") {
        return Err("The contract harness requires a temporary database path.".into());
    }
    let mut db = db::open(path)?;
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.map_err(|_| "The contract request could not be read.")?;
        let result = if line.len() > 32 * 1024 * 1024 {
            Err("The contract request exceeds 32 MiB.".into())
        } else {
            serde_json::from_str::<Request>(&line)
                .map_err(|error| format!("Invalid typed local request: {error}"))
                .and_then(|request| execute(&mut db, request))
        };
        let output = match result {
            Ok(result) => json!({"result":result}),
            Err(error) => json!({"error":error}),
        };
        writeln!(stdout, "{output}")
            .and_then(|_| stdout.flush())
            .map_err(|_| "The contract result could not be written.")?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GraphRows {
    pub behavior: Behavior,
    pub schedules: Vec<BehaviorSchedule>,
    pub slots: Vec<BehaviorScheduleSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OccurrenceReplacement {
    pub expected: Occurrence,
    pub next: Occurrence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Definition {
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimezoneGraphUpdate {
    pub graph: GraphRows,
    pub expected_revision: i64,
    pub configuration_event: Option<BehaviorConfigurationEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CoverageReceipt {
    pub status: String,
    pub target_through: String,
    pub scheduled_through: String,
    pub first_unscheduled_at: Option<String>,
    pub expected_count: i64,
    pub scheduled_count: i64,
    pub missing_ids: Vec<String>,
    pub reason: Option<String>,
    pub verified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReminderObservation {
    pub id: String,
    pub status: String,
    pub error: Option<String>,
    pub delivery: Option<NativeDeliveryProof>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeDeliveryProof {
    pub request_id: String,
    pub fire_at: String,
    pub title: String,
    pub body: String,
    pub delivered_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Request {
    ReadProfile {},
    ReadCategories {
        profile_id: String,
    },
    ReadBehaviorGraphs {
        profile_id: String,
    },
    ReadOccurrence {
        profile_id: String,
        occurrence_id: String,
    },
    ReadOccurrences {
        profile_id: String,
        start_local_date: String,
        end_local_date: String,
        behavior_id: Option<String>,
        status: Option<String>,
    },
    ReadOccurrenceHistory {
        profile_id: String,
        occurrence_ids: Vec<String>,
    },
    ReadSyncState {
        profile_id: String,
    },
    ReadExportSnapshot {
        profile_id: String,
        start_local_date: Option<String>,
        end_local_date: String,
        include_time_tracking: bool,
        through_started_at: String,
    },
    ReadNativeReminderState {
        profile_id: String,
    },
    ReadImportSnapshot {
        profile_id: String,
    },
    ReadImportRuns {
        profile_id: String,
        limit: i64,
        kind: Option<import::ImportRunKind>,
    },
    PrepareBehaviorLogImport {
        profile_id: String,
        mutation_id: String,
        now: String,
        expected_revision: i64,
        preview_run: BehaviorLogImportRun,
        plan: Option<import::LocalImportWritePlan>,
    },
    ApplyBehaviorLogImport {
        profile_id: String,
        mutation_id: String,
        now: String,
        preview_run_id: String,
        import_mode: import::ImportMode,
        preview_fingerprint: String,
        local_data_fingerprint: String,
        bundle_fingerprint: String,
        bundle_payload_fingerprint: Option<String>,
    },
    UpdateProfileTimezone {
        profile_id: String,
        mutation_id: String,
        now: String,
        expected_timezone: String,
        expected_sync_version: i64,
        timezone: String,
        updates: Vec<TimezoneGraphUpdate>,
    },
    CommitNativeReminderPlan {
        profile_id: String,
        mutation_id: String,
        now: String,
        expected_revision: i64,
        reminders: Vec<NativeReminderState>,
        cancel_ids: Vec<String>,
    },
    RecordNativeReminderCoverage {
        profile_id: String,
        mutation_id: String,
        now: String,
        expected_revision: i64,
        coverage: CoverageReceipt,
        observed: Vec<ReminderObservation>,
    },
    CreateBehaviorGraph {
        profile_id: String,
        mutation_id: String,
        now: String,
        graph: GraphRows,
        definition_event: BehaviorDefinitionEvent,
        configuration_event: BehaviorConfigurationEvent,
    },
    UpdateBehaviorGraph {
        profile_id: String,
        mutation_id: String,
        now: String,
        graph: GraphRows,
        expected_revision: i64,
        expected_normalized_definition: Definition,
        definition_event: Option<BehaviorDefinitionEvent>,
        configuration_event: Option<BehaviorConfigurationEvent>,
    },
    ApplyOccurrenceGeneration {
        profile_id: String,
        mutation_id: String,
        now: String,
        behavior_id: String,
        expected_configuration_event_id: String,
        create: Vec<Occurrence>,
        update: Vec<OccurrenceReplacement>,
        delete: Vec<Occurrence>,
    },
    ApplyStatusTransition {
        profile_id: String,
        mutation_id: String,
        now: String,
        occurrence_id: String,
        expected_status: String,
        expected_latest_event_id: Option<String>,
        status: String,
        completed_at: Option<String>,
        status_marked_at: Option<String>,
        cancel_pending_reminders: bool,
        event: Option<OccurrenceStatusEvent>,
    },
    UpdateOccurrenceNote {
        profile_id: String,
        mutation_id: String,
        now: String,
        occurrence_id: String,
        expected_note: Option<String>,
        note: Option<String>,
    },
    StartTimeSession {
        profile_id: String,
        mutation_id: String,
        now: String,
        session: OccurrenceTimeSession,
    },
    StopTimeSession {
        profile_id: String,
        mutation_id: String,
        now: String,
        occurrence_id: String,
        session_id: String,
        stopped_at: String,
    },
    ResetTimeSessions {
        profile_id: String,
        mutation_id: String,
        now: String,
        occurrence_id: String,
        expected_sessions: Vec<OccurrenceTimeSession>,
    },
    CommitSyncState {
        profile_id: String,
        mutation_id: String,
        now: String,
        expected_version: i64,
        state: OccurrenceSyncState,
    },
}

#[tauri::command]
pub async fn local_store(store: State<'_, LocalStore>, request: Request) -> Result<Value> {
    let mut db = store
        .0
        .lock()
        .map_err(|_| "The local database lock is unavailable.")?;
    execute(&mut db, request)
}

pub fn execute(db: &mut Connection, request: Request) -> Result<Value> {
    if let Some((profile_id, mutation_id, now)) = request.mutation_context() {
        db::valid_id(mutation_id)?;
        db::instant_key(now)?;
        let payload = serde_json::to_string(&request)
            .map_err(|_| "The local request could not be encoded.")?;
        if payload.len() > 32 * 1024 * 1024 {
            return Err("The local mutation exceeds 32 MiB.".into());
        }
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(error)?;
        db::owner(&tx, profile_id)?;
        let prior: Option<(String,String)> = tx.query_row("SELECT request_json,result_json FROM mutation_outbox WHERE user_id=?1 AND mutation_id=?2", params![profile_id,mutation_id], |row| Ok((row.get(0)?,row.get(1)?))).optional().map_err(error)?;
        if let Some((prior_payload, result)) = prior {
            if prior_payload != payload {
                return Err("The mutation ID was already used for a different plan.".into());
            }
            return serde_json::from_str(&result)
                .map_err(|_| "The prior mutation result is invalid.".into());
        }
        let mut result = apply(&tx, &request)?;
        let operation = serde_json::to_value(&request)
            .map_err(|_| "The local request could not be encoded.")?["operation"]
            .as_str()
            .ok_or("Missing local operation.")?
            .to_string();
        tx.execute("INSERT INTO mutation_outbox (mutation_id,user_id,operation,request_json,result_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)", params![mutation_id,profile_id,operation,payload,result.to_string(),now]).map_err(error)?;
        reminder::after_mutation(&tx, &request, tx.last_insert_rowid())?;
        if let Request::PrepareBehaviorLogImport { preview_run, .. } = &request {
            result =
                import::after_prepare(&tx, profile_id, &preview_run.id, tx.last_insert_rowid())?;
            tx.execute(
                "UPDATE mutation_outbox SET result_json=?2 WHERE mutation_id=?1",
                params![mutation_id, result.to_string()],
            )
            .map_err(error)?;
        }
        if matches!(
            request,
            Request::CommitNativeReminderPlan { .. } | Request::RecordNativeReminderCoverage { .. }
        ) {
            result = reminder::read(&tx, profile_id)?;
            tx.execute(
                "UPDATE mutation_outbox SET result_json=?2 WHERE mutation_id=?1",
                params![mutation_id, result.to_string()],
            )
            .map_err(error)?;
        }
        tx.commit().map_err(error)?;
        return Ok(result);
    }
    // A coherent read transaction prevents histories or graphs from spanning different writes.
    let tx = db.transaction().map_err(error)?;
    let result = match &request {
        Request::ReadProfile {} => json!(db::profile(&tx)?),
        Request::ReadCategories { profile_id } => {
            db::owner(&tx, profile_id)?;
            json!(db::read::<Category>(
                &tx,
                "SELECT * FROM categories WHERE user_id=?1 ORDER BY sort_order,name,id",
                &[profile_id.clone().into()]
            )?)
        }
        Request::ReadBehaviorGraphs { profile_id } => {
            db::owner(&tx, profile_id)?;
            behavior::read_graphs(&tx, profile_id)?
        }
        Request::ReadOccurrence {
            profile_id,
            occurrence_id,
        } => {
            db::owner(&tx, profile_id)?;
            db::valid_id(occurrence_id)?;
            json!(db::read::<Occurrence>(
                &tx,
                "SELECT * FROM occurrences WHERE user_id=?1 AND id=?2",
                &[profile_id.clone().into(), occurrence_id.clone().into()]
            )?
            .into_iter()
            .next())
        }
        Request::ReadOccurrences {
            profile_id,
            start_local_date,
            end_local_date,
            behavior_id,
            status,
        } => {
            db::owner(&tx, profile_id)?;
            occurrence::read_occurrences(
                &tx,
                profile_id,
                start_local_date,
                end_local_date,
                behavior_id.as_deref(),
                status.as_deref(),
            )?
        }
        Request::ReadOccurrenceHistory {
            profile_id,
            occurrence_ids,
        } => {
            db::owner(&tx, profile_id)?;
            occurrence::read_history(&tx, profile_id, occurrence_ids)?
        }
        Request::ReadSyncState { profile_id } => {
            db::owner(&tx, profile_id)?;
            json!(db::owned::<OccurrenceSyncState>(&tx, profile_id)?
                .into_iter()
                .next()
                .ok_or("Occurrence sync state is unavailable.")?)
        }
        Request::ReadNativeReminderState { profile_id } => {
            db::owner(&tx, profile_id)?;
            reminder::read(&tx, profile_id)?
        }
        Request::ReadImportSnapshot { profile_id } => {
            db::owner(&tx, profile_id)?;
            import::snapshot(&tx, profile_id)?
        }
        Request::ReadImportRuns {
            profile_id,
            limit,
            kind,
        } => {
            db::owner(&tx, profile_id)?;
            json!(import::read_runs(&tx, profile_id, *limit, kind.as_ref())?)
        }
        Request::ReadExportSnapshot {
            profile_id,
            start_local_date,
            end_local_date,
            include_time_tracking,
            through_started_at,
        } => {
            db::owner(&tx, profile_id)?;
            export::read(
                &tx,
                profile_id,
                start_local_date.as_deref(),
                end_local_date,
                *include_time_tracking,
                through_started_at,
            )?
        }
        _ => return Err("Unsupported local read.".into()),
    };
    tx.commit().map_err(error)?;
    Ok(result)
}

fn apply(db: &Connection, request: &Request) -> Result<Value> {
    match request {
        Request::PrepareBehaviorLogImport { .. } => import::prepare(db, request),
        Request::ApplyBehaviorLogImport { .. } => import::apply(db, request),
        Request::UpdateProfileTimezone { .. } => behavior::update_timezone(db, request),
        Request::CommitNativeReminderPlan { .. } => reminder::plan(db, request),
        Request::RecordNativeReminderCoverage { .. } => reminder::record(db, request),
        Request::CreateBehaviorGraph {
            profile_id,
            mutation_id,
            now,
            graph,
            definition_event,
            configuration_event,
        } => behavior::write_graph(
            db,
            profile_id,
            mutation_id,
            now,
            graph,
            None,
            None,
            Some(definition_event),
            Some(configuration_event),
        ),
        Request::UpdateBehaviorGraph {
            profile_id,
            mutation_id,
            now,
            graph,
            expected_revision,
            expected_normalized_definition,
            definition_event,
            configuration_event,
        } => behavior::write_graph(
            db,
            profile_id,
            mutation_id,
            now,
            graph,
            Some(*expected_revision),
            Some(expected_normalized_definition),
            definition_event.as_ref(),
            configuration_event.as_ref(),
        ),
        Request::ApplyOccurrenceGeneration { .. } => occurrence::generate(db, request),
        Request::ApplyStatusTransition { .. } => occurrence::status(db, request),
        Request::UpdateOccurrenceNote {
            profile_id,
            now,
            occurrence_id,
            expected_note,
            note,
            ..
        } => occurrence::note(db, profile_id, now, occurrence_id, expected_note, note),
        Request::StartTimeSession {
            profile_id,
            session,
            ..
        } => occurrence::start_time(db, profile_id, session),
        Request::StopTimeSession {
            profile_id,
            now,
            occurrence_id,
            session_id,
            stopped_at,
            ..
        } => occurrence::stop_time(db, profile_id, now, occurrence_id, session_id, stopped_at),
        Request::ResetTimeSessions {
            profile_id,
            mutation_id,
            now,
            occurrence_id,
            expected_sessions,
        } => occurrence::reset_time(
            db,
            profile_id,
            mutation_id,
            now,
            occurrence_id,
            expected_sessions,
        ),
        Request::CommitSyncState {
            profile_id,
            now,
            expected_version,
            state,
            ..
        } => occurrence::sync_state(db, profile_id, now, *expected_version, state),
        _ => Err("Unsupported local mutation.".into()),
    }
}

impl Request {
    fn mutation_context(&self) -> Option<(&str, &str, &str)> {
        match self {
            Self::PrepareBehaviorLogImport {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::ApplyBehaviorLogImport {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::UpdateProfileTimezone {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::CommitNativeReminderPlan {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::RecordNativeReminderCoverage {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::CreateBehaviorGraph {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::UpdateBehaviorGraph {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::ApplyOccurrenceGeneration {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::ApplyStatusTransition {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::UpdateOccurrenceNote {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::StartTimeSession {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::StopTimeSession {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::ResetTimeSessions {
                profile_id,
                mutation_id,
                now,
                ..
            }
            | Self::CommitSyncState {
                profile_id,
                mutation_id,
                now,
                ..
            } => Some((profile_id, mutation_id, now)),
            _ => None,
        }
    }
}

pub(super) fn tombstone(
    db: &Connection,
    profile_id: &str,
    mutation_id: &str,
    now: &str,
    table: &str,
    id: &str,
) -> Result<()> {
    db.execute("INSERT INTO tombstones (user_id,entity_type,entity_id,deleted_at,mutation_id) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(user_id,entity_type,entity_id) DO UPDATE SET deleted_at=excluded.deleted_at,mutation_id=excluded.mutation_id", params![profile_id,table,id,now,mutation_id]).map_err(error)?;
    Ok(())
}
