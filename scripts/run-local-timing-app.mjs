import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function runNpm(args, label) {
  console.log(`\n${label}`);

  const result = spawnSync("npm", args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function readLocalSupabaseEnvironment() {
  return spawnSync(
    "npm",
    ["run", "--silent", "supabase", "--", "status", "-o", "env"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function parseEnvironmentValue(rawValue) {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue);
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

function parseSupabaseEnvironment(output) {
  const environment = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }

    environment[match[1]] = parseEnvironmentValue(match[2].trim());
  }

  return environment;
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function ensureLocalSupabase() {
  let status = readLocalSupabaseEnvironment();

  if (status.status !== 0) {
    runNpm(["run", "supabase", "--", "start"], "Starting local Supabase...");
    status = readLocalSupabaseEnvironment();
  } else {
    console.log("\nLocal Supabase is already running.");
  }

  if (status.error) {
    throw new Error(`Reading local Supabase failed: ${status.error.message}`);
  }

  if (status.status !== 0) {
    const detail = status.stderr.trim();
    throw new Error(
      detail
        ? `Reading local Supabase failed: ${detail}`
        : "Reading local Supabase failed.",
    );
  }

  return parseSupabaseEnvironment(status.stdout);
}

function startNext(environment) {
  const publicKey = environment.PUBLISHABLE_KEY || environment.ANON_KEY;

  if (!isLoopbackUrl(environment.API_URL)) {
    throw new Error("Refusing to start against a non-local Supabase URL.");
  }

  if (!publicKey || !environment.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase did not return the required runtime keys.");
  }

  console.log("\nStarting Cadence at http://localhost:3000 ...");

  const child = spawn("npm", ["run", "dev", "--", "--port", "3000"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CADENCE_ENABLE_TEST_LOGIN: "1",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
      NEXT_PUBLIC_SUPABASE_URL: environment.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: environment.SERVICE_ROLE_KEY,
    },
    stdio: "inherit",
  });

  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (!stopping) {
        stopping = true;
        child.kill(signal);
      }
    });
  }

  child.on("error", (error) => {
    console.error(`Cadence failed to start: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal === "SIGINT") {
      process.exitCode = 130;
      return;
    }

    if (signal === "SIGTERM") {
      process.exitCode = 143;
      return;
    }

    process.exitCode = code ?? 1;
  });
}

try {
  runNpm(["install"], "Installing dependencies...");
  ensureLocalSupabase();
  runNpm(
    ["run", "supabase", "--", "migration", "up", "--local"],
    "Applying local migrations...",
  );
  const environment = ensureLocalSupabase();
  startNext(environment);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n${message}`);
  process.exitCode = 1;
}
