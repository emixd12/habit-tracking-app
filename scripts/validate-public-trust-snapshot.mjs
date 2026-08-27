import { readFile } from "node:fs/promises";

import { validatePublicTrustEvidence } from "../lib/resolvers/public-trust-evidence.resolver.ts";
import { validatePublicTrustDetails } from "./publish-public-trust-evidence.mjs";

const snapshot = JSON.parse(await readFile(process.argv[2], "utf8"));
const result = validatePublicTrustEvidence(snapshot);
if (!result.ok) throw new Error(`Public Trust snapshot is invalid: ${result.errors.join(" ")}`);
if (process.argv[3]) {
  const details = JSON.parse(await readFile(process.argv[3], "utf8"));
  validatePublicTrustDetails(details, snapshot);
}
console.log("Public Trust snapshot schema and sanitization passed.");
