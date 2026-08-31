"use client";

import { useActionState } from "react";

import type {
  TimeTrackingActionState,
  TimeTrackingFormAction,
} from "@/lib/types/timeline";

const IDLE_STATE: TimeTrackingActionState = {
  status: "idle",
  message: "",
};

export function BehaviorReviewTimeReset({
  occurrenceId,
  isRunning,
  stopAction,
  resetAction,
}: Readonly<{
  occurrenceId: string;
  isRunning: boolean;
  stopAction: TimeTrackingFormAction;
  resetAction: TimeTrackingFormAction;
}>) {
  const [stopState, submitStop, stopping] = useActionState(stopAction, IDLE_STATE);
  const [resetState, submitReset, resetting] = useActionState(
    resetAction,
    IDLE_STATE,
  );
  const pending = stopping || resetting;

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      {isRunning ? (
        <TimeActionForm
          occurrenceId={occurrenceId}
          action={submitStop}
          disabled={pending}
          label={stopping ? "Stopping..." : "Stop"}
          state={stopState}
        />
      ) : null}
      <TimeActionForm
        occurrenceId={occurrenceId}
        action={submitReset}
        disabled={pending}
        label={resetting ? "Resetting..." : "Reset tracked time"}
        state={resetState}
      />
    </div>
  );
}

function TimeActionForm({
  occurrenceId,
  action,
  disabled,
  label,
  state,
}: Readonly<{
  occurrenceId: string;
  action: (formData: FormData) => void;
  disabled: boolean;
  label: string;
  state: TimeTrackingActionState;
}>) {
  return (
    <form action={action} className="grid justify-start gap-2">
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <button
        type="submit"
        disabled={disabled}
        className="product-action product-action-secondary min-h-11 py-2 text-sm"
      >
        {label}
      </button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "text-accent" : "text-muted-readable"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
