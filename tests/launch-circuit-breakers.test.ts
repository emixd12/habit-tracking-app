import { describe, expect, it } from "vitest";

import {
  assertLaunchCircuitBreakerClosed,
  LaunchCircuitBreakerOpenError,
  readLaunchCircuitBreaker,
} from "@/lib/security/launch-circuit-breakers";

describe("launch circuit breakers", () => {
  it("defaults every subsystem to normal product behavior", () => {
    expect(readLaunchCircuitBreaker("email_sends", {})).toEqual({
      name: "email_sends",
      open: false,
      reasonCode: "not_open",
      retryAfterSeconds: 300,
    });
  });

  it("opens only the selected subsystem with an allow-listed reason", () => {
    const environment = {
      CADENCE_DISABLE_EMAIL_SENDS: "1",
      CADENCE_LAUNCH_BREAKER_REASON_CODE: "provider_incident",
    };

    expect(readLaunchCircuitBreaker("email_sends", environment)).toMatchObject({
      open: true,
      reasonCode: "provider_incident",
    });
    expect(readLaunchCircuitBreaker("browser_push_sends", environment)).toMatchObject(
      {
        open: false,
      },
    );
  });

  it("does not log arbitrary environment text as a reason code", () => {
    expect(
      readLaunchCircuitBreaker("export_downloads", {
        CADENCE_DISABLE_EXPORT_DOWNLOADS: "1",
        CADENCE_LAUNCH_BREAKER_REASON_CODE: "recipient@example.com",
      }),
    ).toMatchObject({
      open: true,
      reasonCode: "unspecified",
    });
  });

  it("throws a typed error before disabled work starts", () => {
    expect(() =>
      assertLaunchCircuitBreakerClosed("occurrence_sync_batches", {
        CADENCE_DISABLE_OCCURRENCE_SYNC_BATCHES: "1",
        CADENCE_LAUNCH_BREAKER_REASON_CODE: "cost_surge",
      }),
    ).toThrowError(LaunchCircuitBreakerOpenError);
  });
});
