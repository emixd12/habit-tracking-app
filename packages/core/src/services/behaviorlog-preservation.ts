import { Temporal } from "@js-temporal/polyfill";
import type { BehaviorLogImportFile, BehaviorLogImportIssue, BehaviorLogImportPlan, BehaviorLogImportSchedulePlan, BehaviorLogPortabilityData } from "../types/behaviorlog-import";
import { sha256 } from "../hash";
import type { Json } from "../types/json";

export const CONFIGURATION_HISTORY_PATH = "data/behavior_configuration_events.jsonl";
const MAX_PRESERVATION_BYTES = 262_144;
const fields = ["category", "schedules", "intervention_rules", "active", "timezone"];
type RecordValue = Record<string, unknown>;

// Preserve known passive history, never arbitrary archives or executable instructions.
export function collectBehaviorLogPortability(input: {
  files: BehaviorLogImportFile[]; manifest: RecordValue | null; plan: BehaviorLogImportPlan;
  errors: BehaviorLogImportIssue[]; warnings: BehaviorLogImportIssue[];
}): BehaviorLogPortabilityData {
  const fail = (message: string, path = CONFIGURATION_HISTORY_PATH) => input.errors.push({ severity: "error", code: "portability_invalid", message, file: path });
  const warn = (path: string, reason: string) => input.warnings.push({ severity: "warning", code: "portability_loss", message: `${path}: ${reason}`, file: path });
  const rules = object(input.manifest?.rules);
  const exchange = object(rules?.exchange);
  for (const loss of Array.isArray(exchange?.losses) ? exchange.losses : []) {
    const entry = object(loss);
    if (typeof entry?.path === "string" && typeof entry.reason === "string") warn(entry.path, `Source exporter declared: ${entry.reason}`);
  }
  if (rules?.required_extensions !== undefined && (!Array.isArray(rules.required_extensions) || rules.required_extensions.length > 0)) {
    fail("Cadence cannot apply bundles requiring extension semantics it does not implement.", "manifest.json");
  }
  const supportedProfiles = new Set(["core", "intervention", "definition_history", "time_tracking", "configuration_history"]);
  for (const profile of Array.isArray(input.manifest?.profiles) ? input.manifest.profiles : []) {
    if (typeof profile === "string" && !supportedProfiles.has(profile)) warn("manifest.json", `Profile ${profile} is not operated or preserved by Cadence.`);
  }
  const knownFiles = new Set(["manifest.json", "schema.json", "README.md", "AGENTS.md", CONFIGURATION_HISTORY_PATH,
    ...["behaviors", "schedules", "occurrences", "status_events", "behavior_definition_events", "time_sessions", "intervention_rules", "notes", "interventions"].map((name) => `data/${name}.jsonl`)]);
  for (const file of input.files) {
    if (!knownFiles.has(file.path) && !file.path.startsWith("csv/")) warn(file.path, "This optional file is not preserved. Keep the original bundle if it matters.");
  }
  const events: BehaviorLogPortabilityData["configurationEvents"] = [];
  const eventOwners = new Map<string, string>();
  const behaviorIds = new Set(input.plan.behaviors.map((row) => row.externalId));
  const file = input.files.find((row) => row.path === CONFIGURATION_HISTORY_PATH);
  if (file && !(Array.isArray(input.manifest?.files) && input.manifest.files.some((entry) => object(entry)?.path === CONFIGURATION_HISTORY_PATH))) {
    fail("Preserved configuration history must be listed and hashed in manifest.json.");
  }
  let removedExtensions = false;
  for (const [index, line] of (file?.content ?? "").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const event: unknown = JSON.parse(line);
      checkEvent(event);
      const row = event as RecordValue;
      const id = String(row.event_id), owner = String(row.behavior_id);
      if (eventOwners.has(id)) throw new Error("Configuration event IDs must be unique.");
      if (!behaviorIds.has(owner)) throw new Error("Configuration event behavior is absent.");
      eventOwners.set(id, owner);
      const clean = JSON.parse(JSON.stringify(row, (key, value) => {
        if (key === "extensions") {
          const cadence = object(object(value)?.["app.cadence"]);
          const retained: RecordValue = {};
          for (const [key, entry] of Object.entries(cadence ?? {})) {
            if ((key === "category_id" && (entry === null || typeof entry === "string")) ||
              (key === "sort_order" && Number.isInteger(entry)) ||
              (key === "preset" && (entry === null || ["morning", "afternoon", "evening", "night"].includes(String(entry)))) ||
              (key === "native_notification" && typeof entry === "boolean")) retained[key] = entry;
            else removedExtensions = true;
          }
          if (Object.keys(object(value) ?? {}).some((namespace) => namespace !== "app.cadence")) removedExtensions = true;
          return Object.keys(retained).length ? { "app.cadence": retained } : undefined;
        }
        return value;
      })) as { [key: string]: Json | undefined };
      if (canonical(row) !== canonical(clean)) {
        clean.changed_fields = clean.event_kind === "baseline" ? fields : fields.filter((field) =>
          canonical((clean.previous as RecordValue)[field]) !== canonical((clean.next as RecordValue)[field]));
        const source = object(clean.source)!;
        clean.source = { ...source, transformation_notes: [source.transformation_notes,
          "Cadence omitted unsupported configuration extensions during import; changed_fields describes the retained snapshots."]
          .filter((entry) => typeof entry === "string" && entry.length > 0).join(" ") } as Json;
      }
      checkEvent(clean);
      events.push(clean);
    } catch (error) { fail(`Configuration history row ${index + 1}: ${error instanceof Error ? error.message : "Invalid record."}`); }
  }
  if (removedExtensions) warn(CONFIGURATION_HISTORY_PATH, "Unrecognized configuration extensions are not preserved; standard snapshot fields are retained.");
  const sourceOccurrences = new Map<string, RecordValue>();
  for (const line of (input.files.find((row) => row.path === "data/occurrences.jsonl")?.content ?? "").split(/\r?\n/)) {
    try { const value = object(JSON.parse(line)); if (value && typeof value.occurrence_id === "string") sourceOccurrences.set(value.occurrence_id, value); } catch { /* The main parser reports malformed rows. */ }
  }
  const occurrences = input.plan.occurrences.map((row) => {
    const source = sourceOccurrences.get(row.externalId);
    if (source?.configuration_event_id !== undefined && source.configuration_event_id !== null && !text(source.configuration_event_id)) fail(`Occurrence ${row.externalId} has invalid configuration_event_id.`, "data/occurrences.jsonl");
    const configurationEventId = typeof source?.configuration_event_id === "string" ? source.configuration_event_id : null;
    if (configurationEventId && eventOwners.get(configurationEventId) !== row.behaviorExternalId) fail(`Occurrence ${row.externalId} references absent or foreign configuration history.`, "data/occurrences.jsonl");
    return { externalId: row.externalId, behaviorExternalId: row.behaviorExternalId, timezone: row.timezone,
      scheduledForUtc: row.scheduledForUtc, localDate: row.localDate, configurationEventId };
  });
  for (const line of (input.files.find((row) => row.path === "data/schedules.jsonl")?.content ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const schedule = object(JSON.parse(line)); if (!schedule) continue;
      const recurrence = object(schedule.recurrence);
      if (schedule.anchor_local_date !== undefined) date(schedule.anchor_local_date);
      if (schedule.effective_from_utc !== undefined) instant(schedule.effective_from_utc);
      if (schedule.effective_until_utc !== undefined && schedule.effective_until_utc !== null) instant(schedule.effective_until_utc);
      if (typeof schedule.effective_from_utc === "string" && typeof schedule.effective_until_utc === "string") expect(Temporal.Instant.compare(schedule.effective_from_utc, schedule.effective_until_utc) <= 0, "Schedule effective end precedes its start.");
      expect(schedule.schedule_role === undefined || ["generating", "historical_reference"].includes(String(schedule.schedule_role)), "Invalid schedule role.");
      if (input.manifest?.schema_version === "0.3.0-draft" && schedule.recurrence_profile === "behaviorlog.calendar_simple.v1" &&
        (recurrence?.type === "every_n_days" || recurrence?.type === "every_n_weeks_on_weekdays" || Number(recurrence?.interval) > 1)) {
        expect(schedule.anchor_local_date !== undefined, "Version 0.3 interval schedules require anchor_local_date.");
      }
    } catch (error) { fail(error instanceof Error ? error.message : "Invalid schedule portability fields.", "data/schedules.jsonl"); }
  }
  const categories: NonNullable<BehaviorLogPortabilityData["categories"]> = [];
  const registry = object(object(input.manifest?.extensions)?.["app.cadence"])?.categories;
  if (registry !== undefined) {
    try {
      expect(Array.isArray(registry), "Cadence category registry must be an array.");
      const ids = new Set<string>();
      for (const value of registry) {
        const row = record(value, ["id", "name", "sort_order", "created_at", "updated_at"], ["id", "name", "sort_order"]);
        expect(text(row.id) && typeof row.name === "string" && Number.isInteger(row.sort_order) && !ids.has(row.id), "Invalid or duplicate Cadence category registry entry.");
        for (const key of ["created_at", "updated_at"]) {
          if (row[key] !== undefined) { expect(text(row[key]), "Invalid category timestamp."); Temporal.Instant.from(row[key]); }
        }
        ids.add(row.id);
        categories.push(row as NonNullable<BehaviorLogPortabilityData["categories"]>[number]);
      }
    } catch (error) { fail(error instanceof Error ? error.message : "Invalid category registry.", "manifest.json"); }
  }
  const scheduleIdentities = input.plan.schedules.filter((schedule) => schedule.action === "create").map((schedule) => ({
    externalId: schedule.externalId, behaviorExternalId: schedule.behaviorExternalId, fingerprint: behaviorLogScheduleIdentity(schedule),
  }));
  const result = { version: 1 as const, configurationEvents: events, occurrences, categories, scheduleIdentities };
  if (utf8Size(JSON.stringify(result)) > MAX_PRESERVATION_BYTES) fail("Known portability metadata exceeds the 256 KiB import limit. Split the bundle; Cadence will not silently discard history.");
  return result;
}

