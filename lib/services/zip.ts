import { deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  path: string;
  content: string;
};

export type ZipReadLimits = {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
};

export const DEFAULT_ZIP_READ_LIMITS: Readonly<ZipReadLimits> = Object.freeze({
  maxArchiveBytes: 2 * 1024 * 1024,
  maxEntries: 128,
  maxEntryUncompressedBytes: 32 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 100,
});

type ZipEntryDescriptor = {
  path: string;
  flags: number;
  compressionMethod: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const CRC32_TABLE = createCrc32Table();

export function createStoredZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const compressed = deflateRawSync(content);
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function readZipEntries(
  input: Buffer | Uint8Array | ArrayBuffer,
  overrides: Partial<ZipReadLimits> = {},
): ZipEntry[] {
  const buffer = toBuffer(input);
  const limits = resolveZipReadLimits(overrides);

  if (buffer.byteLength > limits.maxArchiveBytes) {
    throw new Error(
      `ZIP exceeds the ${limits.maxArchiveBytes} byte archive-size limit.`,
    );
  }

  const endOffset = findEndOfCentralDirectory(buffer);
  assertSingleDiskArchive(buffer, endOffset);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);

  if (entryCount > limits.maxEntries) {
    throw new Error(`ZIP contains more than ${limits.maxEntries} entries.`);
  }

  if (
    centralDirectoryOffset > endOffset ||
    centralDirectorySize > endOffset - centralDirectoryOffset
  ) {
    throw new Error("ZIP central directory is outside the archive.");
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  const descriptors: ZipEntryDescriptor[] = [];
  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralDirectoryEnd) {
      throw new Error("ZIP central directory entry is truncated.");
    }

    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory header.");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;

    if (entryEnd > centralDirectoryEnd) {
      throw new Error("ZIP central directory entry is truncated.");
    }

    const path = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    assertZipEntryLimits({
      path,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      limits,
    });
    totalUncompressedBytes += uncompressedSize;

    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP exceeds the ${limits.maxTotalUncompressedBytes} byte cumulative extracted-size limit.`,
      );
    }

    descriptors.push({
      path,
      flags,
      compressionMethod,
      crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = entryEnd;
  }

  if (offset !== centralDirectoryEnd) {
    throw new Error("ZIP central directory size does not match its entries.");
  }

  return descriptors.map((descriptor) => ({
    path: descriptor.path,
    content: readZipEntryContent(buffer, descriptor, {
      centralDirectoryOffset,
      maxOutputBytes: limits.maxEntryUncompressedBytes,
    }).toString("utf8"),
  }));
}

function toBuffer(input: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }

  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumEndLength = 22;
  const maximumCommentLength = 0xffff;

  if (buffer.byteLength < minimumEndLength) {
    throw new Error("ZIP end of central directory was not found.");
  }

  const minimumOffset = Math.max(
    0,
    buffer.length - minimumEndLength - maximumCommentLength,
  );

  for (let offset = buffer.length - minimumEndLength; offset >= minimumOffset; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + minimumEndLength + buffer.readUInt16LE(offset + 20) ===
        buffer.byteLength
    ) {
      return offset;
    }
  }

  throw new Error("ZIP end of central directory was not found.");
}

function readZipEntryContent(
  buffer: Buffer,
  input: ZipEntryDescriptor,
  bounds: {
    centralDirectoryOffset: number;
    maxOutputBytes: number;
  },
): Buffer {
  if (
    input.localHeaderOffset > bounds.centralDirectoryOffset - 30 ||
    input.localHeaderOffset < 0
  ) {
    throw new Error(
      `ZIP entry ${input.path} has an invalid local header offset.`,
    );
  }

  if (buffer.readUInt32LE(input.localHeaderOffset) !== 0x04034b50) {
    throw new Error("Invalid ZIP local file header.");
  }

  const localFlags = buffer.readUInt16LE(input.localHeaderOffset + 6);
  const localCompressionMethod = buffer.readUInt16LE(
    input.localHeaderOffset + 8,
  );
  const localNameLength = buffer.readUInt16LE(input.localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(input.localHeaderOffset + 28);
  const dataStart = input.localHeaderOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + input.compressedSize;

  if (
    localFlags !== input.flags ||
    localCompressionMethod !== input.compressionMethod
  ) {
    throw new Error(
      `ZIP entry ${input.path} local header does not match its directory entry.`,
    );
  }

  if (
    dataStart < input.localHeaderOffset ||
    dataEnd < dataStart ||
    dataEnd > bounds.centralDirectoryOffset
  ) {
    throw new Error(`ZIP entry ${input.path} data is outside the archive.`);
  }

  const compressed = buffer.subarray(dataStart, dataStart + input.compressedSize);
  let content: Buffer;

  if (input.compressionMethod === 0) {
    content = compressed;
  } else {
    try {
      content = inflateRawSync(compressed, {
        maxOutputLength: Math.max(
          1,
          Math.min(input.uncompressedSize, bounds.maxOutputBytes),
        ),
      });
    } catch {
      throw new Error(
        `Unable to decompress ZIP entry ${input.path} within its declared size limit.`,
      );
    }
  }

  if (content.length !== input.uncompressedSize) {
    throw new Error("ZIP entry size mismatch.");
  }

  if (crc32(content) !== input.crc) {
    throw new Error(`ZIP entry ${input.path} failed its CRC check.`);
  }

  return content;
}

function resolveZipReadLimits(overrides: Partial<ZipReadLimits>): ZipReadLimits {
  const limits = {
    ...DEFAULT_ZIP_READ_LIMITS,
    ...overrides,
  };

  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `ZIP read limit ${name} must be a positive finite number.`,
      );
    }
  }

  return limits;
}

function assertSingleDiskArchive(buffer: Buffer, endOffset: number): void {
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount
  ) {
    throw new Error("Multi-disk ZIP archives are not supported.");
  }

  if (
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 archives are not supported.");
  }
}

function assertZipEntryLimits(input: {
  path: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  limits: ZipReadLimits;
}): void {
  if ((input.flags & 0x0001) !== 0) {
    throw new Error(`Encrypted ZIP entry ${input.path} is not supported.`);
  }

  if (input.compressionMethod !== 0 && input.compressionMethod !== 8) {
    throw new Error(
      `Unsupported ZIP compression method ${input.compressionMethod}.`,
    );
  }

  if (input.uncompressedSize > input.limits.maxEntryUncompressedBytes) {
    throw new Error(
      `ZIP entry ${input.path} exceeds the ${input.limits.maxEntryUncompressedBytes} byte extracted-entry limit.`,
    );
  }

  const ratio =
    input.uncompressedSize === 0
      ? 1
      : input.compressedSize === 0
        ? Number.POSITIVE_INFINITY
        : input.uncompressedSize / input.compressedSize;

  if (ratio > input.limits.maxCompressionRatio) {
    throw new Error(
      `ZIP entry ${input.path} exceeds the ${input.limits.maxCompressionRatio}:1 compression-ratio limit.`,
    );
  }

  if (
    input.compressionMethod === 0 &&
    input.compressedSize !== input.uncompressedSize
  ) {
    throw new Error(`Stored ZIP entry ${input.path} has inconsistent sizes.`);
  }
}

function createCrc32Table(): number[] {
  return Array.from({ length: 256 }, (_, index) => {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    return crc >>> 0;
  });
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
