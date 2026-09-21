"use client";

import type { DailyBriefClient } from "@/lib/ui/daily-brief";
import { DailyBriefBubble } from "@/components/briefing/DailyBriefBubble";
import { DailyBriefSettingsPanel } from "@/components/briefing/DailyBriefSettingsPanel";

const client: DailyBriefClient = {
  preferences: async () => ({ accountRef: "bench-account", available: true, enabled: true, includeCalendar: false, revision: 1, localDate: "2026-09-20", timezone: "America/New_York" }),
  updatePreferences: async (input) => ({ accountRef: "bench-account", available: true, revision: 2, localDate: "2026-09-20", timezone: "America/New_York", ...input }),
  requestBrief: async () => ({ state: "already_attempted" }),
};

export function DailyBriefBubbleBench() {
  return <div className="bg-background"><div className="aspect-[1423/367] w-full overflow-hidden bg-background sm:aspect-[2041/239]"><picture className="block h-full w-full"><source media="(max-width: 639px)" srcSet="/brand/cadence-timeline-horse-lines-dots-mobile-right-18.png" /><img src="/brand/cadence-timeline-horse-lines-dots-clear-background.png" width={2041} height={239} alt="" aria-hidden="true" className="block h-full w-full object-fill" /></picture></div><div className="relative mx-auto w-full max-w-6xl px-3 sm:px-6 lg:px-10"><DailyBriefBubble state="ready" onDismiss={() => undefined} briefing={{
    text: `Start with water before your first meeting. Calendar timing is incomplete. ${"schedule".repeat(260)}`, localDate: "2026-09-20", timezone: "America/New_York",
    generatedAt: "2026-09-20T12:00:00Z", expiresAt: "2999-09-20T16:00:00Z", coverage: "partial", warnings: ["Calendar timing is unavailable."],
  }} /></div><div className="mx-auto max-w-6xl px-3 py-8 sm:px-6 lg:px-10"><button type="button" className="product-action product-action-primary min-h-11 py-2 text-sm">Completed</button><button type="button" className="product-action product-action-secondary ml-3 min-h-11 py-2 text-sm">Not Completed</button></div></div>;
}

export function DailyBriefSettingsBench() {
  return <DailyBriefSettingsPanel client={client} />;
}
