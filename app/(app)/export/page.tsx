import type { Metadata } from "next";
import { Suspense } from "react";

import { ExportPanel } from "@/components/export/ExportPanel";
import {
  ScreenContentLoading,
  ScreenFrame,
} from "@/components/layout/ScreenFrame";
import {
  createBehaviorLogImportPageDataFromRuns,
  listCurrentUserBehaviorLogImportRuns,
} from "@/lib/services/behaviorlog-import.service";
import { createBehaviorLogRestorePageDataFromRuns } from "@/lib/services/behaviorlog-restore.service";
import { getExportPageData } from "@/lib/services/export.service";
import { withPerformanceRoute } from "@/lib/services/performance-timing";

export const metadata: Metadata = {
  title: "Export & Import",
};

export const dynamic = "force-dynamic";

type ExportPageProps = Readonly<{
  searchParams?: Promise<{
    range?: string | string[];
    include_archived?: string | string[];
    include_notes?: string | string[];
    include_time_tracking?: string | string[];
  }>;
}>;

export default async function ExportPage({ searchParams }: ExportPageProps) {
  const params = await searchParams;
  const range = parseStringParam(params?.range);
  const includeArchived = parseBooleanParam(params?.include_archived);
  const includeNotes = parseBooleanParam(params?.include_notes);
  const includeTimeTracking = parseExactOneParam(params?.include_time_tracking);

  return (
    <ScreenFrame title="Export & Import">
      <Suspense fallback={<ScreenContentLoading label="Loading export data" />}>
        <ExportContent
          range={range}
          includeArchived={includeArchived}
          includeNotes={includeNotes}
          includeTimeTracking={includeTimeTracking}
        />
      </Suspense>
    </ScreenFrame>
  );
}

async function ExportContent({
  range,
  includeArchived,
  includeNotes,
  includeTimeTracking,
}: Readonly<{
  range?: string;
  includeArchived: boolean;
  includeNotes: boolean;
  includeTimeTracking: boolean;
}>) {
  const [exportData, recentBehaviorLogRuns] = await withPerformanceRoute(
    "/export",
    "page.data_load",
    () =>
      Promise.all([
        getExportPageData({
          range,
          includeArchived,
          includeNotes,
          includeTimeTracking,
        }),
        listCurrentUserBehaviorLogImportRuns(12),
      ]),
    {
      counts: ([bundle, recentRuns]) => ({
        behaviors: bundle.behaviorCount,
        occurrences: bundle.occurrenceCount,
        import_runs: recentRuns.filter(
          (run) =>
            run.import_mode !== "restore_preview" &&
            run.import_mode !== "restore_apply",
        ).length,
        restore_runs: recentRuns.filter(
          (run) =>
            run.import_mode === "restore_preview" ||
            run.import_mode === "restore_apply",
        ).length,
      }),
    },
  );
  const importData =
    createBehaviorLogImportPageDataFromRuns(recentBehaviorLogRuns);
  const restoreData =
    createBehaviorLogRestorePageDataFromRuns(recentBehaviorLogRuns);

  return (
    <ExportPanel
      exportData={exportData}
      importData={importData}
      restoreData={restoreData}
    />
  );
}

function parseStringParam(value: string | string[] | undefined): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return rawValue || undefined;
}

function parseBooleanParam(value: string | string[] | undefined): boolean {
  const rawValue = parseStringParam(value);

  return rawValue === "1" || rawValue === "true" || rawValue === "on";
}

function parseExactOneParam(value: string | string[] | undefined): boolean {
  return parseStringParam(value) === "1";
}
