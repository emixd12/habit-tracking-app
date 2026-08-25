import { describe, expect, it, vi } from "vitest";

import {
  consumeExportDownloadRateLimit,
  consumePushSubscriptionRegistrationRateLimit,
} from "@/lib/db/launchRateLimits.repo";

describe("launch rate limit repository", () => {
  it("normalizes the authenticated export limit result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          allowed: false,
          limit_count: 6,
          remaining: 0,
          reset_at: "2026-08-01T12:01:00Z",
          retry_after_seconds: 41,
        },
      ],
      error: null,
    });

    await expect(
      consumeExportDownloadRateLimit({ rpc } as never),
    ).resolves.toEqual({
      allowed: false,
      limit: 6,
      remaining: 0,
      resetAt: "2026-08-01T12:01:00Z",
      retryAfterSeconds: 41,
    });
    expect(rpc).toHaveBeenCalledWith("consume_launch_rate_limit", {
      p_action: "export_download",
    });
  });

  it("fails closed when the RPC returns no decision", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(
      consumeExportDownloadRateLimit({ rpc } as never),
    ).rejects.toThrow("did not return a decision");
  });

  it("consumes the separate authenticated push-registration action", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          allowed: true,
          limit_count: 6,
          remaining: 5,
          reset_at: "2026-08-25T12:01:00Z",
          retry_after_seconds: 60,
        },
      ],
      error: null,
    });

    await expect(
      consumePushSubscriptionRegistrationRateLimit({ rpc } as never),
    ).resolves.toMatchObject({ allowed: true, limit: 6, remaining: 5 });
    expect(rpc).toHaveBeenCalledWith("consume_launch_rate_limit", {
      p_action: "push_subscription_registration",
    });
  });
});
