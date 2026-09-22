"use client";

import type { DailyBriefing } from "@cadence/core/types/daily-brief";

type DailyBriefBubbleProps = Readonly<{
  state: "loading" | "ready" | "error";
  briefing?: DailyBriefing;
  message?: string;
  onDismiss: () => void;
  onRetry?: () => void;
}>;

export function DailyBriefBubble({
  state,
  briefing,
  message,
  onDismiss,
  onRetry,
}: DailyBriefBubbleProps) {
  const ready = state === "ready" && briefing;

  return (
    <section
      aria-label="Cadence Daily Brief"
      className="relative z-10 ml-auto -mt-8 w-[min(30rem,calc(100%-1.5rem))] border border-line bg-background p-3 shadow-none motion-reduce:transition-none sm:-mt-6"
      data-daily-brief-state={state}
    >
      <span aria-hidden="true" className="absolute -top-2 right-[20%] h-4 w-4 rotate-45 border-l border-t border-line bg-background" />
      <div className="grid max-h-[min(24rem,60dvh)] grid-cols-[minmax(0,1fr)_2.75rem] gap-3 overflow-y-auto">
        <div className="min-w-0">
          <p className="text-sm font-bold">Daily Brief</p>
          {state === "loading" ? <p className="mt-1 text-sm leading-6 text-muted-readable">Preparing today’s read-only briefing…</p> : null}
          {ready ? <>
            <p role="status" aria-live="polite" className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]">{briefing.text}</p>
            {briefing.suggestions?.length ? <ul aria-label="Suggestions only" className="mt-2 space-y-2 text-sm leading-6">
              {briefing.suggestions.map((suggestion, index) => <li key={index} className="break-words [overflow-wrap:anywhere]">
                <p>{suggestion.text}</p>
                {suggestion.option ? <p className="text-xs text-muted-readable">Hypothetical option: {formatBriefTime(suggestion.option.intervals.proposed.startAt, briefing.timezone)}–{formatBriefTime(suggestion.option.intervals.proposed.endAt, briefing.timezone)} ({briefing.timezone}). No change applied.</p> : null}
                {suggestion.referenceIds.length ? <p className="text-xs">Sources: {suggestion.referenceIds.map((id) => {
                  const source = briefing.references?.find((source) => source.id === id);
                  return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer" className="mr-2 underline">{source.title} ({source.kind.replaceAll("_", " ")})</a> : null;
                })}</p> : null}
              </li>)}
            </ul> : null}
            <p className="mt-2 text-xs leading-5 text-muted-readable">
              Generated <time dateTime={briefing.generatedAt}>{formatBriefTime(briefing.generatedAt)}</time>.
            </p>
            {briefing.warnings.length ? <p className="mt-1 text-xs leading-5 text-muted-readable">{briefing.warnings.join(" ")}</p> : null}
          </> : null}
          {state === "error" ? <>
            <p role="status" aria-live="polite" className="mt-1 text-sm leading-6 text-muted-readable">{message ?? "Today’s Daily Brief is unavailable."}</p>
            {onRetry ? <button type="button" onClick={onRetry} className="product-action product-action-secondary mt-3 min-h-11 py-2 text-sm">Try again</button> : null}
          </> : null}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss Daily Brief" className="product-action product-action-secondary min-h-11 min-w-11 self-start px-2 py-2 text-sm">Close</button>
      </div>
    </section>
  );
}

function formatBriefTime(value: string, timezone?: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...(timezone ? { timeZone: timezone } : {}) });
}
