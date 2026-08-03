import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/timeline/:path*",
    "/behaviors/:path*",
    "/analytics/:path*",
    "/export/:path*",
    "/api/export/:path*",
    "/settings/:path*",
  ],
};
