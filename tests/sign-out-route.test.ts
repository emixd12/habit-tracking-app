import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../app/auth/sign-out/route";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
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
