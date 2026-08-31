import { Temporal } from "@js-temporal/polyfill";

// A local calendar day can last 23 or 25 hours. Never use a fixed daily interval.
export function scheduleLocalDayRefresh(timezone: string, refresh: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const schedule = () => {
    const now = Temporal.Now.instant();
    const next = now.toZonedDateTimeISO(timezone).add({ days: 1 }).startOfDay().toInstant();
    timer = setTimeout(() => {
      refresh();
      if (!stopped) schedule();
    }, next.epochMilliseconds - now.epochMilliseconds);
  };
  schedule();
  return () => { stopped = true; clearTimeout(timer); };
}
