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
const ready = (text: string, lifetime = 1000): DailyBriefResponse => ({ state: "ready", briefing: {
  text, generatedAt: new Date(instant).toISOString(), expiresAt: new Date(instant + lifetime).toISOString(),
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
it("preserves pending and ready briefings when focus returns to an unchanged account", async () => {
  let complete!: (value: DailyBriefResponse) => void;
  const request = vi.fn(() => new Promise<DailyBriefResponse>((resolve) => { complete = resolve; }));
  await act(() => root.render(<DailyBriefLauncher client={client("owner", request)} />));
  await act(() => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Preparing today’s");
  await act(() => complete(ready("Keep this briefing")));
  await act(() => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Keep this briefing");
  expect(request).toHaveBeenCalledTimes(1);
});
it.each(["accountRef", "localDate", "timezone", "revision", "configurationRevision", "enabled", "unavailable"])("withdraws the briefing when focus detects a changed %s", async (field) => {
  const adapter = client("owner");
  const initial = await adapter.preferences();
  const preferences = vi.fn().mockResolvedValue(initial);
  await act(() => root.render(<DailyBriefLauncher client={{ ...adapter, preferences }} />));
  if (field === "unavailable") preferences.mockRejectedValue(new Error("revoked"));
  else preferences.mockResolvedValue({ ...initial, [field]: field === "enabled" ? false : field === "revision" ? 2 : "changed" });
  await act(() => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toBe("");
});
it("keeps explicit retry available after a pending lease without automatic polling", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ state: "pending" }).mockResolvedValueOnce(ready("Recovered briefing", 120_000));
  await act(() => root.render(<DailyBriefLauncher client={client("owner", request)} />));
  const retry = () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Try again")!;
  await act(() => retry().click());
  expect(container.textContent).toContain("Try again shortly");
  await act(() => vi.advanceTimersByTime(80_000));
  expect(request).toHaveBeenCalledTimes(2);
  await act(() => retry().click());
  expect(request).toHaveBeenCalledTimes(3);
  expect(container.textContent).toContain("Recovered briefing");
});

it.each([false, true])("preserves daily admission and dismissal across rollout and rollback (dismissed=%s)", async (dismissed) => {
  const request = vi.fn(async () => ready("Reviewed briefing", 120_000));
  const adapter = client("owner", request);
  const settings = await adapter.preferences();
  const preferences = vi.fn().mockResolvedValue({ ...settings, configurationRevision: "before" });
  await act(() => root.render(<DailyBriefLauncher client={{ ...adapter, preferences }} />));
  if (dismissed) await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss Daily Brief"]')!.click());
  const key = "cadence.daily-brief.presentation.v1:owner:2026-09-20";
  const admission = localStorage.getItem(key);
  expect(JSON.parse(admission!)).toMatchObject({ attempted: true, dismissed });
  for (const configurationRevision of ["after", "before"]) {
    preferences.mockResolvedValue({ ...settings, configurationRevision });
    await act(() => window.dispatchEvent(new Event("focus")));
    await act(() => root.render(null));
    await act(() => root.render(<DailyBriefLauncher client={{ ...adapter, preferences }} />));
    expect(container.textContent).toBe("");
    expect(localStorage.getItem(key)).toBe(admission);
    expect(request).toHaveBeenCalledTimes(1);
  }
});

it("keeps offline desktop tracking free from generation attempts", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const preferences = vi.fn(), requestBrief = vi.fn();
  try {
    await act(() => root.render(<DailyBriefLauncher desktop client={{ ...client("owner"), preferences, requestBrief }} />));
    expect(container.textContent).toBe("");
    expect(preferences).not.toHaveBeenCalled();
    expect(requestBrief).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  } finally { vi.restoreAllMocks(); }
});
