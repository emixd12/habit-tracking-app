import { basename } from "node:path";

import {
  parseLoadFixtureArgs,
  summarizeLifecycleResult,
  verifyLoadRunIntegrity,
} from "./load-test-fixtures.mjs";

try {
  const result = await verifyLoadRunIntegrity(
    parseLoadFixtureArgs(process.argv.slice(2)),
  );
  console.log(
    summarizeLifecycleResult("Load fixture integrity", result.summary),
  );
} catch (error) {
  console.error(
    `${basename(process.argv[1])}: ${
      error instanceof Error ? error.message : "Load fixture integrity failed."
    }`,
  );
  process.exitCode = 1;
}
