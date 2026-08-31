import { Temporal } from "@js-temporal/polyfill";
import {
  assessNativeReminderCoverage, selectNativeReminderRequests,
  type NativeReminderRequest,
} from "../../../lib/resolvers/native-reminder.resolver";
import { assertProbeCount, cancelProbes, notifications } from "./native-spike";

// Operator-only probe. The application scheduler will use the same pure planning rules.
export async function runNativeCoverageProbe(count: number, now = Temporal.Now.instant()) {
  assertProbeCount(count);
  const targetThrough = now.add({ hours: 30 * 24 });
  const requests: NativeReminderRequest[] = Array.from({ length: count }, (_, index) => ({
    id: `cadence-spike.${index + 1}`,
    title: "Cadence native coverage test",
    body: "Synthetic capacity probe. Cancel after verification.",
    fireAt: now.add({ hours: 24, minutes: index }).toString(),
  }));
  const context = { requests, now, targetThrough };
  await cancelProbes();
  let result = await schedule(selectNativeReminderRequests({ ...context, capacity: count }));
  let coverage = assessNativeReminderCoverage({ ...context, pending: result.pending! });

  if (coverage.missingIds.length && coverage.scheduledCount > 0) {
    // ponytail: one repair bounds this probe's OS calls; show any remaining gap explicitly.
    await cancelProbes();
    result = await schedule(selectNativeReminderRequests({ ...context, capacity: coverage.scheduledCount }));
    coverage = assessNativeReminderCoverage({ ...context, pending: result.pending! });
  }
  return { result, coverage, targetThrough: targetThrough.toString(), checkedAt: now.toString() };
}

async function schedule(reminders: NativeReminderRequest[]) {
  const result = await notifications({ operation: "schedule", reminders });
  if (!result.pending || result.errors?.length) {
    throw new Error("Coverage is unverified: native scheduling or readback failed. Read pending notifications and cancel the probes.");
  }
  return result;
}
