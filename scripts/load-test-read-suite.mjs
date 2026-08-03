import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
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
  release,
  totalmem,
} from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import net from "node:net";
import readline from "node:readline";

import { Temporal } from "@js-temporal/polyfill";

import {
  cleanupLoadRun,
  provisionLoadRun,
  readLocalSupabaseConfig,
  refreshLoadRunSessions,
  validateLoadRunId,
  verifyLoadRunIntegrity,
} from "./load-test-fixtures.mjs";
import {
  assertSanitizedArtifact,
  countCsvDataRows,
  countUnexpected5xxFailures,
  evaluateRecoveryGate,
  evaluateStageGates,
  parseLocustPeakUsers,
  parseLocustStatsCsv,
  sanitizeLoadOutput,
  summarizeArtifactDigest,
} from "./load-test-read-report.mjs";

const root = process.cwd();
const baseUrl = "http://127.0.0.1:3100";
const runsRoot = path.join(root, "load-tests", ".runs");
const locustExecutable = path.join(
  root,
  "load-tests",
  ".venv",
  "bin",
  "locust",
);
const pythonExecutable = path.join(
  root,
  "load-tests",
  ".venv",
  "bin",
  "python",
);
const nextExecutable = path.join(root, "node_modules", ".bin", "next");
const locustFile = path.join(root, "load-tests", "read_locustfile.py");
const DEFAULT_TIMEZONE = "America/New_York";
const SUITES = new Set(["smoke", "baseline", "ramp", "full"]);
const PRIVATE_ENV_PATTERN =
  /(SECRET|TOKEN|KEY|PASSWORD|COOKIE|SUPABASE|SEQUENZY|VAPID|AGENTMAIL|DATABASE|DB_URL|VERCEL|CADENCE_LOAD_SESSION|REMINDER_PROCESS|CRON)/i;
const BLANK_APP_ENV = Object.freeze({
  SUPABASE_SERVICE_ROLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  SEQUENZY_API_KEY: "",
  SEQUENZY_REMINDER_TEMPLATE_SLUG: "",
  SEQUENZY_API_URL: "",
  SEQUENZY_APP_URL: "",
  AGENTMAIL_API_KEY: "",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
  REMINDER_PROCESS_SECRET: "",
  CRON_SECRET: "",
});
const RESOURCE_CEILINGS = Object.freeze({
  max_host_load_per_logical_cpu: 2,
  min_available_memory_bytes: 512 * 1024 * 1024,
  max_app_rss_bytes: 4 * 1024 * 1024 * 1024,
  max_locust_rss_bytes: 4 * 1024 * 1024 * 1024,
});
export const LOCUST_REQUEST_FAILURE_EXIT_CODE = 0;
export const REQUIRED_READ_REQUEST_NAMES = Object.freeze([
  "INT-AUTH-003 GET /login public-document",
  "INT-LEGAL-001 GET /terms public-document",
  "INT-LEGAL-001 GET /privacy public-document",
  "INT-LEGAL-001 GET /trust public-document",
  "INT-SHELL-001 GET /timeline protected-document",
  "INT-SHELL-001 GET /behaviors protected-document",
  "INT-SHELL-001 GET /export protected-document",
  "INT-SHELL-001 GET /settings protected-document",
  "INT-TIMELINE-001 GET /timeline future-query",
  "INT-BEHAVIOR-001 GET /behaviors range-query",
  "INT-BEHAVIOR-002 GET /behaviors selected-day-query",
  "INT-EXPORT-005 GET /api/export/jsonl structured-export",
  "INT-EXPORT-005 GET /api/export/csv structured-export",
  "INT-EXPORT-005 GET /api/export/json structured-export",
  "INT-EXPORT-005 GET /api/export/behaviorlog structured-export",
]);

const STAGES = Object.freeze({
  smoke: Object.freeze([
    stage("smoke-1", "smoke", 1, 1, 180),
  ]),
  warm: Object.freeze([
    stage("warm-1", "smoke", 1, 1, 120),
  ]),
  baseline: Object.freeze([
    stage("baseline-5", "baseline", 5, 1, 600),
    stage("baseline-10", "baseline", 10, 1, 600),
  ]),
  ramp: Object.freeze([
    stage("ramp-10", "ramp", 10, 2, 240),
    stage("ramp-25", "ramp", 25, 3, 240),
    stage("ramp-50", "ramp", 50, 5, 240),
    stage("ramp-100", "ramp", 100, 10, 240),
  ]),
  recovery: Object.freeze([
    stage("recovery-10", "recovery", 10, 2, 300),
  ]),
  heavy: Object.freeze([
    stage("heavy-5", "heavy", 5, 1, 300, "heavy_schedule"),
  ]),
});

let appProcess = null;
let locustProcess = null;
let interrupted = false;
const lifecycleAbortController = new AbortController();
const activeChildren = new Set();

