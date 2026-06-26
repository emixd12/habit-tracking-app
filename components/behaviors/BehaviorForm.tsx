"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import type {
  BehaviorActionState,
  BehaviorFormAction,
  BehaviorRecurrenceFormDefaults,
  BehaviorRecurrenceKind,
  BehaviorView,
  CategoryOption,
} from "@/lib/types/behavior";
import {
  TIME_RANGE_PRESETS,
  type TimeRangePreset,
} from "@/lib/types/schedule";
import type { Weekday } from "@/lib/types/recurrence";
import {
  formatClockTimeLabel,
  formatScheduleSlotLabel,
} from "@/lib/services/schedule";

type BehaviorFormProps = Readonly<{
  mode: "create" | "edit";
  action: BehaviorFormAction;
  categories: CategoryOption[];
  behavior?: BehaviorView;
  defaultTimezone?: string;
  showActiveToggle?: boolean;
  onSuccess?: (state: BehaviorActionState) => void;
}>;

type TimeEntryRow = {
  key: string;
  id: string;
  kind: "exact" | "range";
  exactTime: string;
  rangeStart: string;
  rangeEnd: string;
  rangePreset: TimeRangePreset | null;
};

type ScheduleFormRow = {
  key: string;
  id: string;
  recurrenceDefaults: BehaviorRecurrenceFormDefaults;
  recurrenceKind: BehaviorRecurrenceKind;
  timeEntries: TimeEntryRow[];
};

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

const WEEKDAY_OPTIONS: Array<{ value: Weekday; label: string }> = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];
const MAX_SCHEDULE_ROWS = 6;
const MAX_TIME_ENTRIES_PER_SCHEDULE = 8;

