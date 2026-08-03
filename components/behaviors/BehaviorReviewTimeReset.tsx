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
  action,
}: Readonly<{
  occurrenceId: string;
  action: TimeTrackingFormAction;
}>) {
  const [state, submit, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={submit} className="grid justify-start gap-2">
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <button
        type="submit"
        disabled={pending}
        className="product-action product-action-secondary min-h-11 py-2 text-sm"
      >
        {pending ? "Resetting..." : "Reset tracked time"}
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
