import { Check, X } from "lucide-react";

import type { TimelineOccurrenceView } from "@/lib/types/timeline";

type OccurrenceRowProps = Readonly<{
  occurrence: TimelineOccurrenceView;
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

export function OccurrenceRow({ occurrence }: OccurrenceRowProps) {
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

          <dl className="mt-5 grid gap-4 border-t border-line bg-surface p-4 text-sm leading-6 text-muted-readable">
            <DetailItem
              label="Description"
              value={occurrence.description || "No description."}
            />
            <DetailItem label="Category" value={occurrence.categoryName} />
            <DetailItem label="Schedule" value={occurrence.scheduleSummary} />
            <DetailItem label="Note" value={occurrence.note || "No note."} />
          </dl>
        </details>

        {occurrence.showDecisionActions ? (
          <div className="grid grid-cols-2 gap-2 sm:min-w-72">
            <DecisionButton label="Completed" kind="completed" />
            <DecisionButton label="Not Completed" kind="not_completed" />
          </div>
        ) : (
          <p className="border-2 border-foreground bg-background px-3 py-2 text-sm font-bold leading-6 text-foreground sm:max-w-56">
            {occurrence.statusDetail}
          </p>
        )}
      </div>
    </article>
  );
}

function DecisionButton({
  label,
  kind,
}: Readonly<{
  label: string;
  kind: "completed" | "not_completed";
}>) {
  const Icon = kind === "completed" ? Check : X;
  const className =
    kind === "completed"
      ? "bg-primary text-primary-foreground hover:bg-foreground"
      : "bg-background text-foreground hover:bg-surface";

  return (
    <button
      type="button"
      disabled
      className={[
        "inline-flex min-h-11 items-center justify-center gap-2 border-2 border-foreground px-3 py-2 text-sm font-bold transition-colors disabled:opacity-70",
        className,
      ].join(" ")}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={2.5} />
      <span>{label}</span>
    </button>
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
      <dt className="font-bold text-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
