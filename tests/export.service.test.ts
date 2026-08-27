import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireCurrentUserId: vi.fn(),
  readCachedProfileTimezone: vi.fn(),
  readCachedUserBehaviors: vi.fn(),
  listBehaviorDefinitionEvents: vi.fn(),
  listBehaviorConfigurationEvents: vi.fn(),
  readExportPageBundle: vi.fn(),
  ensureUserOccurrencesFresh: vi.fn(),
  listTimeSessionHistory: vi.fn(),
  listTimeSessionsByOccurrenceIds: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserId: mocks.requireCurrentUserId,
}));

vi.mock("@/lib/cache/stable-user-data.cache", () => ({
  readCachedProfileTimezone: mocks.readCachedProfileTimezone,
  readCachedUserBehaviors: mocks.readCachedUserBehaviors,
}));

vi.mock("@/lib/db/behaviorDefinitionEvents.repo", () => ({
  listBehaviorDefinitionEvents: mocks.listBehaviorDefinitionEvents,
}));

vi.mock("@/lib/db/behaviorConfigurationEvents.repo", () => ({
  listBehaviorConfigurationEvents: mocks.listBehaviorConfigurationEvents,
}));

vi.mock("@/lib/db/exportPageRead.repo", () => ({
  readExportPageBundle: mocks.readExportPageBundle,
}));

vi.mock("@/lib/services/occurrence.service", () => ({
  ensureUserOccurrencesFresh: mocks.ensureUserOccurrencesFresh,
}));

vi.mock("@/lib/db/timeSessions.repo", () => ({
  listTimeSessionHistory: mocks.listTimeSessionHistory,
  listTimeSessionsByOccurrenceIds: mocks.listTimeSessionsByOccurrenceIds,
}));

describe("getExportPageData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.requireCurrentUserId.mockResolvedValue(USER_ID);
    mocks.readCachedProfileTimezone.mockResolvedValue("America/New_York");
    mocks.readCachedUserBehaviors.mockResolvedValue([storedBehavior()]);
    mocks.listBehaviorDefinitionEvents.mockResolvedValue([
      {
        id: "definition-1",
        user_id: USER_ID,
        behavior_id: BEHAVIOR_ID,
        previous_title: null,
        next_title: "Brush teeth",
        previous_description: null,
        next_description: "Night brushing",
        changed_fields: ["title", "description"],
        recorded_at: "2026-05-01T12:00:00Z",
        source: "system",
        reason: "baseline_backfill",
        created_at: "2026-05-01T12:00:00Z",
        updated_at: "2026-05-01T12:00:00Z",
      },
    ]);
    mocks.listBehaviorConfigurationEvents.mockResolvedValue([
      storedConfigurationEvent(),
    ]);
    mocks.readExportPageBundle.mockResolvedValue({
      profile: null,
      syncState: null,
      categories: [],
      behaviors: [storedExportPageBehavior()],
      occurrences: [],
      statusEvents: [],
      reminderDeliveries: [],
    });
    mocks.ensureUserOccurrencesFresh.mockResolvedValue({ synced: false });
    mocks.listTimeSessionHistory.mockResolvedValue([]);
  });

  it("loads user-scoped definition events and maps them into every rich export", async () => {
    const { getExportPageData } =
      await import("../lib/services/export.service");
    const bundle = await getExportPageData({
      now: Temporal.Instant.from("2026-06-08T16:00:00Z"),
      range: "all",
    });

    expect(mocks.listBehaviorDefinitionEvents).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
    );
    expect(bundle.jsonBackup.behavior_definition_events).toEqual([
      expect.objectContaining({
        id: "definition-1",
        behavior_id: BEHAVIOR_ID,
        next_title: "Brush teeth",
        next_description: "Night brushing",
        changed_fields: ["title", "description"],
        source: "system",
        reason: "baseline_backfill",
      }),
    ]);
    expect(bundle.jsonBackup.behavior_configuration_events).toEqual([
      expect.objectContaining({
        id: "configuration-1",
        behavior_id: BEHAVIOR_ID,
        event_kind: "baseline",
        reason_code: "history_capture_started",
      }),
    ]);
    expect(bundle.behaviorConfigurationEventCount).toBe(1);
    expect(bundle.markdownSummary).toContain(
      "Behavior definition history: included (1 event)",
    );
    expect(
      bundle.behaviorLog.files.find(
        (file) => file.path === "data/behavior_definition_events.jsonl",
      )?.content,
    ).toContain('"event_id":"definition-1"');
  });

  it("uses complete materialized standard histories above the Data API cap", async () => {
    const recordedAt = Temporal.Instant.from("2026-05-01T12:00:00Z");
    const definitionEvents = Array.from({ length: 1_001 }, (_, index) => ({
      id: uuid(index + 10_000),
      user_id: USER_ID,
      behavior_id: BEHAVIOR_ID,
      previous_title: index === 0 ? null : `Brush teeth ${index - 1}`,
      next_title: `Brush teeth ${index}`,
      previous_description: null,
      next_description: null,
      changed_fields: ["title"],
      recorded_at: recordedAt.add({ seconds: index }).toString(),
      source: "system",
      reason: "history",
      created_at: recordedAt.add({ seconds: index }).toString(),
      updated_at: recordedAt.add({ seconds: index }).toString(),
    }));
    const occurrence = storedExportOccurrence();
    const timeSessions = Array.from({ length: 1_001 }, (_, index) => ({
      id: uuid(index + 20_000),
      user_id: USER_ID,
      occurrence_id: occurrence.id,
      behavior_id: BEHAVIOR_ID,
      started_at: recordedAt.add({ seconds: index }).toString(),
      stopped_at: recordedAt.add({ seconds: index + 1 }).toString(),
    }));
    mocks.listBehaviorDefinitionEvents.mockResolvedValue(definitionEvents);
    mocks.listTimeSessionHistory.mockResolvedValue(timeSessions);
    mocks.readExportPageBundle.mockResolvedValue({
      profile: null,
      syncState: null,
      categories: [],
      behaviors: [storedExportPageBehavior()],
      occurrences: [occurrence],
      statusEvents: [],
      reminderDeliveries: [],
    });
    const { getExportPageData } =
      await import("../lib/services/export.service");

    const bundle = await getExportPageData({
      now: Temporal.Instant.from("2026-06-08T16:00:00Z"),
      range: "all",
      includeTimeTracking: true,
    });
    const definitionFile = bundle.behaviorLog.files.find(
      (file) => file.path === "data/behavior_definition_events.jsonl",
    );
    const timeSessionFile = bundle.behaviorLog.files.find(
      (file) => file.path === "data/time_sessions.jsonl",
    );

    expect(bundle.jsonBackup.behavior_definition_events).toHaveLength(1_001);
    expect(bundle.jsonBackup.time_sessions).toHaveLength(1_001);
    expect(definitionFile?.content.split("\n")).toHaveLength(1_001);
    expect(timeSessionFile?.content.split("\n")).toHaveLength(1_001);
  });

  it("fails when a final Behavior pointer no longer matches the captured history", async () => {
    mocks.readExportPageBundle.mockResolvedValue({
      profile: null,
      syncState: null,
      categories: [],
      behaviors: [
        {
          ...storedExportPageBehavior(),
          current_configuration_event_id: "configuration-2",
        },
      ],
      occurrences: [],
      statusEvents: [],
      reminderDeliveries: [],
    });
    const { getExportPageData } =
      await import("../lib/services/export.service");

    await expect(
      getExportPageData({
        now: Temporal.Instant.from("2026-06-08T16:00:00Z"),
        range: "all",
      }),
    ).rejects.toThrow("Behavior configuration changed during export");
  });

  it("does not read timing rows unless the exact time-tracking option is enabled", async () => {
    const { getExportPageData } =
      await import("../lib/services/export.service");

    await getExportPageData({
      now: Temporal.Instant.from("2026-06-08T16:00:00Z"),
      range: "all",
    });

    expect(mocks.listTimeSessionHistory).not.toHaveBeenCalled();

    await getExportPageData({
      now: Temporal.Instant.from("2026-06-08T16:00:00Z"),
      range: "all",
      includeTimeTracking: true,
    });

    expect(mocks.listTimeSessionHistory).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: USER_ID,
        startLocalDate: null,
        endLocalDate: "2026-06-08",
        includeArchived: false,
        throughStartedAt: "2026-06-08T16:00:00Z",
      },
    );
    expect(mocks.listTimeSessionsByOccurrenceIds).not.toHaveBeenCalled();
  });
});

