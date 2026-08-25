import { beforeEach, describe, expect, it, vi } from "vitest";

const getAll = vi.fn();
const set = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll, set })),
}));

import { clearSupabaseAuthCookies } from "@/lib/supabase/server";

describe("clearSupabaseAuthCookies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expires every Supabase Auth cookie without touching unrelated cookies", async () => {
    getAll.mockReturnValue([
      { name: "sb-project-auth-token", value: "header.payload.signature" },
      { name: "sb-project-auth-token.0", value: "chunk-zero" },
      { name: "theme", value: "dark" },
      { name: "sb-project-code-verifier", value: "verifier" },
    ]);

    await clearSupabaseAuthCookies();

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(1, "sb-project-auth-token", "", {
      maxAge: 0,
      path: "/",
    });
    expect(set).toHaveBeenNthCalledWith(2, "sb-project-auth-token.0", "", {
      maxAge: 0,
      path: "/",
    });
  });
});
