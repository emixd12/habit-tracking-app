"use client";

import { useRefresh } from "@cadence/ui/runtime";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { resolveNoteUpdate } from "@cadence/core/resolvers/status.resolver";

import type {
  OccurrenceActionState,
  OccurrenceFormAction,
} from "@/lib/types/timeline";
import { DesktopFormDraftGuard } from "@/lib/desktop-draft";

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
  const draftValueRef = useRef(note);
  const [draftValue, setDraftValue] = useState(note);
  const expectedNoteRef = useRef(note);
  const [expectedNoteValue, setExpectedNoteValue] = useState(note);
  const submittedDraftRef = useRef<{
    value: string;
    revision: number;
  } | null>(null);

  useEffect(() => {
    const submittedDraft = submittedDraftRef.current;
    if (state.status !== "idle" && submittedDraft) {
      if (state.status === "success") {
        expectedNoteRef.current = canonicalNoteValue(submittedDraft.value);
        setExpectedNoteValue(expectedNoteRef.current);
      }
      if (textareaRef.current) {
        textareaRef.current.value = reconcileSavedNoteDraft({
          submittedDraft: submittedDraft.value,
          submittedRevision: submittedDraft.revision,
          currentDraft: draftValueRef.current,
          currentRevision: draftRevisionRef.current,
        });
        draftValueRef.current = textareaRef.current.value;
        setDraftValue(textareaRef.current.value);
      }
    }

    if (state.status === "success") {
      refresh();
    }
  }, [refresh, state]);

  useEffect(() => {
    if (note === expectedNoteRef.current) return;
    if (canonicalNoteValue(draftValueRef.current) !== expectedNoteRef.current) return;

    expectedNoteRef.current = note;
    setExpectedNoteValue(note);
    draftValueRef.current = note;
    setDraftValue(note);
    if (textareaRef.current) textareaRef.current.value = note;
  }, [note]);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submittedDraftRef.current = {
          value: draftValueRef.current,
          revision: draftRevisionRef.current,
        };
      }}
      className={["grid", compact ? "gap-1" : "gap-3"].join(" ")}
    >
      <DesktopFormDraftGuard
        dirty={canonicalNoteValue(draftValue) !== expectedNoteValue}
        onDiscard={() => {
          const saved = expectedNoteRef.current;
          draftRevisionRef.current += 1;
          draftValueRef.current = saved;
          setDraftValue(saved);
          if (textareaRef.current) textareaRef.current.value = saved;
        }}
      />
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <input type="hidden" name="expected_note" value={expectedNoteValue} readOnly />
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
          onChange={(event) => {
            draftValueRef.current = event.currentTarget.value;
            setDraftValue(event.currentTarget.value);
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

function canonicalNoteValue(note: string): string {
  return resolveNoteUpdate({ note }).note ?? "";
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
