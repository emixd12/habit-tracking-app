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
  default: "border-foreground bg-background",
  needs_decision: "border-foreground bg-surface",
  done: "border-primary bg-background",
  not_done: "border-foreground bg-surface",
};

const STATUS_TONE_CLASSES: Record<TimelineOccurrenceView["visualTone"], string> = {
  default: "border-line bg-surface text-muted-readable",
  needs_decision: "border-foreground bg-background text-foreground",
  done: "border-primary bg-primary text-primary-foreground",
  not_done: "border-foreground bg-background text-foreground",
};

export function OccurrenceRow({
  occurrence,
  statusAction,
  noteAction,
}: OccurrenceRowProps) {
  return (
    <article
      className={[
        "border-2 transition-colors",
        ROW_TONE_CLASSES[occurrence.visualTone],
      ].join(" ")}
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5">
        <details className="group min-w-0">
          <summary className="grid cursor-pointer list-none gap-2 [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <time
                dateTime={occurrence.scheduledFor}
                className="border border-line bg-surface px-2 py-1 text-sm font-bold text-muted-readable"
              >
                {occurrence.scheduledTimeLabel}
              </time>
              <span
                className={[
                  "border px-2 py-1 text-xs font-bold",
                  STATUS_TONE_CLASSES[occurrence.visualTone],
                ].join(" ")}
              >
                {occurrence.statusLabel}
              </span>
            </div>

            <h3 className="break-words text-xl font-bold leading-tight">
              {occurrence.title}
            </h3>
          </summary>

          <div className="mt-5 grid gap-4 border-t border-line bg-surface p-4 text-sm leading-6 text-muted-readable">
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
        ) : (
          <p className="border-2 border-foreground bg-background px-3 py-2 text-sm font-bold leading-6 text-foreground sm:max-w-56">
            {occurrence.statusDetail}
          </p>
        )}
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
