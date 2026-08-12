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
    mocks.readExportPageBundle.mockResolvedValue({
      profile: null,
      syncState: null,
      categories: [],
      behaviors: [],
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
    expect(bundle.markdownSummary).toContain(
      "Behavior definition history: included (1 event)",
    );
    expect(
      bundle.behaviorLog.files.find(
        (file) => file.path === "raw/cadence/behavior_definition_events.jsonl",
      )?.content,
    ).toContain('"id":"definition-1"');
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
    created_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-01T12:00:00Z",
    category: null,
    schedules: [],
    schedule_slots: [],
  };
}