export function buildReadSuitePlan(suite) {
  if (!SUITES.has(suite)) {
    throw new Error("Read-load suite must be smoke, baseline, ramp, or full.");
  }

  if (suite === "smoke") {
    return {
      accountCount: 1,
      heavyCount: 0,
      stages: [...STAGES.smoke, ...STAGES.warm],
    };
  }
  if (suite === "baseline") {
    return {
      accountCount: 10,
      heavyCount: 0,
      stages: [...STAGES.smoke, ...STAGES.warm, ...STAGES.baseline],
    };
  }
  if (suite === "ramp") {
    return {
      accountCount: 100,
      heavyCount: 0,
      stages: [
        ...STAGES.smoke,
        ...STAGES.warm,
        ...STAGES.baseline,
        ...STAGES.ramp,
        ...STAGES.recovery,
      ],
    };
  }
  return {
    accountCount: 105,
    heavyCount: 5,
    stages: [
      ...STAGES.smoke,
      ...STAGES.warm,
      ...STAGES.baseline,
      ...STAGES.ramp,
      ...STAGES.recovery,
      ...STAGES.heavy,
    ],
  };
}

export function createLoadRunId(now = new Date()) {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z")
    .replace("T", "t");
  return validateLoadRunId(
    `${timestamp}-${randomBytes(6).toString("hex")}`,
  );
}

export function assertAnchorDate(anchorLocalDate, now = Temporal.Now.instant()) {
  const current = now
    .toZonedDateTimeISO(DEFAULT_TIMEZONE)
    .toPlainDate()
    .toString();
  if (current !== anchorLocalDate) {
    throw new Error(
      "The local date crossed the fixture anchor; the bounded read run was stopped before advancing.",
    );
  }
}

function stage(
  name,
  profile,
  users,
  spawnRate,
  durationSeconds,
  cohortFilter,
) {
  return {
    name,
    profile,
    users,
    spawnRate,
    durationSeconds,
    cohortFilter: cohortFilter ?? null,
  };
}

function parseSuiteArgument(argv) {
  const index = argv.indexOf("--suite");
  const value = index >= 0 ? argv[index + 1] : "full";
  if (!value || !SUITES.has(value)) {
    throw new Error("--suite must be smoke, baseline, ramp, or full.");
  }
  return value;
}

function safeEnvironment(extra = {}) {
  const safe = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !PRIVATE_ENV_PATTERN.test(name)) {
      safe[name] = value;
    }
  }
  return { ...safe, ...extra };
}

function locustWorkerEnvironment(extra = {}) {
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

function readExplicitLocalConfig() {
  const result = spawnSync(
    "npm",
    ["run", "supabase", "--", "status", "-o", "env"],
    {
      cwd: root,
      encoding: "utf8",
      env: safeEnvironment({
        SUPABASE_TELEMETRY_DISABLED: "1",
      }),
    },
  );
  if (result.status !== 0) {
    throw new Error(
      "The project-local Supabase stack is unavailable. Start it before the read suite.",
    );
  }

  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }

  return readLocalSupabaseConfig(
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
}

function assertDependencies() {
  for (const [filePath, label] of [
    [locustExecutable, "Locust"],
    [pythonExecutable, "the load-test Python environment"],
    [nextExecutable, "Next.js"],
    [locustFile, "the Ticket 064 Locust entrypoint"],
  ]) {
    if (!existsSync(filePath)) {
      throw new Error(`${label} is unavailable.`);
    }
  }

  const docker = spawnSync("docker", ["info"], {
    cwd: root,
    encoding: "utf8",
    env: safeEnvironment(),
  });
  if (docker.status !== 0) {
    throw new Error("Docker is unavailable for the local read suite.");
  }
}

async function assertPortAvailable() {
  const target = new URL(baseUrl);
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => {
      reject(
        new Error(
          "The declared local Cadence port is already in use; the supervisor will not reuse an unknown process.",
        ),
      );
    });
    server.listen(Number(target.port), target.hostname, () => {
      server.close(resolve);
    });
  });
}

function createAppEnvironment(config) {
  return safeEnvironment({
    ...BLANK_APP_ENV,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    CADENCE_PERF_LOG: "0",
    NEXT_PUBLIC_SITE_URL: baseUrl,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.publishableKey,
  });
}

async function buildProductionApp(config, replacements) {
  console.log("Building the local production-mode Next.js app.");
  const result = await runChild(
    "npm",
    ["run", "build"],
    {
      env: createAppEnvironment(config),
      replacements,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error("The local production build failed.");
  }
}

function startProductionApp(config, replacements) {
  const target = new URL(baseUrl);
  appProcess = spawn(
    nextExecutable,
    [
      "start",
      "--hostname",
      target.hostname,
      "--port",
      target.port,
    ],
    {
      cwd: root,
      env: createAppEnvironment(config),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  trackChild(appProcess);
  forwardSanitizedLines(appProcess.stdout, process.stdout, replacements);
  forwardSanitizedLines(appProcess.stderr, process.stderr, replacements);
}

async function waitForApp() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (appProcess?.exitCode !== null) {
      throw new Error("The local production app exited before readiness.");
    }
    try {
      const response = await fetch(`${baseUrl}/terms`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });
      if (
        response.status >= 200 &&
        response.status < 400 &&
        (await response.text()).includes("Terms")
      ) {
        return;
      }
    } catch {
      // Readiness is bounded and retried.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the local production app.");
}

async function prewarmOrdinarySessions(session, replacements) {
  const identities = session.identities;
  let nextIndex = 0;
  const concurrency = Math.min(8, identities.length);

  console.log(
    `Prewarming ${identities.length} ordinary RLS sessions outside timed statistics.`,
  );

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= identities.length) return;
        assertNotInterrupted();
        await prewarmIdentity(identities[index], replacements);
      }
    }),
  );
}

