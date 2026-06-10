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
  default: "border-line bg-background text-foreground",
  needs_decision: "border-line bg-surface text-foreground",
  done: "border-line bg-primary text-primary-foreground",
  not_done: "border-line bg-background text-foreground",
};

const TIME_TONE_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "text-muted-readable",
  needs_decision: "text-foreground",
  done: "text-primary-foreground",
  not_done: "text-muted-readable",
};

const DETAIL_TONE_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "border-line bg-surface text-muted-readable",
  needs_decision: "border-line bg-background text-muted-readable",
  done: "border-line bg-background text-muted-readable",
  not_done: "border-line bg-surface text-muted-readable",
};

const RESOLVED_LABEL_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "text-muted-readable",
  needs_decision: "text-foreground",
  done: "text-primary-foreground",
  not_done: "text-muted-readable",
};

export function OccurrenceRow({
  occurrence,
  statusAction,
  noteAction,
}: OccurrenceRowProps) {
  return (
    <article
      className={[
        "border transition-colors",
        ROW_TONE_CLASSES[occurrence.visualTone],
      ].join(" ")}
    >
      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
        <details className="group min-w-0">
          <summary className="grid cursor-pointer list-none gap-1.5 sm:flex sm:items-center sm:gap-3 [&::-webkit-details-marker]:hidden">
            <time
              dateTime={occurrence.scheduledFor}
              className={[
                "shrink-0 text-xs font-bold leading-5 sm:text-sm",
                TIME_TONE_CLASSES[occurrence.visualTone],
              ].join(" ")}
            >
              {occurrence.scheduledTimeLabel}
            </time>

            <h3 className="min-w-0 break-words text-base font-bold leading-tight sm:truncate sm:text-lg">
              {occurrence.title}
            </h3>
          </summary>

          <div
            className={[
              "mt-4 grid gap-4 border-t p-4 text-sm leading-6",
              DETAIL_TONE_CLASSES[occurrence.visualTone],
            ].join(" ")}
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
        </details>

        {occurrence.showDecisionActions ? (
          <StatusButtons
            occurrenceId={occurrence.id}
            currentStatus={occurrence.status}
            action={statusAction}
          />
        ) : occurrence.showCollapsedStatusLabel ? (
          <p
            className={[
              "text-xs font-bold leading-5 sm:self-center sm:whitespace-nowrap sm:text-sm",
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
