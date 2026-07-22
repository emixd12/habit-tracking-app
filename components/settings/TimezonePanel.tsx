"use client";

import { useActionState, useEffect, useState } from "react";

import {
  TIMEZONE_ACTION_INITIAL_STATE,
  type TimezoneActionState,
} from "@/lib/types/settings";

export type TimezoneUpdateAction = (
  state: TimezoneActionState,
  formData: FormData,
) => Promise<TimezoneActionState>;

type BrowserTimezoneState = {
  status: "checking" | "available" | "unavailable";
  value: string;
};

type TimezonePanelProps = Readonly<{
  currentTimezone: string;
  updateTimezoneAction: TimezoneUpdateAction;
}>;

export function TimezonePanel({
  currentTimezone,
  updateTimezoneAction,
}: TimezonePanelProps) {
  const [state, formAction, isPending] = useActionState(
    updateTimezoneAction,
    TIMEZONE_ACTION_INITIAL_STATE,
  );
  const savedTimezone = state.timezone ?? currentTimezone;
  const [selectedTimezone, setSelectedTimezone] = useState(savedTimezone);
  const [browserTimezone, setBrowserTimezone] =
    useState<BrowserTimezoneState>({
      status: "checking",
      value: "",
    });
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>([]);
  const [hasReadTimezoneOptions, setHasReadTimezoneOptions] = useState(false);
  const selectOptions = buildSelectOptions({
    browserTimezone,
    savedTimezone,
    timezoneOptions,
  });
  const showDetectedHint =
    browserTimezone.status === "available" &&
    browserTimezone.value !== selectedTimezone;

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      setBrowserTimezone(readBrowserTimezone());
      setTimezoneOptions(readSupportedTimezones());
      setHasReadTimezoneOptions(true);
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <section
      id="timezone"
      className="scroll-mt-20 bg-background py-4 first:pt-0 last:pb-0"
    >
      <h2 className="text-xl leading-tight">Timezone</h2>
      <form
        key={savedTimezone}
        action={formAction}
        className="mt-4 grid max-w-md gap-3"
      >
        <label htmlFor="timezone-select" className="sr-only">
          Timezone
        </label>
        {hasReadTimezoneOptions && timezoneOptions.length === 0 ? (
          <input
            id="timezone-select"
            name="timezone"
            type="text"
            required
            autoComplete="off"
            value={selectedTimezone}
            onChange={(event) =>
              setSelectedTimezone(event.currentTarget.value)
            }
            className="min-h-11 border border-line bg-background px-3 py-2 text-base"
          />
        ) : (
          <select
            id="timezone-select"
            name="timezone"
            required
            value={selectedTimezone}
            onChange={(event) =>
              setSelectedTimezone(event.currentTarget.value)
            }
            className="product-select min-h-11 border border-line bg-background pl-3 py-2 text-base"
          >
            {selectOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
        {showDetectedHint ? (
          <p className="text-sm leading-6 text-muted-readable">
            Detected {browserTimezone.value}.{" "}
            <button
              type="button"
              onClick={() => setSelectedTimezone(browserTimezone.value)}
              className="product-action product-action-secondary"
            >
              Use detected timezone
            </button>
          </p>
        ) : null}
        <p className="text-sm leading-6 text-muted-readable">
          Saving updates active behavior schedules and future unresolved
          occurrences. Past and resolved history stays unchanged.
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="product-action product-action-primary min-h-11 w-fit py-2 text-sm"
        >
          {isPending ? "Saving..." : "Save timezone"}
        </button>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={[
              "text-sm leading-6",
              state.status === "error" ? "text-accent" : "text-muted-readable",
            ].join(" ")}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function buildSelectOptions({
  browserTimezone,
  savedTimezone,
  timezoneOptions,
}: Readonly<{
  browserTimezone: BrowserTimezoneState;
  savedTimezone: string;
  timezoneOptions: string[];
}>): string[] {
  const missingOptions = [
    savedTimezone,
    ...(browserTimezone.status === "available"
      ? [browserTimezone.value]
      : []),
  ].filter(
    (option, index, options) =>
      !timezoneOptions.includes(option) && options.indexOf(option) === index,
  );

  return [...missingOptions, ...timezoneOptions];
}

function readBrowserTimezone(): BrowserTimezoneState {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!timezone) {
    return {
      status: "unavailable",
      value: "",
    };
  }

  return {
    status: "available",
    value: timezone,
  };
}

function readSupportedTimezones(): string[] {
  if (typeof Intl.supportedValuesOf !== "function") {
    return [];
  }

  return Intl.supportedValuesOf("timeZone");
}
