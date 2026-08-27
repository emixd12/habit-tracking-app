#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
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
const statusSemantics = new Set(["explicit_user_mark", "explicit_user_correction", "imported_explicit", "system_rule_declared", "ambiguous_import"]);
const noteRoles = new Set(["user", "imported", "system", "ai_generated"]);
const noteAttachedTypes = new Set(["behavior", "occurrence", "status_event", "review"]);
const interventionTypes = new Set(["reminder", "prompt", "nudge", "suppression", "snooze", "dismissal", "feedback", "other"]);
const interventionChannels = new Set(["browser_push", "email", "sms", "mobile_push", "in_app", "calendar_notification", "voice_assistant", "webhook", "other", "none"]);
const deliveryStatuses = new Set(["planned", "sent", "delivered", "failed", "cancelled", "suppressed", "unknown"]);
const eventKinds = new Set(["baseline", "revision"]);
const definitionFields = new Set(["title", "description", "category", "success_definition"]);
const metricNames = new Set(["explicit_adherence_rate", "resolution_rate", "scheduled_completion_rate", "unresolved_rate", "on_time_completion_rate", "schedule_slippage_minutes", "reminder_response_rate", "intervention_burden_index", "tracked_duration_total_seconds", "tracked_duration_mean_seconds"]);
const reviewRoles = new Set(["user", "system", "ai_generated", "imported"]);
const canonicalProfiles = new Set(["core", "intervention", "context", "review", "analytics", "definition_history", "time_tracking", "research"]);

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

