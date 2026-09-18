#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const runNetworkChecks = args.has("--network");
const strict = args.has("--strict");
const registryRelativePath = "contracts/registry/provider_services.json";
const gitignoreRequiredLines = [".env", ".env.*", "!.env.example"];
const selfReferencePattern = /service-preflight|services:preflight/;

if (args.has("--help") || args.has("-h")) {
  console.log(`Service access preflight

Usage:
  node scripts/service-preflight.mjs
  node scripts/service-preflight.mjs --network
  node scripts/service-preflight.mjs --strict

Default mode reads contracts/registry/provider_services.json and checks every
active service (state locally_configured, linked, verified, or mutation_enabled;
legacy status connected) for required env-name presence and local preflight
command wiring without printing values. Services in earlier states
(planned/detected/recorded) are reported but not treated as failures.

--network runs each active service's recorded preflight_command with output
discarded. readback_command is intentionally not run during preflight. --strict
turns missing required env values for active services into failures.`);
  process.exit(0);
}

const failures = [];
const warnings = [];
let okCount = 0;

const file = (relativePath) => resolve(root, relativePath);

const parseEnvFile = (content) => {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const name = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(name, value);
  }
  return values;
};

const readJson = (relativePath) => {
  const absolutePath = file(relativePath);
  if (!existsSync(absolutePath)) return { exists: false, data: null, error: null };
  try {
    return { exists: true, data: JSON.parse(readFileSync(absolutePath, "utf8")), error: null };
  } catch (error) {
    return { exists: true, data: null, error };
  }
};

const packageJsonResult = readJson("package.json");
const packageJson = packageJsonResult.error ? null : packageJsonResult.data;
const packageScripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
let envLocalValues = null;

const loadEnvLocalValues = () => {
  if (envLocalValues) return envLocalValues;
  const envLocalPath = file(".env.local");
  envLocalValues = existsSync(envLocalPath) ? parseEnvFile(readFileSync(envLocalPath, "utf8")) : new Map();
  return envLocalValues;
};

const hasValue = (value) => typeof value === "string" && value.trim() !== "";

const envSource = (name) => {
  if (hasValue(process.env[name])) return "process.env";
  if (hasValue(loadEnvLocalValues().get(name))) return ".env.local";
  return null;
};

const printStatus = (state, label, detail = "") => {
  console.log(`${state.padEnd(8)} ${label}${detail ? ` ${detail}` : ""}`);
};

const ok = (label, detail = "") => {
  printStatus("OK", label, detail);
  okCount += 1;
};
const info = (label, detail = "") => printStatus("INFO", label, detail);
const warn = (label, detail = "") => {
  printStatus("WARN", label, detail);
  warnings.push(`${label}${detail ? ` ${detail}` : ""}`);
};
const fail = (label, detail = "") => {
  printStatus("MISSING", label, detail);
  failures.push(`${label}${detail ? ` ${detail}` : ""}`);
};
const section = (title) => console.log(`\n${title}`);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const listNames = (values) => values.join(", ");

const parseCommandWords = (command) => {
  const words = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (const char of command.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaped) current += "\\";
  if (current) words.push(current);
  return words;
};

const scriptInstalled = (name) => hasOwn(packageScripts, name);

const checkGenericFiles = () => {
  section("Project");

  const gitignorePath = file(".gitignore");
  const gitignoreLines = existsSync(gitignorePath)
    ? new Set(readFileSync(gitignorePath, "utf8").split(/\r?\n/).map((line) => line.trim()))
    : new Set();

  for (const line of gitignoreRequiredLines) {
    if (gitignoreLines.has(line)) ok(".gitignore", `(${line})`);
    else warn(".gitignore", `(missing ${line})`);
  }

  if (existsSync(file(".env.example"))) ok(".env.example");
  else warn(".env.example", "(missing)");
};

const checkRequiredEnv = (serviceName, requiredEnv) => {
  const missing = [];
  const present = [];

  for (const name of requiredEnv) {
    if (!isNonEmptyString(name)) continue;
    const source = envSource(name);
    if (source) present.push(`${name} from ${source}`);
    else missing.push(name);
  }

  if (present.length) ok(`${serviceName} required env`, `(${listNames(present)})`);
  if (!missing.length) return;

  const detail = `(missing ${listNames(missing)})`;
  if (strict) fail(`${serviceName} required env`, detail);
  else warn(`${serviceName} required env`, detail);
};

const checkNpmScriptWiring = (serviceName, scriptName) => {
  if (!isNonEmptyString(scriptName)) {
    warn(`${serviceName} preflight script`, "(npm run command is missing a script name)");
    return;
  }

  if (!packageJsonResult.exists) {
    warn(`${serviceName} preflight script`, `(package.json missing; cannot verify ${scriptName})`);
    return;
  }

  if (packageJsonResult.error) {
    warn(`${serviceName} preflight script`, `(package.json invalid; cannot verify ${scriptName})`);
    return;
  }

  if (scriptInstalled(scriptName)) ok(`${serviceName} preflight script`, `(${scriptName})`);
  else warn(`${serviceName} preflight script`, `(missing package script ${scriptName})`);
};

