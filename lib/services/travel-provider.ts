import { Temporal } from "@js-temporal/polyfill";

import type {
  TravelMode,
  TravelPoint,
  TravelRouteEstimate,
  TravelRouteRequest,
} from "@cadence/core/types/travel";
import {
  getGoogleWorkloadIdentityAccessToken,
  GoogleWorkloadIdentityError,
  type GoogleWorkloadIdentityConfig,
} from "@/lib/services/travel-google-auth";
import { runProviderCallWithTimeout } from "@/lib/services/provider-call-timeout";

const GOOGLE_GEOCODE_V3_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_GEOCODE_V4_ORIGIN = "https://geocode.googleapis.com";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GEOCODE_V4_FIELD_MASK = "results.placeId,results.granularity,results.types";
const ROUTES_FIELD_MASK = [
  "routes.duration",
  "routes.staticDuration",
  "routes.warnings",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.transitDetails.stopDetails.arrivalTime",
  "routes.legs.steps.transitDetails.stopDetails.departureTime",
  "fallbackInfo",
].join(",");
const MAX_GEOCODE_CANDIDATES = 5;
const MAX_RETRIES = 1;
export const TRAVEL_PROVIDER_TIMEOUT_MS = 5_000;

export type TravelProviderConfig = Readonly<{
  cleared: boolean;
  apiKey: string | null;
  authMode?: "api_key" | "workload_identity" | "invalid";
  workloadIdentity?: GoogleWorkloadIdentityConfig | null;
}>;

export type GoogleGeocodeResult =
  | Readonly<{ kind: "resolved"; point: TravelPoint }>
  | Readonly<{ kind: "ambiguous" }>
  | Readonly<{ kind: "unresolved" }>;

export class TravelProviderError extends Error {
  constructor(
    public readonly code: "provider_clearance_required" | "not_configured" | "timeout" | "provider_unavailable" | "malformed_provider_response",
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "TravelProviderError";
  }
}

/** Server-only configuration. The operator must set the explicit clearance value during an authorized rollout. */
export function readTravelProviderConfig(
  env: Record<string, string | undefined> = process.env,
  vercelOidcToken: string | null = null,
): TravelProviderConfig {
  const cleared = env.CADENCE_TRAVEL_PROVIDER_CLEARANCE === "approved";
  const apiKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || null;
  const requestedMode = env.CADENCE_TRAVEL_GOOGLE_AUTH_MODE?.trim() || "api_key";
  const authMode = requestedMode === "api_key" || requestedMode === "workload_identity" ? requestedMode : "invalid";
  const values = [
    env.GOOGLE_CLOUD_PROJECT_ID,
    env.GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER,
    env.GOOGLE_CLOUD_TRAVEL_SERVICE_ACCOUNT_EMAIL,
    vercelOidcToken,
    env.CADENCE_TRAVEL_VERCEL_OIDC_ISSUER,
    env.CADENCE_TRAVEL_VERCEL_OIDC_AUDIENCE,
    env.CADENCE_TRAVEL_VERCEL_OIDC_SUBJECT,
    env.CADENCE_TRAVEL_VERCEL_OIDC_OWNER_ID,
    env.CADENCE_TRAVEL_VERCEL_OIDC_PROJECT_ID,
    env.CADENCE_TRAVEL_VERCEL_OIDC_ENVIRONMENT,
  ].map((value) => value?.trim() || null);
  const workloadIdentity = values.every((value): value is string => value !== null) ? {
    projectId: values[0]!, provider: values[1]!, serviceAccountEmail: values[2]!, subjectToken: values[3]!,
    expectedIssuer: values[4]!, expectedAudience: values[5]!, expectedSubject: values[6]!,
    expectedOwnerId: values[7]!, expectedProjectId: values[8]!, expectedEnvironment: values[9]!,
  } : null;
  return { cleared, apiKey, authMode, workloadIdentity };
}

export function assertTravelProviderReady(config: TravelProviderConfig): void {
  if (!config.cleared) throw new TravelProviderError("provider_clearance_required", false);
  if (config.authMode === "workload_identity") {
    if (!config.workloadIdentity) throw new TravelProviderError("not_configured", false);
    return;
  }
  if (config.authMode === "invalid" || !config.apiKey) throw new TravelProviderError("not_configured", false);
}

