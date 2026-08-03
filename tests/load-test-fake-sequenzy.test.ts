import { describe, expect, it } from "vitest";

import { sendSequenzyReminderEmail } from "@/lib/services/sequenzy.service";

type ProcessResult = {
  checked: number;
  claimed: number;
  skipped: number;
  sent: number;
  failed: number;
  cancelled: number;
};

type FakeSequenzySnapshot = {
  schema_version: string;
  target_classification: "local";
  provider: "fake_sequenzy";
  requests_total: number;
  accepted: number;
  rejected: number;
  unique_delivery_fingerprints: number;
  duplicate_send_attempts: number;
  web_push_attempts: number;
  rejection_reasons: Record<string, number>;
  response_statuses: Record<string, number>;
};

type FakeSequenzyServer = {
  apiUrl: string;
  close: () => Promise<FakeSequenzySnapshot>;
  snapshot: () => FakeSequenzySnapshot;
};

type FakeSequenzyModule = {
  assertFakeSequenzyRunEvidence: (input: {
    snapshot: FakeSequenzySnapshot;
    processResults: ProcessResult[];
    replayResult: ProcessResult;
    finalDeliveryDelta: {
      sent: number;
      failed: number;
      cancelled: number;
      processing: number;
      duplicateKeys: number;
    };
    activePushSubscriptions: number;
  }) => void;
  startFakeSequenzyServer: (options: {
    runId: string;
    apiKey: string;
    reminderTemplateSlug: string;
    host?: string;
    port?: number;
    maxRequests?: number;
  }) => Promise<FakeSequenzyServer>;
};

const RUN_ID = "20260729t120000z-abcdef123456";
const API_KEY = "cadence-load-fake-abcdefghijklmnopqrstuvwxyz";
const TEMPLATE_SLUG = "cadence-load-habit-reminder";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";
const OCCURRENCE_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_MARKER = "cadence-owner-aaaaaaaaaaaaaaaaaaaa";

let fakeModulePromise: Promise<FakeSequenzyModule> | undefined;

function loadFakeModule() {
  fakeModulePromise ??= import(
    // @ts-expect-error The fake provider is a plain Node ESM module.
    "../scripts/load-test-fake-sequenzy.mjs"
  );
  return fakeModulePromise;
}

function validPayload() {
  return {
    to: `cadence-load-${RUN_ID}-typical_daily-0001@example.invalid`,
    subscriberExternalId: USER_ID,
    slug: TEMPLATE_SLUG,
    variables: {
      BEHAVIOR_ID,
      BEHAVIOR_TITLE: `${OWNER_MARKER} Synthetic behavior`,
      BEHAVIOR_DESCRIPTION: "",
      OCCURRENCE_ID,
      OCCURRENCE_LOCAL_DATE: "2026-07-29",
      OCCURRENCE_SCHEDULED_FOR: "2026-07-29T13:00:00Z",
      REMINDER_SCHEDULED_SEND_AT: "2026-07-29T12:00:00Z",
      SCHEDULED_TIME: "9:00 AM",
      TIMEZONE: "America/New_York",
      TIMELINE_URL: "http://127.0.0.1:3100/timeline",
    },
  };
}

