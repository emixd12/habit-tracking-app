import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { upsertPushSubscription } from "@/lib/db/pushSubscriptions.repo";
import { createClient } from "@/lib/supabase/server";
import { POST } from "../app/api/push/subscribe/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/db/pushSubscriptions.repo", () => ({
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
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
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
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
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
});
