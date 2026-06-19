import type { Metadata } from "next";

import { FirstRunOnboardingPanel } from "@/components/onboarding/FirstRunOnboardingPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { getFirstRunOnboardingState } from "@/lib/services/onboarding.service";
import { getTimelinePageData } from "@/lib/services/timeline.service";
import {
  markOccurrenceStatusAction,
  updateOccurrenceNoteAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Timeline",
};

export const dynamic = "force-dynamic";

type TimelinePageProps = Readonly<{
  searchParams?: Promise<{
    days?: string | string[];
  }>;
}>;

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const params = await searchParams;
  const [timeline, onboarding] = await Promise.all([
    getTimelinePageData({
      futureDays: parseFutureDays(params?.days),
    }),
    getFirstRunOnboardingState(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <h1 className="sr-only">Timeline</h1>
      <FirstRunOnboardingPanel onboarding={onboarding} />
      <Timeline
        timeline={timeline}
        statusAction={markOccurrenceStatusAction}
        noteAction={updateOccurrenceNoteAction}
      />
    </div>
  );
}

function parseFutureDays(value: string | string[] | undefined): number | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
