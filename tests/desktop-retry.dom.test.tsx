// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { resolveTimeline } from "@cadence/core/resolvers/timeline.resolver";
import { resolveAnalytics } from "@cadence/core/resolvers/analytics.resolver";
import { resolveExportBundle } from "@cadence/core/resolvers/export.resolver";
import { Product } from "../apps/desktop/src/product";
import { LocalExportScreen } from "../apps/desktop/src/export-screen";

const mocks = vi.hoisted(() => ({ timeline: vi.fn(), behaviors: vi.fn(), command: vi.fn(), exportData: vi.fn(), imports: vi.fn(), restores: vi.fn(),
  listen: vi.fn(), events: vi.fn(), reminders: vi.fn(), retainDeliveries: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn(async (command: string) => {
  if (command === "read_update_configuration") return { configured: false, version: "0.1.0" };
  throw new Error(`Unexpected native command: ${command}`);
}) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("../apps/desktop/src/native-spike", () => ({ readNativeEvents: mocks.events }));
vi.mock("../apps/desktop/src/local-timeline.service", () => ({ loadLocalTimeline: mocks.timeline }));
vi.mock("../apps/desktop/src/local-behaviors-read.service", () => ({ getLocalBehaviorsPageData: mocks.behaviors }));
vi.mock("../apps/desktop/src/local-store", () => ({ localCommand: mocks.command }));
vi.mock("../apps/desktop/src/local-reminder.service", () => ({
  reconcileLocalReminders: mocks.reminders,
  retainNativeDeliveryEvents: mocks.retainDeliveries,
  requestLocalNotificationPermission: vi.fn(), reminderCoverageView: vi.fn(),
}));
vi.mock("../apps/desktop/src/local-export.service", () => ({ getLocalExportPageData: mocks.exportData, getLocalExportDownload: vi.fn() }));
vi.mock("../apps/desktop/src/local-import.service", () => ({ getLocalBehaviorLogImportPageData: mocks.imports,
  previewLocalBehaviorLogImport: vi.fn(), applyLocalBehaviorLogImport: vi.fn() }));
vi.mock("../apps/desktop/src/local-restore.service", () => ({ getLocalBehaviorLogRestorePageData: mocks.restores,
  previewLocalBehaviorLogRestore: vi.fn(), applyLocalBehaviorLogRestore: vi.fn() }));

const now = Temporal.Instant.from("2026-08-30T12:00:00Z");
const profile = { id: "11111111-1111-4111-8111-111111111111", email: "", display_name: null, timezone: "America/New_York",
  created_at: now.toString(), updated_at: now.toString() };
let root: Root;
let container: HTMLDivElement;
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); }
async function retry() {
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === "Try again");
  expect(button).toBeDefined();
  await act(() => button!.click()); await settle();
}
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  localStorage.setItem("cadence-first-run-dismissed", "true");
  mocks.listen.mockResolvedValue(() => {}); mocks.events.mockResolvedValue([]);
  mocks.reminders.mockRejectedValue(new Error("OS readback unavailable in this test"));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  mocks.command.mockImplementation(async (operation: string) => {
    if (operation === "readProfile") return profile;
    if (operation === "readImportRuns") return [];
    throw new Error(`Unexpected mutation or read: ${operation}`);
  });
  mocks.timeline.mockResolvedValue({ profile, behaviors: [], categories: [],
    timeline: resolveTimeline({ now, timezone: profile.timezone, occurrences: [] }) });
  mocks.behaviors.mockResolvedValue({ behaviors: { activeBehaviors: [], archivedBehaviors: [], categories: [] },
    analytics: resolveAnalytics({ now, timezone: profile.timezone, occurrences: [] }) });
  mocks.exportData.mockResolvedValue(resolveExportBundle({ now, timezone: profile.timezone, profile: { timezone: profile.timezone, subjectId: "local" },
    behaviors: [], categories: [], occurrences: [], range: "30" }));
  mocks.imports.mockResolvedValue({ recentRuns: [] }); mocks.restores.mockResolvedValue({ recentRuns: [] });
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("desktop lifecycle refresh", () => {
  async function mountAt(instant: string) {
    vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
    await act(() => root.render(<Product />));
    await act(() => vi.advanceTimersByTimeAsync(0));
  }

  it.each(["wake", "resume"])("refreshes Timeline and reminder state after %s without leaving the selected screen", async (kind) => {
    await mountAt("2026-08-30T12:00:00Z");
    const behaviors = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Behaviors")!;
    await act(() => behaviors.click());
    vi.setSystemTime(new Date("2026-08-31T14:00:00Z"));
    mocks.events.mockResolvedValueOnce([{ kind, at: "2026-08-31T14:00:00Z" }]);
    await act(async () => { mocks.listen.mock.calls[0][1]({ payload: null }); });
    expect(mocks.timeline).toHaveBeenCalledTimes(2);
    expect(mocks.timeline.mock.calls[1][1].epochMilliseconds).toBe(Date.parse("2026-08-31T14:00:00Z"));
    expect(mocks.reminders).toHaveBeenCalledTimes(2);
    expect(container.querySelector("h1")?.textContent).toBe("Behaviors");
  });

  it("refreshes at profile-local midnight before the next minute poll and stops after unmount", async () => {
    mocks.timeline.mockImplementation(async (_days, at: Temporal.Instant) => ({ profile, behaviors: [], categories: [],
      timeline: resolveTimeline({ now: at, timezone: profile.timezone, occurrences: [{
        id: "midnight-occurrence", behaviorId: "midnight-behavior", title: "Evening walk", description: "", categoryName: "No category",
        scheduleSummary: "Daily", scheduledFor: "2026-08-31T03:00:00Z", scheduledTimeLabel: "11:00 PM",
        localDate: "2026-08-30", status: "unresolved", statusMarkedAt: null, note: "",
        timeTracking: { recordedSeconds: 0, runningStartedAt: null }, canStartTimeTracking: true,
      }] }) }));
    await mountAt("2026-08-31T03:59:59.500Z");
    expect(mocks.timeline).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-occurrence-id="midnight-occurrence"]')).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(mocks.timeline).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mocks.timeline).toHaveBeenCalledTimes(2);
    expect(mocks.timeline.mock.calls[1][1].epochMilliseconds).toBe(Date.parse("2026-08-31T04:00:00Z"));
    expect(mocks.reminders).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-occurrence-id="midnight-occurrence"]')).toBeNull();
    const needsDecision = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Needs decision"));
    expect(needsDecision?.textContent).toContain("1");
    await act(() => root.unmount());
    await act(() => vi.advanceTimersByTimeAsync(86_400_000));
    expect(mocks.timeline).toHaveBeenCalledTimes(2);
  });

  it("replaces the midnight timer after the loaded profile timezone changes", async () => {
    await mountAt("2026-08-31T03:59:59.500Z");
    const changedProfile = { ...profile, timezone: "UTC" };
    mocks.timeline.mockResolvedValueOnce({ profile: changedProfile, behaviors: [], categories: [],
      timeline: resolveTimeline({ now, timezone: changedProfile.timezone, occurrences: [] }) });
    mocks.events.mockResolvedValueOnce([{ kind: "resume", at: "2026-08-31T03:59:59.500Z" }]);
    await act(async () => { mocks.listen.mock.calls[0][1]({ payload: null }); });
    expect(mocks.timeline).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.timeline).toHaveBeenCalledTimes(2);
    expect(mocks.reminders).toHaveBeenCalledTimes(2);
  });

  it("does not lose a wake arriving while the initial native event drain is pending", async () => {
    let finishInitial!: (events: unknown[]) => void;
    mocks.events.mockImplementationOnce(() => new Promise((resolve) => { finishInitial = resolve; }));
    await mountAt("2026-08-30T12:00:00Z");
    mocks.events.mockResolvedValueOnce([{ kind: "wake", at: "2026-08-30T12:01:00Z" }]);
    vi.setSystemTime(new Date("2026-08-30T12:01:00Z"));
    await act(async () => { mocks.listen.mock.calls[0][1]({ payload: null }); });
    await act(async () => { finishInitial([]); });
    expect(mocks.events).toHaveBeenCalledTimes(2);
    expect(mocks.timeline).toHaveBeenCalledTimes(2);
    expect(mocks.reminders).toHaveBeenCalledTimes(2);
  });

  it("retains launch activation evidence before the first reminder repair and keeps persistence failures visible", async () => {
    let finishInitial!: (events: unknown[]) => void;
    mocks.events.mockImplementationOnce(() => new Promise((resolve) => { finishInitial = resolve; }));
    await mountAt("2026-08-30T12:00:00Z");
    expect(mocks.reminders).not.toHaveBeenCalled();
    const delivery = { requestId: "cadence.local.33333333-3333-4333-8333-333333333333", fireAt: "2026-08-30T11:00:00Z",
      title: "Walk", body: "Synthetic", deliveredAt: "2026-08-30T11:00:01Z" };
    const events = [{ kind: "notificationActivated", id: delivery.requestId, at: "2026-08-30T12:00:00Z", delivery }];
    mocks.reminders.mockRejectedValue(new Error("Could not persist OS delivery"));
    await act(async () => { finishInitial(events); });
    expect(mocks.retainDeliveries).toHaveBeenCalledExactlyOnceWith(events);
    expect(mocks.retainDeliveries.mock.invocationCallOrder[0]).toBeLessThan(mocks.reminders.mock.invocationCallOrder[0]);
    const settings = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Settings")!;
    await act(() => settings.click());
    expect(container.textContent).toContain("Could not persist OS delivery");
  });
});

