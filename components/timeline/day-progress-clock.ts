"use client";

import { Temporal } from "@js-temporal/polyfill";
import { useEffect, useRef, useState } from "react";

export function useDayProgressClock(
  initialNow: string | undefined,
  timezone: string,
  onDayChange: (() => void) | undefined,
): string {
  const [now, setNow] = useState(() => initialNow ?? new Date().toISOString());
  const onDayChangeRef = useRef(onDayChange);
  onDayChangeRef.current = onDayChange;

  useEffect(() => {
    if (initialNow) setNow(initialNow);
  }, [initialNow]);

  useEffect(() => {
    if (initialNow) return;
    let timer: number | undefined;
    let previousDate = localDate(new Date().toISOString(), timezone);

    const refresh = () => {
      const next = new Date().toISOString();
      const nextDate = localDate(next, timezone);
      if (nextDate !== previousDate) {
        previousDate = nextDate;
        onDayChangeRef.current?.();
      }
      setNow(next);
    };
    const stop = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      if (document.hidden) return;
      refresh();
      const delay = 60_000 - (Date.now() % 60_000) + 25;
      timer = window.setTimeout(function tick() {
        refresh();
        timer = window.setTimeout(tick, 60_000);
      }, delay);
    };
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", stop);
    window.addEventListener("focus", start);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", stop);
      window.removeEventListener("focus", start);
    };
  }, [initialNow, timezone]);

  return now;
}

function localDate(instant: string, timezone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString();
}
