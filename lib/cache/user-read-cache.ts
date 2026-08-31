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

type UserReadCacheSlot = {
  entry?: UserReadCacheEntry;
  generation: number;
  loading: number;
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
  __cadenceUserReadCache?: Map<string, UserReadCacheSlot>;
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
  const slot = cache.get(key) ?? { generation: 0, loading: 0 };
  const cached = slot.entry;

  cache.set(key, slot);

  if (cached && cached.expiresAt > now) {
    return cloneCachedValue(cached.value) as T;
  }

  if (cached) {
    delete slot.entry;
  }

  const generation = slot.generation;
  slot.loading += 1;
  let value: T;

  try {
    value = await input.load();
  } catch (error) {
    if (slot.loading === 1 && !slot.entry) {
      cache.delete(key);
    }

    throw error;
  } finally {
    slot.loading -= 1;
  }

  if (slot.generation === generation) {
    pruneCache(cache);
    slot.entry = {
      expiresAt: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
      value: cloneCachedValue(value),
    };
  } else if (slot.loading === 0 && !slot.entry) {
    cache.delete(key);
  }

  return value;
}

export function invalidateUserReadCache(
  userId: string,
  buckets?: readonly UserReadCacheBucket[],
): void {
  const cache = getCache();
  const userPrefix = `user-read:${encodeKeyPart(userId)}:`;
  const bucketSet = buckets ? new Set(buckets) : null;

  for (const [key, slot] of cache.entries()) {
    if (!key.startsWith(userPrefix)) {
      continue;
    }

    if (!bucketSet) {
      invalidateSlot(cache, key, slot);
      continue;
    }

    const bucket = key.slice(userPrefix.length).split(":")[0];

    if (bucketSet.has(bucket as UserReadCacheBucket)) {
      invalidateSlot(cache, key, slot);
    }
  }
}

export function clearUserReadCache(): void {
  getCache().clear();
}

export function listUserReadCacheKeys(): string[] {
  return Array.from(getCache().entries())
    .filter(([, slot]) => slot.entry)
    .map(([key]) => key)
    .sort();
}

function getCache(): Map<string, UserReadCacheSlot> {
  globalCache.__cadenceUserReadCache ??= new Map();

  return globalCache.__cadenceUserReadCache;
}

function pruneCache(cache: Map<string, UserReadCacheSlot>): void {
  if (countCacheEntries(cache) < MAX_CACHE_ENTRIES) {
    return;
  }

  const now = Date.now();

  for (const [key, slot] of cache.entries()) {
    if (slot.entry && slot.entry.expiresAt <= now) {
      removeEntry(cache, key, slot);
    }
  }

  while (countCacheEntries(cache) >= MAX_CACHE_ENTRIES) {
    const oldest = Array.from(cache.entries()).find(([, slot]) => slot.entry);

    if (!oldest) {
      return;
    }

    removeEntry(cache, oldest[0], oldest[1]);
  }
}

function countCacheEntries(cache: Map<string, UserReadCacheSlot>): number {
  return Array.from(cache.values()).filter((slot) => slot.entry).length;
}

function invalidateSlot(
  cache: Map<string, UserReadCacheSlot>,
  key: string,
  slot: UserReadCacheSlot,
): void {
  if (slot.loading === 0) {
    cache.delete(key);
    return;
  }

  slot.generation += 1;
  delete slot.entry;
}

function removeEntry(
  cache: Map<string, UserReadCacheSlot>,
  key: string,
  slot: UserReadCacheSlot,
): void {
  if (slot.loading === 0) {
    cache.delete(key);
    return;
  }

  delete slot.entry;
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function cloneCachedValue<T>(value: T): T {
  return structuredClone(value);
}