describe("desktop failed-read retries", () => {
  it("clears the Product forced-setup request after dismissal and screen navigation", async () => {
    await act(() => root.render(<Product />)); await settle();
    async function click(label: string) {
      const element = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
        item.getAttribute("aria-label") === label || item.textContent?.trim() === label);
      expect(element).toBeDefined(); await act(() => element!.click()); await settle();
    }
    await click("Settings"); await click("Show setup guide");
    expect(container.querySelector('[aria-labelledby="desktop-setup-title"]')).not.toBeNull();
    await click("Dismiss setup");
    expect(container.querySelector('[aria-labelledby="desktop-setup-title"]')).toBeNull();
    await click("Behaviors"); await click("Timeline");
    expect(container.querySelector('[aria-labelledby="desktop-setup-title"]')).toBeNull();
    expect(localStorage.getItem("cadence-first-run-dismissed")).toBe("true");
  });

  it("retries the product read, keeps a repeated error visible, then opens the same local profile", async () => {
    mocks.timeline.mockRejectedValueOnce(new Error("SQLite temporarily busy")).mockRejectedValueOnce(new Error("SQLite still busy"));
    await act(() => root.render(<Product />)); await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("SQLite temporarily busy");
    await retry(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("SQLite still busy");
    await retry();
    expect(mocks.timeline).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Timeline");
    expect(mocks.command).toHaveBeenCalledExactlyOnceWith("readImportRuns", { profileId: profile.id, limit: 1 });
  });

  it("retries Export without resetting profile or invoking an import or restore mutation", async () => {
    mocks.exportData.mockRejectedValueOnce(new Error("Export snapshot unavailable"));
    const changed = vi.fn();
    await act(() => root.render(<LocalExportScreen onChanged={changed} />)); await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Export snapshot unavailable");
    await retry();
    expect(mocks.exportData).toHaveBeenCalledTimes(2);
    expect(mocks.exportData).toHaveBeenLastCalledWith(profile, {});
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("BehaviorLog bundle (.behaviorlog.zip)");
    expect(mocks.command.mock.calls).toEqual([["readProfile", {}], ["readProfile", {}]]);
    expect(changed).not.toHaveBeenCalled();
  });
});
