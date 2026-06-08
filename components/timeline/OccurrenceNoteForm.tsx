"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type {
  OccurrenceActionState,
  OccurrenceFormAction,
} from "@/lib/types/timeline";

type OccurrenceNoteFormProps = Readonly<{
  occurrenceId: string;
  note: string;
  action: OccurrenceFormAction;
}>;

const EMPTY_ACTION_STATE: OccurrenceActionState = {
  status: "idle",
  message: "",
};

export function OccurrenceNoteForm({
  occurrenceId,
  note,
  action,
}: OccurrenceNoteFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <label className="grid gap-2 font-bold text-foreground">
        <span>Note</span>
        <textarea
          name="note"
          defaultValue={note}
          rows={3}
          className="min-h-24 resize-y border-2 border-foreground bg-background px-3 py-2 text-base font-normal leading-7 text-foreground placeholder:text-muted-readable"
          placeholder="Add a note"
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <SaveNoteButton />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function SaveNoteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 border-2 border-foreground bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:bg-surface disabled:text-muted-readable"
    >
      {pending ? "Saving..." : "Save note"}
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
