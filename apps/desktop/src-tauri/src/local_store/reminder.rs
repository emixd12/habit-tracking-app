use super::{
    db::{self, error, Result},
    rows::*,
    CoverageReceipt, Request,
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn revision(db: &Connection, profile_id: &str) -> Result<i64> {
    db.query_row(
        "SELECT coalesce(max(sequence),0) FROM mutation_outbox WHERE user_id=?1",
        [profile_id],
        |row| row.get(0),
    )
    .map_err(error)
}

fn require_revision(db: &Connection, profile_id: &str, expected: i64) -> Result<()> {
    if revision(db, profile_id)? != expected {
        return Err(
            "Data changed during reminder reconciliation. Read current data and reconcile again."
                .into(),
        );
    }
    Ok(())
}

pub fn read(db: &Connection, profile_id: &str) -> Result<Value> {
    let revision = revision(db, profile_id)?;
    let mut coverage = db::owned::<NativeReminderCoverage>(db, profile_id)?
        .into_iter()
        .next();
    if let Some(receipt) = &mut coverage {
        if receipt.dataset_revision != revision {
            receipt.status = "unverified".into();
            receipt.reason = Some("data_changed".into());
            receipt.verified_at = None;
        }
    }
    let reminders = db::read::<NativeReminderState>(
        db,
        "SELECT * FROM native_reminder_state WHERE user_id=?1 ORDER BY fire_at,id",
        &[profile_id.to_string().into()],
    )?;
    Ok(json!({"revision":revision,"reminders":reminders,"coverage":coverage}))
}

pub fn plan(db: &Connection, request: &Request) -> Result<Value> {
    let Request::CommitNativeReminderPlan {
        profile_id,
        now,
        expected_revision,
        reminders,
        cancel_ids,
        ..
    } = request
    else {
        return Err("Expected a reminder plan.".into());
    };
    require_revision(db, profile_id, *expected_revision)?;
    if reminders.len() > db::READ_LIMIT || cancel_ids.len() > db::READ_LIMIT {
        return Err("A reminder plan exceeds the local row limit.".into());
    }
    let existing = db::owned::<NativeReminderState>(db, profile_id)?;
    let existing: HashMap<_, _> = existing.iter().map(|row| (row.id.as_str(), row)).collect();
    let mut cancelled = HashSet::new();
    for id in cancel_ids {
        db::valid_id(id)?;
        if !cancelled.insert(id.as_str()) {
            return Err("Cancellation IDs must be unique.".into());
        }
    }
    let mut ids = HashSet::new();
    let mut requests = HashSet::new();
    for row in reminders {
        db::validate_row(profile_id, row)?;
        if !ids.insert(row.id.as_str())
            || !requests.insert(row.request_id.as_str())
            || cancelled.contains(row.id.as_str())
        {
            return Err("A reminder plan contains duplicate or conflicting identifiers.".into());
        }
        if row.request_id != format!("cadence.local.{}", row.occurrence_id)
            || row.status != "planned"
            || row.error.is_some()
            || row.verified_at.is_some()
            || row.title.is_empty()
            || row.title.encode_utf16().count() > 200
            || row.body.encode_utf16().count() > 2000
            || row.fire_at.len() != 20
            || db::instant_key(&row.fire_at)? <= db::instant_key(now)?
            || row.updated_at != *now
        {
            return Err("A reminder plan requires a future whole-second owned request and unverified planned state.".into());
        }
        let occurrence: Occurrence = db::by_id(db, profile_id, &row.occurrence_id)?;
        let behavior: Behavior = db::by_id(db, profile_id, &occurrence.behavior_id)?;
        if occurrence.status != "unresolved"
            || !behavior.active
            || !behavior.browser_reminder_enabled
        {
            return Err(
                "A reminder plan cannot schedule a resolved or disabled Occurrence.".into(),
            );
        }
        if let Some(previous) = existing.get(row.id.as_str()) {
            if row.occurrence_id != previous.occurrence_id
                || row.request_id != previous.request_id
                || row.created_at != previous.created_at
            {
                return Err("A reminder cannot change its identity or creation history.".into());
            }
        } else if row.created_at != *now {
            return Err("A new reminder must preserve this plan's creation instant.".into());
        }
    }
    // The plan is the whole desired native set. Dropped requests retain cancellation intent.
    if existing.values().any(|row| {
        matches!(row.status.as_str(), "planned" | "scheduled" | "failed")
            && !ids.contains(row.id.as_str())
            && !cancelled.contains(row.id.as_str())
    }) {
        return Err("Every prior active reminder must be retained or explicitly cancelled.".into());
    }
    for id in cancel_ids {
        db.execute("UPDATE native_reminder_state SET status='cancelled',error=NULL,verified_at=NULL,updated_at=?3 WHERE user_id=?1 AND id=?2",params![profile_id,id,now]).map_err(error)?;
    }
    for row in reminders {
        if existing.contains_key(row.id.as_str()) {
            db::update(db, profile_id, &row.id, row)?;
        } else {
            db::insert(db, profile_id, row)?;
        }
    }
    Ok(Value::Null)
}

fn validate_coverage(coverage: &CoverageReceipt, now: &str) -> Result<()> {
    let target = db::instant_key(&coverage.target_through)?;
    let through = db::instant_key(&coverage.scheduled_through)?;
    if through > target
        || coverage.expected_count < 0
        || coverage.expected_count > db::READ_LIMIT as i64
        || coverage.scheduled_count < 0
        || coverage.scheduled_count > coverage.expected_count
        || coverage.missing_ids.len() as i64 != coverage.expected_count - coverage.scheduled_count
    {
        return Err("Reminder coverage counts or boundaries are inconsistent.".into());
    }
    let mut ids = HashSet::new();
    for id in &coverage.missing_ids {
        let occurrence_id = id
            .strip_prefix("cadence.local.")
            .ok_or("Coverage contains an unowned request identifier.")?;
        db::valid_id(occurrence_id)?;
        if !ids.insert(id) {
            return Err("Coverage contains duplicate missing IDs.".into());
        }
    }
    if let Some(first) = &coverage.first_unscheduled_at {
        let first = db::instant_key(first)?;
        if first <= through || first > target {
            return Err("The first unscheduled request must follow the verified boundary.".into());
        }
    }
    if coverage
        .reason
        .as_ref()
        .is_some_and(|reason| reason.len() > 2000)
    {
        return Err("The coverage reason exceeds the local text limit.".into());
    }
    match coverage.status.as_str() {
        "complete"
            if coverage.missing_ids.is_empty()
                && coverage.first_unscheduled_at.is_none()
                && through == target
                && coverage.verified_at.as_deref() == Some(now) => {}
        "limited"
            if !coverage.missing_ids.is_empty()
                && coverage.first_unscheduled_at.is_some()
                && coverage.verified_at.as_deref() == Some(now) => {}
        "unverified" if coverage.verified_at.is_none() => {}
        _ => {
            return Err(
                "Coverage status requires consistent explicit verification evidence.".into(),
            )
        }
    }
    Ok(())
}

pub fn record(db: &Connection, request: &Request) -> Result<Value> {
    let Request::RecordNativeReminderCoverage {
        profile_id,
        now,
        expected_revision,
        coverage,
        observed,
        ..
    } = request
    else {
        return Err("Expected a reminder receipt.".into());
    };
    require_revision(db, profile_id, *expected_revision)?;
    validate_coverage(coverage, now)?;
    if coverage.status != "unverified" && observed.iter().any(|row| row.status == "failed") {
        return Err("A failed native operation must leave reminder coverage unverified.".into());
    }
    if observed.len() > db::READ_LIMIT {
        return Err("The reminder receipt exceeds the local row limit.".into());
    }
    let mut ids = HashSet::new();
    for observation in observed {
        db::valid_id(&observation.id)?;
        if !ids.insert(&observation.id)
            || observation
                .error
                .as_ref()
                .is_some_and(|error| error.len() > 2000)
        {
            return Err("A reminder receipt has duplicate IDs or oversized error text.".into());
        }
        let mut row: NativeReminderState = db::by_id(db, profile_id, &observation.id)?;
        if observation.status != "delivered" && observation.delivery.is_some() {
            return Err(
                "Delivery evidence cannot describe a scheduling or cancellation observation."
                    .into(),
            );
        }
        if observation.status == "delivered" {
            let proof = observation
                .delivery
                .as_ref()
                .ok_or("Native delivery requires exact OS request evidence.")?;
            if proof.request_id != row.request_id
                || proof.title != row.title
                || proof.body != row.body
                || db::instant_key(&proof.fire_at)? != db::instant_key(&row.fire_at)?
                || db::instant_key(&proof.fire_at)? > db::instant_key(&proof.delivered_at)?
                || db::instant_key(&proof.delivered_at)? > db::instant_key(now)?
            {
                return Err(
                    "Native delivery evidence does not match the persisted request.".into(),
                );
            }
        }
        match observation.status.as_str() {
            "scheduled"
                if matches!(row.status.as_str(), "planned" | "scheduled")
                    && observation.error.is_none() =>
            {
                row.status = "scheduled".into()
            }
            "cancelled" if row.status == "cancelled" && observation.error.is_none() => {}
            "delivered"
                if observation.error.is_none()
                    && db::instant_key(&row.fire_at)? <= db::instant_key(now)? =>
            {
                // Correct observation history after expiry cleanup; this never schedules or reactivates a request.
                row.status = "delivered".into()
            }
            "failed" if observation.error.is_some() => {
                // A failed cancellation must never erase the intent needed for the next retry.
                if row.status != "cancelled" {
                    row.status = "failed".into();
                }
            }
            _ => return Err("A reminder observation conflicts with its persisted intent.".into()),
        }
        row.error = observation.error.clone();
        row.verified_at = if observation.status == "failed" {
            None
        } else {
            Some(now.clone())
        };
        row.updated_at = now.clone();
        db::update(db, profile_id, &row.id, &row)?;
    }
    db.execute(
        "DELETE FROM native_reminder_coverage WHERE user_id=?1",
        [profile_id],
    )
    .map_err(error)?;
    db::insert(
        db,
        profile_id,
        &NativeReminderCoverage {
            user_id: profile_id.clone(),
            status: coverage.status.clone(),
            target_through: coverage.target_through.clone(),
            scheduled_through: coverage.scheduled_through.clone(),
            first_unscheduled_at: coverage.first_unscheduled_at.clone(),
            expected_count: coverage.expected_count,
            scheduled_count: coverage.scheduled_count,
            missing_ids: coverage.missing_ids.clone(),
            reason: coverage.reason.clone(),
            verified_at: coverage.verified_at.clone(),
            updated_at: now.clone(),
            dataset_revision: *expected_revision,
        },
    )?;
    Ok(Value::Null)
}

// Called only after the outbox insert, in the same transaction. No data write implies OS success.
pub fn after_mutation(db: &Connection, request: &Request, sequence: i64) -> Result<()> {
    let Some((profile_id, _, now)) = request.mutation_context() else {
        return Ok(());
    };
    if matches!(request, Request::RecordNativeReminderCoverage { .. }) {
        db.execute(
            "UPDATE native_reminder_coverage SET dataset_revision=?2 WHERE user_id=?1",
            params![profile_id, sequence],
        )
        .map_err(error)?;
    } else {
        let reason = if matches!(request, Request::CommitNativeReminderPlan { .. }) {
            "reconciling"
        } else {
            "data_changed"
        };
        db.execute("UPDATE native_reminder_coverage SET status='unverified',verified_at=NULL,reason=?2,updated_at=?3 WHERE user_id=?1",params![profile_id,reason,now]).map_err(error)?;
    }
    Ok(())
}
