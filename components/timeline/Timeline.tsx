import Link from "next/link";
import { Plus } from "lucide-react";

import { NeedsDecisionDialog } from "@/components/timeline/NeedsDecisionDialog";
import { TimelineGroup } from "@/components/timeline/TimelineGroup";
import type {
  OccurrenceFormAction,
  TimeTrackingFormAction,
  TimelineView,
} from "@/lib/types/timeline";

type TimelineProps = Readonly<{
  timeline: TimelineView;
  statusAction: OccurrenceFormAction;
  noteAction: OccurrenceFormAction;
  startTimeTrackingAction: TimeTrackingFormAction;
  stopTimeTrackingAction: TimeTrackingFormAction;
  resetTimeTrackingAction: TimeTrackingFormAction;
}>;

export function Timeline({
  timeline,
  statusAction,
  noteAction,
  startTimeTrackingAction,
  stopTimeTrackingAction,
  resetTimeTrackingAction,
}: TimelineProps) {
  return (
    <div className="grid gap-8 pb-32 sm:pb-24">
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
                statusAction={statusAction}
                noteAction={noteAction}
                startTimeTrackingAction={startTimeTrackingAction}
                stopTimeTrackingAction={stopTimeTrackingAction}
                resetTimeTrackingAction={resetTimeTrackingAction}
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
            statusAction={statusAction}
            noteAction={noteAction}
            startTimeTrackingAction={startTimeTrackingAction}
            stopTimeTrackingAction={stopTimeTrackingAction}
            resetTimeTrackingAction={resetTimeTrackingAction}
          />
        ))}
      </div>

      {timeline.nextFutureDays ? (
        <div className="border-t border-line pt-5">
          <Link
            href={`/timeline?days=${timeline.nextFutureDays}`}
            scroll={false}
            className="product-action product-action-primary min-h-11 gap-2 py-2 text-sm font-bold"
          >
            <Plus aria-hidden="true" size={18} strokeWidth={2.5} />
            <span>Show more days</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