function storedBehavior() {
  return {
    id: BEHAVIOR_ID,
    user_id: USER_ID,
    category_id: null,
    title: "Brush teeth",
    description: "Night brushing",
    recurrence_rule: { frequency: "daily", interval: 1 },
    scheduled_time: "22:00",
    timezone: "America/New_York",
    browser_reminder_enabled: true,
    email_reminder_enabled: false,
    reminder_offset_minutes: 0,
    active: true,
    archived_at: null,
    current_configuration_event_id: "configuration-1",
    created_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-01T12:00:00Z",
    category: null,
    schedules: [],
    schedule_slots: [],
  };
}

function storedExportPageBehavior() {
  return {
    ...storedBehavior(),
    category: null,
    schedule_slots: [],
  };
}

function storedConfigurationEvent() {
  return {
    id: "configuration-1",
    user_id: USER_ID,
    behavior_id: BEHAVIOR_ID,
    event_kind: "baseline",
    previous_configuration: null,
    next_configuration: {
      category_id: null,
      schedule_graph: [
        {
          recurrence_rule: { frequency: "daily", interval: 1 },
          sort_order: 0,
          time_entries: [
            {
              kind: "exact",
              preset: null,
              start_time: "22:00:00",
              end_time: null,
              sort_order: 0,
            },
          ],
        },
      ],
      browser_reminder_enabled: true,
      email_reminder_enabled: false,
      reminder_offset_minutes: 0,
      active: true,
      timezone: "America/New_York",
    },
    changed_fields: [
      "category_id",
      "schedule_graph",
      "browser_reminder_enabled",
      "email_reminder_enabled",
      "reminder_offset_minutes",
      "active",
      "timezone",
    ],
    recorded_at: "2026-05-01T12:00:00Z",
    effective_at: "2026-05-01T12:00:00Z",
    effective_local_date: "2026-05-01",
    timezone: "America/New_York",
    source: "system",
    reason_code: "history_capture_started",
    created_at: "2026-05-01T12:00:00Z",
  };
}

function storedExportOccurrence() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    behavior_id: BEHAVIOR_ID,
    behavior_schedule_slot_id: null,
    behavior_configuration_event_id: "configuration-1",
    scheduled_for: "2026-05-01T22:00:00Z",
    local_date: "2026-05-01",
    schedule_kind: "exact",
    schedule_preset: null,
    schedule_start_time: "22:00:00",
    schedule_end_time: null,
    status: "unresolved",
    completed_at: null,
    status_marked_at: null,
    note: null,
    created_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-01T12:00:00Z",
  };
}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
