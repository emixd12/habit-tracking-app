#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

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
const configurationFields = new Set(["category", "schedules", "intervention_rules", "active", "timezone"]);
const metricNames = new Set(["explicit_adherence_rate", "resolution_rate", "scheduled_completion_rate", "unresolved_rate", "on_time_completion_rate", "schedule_slippage_minutes", "reminder_response_rate", "intervention_burden_index", "tracked_duration_total_seconds", "tracked_duration_mean_seconds"]);
const reviewRoles = new Set(["user", "system", "ai_generated", "imported"]);
const canonicalProfiles = new Set(["core", "intervention", "context", "review", "analytics", "definition_history", "configuration_history", "time_tracking", "research"]);

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

function checkObject(value, allowed, required, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  checkExtensionsOnly(value, new Set(allowed), label, "");
  checkRequiredFields(value, required, label, "");
  if (value.extensions !== undefined && (!value.extensions || typeof value.extensions !== "object" || Array.isArray(value.extensions))) errors.push(`${label} extensions must be an object`);
  return true;
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function validTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(value);
}

function validTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
    validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function validTimezone(value) {
  if (typeof value !== "string" || !value) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

function timestampNanoseconds(value) {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1_000_000n + BigInt(fraction.padEnd(9, "0").slice(3));
}

function checkCalendar(schedule, label, strict) {
  if (!strict) {
    if (schedule.recurrence_profile === "behaviorlog.calendar_simple.v1" && schedule.anchor_local_date === undefined && (["every_n_days", "every_n_weeks_on_weekdays"].includes(schedule.recurrence?.type) || schedule.recurrence?.interval > 1)) warnings.push(`${label} missing anchor_local_date; active_from_local_date fallback has ambiguous source phase`);
    return;
  }
  if (schedule.anchor_local_date !== undefined && !validDate(schedule.anchor_local_date)) errors.push(`${label} has invalid anchor_local_date`);
  if (!["behaviorlog.calendar_simple.v1", "behaviorlog.completion_interval.v1", "rfc5545.rrule"].includes(schedule.recurrence_profile)) errors.push(`${label} has invalid recurrence_profile`);
  if (schedule.recurrence_profile !== "behaviorlog.calendar_simple.v1") {
    if (!schedule.recurrence || typeof schedule.recurrence !== "object" || Array.isArray(schedule.recurrence)) errors.push(`${label} recurrence must be an object`);
    return;
  }
  const recurrence = schedule.recurrence;
  if (!checkObject(recurrence, ["type", "interval", "weekdays", "day", "fallback", "extensions"], ["type"], `${label} recurrence`)) return;
  if (!["daily", "every_n_days", "weekly_on_weekdays", "every_n_weeks_on_weekdays", "monthly_on_day"].includes(recurrence.type)) errors.push(`${label} has invalid calendar recurrence type`);
  const intervalRequired = ["every_n_days", "every_n_weeks_on_weekdays"].includes(recurrence.type);
  const interval = recurrence.interval === undefined ? (intervalRequired ? undefined : 1) : recurrence.interval;
  if (!Number.isInteger(interval) || interval < 1) errors.push(`${label} recurrence interval must be a positive integer`);
  if ((intervalRequired || interval > 1) && schedule.anchor_local_date === undefined) {
    errors.push(`${label} anchor_local_date is required for interval recurrence`);
  }
  if (["weekly_on_weekdays", "every_n_weeks_on_weekdays"].includes(recurrence.type)) {
    if (!Array.isArray(recurrence.weekdays) || !recurrence.weekdays.length) errors.push(`${label} recurrence weekdays must be a non-empty array`);
    else {
      for (const day of recurrence.weekdays) if (!["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(day)) errors.push(`${label} has invalid weekday ${day}`);
      if (new Set(recurrence.weekdays).size !== recurrence.weekdays.length) errors.push(`${label} recurrence weekdays must be unique`);
    }
  }
  if (recurrence.type === "monthly_on_day") {
    if (!Number.isInteger(recurrence.day) || recurrence.day < 1 || recurrence.day > 31) errors.push(`${label} recurrence day must be an integer from 1 through 31`);
    if (recurrence.fallback !== undefined && recurrence.fallback !== "last_day_of_month") errors.push(`${label} has invalid monthly fallback`);
  }
  const inappropriate = ["daily", "every_n_days"].includes(recurrence.type) ? ["weekdays", "day", "fallback"] : recurrence.type === "monthly_on_day" ? ["weekdays"] : ["day", "fallback"];
  for (const field of inappropriate) if (Object.hasOwn(recurrence, field)) errors.push(`${label} recurrence ${recurrence.type} must not include ${field}`);
}

function checkConfigurationSnapshot(snapshot, label) {
  const fields = [...configurationFields];
  if (!checkObject(snapshot, [...fields, "extensions"], fields, label)) return;
  if (snapshot.category !== null && typeof snapshot.category !== "string") errors.push(`${label} category must be a string or null`);
  if (typeof snapshot.active !== "boolean") errors.push(`${label} active must be a boolean`);
  if (!validTimezone(snapshot.timezone)) errors.push(`${label} has invalid timezone`);
  if (!Array.isArray(snapshot.schedules)) errors.push(`${label} schedules must be an array`);
  else for (const [index, schedule] of snapshot.schedules.entries()) {
    const path = `${label} schedules[${index}]`;
    const required = ["recurrence_profile", "recurrence", "anchor_local_date", "time_entries"];
    if (!checkObject(schedule, [...required, "extensions"], required, path)) continue;
    checkCalendar(schedule, path, true);
    if (!Array.isArray(schedule.time_entries) || !schedule.time_entries.length) errors.push(`${path} time_entries must be a non-empty array`);
    else for (const [entryIndex, entry] of schedule.time_entries.entries()) {
      const entryPath = `${path} time_entries[${entryIndex}]`;
      const timeFields = ["local_time", "window_start_local", "window_end_local"];
      if (!checkObject(entry, [...timeFields, "extensions"], timeFields, entryPath)) continue;
      if (!validTime(entry.local_time)) errors.push(`${entryPath} has invalid local_time`);
      if ((entry.window_start_local === null) !== (entry.window_end_local === null)) errors.push(`${entryPath} window bounds must be null or present together`);
      for (const field of timeFields.slice(1)) if (entry[field] !== null && !validTime(entry[field])) errors.push(`${entryPath} has invalid ${field}`);
      if (validTime(entry.local_time) && validTime(entry.window_start_local) && localTimeValue(entry.local_time) !== localTimeValue(entry.window_start_local)) errors.push(`${entryPath} local_time must equal window_start_local for a range`);
    }
  }
  if (!Array.isArray(snapshot.intervention_rules)) errors.push(`${label} intervention_rules must be an array`);
  else for (const [index, rule] of snapshot.intervention_rules.entries()) {
    const path = `${label} intervention_rules[${index}]`;
    const required = ["intervention_type", "channel", "enabled", "offset_minutes"];
    if (!checkObject(rule, [...required, "timezone", "extensions"], required, path)) continue;
    if (!interventionTypes.has(rule.intervention_type)) errors.push(`${path} has invalid intervention_type`);
    if (!interventionChannels.has(rule.channel)) errors.push(`${path} has invalid channel`);
    if (typeof rule.enabled !== "boolean") errors.push(`${path} enabled must be a boolean`);
    if (!Number.isInteger(rule.offset_minutes)) errors.push(`${path} offset_minutes must be an integer`);
    if (rule.timezone !== undefined && !validTimezone(rule.timezone)) errors.push(`${path} has invalid timezone`);
  }
}

function localTimeValue(value) {
  const [hour, minute, second = "0"] = value.split(":");
  const [whole, fraction = ""] = second.split(".");
  return BigInt(Number(hour) * 3600 + Number(minute) * 60 + Number(whole)) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
}

function checkExchange(exchange) {
  if (!checkObject(exchange, ["fidelity", "capabilities", "losses"], ["fidelity", "losses"], "rules.exchange")) return;
  if (!["partial", "lossless"].includes(exchange.fidelity)) errors.push("rules.exchange has invalid fidelity");
  if (!Array.isArray(exchange.losses)) errors.push("rules.exchange losses must be an array");
  else {
    if (exchange.fidelity === "lossless" && exchange.losses.length) errors.push("rules.exchange lossless fidelity requires empty losses");
    for (const loss of exchange.losses) {
      if (!checkObject(loss, ["path", "reason"], ["path", "reason"], "rules.exchange loss")) continue;
      for (const field of ["path", "reason"]) if (typeof loss[field] !== "string" || !loss[field].trim()) errors.push(`rules.exchange loss ${field} must be a non-empty string`);
    }
  }
  if (exchange.capabilities !== undefined && checkObject(exchange.capabilities, ["read", "preserve", "operate"], [], "rules.exchange capabilities")) {
    for (const key of ["read", "preserve", "operate"]) {
      if (exchange.capabilities[key] === undefined) continue;
      if (!Array.isArray(exchange.capabilities[key]) || exchange.capabilities[key].some((value) => typeof value !== "string" || !value.trim())) errors.push(`rules.exchange capabilities.${key} must be an array of non-empty strings`);
      else if (new Set(exchange.capabilities[key]).size !== exchange.capabilities[key].length) errors.push(`rules.exchange capabilities.${key} must be unique`);
    }
  }
}

for (const rel of requiredFiles) {
  if (!existsSync(join(bundlePath, rel))) errors.push(`missing required file: ${rel}`);
}

const manifest = existsSync(join(bundlePath, "manifest.json")) ? parseJson("manifest.json") : null;
const version = String(manifest?.schema_version ?? "").match(/^(\d+)\.(\d+)/);
const explicitCalendar = Boolean(version && (Number(version[1]) > 0 || Number(version[2]) >= 3));
if (manifest) {
  if (manifest.format !== "behaviorlog.bundle") errors.push("manifest.format must be behaviorlog.bundle");
  if (!manifest.schema_version) errors.push("manifest.schema_version is required");
  if (!manifest.files || !Array.isArray(manifest.files)) errors.push("manifest.files must be an array");
  if (manifest.rules?.exchange !== undefined) checkExchange(manifest.rules.exchange);
  if (manifest.rules?.required_extensions !== undefined && (!Array.isArray(manifest.rules.required_extensions) || manifest.rules.required_extensions.some((value) => typeof value !== "string" || !value.trim()))) errors.push("rules.required_extensions must be an array of non-empty strings");
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
      ["data/behavior_configuration_events.jsonl", "configuration_history"],
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
const configurationEvents = parseJsonl("data/behavior_configuration_events.jsonl", "behavior_configuration_event");
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
const configurationEventIds = hasDuplicateIds(configurationEvents, "event_id", "behavior_configuration_events");
const sessionIds = hasDuplicateIds(timeSessions, "session_id", "time_sessions");

const behaviorAllowed = new Set(["record_type","behavior_id","title","description","category","success_definition","expected_duration_minutes","created_at_utc","archived_at_utc","source","sensitivity","extensions"]);
const scheduleAllowed = new Set(["record_type","schedule_id","behavior_id","recurrence_profile","recurrence","timezone","local_time","window_start_local","window_end_local","active_from_local_date","active_until_local_date","anchor_local_date","effective_from_utc","effective_until_utc","schedule_role","schedule_group_id","source","extensions"]);
const occurrenceAllowed = new Set(["record_type","occurrence_id","behavior_id","schedule_id","configuration_event_id","scheduled_for_utc","local_date","local_time","timezone","utc_offset_at_event","due_window_start_utc","due_window_end_utc","generated_at_utc","generation_rule_id","occurrence_state","current_status","source","extensions"]);
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
if (explicitCalendar) metricRequired.push("numerator", "denominator");
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
  checkCalendar(s, `schedule ${s.schedule_id}`, explicitCalendar);
  if (s.schedule_role !== undefined && !["generating", "historical_reference"].includes(s.schedule_role)) errors.push(`schedule ${s.schedule_id} has invalid schedule_role`);
  if (s.schedule_group_id !== undefined && s.schedule_group_id !== null && typeof s.schedule_group_id !== "string") errors.push(`schedule ${s.schedule_id} has invalid schedule_group_id`);
  if (s.effective_from_utc !== undefined && !validTimestamp(s.effective_from_utc)) errors.push(`schedule ${s.schedule_id} has invalid effective_from_utc`);
  if (s.effective_until_utc !== undefined && s.effective_until_utc !== null && !validTimestamp(s.effective_until_utc)) errors.push(`schedule ${s.schedule_id} has invalid effective_until_utc`);
  if (validTimestamp(s.effective_from_utc) && validTimestamp(s.effective_until_utc) && timestampNanoseconds(s.effective_until_utc) < timestampNanoseconds(s.effective_from_utc)) errors.push(`schedule ${s.schedule_id} effective_until_utc precedes effective_from_utc`);
}
const configurationEventsById = new Map(configurationEvents.map((event) => [event.event_id, event]));
for (const o of occurrences) {
  checkExtensionsOnly(o, occurrenceAllowed, "occurrences", o.occurrence_id);
  checkRequiredFields(o, occurrenceRequired, "occurrences", o.occurrence_id);
  if (!behaviorIds.has(o.behavior_id)) errors.push(`occurrence ${o.occurrence_id} references missing behavior ${o.behavior_id}`);
  if (!scheduleIds.has(o.schedule_id)) errors.push(`occurrence ${o.occurrence_id} references missing schedule ${o.schedule_id}`);
  if (Object.hasOwn(o, "current_status") && !statuses.has(o.current_status)) errors.push(`occurrence ${o.occurrence_id} has invalid current_status ${o.current_status}`);
  if (Object.hasOwn(o, "occurrence_state") && !occurrenceStates.has(o.occurrence_state)) errors.push(`occurrence ${o.occurrence_id} has invalid occurrence_state ${o.occurrence_state}`);
  if (o.configuration_event_id !== undefined && o.configuration_event_id !== null) {
    if (!configurationEventIds.has(o.configuration_event_id)) errors.push(`occurrence ${o.occurrence_id} references missing configuration event ${o.configuration_event_id}`);
    else if (configurationEventsById.get(o.configuration_event_id).behavior_id !== o.behavior_id) errors.push(`occurrence ${o.occurrence_id} configuration event belongs to a different behavior`);
  }
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
for (const e of configurationEvents) {
  const label = `configuration event ${e.event_id}`;
  const required = ["record_type", "event_id", "behavior_id", "event_kind", "previous", "next", "changed_fields", "recorded_at_utc", "effective_at_utc", "effective_local_date", "timezone", "source"];
  checkObject(e, [...required, "reason_code", "extensions"], required, label);
  for (const field of ["event_id", "behavior_id"]) if (typeof e[field] !== "string" || !e[field]) errors.push(`${label} ${field} must be a non-empty string`);
  if (!behaviorIds.has(e.behavior_id)) errors.push(`${label} references missing behavior ${e.behavior_id}`);
  if (!eventKinds.has(e.event_kind)) errors.push(`${label} has invalid event_kind`);
  if (e.event_kind === "baseline" && e.previous !== null) errors.push(`${label} baseline must have null previous`);
  if (e.event_kind === "revision" && e.previous === null) errors.push(`${label} revision must have non-null previous`);
  if (e.previous !== null) checkConfigurationSnapshot(e.previous, `${label} previous`);
  checkConfigurationSnapshot(e.next, `${label} next`);
  if (!Array.isArray(e.changed_fields)) errors.push(`${label} changed_fields must be an array`);
  else {
    const changed = new Set(e.changed_fields);
    if (changed.size !== e.changed_fields.length) errors.push(`${label} changed_fields must be unique`);
    for (const field of changed) if (!configurationFields.has(field)) errors.push(`${label} has invalid changed_fields item ${field}`);
    if (e.event_kind === "baseline" && !isDeepStrictEqual(e.changed_fields, [...configurationFields])) errors.push(`${label} baseline changed_fields must list every snapshot field in canonical order`);
    if (e.event_kind === "revision" && e.changed_fields.length === 0 && (typeof e.source?.transformation_notes !== "string" || !e.source.transformation_notes.trim())) errors.push(`${label} empty changed_fields requires non-empty source.transformation_notes explaining the source-only change`);
    if (e.event_kind === "revision" && e.previous && e.next) {
      for (const field of configurationFields) {
        if (!isDeepStrictEqual(e.previous[field], e.next[field]) && !changed.has(field)) errors.push(`${label} changed_fields omits changed ${field}`);
        if (changed.has(field) && (!Object.hasOwn(e.previous, field) || !Object.hasOwn(e.next, field))) errors.push(`${label} changed_fields ${field} must appear in previous and next`);
      }
      const actual = [...configurationFields].filter((field) => !isDeepStrictEqual(e.previous[field], e.next[field]));
      if (!isDeepStrictEqual(e.changed_fields, actual)) errors.push(`${label} changed_fields must match changed snapshot fields in canonical order`);
    }
  }
  for (const field of ["recorded_at_utc", "effective_at_utc"]) if (!validTimestamp(e[field])) errors.push(`${label} has invalid ${field}`);
  if (!validDate(e.effective_local_date)) errors.push(`${label} has invalid effective_local_date`);
  if (!validTimezone(e.timezone)) errors.push(`${label} has invalid timezone`);
  else if (validTimestamp(e.effective_at_utc)) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: e.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(e.effective_at_utc)).map((part) => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` !== e.effective_local_date) errors.push(`${label} effective_local_date does not match effective_at_utc in timezone`);
  }
  if (e.next?.timezone !== e.timezone) errors.push(`${label} timezone must match next.timezone`);
  if (e.reason_code !== undefined && e.reason_code !== null && typeof e.reason_code !== "string") errors.push(`${label} reason_code must be a string or null`);
  if (checkObject(e.source, ["producer", "producer_version", "original_id", "capture_method", "imported_from", "confidence", "transformation_notes"], [], `${label} source`)) {
    if (e.source.capture_method !== undefined && !["manual_tap", "manual_text", "system_generated", "imported", "inferred", "derived", "ai_generated", "unknown"].includes(e.source.capture_method)) errors.push(`${label} source has invalid capture_method`);
    if (e.source.confidence !== undefined && !["high", "medium", "low", "ambiguous", "unknown"].includes(e.source.confidence)) errors.push(`${label} source has invalid confidence`);
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
