import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

  const { error: signOutError } = await supabase.auth.signOut({
    scope: "global",
  });

  if (signOutError) {
    throw new Error("Unable to sign out before deleting this account.");
  }

  const serviceRole = createServiceRoleClient();
  const { error: deleteError } = await serviceRole.auth.admin.deleteUser(user.id);

  if (deleteError) {
    throw new Error("Unable to delete this account.");
  }

  invalidateStableUserData(user.id);
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
