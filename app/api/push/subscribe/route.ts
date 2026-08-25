import { NextResponse, type NextRequest } from "next/server";

import {
  buildAuthFailureRateLimitKey,
  pushSubscribeAuthFailureLimiter,
} from "@/lib/security/auth-failure-rate-limits";
import {
  reportMonitoringError,
  reportMonitoringEvent,
} from "@/lib/monitoring/privacy-safe-events";
import type { RateLimitResult } from "@/lib/security/rate-limiter";
import {
  getCurrentUserPushSubscriptionStatus,
  parsePushSubscriptionRequest,
  parsePushSubscriptionStatusRequest,
  PushSubscriptionAuthError,
  PushSubscriptionRateLimitError,
  PushSubscriptionValidationError,
  registerPushSubscription,
} from "@/lib/services/push-subscription.service";

const RATE_LIMIT_SCOPE = "push-subscribe-auth";

export async function PUT(request: NextRequest) {
  const rateLimitKey = buildAuthFailureRateLimitKey(
    RATE_LIMIT_SCOPE,
    request.headers,
  );
  const rateLimit = pushSubscribeAuthFailureLimiter.check(rateLimitKey);

  if (!rateLimit.allowed) {
    reportMonitoringEvent({
      name: "push_subscription_status_auth_rate_limited",
      severity: "warning",
      context: routeContext(request),
    });
    return rateLimitError(rateLimit);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    reportMonitoringEvent({
      name: "push_subscription_status_invalid_json",
      severity: "warning",
      context: routeContext(request),
    });
    return jsonError("Subscription payload must be valid JSON.", 400);
  }

  try {
    const input = parsePushSubscriptionStatusRequest(body);
    const saved = await getCurrentUserPushSubscriptionStatus(input);

    pushSubscribeAuthFailureLimiter.reset(rateLimitKey);
    reportMonitoringEvent({
      name: "push_subscription_status_checked",
      context: routeContext(request),
    });

    return NextResponse.json({
      ok: true,
      saved,
    });
  } catch (error) {
    if (error instanceof PushSubscriptionValidationError) {
      reportMonitoringEvent({
        name: "push_subscription_status_validation_failed",
        severity: "warning",
        context: routeContext(request),
      });
      return jsonError(error.message, 400);
    }

    if (error instanceof PushSubscriptionAuthError) {
      const failureLimit =
        pushSubscribeAuthFailureLimiter.recordFailure(rateLimitKey);

      if (!failureLimit.allowed) {
        reportMonitoringEvent({
          name: "push_subscription_status_auth_rate_limited",
          severity: "warning",
          context: routeContext(request),
        });
        return rateLimitError(failureLimit);
      }

      reportMonitoringEvent({
        name: "push_subscription_status_unauthorized",
        severity: "warning",
        context: routeContext(request),
      });
      return jsonError(error.message, 401);
    }

    reportMonitoringError(
      "push_subscription_status_failed",
      error,
      routeContext(request),
    );
    return jsonError("Unable to verify browser reminder subscription.", 500);
  }
}

export async function POST(request: NextRequest) {
  const rateLimitKey = buildAuthFailureRateLimitKey(
    RATE_LIMIT_SCOPE,
    request.headers,
  );
  const rateLimit = pushSubscribeAuthFailureLimiter.check(rateLimitKey);

  if (!rateLimit.allowed) {
    reportMonitoringEvent({
      name: "push_subscribe_auth_rate_limited",
      severity: "warning",
      context: routeContext(request),
    });
    return rateLimitError(rateLimit);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    reportMonitoringEvent({
      name: "push_subscribe_invalid_json",
      severity: "warning",
      context: routeContext(request),
    });
    return jsonError("Subscription payload must be valid JSON.", 400);
  }

  try {
    const input = parsePushSubscriptionRequest(
      body,
      request.headers.get("user-agent"),
    );
    const subscription = await registerPushSubscription(input);

    reportMonitoringEvent({
      name: "push_subscribe_saved",
      context: routeContext(request),
    });

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    if (error instanceof PushSubscriptionRateLimitError) {
      reportMonitoringEvent({
        name: "push_subscribe_registration_rate_limited",
        severity: "warning",
        context: routeContext(request),
      });
      return registrationRateLimitError(error.result);
    }

    if (error instanceof PushSubscriptionValidationError) {
      reportMonitoringEvent({
        name: "push_subscribe_validation_failed",
        severity: "warning",
        context: routeContext(request),
      });
      return jsonError(error.message, 400);
    }

    if (error instanceof PushSubscriptionAuthError) {
      const failureLimit =
        pushSubscribeAuthFailureLimiter.recordFailure(rateLimitKey);

      if (!failureLimit.allowed) {
        reportMonitoringEvent({
          name: "push_subscribe_auth_rate_limited",
          severity: "warning",
          context: routeContext(request),
        });
        return rateLimitError(failureLimit);
      }

      reportMonitoringEvent({
        name: "push_subscribe_unauthorized",
        severity: "warning",
        context: routeContext(request),
      });
      return jsonError(error.message, 401);
    }

    reportMonitoringError("push_subscribe_failed", error, routeContext(request));
    return jsonError("Unable to save browser reminder subscription.", 500);
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

function rateLimitError(result: RateLimitResult) {
  return NextResponse.json(
    {
      ok: false,
      error: "Too many failed attempts. Try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}

function registrationRateLimitError(result: { retryAfterSeconds: number }) {
  return NextResponse.json(
    {
      ok: false,
      error: "Too many browser notification registration attempts. Try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}

function routeContext(request: NextRequest) {
  return {
    route: "/api/push/subscribe",
    method: request.method,
  };
}
