"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import {
  playCompletionChime,
  preloadCompletionChime,
  prepareCompletionChimeForUserGesture,
  shouldPlayCompletionChime,
} from "@/lib/ui/completion-feedback";
import type {
  OccurrenceActionState,
  OccurrenceFormAction,
  TimelineStatus,
} from "@/lib/types/timeline";

type StatusButtonsProps = Readonly<{
  occurrenceId: string;
  currentStatus: TimelineStatus;
  action: OccurrenceFormAction;
  compact?: boolean;
}>;

type StatusButtonValue = Extract<TimelineStatus, "done" | "not_done">;

const EMPTY_ACTION_STATE: OccurrenceActionState = {
  status: "idle",
  message: "",
};

export function StatusButtons({
  occurrenceId,
  currentStatus,
  action,
  compact = false,
}: StatusButtonsProps) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const router = useRouter();
  const shouldChimeAfterSuccessRef = useRef(false);

  useEffect(() => {
    preloadCompletionChime();
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      if (shouldChimeAfterSuccessRef.current) {
        playCompletionChime();
      }

      shouldChimeAfterSuccessRef.current = false;
      router.refresh();
    }

    if (state.status === "error") {
      shouldChimeAfterSuccessRef.current = false;
    }
  }, [router, state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const shouldChimeAfterSuccess = shouldPlayCompletionChime({
      currentStatus,
      nextStatus: submittedStatusFromEvent(event),
    });

    if (shouldChimeAfterSuccess) {
      prepareCompletionChimeForUserGesture();
    }

    shouldChimeAfterSuccessRef.current = shouldChimeAfterSuccess;
  }

  return (
    <div className={compact ? "grid gap-2" : "grid gap-2 sm:w-auto"}>
      <form
        action={formAction}
        onSubmit={handleSubmit}
        className={
          compact
            ? "grid gap-2 sm:grid-cols-2"
            : "grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap"
        }
      >
        <input type="hidden" name="occurrence_id" value={occurrenceId} />
        <StatusSubmitButton
          status="done"
          label="Completed"
          currentStatus={currentStatus}
        />
        <StatusSubmitButton
          status="not_done"
          label="Not Completed"
          currentStatus={currentStatus}
        />
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function StatusSubmitButton({
  status,
  label,
  currentStatus,
}: Readonly<{
  status: StatusButtonValue;
  label: string;
  currentStatus: TimelineStatus;
}>) {
  const { pending } = useFormStatus();
  const Icon = status === "done" ? Check : X;
  const isCurrent = currentStatus === status;
  const tone =
    status === "done"
      ? "bg-primary text-primary-foreground hover:bg-foreground"
      : "bg-background text-foreground hover:bg-surface";

  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending}
      aria-pressed={isCurrent}
      className={[
        "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap border border-line px-2.5 py-1.5 text-xs font-bold transition-colors disabled:bg-surface disabled:text-muted-readable sm:px-3",
        isCurrent ? "outline outline-2 outline-offset-2 outline-primary" : "",
        tone,
      ].join(" ")}
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.5} />
      <span>{pending ? "Saving..." : label}</span>
    </button>
  );
}

function ActionMessage({ state }: Readonly<{ state: OccurrenceActionState }>) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p
      className={[
        "border px-3 py-2 text-sm leading-6",
        state.status === "success"
          ? "border-line text-foreground"
          : "border-line text-accent",
      ].join(" ")}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function submittedStatusFromEvent(
  event: FormEvent<HTMLFormElement>,
): StatusButtonValue | null {
  const submitter = (event.nativeEvent as SubmitEvent).submitter;

  if (!(submitter instanceof HTMLButtonElement)) {
    return null;
  }

  return isStatusButtonValue(submitter.value) ? submitter.value : null;
}

function isStatusButtonValue(value: string): value is StatusButtonValue {
  return value === "done" || value === "not_done";
}
