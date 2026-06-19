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

function walk(relativePath) {
  const start = filePath(relativePath);
  if (!fs.existsSync(start)) return [];
  const results = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current)) {
        if (["node_modules", ".git", ".next", ".supabase"].includes(child)) continue;
        stack.push(path.join(current, child));
      }
    } else {
      results.push(path.relative(root, current));
    }
  }
  return results.sort();
}

const resolverRegistry = [
  {
    domain: "recurrence",
    resolver: "lib/resolvers/recurrence.resolver.ts",
    test: "tests/recurrence.resolver.test.ts",
    source: "docs/RECURRENCE_RULES.md",
  },
  {
    domain: "occurrence",
    resolver: "lib/resolvers/occurrence.resolver.ts",
    test: "tests/occurrence.resolver.test.ts",
    source: "docs/DATA_MODEL.md",
  },
  {
    domain: "timeline",
    resolver: "lib/resolvers/timeline.resolver.ts",
    test: "tests/timeline.resolver.test.ts",
    source: "docs/UI_SPEC.md",
  },
  {
    domain: "status",
    resolver: "lib/resolvers/status.resolver.ts",
    test: "tests/status.resolver.test.ts",
    source: "docs/USER_FLOWS.md",
  },
  {
    domain: "reminder",
    resolver: "lib/resolvers/reminder.resolver.ts",
    test: "tests/reminder.resolver.test.ts",
    source: "docs/NOTIFICATION_SPEC.md",
  },
  {
    domain: "analytics",
    resolver: "lib/resolvers/analytics.resolver.ts",
    test: "tests/analytics.resolver.test.ts",
    source: "docs/UI_SPEC.md",
  },
  {
    domain: "export",
    resolver: "lib/resolvers/export.resolver.ts",
    test: "tests/export.resolver.test.ts",
    source: "docs/EXPORT_FORMATS.md",
  },
  {
    domain: "behaviorlog import",
    resolver: "lib/resolvers/behaviorlog-import.resolver.ts",
    test: "tests/behaviorlog-import.resolver.test.ts",
    source: "docs/EXPORT_FORMATS.md",
  },
  {
    domain: "imported intervention promotion",
    resolver: "lib/resolvers/imported-intervention-promotion.resolver.ts",
    test: "tests/imported-intervention-promotion.test.ts",
    source: "docs/NOTIFICATION_SPEC.md",
  },
];

const guide = read("docs/AGENT_RESOLVERS.md");
for (const snippet of ["Owner resolver", "Allowed callers", "Forbidden bypasses", "Required test", "Drift check", "npm run resolvers:check"]) {
  assert(guide.includes(snippet), `docs/AGENT_RESOLVERS.md is missing registry column/section: ${snippet}`);
}

for (const entry of resolverRegistry) {
  assert(guide.includes(entry.resolver), `Resolver registry must mention ${entry.resolver}.`);
  assert(guide.includes(entry.test), `Resolver registry must mention ${entry.test}.`);
  assert(guide.includes(entry.source), `Resolver registry must mention ${entry.source}.`);

  if (exists(entry.resolver)) {
    assert(exists(entry.test), `${entry.resolver} exists but paired test is missing: ${entry.test}`);
    const content = read(entry.resolver);
    const forbiddenPatterns = [
      [/@supabase\/supabase-js/, "direct Supabase client import"],
      [/from ["']react["']|from ["']next\//, "React or Next import"],
      [/\b(window|document|navigator|localStorage|Notification)\b/, "browser global"],
      [/\bfetch\s*\(/, "network fetch"],
      [/\b(sequenzy|web-push|nodemailer)\b/i, "email/push provider"],
      [/process\.env/, "environment access"],
    ];
    for (const [pattern, label] of forbiddenPatterns) {
      assert(!pattern.test(content), `${entry.resolver} must not use ${label}; move orchestration to services/repositories.`);
    }
  } else {
    notes.push(`${entry.resolver} not implemented yet; registry check is documentation-only for ${entry.domain}.`);
  }
}

for (const file of walk("app")) {
  if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
  assert(!file.includes("dashboard"), `Forbidden dashboard route/file exists: ${file}`);
}
assert(!read("lib/navigation.ts").includes("/dashboard"), "Navigation must not include /dashboard.");

const uiAndRouteFiles = [...walk("app"), ...walk("components")].filter(
  (file) => file.endsWith(".ts") || file.endsWith(".tsx"),
);
const suspiciousBusinessTerms = [
  "intervalDays",
  "dayOfMonth",
  "reminder_offset_minutes",
  "scheduled_send_at",
  "status === \"unresolved\"",
];
for (const file of uiAndRouteFiles) {
  const content = read(file);
  for (const term of suspiciousBusinessTerms) {
    if (content.includes(term)) {
      failures.push(`${file} contains business-logic term '${term}'. If intentional, move calculation to a resolver/service and keep UI/API thin.`);
    }
  }
}

if (exists("app/api")) {
  for (const file of walk("app/api")) {
    if (!file.endsWith("route.ts") && !file.endsWith("route.tsx")) continue;
    const content = read(file);
    const doesNontrivialWork = /insert\(|update\(|delete\(|select\(|transactional\.send|webpush|for \(|while \(/.test(content);
    if (doesNontrivialWork) {
      assert(/from ["']@?\/?lib\/services|from ["']@\/lib\/services/.test(content), `${file} appears to perform orchestration; API routes must call services.`);
    }
  }
}

const dateStrategy = read("docs/DATETIME_STRATEGY.md");
for (const snippet of ["Temporal", "America/New_York", "local_date", "timestamptz", "now is injected"]) {
  assert(dateStrategy.includes(snippet), `docs/DATETIME_STRATEGY.md must lock ${snippet}.`);
}

if (failures.length > 0) {
  console.error(`resolvers:check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  if (notes.length > 0) {
    console.error("Notes:");
    for (const note of notes) console.error(`- ${note}`);
  }
  process.exit(1);
}

console.log(`resolvers:check passed (${assertions} invariants).`);
for (const note of notes) console.log(`note: ${note}`);
