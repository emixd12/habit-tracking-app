import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "@/lib/supabase/proxy";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

describe("Supabase proxy session update", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("redirects anonymous protected route requests without creating a Supabase client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    const response = await updateSession(
      new NextRequest("http://localhost:3000/timeline"),
    );

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Ftimeline",
    );
  });

  it("lets anonymous login requests continue without creating a Supabase client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    const response = await updateSession(
      new NextRequest("http://localhost:3000/login"),
    );

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets authenticated protected route requests continue after claims validation", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const getClaims = vi.fn().mockResolvedValue({
      data: {
        claims: {
          sub: "user-1",
        },
      },
      error: null,
    });

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims,
      },
    } as never);

    const response = await updateSession(
      requestWithAuthCookie("http://localhost:3000/timeline"),
    );

    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects protected route requests when claims validation fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const getClaims = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("invalid token"),
    });

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims,
      },
    } as never);

    const response = await updateSession(
      requestWithAuthCookie("http://localhost:3000/timeline?from=test"),
    );

    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Ftimeline%3Ffrom%3Dtest",
    );
  });

  it("redirects authenticated login requests to the requested app route", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: "user-1",
            },
          },
          error: null,
        }),
      },
    } as never);

    const response = await updateSession(
      requestWithAuthCookie("http://localhost:3000/login?next=%2Fsettings"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings",
    );
  });

  it("lets authenticated local development login preview requests continue", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const getClaims = vi.fn().mockResolvedValue({
      data: {
        claims: {
          sub: "user-1",
        },
      },
      error: null,
    });

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims,
      },
    } as never);

    const response = await updateSession(
      requestWithAuthCookie(
        "http://localhost:3000/login?preview=1&next=%2Fsettings",
      ),
    );

    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects authenticated login preview requests in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: "user-1",
            },
          },
          error: null,
        }),
      },
    } as never);

    const response = await updateSession(
      requestWithAuthCookie(
        "http://localhost:3000/login?preview=1&next=%2Fsettings",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings",
    );
  });

  it("redirects authenticated root requests to the default app route", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: "user-1",
            },
          },
          error: null,
        }),
      },
    } as never);

    const response = await updateSession(
      requestWithAuthCookie("http://localhost:3000/"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/timeline",
    );
  });
});

function requestWithAuthCookie(url: string): NextRequest {
  return new NextRequest(url, {
    headers: {
      cookie: "sb-test-auth-token=header.payload.signature",
    },
  });
}
