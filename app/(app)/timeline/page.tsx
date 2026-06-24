import type { Metadata } from "next";
import Image from "next/image";

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
    <div className="flex w-full flex-col py-6 lg:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-10">
        <h1 className="sr-only">Timeline</h1>
        <FirstRunOnboardingPanel onboarding={onboarding} />
      </div>

      <div className="mb-8 w-full overflow-hidden border-y border-line bg-background">
        <Image
          src="/brand/cadence-timeline-banner.png"
          alt=""
          aria-hidden="true"
          width={2172}
          height={724}
          priority
          sizes="100vw"
          className="block h-auto w-full"
        />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-10">
        <Timeline
          timeline={timeline}
          statusAction={markOccurrenceStatusAction}
          noteAction={updateOccurrenceNoteAction}
        />
      </div>
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
