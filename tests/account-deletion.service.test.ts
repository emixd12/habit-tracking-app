import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateStableUserData } from "@/lib/cache/stable-user-data.cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  clearSupabaseAuthCookies,
  createClient,
} from "@/lib/supabase/server";
import {
  accountDeletionErrorToActionState,
  deleteCurrentAccountFromFormData,
} from "@/lib/services/account.service";

const CANARY_ENV = "CADENCE_ACCOUNT_DELETION_FAILURE_CANARY_USER_ID";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";

vi.mock("@/lib/supabase/server", () => ({
  clearSupabaseAuthCookies: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/cache/stable-user-data.cache", () => ({
  invalidateStableUserData: vi.fn(),
}));

describe("account deletion service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(CANARY_ENV, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires the export acknowledgement before deleting", async () => {
    const { deleteUser, getUserById, signOut } = mockSignedInAccount();
    const formData = new FormData();

    formData.set("confirmation", "emi@example.com");

    await expect(deleteCurrentAccountFromFormData(formData)).rejects.toThrow(
      "Acknowledge the export reminder",
    );
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("requires exact email confirmation when the account has an email", async () => {
    const { deleteUser, getUserById, signOut } = mockSignedInAccount();
    const formData = new FormData();

    formData.set("confirm_export", "yes");
    formData.set("confirmation", "DELETE");

    await expect(deleteCurrentAccountFromFormData(formData)).rejects.toThrow(
      "Type emi@example.com",
    );
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("verifies and deletes the authenticated user before signing out globally", async () => {
    const { signOut, getUserById, deleteUser } = mockSignedInAccount();
    const formData = new FormData();

    formData.set("confirm_export", "yes");
    formData.set("confirmation", "emi@example.com");

    await expect(deleteCurrentAccountFromFormData(formData)).resolves.toBeUndefined();
    expect(createServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(getUserById).toHaveBeenCalledWith(USER_ID);
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(clearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
    expect(getUserById.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0]!,
    );
    expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0]!,
    );
  });

  it("falls back to DELETE confirmation if the auth user has no email", async () => {
    const { deleteUser } = mockSignedInAccount({ email: null });
    const formData = new FormData();

    formData.set("confirm_export", "yes");
    formData.set("confirmation", "DELETE");

    await expect(deleteCurrentAccountFromFormData(formData)).resolves.toBeUndefined();
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("keeps normal deletion unchanged when the canary targets another user", async () => {
    const { deleteUser, signOut } = mockSignedInAccount();
    vi.stubEnv(CANARY_ENV, OTHER_USER_ID);

    await expect(
      deleteCurrentAccountFromFormData(confirmedDeletionForm()),
    ).resolves.toBeUndefined();

    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("fails closed when the configured canary is malformed", async () => {
    const { getUserById, deleteUser, signOut } = mockSignedInAccount();
    vi.stubEnv(CANARY_ENV, "not-a-user-id");

    await expect(
      deleteCurrentAccountFromFormData(confirmedDeletionForm()),
    ).rejects.toThrow(
      "Unable to delete this account. Your account and session are unchanged. Try again.",
    );

    expect(getUserById).toHaveBeenCalledWith(USER_ID);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(invalidateStableUserData).not.toHaveBeenCalled();
  });

  it("returns the recoverable error without deleting the matching canary account", async () => {
    const { getUserById, deleteUser, signOut } = mockSignedInAccount();
    vi.stubEnv(CANARY_ENV, USER_ID);

    const error = await deleteCurrentAccountFromFormData(
      confirmedDeletionForm(),
    ).catch((caught) => caught);

    expect(accountDeletionErrorToActionState(error)).toEqual({
      status: "error",
      message:
        "Unable to delete this account. Your account and session are unchanged. Try again.",
    });
    expect(getUserById).toHaveBeenCalledWith(USER_ID);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(invalidateStableUserData).not.toHaveBeenCalled();
  });

  it("leaves the account and session intact when client construction fails", async () => {
    const { deleteUser, signOut } = mockSignedInAccount();
    vi.mocked(createServiceRoleClient).mockImplementationOnce(() => {
      throw new Error("Missing service-role configuration.");
    });

    await expect(
      deleteCurrentAccountFromFormData(confirmedDeletionForm()),
    ).rejects.toThrow(
      "Account deletion is temporarily unavailable. Your account and session are unchanged.",
    );

    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(clearSupabaseAuthCookies).not.toHaveBeenCalled();
  });

  it("leaves the account and session intact when service-role verification fails", async () => {
    const { getUserById, deleteUser, signOut } = mockSignedInAccount();
    getUserById.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("Invalid service-role key."),
    });

    await expect(
      deleteCurrentAccountFromFormData(confirmedDeletionForm()),
    ).rejects.toThrow(
      "Unable to verify account deletion. Your account and session are unchanged.",
    );

    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(clearSupabaseAuthCookies).not.toHaveBeenCalled();
  });

  it("leaves the account and session intact when Auth user deletion fails", async () => {
    const { deleteUser, signOut } = mockSignedInAccount();
    deleteUser.mockResolvedValueOnce({
      data: null,
      error: new Error("Auth provider unavailable."),
    });

    await expect(
      deleteCurrentAccountFromFormData(confirmedDeletionForm()),
    ).rejects.toThrow(
      "Unable to delete this account. Your account and session are unchanged. Try again.",
    );

    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(signOut).not.toHaveBeenCalled();
    expect(clearSupabaseAuthCookies).not.toHaveBeenCalled();
  });

  it("finishes deletion when post-delete browser sign-out reports an error", async () => {
    const { deleteUser, signOut } = mockSignedInAccount();
    signOut.mockResolvedValueOnce({ error: new Error("Session is already gone.") });

    await expect(
      deleteCurrentAccountFromFormData(confirmedDeletionForm()),
    ).resolves.toBeUndefined();

    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(clearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("finishes deletion when post-delete browser sign-out throws", async () => {
    const { deleteUser, signOut } = mockSignedInAccount();
    signOut.mockRejectedValueOnce(new Error("Session cleanup unavailable."));

    await expect(
      deleteCurrentAccountFromFormData(confirmedDeletionForm()),
    ).resolves.toBeUndefined();

    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(clearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
  });
});

function mockSignedInAccount(input: { email?: string | null } = {}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getUserById = vi.fn().mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
  const deleteUser = vi.fn().mockResolvedValue({ error: null });

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: USER_ID,
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
        getUserById,
        deleteUser,
      },
    },
  } as never);

  return {
    signOut,
    getUserById,
    deleteUser,
  };
}

function confirmedDeletionForm(): FormData {
  const formData = new FormData();
  formData.set("confirm_export", "yes");
  formData.set("confirmation", "emi@example.com");
  return formData;
}
