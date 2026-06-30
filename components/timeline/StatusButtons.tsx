"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, CircleDashed, X } from "lucide-react";

import {
  type CompletionChimeIntent,
  playCompletionChime,
  prepareCompletionChimeForUserGesture,
  shouldPlayCompletionChime,
  shouldPlayCompletionChimeForStatusSuccess,
} from "@/lib/ui/completion-feedback";
import type {
  OccurrenceActionState,
  OccurrenceFormAction,
  TimelineStatus,
} from "@/lib/types/timeline";
import type { TimelineStatusActionStatus } from "@/lib/resolvers/timeline-optimistic-status.resolver";

type StatusButtonsProps = Readonly<{
  occurrenceId: string;
  currentStatus: TimelineStatus;
  action: OccurrenceFormAction;
  compact?: boolean;
  singleLine?: boolean;
  includeUnresolved?: boolean;
  disabled?: boolean;
  pendingStatus?: TimelineStatusActionStatus | null;
  onStatusSubmit?: (status: TimelineStatusActionStatus) => void;
  onStatusSuccess?: (status: TimelineStatusActionStatus | null) => void;
  onStatusError?: () => void;
}>;

type StatusButtonValue = TimelineStatusActionStatus;
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
  singleLine = false,
  includeUnresolved = false,
  disabled = false,
  pendingStatus = null,
  onStatusSubmit,
  onStatusSuccess,
  onStatusError,
}: StatusButtonsProps) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const router = useRouter();
  const completionChimeIntentRef = useRef<CompletionChimeIntent | null>(null);
  const preparedChimeForSubmitRef = useRef(false);

  useEffect(() => {
    if (state.status === "success") {
      const confirmedStatus = state.nextStatus ?? null;
      const shouldChimeAfterSuccess = shouldPlayCompletionChimeForStatusSuccess(
        {
          intent: completionChimeIntentRef.current,
          serverNextStatus: confirmedStatus,
        },
      );
      const refreshTimeline = () => {
        router.refresh();
        onStatusSuccess?.(confirmedStatus);
      };

      if (shouldChimeAfterSuccess) {
        void playCompletionChime().finally(() => {
          refreshTimeline();
        });
      } else {
        refreshTimeline();
      }

      completionChimeIntentRef.current = null;
      preparedChimeForSubmitRef.current = false;
    }

    if (state.status === "error") {
      completionChimeIntentRef.current = null;
      preparedChimeForSubmitRef.current = false;
      onStatusError?.();
    }
  }, [onStatusError, onStatusSuccess, router, state]);

  function prepareForSubmittedStatus(submittedStatus: StatusButtonValue | null) {
    if (!submittedStatus) {
      completionChimeIntentRef.current = null;
      preparedChimeForSubmitRef.current = false;
      return;
    }

    const intent: CompletionChimeIntent = {
      currentStatus,
      submittedStatus,
    };
    const shouldChimeAfterSuccess = shouldPlayCompletionChime({
      currentStatus: intent.currentStatus,
      nextStatus: intent.submittedStatus,
    });

    if (shouldChimeAfterSuccess && !preparedChimeForSubmitRef.current) {
      prepareCompletionChimeForUserGesture();
      preparedChimeForSubmitRef.current = true;
    }

    if (!shouldChimeAfterSuccess) {
      preparedChimeForSubmitRef.current = false;
    }

    completionChimeIntentRef.current = intent;
  }

  return (
    <div
      className={
        compact
          ? "grid gap-2"
          : singleLine
            ? "grid min-w-max gap-2"
            : "grid gap-2 sm:w-auto"
      }
    >
      <div
        className={
          compact
            ? "flex flex-wrap items-center gap-x-4 gap-y-2"
            : singleLine
              ? "flex items-center justify-end gap-x-2"
              : "flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:w-auto sm:justify-end"
        }
      >
        <StatusSubmitForm
          occurrenceId={occurrenceId}
          status="completed"
          label="Completed"
          action={formAction}
          onStatusIntent={prepareForSubmittedStatus}
          onStatusSubmit={onStatusSubmit}
          disabled={disabled}
          pendingStatus={pendingStatus}
          singleLine={singleLine}
        />
        <StatusSubmitForm
          occurrenceId={occurrenceId}
          status="not_completed"
          label="Not Completed"
          action={formAction}
          onStatusIntent={prepareForSubmittedStatus}
          onStatusSubmit={onStatusSubmit}
          disabled={disabled}
          pendingStatus={pendingStatus}
          singleLine={singleLine}
        />
        {includeUnresolved ? (
          <StatusSubmitForm
            occurrenceId={occurrenceId}
            status="unresolved"
            label="Unmark"
            action={formAction}
            onStatusIntent={prepareForSubmittedStatus}
            onStatusSubmit={onStatusSubmit}
            disabled={disabled}
            pendingStatus={pendingStatus}
            singleLine={singleLine}
          />
        ) : null}
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
  onStatusSubmit,
  disabled,
  pendingStatus,
  singleLine,
}: Readonly<{
  occurrenceId: string;
  status: StatusButtonValue;
  label: string;
  action: StatusFormAction;
  onStatusIntent: (status: StatusButtonValue) => void;
  onStatusSubmit?: (status: StatusButtonValue) => void;
  disabled: boolean;
  pendingStatus: StatusButtonValue | null;
  singleLine: boolean;
}>) {
  return (
    <form
      action={action}
      onSubmit={() => {
        onStatusIntent(status);
        onStatusSubmit?.(status);
      }}
      className="contents"
    >
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <input type="hidden" name="status" value={status} />
      <StatusSubmitButton
        status={status}
        label={label}
        onStatusIntent={onStatusIntent}
        disabled={disabled}
        pendingStatus={pendingStatus}
        singleLine={singleLine}
      />
    </form>
  );
}

function StatusSubmitButton({
  status,
  label,
  onStatusIntent,
  disabled,
  pendingStatus,
  singleLine,
}: Readonly<{
  status: StatusButtonValue;
  label: string;
  onStatusIntent: (status: StatusButtonValue) => void;
  disabled: boolean;
  pendingStatus: StatusButtonValue | null;
  singleLine: boolean;
}>) {
  const { pending } = useFormStatus();
  const Icon =
    status === "completed"
      ? Check
      : status === "not_completed"
        ? X
        : CircleDashed;
  const isSavingThisStatus = pending || pendingStatus === status;

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled ? "true" : undefined}
      data-single-line={singleLine ? "true" : undefined}
      onClick={() => {
        onStatusIntent(status);
      }}
      onPointerDown={() => {
        onStatusIntent(status);
      }}
      className={[
        "timeline-status-action product-action product-action-primary pointer-events-auto min-h-11 gap-1.5 whitespace-nowrap py-1 font-bold",
        singleLine
          ? "min-w-11 px-1 text-base sm:min-h-8 sm:px-0 sm:text-sm"
          : "text-sm sm:min-h-8",
      ].join(" ")}
    >
      <Icon
        aria-hidden="true"
        size={singleLine ? 16 : 14}
        strokeWidth={2.5}
      />
      <span>{isSavingThisStatus ? `Saving ${label}...` : label}</span>
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
        "border-t border-line pt-2 text-sm leading-6",
        state.status === "success" ? "text-foreground" : "text-accent",
      ].join(" ")}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}