function checkRequiredFields(obj, required, rel, id) {
  for (const key of required) {
    if (!Object.hasOwn(obj, key)) errors.push(`${rel}:${id}: missing required field '${key}'`);
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
  if (Array.isArray(manifest.profiles)) {
    for (const profile of manifest.profiles) {
      if (!canonicalProfiles.has(profile)) warnings.push(`manifest.profiles contains identifier outside the canonical list: ${profile}`);
    }
    const declaredProfiles = new Set(manifest.profiles);
    const profileFiles = [
      ["data/interventions.jsonl", "intervention"],
      ["data/intervention_rules.jsonl", "intervention"],
      ["data/context_snapshots.jsonl", "context"],
      ["data/reviews.jsonl", "review"],
      ["data/derived_metrics.jsonl", "analytics"],
      ["data/behavior_definition_events.jsonl", "definition_history"],
      ["data/time_sessions.jsonl", "time_tracking"],
    ];
    for (const [rel, profile] of profileFiles) {
      if (existsSync(join(bundlePath, rel)) && !declaredProfiles.has(profile)) {
        warnings.push(`${rel} is present but manifest.profiles does not declare ${profile}`);
      }
    }
  }
}

if (existsSync(join(bundlePath, "data/time_sessions.jsonl")) && manifest?.privacy?.contains_time_tracking !== true) {
  warnings.push("data/time_sessions.jsonl is present but manifest.privacy.contains_time_tracking is not true");
}

if (existsSync(join(bundlePath, "data/behavior_definition_events.jsonl")) && manifest?.rules?.definition_history_policy !== "event_sourced") {
  warnings.push("data/behavior_definition_events.jsonl is present but rules.definition_history_policy is not event_sourced");
}
if (manifest?.rules?.definition_history_policy === "event_sourced" && !existsSync(join(bundlePath, "data/behavior_definition_events.jsonl"))) {
  warnings.push("rules.definition_history_policy is event_sourced but data/behavior_definition_events.jsonl is absent");
}

// Ensure schema parses.
if (existsSync(join(bundlePath, "schema.json"))) parseJson("schema.json");

const behaviors = parseJsonl("data/behaviors.jsonl", "behavior");
const schedules = parseJsonl("data/schedules.jsonl", "schedule");
const occurrences = parseJsonl("data/occurrences.jsonl", "occurrence");
const statusEvents = parseJsonl("data/status_events.jsonl", "status_event");
const notes = parseJsonl("data/notes.jsonl", "note");
const interventions = parseJsonl("data/interventions.jsonl", "intervention");
const interventionRules = parseJsonl("data/intervention_rules.jsonl", "intervention_rule");
const contexts = parseJsonl("data/context_snapshots.jsonl", "context_snapshot");
const reviews = parseJsonl("data/reviews.jsonl", "review");
const metrics = parseJsonl("data/derived_metrics.jsonl", "derived_metric");
const definitionEvents = parseJsonl("data/behavior_definition_events.jsonl", "behavior_definition_event");
const timeSessions = parseJsonl("data/time_sessions.jsonl", "time_session");

const behaviorIds = hasDuplicateIds(behaviors, "behavior_id", "behaviors");
const scheduleIds = hasDuplicateIds(schedules, "schedule_id", "schedules");
const occurrenceIds = hasDuplicateIds(occurrences, "occurrence_id", "occurrences");
const eventIds = hasDuplicateIds(statusEvents, "event_id", "status_events");
const noteIds = hasDuplicateIds(notes, "note_id", "notes");
const interventionIds = hasDuplicateIds(interventions, "intervention_id", "interventions");
const interventionRuleIds = hasDuplicateIds(interventionRules, "rule_id", "intervention_rules");
const snapshotIds = hasDuplicateIds(contexts, "snapshot_id", "context_snapshots");
const reviewIds = hasDuplicateIds(reviews, "review_id", "reviews");
const metricIds = hasDuplicateIds(metrics, "metric_id", "derived_metrics");
const definitionEventIds = hasDuplicateIds(definitionEvents, "event_id", "behavior_definition_events");
const sessionIds = hasDuplicateIds(timeSessions, "session_id", "time_sessions");

const behaviorAllowed = new Set(["record_type","behavior_id","title","description","category","success_definition","expected_duration_minutes","created_at_utc","archived_at_utc","source","sensitivity","extensions"]);
const scheduleAllowed = new Set(["record_type","schedule_id","behavior_id","recurrence_profile","recurrence","timezone","local_time","window_start_local","window_end_local","active_from_local_date","active_until_local_date","source","extensions"]);
const occurrenceAllowed = new Set(["record_type","occurrence_id","behavior_id","schedule_id","scheduled_for_utc","local_date","local_time","timezone","utc_offset_at_event","due_window_start_utc","due_window_end_utc","generated_at_utc","generation_rule_id","occurrence_state","current_status","source","extensions"]);
const statusAllowed = new Set(["record_type","event_id","occurrence_id","behavior_id","previous_status","status","status_semantics","recorded_at_utc","effective_at_utc","local_date","timezone","utc_offset_at_event","actor","source","note_id","revises_event_id","reason_code","extensions"]);
const noteAllowed = new Set(["record_type","note_id","attached_to_type","attached_to_id","body_markdown","note_role","created_at_utc","updated_at_utc","sensitivity","source","extensions"]);
const interventionAllowed = new Set(["record_type","intervention_id","behavior_id","occurrence_id","intervention_type","channel","planned_for_utc","sent_at_utc","delivery_status","cancel_reason","failure_reason","message_variant","message_body","rule_id","response_event_id","source","extensions"]);
const interventionRuleAllowed = new Set(["record_type","rule_id","behavior_id","intervention_type","channel","enabled","offset_minutes","active_from_local_date","active_until_local_date","timezone","message_variant","source","extensions"]);
const contextAllowed = new Set(["record_type","snapshot_id","attached_to_type","attached_to_id","captured_at_utc","local_date","timezone","availability_state","calendar_conflict","place_label","activity_state","mood_label","energy_label","precision","source_type","consent_scope","sensitivity","source","extensions"]);
const reviewAllowed = new Set(["record_type","review_id","period_start_local_date","period_end_local_date","timezone","created_at_utc","review_role","summary_markdown","barriers_markdown","adjustments_markdown","source","extensions"]);
const metricAllowed = new Set(["record_type","metric_id","metric_name","period_start_local_date","period_end_local_date","timezone","behavior_ids","numerator","denominator","value","unresolved_count","rule_id","source","extensions"]);
const definitionEventAllowed = new Set(["record_type","event_id","behavior_id","event_kind","changed_fields","previous","next","recorded_at_utc","local_date","timezone","utc_offset_at_event","reason_code","source","extensions"]);
const timeSessionAllowed = new Set(["record_type","session_id","occurrence_id","behavior_id","started_at_utc","stopped_at_utc","timezone","local_date","source","extensions"]);

const behaviorRequired = ["record_type","behavior_id","title","category","success_definition","created_at_utc"];
const scheduleRequired = ["record_type","schedule_id","behavior_id","recurrence_profile","recurrence","timezone","active_from_local_date"];
const occurrenceRequired = ["record_type","occurrence_id","behavior_id","schedule_id","scheduled_for_utc","local_date","timezone","occurrence_state","current_status"];
const statusRequired = ["record_type","event_id","occurrence_id","behavior_id","status","status_semantics","recorded_at_utc","local_date","timezone","source"];
const noteRequired = ["record_type","note_id","attached_to_type","attached_to_id","body_markdown","note_role","created_at_utc"];
const interventionRequired = ["record_type","intervention_id","behavior_id","intervention_type","channel","delivery_status"];
const interventionRuleRequired = ["record_type","rule_id","intervention_type","channel","enabled"];
const contextRequired = ["record_type","snapshot_id","captured_at_utc","timezone","precision","source_type","consent_scope"];
const reviewRequired = ["record_type","review_id","period_start_local_date","period_end_local_date","timezone","created_at_utc","review_role"];
const metricRequired = ["record_type","metric_id","metric_name","period_start_local_date","period_end_local_date","timezone","behavior_ids","value","rule_id"];
const definitionEventRequired = ["record_type","event_id","behavior_id","event_kind","changed_fields","previous","next","recorded_at_utc","source"];
const timeSessionRequired = ["record_type","session_id","occurrence_id","behavior_id","started_at_utc","stopped_at_utc"];

for (const b of behaviors) {
  checkExtensionsOnly(b, behaviorAllowed, "behaviors", b.behavior_id);
  checkRequiredFields(b, behaviorRequired, "behaviors", b.behavior_id);
  if (!b.category) warnings.push(`behavior ${b.behavior_id} has no category`);
  if (b.category === "uncategorized") warnings.push(`behavior ${b.behavior_id} is uncategorized`);
  if (!b.success_definition) warnings.push(`behavior ${b.behavior_id} has no success_definition`);
}
for (const s of schedules) {
  checkExtensionsOnly(s, scheduleAllowed, "schedules", s.schedule_id);
  checkRequiredFields(s, scheduleRequired, "schedules", s.schedule_id);
  if (!behaviorIds.has(s.behavior_id)) errors.push(`schedule ${s.schedule_id} references missing behavior ${s.behavior_id}`);
}
for (const o of occurrences) {
  checkExtensionsOnly(o, occurrenceAllowed, "occurrences", o.occurrence_id);
  checkRequiredFields(o, occurrenceRequired, "occurrences", o.occurrence_id);
  if (!behaviorIds.has(o.behavior_id)) errors.push(`occurrence ${o.occurrence_id} references missing behavior ${o.behavior_id}`);
  if (!scheduleIds.has(o.schedule_id)) errors.push(`occurrence ${o.occurrence_id} references missing schedule ${o.schedule_id}`);
  if (Object.hasOwn(o, "current_status") && !statuses.has(o.current_status)) errors.push(`occurrence ${o.occurrence_id} has invalid current_status ${o.current_status}`);
  if (Object.hasOwn(o, "occurrence_state") && !occurrenceStates.has(o.occurrence_state)) errors.push(`occurrence ${o.occurrence_id} has invalid occurrence_state ${o.occurrence_state}`);
}
for (const e of statusEvents) {
  checkExtensionsOnly(e, statusAllowed, "status_events", e.event_id);
  checkRequiredFields(e, statusRequired, "status_events", e.event_id);
  if (Object.hasOwn(e, "status") && !statuses.has(e.status)) errors.push(`status event ${e.event_id} has invalid status ${e.status}`);
  if (e.previous_status !== undefined && e.previous_status !== null && !statuses.has(e.previous_status)) errors.push(`status event ${e.event_id} has invalid previous_status ${e.previous_status}`);
  if (Object.hasOwn(e, "status_semantics") && !statusSemantics.has(e.status_semantics)) errors.push(`status event ${e.event_id} has invalid status_semantics ${e.status_semantics}`);
  if (e.status === "missed") errors.push(`status event ${e.event_id} uses forbidden status missed`);
  if (!occurrenceIds.has(e.occurrence_id)) errors.push(`status event ${e.event_id} references missing occurrence ${e.occurrence_id}`);
  if (!behaviorIds.has(e.behavior_id)) errors.push(`status event ${e.event_id} references missing behavior ${e.behavior_id}`);
  if (e.status_semantics === "ambiguous_import") warnings.push(`status event ${e.event_id} is ambiguous_import; do not treat as explicit non-completion`);
  if (e.revises_event_id && !eventIds.has(e.revises_event_id)) warnings.push(`status event ${e.event_id} revises unknown event ${e.revises_event_id}`);
}
for (const n of notes) {
  checkExtensionsOnly(n, noteAllowed, "notes", n.note_id);
  checkRequiredFields(n, noteRequired, "notes", n.note_id);
  if (Object.hasOwn(n, "note_role") && !noteRoles.has(n.note_role)) errors.push(`note ${n.note_id} has invalid note_role ${n.note_role}`);
  if (Object.hasOwn(n, "attached_to_type") && !noteAttachedTypes.has(n.attached_to_type)) errors.push(`note ${n.note_id} has invalid attached_to_type ${n.attached_to_type}`);
  if (n.attached_to_type === "behavior" && !behaviorIds.has(n.attached_to_id)) errors.push(`note ${n.note_id} references missing behavior ${n.attached_to_id}`);
  if (n.attached_to_type === "occurrence" && !occurrenceIds.has(n.attached_to_id)) errors.push(`note ${n.note_id} references missing occurrence ${n.attached_to_id}`);
  if (n.attached_to_type === "status_event" && !eventIds.has(n.attached_to_id)) errors.push(`note ${n.note_id} references missing status event ${n.attached_to_id}`);
  if (n.attached_to_type === "review" && !reviewIds.has(n.attached_to_id)) warnings.push(`note ${n.note_id} references review ${n.attached_to_id}, but that review is absent`);
  if (n.sensitivity === "high" || n.sensitivity === "restricted") warnings.push(`note ${n.note_id} is ${n.sensitivity} sensitivity`);
}
const interventionRulesFilePresent = existsSync(join(bundlePath, "data/intervention_rules.jsonl"));
for (const i of interventions) {
  checkExtensionsOnly(i, interventionAllowed, "interventions", i.intervention_id);
  checkRequiredFields(i, interventionRequired, "interventions", i.intervention_id);
  if (Object.hasOwn(i, "intervention_type") && !interventionTypes.has(i.intervention_type)) errors.push(`intervention ${i.intervention_id} has invalid intervention_type ${i.intervention_type}`);
  if (Object.hasOwn(i, "channel") && !interventionChannels.has(i.channel)) errors.push(`intervention ${i.intervention_id} has invalid channel ${i.channel}`);
  if (Object.hasOwn(i, "delivery_status") && !deliveryStatuses.has(i.delivery_status)) errors.push(`intervention ${i.intervention_id} has invalid delivery_status ${i.delivery_status}`);
  if (i.occurrence_id && !occurrenceIds.has(i.occurrence_id)) errors.push(`intervention ${i.intervention_id} references missing occurrence ${i.occurrence_id}`);
  if (!behaviorIds.has(i.behavior_id)) errors.push(`intervention ${i.intervention_id} references missing behavior ${i.behavior_id}`);
  if (i.rule_id !== undefined && i.rule_id !== null && interventionRulesFilePresent && !interventionRuleIds.has(i.rule_id)) {
    warnings.push(`intervention ${i.intervention_id} rule_id ${i.rule_id} matches no record in data/intervention_rules.jsonl`);
  }
  if (Object.hasOwn(i, "failure_reason") && i.delivery_status !== "failed") {
    warnings.push(`intervention ${i.intervention_id} has failure_reason but delivery_status is not failed`);
  }
  if (typeof i.failure_reason === "string" && (/https?:\/\//i.test(i.failure_reason) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(i.failure_reason) || /[A-Za-z0-9+/=_-]{32,}/.test(i.failure_reason))) {
    warnings.push(`intervention ${i.intervention_id} failure_reason looks like it contains a URL, email address, or key material`);
  }
  if (i.message_body) warnings.push(`intervention ${i.intervention_id} includes message_body; check privacy profile`);
}
for (const r of interventionRules) {
  checkExtensionsOnly(r, interventionRuleAllowed, "intervention_rules", r.rule_id);
  checkRequiredFields(r, interventionRuleRequired, "intervention_rules", r.rule_id);
  if (Object.hasOwn(r, "intervention_type") && !interventionTypes.has(r.intervention_type)) errors.push(`intervention rule ${r.rule_id} has invalid intervention_type ${r.intervention_type}`);
  if (Object.hasOwn(r, "channel") && !interventionChannels.has(r.channel)) errors.push(`intervention rule ${r.rule_id} has invalid channel ${r.channel}`);
  if (r.behavior_id !== undefined && r.behavior_id !== null && !behaviorIds.has(r.behavior_id)) errors.push(`intervention rule ${r.rule_id} references missing behavior ${r.behavior_id}`);
}
for (const c of contexts) {
  checkExtensionsOnly(c, contextAllowed, "context_snapshots", c.snapshot_id);
  checkRequiredFields(c, contextRequired, "context_snapshots", c.snapshot_id);
  if (Object.hasOwn(c, "precision") && !["none", "coarse", "precise", "raw"].includes(c.precision)) errors.push(`context ${c.snapshot_id} has invalid precision ${c.precision}`);
  if (c.precision === "precise" || c.precision === "raw") warnings.push(`context ${c.snapshot_id} has ${c.precision} precision`);
  if (!c.consent_scope) errors.push(`context ${c.snapshot_id} missing consent_scope`);
}
for (const r of reviews) {
  checkExtensionsOnly(r, reviewAllowed, "reviews", r.review_id);
  checkRequiredFields(r, reviewRequired, "reviews", r.review_id);
  if (Object.hasOwn(r, "review_role") && !reviewRoles.has(r.review_role)) errors.push(`review ${r.review_id} has invalid review_role ${r.review_role}`);
}
const metricRules = manifest?.rules?.metric_rules || {};
for (const m of metrics) {
  checkExtensionsOnly(m, metricAllowed, "derived_metrics", m.metric_id);
  checkRequiredFields(m, metricRequired, "derived_metrics", m.metric_id);
  if (Object.hasOwn(m, "metric_name") && !metricNames.has(m.metric_name)) errors.push(`metric ${m.metric_id} has invalid metric_name ${m.metric_name}`);
  if (!metricRules[m.rule_id]) errors.push(`metric ${m.metric_id} references undeclared rule_id ${m.rule_id}`);
  if (m.unresolved_count === undefined || m.unresolved_count === null) warnings.push(`metric ${m.metric_id} omits unresolved_count`);
}
for (const e of definitionEvents) {
  checkExtensionsOnly(e, definitionEventAllowed, "behavior_definition_events", e.event_id);
  checkRequiredFields(e, definitionEventRequired, "behavior_definition_events", e.event_id);
  if (Object.hasOwn(e, "event_kind") && !eventKinds.has(e.event_kind)) errors.push(`definition event ${e.event_id} has invalid event_kind ${e.event_kind}`);
  if (!Array.isArray(e.changed_fields) || e.changed_fields.length === 0) {
    if (Object.hasOwn(e, "changed_fields")) errors.push(`definition event ${e.event_id} changed_fields must be a non-empty array`);
  } else {
    for (const field of e.changed_fields) {
      if (!definitionFields.has(field)) errors.push(`definition event ${e.event_id} has invalid changed_fields item ${field}`);
    }
  }
  if (!behaviorIds.has(e.behavior_id)) errors.push(`definition event ${e.event_id} references missing behavior ${e.behavior_id}`);
  if (e.event_kind === "baseline" && Object.hasOwn(e, "previous") && e.previous !== null) errors.push(`definition event ${e.event_id} baseline must have null previous`);
  if (e.event_kind === "revision" && Object.hasOwn(e, "previous") && e.previous === null) errors.push(`definition event ${e.event_id} revision must have non-null previous`);
  if (e.event_kind === "revision" && Array.isArray(e.changed_fields)) {
    for (const field of e.changed_fields) {
      if (!e.previous || typeof e.previous !== "object" || !Object.hasOwn(e.previous, field)) errors.push(`definition event ${e.event_id} changed field ${field} is missing from previous`);
      if (!e.next || typeof e.next !== "object" || !Object.hasOwn(e.next, field)) errors.push(`definition event ${e.event_id} changed field ${field} is missing from next`);
    }
  }
}
const runningSessionsByOccurrence = new Map();
for (const s of timeSessions) {
  checkExtensionsOnly(s, timeSessionAllowed, "time_sessions", s.session_id);
  checkRequiredFields(s, timeSessionRequired, "time_sessions", s.session_id);
  if (!occurrenceIds.has(s.occurrence_id)) errors.push(`time session ${s.session_id} references missing occurrence ${s.occurrence_id}`);
  if (!behaviorIds.has(s.behavior_id)) errors.push(`time session ${s.session_id} references missing behavior ${s.behavior_id}`);
  if (s.stopped_at_utc !== null && Date.parse(s.stopped_at_utc) < Date.parse(s.started_at_utc)) errors.push(`time session ${s.session_id} stopped_at_utc precedes started_at_utc`);
  if (s.stopped_at_utc === null) runningSessionsByOccurrence.set(s.occurrence_id, (runningSessionsByOccurrence.get(s.occurrence_id) || 0) + 1);
}
for (const [occurrenceId, count] of runningSessionsByOccurrence) {
  if (count > 1) warnings.push(`occurrence ${occurrenceId} has more than one running time session`);
}

const latestDefinitionEventByBehavior = new Map();
const orderedDefinitionEvents = [...definitionEvents].sort((a, b) => {
  const timeDifference = Date.parse(a.recorded_at_utc) - Date.parse(b.recorded_at_utc);
  if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
  return String(a.event_id).localeCompare(String(b.event_id));
});
for (const e of orderedDefinitionEvents) latestDefinitionEventByBehavior.set(e.behavior_id, e);
const behaviorsById = new Map(behaviors.map((b) => [b.behavior_id, b]));
for (const [behaviorId, e] of latestDefinitionEventByBehavior) {
  const behavior = behaviorsById.get(behaviorId);
  if (!behavior || !e.next || typeof e.next !== "object") continue;
  for (const field of definitionFields) {
    if (Object.hasOwn(e.next, field) && e.next[field] !== behavior[field]) {
      warnings.push(`latest definition event ${e.event_id} next.${field} disagrees with behavior ${behaviorId}`);
    }
  }
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
