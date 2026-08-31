import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, expect, it } from "vitest";

let directory: string;
let app: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "cadence-archive-test-"));
  app = path.join(directory, "expected", "Cadence.app");
  for (const part of ["MacOS", "Resources", "_CodeSignature"]) mkdirSync(path.join(app, "Contents", part), { recursive: true });
  writeFileSync(path.join(app, "Contents", "Info.plist"), "unchanged metadata");
  writeFileSync(path.join(app, "Contents", "MacOS", "cadence"), "unchanged executable", { mode: 0o755 });
  writeFileSync(path.join(app, "Contents", "_CodeSignature", "CodeResources"), "unchanged sealed resource manifest");
  writeFileSync(path.join(app, "Contents", "Resources", "product.js"), "approved product code");
  symlinkSync("product.js", path.join(app, "Contents", "Resources", "current.js"));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function archive(mutate?: (copy: string) => void) {
  const parent = path.join(directory, "archive-source");
  const copy = path.join(parent, "Cadence.app");
  cpSync(app, copy, { recursive: true, verbatimSymlinks: true });
  mutate?.(copy);
  const file = path.join(directory, "Cadence.app.tar.gz");
  const packed = spawnSync("tar", ["-czf", file, "-C", parent, "Cadence.app"], { encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1" } });
  expect(packed.status, packed.stderr).toBe(0);
  return file;
}
function verify(file: string) {
  return spawnSync("python3", ["apps/desktop/scripts/verify-updater-archive.py", file, app], { encoding: "utf8" });
}

it("verifies every file, directory, and symlink without extracting archive-controlled paths", () => {
  const result = verify(archive());
  expect(result.status, result.stderr).toBe(0);
});
it("rejects a modified resource even when executable, Info.plist, and CodeResources are unchanged", () => {
  const result = verify(archive((copy) => writeFileSync(path.join(copy, "Contents", "Resources", "product.js"), "X".repeat("approved product code".length))));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("File content differs");
});
it("rejects surplus archive paths", () => {
  const result = verify(archive((copy) => writeFileSync(path.join(copy, "Contents", "Resources", "surplus.js"), "unexpected")));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Unexpected archive path");
});
it("rejects changed symlink targets", () => {
  const result = verify(archive((copy) => {
    const link = path.join(copy, "Contents", "Resources", "current.js");
    rmSync(link); symlinkSync("../../outside", link);
  }));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Symlink target differs");
});

it("compares the DMG app without following symlinks and rejects changed contents or permissions", () => {
  const copy = path.join(directory, "mounted", "Cadence.app");
  cpSync(app, copy, { recursive: true, verbatimSymlinks: true });
  const compare = () => spawnSync("python3", ["-c",
    "import runpy,sys; from pathlib import Path; runpy.run_path(sys.argv[1])['compare_apps'](Path(sys.argv[2]),Path(sys.argv[3]))",
    "apps/desktop/scripts/verify-dmg.py", app, copy], { encoding: "utf8" });
  expect(compare().status).toBe(0);
  const resource = path.join(copy, "Contents", "Resources", "product.js");
  writeFileSync(resource, "X".repeat("approved product code".length));
  expect(compare().status).not.toBe(0);
  writeFileSync(resource, "approved product code");
  expect(compare().status).toBe(0);
  const binary = path.join(copy, "Contents", "MacOS", "cadence");
  chmodSync(binary, 0o600);
  expect(compare().status).not.toBe(0);
  chmodSync(binary, 0o755);
  const link = path.join(copy, "Contents", "Resources", "current.js");
  rmSync(link); symlinkSync("../../outside", link);
  expect(compare().status).not.toBe(0);
});

it("rejects unrelated DMG root files instead of distributing possible user data or keys", () => {
  const mount = path.join(directory, "volume");
  mkdirSync(mount);
  cpSync(app, path.join(mount, "Cadence.app"), { recursive: true, verbatimSymlinks: true });
  symlinkSync("/Applications", path.join(mount, "Applications"));
  const verifyLayout = () => spawnSync("python3", ["-c",
    "import runpy,sys; from pathlib import Path; runpy.run_path(sys.argv[1])['verify_volume_layout'](Path(sys.argv[2]),'Cadence.app')",
    "apps/desktop/scripts/verify-dmg.py", mount], { encoding: "utf8" });
  expect(verifyLayout().status).toBe(0);
  writeFileSync(path.join(mount, "cadence.sqlite3"), "synthetic private data");
  expect(verifyLayout().status).not.toBe(0);
  rmSync(path.join(mount, "cadence.sqlite3"));
  symlinkSync("/outside", path.join(mount, ".VolumeIcon.icns"));
  expect(verifyLayout().status).not.toBe(0);
});
