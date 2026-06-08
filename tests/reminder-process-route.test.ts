import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { processDueEmailReminders } from "@/lib/services/reminder.service";
import { GET, POST } from "../app/api/reminders/process/route";

vi.mock("@/lib/services/reminder.service", () => ({
  processDueEmailReminders: vi.fn(),
}));

const ORIGINAL_SECRET = process.env.REMINDER_PROCESS_SECRET;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("reminder process route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REMINDER_PROCESS_SECRET = "process-secret";
    process.env.CRON_SECRET = "";
    vi.mocked(processDueEmailReminders).mockResolvedValue({
      checked: 1,
      claimed: 1,
      skipped: 0,
      sent: 1,
      failed: 0,
      cancelled: 0,
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
      new NextRequest("http://localhost:3000/api/reminders/process", {
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
    });
    expect(response.status).toBe(503);
    expect(processDueEmailReminders).not.toHaveBeenCalled();
  });

  it("rejects requests without the configured secret", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/reminders/process", {
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
    expect(processDueEmailReminders).not.toHaveBeenCalled();
  });

  it("processes due reminders with the configured secret", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/reminders/process?limit=3", {
        method: "POST",
        headers: {
          authorization: "Bearer process-secret",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: {
        checked: 1,
        claimed: 1,
        skipped: 0,
        sent: 1,
        failed: 0,
        cancelled: 0,
      },
    });
    expect(response.status).toBe(200);
    expect(processDueEmailReminders).toHaveBeenCalledWith({
      limit: 3,
    });
  });

  it("processes Vercel Cron GET requests with the cron secret", async () => {
    delete process.env.REMINDER_PROCESS_SECRET;
    process.env.CRON_SECRET = "cron-secret";

    const response = await GET(
      new NextRequest("http://localhost:3000/api/reminders/process?limit=4", {
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
    expect(processDueEmailReminders).toHaveBeenCalledWith({
      limit: 4,
    });
  });

  it("rejects Vercel Cron GET requests without the cron secret", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = await GET(
      new NextRequest("http://localhost:3000/api/reminders/process", {
        method: "GET",
        headers: {
          authorization: "Bearer wrong-secret",
        },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
    });
    expect(response.status).toBe(401);
    expect(processDueEmailReminders).not.toHaveBeenCalled();
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
