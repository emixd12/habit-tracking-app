import { describe, expect, it, vi } from "vitest";

import {
  cancelUnclaimedPendingReminderDeliveriesById,
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
});
