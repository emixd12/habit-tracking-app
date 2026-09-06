use super::{db::{self, error, Result}, rows::Category, behavior, tombstone, Request};
use rusqlite::{Connection, params};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn apply(db: &Connection, request: &Request) -> Result<Value> {
    let Request::ManageCategories { profile_id, mutation_id, now, expected_categories, next_categories, updates } = request else {
        return Err("Expected a category operation.".into());
    };
    let current = db::owned::<Category>(db, profile_id)?;
    let expected: HashMap<_, _> = expected_categories.iter().map(|row| (row["id"].as_str().unwrap_or(""),row)).collect();
    if current.len() != expected_categories.len() || expected.len() != current.len() || next_categories.len() > 1000 {
        return Err("Categories changed. Refresh Settings and review your changes.".into());
    }
    for row in &current {
        let snapshot = json!({"id":row.id,"name":row.name,"description":row.description,"sort_order":row.sort_order,"updated_at":row.updated_at});
        if expected.get(row.id.as_str()).map(|value| *value) != Some(&snapshot) {
            return Err("Categories changed. Refresh Settings and review your changes.".into());
        }
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    let mut next_rows = Vec::new();
    for value in next_categories {
        let id = value["id"].as_str().ok_or("Category ID is required.")?;
        db::valid_id(id)?;
        let name = value["name"].as_str().ok_or("Category name is required.")?;
        let description = if value["description"].is_null() { None } else { Some(value["description"].as_str().ok_or("Invalid category description.")?.to_string()) };
        let sort_order = value["sort_order"].as_i64().ok_or("Category order is required.")?;
        let previous = current.iter().find(|row| row.id == id);
        let unchanged_name = previous.is_some_and(|row| row.name == name);
        if (!unchanged_name && (name.is_empty() || name.chars().count() > 120 || name.trim() != name || name.chars().any(char::is_control)))
            || description.as_ref().is_some_and(|value| value.chars().count() > 2000 || value.contains('\0')) || sort_order < 0
            || !ids.insert(id.to_string()) || !names.insert(name.to_ascii_lowercase()) {
            return Err("Invalid or duplicate category name, description, or order.".into());
        }
        next_rows.push(Category { id: id.into(), user_id: profile_id.clone(), name: name.into(), description, sort_order,
            created_at: previous.map_or(now.clone(), |row| row.created_at.clone()),
            updated_at: now.clone() });
    }
    let removed: HashSet<_> = current.iter().filter(|row| !ids.contains(&row.id)).map(|row| row.id.as_str()).collect();
    let graphs: Vec<super::rows::Behavior> = db::owned(db, profile_id)?;
    let affected: HashSet<_> = graphs.iter().filter(|row| row.category_id.as_deref().is_some_and(|id| removed.contains(id))).map(|row| row.id.as_str()).collect();
    let mut seen = HashSet::new();
    if affected.len() != updates.len() { return Err("Category assignments changed. Refresh Settings before deleting.".into()); }
    for update in updates {
        let id = &update.graph.behavior.id;
        if !affected.contains(id.as_str()) || !seen.insert(id) || update.graph.behavior.category_id.is_some() {
            return Err("Invalid category removal plan.".into());
        }
        behavior::write_graph(db, profile_id, mutation_id, now, &update.graph, Some(update.expected_revision), None, None, update.configuration_event.as_ref())?;
    }
    for id in removed {
        tombstone(db, profile_id, mutation_id, now, "categories", id)?;
        db.execute("DELETE FROM categories WHERE user_id=?1 AND id=?2", params![profile_id,id]).map_err(error)?;
    }
    for row in next_rows {
        if let Some(previous) = current.iter().find(|old| old.id == row.id) {
            if previous.name == row.name && previous.description == row.description && previous.sort_order == row.sort_order { continue; }
        }
        if current.iter().any(|old| old.id == row.id) {
            db::update(db, profile_id, &row.id, &row)?;
        } else { db::insert(db, profile_id, &row)?; }
    }
    Ok(Value::Null)
}
