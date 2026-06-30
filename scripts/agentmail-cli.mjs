#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envLocalPath = resolve(root, ".env.local");
const agentmailBinary = resolve(root, "node_modules/.bin/agentmail");
const commandArgs = process.argv.slice(2);
const args = commandArgs.length > 0 ? commandArgs : ["--help"];
const isHelpOrVersion = args.some((arg) =>
  ["--help", "-h", "--version", "-v"].includes(arg),
);
const envLocalValues = existsSync(envLocalPath)
  ? parseEnvFile(readFileSync(envLocalPath, "utf8"))
  : new Map();
const agentmailApiKey =
  normalizeEnvValue(process.env.AGENTMAIL_API_KEY) ??
  normalizeEnvValue(envLocalValues.get("AGENTMAIL_API_KEY"));

if (!existsSync(agentmailBinary)) {
  console.error(
    "AgentMail CLI is not installed locally. Run npm install before using AgentMail.",
  );
  process.exit(1);
}

if (!agentmailApiKey && !isHelpOrVersion) {
  console.error(
    "Missing AGENTMAIL_API_KEY. Add it to .env.local or the process environment before running AgentMail API commands.",
  );
  process.exit(1);
}

const result = spawnSync(agentmailBinary, args, {
  cwd: root,
  env: {
    ...process.env,
    AGENTMAIL_API_KEY: agentmailApiKey ?? "",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

function parseEnvFile(content) {
  const values = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values.set(key, value);
  }

  return values;
}

function normalizeEnvValue(value) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}