async function send(
  server: FakeSequenzyServer,
  payload: unknown,
  options: {
    apiKey?: string;
    path?: string;
  } = {},
) {
  return fetch(
    `${server.apiUrl}${options.path ?? "/api/v1/transactional/send"}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey ?? API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

describe("Ticket 065 local fake Sequenzy", () => {
  it("accepts the existing app adapter without a product-code seam", async () => {
    const { startFakeSequenzyServer } = await loadFakeModule();
    const server = await startFakeSequenzyServer({
      runId: RUN_ID,
      apiKey: API_KEY,
      reminderTemplateSlug: TEMPLATE_SLUG,
    });
    const payload = validPayload();

    try {
      await expect(
        sendSequenzyReminderEmail(
          {
            to: payload.to,
            subscriberExternalId: payload.subscriberExternalId,
            variables: payload.variables,
          },
          {
            config: {
              apiKey: API_KEY,
              apiUrl: server.apiUrl,
              reminderTemplateSlug: TEMPLATE_SLUG,
            },
          },
        ),
      ).resolves.toEqual({
        jobId: "cadence-load-job-1",
      });
      expect(server.snapshot()).toMatchObject({
        accepted: 1,
        rejected: 0,
      });
    } finally {
      await server.close();
    }
  });

  it("accepts only a signed synthetic reminder and retains aggregate evidence", async () => {
    const { startFakeSequenzyServer } = await loadFakeModule();
    const server = await startFakeSequenzyServer({
      runId: RUN_ID,
      apiKey: API_KEY,
      reminderTemplateSlug: TEMPLATE_SLUG,
    });

    try {
      const healthResponse = await fetch(`${server.apiUrl}/health`);
      await expect(healthResponse.json()).resolves.toEqual({
        ok: true,
        target_classification: "local",
        provider: "fake_sequenzy",
      });
      expect(healthResponse.status).toBe(200);

      const response = await send(server, validPayload());

      await expect(response.json()).resolves.toMatchObject({
        success: true,
      });
      expect(response.status).toBe(202);
      expect(server.apiUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.snapshot()).toMatchObject({
        schema_version: "1.0.0",
        target_classification: "local",
        provider: "fake_sequenzy",
        requests_total: 1,
        accepted: 1,
        rejected: 0,
        unique_delivery_fingerprints: 1,
        duplicate_send_attempts: 0,
        web_push_attempts: 0,
        response_statuses: {
          "202": 1,
        },
      });

      const serialized = JSON.stringify(server.snapshot());
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain(OWNER_MARKER);
      expect(serialized).not.toContain(USER_ID);
      expect(serialized).not.toContain(OCCURRENCE_ID);
      expect(serialized).not.toContain("@example.invalid");
    } finally {
      await server.close();
    }
  });

  it("rejects duplicate sends before recording another accepted provider call", async () => {
    const { startFakeSequenzyServer } = await loadFakeModule();
    const server = await startFakeSequenzyServer({
      runId: RUN_ID,
      apiKey: API_KEY,
      reminderTemplateSlug: TEMPLATE_SLUG,
    });

    try {
      expect((await send(server, validPayload())).status).toBe(202);
      expect((await send(server, validPayload())).status).toBe(409);
      expect(server.snapshot()).toMatchObject({
        requests_total: 2,
        accepted: 1,
        rejected: 1,
        unique_delivery_fingerprints: 1,
        duplicate_send_attempts: 1,
        rejection_reasons: {
          duplicate_send: 1,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("rejects real recipients, nonlocal links, wrong keys, and Web Push paths", async () => {
    const { startFakeSequenzyServer } = await loadFakeModule();
    const server = await startFakeSequenzyServer({
      runId: RUN_ID,
      apiKey: API_KEY,
      reminderTemplateSlug: TEMPLATE_SLUG,
    });

    try {
      const realRecipient = validPayload();
      realRecipient.to = "person@example.com";
      expect((await send(server, realRecipient)).status).toBe(422);

      const nonlocalTarget = validPayload();
      nonlocalTarget.variables.TIMELINE_URL =
        "https://cadence.example.com/timeline";
      expect((await send(server, nonlocalTarget)).status).toBe(422);

      expect(
        (
          await send(server, validPayload(), {
            apiKey: "wrong-fake-key",
          })
        ).status,
      ).toBe(401);

      expect(
        (
          await send(server, validPayload(), {
            path: "/api/v1/push/send",
          })
        ).status,
      ).toBe(404);

      expect(server.snapshot()).toMatchObject({
        requests_total: 4,
        accepted: 0,
        rejected: 4,
        web_push_attempts: 1,
        rejection_reasons: {
          unsafe_payload: 2,
          unauthorized: 1,
          web_push_forbidden: 1,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("refuses a nonloopback bind and unbounded request ceilings", async () => {
    const { startFakeSequenzyServer } = await loadFakeModule();

    await expect(
      startFakeSequenzyServer({
        runId: RUN_ID,
        apiKey: API_KEY,
        reminderTemplateSlug: TEMPLATE_SLUG,
        host: "0.0.0.0",
      }),
    ).rejects.toThrow(/loopback/);
    await expect(
      startFakeSequenzyServer({
        runId: RUN_ID,
        apiKey: API_KEY,
        reminderTemplateSlug: TEMPLATE_SLUG,
        maxRequests: 100_000,
      }),
    ).rejects.toThrow(/request ceiling/);
  });

  it("stops accepting provider calls after its declared request ceiling", async () => {
    const { startFakeSequenzyServer } = await loadFakeModule();
    const server = await startFakeSequenzyServer({
      runId: RUN_ID,
      apiKey: API_KEY,
      reminderTemplateSlug: TEMPLATE_SLUG,
      maxRequests: 1,
    });

    try {
      expect((await send(server, validPayload())).status).toBe(202);

      const secondPayload = validPayload();
      secondPayload.variables.OCCURRENCE_ID =
        "44444444-4444-4444-8444-444444444444";
      expect((await send(server, secondPayload)).status).toBe(429);
      expect(server.snapshot()).toMatchObject({
        requests_total: 2,
        accepted: 1,
        rejected: 1,
        rejection_reasons: {
          request_ceiling: 1,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("proves replay idempotence, final delivery status, and no push state", async () => {
    const { assertFakeSequenzyRunEvidence } = await loadFakeModule();
    const snapshot: FakeSequenzySnapshot = {
      schema_version: "1.0.0",
      target_classification: "local",
      provider: "fake_sequenzy",
      requests_total: 2,
      accepted: 2,
      rejected: 0,
      unique_delivery_fingerprints: 2,
      duplicate_send_attempts: 0,
      web_push_attempts: 0,
      rejection_reasons: {},
      response_statuses: { "202": 2 },
    };
    const processed = {
      checked: 3,
      claimed: 3,
      skipped: 0,
      sent: 2,
      failed: 1,
      cancelled: 0,
    };
    const replay = {
      checked: 0,
      claimed: 0,
      skipped: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };

    expect(() =>
      assertFakeSequenzyRunEvidence({
        snapshot,
        processResults: [processed, replay],
        replayResult: replay,
        finalDeliveryDelta: {
          sent: 2,
          failed: 1,
          cancelled: 3,
          processing: 0,
          duplicateKeys: 0,
        },
        activePushSubscriptions: 0,
      }),
    ).not.toThrow();

    expect(() =>
      assertFakeSequenzyRunEvidence({
        snapshot: {
          ...snapshot,
          duplicate_send_attempts: 1,
        },
        processResults: [processed, replay],
        replayResult: replay,
        finalDeliveryDelta: {
          sent: 2,
          failed: 1,
          cancelled: 0,
          processing: 0,
          duplicateKeys: 0,
        },
        activePushSubscriptions: 0,
      }),
    ).toThrow(/duplicate/);
  });
});
