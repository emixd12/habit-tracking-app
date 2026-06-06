import type { Metadata } from "next";
import { PlaceholderPanel, ScreenFrame } from "@/components/layout/ScreenFrame";

export const metadata: Metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return (
    <ScreenFrame title="Analytics">
      <div className="grid gap-5 md:grid-cols-2">
        <PlaceholderPanel title="Overall adherence">
          <p>No resolved occurrences yet.</p>
        </PlaceholderPanel>
        <PlaceholderPanel title="Last 30 days">
          <p>No occurrence history yet.</p>
        </PlaceholderPanel>
      </div>
    </ScreenFrame>
  );
}
