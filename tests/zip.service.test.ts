import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { createStoredZip, readZipEntries } from "../lib/services/zip";

describe("bounded ZIP reading", () => {
  it("writes DEFLATE entries with matching compressed sizes and round-trips them", () => {
    const zip = createStoredZip([
      { path: "entry.txt", content: "BehaviorLog data ".repeat(12) },
    ]);
    const centralOffset = endOfCentralDirectory(zip).readUInt32LE(16);

    expect(zip.readUInt16LE(8)).toBe(8);
    expect(zip.readUInt16LE(centralOffset + 10)).toBe(8);
    expect(zip.readUInt32LE(18)).toBe(zip.readUInt32LE(centralOffset + 20));
    expect(readZipEntries(zip)).toEqual([
      { path: "entry.txt", content: "BehaviorLog data ".repeat(12) },
    ]);
  });

  it("rejects archives whose declared entry count exceeds the configured limit", () => {
    const zip = createStoredZip(
      Array.from({ length: 129 }, (_, index) => ({
        path: `entry-${index}.txt`,
        content: "",
      })),
    );

    expect(() => readZipEntries(zip)).toThrow(
      "ZIP contains more than 128 entries",
    );
  });

  it("rejects a declared entry before reading more than its byte limit", () => {
    const zip = createStoredZip([{ path: "entry.txt", content: "1234" }]);

    expect(() =>
      readZipEntries(zip, {
        maxEntries: 4,
        maxEntryUncompressedBytes: 3,
        maxTotalUncompressedBytes: 8,
        maxCompressionRatio: 10,
      }),
    ).toThrow("ZIP entry entry.txt exceeds the 3 byte extracted-entry limit");
  });

  it("rejects cumulative declared extraction before reading entry contents", () => {
    const zip = createStoredZip([
      { path: "first.txt", content: "1234" },
      { path: "second.txt", content: "5678" },
    ]);

    expect(() =>
      readZipEntries(zip, {
        maxEntries: 4,
        maxEntryUncompressedBytes: 4,
        maxTotalUncompressedBytes: 7,
        maxCompressionRatio: 10,
      }),
    ).toThrow("ZIP exceeds the 7 byte cumulative extracted-size limit");
  });

  it("rejects a suspicious declared compression ratio before decompression", () => {
    const zip = createDeflatedZip("entry.txt", "x".repeat(1_000));

    expect(() =>
      readZipEntries(zip, {
        maxEntries: 4,
        maxEntryUncompressedBytes: 2_000,
        maxTotalUncompressedBytes: 2_000,
        maxCompressionRatio: 50,
      }),
    ).toThrow("ZIP entry entry.txt exceeds the 50:1 compression-ratio limit");
  });

  it("reads ordinary deflated entries within the configured bounds", () => {
    const zip = createDeflatedZip("entry.txt", "BehaviorLog data");

    expect(readZipEntries(zip)).toEqual([
      { path: "entry.txt", content: "BehaviorLog data" },
    ]);
  });

  it("caps actual deflate output at the declared uncompressed size", () => {
    const zip = createDeflatedZip("entry.txt", "BehaviorLog data");
    const centralOffset = endOfCentralDirectory(zip).readUInt32LE(16);

    zip.writeUInt32LE(4, centralOffset + 24);

    expect(() => readZipEntries(zip)).toThrow(
      "Unable to decompress ZIP entry entry.txt within its declared size limit",
    );
  });

  it("turns out-of-bounds directory metadata into a controlled ZIP error", () => {
    const zip = createStoredZip([{ path: "entry.txt", content: "value" }]);
    const end = endOfCentralDirectory(zip);

    end.writeUInt32LE(zip.byteLength + 10, 16);

    expect(() => readZipEntries(zip)).toThrow(
      "ZIP central directory is outside the archive",
    );
  });
});

function endOfCentralDirectory(zip: Buffer): Buffer {
  return zip.subarray(zip.byteLength - 22);
}

function createDeflatedZip(path: string, value: string): Buffer {
  const name = Buffer.from(path, "utf8");
  const content = Buffer.from(value, "utf8");
  const compressed = deflateRawSync(content);
  const checksum = testCrc32(content);
  const localHeader = Buffer.alloc(30);

  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(name.length, 26);

  const centralOffset = localHeader.length + name.length + compressed.length;
  const centralHeader = Buffer.alloc(46);

  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt32LE(0, 42);

  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralHeader.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([
    localHeader,
    name,
    compressed,
    centralHeader,
    name,
    end,
  ]);
}

function testCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