export function BehaviorForm({
  mode,
  action,
  categories,
  behavior,
  defaultTimezone,
  showActiveToggle = true,
  onSuccess,
}: BehaviorFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const fieldErrors = state.fieldErrors ?? {};
  const [scheduleRows, setScheduleRows] = useState<ScheduleFormRow[]>(() =>
    initialScheduleRows(behavior),
  );
  const scheduleCountLabel = useMemo(
    () =>
      `${scheduleRows.length} ${
        scheduleRows.length === 1 ? "schedule" : "schedules"
      }`,
    [scheduleRows.length],
  );

  useEffect(() => {
    if (state.status === "success" && state.message) {
      onSuccess?.(state);
    }
  }, [onSuccess, state]);

  function addScheduleRow() {
    if (scheduleRows.length >= MAX_SCHEDULE_ROWS) {
      return;
    }

    setScheduleRows((rows) => [
      ...rows,
      {
        key: `new-schedule-${Date.now()}-${rows.length}`,
        id: "",
        recurrenceDefaults: DEFAULT_RECURRENCE,
        recurrenceKind: "daily",
        timeEntries: [newExactTimeEntry("09:00", 0)],
      },
    ]);
  }

  function removeScheduleRow(scheduleKey: string) {
    setScheduleRows((rows) =>
      rows.length === 1
        ? rows
        : rows.filter((schedule) => schedule.key !== scheduleKey),
    );
  }

  function updateScheduleRow(
    scheduleKey: string,
    update: Partial<Pick<ScheduleFormRow, "recurrenceKind">>,
  ) {
    setScheduleRows((rows) =>
      rows.map((schedule) =>
        schedule.key === scheduleKey ? { ...schedule, ...update } : schedule,
      ),
    );
  }

  function addTimeEntry(scheduleKey: string) {
    setScheduleRows((rows) =>
      rows.map((schedule) => {
        if (
          schedule.key !== scheduleKey ||
          schedule.timeEntries.length >= MAX_TIME_ENTRIES_PER_SCHEDULE
        ) {
          return schedule;
        }

        return {
          ...schedule,
          timeEntries: [
            ...schedule.timeEntries,
            newExactTimeEntry(
              nextTimeEntryStart(schedule.timeEntries),
              schedule.timeEntries.length,
            ),
          ],
        };
      }),
    );
  }

  function updateTimeEntry(
    scheduleKey: string,
    entryKey: string,
    update: Partial<Omit<TimeEntryRow, "key" | "id">>,
  ) {
    setScheduleRows((rows) =>
      rows.map((schedule) =>
        schedule.key === scheduleKey
          ? {
              ...schedule,
              timeEntries: schedule.timeEntries.map((entry) =>
                entry.key === entryKey ? { ...entry, ...update } : entry,
              ),
            }
          : schedule,
      ),
    );
  }

  function removeTimeEntry(scheduleKey: string, entryKey: string) {
    setScheduleRows((rows) =>
      rows.map((schedule) =>
        schedule.key === scheduleKey && schedule.timeEntries.length > 1
          ? {
              ...schedule,
              timeEntries: schedule.timeEntries.filter(
                (entry) => entry.key !== entryKey,
              ),
            }
          : schedule,
      ),
    );
  }

  return (
    <form action={formAction} className="grid gap-6">
      {behavior ? (
        <input type="hidden" name="behavior_id" value={behavior.id} />
      ) : null}
      {mode === "create" && defaultTimezone ? (
        <input type="hidden" name="timezone" value={defaultTimezone} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Title"
          name="title"
          defaultValue={behavior?.title ?? ""}
          required
          error={fieldErrors.title}
        />

        <SelectField
          label="Category"
          name="category_id"
          defaultValue={behavior?.categoryId ?? ""}
          error={fieldErrors.category_id}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      </div>

      <label className="grid gap-2 text-sm">
        <span>Description</span>
        <textarea
          name="description"
          defaultValue={behavior?.description ?? ""}
          rows={3}
          aria-invalid={fieldErrors.description ? "true" : undefined}
          className="min-h-24 resize-y border-0 border-b border-line bg-background px-0 py-2 text-base leading-7 text-foreground"
        />
        <FieldError message={fieldErrors.description} />
      </label>

      <fieldset className="grid gap-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <legend className="text-lg leading-tight">Schedule</legend>
          <span className="text-sm text-muted-readable">
            {scheduleCountLabel}
          </span>
        </div>

        <input
          type="hidden"
          name="behavior_schedule_count"
          value={scheduleRows.length}
        />

        <div className="hidden border-b border-line pb-2 text-sm text-muted-readable lg:grid lg:grid-cols-[6.5rem_minmax(9rem,12rem)_minmax(9rem,1fr)_minmax(16rem,1.4fr)_minmax(8rem,10rem)] lg:gap-4">
          <span>Schedule</span>
          <span>Recurrence</span>
          <span>Every</span>
          <span>Times</span>
          <span>Time mode</span>
        </div>

        <div className="divide-y divide-line border-b border-line">
          {scheduleRows.map((schedule, index) => (
            <ScheduleRowEditor
              key={schedule.key}
              schedule={schedule}
              index={index}
              canRemoveSchedule={scheduleRows.length > 1}
              onScheduleChange={(update) =>
                updateScheduleRow(schedule.key, update)
              }
              onRemoveSchedule={() => removeScheduleRow(schedule.key)}
              onAddTime={() => addTimeEntry(schedule.key)}
              onTimeChange={(entryKey, update) =>
                updateTimeEntry(schedule.key, entryKey, update)
              }
              onRemoveTime={(entryKey) =>
                removeTimeEntry(schedule.key, entryKey)
              }
            />
          ))}
        </div>

        <p className="text-sm leading-6 text-muted-readable">
          Overlapping occurrences at the same time are counted once.
        </p>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={addScheduleRow}
            disabled={scheduleRows.length >= MAX_SCHEDULE_ROWS}
            className="product-action product-action-primary justify-self-start text-sm"
          >
            Add schedule
          </button>
          <FieldError message={fieldErrors.schedule} />
        </div>
      </fieldset>

      <div className="border-t border-line pt-5">
        <ReminderEditor
          browserReminderEnabled={behavior?.browserReminderEnabled ?? true}
          emailReminderEnabled={behavior?.emailReminderEnabled ?? false}
          reminderOffsetMinutes={behavior?.reminderOffsetMinutes ?? 0}
          error={fieldErrors.reminders}
        />
      </div>

      {mode === "edit" && showActiveToggle ? (
        <label className="flex min-h-12 items-center gap-3 border-b border-line py-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={behavior?.active ?? true}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Active
        </label>
      ) : null}
      {mode === "edit" && !showActiveToggle && behavior?.active ? (
        <input type="hidden" name="active" value="on" />
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
        <SubmitButton />
        <button
          type="reset"
          className="product-action product-action-secondary min-h-11 justify-self-start py-2 text-sm sm:min-h-0"
        >
          Cancel
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function ScheduleRowEditor({
  schedule,
  index,
  canRemoveSchedule,
  onScheduleChange,
  onRemoveSchedule,
  onAddTime,
  onTimeChange,
  onRemoveTime,
}: Readonly<{
  schedule: ScheduleFormRow;
  index: number;
  canRemoveSchedule: boolean;
  onScheduleChange: (
    update: Partial<Pick<ScheduleFormRow, "recurrenceKind">>,
  ) => void;
  onRemoveSchedule: () => void;
  onAddTime: () => void;
  onTimeChange: (
    entryKey: string,
    update: Partial<Omit<TimeEntryRow, "key" | "id">>,
  ) => void;
  onRemoveTime: (entryKey: string) => void;
}>) {
  return (
    <div className="grid gap-4 py-4 lg:grid-cols-[6.5rem_minmax(9rem,12rem)_minmax(9rem,1fr)_minmax(16rem,1.4fr)_minmax(8rem,10rem)] lg:items-start lg:gap-4">
      <input type="hidden" name={`behavior_schedule_id_${index}`} value={schedule.id} />

      <div className="grid gap-2 text-sm">
        <span className="text-foreground">Schedule {index + 1}</span>
        {canRemoveSchedule ? (
          <button
            type="button"
            onClick={onRemoveSchedule}
            className="product-action product-action-danger justify-self-start text-sm"
          >
            Remove
          </button>
        ) : null}
      </div>

      <SelectField
        label="Recurrence"
        labelClassName="lg:sr-only"
        name={`schedule_${index}_recurrence_kind`}
        value={schedule.recurrenceKind}
        onChange={(value) =>
          onScheduleChange({
            recurrenceKind: value as BehaviorRecurrenceKind,
          })
        }
      >
        <option value="daily">Daily</option>
        <option value="every_days">Every few days</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </SelectField>

      <RecurrenceDetailFields schedule={schedule} index={index} />

      <div className="grid gap-3">
        <span className="text-sm text-foreground lg:sr-only">Times</span>
        <input
          type="hidden"
          name={`schedule_${index}_time_entry_count`}
          value={schedule.timeEntries.length}
        />
        <div className="grid gap-2">
          {schedule.timeEntries.map((entry, entryIndex) => (
            <TimeEntryEditor
              key={entry.key}
              scheduleIndex={index}
              entryIndex={entryIndex}
              entry={entry}
              canRemove={schedule.timeEntries.length > 1}
              onChange={(update) => onTimeChange(entry.key, update)}
              onRemove={() => onRemoveTime(entry.key)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onAddTime}
          disabled={schedule.timeEntries.length >= MAX_TIME_ENTRIES_PER_SCHEDULE}
          className="product-action product-action-primary justify-self-start text-sm"
        >
          Add time
        </button>
      </div>

      <div className="grid gap-1 text-sm">
        <span className="text-foreground lg:sr-only">Time mode</span>
        <span className="text-muted-readable">{timeModeSummary(schedule)}</span>
      </div>
    </div>
  );
}

function RecurrenceDetailFields({
  schedule,
  index,
}: Readonly<{
  schedule: ScheduleFormRow;
  index: number;
}>) {
  const prefix = `schedule_${index}`;
  const defaults = schedule.recurrenceDefaults;

  if (schedule.recurrenceKind === "weekly") {
    return (
      <div className="grid gap-3">
        <NumberField
          label="Every"
          name={`${prefix}_weekly_interval`}
          defaultValue={defaults.weeklyInterval}
          suffix="weeks"
        />
        <div className="grid gap-2">
          <span className="text-sm text-foreground">On</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((weekday) => (
              <label
                key={weekday.value}
                className="inline-flex min-h-9 items-center gap-2 border border-line px-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  name={`${prefix}_weekly_days`}
                  value={weekday.value}
                  defaultChecked={defaults.weeklyDays.includes(weekday.value)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                {weekday.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (schedule.recurrenceKind === "monthly") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <NumberField
          label="Every"
          name={`${prefix}_monthly_interval`}
          defaultValue={defaults.monthlyInterval}
          suffix="months"
        />
        <NumberField
          label="Day"
          name={`${prefix}_monthly_day`}
          defaultValue={defaults.monthlyDay}
          max={31}
        />
      </div>
    );
  }

  if (schedule.recurrenceKind === "every_days") {
    return (
      <NumberField
        label="Every"
        name={`${prefix}_every_days`}
        defaultValue={defaults.everyDays}
        suffix="days"
      />
    );
  }

  return (
    <NumberField
      label="Every"
      name={`${prefix}_daily_interval`}
      defaultValue={defaults.dailyInterval}
      suffix="days"
    />
  );
}

function TimeEntryEditor({
  scheduleIndex,
  entryIndex,
  entry,
  canRemove,
  onChange,
  onRemove,
}: Readonly<{
  scheduleIndex: number;
  entryIndex: number;
  entry: TimeEntryRow;
  canRemove: boolean;
  onChange: (update: Partial<Omit<TimeEntryRow, "key" | "id">>) => void;
  onRemove: () => void;
}>) {
  const prefix = `schedule_${scheduleIndex}_time_entry`;

  return (
    <div className="grid gap-2 border border-line px-2 py-2">
      <input
        type="hidden"
        name={`${prefix}_id_${entryIndex}`}
        value={entry.id}
      />
      {entry.kind === "range" && entry.rangePreset ? (
        <input
          type="hidden"
          name={`${prefix}_range_preset_${entryIndex}`}
          value={entry.rangePreset}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-sm text-foreground">
          {timeEntryLabel(entry)}
        </span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${timeEntryLabel(entry)}`}
            className="text-sm text-muted-readable hover:text-foreground"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)]">
        <select
          name={`${prefix}_kind_${entryIndex}`}
          value={entry.kind}
          onChange={(event) =>
            onChange({
              kind: event.currentTarget.value as TimeEntryRow["kind"],
              rangePreset: null,
            })
          }
          className="min-h-10 border-0 border-b border-line bg-background px-0 py-2 text-sm text-foreground"
        >
          <option value="exact">Exact time</option>
          <option value="range">Time range</option>
        </select>

        {entry.kind === "exact" ? (
          <input
            type="time"
            name={`${prefix}_exact_time_${entryIndex}`}
            value={entry.exactTime}
            required
            onChange={(event) =>
              onChange({ exactTime: event.currentTarget.value })
            }
            aria-label="Exact time"
            className="min-h-10 border-0 border-b border-line bg-background px-0 py-2 text-sm text-foreground"
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="time"
              name={`${prefix}_range_start_${entryIndex}`}
              value={entry.rangeStart}
              required
              onChange={(event) =>
                onChange({
                  rangeStart: event.currentTarget.value,
                  rangePreset: null,
                })
              }
              aria-label="Range start"
              className="min-h-10 border-0 border-b border-line bg-background px-0 py-2 text-sm text-foreground"
            />
            <input
              type="time"
              name={`${prefix}_range_end_${entryIndex}`}
              value={entry.rangeEnd}
              required
              onChange={(event) =>
                onChange({
                  rangeEnd: event.currentTarget.value,
                  rangePreset: null,
                })
              }
              aria-label="Range end"
              className="min-h-10 border-0 border-b border-line bg-background px-0 py-2 text-sm text-foreground"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ReminderEditor({
  browserReminderEnabled,
  emailReminderEnabled,
  reminderOffsetMinutes,
  error,
}: Readonly<{
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  error?: string;
}>) {
  return (
    <fieldset className="grid gap-4 border-0 p-0">
      <legend className="mb-1 text-lg leading-tight">Reminders</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 border-b border-line py-2 text-sm">
          <input
            type="checkbox"
            name="browser_reminder"
            defaultChecked={browserReminderEnabled}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Browser reminder
        </label>

        <label className="flex min-h-11 items-center gap-3 border-b border-line py-2 text-sm">
          <input
            type="checkbox"
            name="email_reminder"
            defaultChecked={emailReminderEnabled}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Email reminder
        </label>
      </div>

      <SelectField
        label="Reminder offset"
        name="reminder_offset"
        defaultValue={String(reminderOffsetMinutes)}
      >
        <option value="0">At scheduled start</option>
        <option value="15">15 minutes before</option>
        <option value="60">1 hour before</option>
        <option value="1440">1 day before</option>
        <option value="4320">3 days before</option>
      </SelectField>

      <FieldError message={error} />
    </fieldset>
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
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? "true" : undefined}
        className="min-h-11 border-0 border-b border-line bg-background px-0 py-2 text-base text-foreground"
      />
      <FieldError message={error} />
    </label>
  );
}

function SelectField({
  label,
  labelClassName,
  name,
  defaultValue,
  value,
  onChange,
  error,
  children,
}: Readonly<{
  label: string;
  labelClassName?: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  children: ReactNode;
}>) {
  return (
    <label className="grid gap-2 text-sm">
      <span className={labelClassName}>{label}</span>
      <select
        name={name}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        aria-invalid={error ? "true" : undefined}
        className="min-h-11 border-0 border-b border-line bg-background px-0 py-2 text-base text-foreground"
      >
        {children}
      </select>
      <FieldError message={error} />
    </label>
  );
}

function NumberField({
  label,
  name,
  defaultValue,
  suffix,
  max = 999,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: number;
  suffix?: string;
  max?: number;
}>) {
  return (
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={1}
          max={max}
          step={1}
          className="min-h-10 w-20 border-0 border-b border-line bg-background px-0 py-2 text-sm text-foreground"
        />
        {suffix ? <span className="text-sm text-muted-readable">{suffix}</span> : null}
      </span>
    </label>
  );
}

function FieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) {
    return null;
  }

  return (
    <span className="text-sm leading-6 text-accent" role="alert">
      {message}
    </span>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center border border-primary bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save behavior"}
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
        "border-t border-line pt-2 text-sm leading-6 sm:border-t-0 sm:pt-0",
        state.status === "success" ? "text-foreground" : "text-accent",
      ].join(" ")}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function initialScheduleRows(behavior?: BehaviorView): ScheduleFormRow[] {
  const schedules = behavior?.schedules ?? [];

  if (schedules.length === 0) {
    return [
      {
        key: "schedule-0",
        id: "",
        recurrenceDefaults: behavior?.recurrenceDefaults ?? DEFAULT_RECURRENCE,
        recurrenceKind: behavior?.recurrenceDefaults.kind ?? "daily",
        timeEntries: [
          newExactTimeEntry(behavior?.scheduledTime ?? "09:00", 0),
        ],
      },
    ];
  }

  return schedules.map((schedule, index) => ({
    key: schedule.id || `schedule-${index}`,
    id: schedule.id,
    recurrenceDefaults: schedule.recurrenceDefaults,
    recurrenceKind: schedule.recurrenceDefaults.kind,
    timeEntries: schedule.timeEntries.map((entry, entryIndex) => {
      if (entry.kind === "range") {
        return {
          key: entry.id || `entry-${index}-${entryIndex}`,
          id: entry.id,
          kind: "range",
          exactTime: "09:00",
          rangeStart: entry.startTime,
          rangeEnd: entry.endTime ?? nextHalfHour(entry.startTime),
          rangePreset: entry.preset,
        };
      }

      return {
        key: entry.id || `entry-${index}-${entryIndex}`,
        id: entry.id,
        kind: "exact",
        exactTime: entry.startTime,
        rangeStart: entry.startTime,
        rangeEnd: nextHalfHour(entry.startTime),
        rangePreset: null,
      };
    }),
  }));
}

function newExactTimeEntry(time: string, index: number): TimeEntryRow {
  return {
    key: `new-entry-${Date.now()}-${index}`,
    id: "",
    kind: "exact",
    exactTime: time,
    rangeStart: time,
    rangeEnd: nextHalfHour(time),
    rangePreset: null,
  };
}

function nextTimeEntryStart(entries: TimeEntryRow[]): string {
  const lastEntry = entries.at(-1);

  if (!lastEntry) {
    return "09:00";
  }

  return nextHalfHour(
    lastEntry.kind === "exact" ? lastEntry.exactTime : lastEntry.rangeStart,
  );
}

function nextHalfHour(time: string): string {
  const [hourValue = "0", minuteValue = "0"] = time.split(":");
  const totalMinutes =
    Number(hourValue) * 60 + Number(minuteValue) + 30;
  const normalized = totalMinutes % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeEntryLabel(entry: TimeEntryRow): string {
  if (entry.kind === "range") {
    if (entry.rangePreset) {
      return formatScheduleSlotLabel({
        kind: "range",
        preset: entry.rangePreset,
        startTime: TIME_RANGE_PRESETS[entry.rangePreset].startTime,
        endTime: TIME_RANGE_PRESETS[entry.rangePreset].endTime,
      });
    }

    return `${formatClockTimeLabel(entry.rangeStart)} - ${formatClockTimeLabel(
      entry.rangeEnd,
    )}`;
  }

  return formatClockTimeLabel(entry.exactTime);
}

function timeModeSummary(schedule: ScheduleFormRow): string {
  const modes = new Set(schedule.timeEntries.map((entry) => entry.kind));

  if (modes.size > 1) {
    return "Mixed";
  }

  return modes.has("range") ? "Time range" : "Exact time";
}
