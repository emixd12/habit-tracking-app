"use server";

import { revalidatePath } from "next/cache";

import type { BehaviorActionState } from "@/lib/types/behavior";
import {
  archiveBehaviorFromFormData,
  behaviorErrorToActionState,
  createBehaviorFromFormData,
  updateBehaviorFromFormData,
} from "@/lib/services/behavior.service";

export async function createBehaviorAction(
  _previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  try {
    await createBehaviorFromFormData(formData);
    revalidatePath("/behaviors");
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Behavior created.",
    };
  } catch (error) {
    return behaviorErrorToActionState(error);
  }
}

export async function updateBehaviorAction(
  _previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  try {
    await updateBehaviorFromFormData(formData);
    revalidatePath("/behaviors");
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Behavior saved.",
    };
  } catch (error) {
    return behaviorErrorToActionState(error);
  }
}

export async function archiveBehaviorAction(
  _previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  try {
    await archiveBehaviorFromFormData(formData);
    revalidatePath("/behaviors");
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Behavior archived.",
    };
  } catch (error) {
    return behaviorErrorToActionState(error);
  }
}
