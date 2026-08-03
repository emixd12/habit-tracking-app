import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";

import { Temporal } from "@js-temporal/polyfill";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const mode = process.argv.includes("--web") ? "web" : "headless";
const baseUrl = (
  process.env.CADENCE_LOAD_BASE_URL ?? "http://127.0.0.1:3100"
).replace(/\/+$/, "");
const runsRoot = path.join(root, "load-tests", ".runs");
const runId = `protocol-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const runDirectory = path.join(runsRoot, runId);
const sessionPath = path.join(runDirectory, "session.json");
const reportPrefix = path.join(runDirectory, "protocol");
const locustExecutable = path.join(
  root,
  "load-tests",
  ".venv",
  "bin",
  "locust",
);
const appExecutable = path.join(root, "node_modules", ".bin", "next");
const USER_OWNED_TABLES = [
  "behavior_definition_events",
  "behavior_schedule_slots",
  "behavior_schedules",
  "behaviorlog_import_record_mappings",
  "behaviorlog_import_runs",
  "behaviors",
  "categories",
  "imported_interventions",
  "imported_notes",
  "occurrence_status_events",
  "occurrence_sync_state",
  "occurrences",
  "push_subscriptions",
  "reminder_deliveries",
];

let appProcess = null;
let locustProcess = null;
let admin = null;
let syntheticUserId = null;
let interrupted = false;

function assertLoopbackHttp(rawUrl, label) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} must be a valid loopback HTTP URL.`);
  }

  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname)
  ) {
    throw new Error(`${label} must be a loopback HTTP URL.`);
  }

  return parsed;
}

function readLocalSupabaseConfig() {
  const result = spawnSync(
    "npm",
    ["run", "supabase", "--", "status", "-o", "env"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(
      "The local Supabase stack is unavailable. Start it before running the protocol smoke.",
    );
  }

  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }

  const url = values.API_URL;
  const publishableKey = values.PUBLISHABLE_KEY ?? values.ANON_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error(
      "The local Supabase status output lacked required runtime values.",
    );
  }

  assertLoopbackHttp(url, "Supabase URL");
  return { url, publishableKey, serviceRoleKey };
}

function sensitiveEnvBase() {
  const safe = {};

  for (const [name, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      !/(SECRET|TOKEN|KEY|PASSWORD|COOKIE|SUPABASE|SEQUENZY|VAPID|AGENTMAIL|DATABASE|DB_URL)/i.test(
        name,
      )
    ) {
      safe[name] = value;
    }
  }

  return safe;
}

function createAuthenticatedFixtureClient(config, password, email) {
  const cookies = new Map();
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return [...cookies].map(([name, value]) => ({ name, value }));
      },
      setAll(nextCookies) {
        for (const cookie of nextCookies) {
          if (cookie.options?.maxAge === 0) {
            cookies.delete(cookie.name);
          } else {
            cookies.set(cookie.name, cookie.value);
          }
        }
      },
    },
  });

  return {
    client,
    cookies,
    async signIn() {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user || !data.session) {
        throw new Error("The disposable protocol account could not sign in.");
      }
    },
  };
}

