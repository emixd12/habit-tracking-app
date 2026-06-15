import Link from "next/link";
import type { CSSProperties } from "react";

import type {
  AnalyticsBehaviorDayCell,
  AnalyticsBehaviorDayState,
  AnalyticsBehaviorSummary,
  AnalyticsOverallDayState,
  AnalyticsRangeDays,
  AnalyticsStatusCounts,
  AnalyticsView,
} from "@/lib/types/analytics";

type AnalyticsScreenProps = Readonly<{
  analytics: AnalyticsView;
}>;

const OVERALL_CELL_CLASSES: Record<AnalyticsOverallDayState, string> = {
  completed: "border-line text-primary-foreground",
  partial: "border-line text-foreground",
  not_completed: "border-line bg-background text-foreground",
  unresolved: "border-line bg-surface text-muted-readable",
  empty: "border-line bg-background text-muted-readable",
};

const BEHAVIOR_CELL_CLASSES: Record<AnalyticsBehaviorDayState, string> = {
  full: "border-line bg-primary text-primary-foreground",
  partial: "border-line bg-surface text-foreground",
  not_completed: "border-line bg-background text-foreground",
  unresolved: "border-line bg-surface text-muted-readable",
  empty: "border-line bg-background text-muted-readable",
};

export function AnalyticsScreen({ analytics }: AnalyticsScreenProps) {
  const hasSelectedDayNotCompleted =
    analytics.selectedDay.notCompletedOccurrences.length > 0;

  return (
    <div className="grid gap-10">
      <section
        className="grid gap-6"
        aria-labelledby="analytics-summary-title"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div>
              <h2
                id="analytics-summary-title"
                className="text-2xl font-bold leading-tight"
              >
                Overall adherence
              </h2>
              <p className="mt-2 text-sm font-bold text-muted-readable">
                {analytics.rangeLabel} · {analytics.rangeStartLocalDate} to{" "}
                {analytics.rangeEndLocalDate}
              </p>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-end">
              <div>
                <p className="text-4xl font-bold leading-none sm:text-5xl">
                  {analytics.summary.percentLabel}
                </p>
                <p className="mt-2 text-sm font-bold text-muted-readable">
                  {analytics.summary.detailLabel}
                </p>
              </div>
              <StatusCountGrid counts={analytics.summary} />
            </div>
          </div>

          <RangeSelector analytics={analytics} />
        </div>

        <div className="border-t border-line pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-bold leading-tight">Calendar</h3>
              <p className="mt-2 text-sm font-bold text-muted-readable">
                Selected day: {analytics.selectedDay.localDate}
              </p>
            </div>
            <LegendDisclosure />
          </div>

          <div
            className={[
              "mt-5 grid gap-6",
              hasSelectedDayNotCompleted
                ? "lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start"
                : "",
            ].join(" ")}
          >
            <OverallHeatmap analytics={analytics} />
            {hasSelectedDayNotCompleted ? (
              <SelectedDayNotCompleted analytics={analytics} />
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="grid gap-4 border-t border-line pt-6"
        aria-labelledby="behavior-counts-title"
      >
        <h2
          id="behavior-counts-title"
          className="text-2xl font-bold leading-tight"
        >
          Behavior counts
        </h2>

        {analytics.behaviorSummaries.length === 0 ? (
          <p className="text-base leading-7 text-muted-readable">
            No occurrences in this range.
          </p>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {analytics.behaviorSummaries.map((behavior) => (
              <BehaviorAnalyticsRow key={behavior.behaviorId} behavior={behavior} />
            ))}
          </div>
        )}
      </section>

      <section
        className="grid gap-4 border-t border-line pt-6"
        aria-labelledby="category-counts-title"
      >
        <h2
          id="category-counts-title"
          className="text-2xl font-bold leading-tight"
        >
          Category counts
        </h2>

        {analytics.categorySummaries.length === 0 ? (
          <p className="text-base leading-7 text-muted-readable">
            No category counts in this range.
          </p>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {analytics.categorySummaries.map((category) => (
              <article
                key={category.categoryName}
                className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] sm:items-start"
              >
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-bold leading-tight">
                    {category.categoryName}
                  </h3>
                  <p className="mt-2 text-sm font-bold text-muted-readable">
                    {category.percentLabel}
                  </p>
                </div>
                <div>
                  <StatusCountGrid counts={category} compact />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SelectedDayNotCompleted({
  analytics,
}: Readonly<{
  analytics: AnalyticsView;
}>) {
  return (
    <div className="min-w-0" aria-labelledby="selected-day-title">
      <div>
        <h3 id="selected-day-title" className="text-xl font-bold leading-tight">
          Not Completed
        </h3>
        <p className="mt-2 text-sm font-bold text-muted-readable">
          {analytics.selectedDay.label} · {analytics.selectedDay.localDate}
        </p>
      </div>

      <div className="mt-3 divide-y divide-line border-t border-line">
        {analytics.selectedDay.notCompletedOccurrences.map((occurrence) => (
          <article key={occurrence.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <time
                dateTime={occurrence.scheduledFor}
                className="border border-line bg-surface px-2 py-1 text-sm font-bold text-muted-readable"
              >
                {occurrence.scheduledTimeLabel}
              </time>
              <span className="border border-line bg-background px-2 py-1 text-xs font-bold">
                {occurrence.categoryName}
              </span>
            </div>
            <h4 className="mt-3 break-words text-xl font-bold leading-tight">
              {occurrence.title}
            </h4>
            {occurrence.note ? (
              <p className="mt-3 border-t border-line pt-3 text-sm leading-6 text-muted-readable">
                {occurrence.note}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function RangeSelector({
  analytics,
}: Readonly<{
  analytics: AnalyticsView;
}>) {
  return (
    <nav
      aria-label="Analytics date range"
      className="flex flex-wrap gap-2 lg:justify-end"
    >
      {analytics.rangeOptions.map((rangeDays) => {
        const isActive = analytics.rangeDays === rangeDays;

        return (
          <Link
            key={rangeDays}
            href={analyticsHref(rangeDays, analytics.selectedDay.localDate)}
            aria-current={isActive ? "page" : undefined}
            className={[
              "inline-flex min-h-11 items-center justify-center border px-4 py-2 text-sm font-bold transition-colors",
              isActive
                ? "border-line bg-primary text-primary-foreground"
                : "border-line bg-background text-foreground hover:bg-surface",
            ].join(" ")}
          >
            {rangeDays} days
          </Link>
        );
      })}
    </nav>
  );
}

function OverallHeatmap({
  analytics,
}: Readonly<{
  analytics: AnalyticsView;
}>) {
  return (
    <div className="grid w-full max-w-sm grid-cols-7 gap-1 sm:gap-2">
      {analytics.overallHeatmap.map((cell) => (
        <Link
          key={cell.key}
          href={analyticsHref(analytics.rangeDays, cell.localDate)}
          aria-label={cell.ariaLabel}
          title={cell.ariaLabel}
          data-completion-rate={cell.completionRate ?? undefined}
          style={overallCellStyle(cell)}
          className={[
            "relative aspect-square min-h-9 border transition-colors hover:border-foreground focus-visible:z-10",
            OVERALL_CELL_CLASSES[cell.state],
            cell.isSelected ? "outline outline-2 outline-offset-2 outline-foreground" : "",
          ].join(" ")}
        >
          <span className="sr-only">{cell.shortLabel}</span>
        </Link>
      ))}
    </div>
  );
}

function BehaviorAnalyticsRow({
  behavior,
}: Readonly<{
  behavior: AnalyticsBehaviorSummary;
}>) {
  return (
    <article className="py-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-xl font-bold leading-tight">
              {behavior.title}
            </h3>
            <span className="border border-line bg-surface px-2 py-1 text-xs font-bold">
              {behavior.categoryName}
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-muted-readable">
            {behavior.percentLabel} · {behavior.detailLabel}
          </p>
          <p className="mt-1 text-sm font-bold text-muted-readable">
            Tracking since {behavior.trackingStartLabel} ·{" "}
            {behavior.trackingStartLocalDate}
          </p>
          <div className="mt-4 max-w-sm">
            <StatusCountGrid counts={behavior} />
          </div>
        </div>

        <div
          className="grid w-full max-w-[15rem] grid-cols-7 gap-1"
          aria-label={`${behavior.title} calendar`}
        >
          {behavior.dailyCells.map((cell) => (
            <BehaviorHeatmapCell key={cell.key} cell={cell} />
          ))}
        </div>
      </div>
    </article>
  );
}

function BehaviorHeatmapCell({
  cell,
}: Readonly<{
  cell: AnalyticsBehaviorDayCell;
}>) {
  return (
    <span
      aria-label={cell.ariaLabel}
      title={cell.ariaLabel}
      data-tracking-start={cell.isTrackingStart ? "true" : undefined}
      className={[
        "relative aspect-square min-h-6 border",
        BEHAVIOR_CELL_CLASSES[cell.state],
      ].join(" ")}
    >
      {cell.isTrackingStart ? <TrackingStartMarker /> : null}
      {cell.state === "partial" || cell.state === "not_completed" ? (
        <DiagonalMark compact />
      ) : null}
    </span>
  );
}

function LegendDisclosure() {
  return (
    <details className="w-full sm:w-auto">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center border border-line bg-background px-3 py-2 text-sm font-bold transition-colors hover:bg-surface [&::-webkit-details-marker]:hidden">
        See Legend
      </summary>
      <div className="mt-3">
        <HeatmapLegend />
      </div>
    </details>
  );
}

function HeatmapLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-sm font-bold text-muted-readable">
      <LegendItem
        label="100% Completed"
        className="border-line"
        style={completionShadeStyle(1)}
      />
      <LegendItem
        label="Partial"
        className="border-line"
        style={completionShadeStyle(0.5)}
      />
      <LegendItem label="Not Completed" className="border-line bg-background" />
      <LegendItem label="Unresolved" className="border-line bg-surface" />
    </ul>
  );
}

function LegendItem({
  label,
  className,
  style,
}: Readonly<{
  label: string;
  className: string;
  style?: CSSProperties;
}>) {
  return (
    <li className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        style={style}
        className={["relative h-4 w-4 border", className].join(" ")}
      />
      <span>{label}</span>
    </li>
  );
}

function overallCellStyle(
  cell: AnalyticsView["overallHeatmap"][number],
): CSSProperties | undefined {
  if (cell.completionRate === null) {
    return undefined;
  }

  return completionShadeStyle(cell.completionRate);
}

function completionShadeStyle(completionRate: number): CSSProperties {
  const percent = Math.round(Math.max(0, Math.min(1, completionRate)) * 1000) / 10;

  return {
    backgroundColor: `color-mix(in srgb, var(--primary) ${percent}%, var(--background))`,
  };
}

function StatusCountGrid({
  counts,
  compact = false,
}: Readonly<{
  counts: AnalyticsStatusCounts;
  compact?: boolean;
}>) {
  return (
    <dl
      className={[
        "grid gap-1 text-sm leading-6 text-muted-readable",
        compact ? "max-w-xs" : "max-w-sm",
      ].join(" ")}
    >
      <CountItem label="Completed" value={counts.completedCount} />
      <CountItem label="Not Completed" value={counts.notCompletedCount} />
      <CountItem label="Unresolved" value={counts.unresolvedCount} />
    </dl>
  );
}

function CountItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: number;
}>) {
  return (
    <div className="grid grid-cols-[minmax(8.5rem,1fr)_auto] items-baseline gap-4">
      <dt className="font-bold text-foreground">{label}</dt>
      <dd className="text-right tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function TrackingStartMarker() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-foreground"
    />
  );
}

function DiagonalMark({
  compact = false,
}: Readonly<{
  compact?: boolean;
}>) {
  return (
    <span
      aria-hidden="true"
      className={[
        "absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground",
        compact ? "w-3" : "w-5",
      ].join(" ")}
    />
  );
}

function analyticsHref(rangeDays: AnalyticsRangeDays, day: string): string {
  const params = new URLSearchParams({
    range: String(rangeDays),
    day,
  });

  return `/analytics?${params.toString()}`;
}
