import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";

export type AdvisorReadAdmission =
  | Readonly<{ allowed: true; leaseToken: string }>
  | Readonly<{ allowed: false; retryAfterSeconds: number }>;

export async function acquireAdvisorDayContextRead(
  client: AppSupabaseClient,
  clientId: string,
): Promise<AdvisorReadAdmission> {
  assertClientId(clientId);
  const { data, error } = await client.rpc("acquire_advisor_day_context_read", {
    p_client_id: clientId,
  });
  if (error) throw error;
  return parseAdmission(data);
}

export async function releaseAdvisorDayContextRead(
  client: AppSupabaseClient,
  clientId: string,
  leaseToken: string,
): Promise<boolean> {
  assertClientId(clientId);
  if (!UUID.test(leaseToken)) throw new TypeError("Advisor lease token is invalid.");
  const { data, error } = await client.rpc("release_advisor_day_context_read", {
    p_client_id: clientId,
    p_lease_token: leaseToken,
  });
  if (error) throw error;
  if (typeof data !== "boolean") throw new TypeError("Advisor lease release returned an invalid result.");
  return data;
}

const CLIENT_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;


function assertClientId(value: string) {
  if (!CLIENT_ID.test(value)) throw new TypeError("Advisor client is invalid.");
}

function parseAdmission(value: unknown): AdvisorReadAdmission {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new TypeError("Advisor read admission returned an invalid result.");
  }
  const row = value[0];
  const retryAfterSeconds = row.retry_after_seconds;
  if (typeof row.lease_token === "string" && UUID.test(row.lease_token) && row.retry_after_seconds === null) {
    return { allowed: true, leaseToken: row.lease_token };
  }
  if (
    row.lease_token === null
    && typeof retryAfterSeconds === "number"
    && Number.isInteger(retryAfterSeconds)
    && retryAfterSeconds >= 1
    && retryAfterSeconds <= 60
  ) {
    return { allowed: false, retryAfterSeconds };
  }
  throw new TypeError("Advisor read admission returned an invalid result.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
