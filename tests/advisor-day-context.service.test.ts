import { readFile } from "node:fs/promises";
import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  readAdvisorProfileTimezone: vi.fn(),
  readAdvisorCadenceSnapshot: vi.fn(),
  readAdvisorCadenceRevision: vi.fn(),
}));
const admission = vi.hoisted(() => ({
  acquireAdvisorDayContextRead: vi.fn(),
  releaseAdvisorDayContextRead: vi.fn(),
}));
const calendar = vi.hoisted(() => ({
  getCalendarEventsForAdvisor: vi.fn(),
  getCalendarConnection: vi.fn(),
}));

vi.mock("../lib/db/advisor-context.repo", () => repo);
vi.mock("../lib/db/advisor-read-admission.repo", () => admission);
vi.mock("../lib/services/google-calendar.service", () => calendar);

import {
  AdvisorDayContextServiceError,
  readAdvisorDayContext,
  type AdvisorAuthorizationFence,
} from "../lib/services/advisor-day-context.service";

const user = { id: "owner-1" } as never;
const client = {} as never;
const authorization: AdvisorAuthorizationFence = {
  userId: "owner-1",
  clientId: "daily-brief",
  accountRef: "account_ref",
  grantGeneration: 2,
  grantExpiresAt: "2026-09-20T00:00:00Z",
  behaviorIds: ["behavior-1"],
  calendar: null,
};
const snapshot = {
  timezone: "America/New_York",
  profileUpdatedAt: "2026-09-19T11:00:00Z",
  observedAt: "2026-09-19T12:00:01Z",
  revision: "revision-1",
  behaviors: [{ id: "behavior-1", title: "Walk", defaultDurationMinutes: 20, currentConfigurationEventId: null, updatedAt: "2026-09-19T11:00:00Z", endDate: null }],
  occurrences: [{ id: "occurrence-1", behaviorId: "behavior-1", behaviorConfigurationEventId: null, scheduledFor: "2026-09-19T16:30:00Z", localDate: "2026-09-19", scheduleKind: "exact", scheduleStartTime: "12:30:00", scheduleEndTime: null, status: "unresolved", updatedAt: "2026-09-19T11:00:00Z" }],
  historyOccurrences: [],
  historySessions: [],
  syncState: { timezone: "America/New_York", last_synced_local_date: "2026-09-19", synced_through_local_date: "2026-09-19", last_successful_sync_at: "2026-09-19T11:59:00Z", stale: false, stale_reason: null, state_version: 1, updated_at: "2026-09-19T11:59:00Z" },
  dueArchiveCount: 0,
  staleConfigurationCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.readAdvisorProfileTimezone.mockResolvedValue("America/New_York");
  repo.readAdvisorCadenceSnapshot.mockResolvedValue(snapshot);
  repo.readAdvisorCadenceRevision.mockResolvedValue("revision-1");
  admission.acquireAdvisorDayContextRead.mockResolvedValue({ allowed: true, leaseToken: "14600000-0000-4000-8000-000000000001" });
  admission.releaseAdvisorDayContextRead.mockResolvedValue(true);
});

