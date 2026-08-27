#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Temporal } from "@js-temporal/polyfill";
import { runnerImport } from "vite";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const outputPath = join(process.cwd(), "public", "examples", "cadence-demo.behaviorlog.zip");
const viteConfig = {
  configFile: false,
  root: repositoryRoot,
  resolve: { alias: { "@": repositoryRoot } },
};
const [{ module: exporter }, { module: zipService }] = await Promise.all([
  runnerImport("./lib/resolvers/export.resolver.ts", viteConfig),
  runnerImport("./lib/services/zip.ts", viteConfig),
]);

const timezone = "America/New_York";
const behaviorId = "behavior_morning_walk";
const scheduleSlotId = "slot_morning_walk_0800";
const bundle = exporter.resolveExportBundle({
  profile: {
    timezone,
    subjectId: "demo-subject",
    producerName: "Cadence Tracker",
    producerVersion: "0.1.0",
  },
  categories: [{ id: "category_wellbeing", name: "Wellbeing", sortOrder: 0 }],
  behaviors: [
    {
      id: behaviorId,
      categoryId: "category_wellbeing",
      categoryName: "Wellbeing",
      title: "Morning walk",
      description: "Demo behavior used for BehaviorLog inspection.",
      recurrenceRule: { frequency: "daily", interval: 1 },
      scheduledTime: "08:00",
      scheduleSlots: [
        {
          id: scheduleSlotId,
          kind: "exact",
          preset: null,
          startTime: "08:00",
          endTime: null,
          sortOrder: 0,
          label: "8:00 AM",
        },
      ],
      timezone,
      browserReminderEnabled: true,
      emailReminderEnabled: false,
      reminderOffsetMinutes: 0,
      active: true,
      archivedAt: null,
      createdAt: "2026-06-18T12:00:00Z",
      updatedAt: "2026-06-18T12:00:00Z",
    },
  ],
  occurrences: [
    {
      id: "occurrence_morning_walk_2026_06_20",
      behaviorId,
      behaviorScheduleSlotId: scheduleSlotId,
      scheduledFor: "2026-06-20T12:00:00Z",
      scheduledTimeLabel: "8:00 AM",
      scheduleKind: "exact",
      schedulePreset: null,
      scheduleStartTime: "08:00",
      scheduleEndTime: null,
      localDate: "2026-06-20",
      status: "completed",
      completedAt: "2026-06-20T12:18:00Z",
      statusMarkedAt: "2026-06-20T12:18:00Z",
      note: null,
      createdAt: "2026-06-18T12:00:00Z",
      updatedAt: "2026-06-20T12:18:00Z",
    },
    {
      id: "occurrence_morning_walk_2026_06_21",
      behaviorId,
      behaviorScheduleSlotId: scheduleSlotId,
      scheduledFor: "2026-06-21T12:00:00Z",
      scheduledTimeLabel: "8:00 AM",
      scheduleKind: "exact",
      schedulePreset: null,
      scheduleStartTime: "08:00",
      scheduleEndTime: null,
      localDate: "2026-06-21",
      status: "unresolved",
      completedAt: null,
      statusMarkedAt: null,
      note: null,
      createdAt: "2026-06-18T12:00:00Z",
      updatedAt: "2026-06-18T12:00:00Z",
    },
  ],
  statusEvents: [
    {
      id: "status_event_morning_walk_2026_06_20_completed",
      occurrenceId: "occurrence_morning_walk_2026_06_20",
      behaviorId,
      previousStatus: "unresolved",
      status: "completed",
      statusSemantics: "explicit_user_mark",
      recordedAt: "2026-06-20T12:18:00Z",
      effectiveAt: "2026-06-20T12:18:00Z",
      localDate: "2026-06-20",
      timezone,
      sourceCaptureMethod: "manual_tap",
      sourceConfidence: "high",
      revisesEventId: null,
      reasonCode: null,
    },
  ],
  now: Temporal.Instant.from("2026-06-21T14:00:00Z"),
  timezone,
  range: "30",
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, zipService.createStoredZip(bundle.behaviorLog.files));
console.log(`Generated ${outputPath}`);
