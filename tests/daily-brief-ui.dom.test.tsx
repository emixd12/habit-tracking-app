// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyBriefResponse, DailyBriefSettings } from "@cadence/core/types/daily-brief";

import { DailyBriefLauncher } from "@/components/briefing/DailyBriefLauncher";
import { DailyBriefSettingsPanel } from "@/components/briefing/DailyBriefSettingsPanel";
import type { DailyBriefClient } from "@/lib/ui/daily-brief";

let container: HTMLDivElement;
let root: Root;

const settings: DailyBriefSettings = {
  accountRef: "account-a", available: true, enabled: true, includeCalendar: false,
  revision: 1, localDate: "2026-09-20", timezone: "America/New_York",
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

function client(overrides: Partial<DailyBriefClient> = {}): DailyBriefClient {
  return {
    preferences: vi.fn(async () => settings),
    updatePreferences: vi.fn(async (input) => ({ ...settings, ...input })),
    requestBrief: vi.fn(async (): Promise<DailyBriefResponse> => ({
      state: "ready",
      briefing: {
        text: "Start with water before your first meeting.", localDate: settings.localDate, timezone: settings.timezone,
        generatedAt: "2026-09-20T12:00:00Z", expiresAt: "2999-09-20T16:00:00Z", coverage: "partial", warnings: ["Calendar timing is unavailable."],
      },
    })),
    ...overrides,
  };
}

describe("Daily Brief UI", () => {
  it("starts once, announces ready text politely, and keeps the dismiss control reachable", async () => {
    const adapter = client();
    await act(() => root.render(<DailyBriefLauncher client={adapter} />));
    await vi.waitFor(() => expect(container.textContent).toContain("Start with water"));
    expect(adapter.requestBrief).toHaveBeenCalledWith(expect.objectContaining({ retry: false }), expect.any(AbortSignal));
    const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss Daily Brief"]');
    expect(dismiss?.className).toContain("min-h-11");
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
  });

  it("does not reopen a dismissed request when generation finishes", async () => {
    let resolve!: (response: DailyBriefResponse) => void;
    const adapter = client({ requestBrief: vi.fn(() => new Promise<DailyBriefResponse>((done) => { resolve = done; })) });
    await act(() => root.render(<DailyBriefLauncher client={adapter} />));
    await vi.waitFor(() => expect(container.textContent).toContain("Preparing today’s"));
    await act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss Daily Brief"]')!.click());
    await act(() => resolve({ state: "ready", briefing: { text: "Never reopen", localDate: settings.localDate, timezone: settings.timezone,
      generatedAt: "2026-09-20T12:00:00Z", expiresAt: "2999-09-20T16:00:00Z", coverage: "complete", warnings: [] } }));
    expect(container.textContent).not.toContain("Never reopen");
    expect(localStorage.getItem("cadence.daily-brief.presentation.v1:account-a:2026-09-20")).toContain('"dismissed":true');
  });

  it("retries only after an explicit action", async () => {
    const adapter = client({ requestBrief: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ state: "already_attempted" }) });
    await act(() => root.render(<DailyBriefLauncher client={adapter} />));
    await vi.waitFor(() => expect(container.textContent).toContain("could not prepare"));
    expect(adapter.requestBrief).toHaveBeenCalledTimes(1);
    await act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Try again")!.click());
    await vi.waitFor(() => expect(adapter.requestBrief).toHaveBeenCalledTimes(2));
    expect(adapter.requestBrief).toHaveBeenLastCalledWith(expect.objectContaining({ retry: true }), expect.any(AbortSignal));
  });

  it("withdraws pending responses and wraps unbroken model text", async () => {
    const pending = client({ requestBrief: vi.fn(async (): Promise<DailyBriefResponse> => ({ state: "pending" })) });
    await act(() => root.render(<DailyBriefLauncher client={pending} />));
    await vi.waitFor(() => expect(pending.requestBrief).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(container.querySelector("[data-daily-brief-state]")).toBeNull());
    const ready = client({ preferences: vi.fn(async () => ({ ...settings, accountRef: "account-b" })), requestBrief: vi.fn(async (): Promise<DailyBriefResponse> => ({ state: "ready", briefing: {
      text: "x".repeat(2_000), localDate: settings.localDate, timezone: settings.timezone,
      generatedAt: "2026-09-20T12:00:00Z", expiresAt: "2999-09-20T16:00:00Z", coverage: "complete", warnings: [],
    } })) });
    await act(() => root.render(<DailyBriefLauncher client={ready} sessionKey="account-b" />));
    await vi.waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toHaveLength(2_000));
    expect(container.querySelector('[role="status"]')?.className).toContain("[overflow-wrap:anywhere]");
  });

  it("saves only the two Daily Brief settings and discloses the external model", async () => {
    const adapter = client();
    await act(() => root.render(<DailyBriefSettingsPanel client={adapter} />));
    await vi.waitFor(() => expect(container.textContent).toContain("Enable Daily Brief"));
    const controls = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await act(() => controls[1]!.click());
    await vi.waitFor(() => expect(adapter.updatePreferences).toHaveBeenCalledWith({ enabled: true, includeCalendar: true }));
    expect(container.querySelector('a[href="https://developers.openai.com/api/docs/guides/your-data"]')).not.toBeNull();
    expect(container.textContent).toContain("cannot change tracking or Calendar records");
  });
});
