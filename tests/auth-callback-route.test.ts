import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { GET } from "../app/auth/callback/route";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("auth callback route", () => {
  it("reports Supabase provider callback errors without trying code exchange", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/callback?error=server_error&next=%2Fbehaviors",
      ),
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fbehaviors&error=auth_callback_failed",
    );
  });

  it("keeps missing auth code errors for callbacks without code or provider error", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback?next=%2Fbehaviors"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fbehaviors&error=missing_auth_code",
    );
  });
});
