"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type {
  BehaviorActionState,
  BehaviorFormAction,
  BehaviorRecurrenceFormDefaults,
  BehaviorView,
  CategoryOption,
} from "@/lib/types/behavior";
import { RecurrenceEditor } from "@/components/behaviors/RecurrenceEditor";
import { ReminderEditor } from "@/components/behaviors/ReminderEditor";

type BehaviorFormProps = Readonly<{
  mode: "create" | "edit";
  action: BehaviorFormAction;
  categories: CategoryOption[];
  defaultTimezone: string;
  behavior?: BehaviorView;
}>;

const EMPTY_ACTION_STATE: BehaviorActionState = {
  status: "idle",
  message: "",
};

const DEFAULT_RECURRENCE: BehaviorRecurrenceFormDefaults = {
  kind: "daily",
  dailyInterval: 1,
  everyDays: 2,
  weeklyInterval: 1,
  weeklyDays: ["monday"],
  monthlyInterval: 1,
  monthlyDay: 1,
};

export function BehaviorForm({
  mode,
  action,
  categories,
  defaultTimezone,
  behavior,
}: BehaviorFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const fieldErrors = state.fieldErrors ?? {};
  const timezone = behavior?.timezone ?? defaultTimezone;
  const recurrenceDefaults = behavior?.recurrenceDefaults ?? DEFAULT_RECURRENCE;

  return (
    <form action={formAction} className="grid gap-5">
      {behavior ? (
        <input type="hidden" name="behavior_id" value={behavior.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Title"
          name="title"
          defaultValue={behavior?.title ?? ""}
          required
          error={fieldErrors.title}
        />

        <label className="grid gap-2 text-sm font-bold">
          <span>Category</span>
          <select
            name="category_id"
            defaultValue={behavior?.categoryId ?? ""}
            aria-invalid={fieldErrors.category_id ? "true" : undefined}
            className="min-h-12 border-2 border-foreground bg-background px-3 py-2 text-base font-normal text-foreground"
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.category_id} />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-bold">
        <span>Description</span>
        <textarea
          name="description"
          defaultValue={behavior?.description ?? ""}
          rows={4}
          aria-invalid={fieldErrors.description ? "true" : undefined}
          className="min-h-28 resize-y border-2 border-foreground bg-background px-3 py-2 text-base font-normal leading-7 text-foreground"
        />
        <FieldError message={fieldErrors.description} />
      </label>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)]">
        <label className="grid gap-2 text-sm font-bold">
          <span>Scheduled time</span>
          <input
            type="time"
            name="scheduled_time"
            defaultValue={behavior?.scheduledTime ?? "09:00"}
            required
            aria-invalid={fieldErrors.scheduled_time ? "true" : undefined}
            className="min-h-12 border-2 border-foreground bg-background px-3 py-2 text-base font-normal text-foreground"
          />
          <FieldError message={fieldErrors.scheduled_time} />
        </label>

        <div className="border-2 border-foreground bg-surface p-3 text-sm leading-6 text-muted-readable">
          <span className="block font-bold text-foreground">Timezone</span>
          {timezone}
        </div>
      </div>

      <RecurrenceEditor
        defaults={recurrenceDefaults}
        error={fieldErrors.recurrence}
      />

      <ReminderEditor
        browserReminderEnabled={behavior?.browserReminderEnabled ?? true}
        emailReminderEnabled={behavior?.emailReminderEnabled ?? false}
        reminderOffsetMinutes={behavior?.reminderOffsetMinutes ?? 0}
        error={fieldErrors.reminders}
      />

      {mode === "edit" ? (
        <label className="flex min-h-12 items-center gap-3 border-2 border-foreground bg-background px-3 py-2 text-sm font-bold hover:bg-surface">
          <input
            type="checkbox"
            name="active"
            defaultChecked={behavior?.active ?? true}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Active
        </label>
      ) : null}

      <div className="flex flex-col gap-3 border-t-2 border-foreground pt-5 sm:flex-row sm:items-center">
        <SubmitButton label={mode === "create" ? "Create behavior" : "Save behavior"} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  required = false,
  error,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  error?: string;
}>) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      <span>{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? "true" : undefined}
        className="min-h-12 border-2 border-foreground bg-background px-3 py-2 text-base font-normal text-foreground"
      />
      <FieldError message={error} />
    </label>
  );
}

function FieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) {
    return null;
  }

  return <span className="text-sm font-normal leading-6 text-accent">{message}</span>;
}

function SubmitButton({ label }: Readonly<{ label: string }>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-foreground disabled:bg-surface disabled:text-muted-readable"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function ActionMessage({ state }: Readonly<{ state: BehaviorActionState }>) {
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
