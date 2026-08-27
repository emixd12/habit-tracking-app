import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAll = vi.fn();
const set = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll, set })),
}));

import {
  clearSupabaseAuthCookies,
  fetchWithJwtIssuedAtFutureRetry,
} from "@/lib/supabase/server";

describe("clearSupabaseAuthCookies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expires every Supabase Auth cookie without touching unrelated cookies", async () => {
    getAll.mockReturnValue([
      { name: "sb-project-auth-token", value: "header.payload.signature" },
      { name: "sb-project-auth-token.0", value: "chunk-zero" },
      { name: "theme", value: "dark" },
      { name: "sb-project-code-verifier", value: "verifier" },
    ]);

    await clearSupabaseAuthCookies();

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(1, "sb-project-auth-token", "", {
      maxAge: 0,
      path: "/",
    });
    expect(set).toHaveBeenNthCalledWith(2, "sb-project-auth-token.0", "", {
      maxAge: 0,
      path: "/",
    });
  });
});

describe("fetchWithJwtIssuedAtFutureRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries the exact transient JWT clock-skew rejection once", async () => {
    vi.useFakeTimers();
    const requestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ occurrence_ids: ["occurrence-1"] }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "PGRST303",
            details: null,
            hint: null,
            message: "JWT issued at future",
          },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(Response.json([{ id: "session-1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const responsePromise = fetchWithJwtIssuedAtFutureRetry(
      "https://project.supabase.co/rest/v1/rpc/list_sessions",
      requestInit,
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    expect(await responsePromise).toEqual(
      expect.objectContaining({ status: 200 }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://project.supabase.co/rest/v1/rpc/list_sessions",
      requestInit,
    );
  });

  it("does not retry other authentication failures", async () => {
    const response = Response.json(
      {
        code: "PGRST301",
        message: "JWT expired",
      },
      { status: 401 },
    );
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithJwtIssuedAtFutureRetry(
        "https://project.supabase.co/rest/v1/profiles",
      ),
    ).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
