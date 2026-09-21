import {
  rejectUnavailableAdvisorDayContextRequest,
} from "@/lib/services/advisor-auth.service";
import { ADVISOR_DAY_CONTEXT_VERSION } from "@cadence/core/types/advisor-day-context";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const rejection = rejectUnavailableAdvisorDayContextRequest(
    request.headers.get("authorization"),
  );

  return errorResponse(rejection.status, rejection.code);
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;

function methodNotAllowed() {
  return errorResponse(405, "write_not_supported", { Allow: "GET" });
}

function errorResponse(
  status: 401 | 403 | 405,
  code: "unauthenticated" | "access_denied" | "write_not_supported",
  headers: HeadersInit = {},
) {
  return Response.json(
    {
      version: ADVISOR_DAY_CONTEXT_VERSION,
      error: { code, retryable: false, retryAfterSeconds: null },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    },
  );
}
