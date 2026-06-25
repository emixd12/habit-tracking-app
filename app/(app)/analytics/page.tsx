import type { Metadata } from "next";

import { AnalyticsScreen } from "@/components/analytics/AnalyticsScreen";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { getAnalyticsPageData } from "@/lib/services/analytics.service";
import { withPerformanceRoute } from "@/lib/services/performance-timing";
import {
  markAnalyticsOccurrenceStatusAction,
  updateAnalyticsOccurrenceNoteAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Analytics",
};

export const dynamic = "force-dynamic";

type AnalyticsPageProps = Readonly<{
  searchParams?: Promise<{
    range?: string | string[];
    behavior?: string | string[];
    day?: string | string[];
  }>;
}>;

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const params = await searchParams;
  const analytics = await withPerformanceRoute(
    "/analytics",
    "page.data_load",
    () =>
      getAnalyticsPageData({
        rangeDays: parseNumberParam(params?.range),
        selectedBehaviorId: parseStringParam(params?.behavior),
        selectedDayLocalDate: parseStringParam(params?.day),
      }),
    {
      counts: (view) => ({
        range_days: view.rangeDays,
        behaviors: view.behaviorSummaries.length,
        selected_day_occurrences:
          view.selectedBehaviorDay?.occurrences.length ?? 0,
      }),
    },
  );

  return (
    <ScreenFrame title="Analytics">
      <AnalyticsScreen
        analytics={analytics}
        statusAction={markAnalyticsOccurrenceStatusAction}
        noteAction={updateAnalyticsOccurrenceNoteAction}
      />
    </ScreenFrame>
  );
}

function parseNumberParam(value: string | string[] | undefined): number | undefined {
  const rawValue = parseStringParam(value);

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function parseStringParam(value: string | string[] | undefined): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return rawValue || undefined;
}
