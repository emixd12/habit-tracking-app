import { afterEach, expect, test, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import type { Reminder } from "../apps/desktop/src/native-spike";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => false }));
import { runNativeCoverageProbe } from "../apps/desktop/src/native-coverage-probe";

afterEach(() => { vi.useRealTimers(); invoke.mockReset(); });

test("coverage repair replaces arbitrary OS survivors with the nearest requests and reports the shorter horizon", async () => {
  const pending = new Map<string, Reminder>();
  invoke.mockImplementation(async (_command, { request }) => {
    if (request.operation === "delivered") return { delivered: [] };
    if (request.operation === "cancel") {
      for (const id of request.ids) pending.delete(id);
    }
    if (request.operation === "schedule") {
      for (const reminder of request.reminders) {
        pending.set(reminder.id, reminder);
        // Simulate an OS that silently evicts earlier requests at its local limit.
        while (pending.size > 2) pending.delete(pending.keys().next().value!);
      }
    }
    return { pending: [...pending.values()], errors: [] };
  });

  const result = await runNativeCoverageProbe(4, Temporal.Instant.from("2026-08-30T12:00:00Z"));
  expect([...pending.keys()]).toEqual(["cadence-spike.1", "cadence-spike.2"]);
  expect(result.coverage).toEqual({
    status: "limited", expectedCount: 4, scheduledCount: 2,
    scheduledThrough: "2026-08-31T12:01:00Z",
    firstUnscheduledAt: "2026-08-31T12:02:00Z",
    missingIds: ["cadence-spike.3", "cadence-spike.4"],
  });
  expect(invoke.mock.calls.filter(([, { request }]) => request.operation === "schedule")).toHaveLength(2);
});

test("unknown readback and scheduling errors never become a successful capacity result", async () => {
  for (const result of [{}, { pending: [], errors: [{ id: "cadence-spike.1", error: "Scheduling timed out" }] }]) {
    invoke.mockReset();
    invoke.mockImplementation(async (_command, { request }) => {
      if (request.operation === "delivered") return { delivered: [] };
      if (request.operation === "schedule") return result;
      return { pending: [] };
    });
    await expect(runNativeCoverageProbe(2)).rejects.toThrow();
    expect(invoke.mock.calls.filter(([, { request }]) => request.operation === "schedule")).toHaveLength(1);
  }
});
