import { readFileSync } from "node:fs";
import path from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { TrustEvidencePanel } from "../components/trust/TrustEvidencePanel";
import {
  clearPublicTrustEvidenceCacheForTests,
  getPublicTrustEvidence,
} from "../lib/services/public-trust-evidence.service";
import type { PublicTrustEvidenceSnapshot } from "../lib/resolvers/public-trust-evidence.resolver";

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests/fixtures/public-trust-evidence/valid-statuses.json"), "utf8"),
) as PublicTrustEvidenceSnapshot;
const current = {
  source_commit: fixture.source_commit,
  application_deployment_id: fixture.application_deployment.id,
  marketing_deployment_id: fixture.marketing_deployment.id,
};
const now = Temporal.Instant.from("2026-08-26T13:00:00Z");

function response(value: unknown) {
  return Promise.resolve(new Response(JSON.stringify(value), { status: 200 }));
}

describe("public Trust page evidence", () => {
  beforeEach(() => clearPublicTrustEvidenceCacheForTests());

  it("renders all nine checks and all five status labels without relying on color", async () => {
    const evidence = await getPublicTrustEvidence({ fetcher: () => response(fixture), current, now });
    const html = renderToStaticMarkup(<TrustEvidencePanel evidence={evidence} />);

    expect(evidence.checks).toHaveLength(9);
    for (const status of ["Passed", "Failed", "Stale", "Not run", "Unavailable"]) {
      expect(html).toContain(`Status: ${status}`);
    }
    expect(html).toContain("Source to deployment provenance");
    expect(html).toContain("Public artifact integrity");
    expect(html).toContain("Open immutable evidence for");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it.each([
    ["missing evidence", {}],
    ["malformed evidence", { ...fixture, checks: "invalid" }],
  ])("never passes %s", async (_name, value) => {
    const evidence = await getPublicTrustEvidence({ fetcher: () => response(value), current, now });

    expect(evidence.feed_state).toBe("unavailable");
    expect(evidence.checks.every((check) => check.status === "unavailable")).toBe(true);
  });

  it("never passes evidence for a different deployment", async () => {
    const evidence = await getPublicTrustEvidence({
      fetcher: () => response(fixture),
      current: { ...current, application_deployment_id: "dpl_new" },
      now,
    });

    expect(evidence.checks.some((check) => check.status === "passed")).toBe(false);
  });

  it("keeps a validated cached copy Stale during a later outage", async () => {
    await getPublicTrustEvidence({ fetcher: () => response(fixture), current, now });
    const evidence = await getPublicTrustEvidence({
      fetcher: () => Promise.reject(new Error("offline")),
      current,
      now,
    });

    expect(evidence.feed_state).toBe("cached_stale");
    expect(evidence.checks.some((check) => check.status === "passed")).toBe(false);
    expect(evidence.checks.find((check) => check.id === "production_dependency_vulnerabilities")?.status).toBe("failed");
  });

  it("shows Unavailable when the host is unreachable before any valid snapshot", async () => {
    const evidence = await getPublicTrustEvidence({
      fetcher: () => Promise.reject(new Error("offline")),
      current,
      now,
    });

    expect(evidence.feed_state).toBe("unavailable");
    expect(evidence.snapshot).toBeNull();
  });
});
