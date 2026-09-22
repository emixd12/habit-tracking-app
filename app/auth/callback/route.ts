import { NextResponse, type NextRequest } from "next/server";
import {
  authRequestUrl,
  buildLoginPath,
  MISSING_CONFIG_ERROR,
  normalizeRedirectPath,
} from "@/lib/auth/redirects";
import {
  reportMonitoringError,
  reportMonitoringEvent,
} from "@/lib/monitoring/privacy-safe-events";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = authRequestUrl(request);
  const callbackError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeRedirectPath(requestUrl.searchParams.get("next"));

  if (callbackError) {
    reportMonitoringEvent({
      name: "auth_callback_provider_error",
      severity: "warning",
      context: routeContext(),
    });
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, "auth_callback_failed"), requestUrl),
    );
  }

  if (!code) {
    reportMonitoringEvent({
      name: "auth_callback_missing_code",
      severity: "warning",
      context: routeContext(),
    });
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, "missing_auth_code"), requestUrl),
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      reportMonitoringEvent({
        name: "auth_callback_exchange_failed",
        severity: "warning",
        context: routeContext(),
      });
      return NextResponse.redirect(
        new URL(buildLoginPath(nextPath, "auth_callback_failed"), requestUrl),
      );
    }
  } catch (error) {
    reportMonitoringError("auth_callback_config_failed", error, routeContext());
    return NextResponse.redirect(
      new URL(buildLoginPath(nextPath, MISSING_CONFIG_ERROR), requestUrl),
    );
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl));
}

function routeContext() {
  return {
    route: "/auth/callback",
    method: "GET",
  };
}
