import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { resolveExportBundle } from "../lib/resolvers/export.resolver";
import { previewBehaviorLogRestoreFromZip } from "../lib/services/behaviorlog-restore.service";
import { createStoredZip } from "../lib/services/zip";
import type {
  ExportBehaviorInput,
  ExportCategoryInput,
  ExportOccurrenceInput,
} from "../lib/types/export";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

const NOW = Temporal.Instant.from("2026-06-08T16:00:00Z");

describe("behaviorlog restore service", () => {
  it("parses a BehaviorLog zip and returns a preview without product writes", () => {
    const zip = createStoredZip(bundleFiles());
    const preview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: {
        behaviors: [],
        schedules: [],
        occurrences: [],
        statusEvents: [],
      },
    });

    expect(preview.valid).toBe(true);
    expect(preview.mode).toBe("restore_preview");
    expect(preview.previewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.actions.behaviors).toEqual([
      expect.objectContaining({
        action: "create",
        externalId: "behavior-brush",
        destructive: false,
      }),
    ]);
    expect(preview.summary.createdCount).toBeGreaterThan(0);
    expect(preview.semantics.providerSideEffects).toBe(false);
    expect(preview.semantics.reminderDeliverySideEffects).toBe(false);
  });
});

function bundleFiles() {
  const categories: ExportCategoryInput[] = [
    {
      id: "category-grooming",
      name: "Grooming",
      sortOrder: 1,
    },
  ];
  const behavior: ExportBehaviorInput = {
    id: "behavior-brush",
    categoryId: "category-grooming",
    categoryName: "Grooming",
    title: "Brush teeth",
    description: "Night brushing",
    recurrenceRule: {
      frequency: "daily",
      interval: 1,
    },
    scheduledTime: "22:00",
    scheduleSlots: [
      {
        id: "slot-brush",
        kind: "exact",
        preset: null,
        startTime: "22:00",
        endTime: null,
        sortOrder: 0,
        label: "10:00 PM",
      },
    ],
    timezone: DEFAULT_TIMEZONE,
    browserReminderEnabled: true,
    emailReminderEnabled: false,
    reminderOffsetMinutes: 0,
    active: true,
    archivedAt: null,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
  };
  const occurrence: ExportOccurrenceInput = {
    id: "occurrence-1",
    behaviorId: "behavior-brush",
    behaviorScheduleSlotId: "slot-brush",
    scheduledFor: "2026-06-08T13:00:00Z",
    scheduledTimeLabel: "9:00 AM",
    scheduleKind: "exact",
    schedulePreset: null,
    scheduleStartTime: "09:00",
    scheduleEndTime: null,
    localDate: "2026-06-08",
    status: "unresolved",
    completedAt: null,
    statusMarkedAt: null,
    note: null,
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T12:00:00Z",
  };

  return resolveExportBundle({
    profile: {
      timezone: DEFAULT_TIMEZONE,
      subjectId: "subject_test",
    },
    categories,
    behaviors: [behavior],
    occurrences: [occurrence],
    statusEvents: [],
    reminderDeliveries: [],
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    range: "30",
  }).behaviorLog.files;
}
