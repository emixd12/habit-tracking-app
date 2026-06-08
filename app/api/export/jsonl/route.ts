import type { NextRequest } from "next/server";

import { exportDownloadResponse } from "@/app/api/export/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return exportDownloadResponse(request, "jsonl");
}