export async function geocodeGoogleAddress(
  address: string,
  options: Readonly<{
    config: TravelProviderConfig;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxRetries?: number;
  }>,
): Promise<GoogleGeocodeResult> {
  assertTravelProviderReady(options.config);
  if (!address.trim() || address.length > 512) return { kind: "unresolved" };
  const hosted = options.config.authMode === "workload_identity";
  const accessToken = hosted ? await workloadAccessToken(options.config, options) : null;
  const url = hosted
    ? new URL(`/v4/geocode/address/${encodeURIComponent(address)}`, GOOGLE_GEOCODE_V4_ORIGIN)
    : new URL(GOOGLE_GEOCODE_V3_URL);
  if (!hosted) {
    url.searchParams.set("address", address);
    url.searchParams.set("key", options.config.apiKey!);
  }
  const body = await requestJson(url, {
    fetch: options.fetch, signal: options.signal, timeoutMs: options.timeoutMs, maxRetries: options.maxRetries,
    ...(hosted ? { init: { headers: workloadHeaders(options.config, accessToken!, GEOCODE_V4_FIELD_MASK) } } : {}),
  });
  const results = objectArray(body.results);
  if (!hosted && body.status === "ZERO_RESULTS") return { kind: "unresolved" };
  if (!hosted && body.status !== "OK") throw new TravelProviderError("provider_unavailable", true);
  if (results.length === 0) return { kind: "unresolved" };
  // A locality, postal code, or broad feature is not a safe travel endpoint.
  // Do not choose among multiple or provider-overflowed candidates.
  if (results.length > MAX_GEOCODE_CANDIDATES) return { kind: "ambiguous" };
  const candidates = results.flatMap((result) => {
    const geometry = record(result.geometry) ? result.geometry : null;
    const granularity = hosted ? result.granularity : geometry?.location_type;
    const preciseLocation = granularity === "ROOFTOP" || granularity === "RANGE_INTERPOLATED";
    const preciseType = stringArray(result.types, 8, 80).some((type) =>
      type === "street_address" || type === "premise" || type === "subpremise",
    );
    const placeId = hosted ? result.placeId : result.place_id;
    if ((!hosted && result.partial_match === true) || !preciseLocation || !preciseType || typeof placeId !== "string" || !placeId) return [];
    return [{ kind: "place_id" as const, placeId }];
  });
  return candidates.length === 1 && results.length === 1
    ? { kind: "resolved", point: candidates[0]! }
    : { kind: "ambiguous" };
}

export async function computeGoogleRoute(
  request: TravelRouteRequest,
  options: Readonly<{
    config: TravelProviderConfig;
    now: Temporal.Instant;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxRetries?: number;
    expiresAfterSeconds?: number;
    assertCurrent?: (signal: AbortSignal) => Promise<void>;
  }>,
): Promise<TravelRouteEstimate> {
  assertTravelProviderReady(options.config);
  const timingAt = instantString(request.timing.at);
  const drivingAt = request.mode === "driving" ? drivingDeparture(timingAt, request.readyAt) : timingAt;
  let response = await routeResponse(request, options, request.mode === "transit"
    ? request.timing
    : request.mode === "driving"
      ? { kind: "depart_at", at: drivingAt }
      : request.timing.kind === "depart_at" ? request.timing : null);
  const route = objectArray(response.routes)[0];
  if (!route || typeof route.duration !== "string") throw new TravelProviderError("malformed_provider_response", false);
  const routeDurationSeconds = parseDurationSeconds(route.duration);
  let durationSeconds = routeDurationSeconds;
  let departureAt = request.timing.kind === "depart_at"
    ? drivingAt
    : Temporal.Instant.from(timingAt).subtract({ seconds: routeDurationSeconds }).toString();
  let arrivalAt = request.timing.kind === "arrive_by"
    ? timingAt
    : Temporal.Instant.from(drivingAt).add({ seconds: routeDurationSeconds }).toString();
  if (request.mode === "transit") {
    const transit = transitJourney(objectArray(route.legs));
    if (!transit) throw new TravelProviderError("malformed_provider_response", false);
    durationSeconds = transit.durationSeconds;
    departureAt = transit.departureAt;
    arrivalAt = transit.arrivalAt;
  }
  // Routes API accepts arrivalTime for TRANSIT only. For driving, estimate the
  // candidate departure from a future arrival-time probe, then evaluate traffic
  // once at that departure. readyAt may already be past after geocoding. Walking and
  // cycling use the returned static duration without an arrivalTime request.
  if (request.mode === "driving" && request.timing.kind === "arrive_by") {
    if (options.assertCurrent && options.signal) await options.assertCurrent(options.signal);
    const candidateDeparture = drivingDeparture(
      Temporal.Instant.from(timingAt).subtract({ seconds: routeDurationSeconds }).toString(),
      request.readyAt,
    );
    const refined = await routeResponse(request, options, { kind: "depart_at", at: candidateDeparture });
    const refinedRoute = objectArray(refined.routes)[0];
    if (!refinedRoute || typeof refinedRoute.duration !== "string") throw new TravelProviderError("malformed_provider_response", false);
    durationSeconds = parseDurationSeconds(refinedRoute.duration);
    response = refined;
    departureAt = candidateDeparture;
    arrivalAt = Temporal.Instant.from(candidateDeparture).add({ seconds: durationSeconds }).toString();
  }
  const observedAt = options.now.toString();
  const expiresAt = options.now.add({ seconds: boundedExpiry(options.expiresAfterSeconds) }).toString();
  return {
    durationSeconds,
    departureAt,
    arrivalAt,
    warnings: stringArray(objectArray(response.routes)[0]?.warnings, 10, 300),
    fallback: record(response.fallbackInfo),
    attribution: "Google Maps",
    observedAt,
    expiresAt,
  };
}

