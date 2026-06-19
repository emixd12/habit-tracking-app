"use server";

import { revalidatePath } from "next/cache";

import {
  applyBehaviorLogImportUploadFromFormData,
  behaviorLogImportErrorToActionState,
  previewBehaviorLogImportUploadFromFormData,
} from "@/lib/services/behaviorlog-import.service";
import type { BehaviorLogImportActionState } from "@/lib/types/behaviorlog-import-ui";

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
