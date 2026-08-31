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

export function inspectZipEntries(
  input: Uint8Array | ArrayBuffer,
  overrides: Partial<ZipReadLimits> = {},
): Array<ZipEntryDescriptor & { compressed: Uint8Array }> {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const limits = resolveZipReadLimits(overrides);

  if (buffer.byteLength > limits.maxArchiveBytes) {
    throw new Error(
      `ZIP exceeds the ${limits.maxArchiveBytes} byte archive-size limit.`,
    );
  }

  const endOffset = findEndOfCentralDirectory(buffer);
  assertSingleDiskArchive(buffer, endOffset);
  const entryCount = read16(buffer, endOffset + 10);
  const centralDirectorySize = read32(buffer, endOffset + 12);
  const centralDirectoryOffset = read32(buffer, endOffset + 16);

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

    if (read32(buffer, offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory header.");
    }

    const flags = read16(buffer, offset + 8);
    const compressionMethod = read16(buffer, offset + 10);
    const crc = read32(buffer, offset + 16);
    const compressedSize = read32(buffer, offset + 20);
    const uncompressedSize = read32(buffer, offset + 24);
    const nameLength = read16(buffer, offset + 28);
    const extraLength = read16(buffer, offset + 30);
    const commentLength = read16(buffer, offset + 32);
    const localHeaderOffset = read32(buffer, offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;

    if (entryEnd > centralDirectoryEnd) {
      throw new Error("ZIP central directory entry is truncated.");
    }

    const path = new TextDecoder().decode(buffer.subarray(offset + 46, offset + 46 + nameLength));

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
    ...descriptor,
    compressed: readZipEntryBytes(buffer, descriptor, { centralDirectoryOffset }),
  }));
}

function findEndOfCentralDirectory(buffer: Uint8Array): number {
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
      read32(buffer, offset) === 0x06054b50 &&
      offset + minimumEndLength + read16(buffer, offset + 20) ===
        buffer.byteLength
    ) {
      return offset;
    }
  }

  throw new Error("ZIP end of central directory was not found.");
}

function readZipEntryBytes(
  buffer: Uint8Array,
  input: ZipEntryDescriptor,
  bounds: {
    centralDirectoryOffset: number;
  },
): Uint8Array {
  if (
    input.localHeaderOffset > bounds.centralDirectoryOffset - 30 ||
    input.localHeaderOffset < 0
  ) {
    throw new Error(
      `ZIP entry ${input.path} has an invalid local header offset.`,
    );
  }

  if (read32(buffer, input.localHeaderOffset) !== 0x04034b50) {
    throw new Error("Invalid ZIP local file header.");
  }

  const localFlags = read16(buffer, input.localHeaderOffset + 6);
  const localCompressionMethod = read16(buffer,
    input.localHeaderOffset + 8,
  );
  const localNameLength = read16(buffer, input.localHeaderOffset + 26);
  const localExtraLength = read16(buffer, input.localHeaderOffset + 28);
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

  return buffer.subarray(dataStart, dataEnd);
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

function assertSingleDiskArchive(buffer: Uint8Array, endOffset: number): void {
  const diskNumber = read16(buffer, endOffset + 4);
  const centralDirectoryDisk = read16(buffer, endOffset + 6);
  const entriesOnDisk = read16(buffer, endOffset + 8);
  const entryCount = read16(buffer, endOffset + 10);
  const centralDirectorySize = read32(buffer, endOffset + 12);
  const centralDirectoryOffset = read32(buffer, endOffset + 16);

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

export function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function read16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}
function read32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}
