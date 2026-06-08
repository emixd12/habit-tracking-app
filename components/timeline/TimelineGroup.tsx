import type { TimelineDaySection } from "@/lib/types/timeline";
import { OccurrenceRow } from "@/components/timeline/OccurrenceRow";

type TimelineGroupProps = Readonly<{
  section: TimelineDaySection;
}>;

const SECTION_CLASSES: Record<TimelineDaySection["kind"], string> = {
  today: "border-foreground bg-background p-5 sm:p-6",
  future: "border-line bg-background p-5 sm:p-6",
  needs_decision_day: "border-foreground bg-surface p-4 sm:p-5",
};

export function TimelineGroup({ section }: TimelineGroupProps) {
  const isEmpty = section.occurrences.length === 0;

  return (
    <section
      className={["border-2", SECTION_CLASSES[section.kind]].join(" ")}
      aria-labelledby={`${section.key}-title`}
    >
      <div className="flex flex-col gap-2 border-b-2 border-foreground pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-muted-readable">
            {section.relativeLabel}
          </p>
          <h2
            id={`${section.key}-title`}
            className={[
              "font-bold leading-tight",
              section.kind === "today" ? "text-3xl" : "text-2xl",
            ].join(" ")}
          >
            {section.label}
          </h2>
        </div>

        <time
          dateTime={section.localDate}
          className="text-sm font-bold text-muted-readable"
        >
          {section.localDate}
        </time>
      </div>

      {isEmpty ? (
        <p className="mt-4 border-2 border-foreground bg-surface p-4 text-base leading-7 text-muted-readable">
          {section.emptyMessage}
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {section.occurrences.map((occurrence) => (
            <OccurrenceRow key={occurrence.id} occurrence={occurrence} />
          ))}
        </div>
      )}
    </section>
  );
}
