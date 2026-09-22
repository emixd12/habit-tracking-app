import { describe, expect, it, vi } from "vitest";

import { consumeTravelRouteQuota } from "@/lib/db/travelRouteQuota.repo";

describe("travel route quota repository", () => {
  it("accepts the atomic owner and global quota decision", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await expect(consumeTravelRouteQuota({ rpc } as never)).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(rpc).toHaveBeenCalledWith("consume_travel_route_quota");
  });

  it("fails closed for a malformed quota response", async () => {
    await expect(consumeTravelRouteQuota({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never)).rejects.toThrow("did not return a decision");
  });
});
