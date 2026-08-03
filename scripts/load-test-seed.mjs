import { basename } from "node:path";

import {
  parseLoadFixtureArgs,
  seedLoadRun,
  summarizeLifecycleResult,
} from "./load-test-fixtures.mjs";

try {
  const result = await seedLoadRun(
    parseLoadFixtureArgs(process.argv.slice(2)),
  );
  console.log(summarizeLifecycleResult("Load fixture seed", result.summary));
} catch (error) {
  console.error(
    `${basename(process.argv[1])}: ${
      error instanceof Error ? error.message : "Load fixture seed failed."
    }`,
  );
  process.exitCode = 1;
}
