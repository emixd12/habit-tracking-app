import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

import { sha256 } from "../packages/core/src/hash";
import { createBehaviorLogImportBundleFingerprint } from "../lib/resolvers/behaviorlog-import.resolver";

const vectors = [
  "", "abc", "\0", "é", "💾", "e\u0301", "\ud800", "\udc00",
  "\ud800A", "A\udc00B", "\ud800\udc00",
  ...Array.from({ length: 128 }, (_, length) => "a".repeat(length)),
];

describe("portable SHA-256 compatibility", () => {
  it("matches Node UTF-8 hashes, including unpaired surrogates and block boundaries", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const input of vectors) {
      expect(sha256(input)).toBe(createHash("sha256").update(input, "utf8").digest("hex"));
    }
  });

  it("runs the actual browser dependency branch without Node or browser globals", async () => {
    const bundle = await build({
      entryPoints: ["packages/core/src/hash.ts"], bundle: true, write: false,
      platform: "browser", format: "iife", globalName: "PortableHash", target: "es2024",
    });
    const context: { PortableHash?: { sha256: (input: string) => string } } = {};
    runInNewContext(bundle.outputFiles[0]!.text, context);
    for (const input of vectors) {
      expect(context.PortableHash!.sha256(input)).toBe(
        createHash("sha256").update(input, "utf8").digest("hex"),
      );
    }
  });

  it("preserves bundle path ordering, content hashes, and null separators", () => {
    const files = [
      { path: "z.jsonl", content: "é\n" },
      { path: "a.jsonl", content: "\ud800\n" },
    ];
    const expected = createHash("sha256")
      .update("a.jsonl\0")
      .update(createHash("sha256").update("\ud800\n").digest("hex"))
      .update("\0z.jsonl\0")
      .update(createHash("sha256").update("é\n").digest("hex"))
      .update("\0")
      .digest("hex");
    expect(createBehaviorLogImportBundleFingerprint(files)).toBe(expected);
    expect(createBehaviorLogImportBundleFingerprint([...files].reverse())).toBe(expected);
  });
});
