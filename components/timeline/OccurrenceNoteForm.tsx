"use client";

import { useRefresh } from "@cadence/ui/runtime";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import type {
  OccurrenceActionState,
  OccurrenceFormAction,
} from "@/lib/types/timeline";

type OccurrenceNoteFormProps = Readonly<{
  occurrenceId: string;
  note: string;
  action: OccurrenceFormAction;
  compact?: boolean;
}>;

const EMPTY_ACTION_STATE: OccurrenceActionState = {
  status: "idle",
  message: "",
};

export function reconcileSavedNoteDraft({
  submittedDraft,
  submittedRevision,
  currentDraft,
  currentRevision,
}: Readonly<{
  submittedDraft: string;
  submittedRevision: number;
  currentDraft: string;
  currentRevision: number;
}>): string {
  return submittedRevision === currentRevision ? submittedDraft : currentDraft;
}

export function OccurrenceNoteForm({
  occurrenceId,
  note,
  action,
  compact = false,
}: OccurrenceNoteFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const refresh = useRefresh();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRevisionRef = useRef(0);
  const submittedDraftRef = useRef<{
    value: string;
    revision: number;
  } | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      const textarea = textareaRef.current;
      const submittedDraft = submittedDraftRef.current;

      if (textarea && submittedDraft) {
        textarea.value = reconcileSavedNoteDraft({
          submittedDraft: submittedDraft.value,
          submittedRevision: submittedDraft.revision,
          currentDraft: textarea.value,
          currentRevision: draftRevisionRef.current,
        });
      }

      refresh();
    }
  }, [refresh, state]);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submittedDraftRef.current = {
          value: textareaRef.current?.value ?? "",
          revision: draftRevisionRef.current,
        };
      }}
      className={["grid", compact ? "gap-1" : "gap-3"].join(" ")}
    >
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <input type="hidden" name="expected_note" value={note} />
      <label
        className={[
          "grid font-bold text-foreground",
          compact ? "gap-1" : "gap-2",
        ].join(" ")}
      >
        <span>Note</span>
        <textarea
          ref={textareaRef}
          name="note"
          defaultValue={note}
          onChange={() => {
            draftRevisionRef.current += 1;
          }}
          rows={3}
          className="min-h-24 resize-y border border-line bg-background px-3 py-2 text-base font-normal leading-7 text-foreground placeholder:text-muted-readable"
          placeholder="Add a note"
        />
      </label>

      <div
        className={[
          "flex flex-col gap-2 sm:flex-row sm:items-start",
          compact ? "items-start" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <SaveNoteButton compact={compact} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function SaveNoteButton({ compact }: Readonly<{ compact: boolean }>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "timeline-status-action product-action product-action-primary min-h-11 py-1 text-sm font-bold sm:min-h-8",
        compact ? "!items-start !pb-0 !pt-0" : null,
      ]
        .filter(Boolean)
        .join(" ")}
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
        "border-t border-line pt-2 text-sm leading-6",
        state.status === "success" ? "text-foreground" : "text-accent",
      ].join(" ")}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}
