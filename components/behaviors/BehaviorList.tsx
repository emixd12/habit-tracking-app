"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import {
  BEHAVIOR_CREATED_EVENT,
  isBehaviorCreatedEvent,
} from "@/components/behaviors/behavior-events";
import { upsertBehaviorView } from "@/components/behaviors/behavior-list-state";
import { OccurrenceNoteForm } from "@/components/timeline/OccurrenceNoteForm";
import { StatusButtons } from "@/components/timeline/StatusButtons";
import type {
  AnalyticsBehaviorDayCell,
  AnalyticsBehaviorDayState,
  AnalyticsBehaviorSummary,
  AnalyticsOverallDayState,
  AnalyticsRangeDays,
  AnalyticsStatusCounts,
  AnalyticsView,
} from "@/lib/types/analytics";
import type {
  BehaviorActionState,
  BehaviorFormAction,
  BehaviorView,
  CategoryOption,
} from "@/lib/types/behavior";
import type { OccurrenceFormAction } from "@/lib/types/timeline";

type BehaviorListProps = Readonly<{
  activeBehaviors: BehaviorView[];
  archivedBehaviors: BehaviorView[];
  categories: CategoryOption[];
  analytics: AnalyticsView;
  updateAction: BehaviorFormAction;
  archiveAction: BehaviorFormAction;
  restoreAction: BehaviorFormAction;
  statusAction: OccurrenceFormAction;
  noteAction: OccurrenceFormAction;
}>;

const EMPTY_ACTION_STATE: BehaviorActionState = {
  status: "idle",
  message: "",
};

const OVERALL_CELL_CLASSES: Record<AnalyticsOverallDayState, string> = {
  completed: "border-line text-primary-foreground",
  partial: "border-line text-foreground",
  not_completed: "border-line bg-accent text-primary-foreground",
  unresolved: "border-line bg-surface text-muted-readable",
  empty: "border-line bg-background text-muted-readable",
};

const BEHAVIOR_CELL_CLASSES: Record<AnalyticsBehaviorDayState, string> = {
  full: "border-line bg-primary text-primary-foreground",
  partial: "border-line bg-surface text-foreground",
  not_completed: "border-line bg-accent text-primary-foreground",
  unresolved: "border-line bg-surface text-muted-readable",
  empty: "border-line bg-background text-muted-readable",
};

export function BehaviorList({
  activeBehaviors,
  archivedBehaviors,
  categories,
  analytics,
  updateAction,
  archiveAction,
  restoreAction,
  statusAction,
  noteAction,
}: BehaviorListProps) {
  const [createdBehaviorRows, setCreatedBehaviorRows] = useState<BehaviorView[]>(
    [],
  );
  const activeBehaviorRows = createdBehaviorRows.reduce(
    (current, behavior) => upsertBehaviorView(current, behavior),
    activeBehaviors,
  );
  const behaviorAnalyticsById = new Map(
    analytics.behaviorSummaries.map((summary) => [summary.behaviorId, summary]),
  );

  useEffect(() => {
    function handleBehaviorCreated(event: Event) {
      if (!isBehaviorCreatedEvent(event)) {
        return;
      }

      setCreatedBehaviorRows((current) =>
        upsertBehaviorView(current, event.detail.behavior),
      );
    }

    window.addEventListener(BEHAVIOR_CREATED_EVENT, handleBehaviorCreated);

    return () => {
      window.removeEventListener(BEHAVIOR_CREATED_EVENT, handleBehaviorCreated);
    };
  }, []);

  return (
    <div className="grid gap-8">
      <OverallAdherence analytics={analytics} />

      <section className="grid gap-4" aria-labelledby="active-behaviors-title">
        <div className="border-b border-line pb-3">
          <h2 id="active-behaviors-title" className="text-2xl leading-tight">
            Active behaviors
          </h2>
        </div>

        {activeBehaviorRows.length === 0 ? (
          <p className="border-t border-line pt-4 text-base leading-7 text-muted-readable">
            No active behaviors.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {activeBehaviorRows.map((behavior) => (
              <BehaviorRecord
                key={behavior.id}
                behavior={behavior}
                categories={categories}
                analytics={analytics}
                behaviorAnalytics={behaviorAnalyticsById.get(behavior.id) ?? null}
                updateAction={updateAction}
                archiveAction={archiveAction}
                restoreAction={restoreAction}
                statusAction={statusAction}
                noteAction={noteAction}
              />
            ))}
          </div>
        )}
      </section>

      <CategoryCounts analytics={analytics} />

      <ArchivedBehaviorDisclosure
        archivedBehaviors={archivedBehaviors}
        categories={categories}
        updateAction={updateAction}
        archiveAction={archiveAction}
        restoreAction={restoreAction}
      />
    </div>
  );
}

