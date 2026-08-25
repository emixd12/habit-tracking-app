import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-07-09T18:30:00.000Z";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireCurrentUserId: vi.fn(),
  getBehaviorById: vi.fn(),
  getProfileTimezone: vi.fn(),
  listUserBehaviors: vi.fn(),
  updateBehavior: vi.fn(),
  updateBehaviorWithAtomicScheduleGraph: vi.fn(),
  syncUserOccurrencesAndReminders: vi.fn(),
  reportMonitoringError: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserId: mocks.requireCurrentUserId,
}));

vi.mock("@/lib/db/behaviors.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    getBehaviorById: mocks.getBehaviorById,
    getProfileTimezone: mocks.getProfileTimezone,
    listUserBehaviors: mocks.listUserBehaviors,
    updateBehavior: mocks.updateBehavior,
  };
});

vi.mock("@/lib/services/occurrence.service", () => ({
  syncUserOccurrencesAndReminders: mocks.syncUserOccurrencesAndReminders,
}));

vi.mock("@/lib/monitoring/privacy-safe-events", () => ({
  reportMonitoringError: mocks.reportMonitoringError,
}));

vi.mock("@/lib/db/behaviorDefinitionEvents.repo", () => ({
  createBehaviorWithDefinitionEvent: vi.fn(),
  createBehaviorWithAtomicScheduleGraph: vi.fn(),
  updateBehaviorWithDefinitionEvent: vi.fn(),
  updateBehaviorWithAtomicScheduleGraph:
    mocks.updateBehaviorWithAtomicScheduleGraph,
}));

describe("updateBehaviorFromFormData definition history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.requireCurrentUserId.mockResolvedValue(USER_ID);
    mocks.getBehaviorById.mockResolvedValue(storedBehavior());
    mocks.getProfileTimezone.mockResolvedValue("America/New_York");
    mocks.listUserBehaviors.mockResolvedValue([storedBehavior()]);
    mocks.syncUserOccurrencesAndReminders.mockResolvedValue([]);
    mocks.updateBehavior.mockImplementation(
      async (
        _supabase: unknown,
        _userId: string,
        _behaviorId: string,
        update: Record<string, unknown>,
      ) => ({
        ...storedBehavior(),
        ...update,
        updated_at: UPDATED_AT,
      }),
    );
    mocks.updateBehaviorWithAtomicScheduleGraph.mockImplementation(
      async (
        _supabase: unknown,
        input: { behavior: Record<string, unknown> },
      ) => ({
        ...storedBehavior(),
        ...input.behavior,
        updated_at: UPDATED_AT,
      }),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date(UPDATED_AT));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("appends full previous and next text when normalized definition fields change", async () => {
    const { updateBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );

    await updateBehaviorFromFormData(
      updateFormData({
        title: "Brush and floss",
        description: "Morning and evening routine",
      }),
    );

    expect(mocks.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        behaviorId: BEHAVIOR_ID,
        behavior: expect.objectContaining({
          title: "Brush and floss",
          description: "Morning and evening routine",
        }),
        expectedDefinition: {
          title: "Brush teeth",
          description: "Evening routine",
        },
        expectedNormalizedDefinition: {
          title: "Brush teeth",
          description: "Evening routine",
        },
        definitionEventPlan: {
          previousTitle: "Brush teeth",
          nextTitle: "Brush and floss",
          previousDescription: "Evening routine",
          nextDescription: "Morning and evening routine",
          changedFields: ["title", "description"],
          recordedAt: UPDATED_AT,
          source: "manual",
          reason: null,
        },
        expectedScheduleGraph: [],
        expectedUpdatedAt: "2026-06-26T12:00:00Z",
        configurationEventPlan: expect.objectContaining({
          changedFields: ["schedule_graph"],
          reasonCode: "behavior_edited",
          source: "manual",
        }),
        schedules: expect.any(Array),
      }),
    );
    expect(mocks.updateBehavior).not.toHaveBeenCalled();
    expect(mocks.syncUserOccurrencesAndReminders).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      {
        behaviors: [storedBehavior()],
        timezone: "America/New_York",
      },
    );
  });

  it("keeps the committed update successful when post-write graph repair fails", async () => {
    const failure = new Error("reminder repair failed");
    mocks.syncUserOccurrencesAndReminders.mockRejectedValueOnce(failure);
    const { updateBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );

    await expect(
      updateBehaviorFromFormData(
        updateFormData({
          title: "Brush and floss",
          description: "Morning and evening routine",
        }),
      ),
    ).resolves.toBeUndefined();
    expect(mocks.reportMonitoringError).toHaveBeenCalledWith(
      "behavior_graph_post_write_sync_failed",
      failure,
      { operation: "update" },
    );
  });

  it("does not append an event for a normalized definition no-op", async () => {
    mocks.getBehaviorById.mockResolvedValue(
      storedBehavior({
        title: "\t\u00a0Brush teeth\u3000",
        description: "\u2003Evening routine\u202f",
      }),
    );
    mocks.updateBehavior.mockImplementation(
      async (
        _supabase: unknown,
        _userId: string,
        _behaviorId: string,
        update: Record<string, unknown>,
      ) => ({
        ...storedBehavior({
          title: "\t\u00a0Brush teeth\u3000",
          description: "\u2003Evening routine\u202f",
        }),
        ...update,
        updated_at: UPDATED_AT,
      }),
    );
    const { updateBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );

    await updateBehaviorFromFormData(
      updateFormData({
        title: "Brush teeth",
        description: "Evening routine",
      }),
    );

    expect(mocks.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expectedDefinition: {
          title: "\t\u00a0Brush teeth\u3000",
          description: "\u2003Evening routine\u202f",
        },
        expectedNormalizedDefinition: {
          title: "Brush teeth",
          description: "Evening routine",
        },
        definitionEventPlan: null,
        expectedScheduleGraph: [],
        expectedUpdatedAt: "2026-06-26T12:00:00Z",
        schedules: expect.any(Array),
        behavior: expect.objectContaining({
          title: "\t\u00a0Brush teeth\u3000",
          description: "\u2003Evening routine\u202f",
        }),
      }),
    );
    expect(mocks.updateBehavior).not.toHaveBeenCalled();
    expect(mocks.syncUserOccurrencesAndReminders).toHaveBeenCalledOnce();
  });

  it("does not append an event for a schedule-only edit", async () => {
    const { updateBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );

    await updateBehaviorFromFormData(updateFormData({ scheduledTime: "08:30" }));

    expect(mocks.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ definitionEventPlan: null }),
    );
    expect(mocks.updateBehavior).not.toHaveBeenCalled();
    expect(mocks.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        schedules: [
          expect.objectContaining({
            slots: [
              expect.objectContaining({ start_time: "08:30" }),
            ],
          }),
        ],
      }),
    );
    expect(mocks.syncUserOccurrencesAndReminders).toHaveBeenCalledOnce();
  });

  it("does not replace schedules when the atomic definition update rolls back", async () => {
    const { updateBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );
    mocks.updateBehaviorWithAtomicScheduleGraph.mockRejectedValueOnce(
      new Error("Definition event insert failed."),
    );

    await expect(
      updateBehaviorFromFormData(
        updateFormData({
          title: "Brush and floss",
        }),
      ),
    ).rejects.toThrow("Definition event insert failed.");

    expect(mocks.updateBehavior).not.toHaveBeenCalled();
    expect(mocks.syncUserOccurrencesAndReminders).not.toHaveBeenCalled();
  });

  it("rejects a stale schedule-only edit before replacing schedules", async () => {
    const { updateBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );
    mocks.updateBehaviorWithAtomicScheduleGraph.mockRejectedValueOnce(
      new Error("Behavior definition changed after it was read."),
    );

    await expect(
      updateBehaviorFromFormData(
        updateFormData({
          scheduledTime: "08:30",
        }),
      ),
    ).rejects.toThrow("changed after it was read");

    expect(mocks.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ definitionEventPlan: null }),
    );
    expect(mocks.syncUserOccurrencesAndReminders).not.toHaveBeenCalled();
  });
});

