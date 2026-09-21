import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const getCalendarEvents = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/services/google-calendar.service", () => ({ getCalendarEvents }));

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../app/api/advisor/day-context/route";

describe("advisor day-context route", () => {
  beforeEach(() => {
    createClient.mockReset();
    getCalendarEvents.mockReset();
  });

  it("does not disclose context without a credential", async () => {
    const response = GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      version: "1.0",
      error: { code: "unauthenticated", retryable: false, retryAfterSeconds: null },
    });
    expectSecurityHeaders(response);
    expect(createClient).not.toHaveBeenCalled();
    expect(getCalendarEvents).not.toHaveBeenCalled();
  });

  it("rejects every bearer credential while issuance is unavailable", async () => {
    const response = GET(request({ authorization: "Bearer copied-owner-session" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      version: "1.0",
      error: { code: "access_denied", retryable: false, retryAfterSeconds: null },
    });
    expectSecurityHeaders(response);
    expect(createClient).not.toHaveBeenCalled();
    expect(getCalendarEvents).not.toHaveBeenCalled();
  });

  it("rejects every non-GET method before any day-context service can run", async () => {
    for (const handler of [POST, PUT, PATCH, DELETE]) {
      const response = handler();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      await expect(response.json()).resolves.toEqual({
        version: "1.0",
        error: { code: "write_not_supported", retryable: false, retryAfterSeconds: null },
      });
      expectSecurityHeaders(response);
    }
  });
});

function request(headers?: HeadersInit) {
  return new Request("https://cadence.example/api/advisor/day-context?date=2026-09-19", {
    headers,
  });
}

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
}
