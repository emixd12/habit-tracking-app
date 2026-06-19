import { NextResponse, type NextRequest } from "next/server";

import {
  buildAuthFailureRateLimitKey,
  pushSubscribeAuthFailureLimiter,
} from "@/lib/security/auth-failure-rate-limits";
import type { RateLimitResult } from "@/lib/security/rate-limiter";
import {
  parsePushSubscriptionRequest,
  PushSubscriptionAuthError,
  PushSubscriptionValidationError,
  registerPushSubscription,
} from "@/lib/services/push-subscription.service";

const RATE_LIMIT_SCOPE = "push-subscribe-auth";

export async function POST(request: NextRequest) {
  const rateLimitKey = buildAuthFailureRateLimitKey(
    RATE_LIMIT_SCOPE,
    request.headers,
  );
  const rateLimit = pushSubscribeAuthFailureLimiter.check(rateLimitKey);

  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Subscription payload must be valid JSON.", 400);
  }

  try {
    const input = parsePushSubscriptionRequest(
      body,
      request.headers.get("user-agent"),
    );
    const subscription = await registerPushSubscription(input);

    pushSubscribeAuthFailureLimiter.reset(rateLimitKey);

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    if (error instanceof PushSubscriptionValidationError) {
      return jsonError(error.message, 400);
    }

    if (error instanceof PushSubscriptionAuthError) {
      const failureLimit =
        pushSubscribeAuthFailureLimiter.recordFailure(rateLimitKey);

      if (!failureLimit.allowed) {
        return rateLimitError(failureLimit);
      }

      return jsonError(error.message, 401);
    }

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
