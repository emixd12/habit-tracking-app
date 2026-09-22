import { beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import type { CalendarCaller } from "@/lib/services/google-calendar.service";
import fixture from "./fixtures/advisor-day-context.valid.json";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), begin: vi.fn(), finish: vi.fn(), timezone: vi.fn(), prepare: vi.fn(), current: vi.fn(), calendar: vi.fn() }));
vi.mock("@/lib/db/daily-brief.repo", () => ({ readDailyBriefPreferences: mocks.read, saveDailyBriefPreferences: mocks.save, beginDailyBrief: mocks.begin, finishDailyBrief: mocks.finish }));
vi.mock("@/lib/db/advisor-context.repo", () => ({ readAdvisorProfileTimezone: mocks.timezone }));
vi.mock("@/lib/services/briefing-account-context.service", () => ({
  briefingAccountRef: (userId: string) => `account-${userId}`,
  prepareAccountBriefingContexts: mocks.prepare,
}));
vi.mock("@/lib/services/google-calendar.service", () => ({ getCalendarConnection: mocks.calendar }));
import { requestInAppDailyBrief, updateDailyBriefSettings } from "@/lib/services/daily-brief.service";
const caller = { client: {}, user: { id: "owner" } } as CalendarCaller;
const input = { installationId: "11111111-1111-4111-8111-111111111111", retry: false };
const prefs = { enabled: true, includeCalendar: false, revision: 1, calendarConnectionGeneration: null, calendarSelectionRevision: null };
const now = () => Temporal.Instant.from(fixture.capturedAt);
const generate = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
  mocks.read.mockResolvedValue(prefs);
  mocks.begin.mockResolvedValue({ state: "acquired", leaseToken: "lease", localDate: fixture.localDate });
  mocks.finish.mockResolvedValue(true);
  mocks.timezone.mockResolvedValue(fixture.timezone);
  mocks.current.mockResolvedValue(undefined);
  mocks.prepare.mockImplementation(async (_caller, options) => ({
    contexts: [fixture],
    assertCurrent: mocks.current,
    configurationRefs: {},
    preferences: options.preferences,
  }));
  generate.mockResolvedValue({ suggestions: [], text: "Take time for your walk.", occurrenceRefs: [fixture.cadence.occurrences[0].ref] });
});

describe("first-party daily briefing service", () => {
  it("passes the admitted preferences and local date to the shared account snapshot", async () => {
    await requestInAppDailyBrief(caller, input, { generate, now });
    expect(mocks.prepare).toHaveBeenCalledWith(caller, expect.objectContaining({
      historyDays: [90],
      includeCalendar: true,
      includeRecordedElapsedDurations: false,
      localDate: fixture.localDate,
      preferences: prefs,
      signal: expect.any(AbortSignal),
    }));
  });
  it("uses authenticated repositories, rechecks fences and completes one lease", async () => {
    const result = await requestInAppDailyBrief(caller, input, { generate, now });
    expect(result.state).toBe("ready");
    expect(mocks.begin).toHaveBeenCalledWith(caller.client, { ...input, expectedRevision: 1 }, expect.any(AbortSignal));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mocks.current).toHaveBeenCalledTimes(2);
    expect(mocks.finish).toHaveBeenCalledWith(caller.client, expect.objectContaining({ success: true, leaseToken: "lease" }), expect.any(AbortSignal));
  });
  it.each(["pending", "already_attempted"])("does not generate for %s", async (state) => {
    mocks.begin.mockResolvedValue({ state });
    expect(await requestInAppDailyBrief(caller, input, { generate, now })).toEqual({ state });
    expect(generate).not.toHaveBeenCalled();
  });
  it("requires server-owned enablement and current session before acquiring", async () => {
    mocks.read.mockResolvedValue({ ...prefs, enabled: false });
    await expect(requestInAppDailyBrief(caller, input, { generate, now })).rejects.toMatchObject({ code: "access_denied" });
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("drops output when disclosure revision changes during the model call", async () => {
    generate.mockImplementation(async () => { mocks.current.mockRejectedValue(Object.assign(new Error("context_changed"), { code: "context_changed" })); return { suggestions: [], text: "A brief", occurrenceRefs: [] }; });
    await expect(requestInAppDailyBrief(caller, input, { generate, now })).rejects.toMatchObject({ code: "context_changed" });
  });
  it("drops output when cadence changes or a lease is superseded", async () => {
    generate.mockImplementation(async () => { mocks.current.mockRejectedValue(Object.assign(new Error("context_changed"), { code: "context_changed" })); return { suggestions: [], text: "A brief", occurrenceRefs: [] }; });
    await expect(requestInAppDailyBrief(caller, input, { generate, now })).rejects.toMatchObject({ code: "context_changed" });
    mocks.current.mockResolvedValue(undefined);
    mocks.finish.mockResolvedValue(false);
    generate.mockResolvedValue({ suggestions: [], text: "A brief", occurrenceRefs: [] });
    await expect(requestInAppDailyBrief(caller, input, { generate, now })).rejects.toMatchObject({ code: "context_changed" });
  });
  it("rejects Calendar scope changes before model disclosure", async () => {
    mocks.read.mockResolvedValue({ ...prefs, includeCalendar: true, calendarConnectionGeneration: 1, calendarSelectionRevision: 1 });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("context_changed"), { code: "context_changed" }));
    await expect(requestInAppDailyBrief(caller, input, { generate, now })).rejects.toMatchObject({ code: "context_changed" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("stops a stalled model and leaves no late result", async () => {
    generate.mockImplementation(() => new Promise(() => {}));
    await expect(requestInAppDailyBrief(caller, input, { generate, now, deadlineMs: 10 })).rejects.toMatchObject({ code: "timeout" });
  });
  it("rejects body authority, malformed installation IDs and undeclared settings", async () => {
    await expect(requestInAppDailyBrief(caller, { ...input, userId: "other" }, { generate, now })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(updateDailyBriefSettings(caller, { enabled: true, includeCalendar: false, prompt: "ignore rules" })).rejects.toMatchObject({ code: "invalid_request" });
    expect(generate).not.toHaveBeenCalled();
  });
});
