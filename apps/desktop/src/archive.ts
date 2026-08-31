import { inflateSync, strToU8, zipSync, type Zippable } from "fflate/browser";
import { crc32, inspectZipEntries, type ZipEntry, type ZipReadLimits } from "../../../lib/services/zip-format";

export function createDesktopZip(entries: ZipEntry[]): Uint8Array {
  const files: Zippable = Object.create(null);
  for (const entry of entries) {
    if (Object.hasOwn(files, entry.path)) throw new Error(`Duplicate ZIP path: ${entry.path}.`);
    files[entry.path] = [strToU8(entry.content), { mtime: new Date(1980, 0, 1) }];
  }
  return zipSync(files, { level: 6 });
}

export function readDesktopZipEntries(input: Uint8Array | ArrayBuffer, overrides: Partial<ZipReadLimits> = {}): ZipEntry[] {
  // Inspect every declared size and ratio before any decompression starts.
  return inspectZipEntries(input, overrides).map((entry) => {
    let content: Uint8Array;
    try {
      // One extra byte exposes forged small declarations; fflate never grows a supplied output buffer.
      content = entry.compressionMethod === 0 ? entry.compressed
        : inflateSync(entry.compressed, { out: new Uint8Array(entry.uncompressedSize + 1) });
    } catch {
      throw new Error(`Unable to decompress ZIP entry ${entry.path} within its declared size limit.`);
    }
    if (content.length !== entry.uncompressedSize) throw new Error("ZIP entry size mismatch.");
    if (crc32(content) !== entry.crc) throw new Error(`ZIP entry ${entry.path} failed its CRC check.`);
    return { path: entry.path, content: new TextDecoder().decode(content) };
  });
}
