import { describe, expect, it } from "vitest";
import { createStoredZip, readZipEntries } from "../lib/services/zip";
import { createDesktopZip, readDesktopZipEntries } from "../apps/desktop/src/archive";

describe("portable desktop ZIP adapter", () => {
  it("round-trips desktop and existing web archives with Unicode file bytes preserved", () => {
    const files = [{ path: "data/notes.jsonl", content: '{"note":"é 😀"}' }, { path: "empty.txt", content: "" }];
    expect(readZipEntries(createDesktopZip(files))).toEqual(files);
    expect(readDesktopZipEntries(createStoredZip(files))).toEqual(files);
    expect(createDesktopZip(files)).toEqual(createDesktopZip(files));
  });

  it("rejects entry, total, archive and ratio limits before decompression", () => {
    const bytes = createStoredZip([{ path: "large.txt", content: "hello ".repeat(50) }]);
    expect(() => readDesktopZipEntries(bytes, { maxArchiveBytes: 1 })).toThrow("archive-size limit");
    expect(() => readDesktopZipEntries(bytes, { maxEntryUncompressedBytes: 20 })).toThrow("extracted-entry limit");
    expect(() => readDesktopZipEntries(bytes, { maxTotalUncompressedBytes: 20 })).toThrow("cumulative extracted-size limit");
    expect(() => readDesktopZipEntries(bytes, { maxCompressionRatio: 1 })).toThrow("compression-ratio limit");
    const entries = createStoredZip([{ path: "a", content: "" }, { path: "b", content: "" }]);
    expect(() => readDesktopZipEntries(entries, { maxEntries: 1 })).toThrow("more than 1 entries");
  });

  it("rejects a forged small output declaration instead of accepting truncated data", () => {
    const bytes = createStoredZip([{ path: "large.txt", content: "BehaviorLog data ".repeat(100) }]);
    const central = bytes.readUInt32LE(bytes.length - 6);
    bytes.writeUInt32LE(1, central + 24);
    expect(() => readDesktopZipEntries(bytes)).toThrow(/size|decompress/);
  });

  it("rejects CRC corruption and invalid central-directory offsets", () => {
    const bytes = createStoredZip([{ path: "entry", content: "value" }]);
    const central = bytes.readUInt32LE(bytes.length - 6);
    bytes.writeUInt32LE(0, central + 16);
    expect(() => readDesktopZipEntries(bytes)).toThrow("CRC");
    bytes.writeUInt32LE(bytes.length + 1, bytes.length - 6);
    expect(() => readDesktopZipEntries(bytes)).toThrow("outside the archive");
  });
});
