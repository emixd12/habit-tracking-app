import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

const [appPath, beforePath, afterPath, ...extraPaths] = process.argv.slice(2);
if (!appPath || !beforePath || !afterPath) {
  throw new Error("Usage: desktop-release-acceptance.mjs <Cadence.app> <protected-before.sqlite3> <after.sqlite3>");
}
const expectedSchemaVersion = Number(process.env.CADENCE_DESKTOP_RELEASE_EXPECTED_SCHEMA_VERSION);
if (!Number.isSafeInteger(expectedSchemaVersion) || expectedSchemaVersion < 1) {
  throw new Error("CADENCE_DESKTOP_RELEASE_EXPECTED_SCHEMA_VERSION must name the expected positive schema version.");
}
let secretCanaries;
try { secretCanaries = JSON.parse(process.env.CADENCE_DESKTOP_RELEASE_SECRET_CANARIES ?? ""); }
catch { throw new Error("CADENCE_DESKTOP_RELEASE_SECRET_CANARIES must be a JSON array."); }
if (!Array.isArray(secretCanaries) || !secretCanaries.length || secretCanaries.some((value) => typeof value !== "string" || value.length < 16)) {
  throw new Error("CADENCE_DESKTOP_RELEASE_SECRET_CANARIES must contain one or more exact secret canaries of at least 16 characters.");
}
const commandEnvironment = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => key !== "CADENCE_DESKTOP_RELEASE_SECRET_CANARIES"));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sql = (database, statement) => JSON.parse(execFileSync("sqlite3", ["-json", database, statement], { encoding: "utf8", env: commandEnvironment }) || "[]");
const tables = [
  "profiles", "categories", "behaviors", "behavior_definition_events",
  "behavior_configuration_events", "behavior_revisions", "behavior_schedules",
  "behavior_schedule_slots", "occurrences", "occurrence_status_events",
  "imported_notes", "imported_interventions", "occurrence_time_sessions",
  "behaviorlog_import_runs", "behaviorlog_import_record_mappings", "mutation_outbox",
  "tombstones", "sync_cursors", "reminder_deliveries", "native_reminder_state",
  "native_reminder_coverage", "account_link_metadata", "account_sync_baselines",
  "account_first_link_attempts",
];

function databaseEvidence(database) {
  const names = new Set(sql(database, "SELECT name FROM sqlite_master WHERE type='table'").map(({ name }) => name));
  const counts = Object.fromEntries(tables.filter((table) => names.has(table)).map((table) => [table, sql(database, `SELECT count(*) AS count FROM ${table}`)[0].count]));
  const profileIds = sql(database, "SELECT id FROM profiles ORDER BY id").map(({ id }) => id);
  return {
    path: realpathSync(database),
    mode: (lstatSync(database).mode & 0o777).toString(8).padStart(3, "0"),
    sha256: sha256(readFileSync(database)),
    integrity: sql(database, "PRAGMA integrity_check")[0].integrity_check,
    foreignKeyErrors: sql(database, "PRAGMA foreign_key_check").length,
    schemaVersion: sql(database, "SELECT coalesce(max(version),0) AS version FROM schema_migrations")[0].version,
    profileIdentitySha256: sha256(profileIds.join("\n")),
    counts,
  };
}

function files(root) {
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) output.push(...files(file));
    else if (entry.isFile()) output.push(file);
  }
  return output;
}

function secretFindings(paths) {
  const findings = [];
  const jwt = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
  const serviceKey = /\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]{16,}/g;
  for (const file of paths) {
    const buffers = [readFileSync(file)];
    if (file.endsWith(".zip")) buffers.push(execFileSync("unzip", ["-p", file], { maxBuffer: 128 * 1024 * 1024, env: commandEnvironment }));
    for (const buffer of buffers) {
      const text = buffer.toString("latin1");
      if (serviceKey.test(text)) findings.push({ file, role: "service_role_key" });
      serviceKey.lastIndex = 0;
      for (const token of text.match(jwt) ?? []) {
        try {
          const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
          if (["authenticated", "service_role"].includes(payload.role)) findings.push({ file, role: payload.role });
        } catch { /* Non-JWT binary coincidence. */ }
      }
      for (const canary of secretCanaries) {
        if (buffer.includes(Buffer.from(canary))) findings.push({ file, role: "exact_secret_canary" });
      }
    }
  }
  return findings;
}

const before = databaseEvidence(beforePath);
const after = databaseEvidence(afterPath);
if (before.integrity !== "ok" || after.integrity !== "ok" || before.foreignKeyErrors || after.foreignKeyErrors) throw new Error("A database failed integrity validation.");
if (before.mode !== "600" || after.mode !== "600") throw new Error("Release databases must use owner-only mode 0600.");
if (after.schemaVersion <= before.schemaVersion || after.schemaVersion !== expectedSchemaVersion) throw new Error("The release database did not advance to the expected schema version.");
if (before.profileIdentitySha256 !== after.profileIdentitySha256) throw new Error("The stable local profile changed across migration.");
for (const [table, count] of Object.entries(before.counts)) {
  if ((after.counts[table] ?? -1) < count) throw new Error(`${table} lost records across migration.`);
}
const additionalFiles = extraPaths.flatMap((entry) => !existsSync(entry) ? [] : lstatSync(entry).isDirectory() ? files(entry) : [entry]);
const scannedFiles = [...new Set([...files(appPath), beforePath, afterPath, ...additionalFiles].map((file) => realpathSync(file)))];
const secretScan = secretFindings(scannedFiles);
const findingsByFile = Object.values(secretScan.reduce((summary, finding) => {
  const key = `${finding.file}\0${finding.role}`;
  summary[key] ??= { file: finding.file, role: finding.role, count: 0 };
  summary[key].count += 1;
  return summary;
}, {}));
const scopeFiles = (entry) => !existsSync(entry) ? 0 : lstatSync(entry).isDirectory() ? files(entry).length : 1;
const scopePath = (entry) => existsSync(entry) ? realpathSync(entry) : path.resolve(entry);

const plist = path.join(appPath, "Contents", "Info.plist");
const plistValue = (key) => execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], { encoding: "utf8", env: commandEnvironment }).trim();
const exactSecretCanaryFindings = secretScan.filter(({ role }) => role === "exact_secret_canary").length;
process.stdout.write(`${JSON.stringify({
  capturedAt: new Date().toISOString(),
  system: { productVersion: execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8", env: commandEnvironment }).trim(), architecture: execFileSync("uname", ["-m"], { encoding: "utf8", env: commandEnvironment }).trim() },
  app: { path: realpathSync(appPath), identifier: plistValue("CFBundleIdentifier"), version: plistValue("CFBundleShortVersionString"), sha256: sha256(readFileSync(path.join(appPath, "Contents", "MacOS", plistValue("CFBundleExecutable")))) },
  before, after,
  secretScan: {
    scannedFiles: scannedFiles.length,
    scopes: [appPath, beforePath, afterPath, ...extraPaths].map((entry) => ({ path: scopePath(entry), files: scopeFiles(entry), exists: existsSync(entry) })),
    authenticatedSessionOrServiceRoleFindings: secretScan.length - exactSecretCanaryFindings,
    exactSecretCanaryFindings,
    totalFindings: secretScan.length,
    exactCanariesChecked: secretCanaries.length,
    findingsByFile,
  },
}, null, 2)}\n`);
if (secretScan.length) process.exitCode = 1;
