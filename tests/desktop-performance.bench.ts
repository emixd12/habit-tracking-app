import { Temporal } from "@js-temporal/polyfill";
import { describe, test } from "vitest";
import { assessNativeReminderCoverage, selectNativeReminderRequests } from "@cadence/core/resolvers/native-reminder.resolver";

const now = Temporal.Instant.from("2026-09-14T12:00:00Z");
const targetThrough = now.add({ hours: 24 * 30 });
// Deterministic mixed order. No user data or native calls.
const requests = Array.from({ length: 4_408 }, (_, index) => ({
  id: `synthetic-${index}`, title: "Synthetic behavior", body: "Synthetic reminder",
  fireAt: now.add({ seconds: 1 + (index * 7919) % 40_000 }).toString(),
}));
const pending = selectNativeReminderRequests({ requests, now, targetThrough, capacity: 64 });

describe("desktop reminder planning: 4,408 synthetic requests", () => {
  test("selection and OS-limited coverage", async ({ bench }) => {
    await bench("selection and OS-limited coverage", () => {
      selectNativeReminderRequests({ requests, now, targetThrough, capacity: 64 });
      assessNativeReminderCoverage({ requests, pending, now, targetThrough });
    }).run({ time: 1_000, iterations: 8, warmupIterations: 2 });
  });
});
