import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BehaviorView } from "../lib/types/behavior";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createBehaviorFromFormData: vi.fn(),
  behaviorErrorToActionState: vi.fn(),
  updateBehaviorArchiveNoteFromFormData: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/services/behavior.service", () => ({
  createBehaviorFromFormData: mocks.createBehaviorFromFormData,
  updateBehaviorFromFormData: vi.fn(),
  archiveBehaviorFromFormData: vi.fn(),
  restoreBehaviorFromFormData: vi.fn(),
  updateBehaviorArchiveNoteFromFormData: mocks.updateBehaviorArchiveNoteFromFormData,
  behaviorErrorToActionState: mocks.behaviorErrorToActionState,
}));

describe("behavior actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBehaviorFromFormData.mockResolvedValue(behaviorView());
    mocks.behaviorErrorToActionState.mockReturnValue({
      status: "error",
      message: "Action failed.",
    });
  });

  it("returns the created behavior and avoids revalidating the current route", async () => {
    const { createBehaviorAction } = await import(
      "../app/(app)/behaviors/actions"
    );
    const formData = new FormData();
    const result = await createBehaviorAction(
      {
        status: "idle",
        message: "",
      },
      formData,
    );

    expect(result).toEqual({
      status: "success",
      message: "Behavior created.",
      behavior: behaviorView(),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/timeline");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/behaviors");
  });

  it("revalidates archived behavior history after saving a note", async () => {
    const { updateBehaviorArchiveNoteAction } = await import("../app/(app)/behaviors/actions");
    const formData = new FormData();
    const result = await updateBehaviorArchiveNoteAction({ status: "idle", message: "" }, formData);
    expect(mocks.updateBehaviorArchiveNoteFromFormData).toHaveBeenCalledWith(formData);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/behaviors");
    expect(result).toEqual({ status: "success", message: "Archive note saved." });
  });
});

function behaviorView(): BehaviorView {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Brush teeth",
    description: "",
    categoryId: "",
    categoryName: "No category",
    recurrenceSummary: "Daily",
    recurrenceDefaults: {
      kind: "daily",
      dailyInterval: 1,
      everyDays: 2,
      weeklyInterval: 1,
      weeklyDays: ["monday"],
      monthlyInterval: 1,
      monthlyDay: 1,
    },
    scheduledTime: "07:30",
    scheduledTimeLabel: "7:30 AM",
    scheduleSlots: [
      {
        id: "slot-1",
        kind: "exact",
        preset: null,
        startTime: "07:30",
        endTime: null,
        label: "7:30 AM",
        sortOrder: 0,
      },
    ],
    scheduleSummary: "7:30 AM",
    timezone: "America/New_York",
    browserReminderEnabled: true,
    emailReminderEnabled: false,
    reminderOffsetMinutes: 0,
    reminderSummary: "Browser notifications on",
    active: true,
    archivedAt: null,
    archiveNotes: [],
    createdAt: "2026-06-26T12:00:00Z",
    updatedAt: "2026-06-26T12:00:00Z",
  };
}
