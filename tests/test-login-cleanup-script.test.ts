import { beforeAll, describe, expect, it } from "vitest";

type CleanupScriptModule = {
  isStaleTestLoginUser: (
    user: { created_at?: string; email?: string },
    cutoffTime: number,
  ) => boolean;
  readCleanupConfig: (
    env: Record<string, string | undefined>,
    envFilePath: string,
  ) => {
    maxAgeHours: number;
    serviceRoleKey: string;
    url: string;
  };
  summarizeCleanupResult: (result: {
    checkedUsers: number;
    deletedUsers: number;
  }) => string;
};

let cleanupScript: CleanupScriptModule;

beforeAll(async () => {
  // @ts-expect-error The cleanup command is a plain Node ESM script.
  cleanupScript = await import("../scripts/supabase-test-login-cleanup.mjs");
});

describe("test login cleanup script helpers", () => {
  it("reads cleanup config without exposing secrets", () => {
    expect(
      cleanupScript.readCleanupConfig(
        {
          NEXT_PUBLIC_SUPABASE_URL: " https://supabase.example ",
          SUPABASE_SERVICE_ROLE_KEY: " service-role ",
          CADENCE_TEST_LOGIN_MAX_AGE_HOURS: "2",
        },
        "missing-env-file",
      ),
    ).toEqual({
      url: "https://supabase.example",
      serviceRoleKey: "service-role",
      maxAgeHours: 2,
    });
  });

  it("matches only stale temporary test-login users", () => {
    const cutoffTime = Date.parse("2026-06-25T12:00:00.000Z");

    expect(
      cleanupScript.isStaleTestLoginUser(
        {
          email: "cadence-test-abc@example.invalid",
          created_at: "2026-06-25T11:00:00.000Z",
        },
        cutoffTime,
      ),
    ).toBe(true);
    expect(
      cleanupScript.isStaleTestLoginUser(
        {
          email: "cadence-rls-smoke-abc@example.invalid",
          created_at: "2026-06-25T11:00:00.000Z",
        },
        cutoffTime,
      ),
    ).toBe(false);
    expect(
      cleanupScript.isStaleTestLoginUser(
        {
          email: "cadence-test-fresh@example.invalid",
          created_at: "2026-06-25T13:00:00.000Z",
        },
        cutoffTime,
      ),
    ).toBe(false);
  });

  it("summarizes cleanup without user identifiers", () => {
    expect(
      cleanupScript.summarizeCleanupResult({
        checkedUsers: 10,
        deletedUsers: 2,
      }),
    ).toBe(
      "Supabase test login cleanup complete. Checked 10 users. Deleted 2 stale temporary users.",
    );
  });
});
