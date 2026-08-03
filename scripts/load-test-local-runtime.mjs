import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  cpus,
  freemem,
  homedir,
  loadavg,
  platform,
} from "node:os";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";

import { readLocalSupabaseConfig } from "./load-test-fixtures.mjs";
import {
  assertSanitizedArtifact,
  sanitizeLoadOutput,
} from "./load-test-read-report.mjs";

const PRIVATE_ENV_PATTERN =
  /(SECRET|TOKEN|KEY|PASSWORD|COOKIE|SUPABASE|SEQUENZY|VAPID|AGENTMAIL|DATABASE|DB_URL|VERCEL|CADENCE_LOAD_SESSION|REMINDER_PROCESS|CRON)/i;

export const DEFAULT_LOCAL_RESOURCE_CEILINGS = Object.freeze({
  max_host_load_per_logical_cpu: 2,
  min_available_memory_bytes: 512 * 1024 * 1024,
  max_app_rss_bytes: 4 * 1024 * 1024 * 1024,
  max_locust_rss_bytes: 4 * 1024 * 1024 * 1024,
});

export function safeLoadEnvironment(extra = {}) {
  const safe = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !PRIVATE_ENV_PATTERN.test(name)) {
      safe[name] = value;
    }
  }
  return { ...safe, ...extra };
}

export function locustWorkerEnvironment(extra = {}) {
  const allowedNames = [
    "PATH",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "TZ",
  ];
  const environment = {};
  for (const name of allowedNames) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return {
    ...environment,
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "127.0.0.1,localhost,::1",
    ...extra,
  };
}

export function readExplicitLocalSupabaseConfig({
  root,
  baseUrl,
}) {
  const result = spawnSync(
    "npm",
    ["run", "supabase", "--", "status", "-o", "env"],
    {
      cwd: root,
      encoding: "utf8",
      env: safeLoadEnvironment({
        SUPABASE_TELEMETRY_DISABLED: "1",
      }),
    },
  );
  if (result.status !== 0) {
    throw new Error(
      "The project-local Supabase stack is unavailable.",
    );
  }

  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  const config = readLocalSupabaseConfig(
    {
      CADENCE_LOAD_TARGET: "local",
      CADENCE_LOAD_BASE_URL: baseUrl,
      NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        values.PUBLISHABLE_KEY ?? values.ANON_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        values.PUBLISHABLE_KEY ?? values.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
    },
    path.join(root, "load-tests", ".absent-local-load-env"),
  );
  return {
    ...config,
    databaseUrl: values.DB_URL ?? null,
  };
}

export function assertLocalRuntimeDependencies({
  root,
  requiredFiles,
}) {
  for (const [filePath, label] of requiredFiles) {
    if (!existsSync(filePath)) {
      throw new Error(`${label} is unavailable.`);
    }
  }

  const docker = spawnSync("docker", ["info"], {
    cwd: root,
    encoding: "utf8",
    env: safeLoadEnvironment(),
  });
  if (docker.status !== 0) {
    throw new Error("Docker is unavailable for the local load suite.");
  }
}

export async function assertLocalPortAvailable(baseUrl) {
  const target = new URL(baseUrl);
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => {
      reject(
        new Error(
          "The declared local Cadence port is already in use.",
        ),
      );
    });
    server.listen(Number(target.port), target.hostname, () => {
      server.close(resolve);
    });
  });
}

export async function waitForLocalApp({
  process: child,
  url,
  marker,
  attempts = 120,
  intervalMilliseconds = 250,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child?.exitCode !== null) {
      throw new Error(
        "The local production app exited before readiness.",
      );
    }
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });
      if (
        response.status >= 200 &&
        response.status < 400 &&
        (await response.text()).includes(marker)
      ) {
        return;
      }
    } catch {
      // Readiness is retried within the bounded attempt count.
    }
    await delay(intervalMilliseconds);
  }
  throw new Error("Timed out waiting for the local production app.");
}

export async function runSanitizedChild(
  command,
  args,
  {
    root,
    env,
    replacements = [],
    activeChildren,
  },
) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  trackChild(child, activeChildren);
  forwardSanitizedLines(child.stdout, process.stdout, replacements);
  forwardSanitizedLines(child.stderr, process.stderr, replacements);
  return {
    child,
    exitCode: await childExit(child),
  };
}

export function startSanitizedChild(
  command,
  args,
  {
    root,
    env,
    replacements = [],
    activeChildren,
  },
) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  trackChild(child, activeChildren);
  forwardSanitizedLines(child.stdout, process.stdout, replacements);
  forwardSanitizedLines(child.stderr, process.stderr, replacements);
  return child;
}

