import type { Metadata } from "next";

import { ExportPanel } from "@/components/export/ExportPanel";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { getBehaviorLogImportPageData } from "@/lib/services/behaviorlog-import.service";
import { getBehaviorLogRestorePageData } from "@/lib/services/behaviorlog-restore.service";
import { getExportPageData } from "@/lib/services/export.service";
import { withPerformanceRoute } from "@/lib/services/performance-timing";

export const metadata: Metadata = {
  title: "Export",
};

export const dynamic = "force-dynamic";

type ExportPageProps = Readonly<{
  searchParams?: Promise<{
    range?: string | string[];
    include_archived?: string | string[];
  }>;
}>;

export default async function ExportPage({ searchParams }: ExportPageProps) {
  const params = await searchParams;
  const [exportData, importData, restoreData] = await withPerformanceRoute(
    "/export",
    "page.data_load",
    () =>
      Promise.all([
        getExportPageData({
          range: parseStringParam(params?.range),
          includeArchived: parseBooleanParam(params?.include_archived),
        }),
        getBehaviorLogImportPageData(),
        getBehaviorLogRestorePageData(),
      ]),
    {
      counts: ([bundle, importPageData, restorePageData]) => ({
        behaviors: bundle.behaviorCount,
        occurrences: bundle.occurrenceCount,
        import_runs: importPageData.recentRuns.length,
        restore_runs: restorePageData.recentRuns.length,
      }),
    },
  );

  return (
    <ScreenFrame
      title="Export"
      description={`Local day boundary: ${exportData.timezone}.`}
    >
      <ExportPanel
        exportData={exportData}
        importData={importData}
        restoreData={restoreData}
      />
    </ScreenFrame>
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
