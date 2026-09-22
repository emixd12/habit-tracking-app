const STS_URL = "https://sts.googleapis.com/v1/token";
const IAM_CREDENTIALS_ORIGIN = "https://iamcredentials.googleapis.com";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GEOCODE_ADDRESS_SCOPE = "https://www.googleapis.com/auth/maps-platform.geocode.address";
const MAX_AUTH_RESPONSE_BYTES = 16_384;
const MAX_ACCESS_TOKEN_LENGTH = 8_192;
const ACCESS_TOKEN_LIFETIME_SECONDS = 900;
const MAX_CACHE_LIFETIME_MS = 10 * 60 * 1_000;
const REFRESH_SKEW_MS = 60 * 1_000;

export const GOOGLE_AUTH_TIMEOUT_MS = 5_000;

export type GoogleWorkloadIdentityConfig = Readonly<{
  projectId: string;
  provider: string;
  serviceAccountEmail: string;
  subjectToken: string;
  expectedIssuer: string;
  expectedAudience: string;
  expectedSubject: string;
  expectedOwnerId: string;
  expectedProjectId: string;
  expectedEnvironment: string;
}>;

type CachedToken = Readonly<{ token: string; refreshAt: number }>;
type CacheEntry = Readonly<{ token?: CachedToken; pending?: Promise<CachedToken> }>;

const tokenCache = new WeakMap<GoogleWorkloadIdentityConfig, CacheEntry>();

export class GoogleWorkloadIdentityError extends Error {
  constructor(public readonly kind: "misconfigured" | "unavailable") {
    super(`google_workload_identity_${kind}`);
    this.name = "GoogleWorkloadIdentityError";
  }
}

export async function getGoogleWorkloadIdentityAccessToken(
  config: GoogleWorkloadIdentityConfig,
  options: Readonly<{ fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number }> = {},
): Promise<string> {
  validateConfig(config);
  validateSubjectToken(config, Date.now());
  const cached = tokenCache.get(config)?.token;
  if (cached && cached.refreshAt > Date.now()) return cached.token;
  const pending = tokenCache.get(config)?.pending ?? exchangeToken(config, options);
  tokenCache.set(config, { pending });
  try {
    const token = await pending;
    tokenCache.set(config, { token });
    return token.token;
  } catch (error) {
    tokenCache.delete(config);
    if (error instanceof GoogleWorkloadIdentityError) throw error;
    throw new GoogleWorkloadIdentityError("unavailable");
  }
}

async function exchangeToken(
  config: GoogleWorkloadIdentityConfig,
  options: Readonly<{ fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number }>,
): Promise<CachedToken> {
  const fetcher = options.fetch ?? fetch;
  const deadline = AbortSignal.timeout(options.timeoutMs ?? GOOGLE_AUTH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const stsBody = new URLSearchParams({
    audience: config.provider,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    scope: CLOUD_PLATFORM_SCOPE,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    subject_token: config.subjectToken,
  });
  const sts = await fetchAuthJson(fetcher, STS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: stsBody.toString(),
    signal,
  });
  const federatedToken = tokenString(sts.access_token);
  if (sts.token_type !== "Bearer" || !federatedToken) throw new GoogleWorkloadIdentityError("unavailable");

  const serviceAccount = encodeURIComponent(config.serviceAccountEmail);
  const impersonated = await fetchAuthJson(
    fetcher,
    `${IAM_CREDENTIALS_ORIGIN}/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${federatedToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: [CLOUD_PLATFORM_SCOPE, GEOCODE_ADDRESS_SCOPE],
        lifetime: `${ACCESS_TOKEN_LIFETIME_SECONDS}s`,
      }),
      signal,
    },
  );
  const accessToken = tokenString(impersonated.accessToken);
  const expiresAt = typeof impersonated.expireTime === "string" ? Date.parse(impersonated.expireTime) : Number.NaN;
  if (!accessToken || !Number.isFinite(expiresAt)) throw new GoogleWorkloadIdentityError("unavailable");
  const refreshAt = Math.min(Date.now() + MAX_CACHE_LIFETIME_MS, expiresAt - REFRESH_SKEW_MS);
  if (refreshAt <= Date.now()) throw new GoogleWorkloadIdentityError("unavailable");
  return { token: accessToken, refreshAt };
}

async function fetchAuthJson(fetcher: typeof fetch, input: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(input, { ...init, cache: "no-store", redirect: "error" });
  } catch {
    throw new GoogleWorkloadIdentityError("unavailable");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new GoogleWorkloadIdentityError("unavailable");
  }
  const value = await readLimitedJson(response, init.signal);
  if (!record(value)) throw new GoogleWorkloadIdentityError("unavailable");
  return value;
}

async function readLimitedJson(response: Response, signal: AbortSignal | null | undefined): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_AUTH_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new GoogleWorkloadIdentityError("unavailable");
  }
  if (!response.body) throw new GoogleWorkloadIdentityError("unavailable");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel(); };
  signal?.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_AUTH_RESPONSE_BYTES) {
        await reader.cancel();
        throw new GoogleWorkloadIdentityError("unavailable");
      }
      chunks.push(next.value);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new GoogleWorkloadIdentityError("unavailable");
  }
}

function validateConfig(config: GoogleWorkloadIdentityConfig): void {
  const providerPattern = /^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/;
  const serviceAccountPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/;
  const projectPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  if (
    !providerPattern.test(config.provider)
    || !serviceAccountPattern.test(config.serviceAccountEmail)
    || !projectPattern.test(config.projectId)
    || !config.expectedIssuer.startsWith("https://oidc.vercel.com/")
    || !config.expectedAudience.startsWith("https://vercel.com/")
    || !config.expectedSubject
    || !config.expectedOwnerId
    || !config.expectedProjectId
    || config.expectedEnvironment !== "production"
  ) throw new GoogleWorkloadIdentityError("misconfigured");
}

function validateSubjectToken(config: GoogleWorkloadIdentityConfig, nowMs: number): void {
  const segments = config.subjectToken.split(".");
  if (segments.length !== 3 || segments[1]!.length > 12_000) throw new GoogleWorkloadIdentityError("misconfigured");
  let claims: Record<string, unknown>;
  try {
    const value = JSON.parse(Buffer.from(segments[1]!, "base64url").toString("utf8")) as unknown;
    if (!record(value)) throw new Error("invalid claims");
    claims = value;
  } catch {
    throw new GoogleWorkloadIdentityError("misconfigured");
  }
  const nowSeconds = Math.floor(nowMs / 1_000);
  if (
    claims.iss !== config.expectedIssuer
    || claims.aud !== config.expectedAudience
    || claims.sub !== config.expectedSubject
    || claims.owner_id !== config.expectedOwnerId
    || claims.project_id !== config.expectedProjectId
    || claims.environment !== config.expectedEnvironment
    || typeof claims.iat !== "number"
    || typeof claims.nbf !== "number"
    || typeof claims.exp !== "number"
    || claims.iat > nowSeconds + 30
    || claims.nbf > nowSeconds + 30
    || claims.exp <= nowSeconds + 60
  ) throw new GoogleWorkloadIdentityError("misconfigured");
}

function tokenString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ACCESS_TOKEN_LENGTH ? value : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