function OverallAdherence({
  analytics,
}: Readonly<{
  analytics: AnalyticsView;
}>) {
  return (
    <section className="grid gap-4" aria-labelledby="overall-adherence-title">
      <div className="grid gap-5 md:grid-cols-[minmax(14rem,0.62fr)_minmax(16rem,31rem)] md:items-start">
        <div className="grid max-w-sm gap-5">
          <h2 id="overall-adherence-title" className="text-2xl leading-tight">
            Overall adherence
          </h2>

          <div className="grid gap-4">
            <div>
              <p className="text-4xl leading-none sm:text-5xl">
                {analytics.summary.percentLabel}
              </p>
              <p className="mt-2 text-sm text-muted-readable">
                Range:{" "}
                {formatLocalDateRange(
                  analytics.rangeStartLocalDate,
                  analytics.rangeEndLocalDate,
                )}
              </p>
            </div>

            <StatusCountGrid counts={analytics.summary} />
          </div>
        </div>

        <div className="grid w-full max-w-[31rem] gap-3 md:justify-self-end">
          <RangeSelector analytics={analytics} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_max-content] sm:items-start">
            <OverallHeatmap analytics={analytics} />
            <HeatmapLegend />
          </div>
        </div>
      </div>
    </section>
  );
}

function RangeSelector({
  analytics,
}: Readonly<{
  analytics: AnalyticsView;
}>) {
  return (
    <nav
      aria-label="Adherence date range"
      className="flex min-h-11 w-full max-w-[16rem] flex-wrap gap-x-5 gap-y-2"
    >
      {analytics.rangeOptions.map((rangeDays) => {
        const isActive = analytics.rangeDays === rangeDays;

        return (
          <Link
            key={rangeDays}
            href={behaviorReviewHref({
              rangeDays,
              behaviorId: analytics.selectedBehaviorDay?.behaviorId,
              day: analytics.selectedBehaviorDay?.localDate,
            })}
            aria-current={isActive ? "page" : undefined}
            className={[
              "product-action min-h-11 py-2 text-sm",
              isActive ? "product-action-primary" : "product-action-secondary",
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
    <div className="grid w-full max-w-[16rem] grid-cols-7 gap-1">
      {analytics.overallHeatmap.map((cell) => (
        <span
          key={cell.key}
          aria-label={cell.ariaLabel}
          title={cell.ariaLabel}
          data-completion-rate={cell.completionRate ?? undefined}
          data-hover-label={cell.shortLabel}
          style={overallCellStyle(cell)}
          className={[
            "analytics-heatmap-cell relative aspect-square min-h-8 border",
            OVERALL_CELL_CLASSES[cell.state],
          ].join(" ")}
        >
          <span className="sr-only">{cell.shortLabel}</span>
        </span>
      ))}
    </div>
  );
}

function BehaviorRecord({
  behavior,
  categories,
  analytics,
  behaviorAnalytics,
  updateAction,
  archiveAction,
  restoreAction,
  statusAction,
  noteAction,
}: Readonly<{
  behavior: BehaviorView;
  categories: CategoryOption[];
  analytics?: AnalyticsView;
  behaviorAnalytics?: AnalyticsBehaviorSummary | null;
  updateAction: BehaviorFormAction;
  archiveAction: BehaviorFormAction;
  restoreAction: BehaviorFormAction;
  statusAction?: OccurrenceFormAction;
  noteAction?: OccurrenceFormAction;
}>) {
  const [hasOpenedEdit, setHasOpenedEdit] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const selectedBehaviorDay =
    analytics?.selectedBehaviorDay?.behaviorId === behavior.id
      ? analytics.selectedBehaviorDay
      : null;

  return (
    <article className="bg-background">
      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)] md:items-start">
        <div className="grid min-w-0 gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-xl leading-tight">{behavior.title}</h3>
            {!behavior.active ? (
              <span className="border border-line bg-surface px-2 py-1 text-xs">
                Archived
              </span>
            ) : null}
          </div>

          {behavior.active ? (
            <BehaviorOutcomeStats behaviorAnalytics={behaviorAnalytics ?? null} />
          ) : null}

          {!behavior.active ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <BehaviorStateForm
                behaviorId={behavior.id}
                action={restoreAction}
                buttonLabel="Restore"
                pendingLabel="Restoring..."
                variant="primary"
              />
            </div>
          ) : null}
        </div>

        {behavior.active ? (
          <BehaviorCalendarPanel
            behavior={behavior}
            behaviorAnalytics={behaviorAnalytics ?? null}
            rangeDays={analytics?.rangeDays ?? 30}
          />
        ) : null}
      </div>

      <details
        className="group"
        onToggle={(event) => {
          setIsSettingsOpen(event.currentTarget.open);

          if (event.currentTarget.open) {
            setHasOpenedEdit(true);
          }
        }}
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-5 py-4 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="mr-1 h-0 w-0 shrink-0 border-y-[0.25rem] border-l-[0.375rem] border-y-transparent border-l-muted-readable transition-transform duration-200 group-open:rotate-90"
          />
          <span
            className="block min-w-0 whitespace-nowrap"
            style={{
              flex: isSettingsOpen ? "1 1 auto" : "0 1 auto",
              backgroundImage: "linear-gradient(currentColor, currentColor)",
              backgroundPosition: "0 100%",
              backgroundRepeat: "no-repeat",
              backgroundSize: "100% 1px",
              paddingBottom: "4px",
            }}
          >
            Details and Settings
          </span>
        </summary>
        <div className="mx-5 grid gap-5 pb-5 pl-2.5 pt-4">
          <BehaviorMetadata behavior={behavior} />

          {hasOpenedEdit ? (
            <>
              <BehaviorForm
                key={`${behavior.id}-${behavior.updatedAt}`}
                mode="edit"
                action={updateAction}
                categories={categories}
                behavior={behavior}
                showActiveToggle={false}
              />

              {behavior.active ? (
                <div className="border-t border-line pt-4">
                  <BehaviorStateForm
                    behaviorId={behavior.id}
                    action={archiveAction}
                    buttonLabel="Archive behavior"
                    pendingLabel="Archiving..."
                    variant="danger"
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </details>

      {selectedBehaviorDay && statusAction && noteAction ? (
        <BehaviorDateReview
          selectedBehaviorDay={selectedBehaviorDay}
          statusAction={statusAction}
          noteAction={noteAction}
        />
      ) : null}
    </article>
  );
}

function BehaviorMetadata({
  behavior,
}: Readonly<{
  behavior: BehaviorView;
}>) {
  return (
    <dl className="grid gap-2 text-sm leading-6 text-muted-readable">
      <SummaryItem label="Category" value={behavior.categoryName} />
      <SummaryItem label="Scheduled" value={behavior.scheduleSummary} />
      <SummaryItem label="Recurrence" value={behavior.recurrenceSummary} />
      <SummaryItem label="Reminders" value={behavior.reminderSummary} />
      {behavior.description ? (
        <SummaryItem label="Description" value={behavior.description} />
      ) : null}
    </dl>
  );
}

function BehaviorOutcomeStats({
  behaviorAnalytics,
}: Readonly<{
  behaviorAnalytics: AnalyticsBehaviorSummary | null;
}>) {
  if (!behaviorAnalytics) {
    return (
      <p className="text-sm leading-6 text-muted-readable">
        No occurrences in this range.
      </p>
    );
  }

  return (
    <dl className="grid max-w-sm gap-2 text-sm leading-6 text-muted-readable">
      <SummaryItem label="Adherence" value={behaviorAnalytics.percentLabel} />
      <SummaryItem
        label="Completed"
        value={String(behaviorAnalytics.completedCount)}
      />
      <SummaryItem
        label="Not Completed"
        value={String(behaviorAnalytics.notCompletedCount)}
      />
      <SummaryItem
        label="Tracking since"
        value={formatCompactLocalDate(behaviorAnalytics.trackingStartLocalDate)}
      />
    </dl>
  );
}

function BehaviorCalendarPanel({
  behavior,
  behaviorAnalytics,
  rangeDays,
}: Readonly<{
  behavior: BehaviorView;
  behaviorAnalytics: AnalyticsBehaviorSummary | null;
  rangeDays: AnalyticsRangeDays;
}>) {
  if (!behaviorAnalytics) {
    return null;
  }

  return (
    <div className="grid w-full max-w-[19rem] gap-3 md:justify-self-end">
      <div
        className="grid w-full grid-cols-7 gap-1"
        aria-label={`${behavior.title} calendar`}
      >
        {behaviorAnalytics.dailyCells.map((cell) => (
          <BehaviorHeatmapCell
            key={cell.key}
            cell={cell}
            behaviorId={behavior.id}
            rangeDays={rangeDays}
          />
        ))}
      </div>
    </div>
  );
}

function BehaviorHeatmapCell({
  cell,
  behaviorId,
  rangeDays,
}: Readonly<{
  cell: AnalyticsBehaviorDayCell;
  behaviorId: string;
  rangeDays: AnalyticsRangeDays;
}>) {
  const className = [
    "analytics-heatmap-cell relative aspect-square min-h-8 border",
    BEHAVIOR_CELL_CLASSES[cell.state],
    cell.counts.totalCount > 0
      ? "transition-colors hover:border-foreground focus-visible:z-10"
      : "",
    cell.isTrackingStart ? "border-dotted !border-foreground" : "",
    cell.isSelected ? "outline outline-2 outline-offset-2 outline-foreground" : "",
  ].join(" ");
  const content = (
    <>
      <span className="sr-only">{cell.shortLabel}</span>
      {cell.state === "partial" ? <DiagonalMark compact /> : null}
    </>
  );

  if (cell.counts.totalCount > 0) {
    return (
      <Link
        href={behaviorReviewHref({
          rangeDays,
          behaviorId,
          day: cell.localDate,
        })}
        scroll={false}
        aria-label={`${cell.ariaLabel}; review this behavior date`}
        title={`${cell.ariaLabel}; review this behavior date`}
        data-tracking-start={cell.isTrackingStart ? "true" : undefined}
        data-hover-label={cell.shortLabel}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <span
      aria-label={cell.ariaLabel}
      title={cell.ariaLabel}
      data-tracking-start={cell.isTrackingStart ? "true" : undefined}
      data-hover-label={cell.shortLabel}
      className={className}
    >
      {content}
    </span>
  );
}

function BehaviorDateReview({
  selectedBehaviorDay,
  statusAction,
  noteAction,
}: Readonly<{
  selectedBehaviorDay: NonNullable<AnalyticsView["selectedBehaviorDay"]>;
  statusAction: OccurrenceFormAction;
  noteAction: OccurrenceFormAction;
}>) {
  return (
    <div
      className="mx-5 mb-5 grid gap-4 bg-surface px-4 py-4 sm:px-5"
      aria-labelledby={`selected-behavior-date-${selectedBehaviorDay.behaviorId}`}
    >
      <h4
        id={`selected-behavior-date-${selectedBehaviorDay.behaviorId}`}
        className="text-lg leading-tight"
      >
        Review
      </h4>

      <div className="grid gap-5">
        {selectedBehaviorDay.occurrences.map((occurrence) => (
          <article
            key={occurrence.id}
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
          >
            <BehaviorDateOccurrenceSummary
              occurrence={occurrence}
              dateLabel={selectedBehaviorDay.label}
              localDate={selectedBehaviorDay.localDate}
            />

            <details className="min-w-0 [&[open]]:w-full lg:justify-self-end lg:[&[open]]:w-[32rem] lg:[&[open]]:max-w-full">
              <summary className="timeline-status-action product-action product-action-primary min-h-11 cursor-pointer list-none py-1 text-sm sm:min-h-8 [&::-webkit-details-marker]:hidden">
                Review
              </summary>
              <div className="mt-3 grid gap-4 text-sm leading-6 text-muted-readable">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h5 className="text-foreground">Change status</h5>
                  <StatusButtons
                    occurrenceId={occurrence.id}
                    currentStatus={occurrence.status}
                    action={statusAction}
                    compact
                  />
                </div>

                <OccurrenceNoteForm
                  key={`${occurrence.id}-${occurrence.note}`}
                  occurrenceId={occurrence.id}
                  note={occurrence.note}
                  action={noteAction}
                />
              </div>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}

function BehaviorDateOccurrenceSummary({
  occurrence,
  dateLabel,
  localDate,
}: Readonly<{
  occurrence: NonNullable<
    AnalyticsView["selectedBehaviorDay"]
  >["occurrences"][number];
  dateLabel: string;
  localDate: string;
}>) {
  const note = occurrence.note.trim();

  return (
    <dl className="grid min-w-0 gap-1 text-sm leading-6">
      <BehaviorDateOccurrenceDetail label="Date of behavior">
        <time dateTime={localDate}>
          {dateLabel} · {localDate}
        </time>
      </BehaviorDateOccurrenceDetail>
      <BehaviorDateOccurrenceDetail label="Time of behavior">
        <time dateTime={occurrence.scheduledFor}>
          {occurrence.scheduledTimeLabel}
        </time>
      </BehaviorDateOccurrenceDetail>
      <BehaviorDateOccurrenceDetail label="Status">
        {occurrence.statusLabel}
      </BehaviorDateOccurrenceDetail>
      <BehaviorDateOccurrenceDetail label="Note">
        {note.length > 0 ? (
          <span className="break-words text-foreground">{note}</span>
        ) : (
          <span className="italic text-muted-readable">No note</span>
        )}
      </BehaviorDateOccurrenceDetail>
    </dl>
  );
}

function BehaviorDateOccurrenceDetail({
  label,
  children,
}: Readonly<{
  label: string;
  children: ReactNode;
}>) {
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <dt className="text-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

function CategoryCounts({
  analytics,
}: Readonly<{
  analytics: AnalyticsView;
}>) {
  return (
    <section className="grid gap-4 border-t border-line pt-6" aria-labelledby="category-counts-title">
      <h2 id="category-counts-title" className="text-2xl leading-tight">
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
                <h3 className="break-words text-lg leading-tight">
                  {category.categoryName}
                </h3>
                <p className="mt-2 text-sm text-muted-readable">
                  {category.percentLabel}
                </p>
              </div>
              <div>
                <StatusCountGrid
                  counts={category}
                  compact
                  includeUnresolved={false}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ArchivedBehaviorDisclosure({
  archivedBehaviors,
  categories,
  updateAction,
  archiveAction,
  restoreAction,
}: Readonly<{
  archivedBehaviors: BehaviorView[];
  categories: CategoryOption[];
  updateAction: BehaviorFormAction;
  archiveAction: BehaviorFormAction;
  restoreAction: BehaviorFormAction;
}>) {
  return (
    <section className="border-t border-line pt-4" aria-labelledby="archived-behaviors-title">
      <details>
        <summary
          id="archived-behaviors-title"
          className="cursor-pointer py-3 text-xl leading-tight text-foreground underline decoration-1 underline-offset-4 marker:text-muted-readable focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Archived behaviors ({archivedBehaviors.length})
        </summary>

        {archivedBehaviors.length === 0 ? (
          <p className="border-t border-line pt-4 text-base leading-7 text-muted-readable">
            No archived behaviors.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line border-t border-line">
            {archivedBehaviors.map((behavior) => (
              <BehaviorRecord
                key={behavior.id}
                behavior={behavior}
                categories={categories}
                updateAction={updateAction}
                archiveAction={archiveAction}
                restoreAction={restoreAction}
              />
            ))}
          </div>
        )}
      </details>
    </section>
  );
}

function SummaryItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="text-foreground">{label}</dt>
      <dd className="min-w-0 max-w-[75ch] break-words text-muted-readable">
        {value}
      </dd>
    </div>
  );
}

function BehaviorStateForm({
  behaviorId,
  action,
  buttonLabel,
  pendingLabel,
  variant,
}: Readonly<{
  behaviorId: string;
  action: BehaviorFormAction;
  buttonLabel: string;
  pendingLabel: string;
  variant: "primary" | "danger";
}>) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={formAction} className="grid justify-start gap-2">
      <input type="hidden" name="behavior_id" value={behaviorId} />
      <BehaviorStateButton
        label={buttonLabel}
        pendingLabel={pendingLabel}
        variant={variant}
      />
      {state.status === "error" && state.message ? (
        <p className="max-w-48 border-t border-line pt-2 text-sm leading-6 text-accent">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function BehaviorStateButton({
  label,
  pendingLabel,
  variant,
}: Readonly<{
  label: string;
  pendingLabel: string;
  variant: "primary" | "danger";
}>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "product-action min-h-11 py-2 text-sm",
        variant === "danger"
          ? "product-action-danger"
          : "product-action-primary",
      ].join(" ")}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function HeatmapLegend() {
  return (
    <ul
      aria-label="Calendar legend"
      className="grid gap-2 text-sm text-muted-readable"
    >
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
      <LegendItem label="Not Completed" className="border-line bg-accent" />
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

function StatusCountGrid({
  counts,
  compact = false,
  includeUnresolved = true,
}: Readonly<{
  counts: AnalyticsStatusCounts;
  compact?: boolean;
  includeUnresolved?: boolean;
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
      {includeUnresolved && counts.unresolvedCount > 0 ? (
        <CountItem label="Unresolved" value={counts.unresolvedCount} />
      ) : null}
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
    <div className="grid items-baseline gap-x-4 gap-y-1 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="text-foreground">{label}</dt>
      <dd className="text-left tabular-nums text-muted-readable">{value}</dd>
    </div>
  );
}

function overallCellStyle(
  cell: AnalyticsView["overallHeatmap"][number],
): CSSProperties | undefined {
  if (cell.state === "not_completed") {
    return { backgroundColor: "var(--accent)" };
  }

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

function DiagonalMark({
  compact = false,
}: Readonly<{
  compact?: boolean;
}>) {
  return (
    <span
      aria-hidden="true"
      className={[
        "absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current",
        compact ? "w-3" : "w-5",
      ].join(" ")}
    />
  );
}

function formatCompactLocalDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);

  if (!match) {
    return localDate;
  }

  const [, year, month, day] = match;

  return `${month}-${day}-${year.slice(-2)}`;
}

function formatLocalDateRange(startLocalDate: string, endLocalDate: string): string {
  const start = parseLocalDateParts(startLocalDate);
  const end = parseLocalDateParts(endLocalDate);

  if (!start || !end) {
    return `${startLocalDate} to ${endLocalDate}`;
  }

  if (start.year === end.year && start.month === end.month) {
    return `${MONTH_LABELS[start.month - 1]} ${start.day}-${end.day}, ${end.year}`;
  }

  if (start.year === end.year) {
    return `${MONTH_LABELS[start.month - 1]} ${start.day}-${MONTH_LABELS[end.month - 1]} ${end.day}, ${end.year}`;
  }

  return `${MONTH_LABELS[start.month - 1]} ${start.day}, ${start.year}-${MONTH_LABELS[end.month - 1]} ${end.day}, ${end.year}`;
}

function parseLocalDateParts(
  localDate: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const monthNumber = Number(month);

  if (monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  return {
    year: Number(year),
    month: monthNumber,
    day: Number(day),
  };
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function behaviorReviewHref({
  rangeDays,
  behaviorId,
  day,
}: Readonly<{
  rangeDays: AnalyticsRangeDays;
  behaviorId?: string | null;
  day?: string | null;
}>): string {
  const params = new URLSearchParams({
    range: String(rangeDays),
  });

  if (behaviorId && day) {
    params.set("behavior", behaviorId);
    params.set("day", day);
  }

  return `/behaviors?${params.toString()}`;
}
