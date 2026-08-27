import { NextResponse } from "next/server";

import { getPublicTrustEvidence } from "@/lib/services/public-trust-evidence.service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPublicTrustEvidence(), {
    headers: { "Cache-Control": "no-store" },
  });
}
