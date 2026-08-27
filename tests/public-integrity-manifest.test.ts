import { describe, expect, it } from "vitest";
// @ts-expect-error Operational JavaScript module intentionally has no declarations.
import { buildIntegrityManifest } from "../scripts/build-public-integrity-manifest.mjs";

describe("public integrity manifest", () => {
  it("detects missing assets, content-type changes, and digest mismatches", async () => {
    const result = await buildIntegrityManifest({
      assets: [{ surface: "application", path: "/asset.js", content_type: "application/javascript", sha256: "0".repeat(64) }],
      origins: { application: "https://cadence.example" },
      fetchedAt: "2026-08-26T12:00:00Z",
      fetcher: async () => new Response("changed", { status: 200, headers: { "content-type": "text/plain" } }),
    });
    expect(result.status).toBe("failed");
  });

  it("records a missing public asset as Failed", async () => {
    const result = await buildIntegrityManifest({ assets: [{ surface: "application", path: "/missing", content_type: "text/plain" }], origins: { application: "https://cadence.example" }, fetchedAt: "2026-08-26T12:00:00Z", fetcher: async () => new Response("missing", { status: 404, headers: { "content-type": "text/plain" } }) });
    expect(result.status).toBe("failed");
  });

  it("rejects redirects to a non-Cadence origin", async () => {
    await expect(buildIntegrityManifest({
      assets: [{ surface: "application", path: "/asset", content_type: "text/plain" }], origins: { application: "https://cadence.example" }, fetchedAt: "2026-08-26T12:00:00Z",
      fetcher: async () => new Response(null, { status: 302, headers: { location: "https://attacker.example/asset" } }),
    })).rejects.toThrow(/allowlisted origin/);
  });

  it("rejects private and loopback origins before fetching", async () => {
    await expect(buildIntegrityManifest({ assets: [{ surface: "application", path: "/asset", content_type: "text/plain" }], origins: { application: "https://127.0.0.1" }, fetchedAt: "2026-08-26T12:00:00Z", fetcher: async () => new Response("never") })).rejects.toThrow(/public HTTPS/);
  });
});
