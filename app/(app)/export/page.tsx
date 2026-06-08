import type { Metadata } from "next";

import { ExportPanel } from "@/components/export/ExportPanel";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { getExportPageData } from "@/lib/services/export.service";

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
  const exportData = await getExportPageData({
    range: parseStringParam(params?.range),
    includeArchived: parseBooleanParam(params?.include_archived),
  });

  return (
    <ScreenFrame
      title="Export"
      description={`Local day boundary: ${exportData.timezone}.`}
    >
      <ExportPanel exportData={exportData} />
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
