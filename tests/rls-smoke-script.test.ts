import { beforeAll, describe, expect, it } from "vitest";

type SmokeScriptModule = {
  buildSmokePassword: (runId: string) => string;
  buildSmokeUserEmail: (runId: string, slot: string) => string;
  readSmokeConfig: (
    env?: Record<string, string | undefined>,
    envFilePath?: string,
  ) => {
    url: string;
    publishableKey: string;
    serviceRoleKey: string;
  };
  parseLocalSmokeConfig: (output: string) => {
    url: string;
    publishableKey: string;
    serviceRoleKey: string;
  };
  summarizeSmokeResult: (result: {
    runId: string;
    createdUsers: number;
    checkedAssertions: number;
  }) => string;
  assertSuccessfulSessionRows: (
    response: {
      data: Array<{ id: string }> | null;
      error: { message: string } | null;
    },
    expectedIds: string[],
    action: string,
  ) => void;
};

let smokeScript: SmokeScriptModule;

beforeAll(async () => {
  // @ts-expect-error The smoke command is a plain Node ESM script.
  smokeScript = await import("../scripts/supabase-rls-smoke.mjs");
});

describe("Supabase RLS smoke script helpers", () => {
  it("reads required Supabase config with publishable key preference", () => {
    expect(
      smokeScript.readSmokeConfig(
        {
          NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co ",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " publishable ",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: " anon ",
          SUPABASE_SERVICE_ROLE_KEY: " service ",
        },
        "missing-env-file",
      ),
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "publishable",
      serviceRoleKey: "service",
    });
  });

  it("falls back to the legacy anon key name", () => {
    expect(
      smokeScript.readSmokeConfig(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
          SUPABASE_SERVICE_ROLE_KEY: "service",
        },
        "missing-env-file",
      ).publishableKey,
    ).toBe("anon");
  });

  it("parses CLI-reported local config and rejects hosted URLs", () => {
    expect(
      smokeScript.parseLocalSmokeConfig(
        [
          'API_URL="http://127.0.0.1:55321"',
          'PUBLISHABLE_KEY="publishable"',
          'SERVICE_ROLE_KEY="service"',
        ].join("\n"),
      ),
    ).toEqual({
      url: "http://127.0.0.1:55321",
      publishableKey: "publishable",
      serviceRoleKey: "service",
    });

    expect(() =>
      smokeScript.parseLocalSmokeConfig(
        [
          'API_URL="https://project.supabase.co"',
          'PUBLISHABLE_KEY="publishable"',
          'SERVICE_ROLE_KEY="service"',
        ].join("\n"),
      ),
    ).toThrow("loopback API URL");
  });

  it("reports missing config without printing secret values", () => {
    expect(() => smokeScript.readSmokeConfig({}, "missing-env-file")).toThrow(
      "Missing Supabase RLS smoke config",
    );
  });

  it("builds deterministic temporary credentials from a run id", () => {
    expect(smokeScript.buildSmokeUserEmail("abc123", "a")).toBe(
      "cadence-rls-smoke-abc123-a@example.invalid",
    );
    expect(smokeScript.buildSmokePassword("abc123")).toContain("abc123");
  });

  it("summarizes smoke results without user ids or emails", () => {
    const summary = smokeScript.summarizeSmokeResult({
      runId: "abc123",
      createdUsers: 2,
      checkedAssertions: 6,
    });

    expect(summary).toContain("RLS smoke passed");
    expect(summary).toContain("6 ownership checks");
    expect(summary).not.toContain("@");
  });

  it("fails closed when an RPC returns a foreign, duplicate, or errored session", () => {
    expect(() =>
      smokeScript.assertSuccessfulSessionRows(
        { data: [{ id: "session-own" }], error: null },
        ["session-own"],
        "own read",
      ),
    ).not.toThrow();

    expect(() =>
      smokeScript.assertSuccessfulSessionRows(
        { data: [{ id: "session-foreign" }], error: null },
        ["session-own"],
        "mixed read",
      ),
    ).toThrow("unexpected time-session scope");

    expect(() =>
      smokeScript.assertSuccessfulSessionRows(
        {
          data: null,
          error: { message: "permission denied" },
        },
        [],
        "owner read",
      ),
    ).toThrow("Unexpected error during owner read");
  });
});
