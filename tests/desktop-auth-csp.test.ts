import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop authentication CSP", () => {
  it("allows only Supabase project HTTPS hosts beyond native IPC", () => {
    const config = JSON.parse(readFileSync("apps/desktop/src-tauri/tauri.conf.json", "utf8"));
    const connect = config.app.security.csp.match(/connect-src ([^;]+)/)?.[1] ?? "";
    expect(connect).toContain("https://*.supabase.co");
    expect(connect.replace("https://*.supabase.co", "")).not.toContain("*");
  });
});
