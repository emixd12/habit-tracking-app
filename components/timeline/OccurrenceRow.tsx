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
  const detailsId = `${occurrence.id}-details`;

  return (
    <article
      data-visual-tone={occurrence.visualTone}
      className={[
        "timeline-occurrence-row transition-colors",
        ROW_TONE_CLASSES[occurrence.visualTone],
      ].join(" ")}
    >
      <div className="timeline-occurrence-row-grid grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <details
          className="group min-w-0 sm:col-start-1 sm:col-end-3 sm:row-start-1"
          aria-controls={detailsId}
        >
          <summary className="grid min-h-12 cursor-pointer list-none grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-2 py-1 sm:min-h-0 sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:gap-1 sm:py-0 sm:pr-72 [&::-webkit-details-marker]:hidden">
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
        </details>

        {occurrence.showDecisionActions ? (
          <div className="timeline-occurrence-status border-t border-line pt-2 sm:z-10 sm:col-start-2 sm:row-start-1 sm:self-center sm:border-t-0 sm:pt-0">
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

        <div
          id={detailsId}
          className="timeline-occurrence-details mt-2 gap-4 border-t border-line pt-4 text-sm leading-6 text-muted-readable sm:col-start-1 sm:col-end-3 sm:mt-3 sm:py-2"
        >
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
