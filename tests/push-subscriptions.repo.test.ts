import { describe, expect, it, vi } from "vitest";

import {
  deactivateCurrentUserPushSubscriptionByEndpoint,
  hasActivePushSubscriptionForUser,
  listActivePushSubscriptionsForUser,
} from "@/lib/db/pushSubscriptions.repo";

describe("push subscription repository ownership", () => {
  it("checks one active endpoint through the current user's RLS-scoped query", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "subscription-1" },
      error: null,
    });
    const activeEq = vi.fn().mockReturnValue({ maybeSingle });
    const authEq = vi.fn().mockReturnValue({ eq: activeEq });
    const p256dhEq = vi.fn().mockReturnValue({ eq: authEq });
    const endpointEq = vi.fn().mockReturnValue({ eq: p256dhEq });
    const userEq = vi.fn().mockReturnValue({ eq: endpointEq });
    const select = vi.fn().mockReturnValue({ eq: userEq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(
      hasActivePushSubscriptionForUser({ from } as never, {
        userId: "user-1",
        endpoint: "https://push.example.com/subscription/1",
        p256dh: "public-key",
        auth: "auth-key",
      }),
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith("push_subscriptions");
    expect(select).toHaveBeenCalledWith("id");
    expect(userEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(endpointEq).toHaveBeenCalledWith(
      "endpoint",
      "https://push.example.com/subscription/1",
    );
    expect(p256dhEq).toHaveBeenCalledWith("p256dh", "public-key");
    expect(authEq).toHaveBeenCalledWith("auth", "auth-key");
    expect(activeEq).toHaveBeenCalledWith("active", true);
  });

  it("limits reminder fan-out reads to the 20 most recently used rows", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderId = vi.fn().mockReturnValue({ limit });
    const orderCreated = vi.fn().mockReturnValue({ order: orderId });
    const orderUpdated = vi.fn().mockReturnValue({ order: orderCreated });
    const activeEq = vi.fn().mockReturnValue({ order: orderUpdated });
    const userEq = vi.fn().mockReturnValue({ eq: activeEq });
    const select = vi.fn().mockReturnValue({ eq: userEq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(
      listActivePushSubscriptionsForUser({ from } as never, "user-1"),
    ).resolves.toEqual([]);

    expect(orderUpdated).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(orderCreated).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(orderId).toHaveBeenCalledWith("id", { ascending: false });
    expect(limit).toHaveBeenCalledWith(20);
  });

  it("deactivates only the RLS-visible current endpoint", async () => {
    const activeEq = vi.fn().mockResolvedValue({ error: null });
    const endpointEq = vi.fn().mockReturnValue({ eq: activeEq });
    const update = vi.fn().mockReturnValue({ eq: endpointEq });
    const from = vi.fn().mockReturnValue({ update });

    await expect(
      deactivateCurrentUserPushSubscriptionByEndpoint(
        { from } as never,
        "https://push.example.com/device-1",
      ),
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledWith({ active: false });
    expect(endpointEq).toHaveBeenCalledWith(
      "endpoint",
      "https://push.example.com/device-1",
    );
    expect(activeEq).toHaveBeenCalledWith("active", true);
  });
});
