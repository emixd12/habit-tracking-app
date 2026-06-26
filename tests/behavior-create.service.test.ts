import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearUserReadCache } from "../lib/cache/user-read-cache";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const SCHEDULE_SLOT_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireCurrentUserId: vi.fn(),
  createBehavior: vi.fn(),
  replaceBehaviorSchedules: vi.fn(),
  getBehaviorById: vi.fn(),
  getProfileTimezone: vi.fn(),
  markOccurrenceSyncStale: vi.fn(),
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
    createBehavior: mocks.createBehavior,
    replaceBehaviorSchedules: mocks.replaceBehaviorSchedules,
    getBehaviorById: mocks.getBehaviorById,
    getProfileTimezone: mocks.getProfileTimezone,
  };
});

vi.mock("@/lib/services/occurrence-sync-state.service", () => ({
  markOccurrenceSyncStale: mocks.markOccurrenceSyncStale,
}));

describe("createBehaviorFromFormData", () => {
  beforeEach(() => {
    clearUserReadCache();
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.requireCurrentUserId.mockResolvedValue(USER_ID);
    mocks.getProfileTimezone.mockResolvedValue("America/New_York");
    mocks.createBehavior.mockResolvedValue({
      id: BEHAVIOR_ID,
      timezone: "America/New_York",
    });
    mocks.replaceBehaviorSchedules.mockResolvedValue(undefined);
    mocks.markOccurrenceSyncStale.mockResolvedValue(undefined);
    mocks.getBehaviorById.mockResolvedValue(storedBehavior());
  });

  it("returns a server-confirmed behavior view after creating the behavior", async () => {
    const { createBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );
    const result = await createBehaviorFromFormData(createFormData());

    expect(result).toMatchObject({
      id: BEHAVIOR_ID,
      title: "Brush teeth",
      categoryId: CATEGORY_ID,
      categoryName: "Grooming",
      scheduleSummary: "7:30 AM",
      active: true,
    });
    expect(result.scheduleSlots).toEqual([
      expect.objectContaining({
        id: SCHEDULE_SLOT_ID,
        kind: "exact",
        startTime: "07:30",
        label: "7:30 AM",
      }),
    ]);
    expect(mocks.createBehavior).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user_id: USER_ID,
        title: "Brush teeth",
        category_id: CATEGORY_ID,
        scheduled_time: "07:30",
        timezone: "America/New_York",
      }),
    );
    expect(mocks.replaceBehaviorSchedules).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: USER_ID,
        behaviorId: BEHAVIOR_ID,
        schedules: [
          expect.objectContaining({
            recurrence_rule: {
              frequency: "daily",
              interval: 1,
            },
            sort_order: 0,
            slots: [
              expect.objectContaining({
                start_time: "07:30",
                sort_order: 0,
              }),
            ],
          }),
        ],
      }),
    );
    expect(mocks.markOccurrenceSyncStale).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: USER_ID,
        reason: "behavior_changed",
        timezone: "America/New_York",
      },
    );
    expect(mocks.getBehaviorById).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      BEHAVIOR_ID,
    );
  });

  it("returns a resavable fallback schedule row when the confirmed behavior has no slot rows", async () => {
    const { createBehaviorFromFormData } = await import(
      "../lib/services/behavior.service"
    );
    mocks.getBehaviorById.mockResolvedValue(
      storedBehavior({ schedule_slots: [] }),
    );

    const result = await createBehaviorFromFormData(createFormData());

    expect(result.scheduleSlots).toEqual([
      expect.objectContaining({
        id: "",
        kind: "exact",
        startTime: "07:30",
        label: "7:30 AM",
      }),
    ]);
  });
});

function createFormData(): FormData {
  const formData = new FormData();

  formData.set("title", "Brush teeth");
  formData.set("description", "Evening routine");
  formData.set("category_id", CATEGORY_ID);
  formData.set("timezone", "America/New_York");
  formData.set("schedule_slot_count", "1");
  formData.set("schedule_kind_0", "exact");
  formData.set("schedule_exact_time_0", "07:30");
  formData.set("recurrence_kind", "daily");
  formData.set("daily_interval", "1");
  formData.set("reminder_offset", "0");
  formData.set("browser_reminder", "on");

  return formData;
}

function storedBehavior(
  overrides: Partial<ReturnType<typeof baseStoredBehavior>> = {},
) {
  return {
    ...baseStoredBehavior(),
    ...overrides,
  };
}

function baseStoredBehavior() {
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
    schedule_slots: [
      {
        id: SCHEDULE_SLOT_ID,
        user_id: USER_ID,
        behavior_id: BEHAVIOR_ID,
        kind: "exact",
        preset: null,
        start_time: "07:30",
        end_time: null,
        sort_order: 0,
        created_at: "2026-06-26T12:00:00Z",
        updated_at: "2026-06-26T12:00:00Z",
      },
    ],
  };
}