// Bind every captured source field; apply decisions are not source identity.
export function behaviorLogScheduleIdentity(schedule: BehaviorLogImportSchedulePlan): string {
  const { action: _action, skipReasons: _skipReasons, ...captured } = schedule;
  void _action; void _skipReasons;
  return sha256(canonical(captured));
}

export function withBehaviorLogPortability(summary: Json, portability: BehaviorLogPortabilityData | undefined): Json {
  if (!portability) return summary;
  if (utf8Size(JSON.stringify(portability)) > MAX_PRESERVATION_BYTES) throw new Error("Known portability metadata exceeds the 256 KiB import limit.");
  return { ...(summary as { [key: string]: Json }), portability: portability as unknown as Json };
}

function utf8Size(value: string): number {
  let bytes = 0;
  for (const character of value) { const code = character.codePointAt(0)!; bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  return bytes;
}
function object(value: unknown): RecordValue | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null; }
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function record(value: unknown, allowed: string[], required: string[]): RecordValue {
  const row = object(value); expect(row, "Expected an object.");
  expect(Object.keys(row).every((key) => allowed.includes(key)), "Unknown fields must use extensions.");
  expect(required.every((key) => key in row), "Required configuration fields are missing.");
  if (row.extensions !== undefined) expect(object(row.extensions), "Extensions must be an object.");
  return row;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function zone(value: unknown) { expect(text(value) && !/^[+-]/.test(value), "IANA timezone is required."); Temporal.Instant.from("2000-01-01T00:00:00Z").toZonedDateTimeISO(value); }
function date(value: unknown) { expect(text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value), "Invalid local date."); Temporal.PlainDate.from(value); }
function instant(value: unknown) { expect(text(value) && /Z$/.test(value), "UTC timestamp is required."); Temporal.Instant.from(value); }
function localTime(value: unknown) { expect(text(value) && /^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(value), "Invalid local time."); Temporal.PlainTime.from(value); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = object(value);
  return row ? `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}` : JSON.stringify(value);
}
function checkEvent(value: unknown) {
  const required = ["record_type", "event_id", "behavior_id", "event_kind", "previous", "next", "changed_fields", "recorded_at_utc", "effective_at_utc", "effective_local_date", "timezone", "source"];
  const row = record(value, [...required, "reason_code", "extensions"], required);
  expect(row.record_type === "behavior_configuration_event" && text(row.event_id) && text(row.behavior_id), "Invalid configuration event identity.");
  expect(row.event_kind === "baseline" || row.event_kind === "revision", "Invalid configuration event kind.");
  expect(Array.isArray(row.changed_fields) && new Set(row.changed_fields).size === row.changed_fields.length && row.changed_fields.every((field) => typeof field === "string" && fields.includes(field)), "Invalid configuration changed_fields.");
  if (row.event_kind === "baseline") { expect(row.previous === null, "Baseline previous must be null."); expect((row.changed_fields as unknown[]).length === fields.length, "Baseline must declare all configuration fields."); } else checkSnapshot(row.previous);
  checkSnapshot(row.next); instant(row.recorded_at_utc); instant(row.effective_at_utc); date(row.effective_local_date); zone(row.timezone);
  expect(Temporal.Instant.from(String(row.effective_at_utc)).toZonedDateTimeISO(String(row.timezone)).toPlainDate().toString() === row.effective_local_date, "Configuration effective_local_date disagrees with its timestamp and timezone.");
  const actual = row.event_kind === "baseline" ? fields : fields.filter((field) => canonical((row.previous as RecordValue)[field]) !== canonical((row.next as RecordValue)[field]));
  expect(canonical(actual) === canonical(row.changed_fields), "Configuration changed_fields must match snapshot changes in canonical order.");
  expect(row.reason_code === undefined || row.reason_code === null || typeof row.reason_code === "string", "Invalid reason code.");
  const source = record(row.source, ["producer", "producer_version", "original_id", "capture_method", "imported_from", "confidence", "transformation_notes"], []);
  if (!actual.length) expect(typeof source.transformation_notes === "string" && source.transformation_notes.trim().length > 0, "An extension-only revision requires source transformation_notes.");
  for (const [key, value] of Object.entries(source)) {
    if (key === "capture_method") expect(["manual_tap", "manual_text", "system_generated", "imported", "inferred", "derived", "ai_generated", "unknown"].includes(String(value)), "Invalid source capture method.");
    else if (key === "confidence") expect(["high", "medium", "low", "ambiguous", "unknown"].includes(String(value)), "Invalid source confidence.");
    else expect(typeof value === "string" || (key !== "producer" && value === null), "Invalid configuration source.");
  }
}
function checkSnapshot(value: unknown) {
  const row = record(value, [...fields, "extensions"], fields);
  expect(row.category === null || typeof row.category === "string", "Invalid category.");
  expect(typeof row.active === "boolean", "Invalid active state."); zone(row.timezone);
  expect(Array.isArray(row.schedules) && Array.isArray(row.intervention_rules), "Snapshot schedules and intervention_rules must be arrays.");
  for (const value of row.schedules) {
    const schedule = record(value, ["recurrence_profile", "recurrence", "anchor_local_date", "time_entries", "extensions"], ["recurrence_profile", "recurrence", "anchor_local_date", "time_entries"]);
    expect(["behaviorlog.calendar_simple.v1", "behaviorlog.completion_interval.v1", "rfc5545.rrule"].includes(String(schedule.recurrence_profile)) && object(schedule.recurrence), "Invalid recurrence snapshot."); date(schedule.anchor_local_date);
    if (schedule.recurrence_profile === "behaviorlog.calendar_simple.v1") checkCalendarRecurrence(schedule.recurrence);
    expect(Array.isArray(schedule.time_entries) && schedule.time_entries.length > 0, "Time entries must not be empty.");
    for (const value of schedule.time_entries) {
      const entry = record(value, ["local_time", "window_start_local", "window_end_local", "extensions"], ["local_time", "window_start_local", "window_end_local"]);
      localTime(entry.local_time);
      expect((entry.window_start_local === null) === (entry.window_end_local === null), "Window bounds must both be null or both be times.");
      if (entry.window_start_local !== null) {
        localTime(entry.window_start_local); localTime(entry.window_end_local);
        expect(Temporal.PlainTime.compare(String(entry.local_time), String(entry.window_start_local)) === 0, "Range local_time must equal window_start_local.");
      }
    }
  }
  for (const value of row.intervention_rules) {
    const rule = record(value, ["intervention_type", "channel", "enabled", "offset_minutes", "timezone", "extensions"], ["intervention_type", "channel", "enabled", "offset_minutes"]);
    expect(["reminder", "prompt", "nudge", "suppression", "snooze", "dismissal", "feedback", "other"].includes(String(rule.intervention_type)) &&
      ["browser_push", "email", "sms", "mobile_push", "in_app", "calendar_notification", "voice_assistant", "webhook", "other", "none"].includes(String(rule.channel)) &&
      typeof rule.enabled === "boolean" && Number.isInteger(rule.offset_minutes), "Invalid intervention rule snapshot.");
    if (rule.timezone !== undefined) zone(rule.timezone);
  }
}

