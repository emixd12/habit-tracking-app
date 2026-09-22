import { Temporal } from "@js-temporal/polyfill";

import type { TravelRouteEstimate, TravelRouteRequest } from "@cadence/core/types/travel";
import {
  TravelProviderError,
  assertTravelProviderReady,
  computeGoogleRoute,
  type TravelProviderConfig,
} from "./travel-provider";

export const TRAVEL_ROUTING_LIMITS = {
  legs: 8,
  concurrency: 2,
  batchDeadlineMs: 45_000,
} as const;

export type TravelRoutingFailure = Readonly<{
  code: TravelProviderError["code"] | "quota_exceeded" | "context_changed";
  retryable: boolean;
  retryAfterSeconds: number | null;
}>;

export type TravelRoutingResult = Readonly<{
  id: string;
  estimate: TravelRouteEstimate | null;
  failure: TravelRoutingFailure | null;
}>;

export class TravelRoutingError extends Error {
  constructor(public readonly failure: TravelRoutingFailure) {
    super(failure.code);
    this.name = "TravelRoutingError";
  }
}

/**
 * This service never stores inputs or provider output. Callers supply a fresh
 * owner/grant/source fence and an atomic distributed quota before any fetch.
 */
export async function routeTravelLegs(
  input: Readonly<{
    routes: readonly Readonly<{ id: string; request: TravelRouteRequest }>[];
    provider: TravelProviderConfig;
    quota: { consume: () => Promise<Readonly<{ allowed: boolean; retryAfterSeconds: number }>> };
    quotaAlreadyConsumed?: boolean;
    assertCurrent: (signal: AbortSignal) => Promise<void>;
    now: Temporal.Instant;
    fetch?: typeof fetch;
    signal?: AbortSignal;
  }>,
): Promise<TravelRoutingResult[]> {
  assertTravelProviderReady(input.provider);
  if (!input.routes.length || input.routes.length > TRAVEL_ROUTING_LIMITS.legs || new Set(input.routes.map((route) => route.id)).size !== input.routes.length || input.routes.some((route) => !route.id || route.id.length > 128)) {
    throw new TravelRoutingError({ code: "context_changed", retryable: false, retryAfterSeconds: null });
  }
  const deadline = AbortSignal.timeout(TRAVEL_ROUTING_LIMITS.batchDeadlineMs);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
  await input.assertCurrent(signal);
  if (!input.quotaAlreadyConsumed) {
    const admission = await input.quota.consume();
    if (!admission.allowed) {
      throw new TravelRoutingError({ code: "quota_exceeded", retryable: true, retryAfterSeconds: Number.isInteger(admission.retryAfterSeconds) && admission.retryAfterSeconds > 0 ? admission.retryAfterSeconds : 1 });
    }
  }
  await input.assertCurrent(signal);

  let retried = false;
  return boundedMap(input.routes, TRAVEL_ROUTING_LIMITS.concurrency, async (route) => {
    for (;;) {
      try {
        await input.assertCurrent(signal);
        const estimate = await computeGoogleRoute(route.request, {
          config: input.provider,
          now: input.now,
          fetch: input.fetch,
          signal,
          maxRetries: 0,
          assertCurrent: input.assertCurrent,
        });
        await input.assertCurrent(signal);
        return { id: route.id, estimate, failure: null };
      } catch (error) {
        if (error instanceof TravelRoutingError) throw error;
        if (error instanceof TravelProviderError && error.retryable && !retried) {
          retried = true;
          continue;
        }
        if (error instanceof TravelProviderError) {
          return { id: route.id, estimate: null, failure: {
            code: error.code,
            retryable: error.retryable,
            retryAfterSeconds: null,
          } };
        }
        return { id: route.id, estimate: null, failure: {
          code: signal.aborted ? "timeout" : "provider_unavailable",
          retryable: true,
          retryAfterSeconds: null,
        } };
      }
    }
  });
}

async function boundedMap<T, U>(values: readonly T[], limit: number, map: (value: T) => Promise<U>): Promise<U[]> {
  const results = new Array<U>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      results[index] = await map(values[index]!);
    }
  }));
  return results;
}
