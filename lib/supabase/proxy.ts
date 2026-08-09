import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildLoginPath,
  LOGIN_ROUTE,
  MISSING_CONFIG_ERROR,
  normalizeRedirectPath,
} from "@/lib/auth/redirects";
import { DEFAULT_APP_ROUTE, isProtectedAppRoute } from "@/lib/navigation";
import { readSupabaseRuntimeConfig } from "@/lib/supabase/env";

type ClaimsAuthResult = {
  authenticated: boolean;
};

const LOGIN_PREVIEW_PARAM = "preview";
const LOGIN_PREVIEW_VALUE = "1";

function redirectWithSessionCookies(
  request: NextRequest,
  sessionResponse: NextResponse,
  path: string,
) {
  const redirectResponse = NextResponse.redirect(new URL(path, request.url));

  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  for (const header of ["Cache-Control", "Expires", "Pragma"]) {
    const value = sessionResponse.headers.get(header);
    if (value) {
      redirectResponse.headers.set(header, value);
    }
  }

  return redirectResponse;
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(
      ({ name }) => name.startsWith("sb-") && name.includes("auth-token"),
    );
}

function allowsAuthenticatedLoginPreview(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get(LOGIN_PREVIEW_PARAM) ===
    LOGIN_PREVIEW_VALUE
  );
}

async function measureProxyAuth<T>(
  request: NextRequest,
  span: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (process.env.CADENCE_PERF_LOG !== "1") {
    return operation();
  }

  const start = performance.now();
  const route = request.nextUrl.pathname;

  try {
    const result = await operation();

    console.info(
      JSON.stringify({
        source: "cadence",
        kind: "performance_timing",
        route,
        span,
        duration_ms: Math.round((performance.now() - start) * 10) / 10,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
    console.info(
      JSON.stringify({
        source: "cadence",
        kind: "performance_timing",
        route,
        span,
        duration_ms: Math.round((performance.now() - start) * 10) / 10,
        status: "error",
        error_name: error instanceof Error ? error.name : "UnknownError",
      }),
    );

    throw error;
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname, search } = request.nextUrl;
  const protectedRoute = isProtectedAppRoute(pathname);
  const config = readSupabaseRuntimeConfig();

  if (!config) {
    if (protectedRoute || pathname === "/") {
      return NextResponse.redirect(
        new URL(buildLoginPath(pathname, MISSING_CONFIG_ERROR), request.url),
      );
    }

    return response;
  }

  if (!hasSupabaseAuthCookie(request)) {
    if (protectedRoute) {
      return NextResponse.redirect(
        new URL(buildLoginPath(`${pathname}${search}`), request.url),
      );
    }

    if (pathname === "/") {
      return NextResponse.redirect(new URL(LOGIN_ROUTE, request.url));
    }

    return response;
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  const authResult = await measureProxyAuth<ClaimsAuthResult>(
    request,
    "proxy.auth.get_claims",
    async () => {
      const { data, error } = await supabase.auth.getClaims();
      const subject = data?.claims?.sub;

      return {
        authenticated: !error && typeof subject === "string" && subject.length > 0,
      };
    },
  );

  if (protectedRoute && !authResult.authenticated) {
    return redirectWithSessionCookies(
      request,
      response,
      buildLoginPath(`${pathname}${search}`),
    );
  }

  if (
    pathname === LOGIN_ROUTE &&
    authResult.authenticated &&
    !allowsAuthenticatedLoginPreview(request)
  ) {
    const nextPath = normalizeRedirectPath(
      request.nextUrl.searchParams.get("next"),
    );
    return redirectWithSessionCookies(request, response, nextPath);
  }

  if (pathname === "/") {
    return redirectWithSessionCookies(
      request,
      response,
      authResult.authenticated ? DEFAULT_APP_ROUTE : LOGIN_ROUTE,
    );
  }

  return response;
}
