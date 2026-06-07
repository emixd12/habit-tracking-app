"use client";

import { useState } from "react";

import type {
  BehaviorRecurrenceFormDefaults,
  BehaviorRecurrenceKind,
} from "@/lib/types/behavior";
import type { Weekday } from "@/lib/types/recurrence";

type RecurrenceEditorProps = Readonly<{
  defaults: BehaviorRecurrenceFormDefaults;
  error?: string;
}>;

const PRESETS: Array<{ value: BehaviorRecurrenceKind; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "every_days", label: "Every N days" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const WEEKDAY_OPTIONS: Array<{ value: Weekday; label: string }> = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

export function RecurrenceEditor({ defaults, error }: RecurrenceEditorProps) {
  const [kind, setKind] = useState(defaults.kind);

  return (
    <fieldset className="grid gap-4 border-2 border-foreground p-4">
      <legend className="px-2 text-sm font-bold">Recurrence</legend>

      <div className="grid gap-2 sm:grid-cols-4" role="radiogroup">
        {PRESETS.map((preset) => {
          const isSelected = kind === preset.value;

          return (
            <label
              key={preset.value}
              className={[
                "flex min-h-11 items-center justify-center border-2 px-3 py-2 text-center text-sm font-bold transition-colors",
                isSelected
                  ? "border-foreground bg-primary text-primary-foreground"
                  : "border-foreground bg-background text-foreground hover:bg-surface",
              ].join(" ")}
            >
              <input
                type="radio"
                name="recurrence_kind"
                value={preset.value}
                checked={isSelected}
                onChange={() => setKind(preset.value)}
                className="sr-only"
              />
              {preset.label}
            </label>
          );
        })}
      </div>

      {kind === "daily" ? (
        <NumberField
          label="Every"
          name="daily_interval"
          defaultValue={defaults.dailyInterval}
          suffix="day(s)"
        />
      ) : null}

      {kind === "every_days" ? (
        <NumberField
          label="Every"
          name="every_days"
          defaultValue={defaults.everyDays}
          suffix="day(s)"
        />
      ) : null}

      {kind === "weekly" ? (
        <div className="grid gap-4">
          <NumberField
            label="Every"
            name="weekly_interval"
            defaultValue={defaults.weeklyInterval}
            suffix="week(s)"
          />
          <div className="grid gap-2">
            <span className="text-sm font-bold">On</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {WEEKDAY_OPTIONS.map((weekday) => (
                <label
                  key={weekday.value}
                  className="flex min-h-11 items-center gap-2 border-2 border-foreground bg-background px-3 py-2 text-sm font-bold hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    name="weekly_days"
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
      ) : null}

      {kind === "monthly" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Every"
            name="monthly_interval"
            defaultValue={defaults.monthlyInterval}
            suffix="month(s)"
          />
          <NumberField
            label="Day"
            name="monthly_day"
            defaultValue={defaults.monthlyDay}
            max={31}
          />
        </div>
      ) : null}

      {error ? (
        <p className="border-2 border-accent p-3 text-sm leading-6 text-accent">
          {error}
        </p>
      ) : null}
    </fieldset>
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
    <label className="grid gap-2 text-sm font-bold">
      <span>{label}</span>
      <span className="flex items-center gap-3">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={1}
          max={max}
          step={1}
          className="min-h-11 w-28 border-2 border-foreground bg-background px-3 py-2 text-base font-normal text-foreground"
        />
        {suffix ? (
          <span className="text-sm font-normal text-muted-readable">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}
