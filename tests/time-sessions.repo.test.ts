import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRunningTimeSession,
  deleteTimeSessionsForOccurrence,
  listTimeSessionsByOccurrenceIds,
  stopRunningTimeSession,
} from "@/lib/db/timeSessions.repo";

const select = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const eq = vi.fn();
const inFilter = vi.fn();
const is = vi.fn();
const order = vi.fn();
const maybeSingle = vi.fn();
const builder = { select, insert, update, delete: remove, eq, in: inFilter, is, order, maybeSingle };
const supabase = { from: vi.fn(() => builder) };
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
    is.mockReturnValue(builder);
    order.mockReturnValue(builder);
  });

  it("lists only owner-scoped occurrence sessions in a stable order", async () => {
    const sessions = [{ id: "session-1" }];
    order
      .mockReturnValueOnce(builder)
      .mockResolvedValueOnce({ data: sessions, error: null });

    await expect(
      listTimeSessionsByOccurrenceIds(repositorySupabase, {
        userId: "user-1",
        occurrenceIds: ["occurrence-1"],
      }),
    ).resolves.toEqual(sessions);

    expect(supabase.from).toHaveBeenCalledWith("occurrence_time_sessions");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(inFilter).toHaveBeenCalledWith("occurrence_id", ["occurrence-1"]);
    expect(order).toHaveBeenNthCalledWith(1, "started_at", { ascending: true });
    expect(order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
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
