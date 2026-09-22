use super::{db, rows::TravelSettings, Result, TravelSettingsMutation};
use rusqlite::{params, Connection};
use serde_json::{json, Value};

pub fn read(db: &Connection, profile_id: &str) -> Result<TravelSettings> {
    db::owned::<TravelSettings>(db, profile_id)?
        .into_iter()
        .next()
        .ok_or_else(|| "Travel settings are unavailable.".into())
}

pub fn read_value(db: &Connection, profile_id: &str) -> Result<Value> {
    let row = read(db, profile_id)?;
    Ok(json!({
        "enabled": row.enabled,
        "baseLocationText": row.base_location_text,
        "mode": row.mode,
        "navigationPreference": row.navigation_preference,
        "routingConsentAt": row.routing_consent_at,
        "onboardingCompletedAt": row.onboarding_completed_at,
        "updatedAt": row.updated_at,
    }))
}

pub fn write(
    db: &Connection,
    profile_id: &str,
    now: &str,
    expected_updated_at: &str,
    next: &TravelSettingsMutation,
) -> Result<Value> {
    db::instant_key(expected_updated_at)?;
    db::instant_key(&next.updated_at)?;
    for value in [&next.routing_consent_at, &next.onboarding_completed_at].into_iter().flatten() {
        db::instant_key(value)?;
    }
    let current = read(db, profile_id)?;
    if current.updated_at != expected_updated_at {
        return Err("Travel settings changed after they were loaded.".into());
    }
    if next.updated_at != now {
        return Err("Travel settings history is invalid.".into());
    }
    if next.enabled && (next.mode.is_none() || next.routing_consent_at.is_none()) {
        return Err("Enabled travel requires a mode and routing consent.".into());
    }
    if next.mode.as_deref().is_some_and(|mode| !matches!(mode, "walking" | "cycling" | "transit" | "driving"))
        || next.navigation_preference.as_deref().is_some_and(|app| !matches!(app, "google_maps" | "apple_maps"))
        || next.base_location_text.as_deref().is_some_and(|text| text.trim() != text || text.is_empty() || text.len() > 500 || text.chars().any(char::is_control))
    {
        return Err("Travel settings contain an unsupported value.".into());
    }
    let changed = db.execute(
        "UPDATE travel_settings SET enabled=?3,base_location_text=?4,mode=?5,navigation_preference=?6,routing_consent_at=?7,onboarding_completed_at=?8,updated_at=?9 WHERE user_id=?1 AND updated_at=?2",
        params![profile_id, expected_updated_at, next.enabled, next.base_location_text, next.mode,
            next.navigation_preference, next.routing_consent_at, next.onboarding_completed_at, next.updated_at],
    ).map_err(db::error)?;
    if changed != 1 {
        return Err("Travel settings changed after they were loaded.".into());
    }
    read_value(db, profile_id)
}
