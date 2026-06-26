export type UserReadCacheBucket =
  | "profile_timezone"
  | "profile_settings"
  | "behavior_list"
  | "category_list"
  | "behaviorlog_import_runs";

type UserReadCacheEntry = {
  expiresAt: number;
  value: unknown;
};

type ReadUserCacheInput<T> = {
  userId: string;
  bucket: UserReadCacheBucket;
  variant?: readonly string[];
  ttlMs?: number;
  load: () => Promise<T>;
};

const DEFAULT_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 250;
const globalCache = globalThis as typeof globalThis & {
  __cadenceUserReadCache?: Map<string, UserReadCacheEntry>;
};

export function createUserReadCacheKey(input: {
  userId: string;
  bucket: UserReadCacheBucket;
  variant?: readonly string[];
}): string {
  const variant = input.variant?.map(encodeKeyPart).join(":") ?? "default";

  return ["user-read", encodeKeyPart(input.userId), input.bucket, variant].join(
    ":",
  );
}

export async function readUserReadThroughCache<T>(
  input: ReadUserCacheInput<T>,
): Promise<T> {
  const cache = getCache();
  const key = createUserReadCacheKey(input);
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) {
    return cloneCachedValue(cached.value) as T;
  }

  if (cached) {
    cache.delete(key);
  }

  const value = await input.load();

  pruneCache(cache);
  cache.set(key, {
    expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
    value: cloneCachedValue(value),
  });

  return value;
}

export function invalidateUserReadCache(
  userId: string,
  buckets?: readonly UserReadCacheBucket[],
): void {
  const cache = getCache();
  const userPrefix = `user-read:${encodeKeyPart(userId)}:`;
  const bucketSet = buckets ? new Set(buckets) : null;

  for (const key of cache.keys()) {
    if (!key.startsWith(userPrefix)) {
      continue;
    }

    if (!bucketSet) {
      cache.delete(key);
      continue;
    }

    const bucket = key.slice(userPrefix.length).split(":")[0];

    if (bucketSet.has(bucket as UserReadCacheBucket)) {
      cache.delete(key);
    }
  }
}

export function clearUserReadCache(): void {
  getCache().clear();
}

export function listUserReadCacheKeys(): string[] {
  return Array.from(getCache().keys()).sort();
}

function getCache(): Map<string, UserReadCacheEntry> {
  globalCache.__cadenceUserReadCache ??= new Map();

  return globalCache.__cadenceUserReadCache;
}

function pruneCache(cache: Map<string, UserReadCacheEntry>): void {
  if (cache.size < MAX_CACHE_ENTRIES) {
    return;
  }

  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;

    if (!oldestKey) {
      return;
    }

    cache.delete(oldestKey);
  }
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function cloneCachedValue<T>(value: T): T {
  return structuredClone(value);
}
