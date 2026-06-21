#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const outputPath = join(process.cwd(), "public", "examples", "cadence-demo.behaviorlog.zip");
const exportedAt = "2026-06-20T14:00:00Z";
const timezone = "America/New_York";

const source = {
  producer: "Cadence Tracker",
  producer_version: "0.1.0",
  original_id: null,
  capture_method: "system_generated",
  imported_from: null,
  confidence: "high",
  transformation_notes: "Sanitized demo bundle generated for the public marketing site.",
};

const behavior = {
  record_type: "behavior",
  behavior_id: "behavior_morning_walk",
  title: "Morning walk",
  description: "Demo behavior used for BehaviorLog inspection.",
  category: "Wellbeing",
  success_definition: "Complete Morning walk for each scheduled occurrence.",
  expected_duration_minutes: null,
  created_at_utc: "2026-06-18T12:00:00Z",
  archived_at_utc: null,
  source: { ...source, original_id: "behavior_morning_walk", capture_method: "manual_text" },
  sensitivity: "medium",
  extensions: {
    "app.cadence": {
      active: true,
      browser_reminder_enabled: true,
      email_reminder_enabled: false,
      reminder_offset_minutes: 0,
    },
  },
};

const schedule = {
  record_type: "schedule",
  schedule_id: "schedule_morning_walk_daily_0800",
  behavior_id: behavior.behavior_id,
  recurrence_profile: "behaviorlog.calendar_simple.v1",
  recurrence: {
    frequency: "daily",
    interval: 1,
  },
  timezone,
  local_time: "08:00",
  window_start_local: null,
  window_end_local: null,
  active_from_local_date: "2026-06-18",
  active_until_local_date: null,
  source: { ...source, original_id: "slot_morning_walk_0800" },
  extensions: {
    "app.cadence": {
      schedule_kind: "exact",
      schedule_label: "8:00 AM",
    },
  },
};

const occurrences = [
  {
    record_type: "occurrence",
    occurrence_id: "occurrence_morning_walk_2026_06_20",
    behavior_id: behavior.behavior_id,
    schedule_id: schedule.schedule_id,
    scheduled_for_utc: "2026-06-20T12:00:00Z",
    local_date: "2026-06-20",
    local_time: "08:00",
    timezone,
    utc_offset_at_event: "-04:00",
    due_window_start_utc: "2026-06-20T12:00:00Z",
    due_window_end_utc: "2026-06-20T12:05:00Z",
    generated_at_utc: "2026-06-18T12:00:00Z",
    generation_rule_id: "rule_recurrence_calendar_simple_v1",
    occurrence_state: "active",
    current_status: "completed",
    source: { ...source, original_id: "occurrence_morning_walk_2026_06_20" },
    extensions: {
      "app.cadence": {
        schedule: "8:00 AM",
      },
    },
  },
  {
    record_type: "occurrence",
    occurrence_id: "occurrence_morning_walk_2026_06_21",
    behavior_id: behavior.behavior_id,
    schedule_id: schedule.schedule_id,
    scheduled_for_utc: "2026-06-21T12:00:00Z",
    local_date: "2026-06-21",
    local_time: "08:00",
    timezone,
    utc_offset_at_event: "-04:00",
    due_window_start_utc: "2026-06-21T12:00:00Z",
    due_window_end_utc: "2026-06-21T12:05:00Z",
    generated_at_utc: "2026-06-18T12:00:00Z",
    generation_rule_id: "rule_recurrence_calendar_simple_v1",
    occurrence_state: "active",
    current_status: "unresolved",
    source: { ...source, original_id: "occurrence_morning_walk_2026_06_21" },
    extensions: {
      "app.cadence": {
        schedule: "8:00 AM",
      },
    },
  },
];

const statusEvent = {
  record_type: "status_event",
  event_id: "status_event_morning_walk_2026_06_20_completed",
  occurrence_id: occurrences[0].occurrence_id,
  behavior_id: behavior.behavior_id,
  previous_status: "unresolved",
  status: "completed",
  status_semantics: "explicit_user_mark",
  recorded_at_utc: "2026-06-20T12:18:00Z",
  effective_at_utc: "2026-06-20T12:18:00Z",
  local_date: "2026-06-20",
  timezone,
  utc_offset_at_event: "-04:00",
  actor: {
    type: "user",
    id: "subject",
  },
  source: { ...source, original_id: "status_event_morning_walk_2026_06_20_completed", capture_method: "manual_tap" },
  note_id: null,
  revises_event_id: null,
  reason_code: null,
  extensions: {
    "app.cadence": {
      demo_record: true,
    },
  },
};

