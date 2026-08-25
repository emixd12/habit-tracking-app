import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import {
  hasActivePushSubscriptionForUser,
  upsertPushSubscription,
  type PushSubscriptionInput,
} from "@/lib/db/pushSubscriptions.repo";
import {
  consumePushSubscriptionRegistrationRateLimit,
  type LaunchRateLimitResult,
} from "@/lib/db/launchRateLimits.repo";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type { PushSubscription } from "@/lib/types/database";

export class PushSubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushSubscriptionValidationError";
  }
}

export class PushSubscriptionAuthError extends Error {
  constructor() {
    super("Sign in again before enabling browser reminders.");
    this.name = "PushSubscriptionAuthError";
  }
}

export class PushSubscriptionRateLimitError extends Error {
  readonly result: LaunchRateLimitResult;

  constructor(result: LaunchRateLimitResult) {
    super("Too many browser notification registration attempts. Try again later.");
    this.name = "PushSubscriptionRateLimitError";
    this.result = result;
  }
}

export type PushSubscriptionRequestInput = Omit<
  PushSubscriptionInput,
  "userId"
>;

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

export function parsePushSubscriptionRequest(
  value: unknown,
  userAgent: string | null,
): PushSubscriptionRequestInput {
  if (!isRecord(value)) {
    throw new PushSubscriptionValidationError("Subscription payload is invalid.");
  }

  if (!isRecord(value.keys)) {
    throw new PushSubscriptionValidationError("Subscription keys are invalid.");
  }

  return {
    endpoint: parseEndpoint(value.endpoint),
    p256dh: parseKey(value.keys.p256dh, "p256dh"),
    auth: parseKey(value.keys.auth, "auth"),
    userAgent: normalizeUserAgent(userAgent),
  };
}

export function parsePushSubscriptionStatusRequest(
  value: unknown,
): Pick<PushSubscriptionRequestInput, "endpoint" | "p256dh" | "auth"> {
  const input = parsePushSubscriptionRequest(value, null);

  return {
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
  };
}

export async function registerPushSubscription(
  input: PushSubscriptionRequestInput,
): Promise<PushSubscription> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const rateLimit = await consumePushSubscriptionRegistrationRateLimit(supabase);

  if (!rateLimit.allowed) {
    throw new PushSubscriptionRateLimitError(rateLimit);
  }

  return upsertPushSubscription(supabase, {
    userId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent,
  });
}

export async function getCurrentUserPushSubscriptionStatus(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<boolean> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  return hasActivePushSubscriptionForUser(supabase, {
    userId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
  });
}

async function requireUserId(supabase: AppSupabaseClient): Promise<string> {
  void supabase;

  try {
    return await requireCurrentUserId(
      "Sign in again before enabling browser reminders.",
    );
  } catch {
    throw new PushSubscriptionAuthError();
  }
}

function parseEndpoint(value: unknown): string {
  if (typeof value !== "string") {
    throw new PushSubscriptionValidationError("Subscription endpoint is invalid.");
  }

  const endpoint = value.trim();

  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new PushSubscriptionValidationError("Subscription endpoint is invalid.");
  }

  try {
    const url = new URL(endpoint);

    if (url.protocol !== "https:") {
      throw new PushSubscriptionValidationError(
        "Subscription endpoint must use HTTPS.",
      );
    }
  } catch (error) {
    if (error instanceof PushSubscriptionValidationError) {
      throw error;
    }

    throw new PushSubscriptionValidationError("Subscription endpoint is invalid.");
  }

  return endpoint;
}

function parseKey(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new PushSubscriptionValidationError(`Subscription ${label} key is invalid.`);
  }

  const key = value.trim();

  if (!key || key.length > MAX_KEY_LENGTH) {
    throw new PushSubscriptionValidationError(`Subscription ${label} key is invalid.`);
  }

  return key;
}

function normalizeUserAgent(value: string | null): string | null {
  const normalized = value?.trim();

  return normalized ? normalized.slice(0, 512) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
