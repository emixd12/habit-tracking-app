import { afterAll, describe, expect, it, vi } from "vitest";

import {
  getSequenzyRuntimeConfig,
  sendSequenzyReminderEmail,
  SequenzyConfigurationError,
  SequenzySendError,
} from "@/lib/services/sequenzy.service";

const ORIGINAL_API_KEY = process.env.SEQUENZY_API_KEY;
const ORIGINAL_TEMPLATE_SLUG = process.env.SEQUENZY_REMINDER_TEMPLATE_SLUG;

const CONFIG = {
  apiKey: "seq_test_key",
  apiUrl: "https://api.sequenzy.com",
  reminderTemplateSlug: "habit-reminder",
};

const EMAIL_INPUT = {
  to: "user@example.com",
  subscriberExternalId: "user-1",
  variables: {
    BEHAVIOR_TITLE: "Drink water",
  },
};

describe("sequenzy service", () => {
  afterAll(() => {
    process.env.SEQUENZY_API_KEY = ORIGINAL_API_KEY;
    process.env.SEQUENZY_REMINDER_TEMPLATE_SLUG = ORIGINAL_TEMPLATE_SLUG;
  });

  it("sends reminder emails through the transactional template endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          jobId: "job-1",
        }),
        { status: 200 },
      ),
    );

    await expect(
      sendSequenzyReminderEmail(EMAIL_INPUT, {
        config: CONFIG,
        fetcher,
      }),
    ).resolves.toEqual({
      jobId: "job-1",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.sequenzy.com/api/v1/transactional/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer seq_test_key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      to: "user@example.com",
      subscriberExternalId: "user-1",
      slug: "habit-reminder",
      variables: {
        BEHAVIOR_TITLE: "Drink water",
      },
    });
  });

  it("throws a send error when Sequenzy rejects the request", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: "Missing variables",
        }),
        { status: 400 },
      ),
    );

    await expect(
      sendSequenzyReminderEmail(EMAIL_INPUT, {
        config: CONFIG,
        fetcher,
      }),
    ).rejects.toThrow(SequenzySendError);
  });

  it("requires server-only Sequenzy runtime configuration", () => {
    delete process.env.SEQUENZY_API_KEY;
    process.env.SEQUENZY_REMINDER_TEMPLATE_SLUG = "habit-reminder";

    expect(() => getSequenzyRuntimeConfig()).toThrow(
      SequenzyConfigurationError,
    );
  });
});
