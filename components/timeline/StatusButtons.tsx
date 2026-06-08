"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, X } from "lucide-react";

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

  return (
    <div className={compact ? "grid gap-2" : "grid gap-2 sm:min-w-72"}>
      <form
        action={formAction}
        className={compact ? "grid gap-2 sm:grid-cols-2" : "grid grid-cols-2 gap-2"}
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
        "inline-flex min-h-11 items-center justify-center gap-2 border-2 border-foreground px-3 py-2 text-sm font-bold transition-colors disabled:bg-surface disabled:text-muted-readable",
        isCurrent ? "outline outline-2 outline-offset-2 outline-primary" : "",
        tone,
      ].join(" ")}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={2.5} />
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
        "border-2 px-3 py-2 text-sm leading-6",
        state.status === "success"
          ? "border-primary text-foreground"
          : "border-accent text-accent",
      ].join(" ")}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}
