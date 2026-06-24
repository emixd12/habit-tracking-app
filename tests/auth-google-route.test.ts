import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/auth/google/route";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("auth Google route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("starts Google OAuth with a sanitized callback redirect", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://accounts.example/authorize" },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithOAuth },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/google?next=%2Fbehaviors%3Ftab%3Dactive",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://accounts.example/authorize",
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo:
          "http://localhost:3000/auth/callback?next=%2Fbehaviors%3Ftab%3Dactive",
      },
    });
  });

  it("redirects to login when Supabase runtime config is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await GET(
      new NextRequest("http://localhost:3000/auth/google?next=%2Fsettings"),
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fsettings&error=missing_supabase_config",
    );
  });
});
