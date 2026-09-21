// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DailyBriefLauncher } from "@/components/briefing/DailyBriefLauncher";
import type { DailyBriefClient } from "@/lib/ui/daily-brief";
import type { DailyBriefResponse } from "@cadence/core/types/daily-brief";
let container: HTMLDivElement;
let root: Root;
const instant = Date.parse("2026-09-20T12:00:00Z");
const ready = (text: string): DailyBriefResponse => ({ state: "ready", briefing: {
  text, generatedAt: new Date(instant).toISOString(), expiresAt: new Date(instant + 1000).toISOString(),
  timezone: "America/New_York", localDate: "2026-09-20", coverage: "complete", warnings: [],
} });
function client(accountRef: string, requestBrief: DailyBriefClient["requestBrief"] = async () => ready(accountRef)): DailyBriefClient {
  return { preferences: async () => ({ accountRef, available: true, enabled: true, includeCalendar: false, revision: 1, localDate: "2026-09-20", timezone: "America/New_York" }), requestBrief,
    updatePreferences: vi.fn() };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(instant);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); });
it("leaves Timeline unobstructed when preferences fail before an attempt exists", async () => {
  const unavailable = client("owner");
  const request = vi.fn();
  await act(() => root.render(<DailyBriefLauncher client={{ ...unavailable, preferences: async () => { throw new Error("offline"); }, requestBrief: request }} />));
  expect(container.textContent).toBe("");
  expect(request).not.toHaveBeenCalled();
});
it("withdraws timing text at expiry without another render or model request", async () => {
  const request = vi.fn(async () => ready("Fresh advice"));
  await act(() => root.render(<DailyBriefLauncher client={client("owner", request)} />));
  expect(container.textContent).toContain("Fresh advice");
  await act(() => vi.advanceTimersByTime(1001));
  expect(container.textContent).not.toContain("Fresh advice");
  expect(request).toHaveBeenCalledTimes(1);
});
it("hides an old owner's output immediately on account switch and logout", async () => {
  await act(() => root.render(<DailyBriefLauncher client={client("first")} sessionKey="first" />));
  expect(container.textContent).toContain("first");
  const pending = client("second", () => new Promise(() => {}));
  await act(() => root.render(<DailyBriefLauncher client={pending} sessionKey="second" />));
  expect(container.textContent).not.toContain("first");
  await act(() => root.render(<DailyBriefLauncher client={null} sessionKey="local" />));
  expect(container.textContent).toBe("");
});
it("discards late model output after a cross-tab disclosure change", async () => {
  let complete!: (value: DailyBriefResponse) => void;
  await act(() => root.render(<DailyBriefLauncher client={client("owner", () => new Promise((resolve) => { complete = resolve; }))} />));
  await act(() => window.dispatchEvent(new StorageEvent("storage", { key: "cadence.daily-brief.settings-revision.v1", newValue: "2" })));
  await act(() => complete(ready("Withdrawn advice")));
  expect(container.textContent).toBe("");
});
