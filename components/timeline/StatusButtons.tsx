"use client";

import { useActionState, useEffect, useRef } from "react";
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
type StatusFormAction = (formData: FormData) => void;

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
  const preparedChimeForSubmitRef = useRef(false);

  useEffect(() => {
    preloadCompletionChime();
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      const shouldChimeAfterSuccess =
        shouldChimeAfterSuccessRef.current ||
        shouldPlayCompletionChime({
          currentStatus,
          nextStatus: state.nextStatus ?? null,
        });

      if (shouldChimeAfterSuccess) {
        playCompletionChime();
      }

      shouldChimeAfterSuccessRef.current = false;
      preparedChimeForSubmitRef.current = false;
      router.refresh();
    }

    if (state.status === "error") {
      shouldChimeAfterSuccessRef.current = false;
      preparedChimeForSubmitRef.current = false;
    }
  }, [currentStatus, router, state]);

  function prepareForSubmittedStatus(nextStatus: StatusButtonValue | null) {
    if (!nextStatus) {
      return;
    }

    const shouldChimeAfterSuccess = shouldPlayCompletionChime({
      currentStatus,
      nextStatus,
    });

    if (shouldChimeAfterSuccess && !preparedChimeForSubmitRef.current) {
      prepareCompletionChimeForUserGesture();
      preparedChimeForSubmitRef.current = true;
    }

    if (!shouldChimeAfterSuccess) {
      preparedChimeForSubmitRef.current = false;
    }

    shouldChimeAfterSuccessRef.current = shouldChimeAfterSuccess;
  }

  return (
    <div className={compact ? "grid gap-2" : "grid gap-2 sm:w-auto"}>
      <div
        className={
          compact
            ? "grid gap-2 sm:grid-cols-2"
            : "grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap"
        }
      >
        <StatusSubmitForm
          occurrenceId={occurrenceId}
          status="done"
          label="Completed"
          currentStatus={currentStatus}
          action={formAction}
          onStatusIntent={prepareForSubmittedStatus}
        />
        <StatusSubmitForm
          occurrenceId={occurrenceId}
          status="not_done"
          label="Not Completed"
          currentStatus={currentStatus}
          action={formAction}
          onStatusIntent={prepareForSubmittedStatus}
        />
      </div>
      <ActionMessage state={state} />
    </div>
  );
}

function StatusSubmitForm({
  occurrenceId,
  status,
  label,
  currentStatus,
  action,
  onStatusIntent,
}: Readonly<{
  occurrenceId: string;
  status: StatusButtonValue;
  label: string;
  currentStatus: TimelineStatus;
  action: StatusFormAction;
  onStatusIntent: (status: StatusButtonValue) => void;
}>) {
  return (
    <form
      action={action}
      onSubmit={() => {
        onStatusIntent(status);
      }}
      className="contents"
    >
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <input type="hidden" name="status" value={status} />
      <StatusSubmitButton
        status={status}
        label={label}
        currentStatus={currentStatus}
        onStatusIntent={onStatusIntent}
      />
    </form>
  );
}

function StatusSubmitButton({
  status,
  label,
  currentStatus,
  onStatusIntent,
}: Readonly<{
  status: StatusButtonValue;
  label: string;
  currentStatus: TimelineStatus;
  onStatusIntent: (status: StatusButtonValue) => void;
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
      disabled={pending}
      aria-pressed={isCurrent}
      onClick={() => {
        onStatusIntent(status);
      }}
      onPointerDown={() => {
        onStatusIntent(status);
      }}
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