describe("advisor day-context service", () => {
  it("returns one validated read-only day without invoking Calendar or mutation owners", async () => {
    const times = ["2026-09-19T12:00:00Z", "2026-09-19T12:00:02Z"].map(Temporal.Instant.from);
    const result = await readAdvisorDayContext({
      caller: { client, user },
      authorization,
      revalidateAuthorization: async () => authorization,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      clock: () => times.shift() ?? Temporal.Instant.from("2026-09-19T12:00:02Z"),
    });

    expect(result).toMatchObject({ version: "1.0", accountRef: "account_ref", localDate: "2026-09-19", status: "complete", authority: "read_only" });
    expect(result.connectors).toEqual([{ source: "google_calendar", state: "not_requested" }]);
    expect(result.cadence.occurrences[0]).toMatchObject({ title: "Walk", duration: { source: "behavior_default", seconds: 1200 } });
    expect(result.cadence.history).toEqual({
      lookbackDays: 90,
      startLocalDate: "2026-06-21",
      endLocalDateExclusive: "2026-09-19",
      completeness: "complete",
      reason: null,
      behaviors: [{
        behaviorRef: expect.stringMatching(/^behavior_/),
        completedCount: 0,
        notCompletedCount: 0,
        unresolvedCount: 0,
      }],
    });
    expect(result.cadence.occurrences[0]?.ref).not.toContain("occurrence-1");
    expect(calendar.getCalendarEventsForAdvisor).not.toHaveBeenCalled();
    expect(admission.releaseAdvisorDayContextRead).toHaveBeenCalledOnce();
  });

  it("denies missing Calendar disclosure permission before admission or source reads", async () => {
    await expect(readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: async () => authorization,
      includeGoogleCalendar: true,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:00Z"),
    })).rejects.toMatchObject({ code: "access_denied" });
    expect(admission.acquireAdvisorDayContextRead).not.toHaveBeenCalled();
    expect(repo.readAdvisorProfileTimezone).not.toHaveBeenCalled();
  });

  it("rejects stale coverage without generating Occurrences or archiving Behaviors", async () => {
    repo.readAdvisorCadenceSnapshot.mockResolvedValue({ ...snapshot, syncState: { ...snapshot.syncState, stale: true, stale_reason: "behavior_changed" } });
    await expect(readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: async () => authorization,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:00Z"),
    })).rejects.toMatchObject({ code: "context_incomplete", recovery: expect.stringContaining("refresh the Timeline") });
    expect(repo.readAdvisorCadenceRevision).not.toHaveBeenCalled();
    expect(admission.releaseAdvisorDayContextRead).toHaveBeenCalledOnce();
  });

  it("times out a hung final authorization check and releases only after the work settles", async () => {
    let finish!: (value: AdvisorAuthorizationFence) => void;
    const revalidation = new Promise<AdvisorAuthorizationFence>((resolve) => { finish = resolve; });
    const read = readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: () => revalidation,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
      deadlineMs: 5,
    });
    await expect(read).rejects.toMatchObject({ code: "timeout" });
    expect(admission.releaseAdvisorDayContextRead).not.toHaveBeenCalled();
    finish(authorization);
    await vi.waitFor(() => expect(admission.releaseAdvisorDayContextRead).toHaveBeenCalledOnce());
  });

  it("fails when authorization changes before release", async () => {
    const changed = { ...authorization, grantGeneration: 3 };
    await expect(readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: async () => changed,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    })).rejects.toBeInstanceOf(AdvisorDayContextServiceError);
  });

  it("does not delay the validated response on lease cleanup", async () => {
    admission.releaseAdvisorDayContextRead.mockImplementationOnce(() => new Promise(() => undefined));
    const result = await readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: async () => authorization,
      includeGoogleCalendar: false, opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"), deadlineMs: 20,
    });
    expect(result.authority).toBe("read_only");
    expect(admission.releaseAdvisorDayContextRead).toHaveBeenCalledOnce();
  });

  it("returns unknown for capped history while preserving explicit defaults", async () => {
    const behaviors = [
      snapshot.behaviors[0],
      { ...snapshot.behaviors[0], id: "behavior-2", title: "Read", defaultDurationMinutes: null },
    ];
    const occurrences = [
      snapshot.occurrences[0],
      { ...snapshot.occurrences[0], id: "occurrence-2", behaviorId: "behavior-2", scheduledFor: "2026-09-19T17:30:00Z" },
    ];
    repo.readAdvisorCadenceSnapshot.mockResolvedValue({
      ...snapshot,
      behaviors,
      occurrences,
      historyOccurrences: Array.from({ length: 10_001 }, (_, index) => ({ id: `history-${index}`, behaviorId: "behavior-2", localDate: "2026-09-18", status: "completed" })),
    });
    const expandedAuthorization = { ...authorization, behaviorIds: ["behavior-1", "behavior-2"] };
    const result = await readAdvisorDayContext({
      caller: { client, user }, authorization: expandedAuthorization,
      revalidateAuthorization: async () => expandedAuthorization,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    });
    expect(result.cadence.occurrences.map(({ duration }) => duration)).toEqual([
      expect.objectContaining({ kind: "known", source: "behavior_default" }),
      expect.objectContaining({ kind: "unknown", reason: "history_limit_exceeded" }),
    ]);
    expect(result.cadence.history).toMatchObject({
      completeness: "unknown",
      reason: "history_limit_exceeded",
      behaviors: [
        { completedCount: null, notCompletedCount: null, unresolvedCount: null },
        { completedCount: null, notCompletedCount: null, unresolvedCount: null },
      ],
    });
  });

  it("counts every manual status per Behavior and includes zero histories", async () => {
    const behaviors = [
      snapshot.behaviors[0],
      { ...snapshot.behaviors[0], id: "behavior-2", title: "Read", defaultDurationMinutes: null },
    ];
    repo.readAdvisorCadenceSnapshot.mockResolvedValue({
      ...snapshot,
      behaviors,
      historyOccurrences: [
        { id: "history-1", behaviorId: "behavior-1", localDate: "2026-09-16", status: "completed" },
        { id: "history-2", behaviorId: "behavior-1", localDate: "2026-09-17", status: "not_completed" },
        { id: "history-3", behaviorId: "behavior-1", localDate: "2026-09-18", status: "unresolved" },
      ],
    });
    const expandedAuthorization = { ...authorization, behaviorIds: ["behavior-1", "behavior-2"] };
    const result = await readAdvisorDayContext({
      caller: { client, user }, authorization: expandedAuthorization,
      revalidateAuthorization: async () => expandedAuthorization,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    });

    expect(result.cadence.history.behaviors).toEqual([
      expect.objectContaining({ completedCount: 1, notCompletedCount: 1, unresolvedCount: 1 }),
      expect.objectContaining({ completedCount: 0, notCompletedCount: 0, unresolvedCount: 0 }),
    ]);
  });

  it("keeps complete status counts when only duration sessions reach their cap", async () => {
    repo.readAdvisorCadenceSnapshot.mockResolvedValue({
      ...snapshot,
      historyOccurrences: [
        { id: "history-1", behaviorId: "behavior-1", localDate: "2026-09-18", status: "completed" },
      ],
      historySessions: Array.from({ length: 20_001 }, (_, index) => ({
        id: `session-${index}`,
        occurrenceId: "history-1",
        behaviorId: "behavior-1",
        startedAt: "2026-09-18T12:00:00Z",
        stoppedAt: "2026-09-18T12:05:00Z",
      })),
    });

    const result = await readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: async () => authorization,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    });

    expect(result.cadence.history).toMatchObject({
      completeness: "complete",
      behaviors: [{ completedCount: 1, notCompletedCount: 0, unresolvedCount: 0 }],
    });
  });

  it("rejects changed Cadence revisions and occurrence record overflow", async () => {
    repo.readAdvisorCadenceRevision.mockResolvedValueOnce("revision-2");
    await expect(readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: async () => authorization,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    })).rejects.toMatchObject({ code: "context_changed" });

    repo.readAdvisorCadenceSnapshot.mockResolvedValue({
      ...snapshot,
      occurrences: Array.from({ length: 201 }, (_, index) => ({ ...snapshot.occurrences[0], id: `occurrence-${index}`, scheduledFor: `2026-09-19T${String(12 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00Z` })),
    });
    await expect(readAdvisorDayContext({
      caller: { client, user }, authorization,
      revalidateAuthorization: async () => authorization,
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    })).rejects.toMatchObject({ code: "context_limit_exceeded" });
  });

  it("domains opaque references by client", async () => {
    const read = async (clientId: string) => readAdvisorDayContext({
      caller: { client, user },
      authorization: { ...authorization, clientId },
      revalidateAuthorization: async () => ({ ...authorization, clientId }),
      includeGoogleCalendar: false,
      opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    });
    const [first, second] = await Promise.all([read("daily-brief-a"), read("daily-brief-b")]);
    expect(first.cadence.occurrences[0]?.ref).not.toBe(second.cadence.occurrences[0]?.ref);
    expect(first.snapshotId).not.toBe(second.snapshotId);
  });

  it("rejects 501 Calendar events instead of disclosing partial context", async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/external-event-snapshot.valid.json", import.meta.url), "utf8"));
    fixture.events = Array.from({ length: 501 }, (_, index) => ({
      ...fixture.events[0], id: `google_calendar/calendar-1/event-${index}`,
      providerEventId: `event-${index}`, logicalInstanceId: `instance-${index}`,
    }));
    fixture.coverage[0].itemCount = 501;
    const calendarAuthorization = {
      ...authorization,
      calendar: { calendarIds: ["calendar-1"], connectionGeneration: fixture.connectionGeneration, selectionRevision: 2 },
    };
    calendar.getCalendarEventsForAdvisor.mockResolvedValueOnce({
      result: { ok: true, snapshot: fixture }, connection: { selectionRevision: 2 },
    });
    await expect(readAdvisorDayContext({
      caller: { client, user }, authorization: calendarAuthorization,
      revalidateAuthorization: async () => calendarAuthorization,
      includeGoogleCalendar: true, opaqueRefKey: "k".repeat(32),
      now: Temporal.Instant.from("2026-09-19T12:00:02Z"),
    })).rejects.toMatchObject({ code: "context_limit_exceeded", retryable: false });
    expect(admission.releaseAdvisorDayContextRead).toHaveBeenCalledOnce();
  });
});
