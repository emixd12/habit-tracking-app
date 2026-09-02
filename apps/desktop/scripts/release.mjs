import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReleaseBuildEnvironment, createReleaseOverlay, validateReleaseConfiguration, validateSigningEnvironment,
  createPreviewBuildEnvironment, createPreviewOverlay, validatePreviewConfiguration, validatePreviewBuildEnvironment,
  RELEASE_IDENTIFIER, RELEASE_NAME, RELEASE_TARGET } from "./release-config.mjs";
import { verifyUpdaterSignature } from "./verify-updater-signature.mjs";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(desktop, "../..");
const native = path.join(desktop, "src-tauri");
const base = JSON.parse(fs.readFileSync(path.join(native, "tauri.conf.json"), "utf8"));
const command = process.argv[2] ?? "check";
const preview = command.startsWith("preview-");
const version = preview ? process.argv[3] : base.version;
const overlay = preview ? createPreviewOverlay(base, process.env, version) : createReleaseOverlay(base, process.env);
const releaseDirectory = path.join(desktop, ".release");
// Verification tools need neither Apple credentials nor the private updater key.
const verificationEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.startsWith("APPLE_") && !key.startsWith("TAURI_SIGNING_PRIVATE_KEY") && key !== "TAURI_CONFIG"));

function run(binary, args, cwd = root, env = verificationEnvironment) {
  const result = spawnSync(binary, args, { cwd, env, encoding: "utf8", stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(binary)} ${args[0] ?? ""} failed.`);
}
function capture(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, env: verificationEnvironment, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(binary)} verification failed.`);
  return result.stdout;
}
function configurationErrors() {
  return preview ? validatePreviewConfiguration(base, overlay) : validateReleaseConfiguration(base, overlay);
}
function preflight({ readiness = false, build = false } = {}) {
  const errors = configurationErrors();
  if (!preview) errors.push(...validateSigningEnvironment(process.env));
  else if (build) errors.push(...validatePreviewBuildEnvironment(process.env));
  if (process.platform !== "darwin" || process.arch !== "arm64") errors.push("The initial release must build on an Apple Silicon Mac.");
  if (!preview) {
    try {
      const identities = capture("security", ["find-identity", "-v", "-p", "codesigning"]);
      if (!process.env.APPLE_SIGNING_IDENTITY || !identities.includes(`"${process.env.APPLE_SIGNING_IDENTITY}"`)) errors.push("The configured Developer ID Application identity is not valid in the local keychain.");
    } catch { errors.push("The local signing keychain could not be verified."); }
    if (process.env.APPLE_API_KEY_PATH && !fs.existsSync(process.env.APPLE_API_KEY_PATH)) errors.push("APPLE_API_KEY_PATH does not point to an available notarization key.");
  }
  for (const [binary, args] of [["xcrun", ["--find", preview ? "vtool" : "stapler"]], ["minisign", ["-v"]], ["python3", ["-c", "import tarfile"]]]) {
    try { capture(binary, args); } catch { errors.push(`${binary} is required for release verification.`); }
  }
  // A candidate is needed to test the updater interaction. Final readiness still requires that real evidence.
  const parity = spawnSync(process.execPath, ["scripts/check-interactions.mjs", ...(readiness ? ["--desktop-release"] : [])], { cwd: root, env: verificationEnvironment, encoding: "utf8" });
  if (parity.status !== 0) errors.push(`Desktop interaction parity is incomplete.\n${parity.stdout}${parity.stderr}`.trim());
  if (errors.length) throw new Error(errors.join("\n"));
}
function exactlyOne(directory, suffix) {
  const entries = fs.readdirSync(directory).filter((entry) => entry.endsWith(suffix));
  if (entries.length !== 1) throw new Error(`Expected exactly one ${suffix} artifact in ${directory}.`);
  return path.join(directory, entries[0]);
}
function verify(bundleDirectory) {
  const errors = configurationErrors();
  if (!preview && !process.env.APPLE_SIGNING_IDENTITY?.startsWith("Developer ID Application:")) errors.push("APPLE_SIGNING_IDENTITY is required to verify the expected signing authority.");
  if (errors.length) throw new Error(errors.join("\n"));
  const app = path.join(bundleDirectory, "macos", `${RELEASE_NAME}.app`);
  const archive = `${app}.tar.gz`;
  const signatureFile = `${archive}.sig`;
  const dmg = exactlyOne(path.join(bundleDirectory, "dmg"), ".dmg");
  const plist = path.join(app, "Contents", "Info.plist");
  const value = (key) => capture("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist]).trim();
  if (value("CFBundleIdentifier") !== RELEASE_IDENTIFIER || value("CFBundleShortVersionString") !== version) throw new Error("The signed app identity/version does not match this candidate.");
  const executableName = value("CFBundleExecutable");
  if (!/^[A-Za-z0-9_.-]+$/.test(executableName) || [".", ".."].includes(executableName)) throw new Error("The app executable name is invalid.");
  const executable = path.join(app, "Contents", "MacOS", executableName);
  if (preview && !fs.readFileSync(executable).includes(Buffer.from("app.cadence.desktop.auth.legacy-qa"))) {
    throw new Error("The ad hoc preview must use the legacy macOS login Keychain path.");
  }
  if (value("LSMinimumSystemVersion") !== "14.0") throw new Error("The app does not declare macOS 14.0 minimum.");
  const signing = spawnSync("codesign", ["--display", "--verbose=4", app], { env: verificationEnvironment, encoding: "utf8" });
  if (signing.status !== 0 || !/flags=0x[0-9a-f]+\([^)]*\bruntime\b[^)]*\)/i.test(signing.stderr)
    || !/^Info.plist entries=\d+/m.test(signing.stderr) || !/^Sealed Resources version=\d+/m.test(signing.stderr)) {
    throw new Error("The app must have hardened runtime, bound Info.plist, and sealed resources.");
  }
  if (preview ? !signing.stderr.split("\n").includes("Signature=adhoc")
    : !signing.stderr.split("\n").includes(`Authority=${process.env.APPLE_SIGNING_IDENTITY}`)) {
    throw new Error(preview ? "The preview app must use ad hoc signing." : "The app does not use the expected Developer ID authority.");
  }
  if (capture("lipo", ["-archs", executable]).trim() !== "arm64") throw new Error("The initial release must contain only the arm64 executable.");
  if (!/minos\s+14\.0(?:\s|$)/.test(capture("xcrun", ["vtool", "-show-build", executable]))) throw new Error("The executable does not declare macOS 14.0 minimum.");
  run("codesign", ["--verify", "--deep", "--strict", app]);
  if (!preview) {
    run("codesign", ["--verify", "--deep", "--strict", dmg]);
    for (const artifact of [app, dmg]) run("xcrun", ["stapler", "validate", artifact]);
    run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
    run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", dmg]);
  }
  run("python3", [path.join(desktop, "scripts", "verify-dmg.py"), dmg, app]);
  verifyUpdaterSignature({ archivePath: archive, publicKey: overlay.plugins.updater.pubkey,
    signature: fs.readFileSync(signatureFile, "utf8") });
  // Inspect every archive entry without extracting archive-controlled paths or following links.
  run("python3", [path.join(desktop, "scripts", "verify-updater-archive.py"), archive, app]);
  return { milestone: preview ? "unnotarized preview" : "production candidate", identifier: RELEASE_IDENTIFIER, version, target: RELEASE_TARGET, checkedAt: new Date().toISOString(),
    checks: ["strict codesign", "hardened runtime", "bound Info.plist", "sealed resources", "arm64", "compiled macOS 14 minimum", "read-only DMG contents match app", "updater signature", "updater archive contents match app",
      ...(preview ? ["ad hoc app signature", "legacy macOS login Keychain"] : ["Developer ID authority", "Gatekeeper", "stapled notarization"])],
    artifacts: [dmg, archive, signatureFile].map((file) => ({ file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") })),
    binarySha256: createHash("sha256").update(fs.readFileSync(executable)).digest("hex"),
    appleTrust: preview ? "Developer ID, notarization, and Gatekeeper acceptance deferred; not verified" : "artifact checks passed; downloaded launch remains unverified",
    declaredMinimumMacOS: "14.0", macOS14Compatibility: "not verified by this script", downloadedLaunch: "not verified by this script",
    upgradePreservation: "not verified by this script", migrationRecovery: "not verified by this script", feedAvailability: "not verified by this script", publication: "not performed" };
}

function writeReport(report, directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "artifact-verification.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${preview ? "Unnotarized preview" : "Signed production"} artifacts passed local verification. Downloaded launch, live upgrade preservation, and publication remain separate gates.\n`);
}

function stagePreview(bundleDirectory, directory) {
  const destination = path.join(directory, "bundle");
  if (fs.existsSync(destination)) throw new Error("This preview version already has staged artifacts. Use a new version; existing evidence was not replaced.");
  const temporary = fs.mkdtempSync(path.join(directory, ".candidate-"));
  try {
    const bundle = path.join(temporary, "bundle");
    fs.mkdirSync(path.join(bundle, "macos"), { recursive: true });
    fs.mkdirSync(path.join(bundle, "dmg"));
    const app = path.join(bundleDirectory, "macos", `${RELEASE_NAME}.app`);
    for (const source of [app, `${app}.tar.gz`, `${app}.tar.gz.sig`]) {
      fs.cpSync(source, path.join(bundle, "macos", path.basename(source)), { recursive: true, verbatimSymlinks: true });
    }
    const dmg = exactlyOne(path.join(bundleDirectory, "dmg"), ".dmg");
    fs.copyFileSync(dmg, path.join(bundle, "dmg", path.basename(dmg)));
    const report = verify(bundle);
    fs.renameSync(bundle, destination);
    report.artifacts = report.artifacts.map((artifact) => ({ ...artifact, file: path.join(destination, path.relative(bundle, artifact.file)) }));
    writeReport(report, directory);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

function containsBytes(directory, value) {
  const expected = Buffer.from(value);
  return fs.readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? containsBytes(candidate, value)
      : entry.isFile() && fs.readFileSync(candidate).includes(expected);
  });
}

function verifyBuiltPublicAuth(env) {
  const url = env.VITE_SUPABASE_URL.trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY.trim());
  const dist = path.join(desktop, "dist");
  if (!containsBytes(dist, url) || !containsBytes(dist, key)) {
    throw new Error("The freshly built desktop frontend omits its reviewed public Supabase configuration.");
  }
}

function buildCandidate() {
  preflight({ build: true });
  const directory = preview ? path.join(releaseDirectory, "preview", version) : releaseDirectory;
  if (preview && fs.existsSync(path.join(directory, "bundle"))) throw new Error("This preview version already has staged artifacts. Use a new version; existing evidence was not replaced.");
  fs.mkdirSync(directory, { recursive: true });
  const config = path.join(directory, preview ? "tauri.preview.conf.json" : "tauri.release.conf.json");
  fs.writeFileSync(config, `${JSON.stringify(overlay, null, 2)}\n`);
  const buildEnvironment = preview ? createPreviewBuildEnvironment(process.env) : createReleaseBuildEnvironment(process.env);
  run("npm", ["run", "build"], desktop, buildEnvironment);
  verifyBuiltPublicAuth(buildEnvironment);
  run("npm", ["exec", "--", "tauri", "build", "--ci", "--target", RELEASE_TARGET, "--config", config], desktop,
    buildEnvironment);
  const bundle = path.join(native, "target", RELEASE_TARGET, "release", "bundle");
  if (preview) stagePreview(bundle, directory);
  else writeReport(verify(bundle), directory);
}

try {
  if (command === "check" && [2, 3].includes(process.argv.length)) {
    preflight({ readiness: true });
    process.stdout.write("Release prerequisites passed. No artifacts were built or published.\n");
  } else if (command === "build" && process.argv.length === 3) {
    buildCandidate();
  } else if (command === "verify" && process.argv.length === 4) {
    writeReport(verify(path.resolve(process.argv[3])), releaseDirectory);
  } else if (command === "preview-check" && process.argv.length === 4) {
    preflight();
    process.stdout.write("Preview candidate prerequisites passed without Apple credentials. No artifacts were built; final release readiness is not established.\n");
  } else if (command === "preview-build" && process.argv.length === 4) {
    buildCandidate();
  } else if (command === "preview-verify" && process.argv.length === 5) {
    const report = verify(path.resolve(process.argv[4]));
    writeReport(report, path.join(releaseDirectory, "preview", version));
  } else throw new Error("Usage: release.mjs check|build|verify <bundle-directory> | preview-check|preview-build <version> | preview-verify <version> <bundle-directory>");
} catch (error) {
  process.stderr.write(`Desktop release check failed:\n${error.message}\n`);
  process.exitCode = 1;
}
