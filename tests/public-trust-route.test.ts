import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicTrustEvidence = vi.fn();

vi.mock("../lib/services/public-trust-evidence.service", () => ({
  getPublicTrustEvidence,
}));

describe("public Trust machine route", () => {
  beforeEach(() => getPublicTrustEvidence.mockReset());

  it("returns the normalized public view without authentication", async () => {
    const view = {
      schema: "cadence.public-trust-view",
      schema_version: 1,
      feed_state: "live",
      feed_message: null,
      snapshot: {
        id: "snapshot",
        url: "https://example.test/snapshot",
        source_commit: "a".repeat(40),
        application_deployment_id: "dpl_application",
        application_deployment_url: "https://app.example.test",
        marketing_deployment_id: "dpl_marketing",
        marketing_deployment_url: "https://marketing.example.test",
        workflow_url: "https://github.com/example/actions/runs/1",
        built_at: "2026-08-26T11:00:00Z",
        verified_at: "2026-08-26T12:00:00Z",
        freshness_deadline: "2026-08-27T12:00:00Z",
      },
      checks: [],
    };
    getPublicTrustEvidence.mockResolvedValue(view);
    const { GET } = await import("../app/api/public/trust-evidence/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
