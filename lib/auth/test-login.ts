import { randomUUID } from "node:crypto";

import { DEFAULT_APP_ROUTE } from "@/lib/navigation";
import { normalizeRedirectPath } from "@/lib/auth/redirects";

const ENABLED_VALUE = "1";
const HOSTED_ALLOWLIST_VALUE = "1";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_SUPABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TEST_EMAIL_DOMAIN = "example.invalid";
const PASSWORD_PREFIX = "CadenceTestLogin";
export const TEST_LOGIN_CREATION_QUOTA = 10;

let reservedTestLoginCreations = 0;

type TestLoginEnv = Record<string, string | undefined>;

export type TestLoginGateResult =
  | {
      allowed: true;
      nextPath: string;
    }
  | {
      allowed: false;
      reason:
        | "disabled"
        | "production"
        | "non_local_host"
        | "hosted_supabase_not_allowed";
      nextPath: string;
    };

export type TestLoginCredentials = {
  email: string;
  password: string;
};

export function reserveTestLoginCreation(): boolean {
  if (reservedTestLoginCreations >= TEST_LOGIN_CREATION_QUOTA) {
    return false;
  }

  reservedTestLoginCreations += 1;
  return true;
}

export function releaseTestLoginCreation(): void {
  reservedTestLoginCreations = Math.max(0, reservedTestLoginCreations - 1);
}

export function resetTestLoginCreationQuotaForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test-login quota reset is available only in tests.");
  }

  reservedTestLoginCreations = 0;
}

export function shouldShowTestLogin(env: TestLoginEnv = process.env): boolean {
  return env.CADENCE_ENABLE_TEST_LOGIN === ENABLED_VALUE && !isProduction(env);
}

export function resolveTestLoginGate(
  requestUrl: URL,
  env: TestLoginEnv = process.env,
): TestLoginGateResult {
  const nextPath = normalizeRedirectPath(
    requestUrl.searchParams.get("next"),
    DEFAULT_APP_ROUTE,
  );

  if (env.CADENCE_ENABLE_TEST_LOGIN !== ENABLED_VALUE) {
    return { allowed: false, reason: "disabled", nextPath };
  }

  if (isProduction(env)) {
    return { allowed: false, reason: "production", nextPath };
  }

  if (!isLocalRequestHost(requestUrl.hostname)) {
    return { allowed: false, reason: "non_local_host", nextPath };
  }

  if (
    usesHostedSupabase(env.NEXT_PUBLIC_SUPABASE_URL) &&
    env.CADENCE_ALLOW_HOSTED_TEST_LOGIN !== HOSTED_ALLOWLIST_VALUE
  ) {
    return {
      allowed: false,
      reason: "hosted_supabase_not_allowed",
      nextPath,
    };
  }

  return { allowed: true, nextPath };
}

export function createTestLoginCredentials(
  runId: string = randomUUID(),
): TestLoginCredentials {
  const safeRunId = runId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);

  return {
    email: `cadence-test-${safeRunId}@${TEST_EMAIL_DOMAIN}`.toLowerCase(),
    password: `${PASSWORD_PREFIX}-${safeRunId}-aA1!`,
  };
}

function isProduction(env: TestLoginEnv): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

function isLocalRequestHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

function usesHostedSupabase(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    return !LOCAL_SUPABASE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
