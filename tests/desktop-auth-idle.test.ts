import { afterEach, expect, it, vi } from "vitest";
import { DesktopAuth } from "../apps/desktop/src/account/auth";

const secure = vi.hoisted(() => ({ session: null as string | null, reads: 0 }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: vi.fn(async (command: string, args: { name: string; value?: string }) => {
    if (args.name === "supabase-pkce" && command === "auth_secret_remove") return;
    if (args.name !== "supabase-session") throw new Error("Unexpected secure key");
    if (command === "auth_secret_get") { secure.reads++; return secure.session; }
    if (command === "auth_secret_set") { secure.session = args.value!; return; }
    if (command === "auth_secret_remove") { secure.session = null; return; }
    throw new Error("Unexpected native command");
  }),
}));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("does no idle Keychain polling and refreshes an expired token before an actual account request", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const session = {
    access_token: "synthetic-old-token", refresh_token: "synthetic-refresh",
    expires_at: Date.now() / 1000 + 3600, expires_in: 3600, token_type: "bearer",
    user: { id: "synthetic-user", aud: "authenticated" },
  };
  secure.session = JSON.stringify(session);
  secure.reads = 0;
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/auth/v1/token")) {
      return new Response(JSON.stringify({ ...session, access_token: "synthetic-fresh-token",
        expires_at: Date.now() / 1000 + 3600 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-fresh-token");
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const auth = new DesktopAuth({ url: "https://example.invalid", key: "synthetic-public-key" }, () => {});
  try {
    await auth.accountClient().auth.getSession();
    const reads = secure.reads;
    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
    expect(secure.reads).toBe(reads);
    expect(requests).toEqual([]);
    const response = await auth.accountClient().rpc("synthetic_snapshot");
    expect(response.error).toBeNull();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain("/auth/v1/token");
    expect(requests[1]).toContain("/rest/v1/rpc/synthetic_snapshot");
  } finally {
    await auth.dispose();
  }
  expect(vi.getTimerCount()).toBe(0);
});
