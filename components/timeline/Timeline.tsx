import Link from "next/link";
import { Plus } from "lucide-react";

import { TimelineGroup } from "@/components/timeline/TimelineGroup";
import type { OccurrenceFormAction, TimelineView } from "@/lib/types/timeline";

type TimelineProps = Readonly<{
  timeline: TimelineView;
  statusAction: OccurrenceFormAction;
  noteAction: OccurrenceFormAction;
}>;

export function Timeline({
  timeline,
  statusAction,
  noteAction,
}: TimelineProps) {
  return (
    <div className="grid gap-8">
      <section
        className="border-2 border-foreground bg-surface p-5 sm:p-6"
        aria-labelledby="needs-decision-title"
      >
        <div className="border-b-2 border-foreground pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-muted-readable">
                Prior unresolved
              </p>
              <h2
                id="needs-decision-title"
                className="text-2xl font-bold leading-tight"
              >
                {timeline.needsDecision.title}
              </h2>
            </div>
            <p className="text-sm font-bold text-muted-readable">
              {timeline.needsDecision.occurrenceCount} to decide
            </p>
          </div>
        </div>

        {timeline.needsDecision.daySections.length === 0 ? (
          <p className="mt-4 border-2 border-foreground bg-background p-4 text-base leading-7 text-muted-readable">
            {timeline.needsDecision.emptyMessage}
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {timeline.needsDecision.daySections.map((section) => (
              <TimelineGroup
                key={section.key}
                section={section}
                statusAction={statusAction}
                noteAction={noteAction}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5">
        {timeline.daySections.map((section) => (
          <TimelineGroup
            key={section.key}
            section={section}
            statusAction={statusAction}
            noteAction={noteAction}
          />
        ))}
      </div>

      {timeline.nextFutureDays ? (
        <div className="border-t-2 border-foreground pt-5">
          <Link
            href={`/timeline?days=${timeline.nextFutureDays}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 border-2 border-foreground bg-background px-5 py-3 text-sm font-bold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <Plus aria-hidden="true" size={18} strokeWidth={2.5} />
            <span>Show more days</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
