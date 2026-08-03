import { basename } from "node:path";

import {
  parseLoadFixtureArgs,
  provisionLoadRun,
  summarizeLifecycleResult,
} from "./load-test-fixtures.mjs";

try {
  const result = await provisionLoadRun(
    parseLoadFixtureArgs(process.argv.slice(2)),
  );
  console.log(summarizeLifecycleResult("Load fixture provision", result.summary));
} catch (error) {
  console.error(
    `${basename(process.argv[1])}: ${
      error instanceof Error ? error.message : "Load fixture provision failed."
    }`,
  );
  process.exitCode = 1;
}
