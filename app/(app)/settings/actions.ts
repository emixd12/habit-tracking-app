"use server";

import { redirect } from "next/navigation";

import {
  accountDeletionErrorToActionState,
  deleteCurrentAccountFromFormData,
} from "@/lib/services/account.service";
import type { AccountDeletionActionState } from "@/lib/types/account";

export async function deleteAccountAction(
  _previousState: AccountDeletionActionState,
  formData: FormData,
): Promise<AccountDeletionActionState> {
  try {
    await deleteCurrentAccountFromFormData(formData);
  } catch (error) {
    return accountDeletionErrorToActionState(error);
  }

  redirect("/login?account_deleted=1");
}
