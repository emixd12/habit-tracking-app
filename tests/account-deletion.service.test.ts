import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deleteCurrentAccountFromFormData } from "@/lib/services/account.service";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(),
}));

describe("account deletion service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the export acknowledgement before deleting", async () => {
    const { deleteUser } = mockSignedInAccount();
    const formData = new FormData();

    formData.set("confirmation", "emi@example.com");

    await expect(deleteCurrentAccountFromFormData(formData)).rejects.toThrow(
      "Acknowledge the export reminder",
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("requires exact email confirmation when the account has an email", async () => {
    const { deleteUser } = mockSignedInAccount();
    const formData = new FormData();

    formData.set("confirm_export", "yes");
    formData.set("confirmation", "DELETE");

    await expect(deleteCurrentAccountFromFormData(formData)).rejects.toThrow(
      "Type emi@example.com",
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("signs out globally and deletes the authenticated Supabase user", async () => {
    const { signOut, deleteUser } = mockSignedInAccount();
    const formData = new FormData();

    formData.set("confirm_export", "yes");
    formData.set("confirmation", "emi@example.com");

    await expect(deleteCurrentAccountFromFormData(formData)).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(createServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("falls back to DELETE confirmation if the auth user has no email", async () => {
    const { deleteUser } = mockSignedInAccount({ email: null });
    const formData = new FormData();

    formData.set("confirm_export", "yes");
    formData.set("confirmation", "DELETE");

    await expect(deleteCurrentAccountFromFormData(formData)).resolves.toBeUndefined();
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });
});

function mockSignedInAccount(input: { email?: string | null } = {}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: null });

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "user-1",
            email: input.email === undefined ? "emi@example.com" : input.email,
          },
        },
        error: null,
      }),
      signOut,
    },
  } as never);
  vi.mocked(createServiceRoleClient).mockReturnValue({
    auth: {
      admin: {
        deleteUser,
      },
    },
  } as never);

  return {
    signOut,
    deleteUser,
  };
}
