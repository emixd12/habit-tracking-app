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
      snapshot: null,
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
