// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import type { BehaviorActionState, BehaviorFormAction, BehaviorView } from "@/lib/types/behavior";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const success: BehaviorFormAction = async () => ({ status: "success", message: "Saved." } as BehaviorActionState);
const behavior = (): BehaviorView => ({
  id: "behavior-1", title: "Walk", description: "", locationText: "1 Main St", categoryId: "category-1", categoryName: "Health",
  recurrenceSummary: "Daily", recurrenceDefaults: { kind: "daily", dailyInterval: 1, everyDays: 2, weeklyInterval: 1, weeklyDays: ["monday"], monthlyInterval: 1, monthlyDay: 5 },
  scheduledTime: "18:00", scheduledTimeLabel: "6:00 PM", schedules: [],
  scheduleSlots: [{ id: "slot-1", kind: "exact", preset: null, startTime: "18:00", endTime: null, sortOrder: 0, label: "6:00 PM" }],
  scheduleSummary: "6:00 PM", timezone: "America/New_York", browserReminderEnabled: true, emailReminderEnabled: false,
  reminderOffsetMinutes: 0, reminderSummary: "Browser reminders", active: true, archivedAt: null, archiveNotes: [],
  createdAt: "2026-06-01T12:00:00Z", updatedAt: "2026-06-01T12:00:00Z",
});

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

async function saveWith(fields: Record<string, string>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const listener = vi.fn();
  window.addEventListener("cadence:travel-changed", listener);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() => root.render(<BehaviorForm mode="edit" action={success} categories={[{ id: "category-1", name: "Health" }]} behavior={behavior()} />));
    const form = host.querySelector("form")!;
    for (const [name, value] of Object.entries(fields)) (form.elements.namedItem(name) as HTMLInputElement).value = value;
    await act(async () => { form.requestSubmit(); });
    return listener.mock.calls.length;
  } finally {
    window.removeEventListener("cadence:travel-changed", listener);
    await act(() => root.unmount());
  }
}

it("announces a travel change after saving a changed location", async () => {
  expect(await saveWith({ location_text: "2 Main St" })).toBe(1);
});

it("does not announce a travel change for an unrelated edit", async () => {
  expect(await saveWith({ title: "Evening walk" })).toBe(0);
});
