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

type StatusButtonValue = Extract<TimelineStatus, "completed" | "not_completed">;
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
        void playCompletionChime().finally(() => {
          router.refresh();
        });
      } else {
        router.refresh();
      }

      shouldChimeAfterSuccessRef.current = false;
      preparedChimeForSubmitRef.current = false;
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
            ? "flex flex-wrap items-center gap-x-4 gap-y-2"
            : "flex flex-wrap items-center justify-start gap-x-4 gap-y-2 sm:justify-end"
        }
      >
        <StatusSubmitForm
          occurrenceId={occurrenceId}
          status="completed"
          label="Completed"
          action={formAction}
          onStatusIntent={prepareForSubmittedStatus}
        />
        <StatusSubmitForm
          occurrenceId={occurrenceId}
          status="not_completed"
          label="Not Completed"
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
  action,
  onStatusIntent,
}: Readonly<{
  occurrenceId: string;
  status: StatusButtonValue;
  label: string;
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
        onStatusIntent={onStatusIntent}
      />
    </form>
  );
}

function StatusSubmitButton({
  status,
  label,
  onStatusIntent,
}: Readonly<{
  status: StatusButtonValue;
  label: string;
  onStatusIntent: (status: StatusButtonValue) => void;
}>) {
  const { pending } = useFormStatus();
  const Icon = status === "completed" ? Check : X;

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={() => {
        onStatusIntent(status);
      }}
      onPointerDown={() => {
        onStatusIntent(status);
      }}
      className={[
        "timeline-status-action inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap border-0 bg-transparent px-0 py-1 text-sm font-bold underline decoration-1 underline-offset-4 disabled:text-muted-readable disabled:no-underline",
        "text-foreground",
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
