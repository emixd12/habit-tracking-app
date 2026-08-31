import { afterEach, expect, it, vi } from "vitest";
import { scheduleLocalDayRefresh } from "../apps/desktop/src/desktop-lifecycle";

afterEach(() => vi.useRealTimers());

it.each([
  ["America/New_York", "2026-03-08T05:00:00Z", 23],
  ["America/New_York", "2026-11-01T04:00:00Z", 25],
  ["Asia/Kathmandu", "2026-08-30T18:15:00Z", 24],
])("schedules the next local midnight in %s from %s after %s hours", (timezone, instant, hours) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
  const refresh = vi.fn();
  const stop = scheduleLocalDayRefresh(timezone, refresh);
  vi.advanceTimersByTime(hours * 3_600_000 - 1);
  expect(refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(86_400_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
  vi.advanceTimersByTime(172_800_000);
  expect(refresh).toHaveBeenCalledTimes(2);
});
