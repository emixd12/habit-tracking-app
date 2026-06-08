import { NextResponse, type NextRequest } from "next/server";
import {
  buildLoginPath,
  MISSING_CONFIG_ERROR,
  normalizeRedirectPath,
} from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const callbackError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeRedirectPath(requestUrl.searchParams.get("next"));

  if (callbackError) {
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, "auth_callback_failed"), request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, "missing_auth_code"), request.url),
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(buildLoginPath(nextPath, "auth_callback_failed"), request.url),
      );
    }
  } catch {
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, MISSING_CONFIG_ERROR), request.url),
    );
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