async function createProtocolFixture(config) {
  const email = `cadence-load-${runId}@example.invalid`;
  const password = `CadenceLoad-${randomBytes(18).toString("base64url")}!aA1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Cadence load protocol" },
  });

  if (error || !data.user) {
    throw new Error("The disposable protocol account could not be created.");
  }

  syntheticUserId = data.user.id;
  const fixture = createAuthenticatedFixtureClient(config, password, email);
  await fixture.signIn();
  await waitForOnboarding(fixture.client, syntheticUserId);

  const category = await requiredSingle(
    fixture.client
      .from("categories")
      .select("id")
      .eq("user_id", syntheticUserId)
      .eq("name", "Other")
      .maybeSingle(),
    "The disposable account did not have its default category.",
  );
  const behavior = await requiredSingle(
    fixture.client
      .from("behaviors")
      .insert({
        user_id: syntheticUserId,
        category_id: category.id,
        title: `Protocol fixture ${runId}`,
        description: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        scheduled_time: "09:00:00",
        timezone: "America/New_York",
        browser_reminder_enabled: true,
        email_reminder_enabled: false,
        reminder_offset_minutes: 0,
        active: true,
        archived_at: null,
      })
      .select("id")
      .single(),
    "The protocol Behavior could not be created.",
  );
  const schedule = await requiredSingle(
    fixture.client
      .from("behavior_schedules")
      .insert({
        user_id: syntheticUserId,
        behavior_id: behavior.id,
        recurrence_rule: { frequency: "daily", interval: 1 },
        sort_order: 0,
      })
      .select("id")
      .single(),
    "The protocol schedule could not be created.",
  );
  const slot = await requiredSingle(
    fixture.client
      .from("behavior_schedule_slots")
      .insert({
        user_id: syntheticUserId,
        behavior_id: behavior.id,
        behavior_schedule_id: schedule.id,
        kind: "exact",
        preset: null,
        start_time: "09:00:00",
        end_time: null,
        sort_order: 0,
      })
      .select("id")
      .single(),
    "The protocol schedule slot could not be created.",
  );

  const timezone = "America/New_York";
  const localDate = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate();
  const scheduledFor = localDate
    .toZonedDateTime({
      timeZone: timezone,
      plainTime: Temporal.PlainTime.from("09:00:00"),
    })
    .toInstant();
  const occurrence = await requiredSingle(
    fixture.client
      .from("occurrences")
      .insert({
        user_id: syntheticUserId,
        behavior_id: behavior.id,
        behavior_schedule_slot_id: slot.id,
        scheduled_for: scheduledFor.toString(),
        local_date: localDate.toString(),
        status: "unresolved",
        completed_at: null,
        status_marked_at: null,
        note: null,
        schedule_kind: "exact",
        schedule_preset: null,
        schedule_start_time: "09:00:00",
        schedule_end_time: null,
      })
      .select("id")
      .single(),
    "The protocol occurrence could not be created.",
  );

  const cookieObject = Object.fromEntries(fixture.cookies);
  if (Object.keys(cookieObject).length === 0) {
    throw new Error("The protocol session did not produce auth cookies.");
  }

  writeFileSync(
    sessionPath,
    JSON.stringify({
      target_classification: "local",
      base_url: baseUrl,
      cookies: cookieObject,
      occurrence_id: occurrence.id,
      user_id: syntheticUserId,
    }),
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );
  chmodSync(sessionPath, 0o600);

  return {
    occurrenceId: occurrence.id,
    behaviorId: behavior.id,
  };
}

async function requiredSingle(query, safeMessage) {
  const { data, error } = await query;
  if (error || !data) throw new Error(safeMessage);
  return data;
}

async function waitForOnboarding(client, userId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [{ data: profile }, { data: categories }] = await Promise.all([
      client.from("profiles").select("id").eq("id", userId).maybeSingle(),
      client
        .from("categories")
        .select("id")
        .eq("user_id", userId)
        .limit(1),
    ]);

    if (profile && categories && categories.length > 0) return;
    await delay(100);
  }

  throw new Error("Timed out waiting for disposable-account onboarding.");
}

function startLocalApp(config) {
  const appUrl = assertLoopbackHttp(baseUrl, "Cadence target");
  const port = appUrl.port || "80";
  const hostname = appUrl.hostname;
  const appEnv = {
    ...sensitiveEnvBase(),
    NODE_ENV: "development",
    NEXT_PUBLIC_SITE_URL: baseUrl,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    SUPABASE_TELEMETRY_DISABLED: "1",
  };

  appProcess = spawn(
    appExecutable,
    ["dev", "--hostname", hostname, "--port", port],
    {
      cwd: root,
      env: appEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  appProcess.stdout.resume();
  appProcess.stderr.resume();
}

async function waitForApp() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (appProcess?.exitCode !== null) {
      throw new Error("The local Cadence process exited before it was ready.");
    }

    try {
      const response = await fetch(`${baseUrl}/terms`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status >= 200 && response.status < 400) return;
    } catch {
      // Readiness is intentionally bounded and retried.
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the local Cadence process.");
}

async function runLocust() {
  const args = [
    "--locustfile",
    path.join(root, "load-tests", "locustfile.py"),
    "--host",
    baseUrl,
  ];

  if (mode === "headless") {
    args.push(
      "--headless",
      "--users",
      "1",
      "--spawn-rate",
      "1",
      "--run-time",
      "45s",
      "--stop-timeout",
      "5",
      "--only-summary",
      "--exit-code-on-error",
      "1",
      "--csv",
      reportPrefix,
      "--html",
      `${reportPrefix}.html`,
    );
  } else {
    args.push("--web-host", "127.0.0.1", "--web-port", "8089");
  }

  locustProcess = spawn(locustExecutable, args, {
    cwd: root,
    env: {
      ...sensitiveEnvBase(),
      CADENCE_LOAD_SESSION_FILE: sessionPath,
      PYTHONPATH: path.join(root, "load-tests"),
    },
    stdio: ["inherit", "pipe", "pipe"],
  });
  forwardSanitizedLines(locustProcess.stdout, process.stdout);
  forwardSanitizedLines(locustProcess.stderr, process.stderr);

  if (mode === "web") {
    console.log(
      "Locust is available at http://127.0.0.1:8089 with exactly one fixed protocol user. Stop the process to trigger verification and cleanup.",
    );
  }

  const exitCode = await childExit(locustProcess);
  locustProcess = null;

  if (!interrupted && exitCode !== 0) {
    throw new Error("The local Locust protocol run failed.");
  }
}

function forwardSanitizedLines(stream, destination) {
  const lines = readline.createInterface({ input: stream });
  lines.on("line", (line) => {
    destination.write(`${sanitizeOutput(line)}\n`);
  });
}

function sanitizeOutput(value) {
  return value
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[redacted-id]",
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted-email]",
    )
    .replace(/\bsb-[a-z0-9.-]+-auth-token(?:\.\d+)?\b/gi, "[redacted-cookie]")
    .replace(/\beyJ[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[redacted-key]");
}

async function verifyProtocolResult(fixture) {
  const occurrence = await requiredSingle(
    admin
      .from("occurrences")
      .select("id, user_id, behavior_id, status, completed_at, status_marked_at")
      .eq("id", fixture.occurrenceId)
      .eq("user_id", syntheticUserId)
      .maybeSingle(),
    "The protocol occurrence was not persisted.",
  );
  if (
    occurrence.status !== "completed" ||
    !occurrence.completed_at ||
    !occurrence.status_marked_at
  ) {
    throw new Error(
      "The protocol occurrence did not persist the Completed transition.",
    );
  }

  const { data: events, error } = await admin
    .from("occurrence_status_events")
    .select(
      "user_id, occurrence_id, behavior_id, previous_status, status, status_semantics, source_capture_method, source_confidence, revises_event_id",
    )
    .eq("user_id", syntheticUserId)
    .eq("occurrence_id", fixture.occurrenceId);
  if (error || !events || events.length !== 1) {
    throw new Error(
      "The protocol transition did not create exactly one append-only status event.",
    );
  }

  const event = events[0];
  if (
    event.user_id !== syntheticUserId ||
    event.occurrence_id !== fixture.occurrenceId ||
    event.behavior_id !== fixture.behaviorId ||
    event.previous_status !== "unresolved" ||
    event.status !== "completed" ||
    event.status_semantics !== "explicit_user_mark" ||
    event.source_capture_method !== "manual_tap" ||
    event.source_confidence !== "high" ||
    event.revises_event_id !== null
  ) {
    throw new Error(
      "The protocol status event did not match the expected transition semantics.",
    );
  }
}

async function cleanupAndVerify() {
  let cleanupFailure = null;

  if (existsSync(sessionPath)) rmSync(sessionPath);
  if (syntheticUserId && admin) {
    cleanupFailure = await deleteAndVerifySyntheticUser(syntheticUserId);
  }

  syntheticUserId = null;
  return cleanupFailure;
}

async function deleteAndVerifySyntheticUser(userId) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return new Error(
      "The disposable protocol auth account could not be removed.",
    );
  }

  for (const table of USER_OWNED_TABLES) {
    const { count, error: countError } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError || count !== 0) {
      return new Error(
        "Disposable protocol product data remained after auth cleanup.",
      );
    }
  }

  const { count, error: profileError } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("id", userId);
  if (profileError || count !== 0) {
    return new Error(
      "The disposable protocol profile remained after auth cleanup.",
    );
  }

  const { data: authResult } = await admin.auth.admin.getUserById(userId);
  if (authResult?.user) {
    return new Error(
      "The disposable protocol auth account remained after cleanup.",
    );
  }

  return null;
}

async function recoverInterruptedProtocolRuns() {
  if (!existsSync(runsRoot)) return 0;

  let recovered = 0;
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === runId) continue;
    const staleSessionPath = path.join(runsRoot, entry.name, "session.json");
    if (!existsSync(staleSessionPath)) continue;

    let payload;
    try {
      payload = JSON.parse(readFileSync(staleSessionPath, "utf8"));
      if (payload.target_classification !== "local") continue;
      assertLoopbackHttp(payload.base_url, "Recovered Cadence target");
    } catch {
      throw new Error(
        "An interrupted protocol run has invalid recovery metadata.",
      );
    }

    let userId =
      typeof payload.user_id === "string" ? payload.user_id : undefined;
    if (!userId && typeof payload.occurrence_id === "string") {
      const { data, error } = await admin
        .from("occurrences")
        .select("user_id")
        .eq("id", payload.occurrence_id)
        .maybeSingle();
      if (error) {
        throw new Error(
          "An interrupted protocol run could not resolve its exact cleanup owner.",
        );
      }
      userId = data?.user_id;
    }

    if (!userId) {
      throw new Error(
        "An interrupted protocol run lacks an exact cleanup owner.",
      );
    }

    const cleanupFailure = await deleteAndVerifySyntheticUser(userId);
    if (cleanupFailure) throw cleanupFailure;
    rmSync(staleSessionPath);
    recovered += 1;
  }

  return recovered;
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

function handleSignal() {
  interrupted = true;
  if (locustProcess?.exitCode === null) locustProcess.kill("SIGINT");
}

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);

async function main() {
  assertLoopbackHttp(baseUrl, "Cadence target");
  if (!existsSync(locustExecutable)) {
    throw new Error(
      "Locust is not installed. Run npm run load:install before the protocol smoke.",
    );
  }
  if (!existsSync(appExecutable)) {
    throw new Error("Next.js is not installed in the workspace.");
  }

  mkdirSync(runsRoot, { recursive: true, mode: 0o700 });
  mkdirSync(runDirectory, { mode: 0o700 });
  chmodSync(runDirectory, 0o700);

  const config = readLocalSupabaseConfig();
  admin = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const recoveredRuns = await recoverInterruptedProtocolRuns();
  if (recoveredRuns > 0) {
    console.log(
      `Recovered and exactly cleaned ${recoveredRuns} interrupted local protocol run(s).`,
    );
  }

  let failure = null;
  let fixture = null;
  try {
    fixture = await createProtocolFixture(config);
    startLocalApp(config);
    await waitForApp();
    await runLocust();
    if (!interrupted) await verifyProtocolResult(fixture);
  } catch (error) {
    failure =
      error instanceof Error
        ? error
        : new Error("The local protocol smoke failed.");
  } finally {
    await stopChild(locustProcess);
    await stopChild(appProcess);
    const cleanupFailure = await cleanupAndVerify();
    failure ??= cleanupFailure;
  }

  if (failure) throw failure;
  if (interrupted) {
    console.log("Local Locust exploration stopped; disposable data cleaned.");
  } else {
    console.log(
      "Local Locust protocol smoke passed: four request types, one persisted event, stale replay rejection, and exact disposable-account cleanup verified.",
    );
  }
}

main().catch((error) => {
  console.error(
    sanitizeOutput(
      error instanceof Error
        ? error.message
        : "The local protocol smoke failed.",
    ),
  );
  process.exitCode = 1;
});
