import { basename } from "node:path";

import {
  cleanupLoadRun,
  parseLoadFixtureArgs,
  summarizeLifecycleResult,
} from "./load-test-fixtures.mjs";

try {
  const result = await cleanupLoadRun(
    parseLoadFixtureArgs(process.argv.slice(2)),
  );
  console.log(summarizeLifecycleResult("Load fixture cleanup", result.summary));
} catch (error) {
  console.error(
    `${basename(process.argv[1])}: ${
      error instanceof Error ? error.message : "Load fixture cleanup failed."
    }`,
  );
  process.exitCode = 1;
}