export function trackChild(child, activeChildren) {
  activeChildren?.add(child);
  child.once("exit", () => activeChildren?.delete(child));
  child.once("error", () => activeChildren?.delete(child));
}

export function forwardSanitizedLines(
  stream,
  destination,
  replacements,
) {
  const lines = readline.createInterface({ input: stream });
  lines.on("line", (line) => {
    const resolved =
      typeof replacements === "function"
        ? replacements()
        : replacements;
    destination.write(`${sanitizeLoadOutput(line, resolved)}\n`);
  });
}

export function childExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

export async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([childExit(child), delay(5_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

export function startLocalResourceMonitor({
  appPid,
  locustPid,
  locustRssRequiredDurationMilliseconds = Number.POSITIVE_INFINITY,
  ceilings = DEFAULT_LOCAL_RESOURCE_CEILINGS,
  onBreach,
}) {
  const logicalCpuCount = Math.max(1, cpus().length);
  const startedAt = performance.now();
  const state = {
    samples: 0,
    max_host_load_1m: 0,
    max_host_load_per_logical_cpu: 0,
    min_available_memory_bytes: Number.POSITIVE_INFINITY,
    max_app_rss_bytes: 0,
    max_locust_rss_bytes: 0,
    first_app_rss_bytes: null,
    final_app_rss_bytes: null,
    first_locust_rss_bytes: null,
    final_locust_rss_bytes: null,
    resource_samples: [],
    breaches: new Set(),
  };

  const sample = () => {
    const elapsedMilliseconds = Math.max(
      0,
      performance.now() - startedAt,
    );
    const hostLoad = loadavg()[0] ?? 0;
    const loadPerCpu = hostLoad / logicalCpuCount;
    const availableMemory = readAvailableMemoryBytes();
    const appRss = readProcessRssBytes(appPid);
    const locustRss = readProcessRssBytes(locustPid);
    state.samples += 1;
    state.resource_samples.push({
      elapsed_milliseconds: elapsedMilliseconds,
      host_load_1m: hostLoad,
      host_load_per_logical_cpu: loadPerCpu,
      available_memory_bytes: availableMemory,
      app_rss_bytes: appRss,
      locust_rss_bytes: locustRss,
    });
    state.max_host_load_1m = Math.max(state.max_host_load_1m, hostLoad);
    state.max_host_load_per_logical_cpu = Math.max(
      state.max_host_load_per_logical_cpu,
      loadPerCpu,
    );
    state.min_available_memory_bytes = Math.min(
      state.min_available_memory_bytes,
      availableMemory,
    );
    if (appRss === null) {
      state.breaches.add("app RSS measurement");
    } else {
      state.max_app_rss_bytes = Math.max(
        state.max_app_rss_bytes,
        appRss,
      );
      state.first_app_rss_bytes ??= appRss;
      state.final_app_rss_bytes = appRss;
    }
    if (locustRss === null) {
      const locustRssStillRequired =
        elapsedMilliseconds <
        locustRssRequiredDurationMilliseconds;
      if (locustRssStillRequired) {
        state.breaches.add("Locust RSS measurement");
      }
    } else {
      state.max_locust_rss_bytes = Math.max(
        state.max_locust_rss_bytes,
        locustRss,
      );
      state.first_locust_rss_bytes ??= locustRss;
      state.final_locust_rss_bytes = locustRss;
    }

    if (loadPerCpu > ceilings.max_host_load_per_logical_cpu) {
      state.breaches.add("host load");
    }
    if (
      availableMemory < ceilings.min_available_memory_bytes
    ) {
      state.breaches.add("available memory");
    }
    if (
      appRss !== null &&
      appRss > ceilings.max_app_rss_bytes
    ) {
      state.breaches.add("app RSS");
    }
    if (
      locustRss !== null &&
      locustRss > ceilings.max_locust_rss_bytes
    ) {
      state.breaches.add("Locust RSS");
    }
    if (state.breaches.size > 0) onBreach?.();
  };

  sample();
  const interval = setInterval(sample, 5_000);
  interval.unref();

  return {
    stop() {
      clearInterval(interval);
      sample();
      return {
        samples: state.samples,
        max_host_load_1m: state.max_host_load_1m,
        max_host_load_per_logical_cpu:
          state.max_host_load_per_logical_cpu,
        min_available_memory_bytes:
          state.min_available_memory_bytes === Number.POSITIVE_INFINITY
            ? null
            : state.min_available_memory_bytes,
        max_app_rss_bytes: state.max_app_rss_bytes,
        max_locust_rss_bytes: state.max_locust_rss_bytes,
        first_app_rss_bytes: state.first_app_rss_bytes,
        final_app_rss_bytes: state.final_app_rss_bytes,
        first_locust_rss_bytes: state.first_locust_rss_bytes,
        final_locust_rss_bytes: state.final_locust_rss_bytes,
        resource_samples: state.resource_samples.map((resourceSample) => ({
          ...resourceSample,
        })),
        breaches: [...state.breaches],
      };
    },
  };
}

export function sanitizeLocustStageArtifacts({
  prefix,
  replacements,
  secretNeedles,
}) {
  const directory = path.dirname(prefix);
  const basename = path.basename(prefix);
  const expectedNames = [
    `${basename}.html`,
    `${basename}_exceptions.csv`,
    `${basename}_failures.csv`,
    `${basename}_semantic-verifications.json`,
    `${basename}_stats.csv`,
    `${basename}_stats_history.csv`,
  ].sort();
  const artifactPaths = readdirSync(directory)
    .filter(
      (name) =>
        name === `${basename}.html` ||
        name.startsWith(`${basename}_`),
    )
    .map((name) => path.join(directory, name))
    .filter((filePath) => statSync(filePath).isFile());

  for (const artifactPath of artifactPaths) {
    const sanitized = sanitizeLoadOutput(
      readFileSync(artifactPath, "utf8"),
      replacements,
    );
    writeFileSync(artifactPath, sanitized, {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(artifactPath, 0o600);
  }

  const errors = [];
  for (const artifactPath of artifactPaths) {
    try {
      assertSanitizedArtifact({
        content: readFileSync(artifactPath, "utf8"),
        secretNeedles,
        label: path.basename(artifactPath),
      });
    } catch (error) {
      rmSync(artifactPath);
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
  const actualNames = artifactPaths
    .map((artifactPath) => path.basename(artifactPath))
    .sort();
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some(
      (artifactName, index) =>
        artifactName !== expectedNames[index],
    )
  ) {
    throw new Error(
      `${basename} did not retain the exact mutation-stage artifact inventory.`,
    );
  }
  return artifactPaths;
}

export function privateOutputReplacements(
  replacements,
  secretNeedles,
) {
  return [
    ...replacements,
    ...secretNeedles
      .filter((value) => typeof value === "string" && value)
      .map((value) => ({
        value,
        label: "[redacted-private]",
      })),
  ];
}

export function readLocalDatabaseConnectionCount({
  root,
  databaseUrl,
}) {
  if (typeof databaseUrl !== "string" || !databaseUrl) return null;
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return null;
  }
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return null;
  }

  const containers = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      `publish=${port}`,
      "--format",
      "{{.Names}}",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: safeLoadEnvironment(),
    },
  );
  if (containers.status !== 0) return null;
  const databaseContainers = containers.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => name.startsWith("supabase_db_"));
  if (databaseContainers.length !== 1) return null;

  const result = spawnSync(
    "docker",
    [
      "exec",
      databaseContainers[0],
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      "select count(*) from pg_stat_activity where datname = current_database()",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: safeLoadEnvironment(),
    },
  );
  const count = Number(result.stdout.trim());
  return result.status === 0 && Number.isInteger(count) && count >= 0
    ? count
    : null;
}

export function buildPrivatePathReplacements({
  root,
  sessionPath,
}) {
  return [
    ...(sessionPath
      ? [{ value: sessionPath, label: "[private-session]" }]
      : []),
    { value: root, label: "[workspace]" },
    { value: homedir(), label: "[home]" },
  ];
}

function readAvailableMemoryBytes() {
  if (platform() !== "darwin") return freemem();
  const result = spawnSync("vm_stat", [], {
    encoding: "utf8",
    env: safeLoadEnvironment(),
  });
  if (result.status !== 0) return freemem();

  const pageSize = Number(
    /page size of ([0-9]+) bytes/i.exec(result.stdout)?.[1],
  );
  if (!Number.isFinite(pageSize) || pageSize <= 0) return freemem();

  const reclaimableLabels = new Set([
    "Pages free",
    "Pages inactive",
    "Pages speculative",
    "Pages purgeable",
  ]);
  let pages = 0;
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([^:]+):\s+([0-9]+)\./.exec(line.trim());
    if (match && reclaimableLabels.has(match[1])) {
      pages += Number(match[2]);
    }
  }
  return pages > 0 ? pages * pageSize : freemem();
}

function readProcessRssBytes(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  let result;
  try {
    result = spawnSync(
      "ps",
      ["-o", "rss=", "-p", String(pid)],
      {
        encoding: "utf8",
        env: safeLoadEnvironment(),
      },
    );
  } catch {
    return null;
  }
  const kibibytes = Number(result.stdout?.trim());
  return result.status === 0 &&
    !result.error &&
    Number.isSafeInteger(kibibytes) &&
    kibibytes > 0
    ? kibibytes * 1024
    : null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
