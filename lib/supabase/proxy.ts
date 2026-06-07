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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (protectedRoute && !user) {
    return redirectWithSessionCookies(
      request,
      response,
      buildLoginPath(`${pathname}${search}`),
    );
  }

  if (pathname === LOGIN_ROUTE && user) {
    const nextPath = normalizeRedirectPath(
      request.nextUrl.searchParams.get("next"),
    );
    return redirectWithSessionCookies(request, response, nextPath);
  }

  if (pathname === "/") {
    return redirectWithSessionCookies(
      request,
      response,
      user ? DEFAULT_APP_ROUTE : LOGIN_ROUTE,
    );
  }

  return response;
}