function drivingDeparture(at: string, readyAt: string): string {
  // Read the live service clock after geocoding/fencing. Leave two call timeouts
  // for provider receipt; a late trip reports the evaluated late arrival.
  const earliest = Temporal.Now.instant().add({ milliseconds: TRAVEL_PROVIDER_TIMEOUT_MS * 2 });
  return [Temporal.Instant.from(at), Temporal.Instant.from(readyAt), earliest]
    .reduce((latest, value) => Temporal.Instant.compare(value, latest) > 0 ? value : latest)
    .toString();
}

async function routeResponse(
  request: TravelRouteRequest,
  options: Parameters<typeof computeGoogleRoute>[1],
  timing: TravelRouteRequest["timing"] | null,
): Promise<Record<string, unknown>> {
  assertTravelProviderReady(options.config);
  const hosted = options.config.authMode === "workload_identity";
  const accessToken = hosted ? await workloadAccessToken(options.config, options) : null;
  return requestJson(GOOGLE_ROUTES_URL, {
    fetch: options.fetch, signal: options.signal, timeoutMs: options.timeoutMs, maxRetries: options.maxRetries,
    init: {
      method: "POST",
      headers: hosted
        ? workloadHeaders(options.config, accessToken!, ROUTES_FIELD_MASK, true)
        : { "Content-Type": "application/json", "X-Goog-Api-Key": options.config.apiKey!, "X-Goog-FieldMask": ROUTES_FIELD_MASK },
      body: JSON.stringify({
        origin: waypoint(request.origin), destination: waypoint(request.destination), travelMode: googleMode(request.mode),
        ...(timing?.kind === "arrive_by" ? { arrivalTime: instantString(timing.at) } : timing ? { departureTime: instantString(timing.at) } : {}),
        ...(request.mode === "driving" ? { routingPreference: "TRAFFIC_AWARE_OPTIMAL" } : {}), computeAlternativeRoutes: false,
      }),
    },
  });
}

async function workloadAccessToken(
  config: TravelProviderConfig,
  options: Readonly<{ fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number }>,
): Promise<string> {
  if (!config.workloadIdentity) throw new TravelProviderError("not_configured", false);
  try {
    return await getGoogleWorkloadIdentityAccessToken(config.workloadIdentity, options);
  } catch (error) {
    if (error instanceof GoogleWorkloadIdentityError && error.kind === "misconfigured") {
      throw new TravelProviderError("not_configured", false);
    }
    throw new TravelProviderError("provider_unavailable", true);
  }
}

function workloadHeaders(
  config: TravelProviderConfig,
  accessToken: string,
  fieldMask: string,
  json = false,
): Record<string, string> {
  if (!config.workloadIdentity) throw new TravelProviderError("not_configured", false);
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Goog-User-Project": config.workloadIdentity.projectId,
    "X-Goog-FieldMask": fieldMask,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function requestJson(
  input: string | URL,
  options: Readonly<{
    fetch?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxRetries?: number;
    init?: RequestInit;
  }>,
): Promise<Record<string, unknown>> {
  const fetcher = options.fetch ?? fetch;
  const retries = boundedInteger(options.maxRetries, MAX_RETRIES, 0, MAX_RETRIES);
  const timeoutMs = options.timeoutMs ?? TRAVEL_PROVIDER_TIMEOUT_MS;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
      const json = await runProviderCallWithTimeout(async () => {
        const response = await fetcher(input, { ...options.init, cache: "no-store", redirect: "error", signal });
        if (!response.ok) {
          await response.body?.cancel();
          throw new TravelProviderError("provider_unavailable", transientStatus(response.status));
        }
        return readLimitedJson(response, signal);
      }, { timeoutMs, signal });
      if (!record(json)) throw new TravelProviderError("malformed_provider_response", false);
      return json;
    } catch (error) {
      if (error instanceof TravelProviderError) {
        if (error.retryable && attempt < retries) continue;
        throw error;
      }
      if (options.signal?.aborted) throw new TravelProviderError("timeout", true);
      if (attempt < retries) continue;
      throw new TravelProviderError("timeout", true);
    }
  }
}

