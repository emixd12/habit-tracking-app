import type { Metadata } from "next";
import Image from "next/image";

import { FirstRunOnboardingPanel } from "@/components/onboarding/FirstRunOnboardingPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { getTimelinePageBundle } from "@/lib/services/timeline.service";
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
  const { timeline, onboarding } = await getTimelinePageBundle({
    futureDays: parseFutureDays(params?.days),
  });

  return (
    <div className="flex w-full flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-10">
        <h1 className="sr-only">Timeline</h1>
        <FirstRunOnboardingPanel onboarding={onboarding} />
      </div>

      <div className="w-full overflow-hidden bg-background">
        <Image
          src="/brand/cadence-timeline-horse-lines-dots-clear-background.png"
          alt=""
          aria-hidden="true"
          width={2041}
          height={239}
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
