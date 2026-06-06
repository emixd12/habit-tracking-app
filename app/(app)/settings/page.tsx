import type { Metadata } from "next";
import { PlaceholderPanel, ScreenFrame } from "@/components/layout/ScreenFrame";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <ScreenFrame title="Settings">
      <div className="grid gap-5 md:grid-cols-2">
        <PlaceholderPanel title="Timezone">
          <p>America/New_York</p>
        </PlaceholderPanel>
        <PlaceholderPanel title="Notifications">
          <p>Browser notification permission is not configured.</p>
          <button
            type="button"
            disabled
            className="mt-5 border-2 border-foreground bg-surface px-4 py-3 text-sm font-bold text-muted-readable"
          >
            Request permission
          </button>
        </PlaceholderPanel>
      </div>
    </ScreenFrame>
  );
}