function checkCalendarRecurrence(value: unknown) {
  const row = record(value, ["type", "interval", "weekdays", "day", "fallback", "extensions"], ["type"]);
  expect(["daily", "every_n_days", "weekly_on_weekdays", "every_n_weeks_on_weekdays", "monthly_on_day"].includes(String(row.type)), "Invalid calendar recurrence type.");
  if (row.interval !== undefined || row.type === "every_n_days" || row.type === "every_n_weeks_on_weekdays") expect(Number.isInteger(row.interval) && Number(row.interval) >= 1, "Invalid calendar interval.");
  if (row.type === "weekly_on_weekdays" || row.type === "every_n_weeks_on_weekdays") {
    expect(Array.isArray(row.weekdays) && row.weekdays.length > 0 && new Set(row.weekdays).size === row.weekdays.length && row.weekdays.every((day) => ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(String(day))), "Invalid recurrence weekdays.");
  } else expect(row.weekdays === undefined, "Unexpected recurrence weekdays.");
  if (row.type === "monthly_on_day") {
    expect(Number.isInteger(row.day) && Number(row.day) >= 1 && Number(row.day) <= 31 && (row.fallback === undefined || row.fallback === "last_day_of_month"), "Invalid monthly recurrence.");
  } else expect(row.day === undefined && row.fallback === undefined, "Unexpected monthly recurrence fields.");
}
