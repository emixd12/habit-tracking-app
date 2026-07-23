import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasActivePushSubscriptionForUser,
  upsertPushSubscription,
} from "@/lib/db/pushSubscriptions.repo";
import { resetAuthFailureRateLimitersForTests } from "@/lib/security/auth-failure-rate-limits";
import { createClient } from "@/lib/supabase/server";
import { POST, PUT } from "../app/api/push/subscribe/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/db/pushSubscriptions.repo", () => ({
  hasActivePushSubscriptionForUser: vi.fn(),
  upsertPushSubscription: vi.fn(),
}));

const VALID_SUBSCRIPTION = {
  endpoint: "https://push.example.com/subscription/1",
  keys: {
    p256dh: "public-key",
    auth: "auth-secret",
  },
};

describe("push subscribe route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthFailureRateLimitersForTests();
  });

  it("rejects invalid subscription payloads", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: "not-a-url" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(upsertPushSubscription).not.toHaveBeenCalled();
  });

  it("requires an authenticated Supabase user", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      },
    } as never);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(VALID_SUBSCRIPTION),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
    });
    expect(response.status).toBe(401);
    expect(upsertPushSubscription).not.toHaveBeenCalled();
  });

  it("stores a valid browser push subscription for the current user", async () => {
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "user-1" } },
          error: null,
        }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(upsertPushSubscription).mockResolvedValue({
      id: "subscription-1",
    } as never);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(VALID_SUBSCRIPTION),
        headers: {
          "user-agent": "Test Browser",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      subscriptionId: "subscription-1",
    });
    expect(response.status).toBe(200);
    expect(upsertPushSubscription).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      endpoint: "https://push.example.com/subscription/1",
      p256dh: "public-key",
      auth: "auth-secret",
      userAgent: "Test Browser",
    });
  });

  it("checks persisted ownership for the exact current-device endpoint", async () => {
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "user-1" } },
          error: null,
        }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(hasActivePushSubscriptionForUser).mockResolvedValue(true);

    const response = await PUT(pushStatusRequest());

    await expect(response.json()).resolves.toEqual({
      ok: true,
      saved: true,
    });
    expect(response.status).toBe(200);
    expect(hasActivePushSubscriptionForUser).toHaveBeenCalledWith(supabase, {
      userId: "user-1",
      endpoint: "https://push.example.com/subscription/1",
      p256dh: "public-key",
      auth: "auth-secret",
    });
  });

  it("returns a neutral missing result for an endpoint not owned by the current user", async () => {
    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "user-2" } },
          error: null,
        }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(hasActivePushSubscriptionForUser).mockResolvedValue(false);

    const response = await PUT(pushStatusRequest());

    await expect(response.json()).resolves.toEqual({
      ok: true,
      saved: false,
    });
    expect(response.status).toBe(200);
  });

  it("requires authentication before checking persisted endpoint ownership", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      },
    } as never);

    const response = await PUT(pushStatusRequest());

    await expect(response.json()).resolves.toMatchObject({ ok: false });
    expect(response.status).toBe(401);
    expect(hasActivePushSubscriptionForUser).not.toHaveBeenCalled();
  });

  it("rate limits repeated unauthenticated subscription attempts", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      },
    } as never);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(pushRequest());
      expect(response.status).toBe(401);
    }

    const limitedResponse = await POST(pushRequest());

    await expect(limitedResponse.json()).resolves.toMatchObject({
      ok: false,
    });
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("retry-after")).toBeTruthy();
    expect(upsertPushSubscription).not.toHaveBeenCalled();
  });
});

function pushRequest() {
  return new NextRequest("http://localhost:3000/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(VALID_SUBSCRIPTION),
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
  });
}

function pushStatusRequest() {
  return new NextRequest("http://localhost:3000/api/push/subscribe", {
    method: "PUT",
    body: JSON.stringify({
      endpoint: VALID_SUBSCRIPTION.endpoint,
      keys: VALID_SUBSCRIPTION.keys,
    }),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.20",
    },
  });
}
