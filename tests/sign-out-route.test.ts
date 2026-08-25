import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../app/auth/sign-out/route";
import { deactivateCurrentUserPushSubscriptionByEndpoint } from "@/lib/db/pushSubscriptions.repo";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/db/pushSubscriptions.repo", () => ({
  deactivateCurrentUserPushSubscriptionByEndpoint: vi.fn(),
}));

describe("sign-out route", () => {
  const signOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signOut },
    } as never);
  });

  it("signs out the local session on POST and redirects to the status-bearing login URL", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/auth/sign-out", {
        method: "POST",
      }),
    );

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?signedout=1",
    );
    expect(deactivateCurrentUserPushSubscriptionByEndpoint).not.toHaveBeenCalled();
  });

  it("deactivates the current browser endpoint before clearing the session", async () => {
    const response = await POST(signOutRequest("https://push.example.com/device-1"));

    expect(deactivateCurrentUserPushSubscriptionByEndpoint).toHaveBeenCalledWith(
      await createClient(),
      "https://push.example.com/device-1",
    );
    expect(
      vi.mocked(deactivateCurrentUserPushSubscriptionByEndpoint).mock
        .invocationCallOrder[0],
    ).toBeLessThan(signOut.mock.invocationCallOrder[0]!);
    expect(response.status).toBe(303);
  });

  it("keeps the session when current-device deactivation fails", async () => {
    vi.mocked(deactivateCurrentUserPushSubscriptionByEndpoint).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await POST(signOutRequest("https://push.example.com/device-1"));

    expect(response.status).toBe(500);
    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("rejects GET without changing the session", async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(createClient).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("returns a factual recoverable error when Supabase leaves sign-out incomplete", async () => {
    signOut.mockResolvedValueOnce({
      error: new Error("provider unavailable"),
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/auth/sign-out", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe(
      "Cadence could not sign you out. Try again.",
    );
    expect(response.headers.get("location")).toBeNull();
  });
});

function signOutRequest(pushEndpoint: string) {
  return new NextRequest("http://localhost:3000/auth/sign-out", {
    method: "POST",
    body: new URLSearchParams({ pushEndpoint }),
  });
}
