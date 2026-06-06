import type { Metadata } from "next";
import { PlaceholderPanel, ScreenFrame } from "@/components/layout/ScreenFrame";

export const metadata: Metadata = {
  title: "Behaviors",
};

export default function BehaviorsPage() {
  return (
    <ScreenFrame title="Behaviors">
      <PlaceholderPanel title="Active behaviors">
        <p>No behaviors yet.</p>
        <button
          type="button"
          disabled
          className="mt-5 border-2 border-foreground bg-surface px-4 py-3 text-sm font-bold text-muted-readable"
        >
          Create behavior
        </button>
      </PlaceholderPanel>
    </ScreenFrame>
  );
}
