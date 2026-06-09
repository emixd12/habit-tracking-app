import Link from "next/link";

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
  completed: "border-line bg-primary text-primary-foreground",
  not_completed: "border-line bg-background text-foreground",
  unresolved: "border-line bg-surface text-muted-readable",
  empty: "border-line bg-background text-muted-readable",
};

const BEHAVIOR_CELL_CLASSES: Record<AnalyticsBehaviorDayState, string> = {
  full: "border-line bg-primary text-primary-foreground",
  partial: "border-line bg-surface text-foreground",
  not_done: "border-line bg-background text-foreground",
  unresolved: "border-line bg-surface text-muted-readable",
  empty: "border-line bg-background text-muted-readable",
};

export function AnalyticsScreen({ analytics }: AnalyticsScreenProps) {
  return (
    <div className="grid gap-8">
      <section
        className="border border-line bg-background p-5 sm:p-6"
        aria-labelledby="analytics-summary-title"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div className="border-b border-line pb-4">
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
      </section>

      <section
        className="border border-line bg-background p-5 sm:p-6"
        aria-labelledby="overall-heatmap-title"
      >
        <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="overall-heatmap-title"
              className="text-2xl font-bold leading-tight"
            >
              Overall calendar
            </h2>
            <p className="mt-2 text-sm font-bold text-muted-readable">
              Selected day: {analytics.selectedDay.localDate}
            </p>
          </div>
          <HeatmapLegend />
        </div>

        <div className="mt-5">
          <OverallHeatmap analytics={analytics} />
        </div>
      </section>

      <section
        className="border border-line bg-surface p-5 sm:p-6"
        aria-labelledby="selected-day-title"
      >
        <div className="border-b border-line pb-4">
          <h2
            id="selected-day-title"
            className="text-2xl font-bold leading-tight"
          >
            Not Completed
          </h2>
          <p className="mt-2 text-sm font-bold text-muted-readable">
            {analytics.selectedDay.label} · {analytics.selectedDay.localDate}
          </p>
        </div>

        {analytics.selectedDay.notDoneOccurrences.length === 0 ? (
          <p className="mt-4 border border-line bg-background p-4 text-base leading-7 text-muted-readable">
            {analytics.selectedDay.emptyMessage}
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {analytics.selectedDay.notDoneOccurrences.map((occurrence) => (
              <article
                key={occurrence.id}
                className="border border-line bg-background p-4"
              >
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
                <h3 className="mt-3 break-words text-xl font-bold leading-tight">
                  {occurrence.title}
                </h3>
                {occurrence.note ? (
                  <p className="mt-3 border-t border-line pt-3 text-sm leading-6 text-muted-readable">
                    {occurrence.note}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="behavior-counts-title">
        <div className="border-b border-line pb-3">
          <h2
            id="behavior-counts-title"
            className="text-2xl font-bold leading-tight"
          >
            Behavior counts
          </h2>
        </div>

        {analytics.behaviorSummaries.length === 0 ? (
          <p className="border border-line bg-surface p-5 text-base leading-7 text-muted-readable">
            No occurrences in this range.
          </p>
        ) : (
          <div className="grid gap-4">
            {analytics.behaviorSummaries.map((behavior) => (
              <BehaviorAnalyticsRow key={behavior.behaviorId} behavior={behavior} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="category-counts-title">
        <div className="border-b border-line pb-3">
          <h2
            id="category-counts-title"
            className="text-2xl font-bold leading-tight"
          >
            Category counts
          </h2>
        </div>

        {analytics.categorySummaries.length === 0 ? (
          <p className="border border-line bg-surface p-5 text-base leading-7 text-muted-readable">
            No category counts in this range.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.categorySummaries.map((category) => (
              <article
                key={category.categoryName}
                className="border border-line bg-background p-4"
              >
                <h3 className="break-words text-lg font-bold leading-tight">
                  {category.categoryName}
                </h3>
                <p className="mt-2 text-sm font-bold text-muted-readable">
                  {category.percentLabel}
                </p>
                <div className="mt-4">
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
          className={[
            "relative aspect-square min-h-9 border transition-colors hover:bg-surface focus-visible:z-10",
            OVERALL_CELL_CLASSES[cell.state],
            cell.isSelected ? "outline outline-2 outline-offset-2 outline-foreground" : "",
          ].join(" ")}
        >
          {cell.state === "not_completed" ? <DiagonalMark /> : null}
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
    <article className="border border-line bg-background p-5">
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
          <div className="mt-4">
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
      className={[
        "relative aspect-square min-h-6 border",
        BEHAVIOR_CELL_CLASSES[cell.state],
      ].join(" ")}
    >
      {cell.state === "partial" || cell.state === "not_done" ? (
        <DiagonalMark compact />
      ) : null}
    </span>
  );
}

function HeatmapLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-sm font-bold text-muted-readable">
      <LegendItem label="Completed" className="border-line bg-primary" />
      <LegendItem label="Not Completed" className="border-line bg-background" mark />
      <LegendItem label="Unresolved" className="border-line bg-surface" />
    </ul>
  );
}

function LegendItem({
  label,
  className,
  mark = false,
}: Readonly<{
  label: string;
  className: string;
  mark?: boolean;
}>) {
  return (
    <li className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={["relative h-4 w-4 border", className].join(" ")}
      >
        {mark ? <DiagonalMark compact /> : null}
      </span>
      <span>{label}</span>
    </li>
  );
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
        "grid gap-2 text-sm leading-6 text-muted-readable",
        compact ? "grid-cols-1" : "sm:grid-cols-3",
      ].join(" ")}
    >
      <CountItem label="Completed" value={counts.doneCount} />
      <CountItem label="Not Completed" value={counts.notDoneCount} />
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
    <div>
      <dt className="font-bold text-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
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
