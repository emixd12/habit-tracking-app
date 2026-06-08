"use server";

import { revalidatePath } from "next/cache";

import {
  markOccurrenceStatusFromFormData,
  occurrenceErrorToActionState,
  updateOccurrenceNoteFromFormData,
} from "@/lib/services/occurrence.service";
import type { OccurrenceActionState } from "@/lib/types/timeline";

export async function markOccurrenceStatusAction(
  _previousState: OccurrenceActionState,
  formData: FormData,
): Promise<OccurrenceActionState> {
  try {
    await markOccurrenceStatusFromFormData(formData);
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Occurrence updated.",
    };
  } catch (error) {
    return occurrenceErrorToActionState(error);
  }
}

export async function updateOccurrenceNoteAction(
  _previousState: OccurrenceActionState,
  formData: FormData,
): Promise<OccurrenceActionState> {
  try {
    await updateOccurrenceNoteFromFormData(formData);
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Note saved.",
    };
  } catch (error) {
    return occurrenceErrorToActionState(error);
  }
}
