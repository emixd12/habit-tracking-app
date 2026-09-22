import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

import {
  cancelPendingReminderDeliveriesForOccurrences,
  cancelUnclaimedPendingReminderDeliveriesById,
  claimPendingEmailReminderDelivery,
  listDuePendingEmailReminderDeliveries,
  listReminderDeliveriesByOccurrenceIds,
  markReminderDeliverySent,
  reactivateCancelledReminderDeliveriesById,
} from "@/lib/db/reminderDeliveries.repo";
import type { ReminderDelivery } from "@/lib/types/database";

function uuid(index: number): string {
  return `${index.toString().padStart(8, "0")}-0000-4000-8000-000000000000`;
}

function reminderDelivery(
  id: string,
  occurrenceId: string,
  scheduledSendAt: string,
): ReminderDelivery {
  return {
    id,
    user_id: uuid(999_999),
    occurrence_id: occurrenceId,
    channel: "browser_push",
    scheduled_send_at: scheduledSendAt,
    sent_at: null,
    processing_started_at: null,
    import_run_id: null,
    imported_intervention_id: null,
    status: "pending",
    error: null,
    created_at: "2026-06-08T00:00:00Z",
    updated_at: "2026-06-08T00:00:00Z",
  };
}

describe("reminder delivery reconciliation writes", () => {
  it("cancels only unclaimed pending rows owned by the user", async () => {
    const inIds = vi.fn().mockResolvedValue({ error: null });
    const processingIsNull = vi.fn().mockReturnValue({ in: inIds });
    const statusEq = vi.fn().mockReturnValue({ is: processingIsNull });
    const userEq = vi.fn().mockReturnValue({ eq: statusEq });
    const update = vi.fn().mockReturnValue({ eq: userEq });
    const from = vi.fn().mockReturnValue({ update });

    await cancelUnclaimedPendingReminderDeliveriesById(
      { from } as never,
      "user-1",
      ["delivery-1"],
    );

    expect(from).toHaveBeenCalledWith("reminder_deliveries");
    expect(update).toHaveBeenCalledWith({
      status: "cancelled",
      error: null,
    });
    expect(userEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(statusEq).toHaveBeenCalledWith("status", "pending");
    expect(processingIsNull).toHaveBeenCalledWith("processing_started_at", null);
    expect(inIds).toHaveBeenCalledWith("id", ["delivery-1"]);
  });

  it("reactivates only cancelled rows owned by the user", async () => {
    const inIds = vi.fn().mockResolvedValue({ error: null });
    const statusEq = vi.fn().mockReturnValue({ in: inIds });
    const userEq = vi.fn().mockReturnValue({ eq: statusEq });
    const update = vi.fn().mockReturnValue({ eq: userEq });
    const from = vi.fn().mockReturnValue({ update });

    await reactivateCancelledReminderDeliveriesById(
      { from } as never,
      "user-1",
      ["delivery-1", "delivery-2"],
    );

    expect(update).toHaveBeenCalledWith({
      status: "pending",
      sent_at: null,
      processing_started_at: null,
      error: null,
    });
    expect(userEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(statusEq).toHaveBeenCalledWith("status", "cancelled");
    expect(inIds).toHaveBeenCalledWith("id", ["delivery-1", "delivery-2"]);
  });

  it("batches and deduplicates array-ID mutations", async () => {
    const inIds = vi.fn().mockResolvedValue({ error: null });
    const processingIsNull = vi.fn().mockReturnValue({ in: inIds });
    const statusEq = vi.fn().mockReturnValue({ is: processingIsNull });
    const userEq = vi.fn().mockReturnValue({ eq: statusEq });
    const update = vi.fn().mockReturnValue({ eq: userEq });
    const from = vi.fn().mockReturnValue({ update });
    const ids = Array.from({ length: 205 }, (_, index) => uuid(index));

    await cancelUnclaimedPendingReminderDeliveriesById(
      { from } as never,
      "user-1",
      [...ids, ids[0]!],
    );

    expect(inIds.mock.calls.map((call) => call[1])).toEqual([
      ids.slice(0, 100),
      ids.slice(100, 200),
      ids.slice(200),
    ]);
  });

  it("stops batched mutations and preserves the repository error", async () => {
    const failure = { code: "PGRST000", message: "request failed" };
    const inIds = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: failure });
    const statusEq = vi.fn().mockReturnValue({ in: inIds });
    const userEq = vi.fn().mockReturnValue({ eq: statusEq });
    const update = vi.fn().mockReturnValue({ eq: userEq });
    const from = vi.fn().mockReturnValue({ update });
    const ids = Array.from({ length: 205 }, (_, index) => uuid(index));

    await expect(
      cancelPendingReminderDeliveriesForOccurrences(
        { from } as never,
        "user-1",
        ids,
      ),
    ).rejects.toBe(failure);

    expect(inIds).toHaveBeenCalledTimes(2);
    expect(inIds.mock.calls.map((call) => call[1])).toEqual([
      ids.slice(0, 100),
      ids.slice(100, 200),
    ]);
  });

  it("keeps large occurrence filters below the failed request size", async () => {
    const requestedUrls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input
            : input.url,
      );
      requestedUrls.push(url);
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = createClient("https://example.supabase.co", "anon-key", {
      global: { fetch: fetcher },
    });
    const ids = Array.from({ length: 479 }, (_, index) => uuid(index));

    await expect(
      listReminderDeliveriesByOccurrenceIds(
        client as never,
        uuid(999_999),
        [...ids, ids[0]!],
      ),
    ).resolves.toEqual([]);

    expect(requestedUrls).toHaveLength(5);
    expect(
      requestedUrls.map((url) => url.searchParams.get("occurrence_id")),
    ).toEqual([
      ids.slice(0, 100),
      ids.slice(100, 200),
      ids.slice(200, 300),
      ids.slice(300, 400),
      ids.slice(400),
    ].map((batch) => `in.(${batch.join(",")})`));
    expect(Math.max(...requestedUrls.map((url) => url.toString().length))).toBeLessThan(5_000);
  });

  it("paginates each batch and restores global delivery ordering", async () => {
    const firstOccurrenceId = uuid(1);
    const secondOccurrenceId = uuid(101);
    const pagedRows = Array.from({ length: 1_001 }, (_, index) =>
      reminderDelivery(
        `paged-${index.toString().padStart(4, "0")}`,
        firstOccurrenceId,
        "2026-06-09T14:00:00Z",
      ),
    );
    let requestIndex = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input
            : input.url,
      );
      const occurrenceFilter = url.searchParams.get("occurrence_id") ?? "";
      const rows = occurrenceFilter.includes(secondOccurrenceId)
        ? [reminderDelivery("earliest", secondOccurrenceId, "2026-06-08T14:00:00Z")]
        : requestIndex === 1
          ? pagedRows.slice(1_000)
          : pagedRows.slice(0, 1_000);
      requestIndex += 1;
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = createClient("https://example.supabase.co", "anon-key", {
      global: { fetch: fetcher },
    });
    const occurrenceIds = Array.from({ length: 101 }, (_, index) => uuid(index + 1));

    const deliveries = await listReminderDeliveriesByOccurrenceIds(
      client as never,
      uuid(999_999),
      occurrenceIds,
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(deliveries).toHaveLength(1_002);
    expect(deliveries[0]?.id).toBe("earliest");
    expect(deliveries.at(-1)?.id).toBe("paged-1000");
  });

  it("uses the same stale-claim predicate for due selection and claim update", async () => {
    const reclaimBefore = "2026-06-08T13:45:00Z";
    const dueAt = "2026-06-08T14:00:00Z";
    const dueLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const dueOrder = vi.fn().mockReturnValue({ limit: dueLimit });
    const dueLte = vi.fn().mockReturnValue({ order: dueOrder });
    const dueOr = vi.fn().mockReturnValue({ lte: dueLte });
    const dueStatusEq = vi.fn().mockReturnValue({ or: dueOr });
    const dueChannelEq = vi.fn().mockReturnValue({ eq: dueStatusEq });
    const select = vi.fn().mockReturnValue({ eq: dueChannelEq });

    await listDuePendingEmailReminderDeliveries(
      { from: vi.fn().mockReturnValue({ select }) } as never,
      { dueAt, reclaimBefore, limit: 25 },
    );

    const claimMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const claimSelect = vi
      .fn()
      .mockReturnValue({ maybeSingle: claimMaybeSingle });
    const claimLte = vi.fn().mockReturnValue({ select: claimSelect });
    const claimOr = vi.fn().mockReturnValue({ lte: claimLte });
    const claimStatusEq = vi.fn().mockReturnValue({ or: claimOr });
    const claimChannelEq = vi.fn().mockReturnValue({ eq: claimStatusEq });
    const claimUserEq = vi.fn().mockReturnValue({ eq: claimChannelEq });
    const claimIdEq = vi.fn().mockReturnValue({ eq: claimUserEq });
    const update = vi.fn().mockReturnValue({ eq: claimIdEq });

    await claimPendingEmailReminderDelivery(
      { from: vi.fn().mockReturnValue({ update }) } as never,
      {
        id: "delivery-1",
        userId: "user-1",
        dueAt,
        reclaimBefore,
        processingStartedAt: dueAt,
      },
    );

    const reclaimPredicate =
      `processing_started_at.is.null,processing_started_at.lt.${reclaimBefore}`;
    expect(dueOr).toHaveBeenCalledWith(reclaimPredicate);
    expect(claimOr).toHaveBeenCalledWith(reclaimPredicate);
  });

  it("marks a delivery sent only while pending and reports whether a row changed", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "delivery-1" },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const statusEq = vi.fn().mockReturnValue({ select });
    const userEq = vi.fn().mockReturnValue({ eq: statusEq });
    const idEq = vi.fn().mockReturnValue({ eq: userEq });
    const update = vi.fn().mockReturnValue({ eq: idEq });

    await expect(
      markReminderDeliverySent(
        { from: vi.fn().mockReturnValue({ update }) } as never,
        {
          id: "delivery-1",
          userId: "user-1",
          sentAt: "2026-06-08T14:00:00Z",
        },
      ),
    ).resolves.toBe(true);

    expect(statusEq).toHaveBeenCalledWith("status", "pending");
    expect(select).toHaveBeenCalledWith("id");

    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      markReminderDeliverySent(
        { from: vi.fn().mockReturnValue({ update }) } as never,
        {
          id: "delivery-1",
          userId: "user-1",
          sentAt: "2026-06-08T14:00:00Z",
        },
      ),
    ).resolves.toBe(false);
  });
});
