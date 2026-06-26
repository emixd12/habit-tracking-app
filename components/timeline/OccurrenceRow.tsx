"use client";

import { useCallback, useState } from "react";

import { OccurrenceNoteForm } from "@/components/timeline/OccurrenceNoteForm";
import { StatusButtons } from "@/components/timeline/StatusButtons";
import {
  beginOptimisticStatus,
  confirmOptimisticStatus,
  EMPTY_OPTIMISTIC_STATUS_STATE,
  type OptimisticTimelineStatusState,
  resolveOptimisticOccurrenceView,
  rollbackOptimisticStatus,
  type TimelineStatusActionStatus,
} from "@/components/timeline/optimistic-status";
import type {
  OccurrenceFormAction,
  TimelineOccurrenceView,
} from "@/lib/types/timeline";

type OccurrenceRowProps = Readonly<{
  occurrence: TimelineOccurrenceView;
  statusAction: OccurrenceFormAction;
  noteAction: OccurrenceFormAction;
}>;

type KeyedOptimisticStatusState = Readonly<{
  serverStatusKey: string;
  value: OptimisticTimelineStatusState;
}>;

const ROW_TONE_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "bg-background text-foreground hover:bg-timeline-row-hover",
  needs_decision:
    "bg-surface text-foreground hover:bg-timeline-needs-decision-hover",
  completed: "bg-primary text-primary-foreground hover:bg-timeline-completed-hover",
  not_completed: "bg-accent text-primary-foreground hover:bg-accent",
};

const TIME_TONE_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "text-muted-readable",
  needs_decision: "text-foreground",
  completed: "text-primary-foreground",
  not_completed: "text-primary-foreground",
};

const RESOLVED_LABEL_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "text-muted-readable",
  needs_decision: "text-foreground",
  completed: "text-primary-foreground",
  not_completed: "text-primary-foreground",
};

