import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { processDueEmailReminders } from "@/lib/services/reminder.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return processReminderRequest(request);
}

export async function POST(request: NextRequest) {
  return processReminderRequest(request);
}

async function processReminderRequest(request: NextRequest) {
  const configuredSecrets = readConfiguredSecrets();

  if (configuredSecrets.length === 0) {
    return jsonError("Reminder processing is not configured.", 503);
  }

  const requestSecret = readRequestSecret(request);

  if (!configuredSecrets.some((secret) => secretMatches(requestSecret, secret))) {
    return jsonError("Unauthorized reminder processing request.", 401);
  }

  try {
    const result = await processDueEmailReminders({
      limit: parseLimit(request.nextUrl.searchParams.get("limit")),
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch {
    return jsonError("Unable to process reminders.", 500);
  }
}

function readConfiguredSecrets(): string[] {
  const secrets = [
    process.env.REMINDER_PROCESS_SECRET,
    process.env.CRON_SECRET,
  ].flatMap((value) => {
    const normalized = value?.trim();
    return normalized ? [normalized] : [];
  });

  return Array.from(new Set(secrets));
}

function readRequestSecret(request: NextRequest): string | null {
  const headerSecret = request.headers.get("x-reminder-process-secret")?.trim();

  if (headerSecret) {
    return headerSecret;
  }

  const authorization = request.headers.get("authorization")?.trim();
  const bearerPrefix = "Bearer ";

  if (authorization?.startsWith(bearerPrefix)) {
    return authorization.slice(bearerPrefix.length).trim();
  }

  return null;
}

function secretMatches(value: string | null, expected: string): boolean {
  if (!value) {
    return false;
  }

  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : undefined;
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
