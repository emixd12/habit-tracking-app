import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const notes = [];
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(filePath(relativePath));
}

function read(relativePath) {
  const absolutePath = filePath(relativePath);
  if (!fs.existsSync(absolutePath)) return "";
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

const requiredFiles = [
  "AGENTS.md",
  "STATUS.md",
  "README.md",
  ".env.example",
  "package.json",
  "docs/OPERATIONS.md",
  "docs/SUPABASE_WORKFLOW.md",
  "docs/SEQUENZY_WORKFLOW.md",
  "docs/DATETIME_STRATEGY.md",
  "docs/ROUTE_MAP.md",
  "docs/AGENT_RESOLVERS.md",
  "docs/INTERACTION_REGISTRY.md",
  "docs/LOAD_TESTING_PLAN.md",
  "docs/LOAD_TESTING_RUNBOOK.md",
  "docs/PERFORMANCE_SPEED_LOG.md",
  "docs/TICKETS.md",
  "docs/DECISIONS.md",
  "docs/NOTIFICATION_SPEC.md",
  "docs/DATA_MODEL.md",
  ".agents/skills/impeccable/SKILL.md",
  "interaction-registry.json",
  "interaction-registry.schema.json",
  "scripts/check-interactions.mjs",
  "scripts/check-load-test-interactions.mjs",
  "scripts/check-load-test-mutation-evidence.mjs",
  "scripts/load-test-cleanup.mjs",
  "scripts/load-test-fixtures.mjs",
  "scripts/load-test-integrity.mjs",
  "scripts/load-test-fake-sequenzy.mjs",
  "scripts/load-test-hosted-preflight.mjs",
  "scripts/launch-cost-preflight.mjs",
  "scripts/launch-surge-drill.mjs",
  "scripts/load-test-local-runtime.mjs",
  "scripts/load-test-mutation-report.mjs",
  "scripts/load-test-mutation-suite.mjs",
  "scripts/load-test-provision.mjs",
  "scripts/load-test-read-report.mjs",
  "scripts/load-test-read-suite.mjs",
  "scripts/load-test-seed.mjs",
  "load-tests/read_locustfile.py",
  "load-tests/mutation_locustfile.py",
  "load-tests/cadence_load/actions.py",
  "load-tests/cadence_load/integrity.py",
  "load-tests/cadence_load/mutation_shapes.py",
  "load-tests/cadence_load/users/contention.py",
  "load-tests/cadence_load/users/daily.py",
  "load-tests/cadence_load/users/exporter.py",
  "load-tests/cadence_load/users/maintainer.py",
  "load-tests/cadence_load/users/operator.py",
  "load-tests/cadence_load/users/reviewer.py",
  "load-tests/cadence_load/users/timezone.py",
  "load-tests/scenarios/interaction-map.json",
  "load-tests/scenarios/mutation-profiles.json",
  "load-tests/scenarios/profiles.json",
  "load-tests/requirements.txt",
];

for (const file of requiredFiles) {
  assert(exists(file), `Required agent/source-of-truth file is missing: ${file}`);
}

const packageJson = readJson("package.json");
const requiredScripts = [
  "lint",
  "typecheck",
  "test",
  "build",
  "agents:check",
  "interactions:check",
  "resolvers:check",
  "load:install",
  "load:manifest:check",
  "load:python:test",
  "load:web",
  "load:protocol:smoke",
  "load:provision",
  "load:seed",
  "load:integrity",
  "load:cleanup",
  "load:read:smoke",
  "load:read:baseline",
  "load:read:ramp",
  "load:read:full",
  "load:mutation:smoke",
  "load:mutation:baseline",
  "load:mutation:ramp",
  "load:mutation:spike",
  "load:mutation:soak",
  "load:mutation:breakpoint",
  "load:mutation:timezone",
  "load:mutation:contention",
  "load:mutation:operator",
  "load:mutation:full",
  "load:mutation:evidence:check",
  "load:hosted:preflight",
  "launch:cost:preflight",
  "launch:surge:drill",
  "smoke:launch-rate-limit:local",
  "supabase",
  "sequenzy",
];

for (const script of requiredScripts) {
  assert(Boolean(packageJson.scripts?.[script]), `package.json is missing script: ${script}`);
}

assert(
  Boolean(packageJson.devDependencies?.supabase),
  "Supabase CLI must be installed as a devDependency named `supabase`.",
);
assert(
  Boolean(packageJson.devDependencies?.["@sequenzy/cli"]),
  "Sequenzy CLI must be installed as a devDependency named `@sequenzy/cli`.",
);

const docsToScan = [
  "AGENTS.md",
  "STATUS.md",
  "README.md",
  ".env.example",
  "package.json",
  ...fs.readdirSync(filePath("docs")).filter((file) => file.endsWith(".md")).map((file) => `docs/${file}`),
];

for (const file of docsToScan) {
  const content = read(file);
  assert(!/resend/i.test(content), `Retired email provider reference remains in ${file}. Use Sequenzy instead.`);
}

assert(
  !read("README.md").includes("CODEX_FIRST_PROMPT"),
  "README.md must not reference the removed CODEX_FIRST_PROMPT.md bootstrap file.",
);

const agents = read("AGENTS.md");
for (const snippet of [
  "STATUS.md",
  "docs/OPERATIONS.md",
  "docs/SUPABASE_WORKFLOW.md",
  "docs/SEQUENZY_WORKFLOW.md",
  "docs/DATETIME_STRATEGY.md",
  "docs/ROUTE_MAP.md",
  "interaction-registry.json",
  "npm run agents:check",
  "npm run interactions:check",
  "npm run resolvers:check",
  "Sequenzy",
  "Supabase CLI",
]) {
  assert(agents.includes(snippet), `AGENTS.md must mention ${snippet}.`);
}

const envExample = read(".env.example");
for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PROJECT_REF",
  "SEQUENZY_API_KEY",
  "SEQUENZY_REMINDER_TEMPLATE_SLUG",
  "SEQUENZY_API_URL",
  "SEQUENZY_APP_URL",
  "AGENTMAIL_API_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "REMINDER_PROCESS_SECRET",
  "CADENCE_DISABLE_EMAIL_SENDS",
  "CADENCE_DISABLE_BROWSER_PUSH_SENDS",
  "CADENCE_DISABLE_REMINDER_BATCHES",
  "CADENCE_DISABLE_OCCURRENCE_SYNC_BATCHES",
  "CADENCE_DISABLE_EXPORT_DOWNLOADS",
  "CADENCE_LAUNCH_BREAKER_REASON_CODE",
]) {
  assert(envExample.includes(`${name}=`), `.env.example is missing ${name}.`);
}

