import { describe, expect, it } from "vitest";
// @ts-expect-error Operational JavaScript module intentionally has no declarations.
import { buildIntegrityManifest } from "../scripts/build-public-integrity-manifest.mjs";
// @ts-expect-error Operational JavaScript module intentionally has no declarations.
import { boundedFetch } from "../scripts/public-trust-http.mjs";

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

  it("records redirects outside the allowlisted origin as Failed evidence", async () => {
    const result = await buildIntegrityManifest({
      assets: [{ surface: "application", path: "/asset", content_type: "text/plain" }], origins: { application: "https://cadence.example" }, fetchedAt: "2026-08-26T12:00:00Z",
      fetcher: async () => new Response(null, { status: 302, headers: { location: "https://attacker.example/asset" } }),
    });
    expect(result.status).toBe("failed");
    expect(result.entries[0]).toMatchObject({ status: 0, ok: false, final_url: "https://cadence.example/asset" });
  });

  it("records a rejected bounded fetch as Failed evidence", async () => {
    const result = await buildIntegrityManifest({ assets: [{ surface: "application", path: "/asset", content_type: "text/plain" }], origins: { application: "https://cadence.example" }, fetchedAt: "2026-08-26T12:00:00Z", fetcher: async () => { throw new Error("synthetic timeout"); } });
    expect(result.status).toBe("failed");
    expect(result.entries[0]).toMatchObject({ status: 0, bytes: 0, sha256: null, ok: false });
  });

  it("rejects private and loopback origins before fetching", async () => {
    await expect(buildIntegrityManifest({ assets: [{ surface: "application", path: "/asset", content_type: "text/plain" }], origins: { application: "https://127.0.0.1" }, fetchedAt: "2026-08-26T12:00:00Z", fetcher: async () => new Response("never") })).rejects.toThrow(/public HTTPS/);
  });

  it("uses a temporary Preview share cookie without returning the bypass value", async () => {
    const requests: Array<{ url: string; cookie: string }> = [];
    const result = await boundedFetch("https://preview.example", "/asset", {
      vercelShare: "temporary-share-value",
      followRedirects: false,
      fetcher: async (url: URL, init: RequestInit) => {
        requests.push({ url: url.toString(), cookie: new Headers(init.headers).get("cookie") ?? "" });
        if (requests.length === 1) return new Response(null, { status: 302, headers: { location: "https://vercel.example/sso-api", "set-cookie": "_vercel_jwt=session; Path=/" } });
        return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
      },
    });
    expect(requests[0].url).toContain("_vercel_share=temporary-share-value");
    expect(requests[1]).toEqual({ url: "https://preview.example/asset", cookie: "_vercel_jwt=session" });
    expect(result.finalUrl).toBe("https://preview.example/asset");
  });
});
