import { describe, expect, it } from "vitest";
// @ts-expect-error Operational JavaScript module intentionally has no declarations.
import { collectRouteCandidates, collectRoutes, compareObservedRoutes, marketingContracts } from "../scripts/compare-public-routes.mjs";

describe("public route comparison", () => {
  it("detects missing and undeclared public routes", () => {
    expect(compareObservedRoutes([{ path: "/a" }], [{ path: "/b", ok: true }]).failures).toEqual(["/a: missing", "/b: undeclared live route"]);
  });

  it("detects an allowlisted undeclared route candidate that becomes live", async () => {
    const failures = await collectRouteCandidates({ origin: "https://cadence.example", candidates: [{ path: "/dashboard", status: 404 }], fetcher: async () => new Response("live", { status: 200 }) });
    expect(failures[0]).toContain("undeclared live public route");
  });

  it("detects status, canonical, and Markdown divergence", async () => {
    const fetcher = async (url: URL) => new Response(url.pathname === "/page.md" ? "wrong" : '<link rel="canonical" href="/wrong"><title>Page</title>', { status: 200, headers: { "content-type": url.pathname.endsWith(".md") ? "text/markdown" : "text/html" } });
    const result = await collectRoutes({ origin: "https://cadence.example", fetcher, routes: [
      { path: "/page", status: 200, content_type: "text/html", marker: "<title>Page", canonical: "/page" },
      { path: "/page.md", status: 200, content_type: "text/markdown", marker: "canonical_url: https://cadence.example/page" },
    ] });
    expect(result.status).toBe("failed");
    expect(result.failures.join(" ")).toMatch(/canonical URL changed|stable page marker missing/);
  });

  it("preserves the configured canonical host when collection uses an immutable deployment", () => {
    const [route] = marketingContracts({ schema_version: 1, routes: [{ url: "https://preview.example/page", canonical_url: "https://www.example.com/page", markdown_url: "https://preview.example/page.md", include_in_markdown_mirror: false, title: "Page" }] });
    expect(route.canonical).toBe("https://www.example.com/page");
  });

  it("rejects a bare route array instead of bypassing the generated manifest envelope", () => {
    expect(() => marketingContracts([])).toThrow(/unsupported shape/);
  });
});