const files = [
  {
    path: "schema.json",
    mediaType: "application/schema+json",
    required: true,
    content: `${JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://behaviorlog.org/schema/behaviorlog.bundle/0.1.0-draft",
        title: "BehaviorLog Bundle 0.1.0-draft demo schema pointer",
        type: "object",
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "README.md",
    mediaType: "text/markdown",
    required: true,
    content: [
      "# Cadence Demo BehaviorLog Bundle",
      "",
      "This bundle contains sanitized demo data generated for the Cadence marketing site.",
      "Read `manifest.json` first. Use `data/status_events.jsonl` as the status-history authority.",
      "",
    ].join("\n"),
  },
  {
    path: "AGENTS.md",
    mediaType: "text/markdown",
    required: true,
    content: [
      "# AGENTS.md",
      "",
      "This is a sanitized BehaviorLog demo bundle.",
      "",
      "1. Read `manifest.json`.",
      "2. Validate listed SHA-256 hashes.",
      "3. Analyze `data/status_events.jsonl` for history.",
      "4. Treat `data/occurrences.jsonl` `current_status` as a snapshot.",
      "5. Do not treat unresolved as missed or failed.",
      "",
    ].join("\n"),
  },
  {
    path: "data/behaviors.jsonl",
    mediaType: "application/x-ndjson",
    required: true,
    content: `${JSON.stringify(behavior)}\n`,
  },
  {
    path: "data/schedules.jsonl",
    mediaType: "application/x-ndjson",
    required: true,
    content: `${JSON.stringify(schedule)}\n`,
  },
  {
    path: "data/occurrences.jsonl",
    mediaType: "application/x-ndjson",
    required: true,
    content: `${occurrences.map((occurrence) => JSON.stringify(occurrence)).join("\n")}\n`,
  },
  {
    path: "data/status_events.jsonl",
    mediaType: "application/x-ndjson",
    required: true,
    content: `${JSON.stringify(statusEvent)}\n`,
  },
];

const manifest = {
  format: "behaviorlog.bundle",
  schema_version: "0.1.0-draft",
  exported_at_utc: exportedAt,
  producer: {
    name: "Cadence Tracker",
    version: "0.1.0",
    exporter_version: "0.1.0-draft",
    website: null,
  },
  subject: {
    subject_id: "demo-subject",
    timezone_default: timezone,
    locale: "en-US",
  },
  privacy: {
    redaction_level: "demo_sanitized",
    subject_id_strategy: "pseudonymous",
    contains_notes: false,
    contains_context: false,
    contains_raw_location: false,
    contains_health_data: false,
    contains_ai_generated_content: false,
  },
  profiles: ["core"],
  rules: {
    status_semantics: {
      unresolved: "No explicit completion or non-completion decision has been recorded.",
      completed: "The occurrence was explicitly completed.",
      not_completed: "The occurrence was explicitly marked not completed.",
    },
    unresolved_policy: "exclude_from_explicit_adherence",
    day_boundary: "local_midnight",
  },
  files: files.map((file) => ({
    path: file.path,
    media_type: file.mediaType,
    schema_ref: schemaRefForPath(file.path),
    required: file.required,
    sha256: sha256(file.content),
  })),
};

const zipEntries = [
  {
    path: "manifest.json",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  },
  ...files.map((file) => ({
    path: file.path,
    content: file.content,
  })),
];

function schemaRefForPath(path) {
  switch (path) {
    case "data/behaviors.jsonl":
      return "#/$defs/Behavior";
    case "data/schedules.jsonl":
      return "#/$defs/Schedule";
    case "data/occurrences.jsonl":
      return "#/$defs/Occurrence";
    case "data/status_events.jsonl":
      return "#/$defs/StatusEvent";
    default:
      return null;
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path);
    const data = Buffer.from(entry.content);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralStart = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, createStoredZip(zipEntries));
console.log(`Generated ${outputPath}`);
