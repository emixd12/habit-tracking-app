import { OccurrenceNoteForm } from "@/components/timeline/OccurrenceNoteForm";
import { StatusButtons } from "@/components/timeline/StatusButtons";
import type {
  OccurrenceFormAction,
  TimelineOccurrenceView,
} from "@/lib/types/timeline";

type OccurrenceRowProps = Readonly<{
  occurrence: TimelineOccurrenceView;
  statusAction: OccurrenceFormAction;
  noteAction: OccurrenceFormAction;
}>;

const ROW_TONE_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "bg-background text-foreground hover:bg-timeline-row-hover",
  needs_decision:
    "bg-surface text-foreground hover:bg-timeline-needs-decision-hover",
  completed: "bg-primary text-primary-foreground hover:bg-timeline-completed-hover",
  not_completed: "bg-background text-foreground hover:bg-timeline-row-hover",
};

const TIME_TONE_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "text-muted-readable",
  needs_decision: "text-foreground",
  completed: "text-primary-foreground",
  not_completed: "text-muted-readable",
};

const RESOLVED_LABEL_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "text-muted-readable",
  needs_decision: "text-foreground",
  completed: "text-primary-foreground",
  not_completed: "text-muted-readable",
};

export function OccurrenceRow({
  occurrence,
  statusAction,
  noteAction,
}: OccurrenceRowProps) {
  return (
    <article
      data-visual-tone={occurrence.visualTone}
      className={[
        "timeline-occurrence-row transition-colors",
        ROW_TONE_CLASSES[occurrence.visualTone],
      ].join(" ")}
    >
      <div className="timeline-occurrence-row-grid grid gap-2 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-3">
        <details className="group min-w-0 sm:col-start-1 sm:col-end-3 sm:row-start-1">
          <summary className="grid cursor-pointer list-none grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-1 sm:pr-72 [&::-webkit-details-marker]:hidden">
            <time
              dateTime={occurrence.scheduledFor}
              className={[
                "text-xs font-bold leading-5 sm:text-sm",
                TIME_TONE_CLASSES[occurrence.visualTone],
              ].join(" ")}
            >
              {occurrence.scheduledTimeLabel}
            </time>

            <h3 className="min-w-0 break-words text-base font-bold leading-tight sm:truncate sm:text-lg">
              {occurrence.title}
            </h3>
          </summary>

          <div className="timeline-occurrence-details mt-4 grid gap-4 py-2 text-sm leading-6 text-muted-readable">
            <DetailItem
              label="Description"
              value={occurrence.description || "No description."}
            />
            <DetailItem label="Category" value={occurrence.categoryName} />
            <DetailItem label="Schedule" value={occurrence.scheduleSummary} />

            {!occurrence.showDecisionActions ? (
              <div className="grid gap-2">
                <h4 className="font-bold text-foreground">
                  {occurrence.expandedStatusActionLabel}
                </h4>
                <StatusButtons
                  occurrenceId={occurrence.id}
                  currentStatus={occurrence.status}
                  action={statusAction}
                  compact
                />
              </div>
            ) : null}

            <OccurrenceNoteForm
              key={`${occurrence.id}-${occurrence.note}`}
              occurrenceId={occurrence.id}
              note={occurrence.note}
              action={noteAction}
            />
          </div>
        </details>

        {occurrence.showDecisionActions ? (
          <div className="timeline-occurrence-status sm:z-10 sm:col-start-2 sm:row-start-1 sm:self-center">
            <StatusButtons
              occurrenceId={occurrence.id}
              currentStatus={occurrence.status}
              action={statusAction}
            />
          </div>
        ) : occurrence.showCollapsedStatusLabel ? (
          <p
            className={[
              "timeline-occurrence-status text-xs font-bold leading-5 sm:z-10 sm:col-start-2 sm:row-start-1 sm:self-center sm:whitespace-nowrap sm:text-sm",
              RESOLVED_LABEL_CLASSES[occurrence.visualTone],
            ].join(" ")}
          >
            {occurrence.statusLabel}
          </p>
        ) : null}
      </div>
    </article>
  );
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
