"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";

import type {
  BehaviorActionState,
  BehaviorFormAction,
  BehaviorRecurrenceFormDefaults,
  BehaviorView,
  CategoryOption,
} from "@/lib/types/behavior";
import { RecurrenceEditor } from "@/components/behaviors/RecurrenceEditor";
import { ReminderEditor } from "@/components/behaviors/ReminderEditor";
import { TIME_RANGE_PRESET_LIST, type TimeRangePreset } from "@/lib/types/schedule";

type BehaviorFormProps = Readonly<{
  mode: "create" | "edit";
  action: BehaviorFormAction;
  categories: CategoryOption[];
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

const MAX_SCHEDULE_ROWS = 8;

type ScheduleFormRow = {
  key: string;
  id: string;
  kind: "exact" | "range";
  exactTime: string;
  rangePreset: TimeRangePreset;
};

export function BehaviorForm({
  mode,
  action,
  categories,
  behavior,
}: BehaviorFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const fieldErrors = state.fieldErrors ?? {};
  const recurrenceDefaults = behavior?.recurrenceDefaults ?? DEFAULT_RECURRENCE;
  const [scheduleRows, setScheduleRows] = useState<ScheduleFormRow[]>(() =>
    initialScheduleRows(behavior),
  );

  function addScheduleRow() {
    if (scheduleRows.length >= MAX_SCHEDULE_ROWS) {
      return;
    }

    setScheduleRows((rows) => [
      ...rows,
      {
        key: `new-${Date.now()}-${rows.length}`,
        id: "",
        kind: "exact",
        exactTime: "09:00",
        rangePreset: "morning",
      },
    ]);
  }

  function updateScheduleRow(
    key: string,
    update: Partial<Omit<ScheduleFormRow, "key" | "id">>,
  ) {
    setScheduleRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...update } : row)),
    );
  }

  function removeScheduleRow(key: string) {
    setScheduleRows((rows) =>
      rows.length === 1 ? rows : rows.filter((row) => row.key !== key),
    );
  }

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
            className="min-h-12 border border-line bg-background px-3 py-2 text-base font-normal text-foreground"
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
          className="min-h-28 resize-y border border-line bg-background px-3 py-2 text-base font-normal leading-7 text-foreground"
        />
        <FieldError message={fieldErrors.description} />
      </label>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-bold">Schedule</legend>
        <input
          type="hidden"
          name="schedule_slot_count"
          value={scheduleRows.length}
        />
        <div className="grid gap-3">
          {scheduleRows.map((row, index) => (
            <ScheduleRowEditor
              key={row.key}
              row={row}
              index={index}
              canRemove={scheduleRows.length > 1}
              onChange={(update) => updateScheduleRow(row.key, update)}
              onRemove={() => removeScheduleRow(row.key)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={addScheduleRow}
            disabled={scheduleRows.length >= MAX_SCHEDULE_ROWS}
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-line bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:bg-surface disabled:text-muted-readable"
          >
            <Plus aria-hidden="true" size={18} strokeWidth={2.5} />
            <span>Add another time</span>
          </button>
          <FieldError message={fieldErrors.schedule} />
        </div>
      </fieldset>

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
        <label className="flex min-h-12 items-center gap-3 border border-line bg-background px-3 py-2 text-sm font-bold hover:bg-surface">
          <input
            type="checkbox"
            name="active"
            defaultChecked={behavior?.active ?? true}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Active
        </label>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
        <SubmitButton label={mode === "create" ? "Create behavior" : "Save behavior"} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function ScheduleRowEditor({
  row,
  index,
  canRemove,
  onChange,
  onRemove,
}: Readonly<{
  row: ScheduleFormRow;
  index: number;
  canRemove: boolean;
  onChange: (update: Partial<Omit<ScheduleFormRow, "key" | "id">>) => void;
  onRemove: () => void;
}>) {
  const modeName = `schedule_kind_${index}`;
  const rangeName = `schedule_range_preset_${index}`;

  return (
    <div className="grid gap-3 border border-line bg-background p-3">
      <input type="hidden" name={`schedule_slot_id_${index}`} value={row.id} />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-2">
          <div className="grid grid-cols-2">
            <label
              className={[
                "flex min-h-11 cursor-pointer items-center justify-center border border-line px-3 py-2 text-sm font-bold transition-colors",
                row.kind === "exact"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-foreground hover:bg-surface",
              ].join(" ")}
            >
              <input
                type="radio"
                name={modeName}
                value="exact"
                checked={row.kind === "exact"}
                onChange={() => onChange({ kind: "exact" })}
                className="sr-only"
              />
              Exact time
            </label>
            <label
              className={[
                "flex min-h-11 cursor-pointer items-center justify-center border border-l-0 border-line px-3 py-2 text-sm font-bold transition-colors",
                row.kind === "range"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-foreground hover:bg-surface",
              ].join(" ")}
            >
              <input
                type="radio"
                name={modeName}
                value="range"
                checked={row.kind === "range"}
                onChange={() => onChange({ kind: "range" })}
                className="sr-only"
              />
              Time range
            </label>
          </div>

          {row.kind === "exact" ? (
            <label className="grid gap-2 text-sm font-bold">
              <span>Time</span>
              <input
                type="time"
                name={`schedule_exact_time_${index}`}
                value={row.exactTime}
                required
                onChange={(event) =>
                  onChange({ exactTime: event.currentTarget.value })
                }
                className="min-h-12 border border-line bg-background px-3 py-2 text-base font-normal text-foreground"
              />
            </label>
          ) : (
            <div className="grid gap-2">
              <span className="text-sm font-bold">Range</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {TIME_RANGE_PRESET_LIST.map((preset) => (
                  <label
                    key={preset.preset}
                    className={[
                      "grid min-h-14 cursor-pointer gap-0.5 border border-line px-3 py-2 transition-colors",
                      row.rangePreset === preset.preset
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground hover:bg-surface",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name={rangeName}
                      value={preset.preset}
                      checked={row.rangePreset === preset.preset}
                      onChange={() =>
                        onChange({ rangePreset: preset.preset })
                      }
                      className="sr-only"
                    />
                    <span className="text-sm font-bold">{preset.label}</span>
                    <span className="text-xs font-bold leading-5">
                      {preset.rangeLabel}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove scheduled row"
            title="Remove"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-line bg-background text-foreground transition-colors hover:bg-accent hover:text-background"
          >
            <Trash2 aria-hidden="true" size={18} strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function initialScheduleRows(behavior?: BehaviorView): ScheduleFormRow[] {
  const scheduleSlots = behavior?.scheduleSlots ?? [];

  if (scheduleSlots.length === 0) {
    return [
      {
        key: "new-0",
        id: "",
        kind: "exact",
        exactTime: behavior?.scheduledTime ?? "09:00",
        rangePreset: "morning",
      },
    ];
  }

  return scheduleSlots.map((slot, index) => ({
    key: slot.id || `slot-${index}`,
    id: slot.id,
    kind: slot.kind,
    exactTime: slot.kind === "exact" ? slot.startTime : "09:00",
    rangePreset: slot.preset ?? "morning",
  }));
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
        className="min-h-12 border border-line bg-background px-3 py-2 text-base font-normal text-foreground"
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
      className="min-h-12 border border-line bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-foreground disabled:bg-surface disabled:text-muted-readable"
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
