import { readFileSync } from "node:fs";
import path from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  normalizePublicTrustEvidence,
  PUBLIC_TRUST_CHECK_IDS,
  PUBLIC_TRUST_CHECKS,
  validatePublicTrustEvidence,
  type PublicTrustEvidenceSnapshot,
} from "../lib/resolvers/public-trust-evidence.resolver";

const fixture = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      "tests/fixtures/public-trust-evidence/valid-statuses.json",
    ),
    "utf8",
  ),
) as PublicTrustEvidenceSnapshot;
const current = {
  source_commit: fixture.source_commit,
  application_deployment_id: fixture.application_deployment.id,
  marketing_deployment_id: fixture.marketing_deployment.id,
};

function changed(mutator: (value: Record<string, unknown>) => void): unknown {
  const value = structuredClone(fixture) as unknown as Record<string, unknown>;
  mutator(value);
  return value;
}

describe("public trust evidence validation", () => {
  it("accepts every required check and all five public statuses", () => {
    const result = validatePublicTrustEvidence(fixture);

    expect(result.ok).toBe(true);
    expect(new Set(fixture.checks.map((check) => check.id))).toEqual(
      new Set(PUBLIC_TRUST_CHECK_IDS),
    );
    expect(new Set(fixture.checks.map((check) => check.status))).toEqual(
      new Set(["passed", "failed", "stale", "not_run", "unavailable"]),
    );
  });

  it.each([
    ["missing required checks", (value: Record<string, unknown>) => {
      value.checks = (value.checks as unknown[]).slice(1);
    }],
    ["an unknown status", (value: Record<string, unknown>) => {
      ((value.checks as Record<string, unknown>[])[0]).status = "passing";
    }],
    ["an invalid timestamp", (value: Record<string, unknown>) => {
      value.verified_at = "2026-02-30T12:00:00Z";
    }],
    ["a mutable evidence URL", (value: Record<string, unknown>) => {
      ((value.checks as Record<string, unknown>[])[0]).evidence_url =
        "https://github.com/emixd12/habit-tracking-app/blob/main/evidence.json";
    }],
    ["a deployment mismatch", (value: Record<string, unknown>) => {
      ((value.checks as Record<string, unknown>[])[0]).application_deployment_id =
        "dpl_old";
    }],
    ["a prohibited sensitive field", (value: Record<string, unknown>) => {
      ((value.checks as Record<string, unknown>[])[0]).user_id = "private";
    }],
  ])("rejects %s", (_name, mutate) => {
    expect(validatePublicTrustEvidence(changed(mutate)).ok).toBe(false);
  });

  it("rejects an extended check-specific freshness deadline", () => {
    const result = validatePublicTrustEvidence(
      changed((value) => {
        ((value.checks as Record<string, unknown>[])[0]).freshness_deadline =
          "2026-08-28T12:00:00Z";
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("accepts immutable GitHub Pages paths containing the workflow and deployment IDs", () => {
    const result = validatePublicTrustEvidence(
      changed((value) => {
        const url =
          "https://emixd12.github.io/habit-tracking-app/trust/123456789/dpl_application/dpl_marketing/snapshot.json";
        value.snapshot_url = url;
        for (const check of value.checks as Record<string, unknown>[]) {
          check.evidence_url = url;
        }
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a mutable GitHub Pages latest pointer as evidence", () => {
    const result = validatePublicTrustEvidence(
      changed((value) => {
        value.snapshot_url =
          "https://emixd12.github.io/habit-tracking-app/trust/123456789/dpl_application/dpl_marketing/latest.json";
      }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("public trust evidence normalization", () => {
  it("keeps an unexpired matching Passed result Passed", () => {
    const result = normalizePublicTrustEvidence(
      fixture,
      Temporal.Instant.from("2026-08-27T11:59:59Z"),
      current,
    );

    expect(result.ok && result.value.checks[0].status).toBe("passed");
  });

  it("derives Stale after the check deadline", () => {
    const result = normalizePublicTrustEvidence(
      fixture,
      Temporal.Instant.from("2026-08-27T12:00:01Z"),
      current,
    );

    expect(result.ok && result.value.checks[0].status).toBe("stale");
  });

  it("derives Stale when the current deployment differs", () => {
    const result = normalizePublicTrustEvidence(
      fixture,
      Temporal.Instant.from("2026-08-26T13:00:00Z"),
      { ...current, application_deployment_id: "dpl_new" },
    );

    expect(result.ok && result.value.checks[0].status).toBe("stale");
  });

  it("preserves Failed, Not run, and Unavailable results", () => {
    const result = normalizePublicTrustEvidence(
      fixture,
      Temporal.Instant.from("2026-08-26T13:00:00Z"),
      current,
    );

    expect(
      result.ok &&
        result.value.checks
          .filter((check) => ["failed", "not_run", "unavailable"].includes(check.status))
          .map((check) => check.status),
    ).toEqual(["failed", "not_run", "unavailable"]);
  });
});

describe("public trust evidence schema", () => {
  it("defines a public meaning and scope limit for every required check", () => {
    expect(Object.keys(PUBLIC_TRUST_CHECKS)).toEqual(PUBLIC_TRUST_CHECK_IDS);
    for (const definition of Object.values(PUBLIC_TRUST_CHECKS)) {
      expect(definition.meaning.length).toBeGreaterThan(20);
      expect(definition.scopeLimit.length).toBeGreaterThan(20);
    }
  });
});
