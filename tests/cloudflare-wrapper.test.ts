import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("rejects a mismatched Cloudflare zone ID before reading or writing its records", () => {
  const directory = mkdtempSync(join(tmpdir(), "cadence-cloudflare-"));
  const wrapper = resolve("scripts/cloudflare-api.mjs");
  try {
    const stub = join(directory, "provider.mjs");
    writeFileSync(stub, `globalThis.fetch = async (url, options) => {
      if (options.method !== "GET" || new URL(url).pathname !== "/client/v4/zones") throw new Error("UNEXPECTED_RECORD_ACCESS");
      return Response.json({ success: true, result: [{ id: "correct-zone", name: "cadence.example" }] });
    };`);
    for (const command of [["dns", "list"], ["dns", "create", "--type", "A", "--name", "cadence.example", "--content", "192.0.2.1"]]) {
      const result = spawnSync(process.execPath, ["--import", stub, wrapper, ...command], {
        cwd: directory, encoding: "utf8",
        env: { NODE_ENV: "test", CLOUDFLARE_API_TOKEN: "synthetic-token", CLOUDFLARE_ACCOUNT_ID: "synthetic-account",
          CLOUDFLARE_ZONE_NAME: "cadence.example", CLOUDFLARE_ZONE_ID: "wrong-zone" },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Bound zone mismatch");
      expect(result.stderr).not.toContain("UNEXPECTED_RECORD_ACCESS");
      expect(result.stdout + result.stderr).not.toContain("synthetic-token");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
