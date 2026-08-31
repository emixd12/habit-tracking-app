import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalExportDownload, getLocalExportPageData } from "../apps/desktop/src/local-export.service";
import { readZipEntries } from "../lib/services/zip";
import type { Profile } from "../lib/types/database";
import { USER_ID, storedBehavior, storedExportOccurrence } from "./helpers/export-row-fixture";

const mocks = vi.hoisted(() => ({ command: vi.fn(), fresh: vi.fn() }));
vi.mock("../apps/desktop/src/local-store", () => ({ localCommand: mocks.command }));
vi.mock("../apps/desktop/src/local-generation.service", async (original) => ({
  ...await original<typeof import("../apps/desktop/src/local-generation.service")>(), ensureLocalOccurrencesFresh: mocks.fresh,
}));
const now = Temporal.Instant.from("2026-06-08T16:00:00Z");
const profile = { id: USER_ID, timezone: "America/New_York" } as Profile;

beforeEach(() => {
  vi.resetAllMocks();
  const row = storedBehavior();
  const { category, schedules, schedule_slots, ...behavior } = row;
  void category; void schedule_slots;
  mocks.command.mockResolvedValue({ categories: [], graphs: [{ behavior, schedules, slots: [], revision: 1 }],
    behaviorDefinitionEvents: [], behaviorConfigurationEvents: [{
      id: "configuration-1", behavior_id: row.id, event_kind: "baseline", previous_configuration: null,
      next_configuration: { categoryId: null, scheduleGraph: [{ recurrenceRule: { frequency: "daily", interval: 1 },
        sortOrder: 0, timeEntries: [{ kind: "exact", preset: null, startTime: "22:00:00", endTime: null, sortOrder: 0 }] }],
        browserReminderEnabled: true, emailReminderEnabled: false, reminderOffsetMinutes: 0, active: true, timezone: row.timezone },
      changed_fields: ["schedule_graph"], recorded_at: row.created_at, effective_at: row.created_at,
      effective_local_date: "2026-05-01", timezone: row.timezone, source: "manual", reason_code: "behavior_created", created_at: row.created_at,
    }], occurrences: [{ ...storedExportOccurrence(), note: "Private note" }],
    statusEvents: [], reminderDeliveries: [], timeSessions: [], nativeReminders: [{
      id: "native-1", user_id: USER_ID, occurrence_id: storedExportOccurrence().id, request_id: "native-request",
      fire_at: "2026-05-01T22:00:00Z", title: "Private title", body: "Private body", error: "Private error",
      status: "scheduled", verified_at: row.created_at, created_at: row.created_at, updated_at: row.updated_at,
    }],
  });
});

describe("desktop export read and download", () => {
  it("reads saved all-time records without generating future occurrences and defaults sensitive options off", async () => {
    const bundle = await getLocalExportPageData(profile, { now, range: "all" });
    expect(mocks.fresh).not.toHaveBeenCalled();
    expect(mocks.command).toHaveBeenCalledExactlyOnceWith("readExportSnapshot", {
      profileId: USER_ID, startLocalDate: null, endLocalDate: "9999-12-31", includeTimeTracking: false,
      throughStartedAt: now.toString(),
    });
    expect(bundle.jsonBackup.occurrences[0].note).toBeNull();
    expect(bundle.jsonBackup).not.toHaveProperty("time_sessions");
    expect(bundle.jsonBackup.behavior_configuration_events[0]).toMatchObject({ id: "configuration-1" });
    const contents = bundle.behaviorLog.files.map(({ content }) => content).join("\n");
    expect(contents).not.toContain(USER_ID);
    expect(contents).not.toMatch(/Private (note|title|body|error)/);
  });

  it.each(["jsonl", "csv", "json", "markdown", "behaviorlog"] as const)("produces a %s payload without filesystem or browser download side effects", async (format) => {
    const payload = await getLocalExportDownload(profile, format, { now, range: "all", includeNotes: true });
    if (format === "behaviorlog") {
      expect(payload.mimeType).toBe("application/zip");
      expect(payload.filename).toMatch(/\.behaviorlog\.zip$/);
      const entries = readZipEntries(payload.bytes!);
      expect(entries.some(({ path }) => path === "raw/cadence/native_reminders.jsonl")).toBe(true);
      expect(entries.find(({ path }) => path === "data/notes.jsonl")?.content).toContain("Private note");
    } else {
      expect(payload.text).toContain("Private note");
      expect(payload.bytes).toBeUndefined();
      expect(payload.filename).toMatch(format === "markdown" ? /\.md$/ : new RegExp(`\\.${format}$`));
    }
  });

  it("propagates snapshot failure and never substitutes a partial export", async () => {
    mocks.command.mockRejectedValueOnce(new Error("history row ceiling"));
    await expect(getLocalExportDownload(profile, "json", { now })).rejects.toThrow("history row ceiling");
  });
});
