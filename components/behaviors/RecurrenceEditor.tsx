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
  namePrefix?: string;
  legend?: string;
  compact?: boolean;
}>;

const PRESETS: Array<{ value: BehaviorRecurrenceKind; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "every_days", label: "Every few days" },
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

export function RecurrenceEditor({
  defaults,
  error,
  namePrefix = "",
  legend = "Recurrence",
  compact = false,
}: RecurrenceEditorProps) {
  const [kind, setKind] = useState(defaults.kind);

  return (
    <fieldset className="grid gap-4 border-0 p-0">
      <legend className={compact ? "sr-only" : "mb-1 text-base font-bold"}>
        {legend}
      </legend>

      <div className="grid gap-2 sm:grid-cols-4" role="radiogroup">
        {PRESETS.map((preset) => {
          const isSelected = kind === preset.value;

          return (
            <label
              key={preset.value}
              className={[
                "flex min-h-11 items-center justify-center border px-3 py-2 text-center text-sm font-bold transition-colors",
                "focus-within:z-10 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                isSelected
                  ? "border-line bg-primary text-primary-foreground"
                  : "border-line bg-background text-foreground hover:bg-surface",
              ].join(" ")}
            >
              <input
                type="radio"
                name={fieldName(namePrefix, "recurrence_kind")}
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
          name={fieldName(namePrefix, "daily_interval")}
          defaultValue={defaults.dailyInterval}
          suffix={(value) => pluralize(value, "day", "days")}
        />
      ) : null}

      {kind === "every_days" ? (
        <NumberField
          label="Every"
          name={fieldName(namePrefix, "every_days")}
          defaultValue={defaults.everyDays}
          suffix={(value) => pluralize(value, "day", "days")}
        />
      ) : null}

      {kind === "weekly" ? (
        <div className="grid gap-4">
          <NumberField
            label="Every"
            name={fieldName(namePrefix, "weekly_interval")}
            defaultValue={defaults.weeklyInterval}
            suffix={(value) => pluralize(value, "week", "weeks")}
          />
          <div className="grid gap-2">
            <span className="text-xs font-bold text-muted-readable">On</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {WEEKDAY_OPTIONS.map((weekday) => (
                <label
                  key={weekday.value}
                  className="flex min-h-11 items-center gap-2 border border-line bg-background px-3 py-2 text-sm font-bold hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    name={fieldName(namePrefix, "weekly_days")}
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
            name={fieldName(namePrefix, "monthly_interval")}
            defaultValue={defaults.monthlyInterval}
            suffix={(value) => pluralize(value, "month", "months")}
          />
          <NumberField
            label="Day"
            name={fieldName(namePrefix, "monthly_day")}
            defaultValue={defaults.monthlyDay}
            max={31}
          />
        </div>
      ) : null}

      {error ? (
        <p className="border-t border-line pt-3 text-sm leading-6 text-accent">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function fieldName(prefix: string, name: string): string {
  return prefix ? `${prefix}_${name}` : name;
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
  suffix?: string | ((value: number) => string);
  max?: number;
}>) {
  const [currentValue, setCurrentValue] = useState(defaultValue);
  const suffixLabel =
    typeof suffix === "function" ? suffix(currentValue) : suffix;

  return (
    <label className="grid gap-2">
      <span className="text-xs font-bold text-muted-readable">{label}</span>
      <span className="flex items-center gap-3">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={1}
          max={max}
          step={1}
          onChange={(event) =>
            setCurrentValue(Number(event.currentTarget.value))
          }
          className="min-h-11 w-28 border border-line bg-background px-3 py-2 text-base font-normal text-foreground"
        />
        {suffixLabel ? (
          <span className="text-sm font-normal text-muted-readable">
            {suffixLabel}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function pluralize(value: number, singular: string, plural: string): string {
  return value === 1 ? singular : plural;
}
