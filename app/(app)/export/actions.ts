"use server";

import { revalidatePath } from "next/cache";

import {
  applyBehaviorLogImportUploadFromFormData,
  behaviorLogImportErrorToActionState,
  previewBehaviorLogImportUploadFromFormData,
} from "@/lib/services/behaviorlog-import.service";
import {
  applyBehaviorLogRestoreUploadFromFormData,
  behaviorLogRestoreErrorToActionState,
  previewBehaviorLogRestoreUploadFromFormData,
} from "@/lib/services/behaviorlog-restore.service";
import type { BehaviorLogImportActionState } from "@/lib/types/behaviorlog-import-ui";
import type { BehaviorLogRestoreActionState } from "@/lib/types/behaviorlog-restore-ui";

export async function submitBehaviorLogImportAction(
  previousState: BehaviorLogImportActionState,
  formData: FormData,
): Promise<BehaviorLogImportActionState> {
  const intent = formData.get("intent");

  if (intent === "preview") {
    return previewBehaviorLogImportAction(previousState, formData);
  }

  if (intent === "apply") {
    return applyBehaviorLogImportAction(previousState, formData);
  }

  return behaviorLogImportErrorToActionState(
    new Error("Choose an import action."),
    previousState,
  );
}

export async function submitBehaviorLogRestoreAction(
  previousState: BehaviorLogRestoreActionState,
  formData: FormData,
): Promise<BehaviorLogRestoreActionState> {
  const intent = formData.get("intent");

  if (intent === "restore_preview") {
    return previewBehaviorLogRestoreAction(previousState, formData);
  }

  if (intent === "restore_apply") {
    return applyBehaviorLogRestoreAction(previousState, formData);
  }

  return behaviorLogRestoreErrorToActionState(
    new Error("Choose a restore action."),
    previousState,
  );
}

export async function previewBehaviorLogImportAction(
  previousState: BehaviorLogImportActionState,
  formData: FormData,
): Promise<BehaviorLogImportActionState> {
  try {
    const state = await previewBehaviorLogImportUploadFromFormData(formData);

    revalidatePath("/export");

    return state;
  } catch (error) {
    return behaviorLogImportErrorToActionState(error, previousState);
  }
}

export async function applyBehaviorLogImportAction(
  previousState: BehaviorLogImportActionState,
  formData: FormData,
): Promise<BehaviorLogImportActionState> {
  try {
    const state = await applyBehaviorLogImportUploadFromFormData(formData);

    revalidatePath("/export");
    revalidatePath("/behaviors");
    revalidatePath("/timeline");
    revalidatePath("/analytics");

    return state;
  } catch (error) {
    return behaviorLogImportErrorToActionState(error, previousState);
  }
}

export async function previewBehaviorLogRestoreAction(
  previousState: BehaviorLogRestoreActionState,
  formData: FormData,
): Promise<BehaviorLogRestoreActionState> {
  try {
    const state = await previewBehaviorLogRestoreUploadFromFormData(formData);

    revalidatePath("/export");

    return state;
  } catch (error) {
    return behaviorLogRestoreErrorToActionState(error, previousState);
  }
}

export async function applyBehaviorLogRestoreAction(
  previousState: BehaviorLogRestoreActionState,
  formData: FormData,
): Promise<BehaviorLogRestoreActionState> {
  try {
    const state = await applyBehaviorLogRestoreUploadFromFormData(formData);

    revalidatePath("/export");
    revalidatePath("/behaviors");
    revalidatePath("/timeline");
    revalidatePath("/analytics");
    revalidatePath("/settings");

    return state;
  } catch (error) {
    return behaviorLogRestoreErrorToActionState(error, previousState);
  }
}