async function prewarmIdentity(identity, replacements) {
  const headers = { cookie: cookieHeader(identity.cookies) };
  const timeline = await fetch(`${baseUrl}/timeline?days=30`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  const timelineBody = await timeline.text();
  if (
    timeline.status < 200 ||
    timeline.status >= 400 ||
    timeline.headers.get("location")?.includes("/login") ||
    timelineBody.includes("Continue with Google") ||
    !timelineBody.includes("Timeline")
  ) {
    throw new Error("An ordinary prewarmed session failed protected Timeline.");
  }

  const exportResponse = await fetch(
    `${baseUrl}/api/export/json?range=all&include_archived=1&include_notes=1`,
    {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    },
  );
  const exportBody = await exportResponse.text();
  if (
    exportResponse.status < 200 ||
    exportResponse.status >= 300 ||
    !exportResponse.headers
      .get("content-type")
      ?.includes("application/json")
  ) {
    throw new Error("An ordinary prewarmed session failed structured export.");
  }

  const markers = new Set(
    exportBody.match(/\bcadence-owner-[a-f0-9]{20}\b/gi) ?? [],
  );
  const ownerMarker = identity.selectors.owner_marker;
  const expectedMarkers =
    identity.cohort === "empty" ? [] : [ownerMarker];
  if (
    markers.size !== expectedMarkers.length ||
    expectedMarkers.some((marker) => !markers.has(marker))
  ) {
    throw new Error(
      "A deterministic ordinary-session export ownership check failed.",
    );
  }

  assertSanitizedArtifact({
    content: sanitizeLoadOutput(exportBody, replacements),
    label: "in-memory prewarm export",
  });
}

async function verifyDeterministicRouteContract(session) {
  const representative =
    session.identities.find(
      (identity) => identity.cohort === "typical_daily",
    ) ??
    session.identities.find((identity) => identity.cohort !== "empty");
  if (!representative) {
    throw new Error(
      "Deterministic route coverage requires one nonempty ordinary identity.",
    );
  }
  const exportIdentity =
    session.identities.find(
      (identity) => identity.cohort === "export_heavy",
    ) ?? representative;
  const checked = [];

  const publicDocuments = [
    ["/login", "Continue with Google"],
    ["/terms", "Terms"],
    ["/privacy", "Privacy"],
    ["/trust", "Trust"],
  ];
  for (const [route, marker] of publicDocuments) {
    const response = await fetch(`${baseUrl}${route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.text();
    if (
      response.status < 200 ||
      response.status >= 400 ||
      !body.includes(marker)
    ) {
      throw new Error(
        "Deterministic public-document coverage failed.",
      );
    }
    checked.push(`GET ${route}`);
  }

  const selectors = representative.selectors;
  const protectedDocuments = [
    ["/timeline", true, "Timeline"],
    ["/timeline?days=30", true, "Timeline future"],
    ["/behaviors", true, "Behaviors"],
    ["/behaviors?range=90", true, "Behaviors range"],
    [
      `/behaviors?range=30&behavior=${encodeURIComponent(
        selectors.behavior_id,
      )}&day=${encodeURIComponent(selectors.local_date)}`,
      true,
      "Behaviors selected day",
    ],
    [
      "/export?range=all&include_archived=1&include_notes=1",
      false,
      "Export page",
    ],
    ["/settings", false, "Settings"],
  ];
  const headers = {
    cookie: cookieHeader(representative.cookies),
  };
  for (const [route, requireOwner, label] of protectedDocuments) {
    const response = await fetch(`${baseUrl}${route}`, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.text();
    assertDeterministicOwnerMarkers(
      body,
      representative.selectors.owner_marker,
      requireOwner,
      label,
    );
    if (
      response.status < 200 ||
      response.status >= 400 ||
      response.headers.get("location")?.includes("/login") ||
      body.includes("Continue with Google")
    ) {
      throw new Error(
        "Deterministic protected-document coverage failed.",
      );
    }
    checked.push(`GET ${route.split("?")[0]}`);
  }

  const exportHeaders = {
    cookie: cookieHeader(exportIdentity.cookies),
  };
  const exports = [
    ["jsonl", "application/x-ndjson"],
    ["csv", "text/csv"],
    ["json", "application/json"],
    ["behaviorlog", "application/zip"],
  ];
  for (const [format, contentType] of exports) {
    const route = `/api/export/${format}?range=all&include_archived=1&include_notes=1`;
    const response = await fetch(`${baseUrl}${route}`, {
      headers: exportHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    const body = Buffer.from(await response.arrayBuffer());
    const searchable =
      format === "behaviorlog"
        ? readZipTextForLoadAssertion(body)
        : body.toString("utf8");
    assertDeterministicOwnerMarkers(
      searchable,
      exportIdentity.selectors.owner_marker,
      true,
      `${format} export`,
    );
    if (
      response.status < 200 ||
      response.status >= 300 ||
      !response.headers.get("content-type")?.includes(contentType) ||
      !response.headers
        .get("content-disposition")
        ?.includes("attachment") ||
      body.length === 0
    ) {
      throw new Error(
        "Deterministic structured-export coverage failed.",
      );
    }
    checked.push(`GET /api/export/${format}`);
  }

  return {
    checked_request_count: checked.length,
    checked_routes: checked,
    export_scope: "all history with archived behaviors and notes",
    timed_statistics_included: false,
  };
}

export function readZipTextForLoadAssertion(buffer) {
  let offset = 0;
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  const contents = [];

  while (
    offset + 30 <= buffer.length &&
    buffer.readUInt32LE(offset) === 0x04034b50
  ) {
    const flags = buffer.readUInt16LE(offset + 6);
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (
      flags & 0x1 ||
      ![0, 8].includes(compressionMethod) ||
      dataStart > buffer.length ||
      dataEnd > buffer.length ||
      uncompressedSize > 32 * 1024 * 1024
    ) {
      throw new Error(
        "Deterministic BehaviorLog ZIP assertion rejected an unsafe entry.",
      );
    }

    const compressed = buffer.subarray(dataStart, dataEnd);
    const content =
      compressionMethod === 8
        ? inflateRawSync(compressed)
        : compressed;
    if (content.length !== uncompressedSize) {
      throw new Error(
        "Deterministic BehaviorLog ZIP assertion found an invalid entry size.",
      );
    }
    totalUncompressedBytes += content.length;
    if (totalUncompressedBytes > 128 * 1024 * 1024) {
      throw new Error(
        "Deterministic BehaviorLog ZIP assertion exceeded its bounded size.",
      );
    }
    contents.push(content.toString("utf8"));
    entryCount += 1;
    offset = dataEnd;
  }

  if (entryCount === 0) {
    throw new Error(
      "Deterministic BehaviorLog ZIP assertion found no entries.",
    );
  }
  return contents.join("\n");
}

function assertDeterministicOwnerMarkers(
  body,
  ownerMarker,
  requireOwner,
  label,
) {
  const discovered = new Set(
    body.match(/\bcadence-owner-[a-f0-9]{20}\b/gi) ?? [],
  );
  if (
    (requireOwner && !discovered.has(ownerMarker)) ||
    [...discovered].some((marker) => marker !== ownerMarker)
  ) {
    throw new Error(
      `Deterministic ${label} ownership verification failed.`,
    );
  }
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function runLocustStage({
  stage: stageDefinition,
  cohortMix,
  sessionPath,
  reportDirectory,
  replacements,
  secretNeedles,
}) {
  const prefix = path.join(reportDirectory, stageDefinition.name);
  const outputReplacements = privateOutputReplacements(
    replacements,
    secretNeedles,
  );
  const environment = locustWorkerEnvironment({
    CADENCE_LOAD_SESSION_FILE: sessionPath,
    CADENCE_LOAD_PROFILE: stageDefinition.profile,
    CADENCE_LOAD_COHORT_FILTER:
      stageDefinition.cohortFilter ?? "",
    CADENCE_LOAD_USERS: String(stageDefinition.users),
    CADENCE_LOAD_DURATION_SECONDS: String(
      stageDefinition.durationSeconds,
    ),
    PYTHONPATH: path.join(root, "load-tests"),
  });

  console.log(
    `Starting ${stageDefinition.name}: ${stageDefinition.users} users for ${stageDefinition.durationSeconds} seconds.`,
  );
  const startedAt = performance.now();
  locustProcess = spawn(
    locustExecutable,
    [
      "--locustfile",
      locustFile,
      "--config",
      "/dev/null",
      "--host",
      baseUrl,
      "--headless",
      "--stop-timeout",
      "10",
      "--exit-code-on-error",
      String(LOCUST_REQUEST_FAILURE_EXIT_CODE),
      "--csv",
      prefix,
      "--csv-full-history",
      "--html",
      `${prefix}.html`,
      "--only-summary",
    ],
    {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  trackChild(locustProcess);
  forwardSanitizedLines(
    locustProcess.stdout,
    process.stdout,
    outputReplacements,
  );
  forwardSanitizedLines(
    locustProcess.stderr,
    process.stderr,
    outputReplacements,
  );
  const resourceMonitor = startResourceMonitor({
    appPid: appProcess?.pid,
    locustPid: locustProcess.pid,
    onBreach() {
      if (locustProcess?.exitCode === null) locustProcess.kill("SIGINT");
    },
  });
  const exitCode = await childExit(locustProcess);
  const achievedDurationSeconds =
    (performance.now() - startedAt) / 1_000;
  const resourceUsage = resourceMonitor.stop();
  locustProcess = null;

  const artifactPaths = sanitizeStageArtifacts(
    prefix,
    outputReplacements,
  );
  removeUnsafeArtifacts(artifactPaths, secretNeedles);

  const statsPath = `${prefix}_stats.csv`;
  const historyPath = `${prefix}_stats_history.csv`;
  const failuresPath = `${prefix}_failures.csv`;
  const exceptionsPath = `${prefix}_exceptions.csv`;
  const metrics = parseLocustStatsCsv(readFileSync(statsPath, "utf8"));
  const achievedPeakUsers = parseLocustPeakUsers(
    readFileSync(historyPath, "utf8"),
  );
  const unexpected5xx = countUnexpected5xxFailures(
    readFileSync(failuresPath, "utf8"),
  );
  const exceptionCount = countCsvDataRows(
    readFileSync(exceptionsPath, "utf8"),
  );

  return {
    stage: stageDefinition.name,
    users: stageDefinition.users,
    duration_seconds: stageDefinition.durationSeconds,
    achieved_duration_seconds: achievedDurationSeconds,
    achieved_peak_users: achievedPeakUsers,
    profile: stageDefinition.profile,
    cohort_filter: stageDefinition.cohortFilter,
    cohort_mix: cohortMix,
    metrics,
    unexpected_5xx: unexpected5xx,
    exception_count: exceptionCount,
    resources: resourceUsage,
    locust_exit_code: exitCode,
    artifacts: Object.fromEntries(
      artifactPaths.map((artifactPath) => [
        path.basename(artifactPath),
        summarizeArtifactDigest(artifactPath),
      ]),
    ),
  };
}

function startResourceMonitor({ appPid, locustPid, onBreach }) {
  const logicalCpuCount = Math.max(1, cpus().length);
  const state = {
    samples: 0,
    max_host_load_1m: 0,
    max_host_load_per_logical_cpu: 0,
    min_available_memory_bytes: Number.POSITIVE_INFINITY,
    max_app_rss_bytes: 0,
    max_locust_rss_bytes: 0,
    breaches: new Set(),
  };

  const sample = () => {
    const hostLoad = loadavg()[0] ?? 0;
    const loadPerCpu = hostLoad / logicalCpuCount;
    const availableMemory = readAvailableMemoryBytes();
    const appRss = readProcessRssBytes(appPid);
    const locustRss = readProcessRssBytes(locustPid);
    state.samples += 1;
    state.max_host_load_1m = Math.max(state.max_host_load_1m, hostLoad);
    state.max_host_load_per_logical_cpu = Math.max(
      state.max_host_load_per_logical_cpu,
      loadPerCpu,
    );
    state.min_available_memory_bytes = Math.min(
      state.min_available_memory_bytes,
      availableMemory,
    );
    state.max_app_rss_bytes = Math.max(state.max_app_rss_bytes, appRss);
    state.max_locust_rss_bytes = Math.max(
      state.max_locust_rss_bytes,
      locustRss,
    );

    if (
      loadPerCpu > RESOURCE_CEILINGS.max_host_load_per_logical_cpu
    ) {
      state.breaches.add("host load");
    }
    if (
      availableMemory <
      RESOURCE_CEILINGS.min_available_memory_bytes
    ) {
      state.breaches.add("available memory");
    }
    if (appRss > RESOURCE_CEILINGS.max_app_rss_bytes) {
      state.breaches.add("app RSS");
    }
    if (locustRss > RESOURCE_CEILINGS.max_locust_rss_bytes) {
      state.breaches.add("Locust RSS");
    }
    if (state.breaches.size > 0) onBreach();
  };

  sample();
  const interval = setInterval(sample, 5_000);
  interval.unref();

  return {
    stop() {
      clearInterval(interval);
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
        breaches: [...state.breaches],
      };
    },
  };
}

function readAvailableMemoryBytes() {
  if (platform() !== "darwin") return freemem();
  const result = spawnSync("vm_stat", [], {
    encoding: "utf8",
    env: safeEnvironment(),
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
  if (!Number.isInteger(pid) || pid <= 0) return 0;
  const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], {
    encoding: "utf8",
    env: safeEnvironment(),
  });
  const kibibytes = Number(result.stdout.trim());
  return result.status === 0 && Number.isFinite(kibibytes)
    ? kibibytes * 1024
    : 0;
}

function sanitizeStageArtifacts(prefix, replacements) {
  const directory = path.dirname(prefix);
  const basename = path.basename(prefix);
  const artifactPaths = readdirSync(directory)
    .filter((name) => name === `${basename}.html` || name.startsWith(`${basename}_`))
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
  return artifactPaths;
}

function buildSecretInventory(config, session, sessionPath) {
  const needles = new Set([
    config.publishableKey,
    config.serviceRoleKey,
    sessionPath,
    root,
    homedir(),
  ]);
  for (const identity of session.identities) {
    needles.add(identity.selectors.owner_marker);
    needles.add(identity.selectors.forbidden_marker);
    if (identity.selectors.behavior_id) {
      needles.add(identity.selectors.behavior_id);
    }
    for (const [name, value] of Object.entries(identity.cookies)) {
      needles.add(name);
      needles.add(value);
    }
  }
  return [...needles].filter(Boolean);
}

function buildReplacements(sessionPath) {
  return [
    { value: sessionPath, label: "[private-session]" },
    { value: root, label: "[workspace]" },
    { value: homedir(), label: "[home]" },
  ];
}

function privateOutputReplacements(replacements, secretNeedles) {
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

function runtimeMetadata() {
  const cpuList = cpus();
  return {
    source: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]),
      working_tree_dirty:
        commandOutput("git", ["status", "--porcelain"]).length > 0,
    },
    hardware: {
      platform: platform(),
      release: release(),
      architecture: process.arch,
      cpu_model: cpuList[0]?.model ?? "unknown",
      logical_cpu_count: cpuList.length,
      memory_bytes: totalmem(),
    },
    shared_machine: dockerContentionMetadata(),
    runtime: {
      node: process.version,
      next: JSON.parse(
        readFileSync(path.join(root, "node_modules", "next", "package.json")),
      ).version,
      python: commandOutput(pythonExecutable, ["--version"]),
      locust: commandOutput(locustExecutable, ["--version"]),
      docker: commandOutput("docker", ["version", "--format", "{{.Server.Version}}"]),
      supabase_cli: commandOutput("npm", [
        "run",
        "supabase",
        "--",
        "--version",
      ])
        .split(/\r?\n/)
        .at(-1),
    },
    application: {
      target_classification: "local",
      base_url: baseUrl,
      next_mode: "production persistent Node process",
      supabase_mode: "project-local CLI Docker stack",
      provider_calls_enabled: false,
      routes_prewarmed_before_statistics: true,
      interpretation:
        "Local persistent-Node evidence only; not Vercel or hosted capacity.",
    },
  };
}

function dockerContentionMetadata() {
  const result = spawnSync(
    "docker",
    [
      "ps",
      "--format",
      '{{.Names}}\t{{.Label "com.supabase.cli.project"}}',
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: safeEnvironment(),
    },
  );
  if (result.status !== 0) {
    return {
      running_container_count: null,
      local_supabase_stack_count: null,
      caveat: "Container contention could not be measured.",
    };
  }

  const rows = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const stackNames = new Set(
    rows
      .map((row) => row.split("\t")[1]?.trim())
      .filter(Boolean),
  );
  return {
    running_container_count: rows.length,
    local_supabase_stack_count:
      stackNames.size === 0 ? null : stackNames.size,
    caveat:
      stackNames.size > 1
        ? "Other local Supabase stacks were running; results include shared-machine contention."
        : "No additional local Supabase stack was detected.",
  };
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: safeEnvironment({
      SUPABASE_TELEMETRY_DISABLED: "1",
    }),
  });
  if (result.status !== 0) return "unavailable";
  return (result.stdout || result.stderr || "").trim();
}

async function runLocalRlsSmoke(config, replacements) {
  console.log("Running the post-load local RLS smoke.");
  const result = await runChild(
    "npm",
    ["run", "smoke:rls"],
    {
      env: safeEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: config.url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: config.publishableKey,
        SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
      }),
      replacements,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error("The post-load local RLS smoke failed.");
  }
}

async function runChild(command, args, { env, replacements }) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  trackChild(child);
  forwardSanitizedLines(child.stdout, process.stdout, replacements);
  forwardSanitizedLines(child.stderr, process.stderr, replacements);
  return { exitCode: await childExit(child) };
}

function trackChild(child) {
  activeChildren.add(child);
  child.once("exit", () => activeChildren.delete(child));
  child.once("error", () => activeChildren.delete(child));
}

function forwardSanitizedLines(stream, destination, replacements) {
  const lines = readline.createInterface({ input: stream });
  lines.on("line", (line) => {
    const currentReplacements =
      typeof replacements === "function"
        ? replacements()
        : replacements;
    destination.write(
      `${sanitizeLoadOutput(line, currentReplacements)}\n`,
    );
  });
}

function childExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([childExit(child), delay(5_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function writeAggregateJson(filePath, value, replacements = []) {
  const serialized = sanitizeLoadOutput(
    `${JSON.stringify(value, null, 2)}\n`,
    replacements,
  );
  writeFileSync(filePath, serialized, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}

function handleSignal() {
  interrupted = true;
  lifecycleAbortController.abort();
  if (locustProcess?.exitCode === null) locustProcess.kill("SIGINT");
  if (appProcess?.exitCode === null) appProcess.kill("SIGTERM");
  for (const child of activeChildren) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

function assertNotInterrupted() {
  if (interrupted || lifecycleAbortController.signal.aborted) {
    throw new Error("The local read suite was interrupted.");
  }
}

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);

export async function runReadSuite({
  suite = "full",
  runId = createLoadRunId(),
} = {}) {
  runId = validateLoadRunId(runId);
  const plan = buildReadSuitePlan(suite);
  const reportDirectory = path.join(runsRoot, runId);
  let config;
  let session;
  let sessionPath;
  let anchorLocalDate;
  let attemptedProvision = false;
  let cleanupSummary = null;
  let failure = null;
  let declaration = null;
  let preIntegritySummary = null;
  let postIntegritySummary = null;
  let rlsSmoke = "not_run";
  let deterministicCoverage = null;
  let replacements = [];
  const retainedSecretNeedles = new Set();
  const inspectionFailures = [];
  const stageResults = [];
  const gates = [];

  assertDependencies();
  await assertPortAvailable();
  mkdirSync(runsRoot, { recursive: true, mode: 0o700 });
  mkdirSync(reportDirectory, { mode: 0o700 });
  chmodSync(reportDirectory, 0o700);

  try {
    config = readExplicitLocalConfig();
    await buildProductionApp(config, [
      { value: root, label: "[workspace]" },
      { value: homedir(), label: "[home]" },
    ]);
    assertNotInterrupted();

    attemptedProvision = true;
    const provisioned = await provisionLoadRun({
      runId,
      accountCount: plan.accountCount,
      heavyCount: plan.heavyCount,
      baseUrl,
      config,
      signal: lifecycleAbortController.signal,
    });
    assertNotInterrupted();
    sessionPath = provisioned.sessionPath;
    session = JSON.parse(readFileSync(sessionPath, "utf8"));
    anchorLocalDate = session.anchor_local_date;
    replacements = buildReplacements(sessionPath);
    for (const needle of buildSecretInventory(config, session, sessionPath)) {
      retainedSecretNeedles.add(needle);
    }

    declaration = {
      schema_version: "1.0.0",
      run_id: runId,
      suite,
      declared_at: new Date().toISOString(),
      cohort_counts: provisioned.summary.cohorts,
      identity_count: session.identities.length,
      default_identity_ceiling: plan.accountCount - plan.heavyCount,
      reserved_heavy_identities: plan.heavyCount,
      stages: plan.stages,
      resource_ceilings: RESOURCE_CEILINGS,
      abort_thresholds: {
        unexpected_5xx: 0,
        unexpected_request_failure_ratio_percent: "less than 0.5",
        p95_warm_baseline_multiplier: 2,
        recovery_p95_baseline_multiplier: 1.1,
        identity_exhaustion: "immediate",
        anchor_date_rollover: "immediate",
        resource_ceiling: "immediate",
      },
      runtime: runtimeMetadata(),
      warm_cold_caveat:
        "The app and every ordinary session were prewarmed before timed statistics; cold-start capacity was not measured.",
    };
    writeAggregateJson(
      path.join(reportDirectory, "declaration.json"),
      declaration,
      replacements,
    );

    startProductionApp(config, () =>
      privateOutputReplacements(
        replacements,
        [...retainedSecretNeedles],
      ),
    );
    await waitForApp();
    assertAnchorDate(anchorLocalDate);
    await prewarmOrdinarySessions(session, replacements);
    deterministicCoverage =
      await verifyDeterministicRouteContract(session);
    const preIntegrity = await verifyLoadRunIntegrity({
      runId,
      baseUrl,
      config,
    });
    preIntegritySummary = preIntegrity.summary;

    let warmP95;
    let baselineTen;
    for (const stageDefinition of plan.stages) {
      if (interrupted) throw new Error("The local read suite was interrupted.");
      assertAnchorDate(anchorLocalDate);
      const refreshed = await refreshLoadRunSessions({
        runId,
        baseUrl,
        config,
        activeCount: stageDefinition.users,
        cohortFilter: stageDefinition.cohortFilter ?? undefined,
        signal: lifecycleAbortController.signal,
      });
      session = JSON.parse(readFileSync(refreshed.sessionPath, "utf8"));
      for (const needle of buildSecretInventory(
        config,
        session,
        sessionPath,
      )) {
        retainedSecretNeedles.add(needle);
      }

      const result = await runLocustStage({
        stage: stageDefinition,
        cohortMix: activeCohortMix(session, stageDefinition),
        sessionPath,
        reportDirectory,
        replacements,
        secretNeedles: [...retainedSecretNeedles],
      });
      stageResults.push(result);

      const gate = evaluateStageGates({
        stage: result.stage,
        metrics: result.metrics,
        warmBaselineP95:
          ["smoke-1", "warm-1"].includes(result.stage)
            ? undefined
            : warmP95,
        unexpected5xx: result.unexpected_5xx,
        exceptionCount: result.exception_count,
        resourceBreaches: result.resources.breaches,
        declaredDurationSeconds: result.duration_seconds,
        achievedDurationSeconds: result.achieved_duration_seconds,
        declaredUsers: result.users,
        achievedPeakUsers: result.achieved_peak_users,
      });
      if (result.locust_exit_code !== 0) {
        gate.passed = false;
        gate.failures.push("Locust returned a nonzero exit code");
      }
      gates.push(gate);
      if (!gate.passed) {
        throw new Error(
          `${result.stage} failed its declared stop/go gates: ${gate.failures.join(
            "; ",
          )}.`,
        );
      }

      if (result.stage === "warm-1") {
        warmP95 = result.metrics.latency_ms.p95;
      }
      if (result.stage === "baseline-10") {
        baselineTen = result.metrics;
      }
      if (result.stage === "recovery-10") {
        if (!baselineTen) {
          throw new Error(
            "Recovery cannot be evaluated without the pre-ramp 10-user baseline.",
          );
        }
        const recoveryGate = evaluateRecoveryGate({
          baseline: baselineTen,
          recovery: result.metrics,
        });
        gates.push(recoveryGate);
        if (!recoveryGate.passed) {
          throw new Error(
            `Recovery failed: ${recoveryGate.failures.join("; ")}.`,
          );
        }
      }

      writeAggregateJson(
        path.join(reportDirectory, "progress.json"),
        {
          run_id: runId,
          completed_stages: stageResults,
          gates,
        },
        replacements,
      );
    }

    if (suite === "full") {
      const coverageGate = evaluateTimedRouteCoverage(stageResults);
      gates.push(coverageGate);
      if (!coverageGate.passed) {
        throw new Error(
          `Timed route coverage failed: ${coverageGate.failures.join(
            "; ",
          )}.`,
        );
      }
    }

    assertAnchorDate(anchorLocalDate);
    const postIntegrity = await verifyLoadRunIntegrity({
      runId,
      baseUrl,
      config,
    });
    postIntegritySummary = postIntegrity.summary;
    await runLocalRlsSmoke(config, replacements);
    rlsSmoke = "passed";
  } catch (error) {
    failure =
      error instanceof Error
        ? error
        : new Error("The local read suite failed.");
  } finally {
    if (sessionPath && config && postIntegritySummary === null) {
      try {
        const inspected = await verifyLoadRunIntegrity({
          runId,
          baseUrl,
          config,
        });
        postIntegritySummary = inspected.summary;
      } catch (inspectionError) {
        const message =
          inspectionError instanceof Error
            ? inspectionError.message
            : "Post-failure fixture integrity inspection failed.";
        inspectionFailures.push(
          sanitizeLoadOutput(message, replacements),
        );
        failure ??= new Error(message);
      }
    }
    if (config && rlsSmoke !== "passed") {
      try {
        await runLocalRlsSmoke(config, replacements);
        rlsSmoke = "passed";
      } catch (inspectionError) {
        const message =
          inspectionError instanceof Error
            ? inspectionError.message
            : "Post-failure local RLS smoke failed.";
        inspectionFailures.push(
          sanitizeLoadOutput(message, replacements),
        );
        failure ??= new Error(message);
        rlsSmoke = "failed";
      }
    }
    await stopChild(locustProcess);
    await stopChild(appProcess);
    if (attemptedProvision && config) {
      try {
        const cleaned = await cleanupLoadRun({
          runId,
          confirmRunId: runId,
          baseUrl,
          config,
        });
        cleanupSummary = cleaned.summary;
      } catch (cleanupError) {
        failure ??=
          cleanupError instanceof Error
            ? cleanupError
            : new Error("Exact load-fixture cleanup failed.");
      }
    }
  }

  const completion = {
    run_id: runId,
    suite,
    status: failure ? "failed" : "passed",
    stages: stageResults,
    gates,
    cleanup: cleanupSummary,
    failure: failure
      ? sanitizeLoadOutput(failure.message, replacements)
      : null,
    inspection_failures: inspectionFailures,
  };
  writeAggregateJson(
    path.join(reportDirectory, "summary.json"),
    {
      schema_version: "1.0.0",
      run_id: runId,
      suite,
      status: failure ? "failed" : "passed",
      cohort_counts: declaration?.cohort_counts ?? null,
      identity_count: declaration?.identity_count ?? null,
      stages: stageResults,
      gates,
      integrity: {
        before: preIntegritySummary,
        after: postIntegritySummary,
      },
      deterministic_route_coverage: deterministicCoverage,
      rls_smoke: rlsSmoke,
      cleanup: cleanupSummary,
      runtime: declaration?.runtime ?? null,
      resource_ceilings: RESOURCE_CEILINGS,
      caveats: declaration
        ? [
            declaration.warm_cold_caveat,
            declaration.runtime.application.interpretation,
            "Task weights are initial product assumptions, not observed analytics.",
          ]
        : [],
      failure: completion.failure,
      inspection_failures: inspectionFailures,
    },
    replacements,
  );
  writeAggregateJson(
    path.join(reportDirectory, "completion.json"),
    completion,
    replacements,
  );
  assertReportDirectorySanitized(
    reportDirectory,
    [...retainedSecretNeedles],
  );

  if (failure) throw failure;
  console.log(
    `Ticket 064 ${suite} suite passed ${stageResults.length} stages with exact fixture cleanup.`,
  );
  return completion;
}

export function evaluateTimedRouteCoverage(stageResults) {
  const observed = new Set();
  for (const result of stageResults) {
    for (const request of result.metrics?.requests_by_name ?? []) {
      if (request.requests > 0) observed.add(request.name);
    }
  }
  const missing = REQUIRED_READ_REQUEST_NAMES.filter(
    (name) => !observed.has(name),
  );
  return {
    stage: "timed-route-coverage",
    passed: missing.length === 0,
    failures:
      missing.length === 0
        ? []
        : [
            `${missing.length} required normalized request name(s) recorded zero timed requests`,
          ],
    observed_request_names: [...observed].sort(),
    required_request_name_count: REQUIRED_READ_REQUEST_NAMES.length,
  };
}

function activeCohortMix(session, stageDefinition) {
  const eligible = session.identities.filter((identity) =>
    stageDefinition.cohortFilter === "heavy_schedule"
      ? identity.cohort === "heavy_schedule"
      : identity.cohort !== "heavy_schedule",
  );
  const active = eligible.slice(0, stageDefinition.users);
  if (active.length !== stageDefinition.users) {
    throw new Error(
      "The declared stage does not have enough unique identities for its cohort mix.",
    );
  }
  return active.reduce((counts, identity) => {
    counts[identity.cohort] = (counts[identity.cohort] ?? 0) + 1;
    return counts;
  }, {});
}

function assertReportDirectorySanitized(reportDirectory, secretNeedles) {
  const filePaths = readdirSync(reportDirectory)
    .map((name) => path.join(reportDirectory, name))
    .filter((filePath) => statSync(filePath).isFile());
  removeUnsafeArtifacts(filePaths, secretNeedles);
}

export function removeUnsafeArtifacts(filePaths, secretNeedles) {
  const errors = [];
  for (const filePath of filePaths) {
    try {
      assertSanitizedArtifact({
        content: readFileSync(filePath, "utf8"),
        secretNeedles,
        label: path.basename(filePath),
      });
    } catch (error) {
      rmSync(filePath);
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runReadSuite({ suite: parseSuiteArgument(process.argv.slice(2)) }).catch(
    (error) => {
      console.error(
        sanitizeLoadOutput(
          error instanceof Error
            ? error.message
            : "The local read suite failed.",
        ),
      );
      process.exitCode = 1;
    },
  );
}
