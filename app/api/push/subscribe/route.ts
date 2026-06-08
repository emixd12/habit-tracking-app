import { NextResponse, type NextRequest } from "next/server";

import {
  parsePushSubscriptionRequest,
  PushSubscriptionAuthError,
  PushSubscriptionValidationError,
  registerPushSubscription,
} from "@/lib/services/push-subscription.service";

export async function POST(request: NextRequest) {
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

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    if (error instanceof PushSubscriptionValidationError) {
      return jsonError(error.message, 400);
    }

    if (error instanceof PushSubscriptionAuthError) {
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