for (const [index, line] of envExample.split(/\r?\n/).entries()) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const [key, ...valueParts] = trimmed.split("=");
  const value = valueParts.join("=").trim();
  const allowedLiteralValues = new Set([
    "http://localhost:3000",
    "https://api.sequenzy.com",
    "https://sequenzy.com",
  ]);
  const looksSensitive = /(key|secret|token|password)/i.test(key);
  if (looksSensitive && value && !allowedLiteralValues.has(value) && !/^your[_-]/i.test(value)) {
    failures.push(`.env.example line ${index + 1} appears to contain a real secret for ${key}; use an empty placeholder.`);
  }
}

const requiredAppRoutes = [
  "app/(app)/timeline/page.tsx",
  "app/(app)/behaviors/page.tsx",
  "app/(app)/analytics/page.tsx",
  "app/(app)/export/page.tsx",
  "app/(app)/settings/page.tsx",
];

for (const route of requiredAppRoutes) {
  assert(exists(route), `Required app route is missing: ${route}`);
}

const forbiddenDashboardPaths = [
  "app/dashboard/page.tsx",
  "app/(app)/dashboard/page.tsx",
];
for (const route of forbiddenDashboardPaths) {
  assert(!exists(route), `Forbidden dashboard route exists: ${route}`);
}
assert(!read("lib/navigation.ts").includes("/dashboard"), "Navigation must not include /dashboard.");

const docsMustMentionChecks = [
  ["docs/SUPABASE_WORKFLOW.md", "supabase db push"],
  ["docs/SUPABASE_WORKFLOW.md", "supabase db reset"],
  ["docs/SUPABASE_WORKFLOW.md", "never change the hosted database directly"],
  ["docs/SEQUENZY_WORKFLOW.md", "npm run sequenzy -- login"],
  ["docs/SEQUENZY_WORKFLOW.md", "npm run sequenzy -- whoami"],
  ["docs/DATETIME_STRATEGY.md", "Temporal"],
  ["docs/ROUTE_MAP.md", "/timeline"],
  ["docs/OPERATIONS.md", "npm run agents:check"],
  ["docs/OPERATIONS.md", "npm run interactions:check"],
];
for (const [file, snippet] of docsMustMentionChecks) {
  assert(read(file).toLowerCase().includes(snippet.toLowerCase()), `${file} must mention ${snippet}.`);
}

const interactionCheck = spawnSync(
  process.execPath,
  [filePath("scripts/check-interactions.mjs")],
  {
    cwd: root,
    encoding: "utf8",
  },
);
assert(
  interactionCheck.status === 0,
  `Interaction registry validation failed:\n${(
    interactionCheck.stderr || interactionCheck.stdout || "Unknown error"
  ).trim()}`,
);

const loadInteractionCheck = spawnSync(
  process.execPath,
  [filePath("scripts/check-load-test-interactions.mjs")],
  {
    cwd: root,
    encoding: "utf8",
  },
);
assert(
  loadInteractionCheck.status === 0,
  `Load interaction manifest validation failed:\n${(
    loadInteractionCheck.stderr ||
    loadInteractionCheck.stdout ||
    "Unknown error"
  ).trim()}`,
);

if (!exists("supabase/config.toml")) {
  notes.push("Supabase project has not been initialized yet; run `npm run supabase -- init` during the Supabase ticket before creating migrations.");
}

if (failures.length > 0) {
  console.error(`agents:check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  if (notes.length > 0) {
    console.error("Notes:");
    for (const note of notes) console.error(`- ${note}`);
  }
  process.exit(1);
}

console.log(`agents:check passed (${assertions} invariants).`);
for (const note of notes) console.log(`note: ${note}`);
