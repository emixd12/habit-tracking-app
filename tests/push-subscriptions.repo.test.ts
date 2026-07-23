import { describe, expect, it, vi } from "vitest";

import { hasActivePushSubscriptionForUser } from "@/lib/db/pushSubscriptions.repo";

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
});
