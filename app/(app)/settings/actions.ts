"use server";

import { redirect } from "next/navigation";

import {
  accountDeletionErrorToActionState,
  deleteCurrentAccountFromFormData,
} from "@/lib/services/account.service";
import {
  timezoneErrorToActionState,
  updateCurrentUserTimezoneFromFormData,
} from "@/lib/services/settings.service";
import type { AccountDeletionActionState } from "@/lib/types/account";
import type { TimezoneActionState } from "@/lib/types/settings";

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

export async function updateTimezoneAction(
  _previousState: TimezoneActionState,
  formData: FormData,
): Promise<TimezoneActionState> {
  try {
    const result = await updateCurrentUserTimezoneFromFormData(formData);

    return {
      status: "success",
      message: timezoneSuccessMessage(result),
      timezone: result.timezone,
      activeBehaviorCount: result.activeBehaviorCount,
    };
  } catch (error) {
    return timezoneErrorToActionState(error);
  }
}

function timezoneSuccessMessage(result: {
  changed: boolean;
  activeBehaviorCount: number;
}): string {
  if (!result.changed) {
    return "Timezone is already saved.";
  }

  if (result.activeBehaviorCount === 0) {
    return "Timezone saved.";
  }

  if (result.activeBehaviorCount === 1) {
    return "Timezone saved. 1 active behavior was updated.";
  }

  return `Timezone saved. ${result.activeBehaviorCount} active behaviors were updated.`;
}
