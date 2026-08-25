import { describe, expect, it, vi } from "vitest";

import {
  cancelUnclaimedPendingReminderDeliveriesById,
  claimPendingEmailReminderDelivery,
  listDuePendingEmailReminderDeliveries,
  markReminderDeliverySent,
  reactivateCancelledReminderDeliveriesById,
} from "@/lib/db/reminderDeliveries.repo";

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
