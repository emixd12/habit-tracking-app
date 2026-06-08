import type { Metadata } from "next";

import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { Timeline } from "@/components/timeline/Timeline";
import { getTimelinePageData } from "@/lib/services/timeline.service";

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
  const timeline = await getTimelinePageData({
    futureDays: parseFutureDays(params?.days),
  });

  return (
    <ScreenFrame
      title="Timeline"
      description={`Current day starts at local midnight in ${timeline.timezone}.`}
    >
      <Timeline timeline={timeline} />
    </ScreenFrame>
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
