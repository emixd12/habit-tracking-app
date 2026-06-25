import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAuthFailureRateLimitersForTests } from "@/lib/security/auth-failure-rate-limits";
import { processOccurrenceSyncHorizons } from "@/lib/services/occurrence.service";
import { GET, POST } from "../app/api/occurrences/sync/route";

vi.mock("@/lib/services/occurrence.service", () => ({
  processOccurrenceSyncHorizons: vi.fn(),
}));

const ORIGINAL_SECRET = process.env.REMINDER_PROCESS_SECRET;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("occurrence sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthFailureRateLimitersForTests();
    process.env.REMINDER_PROCESS_SECRET = "process-secret";
    process.env.CRON_SECRET = "";
    vi.mocked(processOccurrenceSyncHorizons).mockResolvedValue({
      checked: 2,
      synced: 1,
      skipped: 1,
      failed: 0,
    });
  });

  afterAll(() => {
    restoreEnv("REMINDER_PROCESS_SECRET", ORIGINAL_SECRET);
    restoreEnv("CRON_SECRET", ORIGINAL_CRON_SECRET);
  });

  it("does no work when the process secret is not configured", async () => {
    delete process.env.REMINDER_PROCESS_SECRET;
    delete process.env.CRON_SECRET;

    const response = await POST(
      new NextRequest("http://localhost:3000/api/occurrences/sync", {
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
    });
    expect(response.status).toBe(503);
    expect(processOccurrenceSyncHorizons).not.toHaveBeenCalled();
  });

  it("rejects requests without the configured secret", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/occurrences/sync", {
        method: "POST",
        headers: {
          "x-reminder-process-secret": "wrong-secret",
        },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
    });
    expect(response.status).toBe(401);
    expect(processOccurrenceSyncHorizons).not.toHaveBeenCalled();
  });

  it("syncs horizons with the configured secret", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/occurrences/sync?limit=3", {
        method: "POST",
        headers: {
          authorization: "Bearer process-secret",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: {
        checked: 2,
        synced: 1,
        skipped: 1,
        failed: 0,
      },
    });
    expect(response.status).toBe(200);
    expect(processOccurrenceSyncHorizons).toHaveBeenCalledWith({
      limit: 3,
    });
  });

  it("bounds the manual processing limit", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/occurrences/sync?limit=10000", {
        method: "POST",
        headers: {
          authorization: "Bearer process-secret",
        },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(processOccurrenceSyncHorizons).toHaveBeenCalledWith({
      limit: 100,
    });
  });

  it("processes Vercel Cron GET requests with the cron secret", async () => {
    delete process.env.REMINDER_PROCESS_SECRET;
    process.env.CRON_SECRET = "cron-secret";

    const response = await GET(
      new NextRequest("http://localhost:3000/api/occurrences/sync", {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret",
        },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(processOccurrenceSyncHorizons).toHaveBeenCalledWith({
      limit: undefined,
    });
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
