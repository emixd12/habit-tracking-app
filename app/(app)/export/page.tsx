import type { Metadata } from "next";
import { PlaceholderPanel, ScreenFrame } from "@/components/layout/ScreenFrame";

export const metadata: Metadata = {
  title: "Export",
};

const exportActions = [
  "Export JSONL",
  "Export CSV",
  "Export full JSON backup",
  "Copy AI summary",
  "Download AI summary",
];

export default function ExportPage() {
  return (
    <ScreenFrame title="Export">
      <PlaceholderPanel title="Formats">
        <div className="flex flex-wrap gap-3">
          {exportActions.map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="border-2 border-foreground bg-surface px-4 py-3 text-sm font-bold text-muted-readable"
            >
              {label}
            </button>
          ))}
        </div>
      </PlaceholderPanel>
    </ScreenFrame>
  );
}
