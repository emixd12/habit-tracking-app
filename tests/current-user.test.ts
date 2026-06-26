import { afterEach, describe, expect, it, vi } from "vitest";

describe("current user auth helpers", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reads the authenticated user id and display fields from verified claims", async () => {
    const { getCurrentUserClaims, requireCurrentUserId } =
      await loadCurrentUserModule({
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: "user-1",
              email: "user@example.test",
              user_metadata: {
                full_name: " Cadence User ",
              },
            },
          },
          error: null,
        }),
      });

    await expect(requireCurrentUserId("Sign in again.")).resolves.toBe(
      "user-1",
    );
    await expect(getCurrentUserClaims()).resolves.toEqual({
      userId: "user-1",
      email: "user@example.test",
      displayName: "Cadence User",
      error: null,
    });
  });

  it("rejects id-only auth when claims validation fails", async () => {
    const { requireCurrentUserId } = await loadCurrentUserModule({
      getClaims: vi.fn().mockResolvedValue({
        data: null,
        error: new Error("invalid token"),
      }),
    });

    await expect(requireCurrentUserId("Sign in again.")).rejects.toThrow(
      "Sign in again.",
    );
  });
});

async function loadCurrentUserModule(auth: {
  getClaims?: ReturnType<typeof vi.fn>;
  getUser?: ReturnType<typeof vi.fn>;
}) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn().mockResolvedValue({ auth }),
  }));

  return import("@/lib/auth/current-user");
}
