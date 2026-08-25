import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  clearSupabaseAuthCookies,
  createClient,
} from "@/lib/supabase/server";
import { invalidateStableUserData } from "@/lib/cache/stable-user-data.cache";
import type { AccountDeletionActionState } from "@/lib/types/account";

export class AccountDeletionUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionUserError";
  }
}

export async function deleteCurrentAccountFromFormData(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AccountDeletionUserError(
      "Sign in again before deleting this account.",
    );
  }

  const expectedConfirmation = user.email?.trim() || "DELETE";

  assertExportAcknowledged(formData);
  assertConfirmationMatches(formData, expectedConfirmation);

  const serviceRole = createAccountDeletionClient();
  await verifyAccountDeletionClient(serviceRole, user.id);

  const { error: deleteError } = await deleteAuthUser(serviceRole, user.id);

  if (deleteError) {
    throw new AccountDeletionUserError(
      "Unable to delete this account. Your account and session are unchanged. Try again.",
    );
  }

  try {
    invalidateStableUserData(user.id);
  } catch {
    // The deleted account cannot retry a local cache invalidation failure.
  }

  // Hard Auth deletion removes Auth session rows and refresh capability. This
  // final sign-out best-effort clears the current browser's cookie-backed state.
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // The account is already deleted. Do not present an impossible retry.
  }

  try {
    await clearSupabaseAuthCookies();
  } catch {
    // Auth deletion succeeded. The issued JWT expires on its configured bound.
  }
}

export function accountDeletionErrorToActionState(
  error: unknown,
): AccountDeletionActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to delete this account.",
  };
}

function assertExportAcknowledged(formData: FormData): void {
  if (formData.get("confirm_export") === "yes") {
    return;
  }

  throw new AccountDeletionUserError(
    "Acknowledge the export reminder before deleting this account.",
  );
}

function assertConfirmationMatches(
  formData: FormData,
  expectedConfirmation: string,
): void {
  const submittedConfirmation = formData.get("confirmation");

  if (
    typeof submittedConfirmation === "string" &&
    submittedConfirmation.trim() === expectedConfirmation
  ) {
    return;
  }

  throw new AccountDeletionUserError(
    `Type ${expectedConfirmation} to confirm account deletion.`,
  );
}

function createAccountDeletionClient(): ReturnType<
  typeof createServiceRoleClient
> {
  try {
    return createServiceRoleClient();
  } catch {
    throw new AccountDeletionUserError(
      "Account deletion is temporarily unavailable. Your account and session are unchanged. Try again later.",
    );
  }
}

async function verifyAccountDeletionClient(
  serviceRole: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<void> {
  try {
    const { data, error } = await serviceRole.auth.admin.getUserById(userId);

    if (error || data.user?.id !== userId) {
      throw error ?? new Error("Authenticated user mismatch.");
    }
  } catch {
    throw new AccountDeletionUserError(
      "Unable to verify account deletion. Your account and session are unchanged. Try again.",
    );
  }
}

async function deleteAuthUser(
  serviceRole: ReturnType<typeof createServiceRoleClient>,
  userId: string,
) {
  try {
    return await serviceRole.auth.admin.deleteUser(userId);
  } catch {
    throw new AccountDeletionUserError(
      "Unable to delete this account. Your account and session are unchanged. Try again.",
    );
  }
}
