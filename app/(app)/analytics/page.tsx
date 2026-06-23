import type { Metadata } from "next";

import { AnalyticsScreen } from "@/components/analytics/AnalyticsScreen";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { getAnalyticsPageData } from "@/lib/services/analytics.service";
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
    day?: string | string[];
  }>;
}>;

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const params = await searchParams;
  const analytics = await getAnalyticsPageData({
    rangeDays: parseNumberParam(params?.range),
    selectedDayLocalDate: parseStringParam(params?.day),
  });

  return (
    <ScreenFrame
      title="Analytics"
      description={`Local day boundary: ${analytics.timezone}.`}
    >
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
