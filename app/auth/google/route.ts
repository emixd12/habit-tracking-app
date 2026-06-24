import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_CALLBACK_ROUTE,
  buildLoginPath,
  MISSING_CONFIG_ERROR,
  normalizeRedirectPath,
} from "@/lib/auth/redirects";
import { DEFAULT_APP_ROUTE } from "@/lib/navigation";
import { readSupabaseRuntimeConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nextPath = normalizeRedirectPath(
    request.nextUrl.searchParams.get("next"),
    DEFAULT_APP_ROUTE,
  );

  if (!readSupabaseRuntimeConfig()) {
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, MISSING_CONFIG_ERROR), request.url),
    );
  }

  const redirectTo = new URL(AUTH_CALLBACK_ROUTE, request.nextUrl.origin);
  redirectTo.searchParams.set("next", nextPath);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, "oauth_start_failed"), request.url),
    );
  }

  return NextResponse.redirect(data.url);
}
