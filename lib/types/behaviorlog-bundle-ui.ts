export const MAX_BEHAVIORLOG_BUNDLE_BYTES = 2 * 1024 * 1024;
export const BEHAVIORLOG_BUNDLE_SIZE_ERROR =
  "This file is larger than the 2 MB limit for BehaviorLog bundles.";

export function getBehaviorLogBundleSizeError(
  fileSize: number,
): string | null {
  return fileSize > MAX_BEHAVIORLOG_BUNDLE_BYTES
    ? BEHAVIORLOG_BUNDLE_SIZE_ERROR
    : null;
}

export async function readBehaviorLogBundleAsBase64(
  file: File,
): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 32_768)),
    );
  }

  return btoa(chunks.join(""));
}