async function readLimitedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 65_536) {
    await response.body?.cancel();
    throw new TravelProviderError("malformed_provider_response", false);
  }
  if (!response.body) throw new TravelProviderError("malformed_provider_response", false);
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel(); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 65_536) {
        await reader.cancel();
        throw new TravelProviderError("malformed_provider_response", false);
      }
      chunks.push(next.value);
    }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  return JSON.parse(new TextDecoder().decode(concat(chunks, length))) as unknown;
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function waypoint(point: TravelPoint) {
  if (point.kind === "place_id") return { placeId: point.placeId };
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
    throw new TypeError("Travel coordinates must be finite latitude/longitude values.");
  }
  return { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } };
}

function googleMode(mode: TravelMode): "WALK" | "BICYCLE" | "TRANSIT" | "DRIVE" {
  if (mode === "walking") return "WALK";
  if (mode === "cycling") return "BICYCLE";
  if (mode === "transit") return "TRANSIT";
  if (mode === "driving") return "DRIVE";
  throw new TypeError("Travel mode is unsupported.");
}

function transitJourney(legs: readonly Record<string, unknown>[]): { departureAt: string; arrivalAt: string; durationSeconds: number } | null {
  const steps = legs.flatMap((leg) => objectArray(leg.steps));
  const indexes = steps.flatMap((step, index) => step.travelMode === "TRANSIT" ? [index] : []);
  if (!indexes.length) return null;
  const firstIndex = indexes[0]!;
  const lastIndex = indexes.at(-1)!;
  const first = transitStopTimes(steps[firstIndex]!);
  const last = transitStopTimes(steps[lastIndex]!);
  if (!first?.departureAt || !last?.arrivalAt) return null;
  const before = sumStepDurations(steps.slice(0, firstIndex));
  const after = sumStepDurations(steps.slice(lastIndex + 1));
  if (before === null || after === null) return null;
  try {
    const departure = Temporal.Instant.from(first.departureAt).subtract({ seconds: before });
    const arrival = Temporal.Instant.from(last.arrivalAt).add({ seconds: after });
    const durationSeconds = Math.round(arrival.since(departure).total({ unit: "seconds" }));
    return durationSeconds >= 0 && durationSeconds <= 172_800
      ? { departureAt: departure.toString(), arrivalAt: arrival.toString(), durationSeconds }
      : null;
  } catch { return null; }
}

function transitStopTimes(step: Record<string, unknown>): { departureAt: string | null; arrivalAt: string | null } | null {
  const transit = record(step.transitDetails) ? step.transitDetails : null;
  const stop = transit && record(transit.stopDetails) ? transit.stopDetails : null;
  if (!stop) return null;
  return {
    departureAt: typeof stop.departureTime === "string" ? validInstant(stop.departureTime) : null,
    arrivalAt: typeof stop.arrivalTime === "string" ? validInstant(stop.arrivalTime) : null,
  };
}

function sumStepDurations(steps: readonly Record<string, unknown>[]): number | null {
  try { return steps.reduce((total, step) => total + parseDurationSeconds(typeof step.staticDuration === "string" ? step.staticDuration : ""), 0); }
  catch { return null; }
}

function validInstant(value: string): string | null {
  try { return instantString(value); } catch { return null; }
}

function parseDurationSeconds(value: string): number {
  const match = /^(\d+)(?:\.\d+)?s$/.exec(value);
  if (!match) throw new TravelProviderError("malformed_provider_response", false);
  const seconds = Number(match[1]);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 172_800) throw new TravelProviderError("malformed_provider_response", false);
  return seconds;
}

function instantString(value: string): string {
  try { return Temporal.Instant.from(value).toString(); }
  catch { throw new TypeError("Travel timing must be an instant."); }
}

function boundedExpiry(value: number | undefined): number {
  return boundedInteger(value, 300, 1, 300);
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value === undefined || !Number.isInteger(value) ? fallback : Math.max(minimum, Math.min(maximum, value));
}

function transientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(record) : [];
}

function stringArray(value: unknown, maximum: number, maximumLength: number): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length <= maximumLength).slice(0, maximum) : [];
}
