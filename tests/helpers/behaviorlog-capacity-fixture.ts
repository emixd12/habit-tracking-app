import { Temporal } from "@js-temporal/polyfill";
import { assembleExportBundle, type ExportAssemblyInput } from "@cadence/core/services/export-assembly";
import { storedBehavior, storedConfigurationEvent, storedExportOccurrence, USER_ID, uuid } from "./export-row-fixture";

export const CAPACITY_NOW = Temporal.Instant.from("2026-01-03T12:00:00Z");

/** Five years, four daily Behaviors, explicit corrections, Unicode Notes and timing. */
export function capacityExport(nativeReminders = false) {
  const start = Temporal.PlainDate.from("2021-01-01");
  const end = Temporal.PlainDate.from("2026-01-01");
  const created = "2021-01-01T12:00:00Z";
  const input: ExportAssemblyInput = {
    ...(nativeReminders ? { nativeReminders: [] } : {}),
    now: CAPACITY_NOW, userId: USER_ID, timezone: "America/New_York", range: "all",
    includeNotes: true, includeTimeTracking: true, includeArchived: true,
    categories: [], behaviors: [], behaviorDefinitionEvents: [], behaviorConfigurationEvents: [],
    occurrences: [], statusEvents: [], timeSessions: [], reminderDeliveries: [],
  };
  for (let behaviorIndex = 0; behaviorIndex < 4; behaviorIndex++) {
    const behaviorId = uuid(100 + behaviorIndex);
    const title = ["Walk", "Read", "Stretch", "Practice piano", "Water plants", "Journal", "Study Spanish", "Tidy kitchen"][behaviorIndex];
    const hour = 8 + behaviorIndex;
    const scheduledTime = `${String(hour).padStart(2, "0")}:00:00`;
    let previous: ReturnType<typeof storedConfigurationEvent>["next_configuration"] | null = null;
    for (let year = 2021; year <= 2025; year++) {
      const configuration = { ...storedConfigurationEvent().next_configuration, reminder_offset_minutes: (year - 2021) * 5,
        schedule_graph: [{ recurrence_rule: { frequency: "daily", interval: 1 }, sort_order: 0,
          time_entries: [{ kind: "exact", preset: null, start_time: scheduledTime, end_time: null, sort_order: 0 }] }] };
      const stamp = `${year}-01-01T12:00:00Z`;
      input.behaviorConfigurationEvents.push({ ...storedConfigurationEvent(), id: uuid(1000 + behaviorIndex * 10 + year - 2021),
        behavior_id: behaviorId, event_kind: previous ? "revision" : "baseline", previous_configuration: previous,
        next_configuration: configuration, changed_fields: previous ? ["reminder_offset_minutes"] : storedConfigurationEvent().changed_fields,
        recorded_at: stamp, effective_at: stamp, effective_local_date: `${year}-01-01`, created_at: stamp });
      input.behaviorDefinitionEvents.push({ id: uuid(2000 + behaviorIndex * 10 + year - 2021), behavior_id: behaviorId,
        previous_title: year === 2021 ? null : title, next_title: title,
        previous_description: year === 2021 ? null : `${year - 1} plan — steady practice`, next_description: `${year} plan — steady practice`,
        changed_fields: year === 2021 ? ["title", "description"] : ["description"], source: "manual", reason: null,
        recorded_at: stamp, created_at: stamp, updated_at: stamp });
      previous = configuration;
    }
    input.behaviors.push({ ...storedBehavior(), id: behaviorId, title, description: "2025 plan — steady practice",
      current_configuration_event_id: uuid(1000 + behaviorIndex * 10 + 4), reminder_offset_minutes: 20,
      scheduled_time: scheduledTime, created_at: created, updated_at: "2025-01-01T12:00:00Z" });
    for (let date = start, day = 0; Temporal.PlainDate.compare(date, end) < 0; date = date.add({ days: 1 }), day++) {
      const sequence = behaviorIndex * 2000 + day;
      const occurrenceId = uuid(10_000 + sequence);
      const scheduled = date.toZonedDateTime({ timeZone: input.timezone, plainTime: scheduledTime }).toInstant();
      const marked = scheduled.add({ minutes: 15, microseconds: 123456 });
      const corrected = day % 17 === 0;
      const status = day % 9 === 0 && !corrected ? "unresolved" : day % 5 === 0 && !corrected ? "not_completed" : "completed";
      const recorded = corrected ? marked.add({ minutes: 20 }) : marked;
      input.occurrences.push({ ...storedExportOccurrence(), id: occurrenceId, behavior_id: behaviorId,
        behavior_configuration_event_id: uuid(1000 + behaviorIndex * 10 + date.year - 2021),
        scheduled_for: scheduled.toString(), local_date: date.toString(), schedule_start_time: scheduledTime,
        status, completed_at: status === "completed" ? recorded.toString() : null,
        status_marked_at: status === "unresolved" ? null : recorded.toString(),
        note: day % 7 === 0 ? `Week ${Math.floor(day / 7)}: ${title}. Travel changed the timing; café practice still counted. Entry ${sequence}.` : null,
        created_at: scheduled.subtract({ hours: 24 }).toString(), updated_at: recorded.toString() });
      if (status !== "unresolved") {
        const event = { id: uuid(40_000 + sequence), occurrence_id: occurrenceId, behavior_id: behaviorId,
          previous_status: "unresolved", status: corrected ? "not_completed" : status, status_semantics: "explicit_user_mark",
          recorded_at: marked.toString(), effective_at: marked.toString(), local_date: date.toString(), timezone: input.timezone,
          source_capture_method: "manual_tap", source_confidence: "high", revises_event_id: null, reason_code: null,
          created_at: marked.toString(), updated_at: marked.toString() };
        input.statusEvents.push(event);
        if (corrected) input.statusEvents.push({ ...event, id: uuid(70_000 + sequence), previous_status: "not_completed", status,
          status_semantics: "explicit_user_correction", revises_event_id: event.id, recorded_at: recorded.toString(),
          effective_at: recorded.toString(), created_at: recorded.toString(), updated_at: recorded.toString() });
      }
      if (day % 5 === 0) input.timeSessions.push({ id: uuid(100_000 + sequence), behavior_id: behaviorId, occurrence_id: occurrenceId,
        started_at: scheduled.toString(), stopped_at: marked.toString() });
    }
  }
  return assembleExportBundle(input);
}