function updateFormData(
  overrides: {
    title?: string;
    description?: string;
    scheduledTime?: string;
  } = {},
): FormData {
  const formData = new FormData();

  formData.set("behavior_id", BEHAVIOR_ID);
  formData.set("title", overrides.title ?? "Brush teeth");
  formData.set("description", overrides.description ?? "Evening routine");
  formData.set("category_id", CATEGORY_ID);
  formData.set("schedule_slot_count", "1");
  formData.set("schedule_kind_0", "exact");
  formData.set("schedule_exact_time_0", overrides.scheduledTime ?? "07:30");
  formData.set("recurrence_kind", "daily");
  formData.set("daily_interval", "1");
  formData.set("reminder_offset", "0");
  formData.set("browser_reminder", "on");
  formData.set("active", "on");

  return formData;
}

function storedBehavior(overrides: Record<string, unknown> = {}) {
  return {
    id: BEHAVIOR_ID,
    user_id: USER_ID,
    category_id: CATEGORY_ID,
    title: "Brush teeth",
    description: "Evening routine",
    recurrence_rule: { frequency: "daily", interval: 1 },
    scheduled_time: "07:30",
    timezone: "America/New_York",
    browser_reminder_enabled: true,
    email_reminder_enabled: false,
    reminder_offset_minutes: 0,
    active: true,
    archived_at: null,
    created_at: "2026-06-26T12:00:00Z",
    updated_at: "2026-06-26T12:00:00Z",
    category: {
      id: CATEGORY_ID,
      name: "Grooming",
    },
    schedules: [],
    schedule_slots: [],
    ...overrides,
  };
}
