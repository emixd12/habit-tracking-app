import { RefreshProvider } from "@cadence/ui/runtime";
import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { NeedsDecisionDialog } from "@/components/timeline/NeedsDecisionDialog";
import { TimelineGroup } from "@/components/timeline/TimelineGroup";
import { OccurrenceRow } from "@/components/timeline/OccurrenceRow";
import type { NotificationTarget } from "./notification-activation";
import type {
  OccurrenceFormAction,
  TimeTrackingFormAction,
  TimelineView,
} from "@/lib/types/timeline";

export type TimelineScreenProps = Readonly<{
  timeline: TimelineView;
  statusAction: OccurrenceFormAction;
  noteAction: OccurrenceFormAction;
  startTimeTrackingAction: TimeTrackingFormAction;
  stopTimeTrackingAction: TimeTrackingFormAction;
  resetTimeTrackingAction: TimeTrackingFormAction;
  onRefresh: () => void;
  onShowMore: (days: number) => void;
  notificationTarget?: NotificationTarget | null;
}>;

export function TimelineScreen({
  timeline,
  onRefresh,
  onShowMore,
  notificationTarget,
  ...actions
}: TimelineScreenProps) {
  const nextFutureDays = timeline.nextFutureDays;
  const rootRef = useRef<HTMLDivElement>(null);
  const targetOccurrence = notificationTarget?.status === "available" ? notificationTarget.occurrence : null;
  const targetInFeed = !!targetOccurrence && timeline.daySections.some((section) =>
    section.occurrences.some((occurrence) => occurrence.id === targetOccurrence.id));
  const targetId = targetOccurrence?.id;
  const targetRequest = notificationTarget?.requestKey;
  const targetStatus = notificationTarget?.status;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !targetStatus || targetStatus === "loading") return;
    const row = targetId ? Array.from(root.querySelectorAll<HTMLElement>("[data-occurrence-id]"))
      .find((element) => element.dataset.occurrenceId === targetId) : undefined;
    const details = row?.querySelector("details");
    if (details) details.open = true;
    const focusTarget = row?.querySelector<HTMLElement>("summary")
      ?? root.querySelector<HTMLElement>("[data-notification-result]");
    focusTarget?.focus({ preventScroll: true });
    (row ?? focusTarget)?.scrollIntoView({ block: "center" });
  }, [targetId, targetRequest, targetStatus, targetInFeed]);

  return (
    <RefreshProvider onRefresh={onRefresh}>
      <div ref={rootRef} className="flex w-full flex-col">
        <h1 className="sr-only">Timeline</h1>
        <div className="w-full overflow-hidden bg-background">
          <div className="relative aspect-[1423/367] w-full sm:aspect-[2041/239]">
            <picture className="block h-full w-full">
              <source
                media="(max-width: 639px)"
                srcSet="/brand/cadence-timeline-horse-lines-dots-mobile-right-18.png"
              />
              {/* Local files need no Next image loader inside the native webview. */}
              <img
                src="/brand/cadence-timeline-horse-lines-dots-clear-background.png"
                width={2041}
                height={239}
                alt=""
                aria-hidden="true"
                fetchPriority="high"
                className="block h-full w-full object-fill lg:mt-1"
              />
            </picture>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-10">
          <div className="grid gap-8 pb-32 sm:pb-24">
            {notificationTarget ? (
              <section className="grid gap-3 border-b border-line py-4" aria-label="Opened reminder">
                <p data-notification-result tabIndex={-1} role={notificationTarget.status === "error" ? "alert" : "status"}
                  className="text-base text-muted-readable">
                  {notificationTarget.status === "loading" ? "Opening reminder…"
                    : notificationTarget.status === "error" ? `Could not open this reminder. ${notificationTarget.message}`
                    : notificationTarget.status === "unavailable" ? "That reminder’s occurrence is no longer available in this local profile."
                    : <>Opened reminder for {notificationTarget.occurrence.title} on <time dateTime={notificationTarget.occurrence.localDate}>{notificationTarget.occurrence.localDate}</time>.</>}
                </p>
                {targetOccurrence && !targetInFeed ? <OccurrenceRow occurrence={targetOccurrence} {...actions} /> : null}
              </section>
            ) : null}
            <NeedsDecisionDialog
              title={timeline.needsDecision.title}
              occurrenceCount={timeline.needsDecision.occurrenceCount}
              hasRetainedRows={
                timeline.needsDecision.occurrenceCount === 0 &&
                timeline.needsDecision.daySections.length > 0
              }
            >
              {timeline.needsDecision.daySections.length === 0 ? (
                <p className="border-t border-line pt-4 text-base leading-7 text-muted-readable">
                  {timeline.needsDecision.emptyMessage}
                </p>
              ) : (
                <div className="grid gap-5">
                  {timeline.needsDecision.daySections.map((section) => (
                    <TimelineGroup
                      key={section.key}
                      section={section}
                      {...actions}
                      variant="needsDecisionDialog"
                    />
                  ))}
                </div>
              )}
            </NeedsDecisionDialog>
            <div className="grid gap-5">
              {timeline.daySections.map((section) => (
                <TimelineGroup
                  key={section.key}
                  section={section}
                  {...actions}
                />
              ))}
            </div>
            {nextFutureDays ? (
              <div className="border-t border-line pt-5">
                <button
                  type="button"
                  onClick={() => onShowMore(nextFutureDays)}
                  className="product-action product-action-primary min-h-11 gap-2 py-2 text-sm font-bold"
                >
                  <Plus aria-hidden="true" size={18} strokeWidth={2.5} />
                  <span>Show more days</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </RefreshProvider>
  );
}