export function OccurrenceRow({
  occurrence,
  statusAction,
  noteAction,
}: OccurrenceRowProps) {
  const serverStatusKey = [
    occurrence.id,
    occurrence.status,
    occurrence.statusMarkedAt ?? "",
  ].join(":");
  const [keyedOptimisticStatus, setKeyedOptimisticStatus] =
    useState<KeyedOptimisticStatusState>({
      serverStatusKey,
      value: EMPTY_OPTIMISTIC_STATUS_STATE,
    });
  const optimisticStatus =
    keyedOptimisticStatus.serverStatusKey === serverStatusKey
      ? keyedOptimisticStatus.value
      : EMPTY_OPTIMISTIC_STATUS_STATE;
  const optimisticView = resolveOptimisticOccurrenceView(
    occurrence,
    optimisticStatus,
  );
  const visibleOccurrence = optimisticView.occurrence;
  const detailsId = `${visibleOccurrence.id}-details`;
  const pendingStatusLabel = optimisticStatus.pendingStatus
    ? statusLabel(optimisticStatus.pendingStatus)
    : null;

  const handleOptimisticStatus = useCallback(
    (nextStatus: TimelineStatusActionStatus) => {
      setKeyedOptimisticStatus({
        serverStatusKey,
        value: beginOptimisticStatus(nextStatus),
      });
    },
    [serverStatusKey],
  );
  const handleStatusConfirmed = useCallback(
    (nextStatus: TimelineStatusActionStatus | null) => {
      setKeyedOptimisticStatus({
        serverStatusKey,
        value: confirmOptimisticStatus(nextStatus),
      });
    },
    [serverStatusKey],
  );
  const handleStatusRejected = useCallback(() => {
    setKeyedOptimisticStatus({
      serverStatusKey,
      value: rollbackOptimisticStatus(),
    });
  }, [serverStatusKey]);

  return (
    <article
      aria-busy={optimisticView.isPending ? "true" : undefined}
      data-optimistic-status={optimisticStatus.pendingStatus ?? undefined}
      data-visual-tone={visibleOccurrence.visualTone}
      className={[
        "timeline-occurrence-row transition-colors",
        ROW_TONE_CLASSES[visibleOccurrence.visualTone],
      ].join(" ")}
    >
      {pendingStatusLabel ? (
        <p className="sr-only" role="status">
          Saving {pendingStatusLabel} status.
        </p>
      ) : null}
      <div className="timeline-occurrence-row-grid grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <details
          className="group min-w-0 sm:col-start-1 sm:col-end-3 sm:row-start-1"
          aria-controls={detailsId}
        >
          <summary className="grid min-h-12 cursor-pointer list-none grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-2 py-1 sm:min-h-0 sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:gap-1 sm:py-0 sm:pr-72 [&::-webkit-details-marker]:hidden">
            <time
              dateTime={visibleOccurrence.scheduledFor}
              className={[
                "text-xs font-bold leading-5 sm:text-sm",
                TIME_TONE_CLASSES[visibleOccurrence.visualTone],
              ].join(" ")}
            >
              {visibleOccurrence.scheduledTimeLabel}
            </time>

            <h3 className="min-w-0 break-words text-base font-bold leading-tight sm:truncate sm:text-lg">
              {visibleOccurrence.title}
            </h3>
          </summary>
        </details>

        {optimisticView.showPrimaryStatusActions ? (
          <div className="timeline-occurrence-status pt-1 sm:z-10 sm:col-start-2 sm:row-start-1 sm:self-center sm:pt-0">
            <StatusButtons
              occurrenceId={visibleOccurrence.id}
              currentStatus={visibleOccurrence.status}
              action={statusAction}
              disabled={optimisticView.isPending}
              pendingStatus={optimisticStatus.pendingStatus}
              onStatusSubmit={handleOptimisticStatus}
              onStatusSuccess={handleStatusConfirmed}
              onStatusError={handleStatusRejected}
            />
          </div>
        ) : visibleOccurrence.showCollapsedStatusLabel ? (
          <p
            className={[
              "timeline-occurrence-status text-xs font-bold leading-5 sm:z-10 sm:col-start-2 sm:row-start-1 sm:self-center sm:whitespace-nowrap sm:text-sm",
              RESOLVED_LABEL_CLASSES[visibleOccurrence.visualTone],
            ].join(" ")}
          >
            {pendingStatusLabel
              ? `Saving ${pendingStatusLabel}...`
              : visibleOccurrence.statusLabel}
          </p>
        ) : null}

        <div
          id={detailsId}
          className="timeline-occurrence-details mt-2 gap-4 border-t border-line pt-4 text-sm leading-6 text-muted-readable sm:col-start-1 sm:col-end-3 sm:mt-3 sm:py-2"
        >
          <DetailItem
            label="Description"
            value={visibleOccurrence.description || "No description."}
          />
          <DetailItem label="Category" value={visibleOccurrence.categoryName} />
          <DetailItem label="Schedule" value={visibleOccurrence.scheduleSummary} />

          {!optimisticView.showPrimaryStatusActions ? (
            <div className="grid gap-2">
              <h4 className="font-bold text-foreground">
                {visibleOccurrence.expandedStatusActionLabel}
              </h4>
              <StatusButtons
                occurrenceId={visibleOccurrence.id}
                currentStatus={visibleOccurrence.status}
                action={statusAction}
                disabled={optimisticView.isPending}
                pendingStatus={optimisticStatus.pendingStatus}
                onStatusSubmit={handleOptimisticStatus}
                onStatusSuccess={handleStatusConfirmed}
                onStatusError={handleStatusRejected}
                compact
              />
            </div>
          ) : null}

          <OccurrenceNoteForm
            key={`${visibleOccurrence.id}-${visibleOccurrence.note}`}
            occurrenceId={visibleOccurrence.id}
            note={visibleOccurrence.note}
            action={noteAction}
          />
        </div>
      </div>
    </article>
  );
}

function statusLabel(status: TimelineStatusActionStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "not_completed":
      return "Not Completed";
  }
}

function DetailItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="grid gap-1">
      <h4 className="font-bold text-foreground">{label}</h4>
      <p className="break-words">{value}</p>
    </div>
  );
}
