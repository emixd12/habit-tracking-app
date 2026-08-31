import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyUpdaterSignature } from "../apps/desktop/scripts/verify-updater-signature.mjs";

// This opt-in release test needs Minisign and tar, but no production credentials.
// Private Ed25519 keys remain in memory; they are never exported or written.
describe.runIf(process.env.CADENCE_RELEASE_CRYPTO === "1")("real updater signature verification", () => {
  let directory: string;
  let archivePath: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "cadence-release-crypto-"));
    archivePath = path.join(directory, "synthetic updater.tar.gz");
    writeFileSync(path.join(directory, "fixture.txt"), "Synthetic release-verifier fixture only.\n");
    const packed = spawnSync("tar", ["-czf", archivePath, "-C", directory, "fixture.txt"], {
      encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1" }, timeout: 10_000,
    });
    if (packed.error || packed.status !== 0) throw new Error("The signature fixture needs tar.");
  });
  afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

  function signatureFixture(keyId = randomBytes(8)) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const encodedPublicKey = publicKey.export({ format: "jwk" }).x;
    if (!encodedPublicKey) throw new Error("The fixture public key is unavailable.");
    const publicBytes = Buffer.concat([Buffer.from("Ed"), keyId, Buffer.from(encodedPublicKey, "base64url")]);
    const archiveHash = createHash("blake2b512").update(readFileSync(archivePath)).digest();
    const signatureBytes = sign(null, archiveHash, privateKey);
    const trustedComment = "Cadence disposable signature fixture; prehashed";
    const globalSignature = sign(null, Buffer.concat([signatureBytes, Buffer.from(trustedComment)]), privateKey);
    // Minisign's current format signs the BLAKE2b-512 digest, then authenticates
    // the raw signature plus trusted comment with a second Ed25519 signature.
    const packet = Buffer.concat([Buffer.from("ED"), keyId, signatureBytes]);
    const signatureText = `untrusted comment: disposable test signature\n${packet.toString("base64")}\ntrusted comment: ${trustedComment}\n${globalSignature.toString("base64")}\n`;
    return {
      publicKey: Buffer.from(`untrusted comment: disposable test public key\n${publicBytes.toString("base64")}\n`).toString("base64"),
      signature: Buffer.from(signatureText).toString("base64"),
      keyId,
    };
  }

  it("accepts the unchanged archive through the production Minisign verifier", () => {
    expect(() => verifyUpdaterSignature({ archivePath, ...signatureFixture() })).not.toThrow();
  });
  it("rejects changed archive bytes with the original valid signature", () => {
    const fixture = signatureFixture();
    const changed = readFileSync(archivePath);
    changed[changed.length - 1] ^= 1;
    writeFileSync(archivePath, changed);
    expect(() => verifyUpdaterSignature({ archivePath, ...fixture })).toThrow("signature verification failed");
  });
  it("rejects a different public key even when the public key ID is identical", () => {
    const fixture = signatureFixture();
    const wrongKey = signatureFixture(fixture.keyId).publicKey;
    expect(() => verifyUpdaterSignature({ archivePath, ...fixture, publicKey: wrongKey })).toThrow("signature verification failed");
  });
  it("rejects a changed signature packet", () => {
    const fixture = signatureFixture();
    const lines = Buffer.from(fixture.signature, "base64").toString("utf8").split("\n");
    const packet = Buffer.from(lines[1], "base64");
    packet[30] ^= 1;
    lines[1] = packet.toString("base64");
    const signature = Buffer.from(lines.join("\n")).toString("base64");
    expect(() => verifyUpdaterSignature({ archivePath, ...fixture, signature })).toThrow("signature verification failed");
  });
  it("authenticates the trusted comment as well as archive content", () => {
    const fixture = signatureFixture();
    const signature = Buffer.from(Buffer.from(fixture.signature, "base64").toString("utf8").replace("trusted comment: Cadence", "trusted comment: Changed")).toString("base64");
    expect(() => verifyUpdaterSignature({ archivePath, ...fixture, signature })).toThrow("signature verification failed");
  });
  it("rejects malformed base64 instead of silently discarding invalid characters", () => {
    const fixture = signatureFixture();
    expect(() => verifyUpdaterSignature({ archivePath, ...fixture, signature: `${fixture.signature}!` })).toThrow("base64 envelope");
  });
});
