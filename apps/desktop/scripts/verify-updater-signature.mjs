import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decodeUpdaterPublicKey } from "./release-config.mjs";

/** Verify Tauri's base64 envelopes using the release machine's real Minisign. */
export function verifyUpdaterSignature({ archivePath, publicKey, signature }) {
  const key = decodeUpdaterPublicKey(publicKey);
  const encoded = typeof signature === "string" ? signature.trim() : "";
  if (!encoded || encoded.length > 16_384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("The updater signature is not a valid Tauri base64 envelope.");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64") !== encoded) {
    throw new Error("The updater signature is not a valid Tauri base64 envelope.");
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cadence-update-signature-"));
  try {
    const keyPath = path.join(temporary, "updater.pub");
    const signaturePath = path.join(temporary, "updater.minisig");
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    fs.writeFileSync(signaturePath, decoded, { mode: 0o600 });
    const result = spawnSync("minisign", ["-V", "-q", "-m", archivePath, "-p", keyPath, "-x", signaturePath], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("APPLE_")
        && !name.startsWith("TAURI_SIGNING_PRIVATE_KEY"))),
    });
    if (result.error || result.status !== 0) {
      throw new Error("The updater archive signature verification failed.");
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