/** Compare captured values and relationships while allowing fresh local IDs and import provenance. */
export function capacityHistory(files: { path: string; content: string }[]) {
  const records = (name: string): Record<string, unknown>[] => (files.find(file => file.path === `data/${name}.jsonl`)?.content ?? "")
    .split("\n").filter(Boolean).map(line => JSON.parse(line));
  const behaviors = new Map(records("behaviors").map(row => [row.behavior_id, row.title]));
  // Web export also materializes today; compare the complete five-year capture.
  const occurrences = records("occurrences").filter(row => String(row.local_date) < "2026-01-01");
  const occurrenceKeys = new Map(occurrences.map(row => [row.occurrence_id, `${behaviors.get(row.behavior_id)}:${row.scheduled_for_utc}`]));
  const statusKeys = new Map(records("status_events").map(row => [row.event_id, `${occurrenceKeys.get(row.occurrence_id)}:${row.recorded_at_utc}:${row.status}`]));
  const configurations = new Map(records("behavior_configuration_events").map(row => [row.event_id, `${behaviors.get(row.behavior_id)}:${row.recorded_at_utc}`]));
  const schedules = new Map(records("schedules").map(row => [row.schedule_id, row]));
  const pick = (row: Record<string, unknown>, fields: string[]) => fields.map(field => row[field] ?? null);
  const sorted = (rows: unknown[][]) => {
    const normalized = JSON.parse(JSON.stringify(rows, (_key, value) => {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        try { return Temporal.Instant.from(value).toString(); } catch { return value; }
      }
      if (typeof value === "string" && /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) return Temporal.PlainTime.from(value).toString();
      return value;
    })) as unknown[][];
    return normalized.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  };
  return {
    occurrences: sorted(occurrences.map(row => [occurrenceKeys.get(row.occurrence_id),
      ...pick(row, ["scheduled_for_utc", "local_date", "local_time", "timezone", "utc_offset_at_event", "due_window_start_utc", "due_window_end_utc", "generated_at_utc", "current_status"]),
      configurations.get(row.configuration_event_id), behaviors.get(schedules.get(row.schedule_id)?.behavior_id), schedules.get(row.schedule_id)?.local_time])),
    statuses: sorted(records("status_events").map(row => [occurrenceKeys.get(row.occurrence_id), behaviors.get(row.behavior_id),
      ...pick(row, ["previous_status", "status", "recorded_at_utc", "effective_at_utc", "local_date", "timezone", "reason_code"]),
      statusKeys.get(row.revises_event_id) ?? null])),
    notes: sorted(records("notes").map(row => [occurrenceKeys.get(row.attached_to_id), ...pick(row, ["body_markdown", "note_role", "created_at_utc", "updated_at_utc", "sensitivity"])])),
    timing: sorted(records("time_sessions").map(row => [occurrenceKeys.get(row.occurrence_id), behaviors.get(row.behavior_id), ...pick(row, ["started_at_utc", "stopped_at_utc"])])),
    definitions: sorted(records("behavior_definition_events").map(row => [behaviors.get(row.behavior_id), ...pick(row, ["event_kind", "previous", "next", "changed_fields", "recorded_at_utc", "reason_code"])])),
    configurations: sorted(records("behavior_configuration_events").filter(row => String(row.recorded_at_utc) < "2026").map(row => [behaviors.get(row.behavior_id), ...pick(row, ["event_kind", "previous", "next", "changed_fields", "recorded_at_utc", "effective_at_utc", "effective_local_date", "timezone"])])),
  };
}
