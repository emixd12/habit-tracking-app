import { NextResponse, type NextRequest } from "next/server";

import {
  ExportAuthError,
  getExportDownload,
  type ExportDownloadFormat,
} from "@/lib/services/export.service";

export async function exportDownloadResponse(
  request: NextRequest,
  format: ExportDownloadFormat,
) {
  try {
    const download = await getExportDownload(format, {
      range: request.nextUrl.searchParams.get("range"),
      includeArchived:
        request.nextUrl.searchParams.get("include_archived") === "1",
      includeNotes: request.nextUrl.searchParams.get("include_notes") === "1",
    });

    return new Response(download.content, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${download.fileName}"`,
        "content-type": download.contentType,
      },
    });
  } catch (error) {
    if (error instanceof ExportAuthError) {
      return jsonError(error.message, 401);
    }

    return jsonError("Unable to prepare export.", 500);
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    { status },
  );
}
