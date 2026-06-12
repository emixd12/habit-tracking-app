#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const bundlePath = process.argv[2];
if (!bundlePath) {
  console.error("Usage: node reference/validate.mjs <bundle.behaviorlog>");
  process.exit(2);
}

const errors = [];
const warnings = [];
const requiredFiles = [
  "manifest.json",
  "schema.json",
  "README.md",
  "AGENTS.md",
  "data/behaviors.jsonl",
  "data/schedules.jsonl",
  "data/occurrences.jsonl",
  "data/status_events.jsonl",
];
const statuses = new Set(["unresolved", "completed", "not_completed"]);
const occurrenceStates = new Set(["active", "cancelled"]);

function readText(rel) {
  return readFileSync(join(bundlePath, rel), "utf8");
}

function sha256(rel) {
  const buf = readFileSync(join(bundlePath, rel));
  return createHash("sha256").update(buf).digest("hex");
}

function parseJson(rel) {
  try {
    return JSON.parse(readText(rel));
  } catch (err) {
    errors.push(`${rel}: invalid JSON: ${err.message}`);
    return null;
  }
}

function parseJsonl(rel, expectedType) {
  const out = [];
  if (!existsSync(join(bundlePath, rel))) return out;
  const lines = readText(rel).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    try {
      const obj = JSON.parse(line);
      if (obj.record_type !== expectedType) {
        errors.push(`${rel}:${idx + 1}: expected record_type ${expectedType}, got ${obj.record_type}`);
      }
      out.push(obj);
    } catch (err) {
      errors.push(`${rel}:${idx + 1}: invalid JSONL line: ${err.message}`);
    }
  });
  return out;
}

function checkExtensionsOnly(obj, allowed, rel, id) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      errors.push(`${rel}:${id}: unknown top-level field '${key}'. Put custom fields under extensions.`);
    }
  }
}

function hasDuplicateIds(records, key, label) {
  const seen = new Set();
  for (const r of records) {
    if (seen.has(r[key])) errors.push(`${label}: duplicate ${key} ${r[key]}`);
    seen.add(r[key]);
  }
  return seen;
}

for (const rel of requiredFiles) {
  if (!existsSync(join(bundlePath, rel))) errors.push(`missing required file: ${rel}`);
}

const manifest = existsSync(join(bundlePath, "manifest.json")) ? parseJson("manifest.json") : null;
if (manifest) {
  if (manifest.format !== "behaviorlog.bundle") errors.push("manifest.format must be behaviorlog.bundle");
  if (!manifest.schema_version) errors.push("manifest.schema_version is required");
  if (!manifest.files || !Array.isArray(manifest.files)) errors.push("manifest.files must be an array");
  if (manifest.privacy?.contains_context && !existsSync(join(bundlePath, "data/context_snapshots.jsonl"))) {
    warnings.push("manifest says contains_context=true but data/context_snapshots.jsonl is absent");
  }
  for (const entry of manifest.files || []) {
    if (!entry.path) continue;
    const p = join(bundlePath, entry.path);
    if (entry.required && !existsSync(p)) errors.push(`manifest required file missing: ${entry.path}`);
    if (entry.sha256 && existsSync(p)) {
      const actual = sha256(entry.path);
      if (actual !== entry.sha256) errors.push(`hash mismatch for ${entry.path}`);
    } else if (entry.required) {
      warnings.push(`required file ${entry.path} has no sha256 in manifest`);
    }
  }
}

if (existsSync(join(bundlePath, "schema.json"))) parseJson("schema.json");

const behaviors = parseJsonl("data/behaviors.jsonl", "behavior");
const schedules = parseJsonl("data/schedules.jsonl", "schedule");
const occurrences = parseJsonl("data/occurrences.jsonl", "occurrence");
const statusEvents = parseJsonl("data/status_events.jsonl", "status_event");
const notes = parseJsonl("data/notes.jsonl", "note");
const interventions = parseJsonl("data/interventions.jsonl", "intervention");
const contexts = parseJsonl("data/context_snapshots.jsonl", "context_snapshot");
const metrics = parseJsonl("data/derived_metrics.jsonl", "derived_metric");

const behaviorIds = hasDuplicateIds(behaviors, "behavior_id", "behaviors");
const scheduleIds = hasDuplicateIds(schedules, "schedule_id", "schedules");
const occurrenceIds = hasDuplicateIds(occurrences, "occurrence_id", "occurrences");
const eventIds = hasDuplicateIds(statusEvents, "event_id", "status_events");

