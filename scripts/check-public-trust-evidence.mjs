import { readFileSync } from "node:fs";
import path from "node:path";
import { Temporal } from "@js-temporal/polyfill";

import {
  normalizePublicTrustEvidence,
  validatePublicTrustEvidence,
} from "../lib/resolvers/public-trust-evidence.resolver.ts";

const fixtureDirectory = path.join(
  process.cwd(),
  "tests/fixtures/public-trust-evidence",
);
const fixturePaths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["valid-statuses.json", "invalid-missing.json", "invalid-malformed.json"].map(
      (name) => path.join(fixtureDirectory, name),
    );

let failed = false;
for (const fixturePath of fixturePaths) {
  const value = JSON.parse(readFileSync(fixturePath, "utf8"));
  const result = validatePublicTrustEvidence(value);
  const expectedValid = path.basename(fixturePath).startsWith("valid-");
  if (result.ok !== expectedValid) {
    failed = true;
    console.error(`${fixturePath}: expected ${expectedValid ? "valid" : "invalid"}.`);
    if (!result.ok) for (const error of result.errors) console.error(`- ${error}`);
  }
  if (result.ok) {
    const current = {
      source_commit: result.value.source_commit,
      application_deployment_id: result.value.application_deployment.id,
      marketing_deployment_id: result.value.marketing_deployment.id,
    };
    const fresh = normalizePublicTrustEvidence(
      result.value,
      Temporal.Instant.from("2026-08-26T13:00:00Z"),
      current,
    );
    const expired = normalizePublicTrustEvidence(
      result.value,
      Temporal.Instant.from("2026-09-03T13:00:00Z"),
      current,
    );
    if (!fresh.ok || fresh.value.checks[0].status !== "passed") {
      failed = true;
      console.error(`${fixturePath}: matching unexpired Passed result did not remain Passed.`);
    }
    if (!expired.ok || expired.value.checks[0].status !== "stale") {
      failed = true;
      console.error(`${fixturePath}: expired Passed result did not become Stale.`);
    }
  }
}

if (failed) process.exit(1);
console.log(`public-trust:check passed (${fixturePaths.length} fixtures checked).`);
