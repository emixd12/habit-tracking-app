"use client";

import { useActionState, useEffect, useRef, useState } from "react";

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
  const timezoneInputRef = useRef<HTMLInputElement>(null);
  const [browserTimezone, setBrowserTimezone] =
    useState<BrowserTimezoneState>({
      status: "checking",
      value: "",
    });
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>([]);
  const canUseDetected =
    browserTimezone.status === "available" &&
    browserTimezone.value.length > 0 &&
    browserTimezone.value !== savedTimezone;

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      setBrowserTimezone(readBrowserTimezone());
      setTimezoneOptions(readSupportedTimezones());
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <section
      id="timezone"
      className="scroll-mt-20 border border-line bg-background p-5 sm:p-6 md:col-span-2"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]">
        <div className="min-w-0">
          <h2 className="text-xl leading-tight">Timezone</h2>
          <dl className="mt-4 grid gap-3 text-sm leading-6 text-muted-readable sm:grid-cols-2">
            <div>
              <dt className="font-bold text-foreground">Current timezone</dt>
              <dd>{savedTimezone}</dd>
            </div>
            <div>
              <dt className="font-bold text-foreground">Browser timezone</dt>
              <dd>{browserTimezoneLabel(browserTimezone)}</dd>
            </div>
          </dl>
        </div>

        <form key={savedTimezone} action={formAction} className="grid gap-3">
          <label
            htmlFor="timezone"
            className="text-sm leading-6 text-foreground"
          >
            Timezone
          </label>
          <input
            ref={timezoneInputRef}
            id="timezone"
            name="timezone"
            type="text"
            required
            autoComplete="off"
            list={timezoneOptions.length > 0 ? "timezone-options" : undefined}
            defaultValue={savedTimezone}
            className="min-h-11 border border-line bg-background px-3 py-2 text-base"
          />
          {timezoneOptions.length > 0 ? (
            <datalist id="timezone-options">
              {timezoneOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canUseDetected || isPending}
              onClick={() => {
                if (timezoneInputRef.current) {
                  timezoneInputRef.current.value = browserTimezone.value;
                }
              }}
              className="min-h-11 border border-line bg-background px-4 py-2 text-sm transition-colors hover:bg-surface disabled:bg-surface disabled:text-muted-readable"
            >
              Use detected timezone
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-11 border border-line bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-foreground disabled:bg-surface disabled:text-muted-readable"
            >
              {isPending ? "Saving..." : "Save timezone"}
            </button>
          </div>

          {state.message ? (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={[
                "border border-line bg-surface px-3 py-2 text-sm leading-6",
                state.status === "error"
                  ? "text-accent"
                  : "text-muted-readable",
              ].join(" ")}
            >
              {state.message}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
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

function browserTimezoneLabel(state: BrowserTimezoneState): string {
  switch (state.status) {
    case "checking":
      return "Checking";
    case "available":
      return state.value;
    case "unavailable":
      return "Unavailable";
  }
}
