import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRunningTimeSession,
  deleteTimeSessionsForOccurrence,
  listOccurrenceIdsWithTimeSessions,
  listTimeSessionHistory,
  listTimeSessionsByOccurrenceIds,
  stopRunningTimeSession,
} from "@/lib/db/timeSessions.repo";

const rpc = vi.fn();
const select = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const eq = vi.fn();
const inFilter = vi.fn();
const order = vi.fn();
const range = vi.fn();
const is = vi.fn();
const maybeSingle = vi.fn();
const builder = {
  select,
  insert,
  update,
  delete: remove,
  eq,
  in: inFilter,
  order,
  range,
  is,
  maybeSingle,
};
const supabase = { rpc, from: vi.fn(() => builder) };
const repositorySupabase = supabase as never;

describe("time sessions repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue(builder);
    insert.mockReturnValue(builder);
    update.mockReturnValue(builder);
    remove.mockReturnValue(builder);
    eq.mockReturnValue(builder);
    inFilter.mockReturnValue(builder);
    order.mockReturnValue(builder);
    is.mockReturnValue(builder);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads 666 arbitrary occurrence IDs through one bounded RPC request", async () => {
    const occurrenceIds = uuidList(666);
    const sessions = [session(1)];
    mockIdRpcPages([{ data: sessions, error: null }]);

    await expect(
      listTimeSessionsByOccurrenceIds(repositorySupabase, {
        userId: "user-1",
        occurrenceIds,
      }),
    ).resolves.toEqual(sessions);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("list_my_occurrence_time_sessions", {
      occurrence_ids: occurrenceIds,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("reads owner-filtered time-session presence without the authenticated-only RPC", async () => {
    range.mockResolvedValue({
      data: [
        { id: uuid(1), occurrence_id: uuid(101) },
        { id: uuid(2), occurrence_id: uuid(101) },
        { id: uuid(3), occurrence_id: uuid(102) },
      ],
      error: null,
    });

    await expect(
      listOccurrenceIdsWithTimeSessions(repositorySupabase, {
        userId: "user-1",
        occurrenceIds: [uuid(101), uuid(102)],
      }),
    ).resolves.toEqual([uuid(101), uuid(102)]);

    expect(supabase.from).toHaveBeenCalledWith("occurrence_time_sessions");
    expect(select).toHaveBeenCalledWith("id, occurrence_id");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(inFilter).toHaveBeenCalledWith("occurrence_id", [
      uuid(101),
      uuid(102),
    ]);
    expect(order).toHaveBeenCalledWith("id", { ascending: true });
    expect(range).toHaveBeenCalledWith(0, 999);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not query time-session presence for an empty occurrence set", async () => {
    await expect(
      listOccurrenceIdsWithTimeSessions(repositorySupabase, {
        userId: "user-1",
        occurrenceIds: [],
      }),
    ).resolves.toEqual([]);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("paginates time-session presence so later occurrence IDs are not truncated", async () => {
    range
      .mockResolvedValueOnce({
        data: Array.from({ length: 1_000 }, (_, index) => ({
          id: uuid(index + 1),
          occurrence_id: uuid(101),
        })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: uuid(1_001), occurrence_id: uuid(102) }],
        error: null,
      });

    await expect(
      listOccurrenceIdsWithTimeSessions(repositorySupabase, {
        userId: "user-1",
        occurrenceIds: [uuid(101), uuid(102)],
      }),
    ).resolves.toEqual([uuid(101), uuid(102)]);

    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1_000, 1_999);
  });

  it("normalizes duplicate IDs and performs no request for empty input", async () => {
    mockIdRpcPages([{ data: [], error: null }]);

    await listTimeSessionsByOccurrenceIds(repositorySupabase, {
      userId: "user-1",
      occurrenceIds: [uuid(1), uuid(1), uuid(2)],
    });
    expect(rpc).toHaveBeenCalledWith("list_my_occurrence_time_sessions", {
      occurrence_ids: [uuid(1), uuid(2)],
    });

    vi.clearAllMocks();
    await expect(
      listTimeSessionsByOccurrenceIds(repositorySupabase, {
        userId: "user-1",
        occurrenceIds: [],
      }),
    ).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads more than 2,000 unique IDs in sequential database batches", async () => {
    const occurrenceIds = uuidList(2_001);
    const firstRequest = deferredResponse();
    const secondRequest = deferredResponse();
    const range = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    rpc.mockImplementation(() => ({ range }));

    const read = listTimeSessionsByOccurrenceIds(repositorySupabase, {
      userId: "user-1",
      occurrenceIds,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenNthCalledWith(1, "list_my_occurrence_time_sessions", {
      occurrence_ids: occurrenceIds.slice(0, 2_000),
    });

    firstRequest.resolve({ data: [session(2)], error: null });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenNthCalledWith(2, "list_my_occurrence_time_sessions", {
      occurrence_ids: occurrenceIds.slice(2_000),
    });

    secondRequest.resolve({ data: [session(1)], error: null });
    await expect(read).resolves.toEqual([session(1), session(2)]);
  });

  it("continues an exact 1,000-row arbitrary-ID response and deduplicates pages", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) =>
      session(index + 1),
    );
    mockIdRpcPages([
      { data: firstPage, error: null },
      { data: [firstPage[999], session(1_001)], error: null },
    ]);

    const result = await listTimeSessionsByOccurrenceIds(repositorySupabase, {
      userId: "user-1",
      occurrenceIds: [uuid(1)],
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1_001);
    expect(result.at(-1)?.id).toBe(uuid(1_001));
  });

  it("rejects a repeated full arbitrary-ID response page", async () => {
    const fullPage = Array.from({ length: 1_000 }, (_, index) =>
      session(index + 1),
    );
    mockIdRpcPages([
      { data: fullPage, error: null },
      { data: fullPage, error: null },
    ]);

    await expect(
      listTimeSessionsByOccurrenceIds(repositorySupabase, {
        userId: "user-1",
        occurrenceIds: [uuid(1)],
      }),
    ).rejects.toThrow("Time-session ID pagination did not advance.");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("propagates an RPC error without returning partial arbitrary-ID results", async () => {
    mockIdRpcPages([
      { data: Array.from({ length: 1_000 }, (_, index) => session(index + 1)), error: null },
      { data: null, error: { message: "rpc failed" } },
    ]);

    await expect(
      listTimeSessionsByOccurrenceIds(repositorySupabase, {
        userId: "user-1",
        occurrenceIds: [uuid(1)],
      }),
    ).rejects.toMatchObject({ message: "rpc failed" });
  });

  it("logs only privacy-safe arbitrary-ID transport counts", async () => {
    vi.stubEnv("CADENCE_PERF_LOG", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mockIdRpcPages([{ data: [session(1)], error: null }]);

    await listTimeSessionsByOccurrenceIds(repositorySupabase, {
      userId: "private-user-id",
      occurrenceIds: [uuid(1)],
    });

    const event = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(event).toMatchObject({
      span: "db.list_time_sessions_by_occurrence_ids",
      status: "success",
      counts: { rpc_batches: 1, rpc_pages: 1, sessions: 1 },
    });
    expect(JSON.stringify(event)).not.toContain("private-user-id");
    expect(JSON.stringify(event)).not.toContain(uuid(1));
    log.mockRestore();
  });

  it("starts a historical read with date, archive, high-water, and page-size parameters", async () => {
    const sessions = [session(1)];
    rpc.mockResolvedValueOnce({ data: sessions, error: null });

    await expect(
      listTimeSessionHistory(repositorySupabase, {
        userId: "user-1",
        startLocalDate: "2026-05-11",
        endLocalDate: "2026-08-08",
        includeArchived: true,
        throughStartedAt: "2026-08-08T16:00:00Z",
      }),
    ).resolves.toEqual(sessions);

    expect(rpc).toHaveBeenCalledWith("list_my_occurrence_time_session_history", {
      range_start_local_date: "2026-05-11",
      range_end_local_date: "2026-08-08",
      include_archived: true,
      through_started_at: "2026-08-08T16:00:00Z",
      cursor_started_at: null,
      cursor_session_id: null,
      page_size: 1_000,
    });
  });

  it("normalizes the all-time start and follows exact history pages with one high-water", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) =>
      session(index + 1),
    );
    const finalPage = [session(1_001)];
    rpc
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: finalPage, error: null });

    const result = await listTimeSessionHistory(repositorySupabase, {
      userId: "user-1",
      startLocalDate: null,
      endLocalDate: "2026-08-08",
      includeArchived: false,
      throughStartedAt: "2026-08-08T16:00:00Z",
    });

    expect(result).toEqual([...firstPage, ...finalPage]);
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "list_my_occurrence_time_session_history",
      expect.objectContaining({
        range_start_local_date: "0001-01-01",
        through_started_at: "2026-08-08T16:00:00Z",
        cursor_started_at: firstPage[999].started_at,
        cursor_session_id: firstPage[999].id,
      }),
    );
  });

  it("rejects a later history error and a non-advancing full-page cursor", async () => {
    const fullPage = Array.from({ length: 1_000 }, (_, index) =>
      session(index + 1),
    );
    rpc
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "page failed" } });

    const input = {
      userId: "user-1",
      startLocalDate: "2026-01-01",
      endLocalDate: "2026-08-08",
      includeArchived: true,
      throughStartedAt: "2026-08-08T16:00:00Z",
    };
    await expect(
      listTimeSessionHistory(repositorySupabase, input),
    ).rejects.toMatchObject({ message: "page failed" });

    vi.clearAllMocks();
    rpc
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: fullPage, error: null });
    await expect(
      listTimeSessionHistory(repositorySupabase, input),
    ).rejects.toThrow("did not advance");
  });

  it("rejects a lexicographically regressing full history page", async () => {
    const laterPage = Array.from({ length: 1_000 }, (_, index) =>
      session(index + 1_001),
    );
    const earlierPage = Array.from({ length: 1_000 }, (_, index) =>
      session(index + 1),
    );
    rpc
      .mockResolvedValueOnce({ data: laterPage, error: null })
      .mockResolvedValueOnce({ data: earlierPage, error: null });

    await expect(
      listTimeSessionHistory(repositorySupabase, {
        userId: "user-1",
        startLocalDate: "2026-01-01",
        endLocalDate: "2026-08-08",
        includeArchived: true,
        throughStartedAt: "2026-08-08T16:00:00Z",
      }),
    ).rejects.toThrow("Time-session history cursor did not advance.");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("turns the running-session uniqueness race into a service-readable no-op", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    await expect(
      createRunningTimeSession(repositorySupabase, {
        user_id: "user-1",
        occurrence_id: "occurrence-1",
        behavior_id: "behavior-1",
        started_at: "2026-08-02T14:00:00Z",
      }),
    ).resolves.toBeNull();
  });

  it("stops and deletes only the current user's selected occurrence sessions", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "session-1" }, error: null });

    await stopRunningTimeSession(repositorySupabase, {
      userId: "user-1",
      occurrenceId: "occurrence-1",
      sessionId: "session-1",
      stoppedAt: "2026-08-02T14:30:00Z",
    });

    expect(update).toHaveBeenCalledWith({ stopped_at: "2026-08-02T14:30:00Z" });
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq).toHaveBeenCalledWith("occurrence_id", "occurrence-1");
    expect(eq).toHaveBeenCalledWith("id", "session-1");
    expect(is).toHaveBeenCalledWith("stopped_at", null);

    select.mockResolvedValue({ data: [{ id: "session-1" }], error: null });
    await expect(
      deleteTimeSessionsForOccurrence(repositorySupabase, {
        userId: "user-1",
        occurrenceId: "occurrence-1",
      }),
    ).resolves.toEqual(["session-1"]);
    expect(remove).toHaveBeenCalledOnce();
  });
});

function mockIdRpcPages(
  responses: Array<{ data: unknown[] | null; error: unknown }>,
): void {
  for (const response of responses) {
    rpc.mockReturnValueOnce({ range: vi.fn().mockResolvedValue(response) });
  }
}

function session(index: number) {
  return {
    id: uuid(index),
    user_id: "user-1",
    occurrence_id: uuid(index + 10_000),
    behavior_id: uuid(index + 20_000),
    started_at: `2026-08-02T14:${String(Math.floor(index / 60) % 60).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
    stopped_at: `2026-08-02T15:${String(Math.floor(index / 60) % 60).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
  };
}

function uuidList(count: number): string[] {
  return Array.from({ length: count }, (_, index) => uuid(index + 1));
}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function deferredResponse() {
  let resolve!: (value: { data: unknown[]; error: null }) => void;
  const promise = new Promise<{ data: unknown[]; error: null }>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}
