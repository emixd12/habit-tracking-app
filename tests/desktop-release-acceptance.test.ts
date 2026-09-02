import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe.skipIf(process.platform !== "darwin")("desktop release migration acceptance", () => {
  let directory: string;
  let app: string;
  let before: string;
  let after: string;
  const canary = "cadence-release-secret-canary-123";

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "cadence-release-acceptance-"));
    app = path.join(directory, "Cadence.app");
    before = path.join(directory, "before.sqlite3");
    after = path.join(directory, "after.sqlite3");
    mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true });
    writeFileSync(path.join(app, "Contents", "Info.plist"), '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>app.cadence.desktop</string><key>CFBundleShortVersionString</key><string>0.1.1-preview.19</string><key>CFBundleExecutable</key><string>cadence</string></dict></plist>');
    writeFileSync(path.join(app, "Contents", "MacOS", "cadence"), "synthetic executable", { mode: 0o755 });
    createDatabase(before, 9);
    createDatabase(after, 10);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  function run(overrides: Record<string, string | undefined> = {}) {
    return spawnSync(process.execPath, ["scripts/desktop-release-acceptance.mjs", app, before, after], {
      cwd: process.cwd(),
      env: { ...process.env, CADENCE_DESKTOP_RELEASE_EXPECTED_SCHEMA_VERSION: "10", CADENCE_DESKTOP_RELEASE_SECRET_CANARIES: JSON.stringify([canary]), ...overrides },
      encoding: "utf8",
    });
  }

  it("requires an advancing expected schema, owner-only databases, and exact secret canaries", () => {
    const accepted = run();
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(JSON.parse(accepted.stdout).secretScan).toMatchObject({ exactCanariesChecked: 1, authenticatedSessionOrServiceRoleFindings: 0,
      exactSecretCanaryFindings: 0, totalFindings: 0 });

    const missingCanaries = run({ CADENCE_DESKTOP_RELEASE_SECRET_CANARIES: "" });
    expect(missingCanaries.status).toBe(1);
    expect(missingCanaries.stderr).toContain("CADENCE_DESKTOP_RELEASE_SECRET_CANARIES");

    createDatabase(after, 9);
    const unchanged = run();
    expect(unchanged.status).toBe(1);
    expect(unchanged.stderr).toContain("did not advance to the expected schema version");

    createDatabase(after, 11);
    const unexpectedFinal = run();
    expect(unexpectedFinal.status).toBe(1);
    expect(unexpectedFinal.stderr).toContain("did not advance to the expected schema version");

    createDatabase(after, 10);
    chmodSync(after, 0o644);
    const exposed = run();
    expect(exposed.status).toBe(1);
    expect(exposed.stderr).toContain("owner-only mode 0600");
  }, 15_000);

  it("fails without printing an exact secret canary found in the release scope", () => {
    writeFileSync(path.join(app, "Contents", "MacOS", "cadence"), `synthetic executable ${canary}`, { mode: 0o755 });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain(canary);
    expect(result.stdout).toContain("exact_secret_canary");
    expect(JSON.parse(result.stdout).secretScan).toMatchObject({ authenticatedSessionOrServiceRoleFindings: 0,
      exactSecretCanaryFindings: 1, totalFindings: 1 });
  });
});

function createDatabase(file: string, version: number) {
  rmSync(file, { force: true });
  execFileSync("sqlite3", [file, `CREATE TABLE schema_migrations(version INTEGER NOT NULL); INSERT INTO schema_migrations VALUES(${version}); CREATE TABLE profiles(id TEXT PRIMARY KEY); INSERT INTO profiles VALUES('stable-profile');`]);
  chmodSync(file, 0o600);
}
