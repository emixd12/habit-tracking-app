"use server";

import { revalidatePath } from "next/cache";

import type { BehaviorActionState } from "@/lib/types/behavior";
import {
  markOccurrenceStatusFromFormData,
  occurrenceErrorToActionState,
  updateOccurrenceNoteFromFormData,
} from "@/lib/services/occurrence.service";
import {
  archiveBehaviorFromFormData,
  behaviorErrorToActionState,
  createBehaviorFromFormData,
  restoreBehaviorFromFormData,
  updateBehaviorFromFormData,
} from "@/lib/services/behavior.service";
import { resetOccurrenceTimeTracking } from "@/lib/services/time-tracking.service";
import type {
  OccurrenceActionState,
  TimelineStatus,
  TimeTrackingActionState,
} from "@/lib/types/timeline";

type SubmittedStatus = TimelineStatus;

export async function createBehaviorAction(
  _previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  try {
    const behavior = await createBehaviorFromFormData(formData);
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Behavior created.",
      behavior,
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

export async function restoreBehaviorAction(
  _previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  try {
    await restoreBehaviorFromFormData(formData);
    revalidatePath("/behaviors");
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Behavior restored.",
    };
  } catch (error) {
    return behaviorErrorToActionState(error);
  }
}

export async function markBehaviorReviewOccurrenceStatusAction(
  _previousState: OccurrenceActionState,
  formData: FormData,
): Promise<OccurrenceActionState> {
  try {
    const nextStatus = getSubmittedStatus(formData);

    await markOccurrenceStatusFromFormData(formData);
    revalidatePath("/behaviors");
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Occurrence updated.",
      ...(nextStatus ? { nextStatus } : {}),
    };
  } catch (error) {
    return occurrenceErrorToActionState(error);
  }
}

export async function updateBehaviorReviewOccurrenceNoteAction(
  _previousState: OccurrenceActionState,
  formData: FormData,
): Promise<OccurrenceActionState> {
  try {
    await updateOccurrenceNoteFromFormData(formData);
    revalidatePath("/behaviors");

    return {
      status: "success",
      message: "Note saved.",
    };
  } catch (error) {
    return occurrenceErrorToActionState(error);
  }
}

export async function resetBehaviorReviewOccurrenceTimeTrackingAction(
  _previousState: TimeTrackingActionState,
  formData: FormData,
): Promise<TimeTrackingActionState> {
  const occurrenceId = formData.get("occurrence_id");

  if (typeof occurrenceId !== "string" || occurrenceId.length === 0) {
    return {
      status: "error",
      message: "Choose an occurrence before resetting tracked time.",
    };
  }

  try {
    const result = await resetOccurrenceTimeTracking(occurrenceId);
    revalidatePath("/behaviors");
    revalidatePath("/timeline");

    return {
      status: "success",
      message: "Tracked time reset.",
      tracking: {
        recordedSeconds: result.tracking.recordedSeconds,
        runningStartedAt: result.tracking.runningSession?.startedAt ?? null,
      },
    };
  } catch {
    return {
      status: "error",
      message: "Unable to reset tracked time.",
    };
  }
}

function getSubmittedStatus(formData: FormData): SubmittedStatus | null {
  const value = formData.get("status");

  return value === "unresolved" ||
    value === "completed" ||
    value === "not_completed"
    ? value
    : null;
}
