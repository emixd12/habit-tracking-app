import fs from "node:fs";
import path from "node:path";

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
  "docs/TICKETS.md",
  "docs/DECISIONS.md",
  "docs/NOTIFICATION_SPEC.md",
  "docs/DATA_MODEL.md",
  ".agents/skills/impeccable/SKILL.md",
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
  "resolvers:check",
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
  "npm run agents:check",
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
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "REMINDER_PROCESS_SECRET",
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
];
for (const [file, snippet] of docsMustMentionChecks) {
  assert(read(file).toLowerCase().includes(snippet.toLowerCase()), `${file} must mention ${snippet}.`);
}

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