const behaviorAllowed = new Set(["record_type","behavior_id","title","description","category","success_definition","expected_duration_minutes","created_at_utc","archived_at_utc","source","sensitivity","extensions"]);
const scheduleAllowed = new Set(["record_type","schedule_id","behavior_id","recurrence_profile","recurrence","timezone","local_time","window_start_local","window_end_local","active_from_local_date","active_until_local_date","source","extensions"]);
const occurrenceAllowed = new Set(["record_type","occurrence_id","behavior_id","schedule_id","scheduled_for_utc","local_date","local_time","timezone","utc_offset_at_event","due_window_start_utc","due_window_end_utc","generated_at_utc","generation_rule_id","occurrence_state","current_status","source","extensions"]);
const statusAllowed = new Set(["record_type","event_id","occurrence_id","behavior_id","previous_status","status","status_semantics","recorded_at_utc","effective_at_utc","local_date","timezone","utc_offset_at_event","actor","source","note_id","revises_event_id","reason_code","extensions"]);

for (const b of behaviors) {
  checkExtensionsOnly(b, behaviorAllowed, "behaviors", b.behavior_id);
  if (!b.category) warnings.push(`behavior ${b.behavior_id} has no category`);
  if (b.category === "uncategorized") warnings.push(`behavior ${b.behavior_id} is uncategorized`);
  if (!b.success_definition) warnings.push(`behavior ${b.behavior_id} has no success_definition`);
}
for (const s of schedules) {
  checkExtensionsOnly(s, scheduleAllowed, "schedules", s.schedule_id);
  if (!behaviorIds.has(s.behavior_id)) errors.push(`schedule ${s.schedule_id} references missing behavior ${s.behavior_id}`);
}
for (const o of occurrences) {
  checkExtensionsOnly(o, occurrenceAllowed, "occurrences", o.occurrence_id);
  if (!behaviorIds.has(o.behavior_id)) errors.push(`occurrence ${o.occurrence_id} references missing behavior ${o.behavior_id}`);
  if (!scheduleIds.has(o.schedule_id)) errors.push(`occurrence ${o.occurrence_id} references missing schedule ${o.schedule_id}`);
  if (!statuses.has(o.current_status)) errors.push(`occurrence ${o.occurrence_id} has invalid current_status ${o.current_status}`);
  if (!occurrenceStates.has(o.occurrence_state)) errors.push(`occurrence ${o.occurrence_id} has invalid occurrence_state ${o.occurrence_state}`);
}
for (const e of statusEvents) {
  checkExtensionsOnly(e, statusAllowed, "status_events", e.event_id);
  if (!statuses.has(e.status)) errors.push(`status event ${e.event_id} has invalid status ${e.status}`);
  if (e.status === "missed") errors.push(`status event ${e.event_id} uses forbidden status missed`);
  if (!occurrenceIds.has(e.occurrence_id)) errors.push(`status event ${e.event_id} references missing occurrence ${e.occurrence_id}`);
  if (!behaviorIds.has(e.behavior_id)) errors.push(`status event ${e.event_id} references missing behavior ${e.behavior_id}`);
  if (e.status_semantics === "ambiguous_import") warnings.push(`status event ${e.event_id} is ambiguous_import; do not treat as explicit non-completion`);
  if (e.revises_event_id && !eventIds.has(e.revises_event_id)) warnings.push(`status event ${e.event_id} revises unknown event ${e.revises_event_id}`);
}
for (const n of notes) {
  if (n.sensitivity === "high" || n.sensitivity === "restricted") warnings.push(`note ${n.note_id} is ${n.sensitivity} sensitivity`);
}
for (const i of interventions) {
  if (i.occurrence_id && !occurrenceIds.has(i.occurrence_id)) errors.push(`intervention ${i.intervention_id} references missing occurrence ${i.occurrence_id}`);
  if (!behaviorIds.has(i.behavior_id)) errors.push(`intervention ${i.intervention_id} references missing behavior ${i.behavior_id}`);
  if (i.message_body) warnings.push(`intervention ${i.intervention_id} includes message_body; check privacy profile`);
}
for (const c of contexts) {
  if (!["none", "coarse", "precise", "raw"].includes(c.precision)) errors.push(`context ${c.snapshot_id} has invalid precision ${c.precision}`);
  if (c.precision === "precise" || c.precision === "raw") warnings.push(`context ${c.snapshot_id} has ${c.precision} precision`);
  if (!c.consent_scope) errors.push(`context ${c.snapshot_id} missing consent_scope`);
}
const metricRules = manifest?.rules?.metric_rules || {};
for (const m of metrics) {
  if (!metricRules[m.rule_id]) errors.push(`metric ${m.metric_id} references undeclared rule_id ${m.rule_id}`);
  if (m.unresolved_count === undefined || m.unresolved_count === null) warnings.push(`metric ${m.metric_id} omits unresolved_count`);
}

if (warnings.length) {
  console.warn("Warnings:");
  for (const w of warnings) console.warn(`- ${w}`);
}
if (errors.length) {
  console.error("Errors:");
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`BehaviorLog bundle valid: ${bundlePath}`);