const checkFileCommandWiring = (serviceName, commandName, commandPath) => {
  if (!isNonEmptyString(commandPath) || commandPath.startsWith("-")) {
    info(`${serviceName} preflight command`, "(local wiring check skipped; run --network to execute)");
    return;
  }

  if (existsSync(file(commandPath))) ok(`${serviceName} preflight file`, `(${commandName} ${commandPath})`);
  else warn(`${serviceName} preflight file`, `(missing ${commandPath})`);
};

const checkCommandWiring = (serviceName, command) => {
  if (!isNonEmptyString(command)) return;

  const words = parseCommandWords(command);
  if (words[0] === "npm" && words[1] === "run") {
    checkNpmScriptWiring(serviceName, words[2]);
    return;
  }

  if (words[0] === "node" || words[0] === "python3") {
    checkFileCommandWiring(serviceName, words[0], words[1]);
    return;
  }

  info(`${serviceName} preflight command`, "(local wiring check skipped; run --network to execute)");
};

const runPreflightCommand = (serviceName, command) => {
  if (!isNonEmptyString(command)) return;

  if (selfReferencePattern.test(command)) {
    warn(`${serviceName} preflight command`, "(skipped self-reference to shared preflight)");
    return;
  }

  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "ignore",
  });

  if (result.status === 0) {
    ok(`${serviceName} preflight command`, "(exit 0)");
    return;
  }

  if (result.error) {
    fail(`${serviceName} preflight command`, "(failed to run)");
    return;
  }

  if (result.signal) {
    fail(`${serviceName} preflight command`, `(terminated by ${result.signal})`);
    return;
  }

  fail(`${serviceName} preflight command`, `(exit ${result.status ?? "unknown"})`);
};

const serviceNameFor = (entry, index) => (isNonEmptyString(entry?.name) ? entry.name : `service-${index + 1}`);

// v2 registries use `state` (planned..mutation_enabled); v1 used `status`
// (placeholder|connected). Entries at or past locally_configured are active.
const ACTIVE_STATES = new Set(["locally_configured", "linked", "verified", "mutation_enabled"]);
const LEGACY_STATUS_MAP = { placeholder: "recorded", connected: "verified" };

const serviceStateFor = (entry) => {
  if (isNonEmptyString(entry?.state)) return entry.state;
  if (isNonEmptyString(entry?.status) && LEGACY_STATUS_MAP[entry.status]) return LEGACY_STATUS_MAP[entry.status];
  if (isNonEmptyString(entry?.status)) return entry.status;
  return "unknown";
};

const activeServices = (services) =>
  services.filter((entry) => isNonEmptyString(entry?.name) && ACTIVE_STATES.has(serviceStateFor(entry)));

const checkRegistryServices = (services) => {
  section("Services");

  services.forEach((entry, index) => {
    const serviceName = serviceNameFor(entry, index);
    const state = serviceStateFor(entry);

    if (!ACTIVE_STATES.has(state)) {
      info(`${serviceName} recorded`, `(state ${state}); recorded only, not yet active`);
      return;
    }

    info(
      `${serviceName} policy`,
      `(scope_tier ${entry.scope_tier || "unrecorded"}; mutation_policy ${entry.mutation_policy || "unrecorded"})`,
    );
    checkRequiredEnv(serviceName, Array.isArray(entry.required_env) ? entry.required_env : []);
    checkCommandWiring(serviceName, entry.preflight_command);
  });
};

const runRegistryNetworkChecks = (services) => {
  section("Read-Only Network Checks");

  const runnable = activeServices(services).filter((entry) => isNonEmptyString(entry.preflight_command));
  if (!runnable.length) {
    info("Skipped", "(no active services with preflight_command)");
    return;
  }

  for (const entry of runnable) {
    runPreflightCommand(entry.name, entry.preflight_command);
  }
};

const printWarnings = () => {
  if (!warnings.length) return;
  section("Warnings");
  for (const warning of warnings) console.log(`- ${warning}`);
};

const printFailures = () => {
  if (!failures.length) return;
  section("Preflight failed");
  for (const failure of failures) console.error(`- ${failure}`);
};

const printSummary = () => {
  section(failures.length ? "Summary" : "Preflight passed");
  console.log(`preflight: ${okCount} ok, ${warnings.length} warnings, ${failures.length} failures`);
};

console.log("Service access preflight");
console.log("Secrets: values are redacted; only presence and read-only auth status are reported.");

checkGenericFiles();

const registryResult = readJson(registryRelativePath);
let registryServices = [];

if (!registryResult.exists) {
  warn(
    registryRelativePath,
    "(missing; run the service-connections-bootstrap installer to record connected services)",
  );
} else if (registryResult.error) {
  fail(registryRelativePath, `(invalid JSON: ${registryResult.error.message})`);
} else if (!Array.isArray(registryResult.data?.services)) {
  fail(registryRelativePath, "(missing services array)");
} else {
  ok(registryRelativePath);
  registryServices = registryResult.data.services;
  checkRegistryServices(registryServices);
}

if (registryServices.length) {
  if (runNetworkChecks) {
    runRegistryNetworkChecks(registryServices);
  } else {
    section("Read-Only Network Checks");
    info("Skipped", "Run `npm run services:preflight:network` to execute connected service preflights.");
  }
}

printWarnings();
printFailures();
printSummary();

if (failures.length) process.exit(1);
