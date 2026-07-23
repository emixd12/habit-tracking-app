import * as webPush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWebPushReminderSender } from "@/lib/services/web-push.service";

vi.mock("web-push", () => ({
  sendNotification: vi.fn(),
  WebPushError: class WebPushError extends Error {},
}));

const FALLBACK_SUBJECT = "mailto:notifications@cadence.local";

describe("web push VAPID subject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
    vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["https://example.com", "https://example.com"],
    ["http://localhost:3000", FALLBACK_SUBJECT],
    [undefined, FALLBACK_SUBJECT],
    ["   ", FALLBACK_SUBJECT],
  ])("uses %s as %s", async (siteUrl, expectedSubject) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);

    const sendBrowserPush = createWebPushReminderSender();

    await sendBrowserPush({
      endpoint: "https://push.example.com/subscription/1",
      p256dh: "test-p256dh",
      auth: "test-auth",
      payload: {
        title: "Test reminder",
        body: "Test body",
        tag: "test-reminder",
        url: "/timeline",
      },
    });

    expect(webPush.sendNotification).toHaveBeenCalledOnce();
    expect(
      vi.mocked(webPush.sendNotification).mock.calls[0]?.[2]?.vapidDetails
        ?.subject,
    ).toBe(expectedSubject);
  });
});
