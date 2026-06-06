import type { Metadata } from "next";
import { PlaceholderPanel, ScreenFrame } from "@/components/layout/ScreenFrame";

export const metadata: Metadata = {
  title: "Timeline",
};

export default function TimelinePage() {
  return (
    <ScreenFrame title="Timeline">
      <div className="grid gap-5">
        <PlaceholderPanel title="Needs decision">
          <p>No prior unresolved occurrences.</p>
        </PlaceholderPanel>

        <PlaceholderPanel title="Current day">
          <p>No behaviors on this day.</p>
        </PlaceholderPanel>

        <PlaceholderPanel title="Next 7 days">
          <p>No scheduled future occurrences.</p>
          <button
            type="button"
            disabled
            className="mt-5 border-2 border-foreground bg-surface px-4 py-3 text-sm font-bold text-muted-readable"
          >
            Show more days
          </button>
        </PlaceholderPanel>
      </div>
    </ScreenFrame>
  );
}
