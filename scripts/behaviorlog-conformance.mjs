#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(
  root,
  "tests/fixtures/behaviorlog-reference/validate.mjs",
);
const bundlePath = process.argv[2];

if (!bundlePath) {
  console.error("Usage: node scripts/behaviorlog-conformance.mjs <bundle.behaviorlog>");
  process.exit(2);
}

if (!existsSync(validatorPath)) {
  console.error(`Missing vendored BehaviorLog reference validator: ${validatorPath}`);
  process.exit(2);
}

if (!existsSync(bundlePath) || !statSync(bundlePath).isDirectory()) {
  console.error(`BehaviorLog bundle directory not found: ${bundlePath}`);
  process.exit(2);
}

const result = spawnSync(process.execPath, [validatorPath, bundlePath], {
  cwd: root,
  encoding: "utf8",
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
