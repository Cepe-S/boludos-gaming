/**
 * Lightweight client-side Stale-While-Revalidate (SWR) cache with:
 * - In-memory Map cache (instant synchronous reads)
 * - Optional localStorage / sessionStorage persistence with TTL
 * - In-flight promise deduplication (prevents duplicate concurrent requests)
 */

export type CacheStorageKind = 'memory' | 'session' | 'local';

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export interface CacheReadOptions {
  ttlMs: number;
  staleTtlMs?: number;
  storage?: CacheStorageKind;
}

export interface CacheWriteOptions {
  storage?: CacheStorageKind;
}

const STORAGE_PREFIX = 'bg_cache_v1:';
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function getWebStorage(kind: CacheStorageKind): Storage | null {
  if (typeof window === 'undefined' || kind === 'memory') return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readRawEntry<T>(
  key: string,
  storage: CacheStorageKind = 'memory'
): CacheEntry<T> | null {
  const memHit = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memHit) return memHit;

  const store = getWebStorage(storage);
  if (!store) return null;

  try {
    const raw = store.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T> | null;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !('data' in parsed)) {
      return null;
    }
    memoryCache.set(key, parsed as CacheEntry<unknown>);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Synchronously reads a cached value if it is still within `ttlMs` (fresh)
 * or `staleTtlMs` (usable for instant SWR rendering while revalidating).
 */
export function readClientCache<T>(
  key: string,
  options: CacheReadOptions
): { data: T; isFresh: boolean; fetchedAt: number } | null {
  const entry = readRawEntry<T>(key, options.storage ?? 'memory');
  if (!entry) return null;

  const age = Date.now() - entry.fetchedAt;
  const maxAge = options.staleTtlMs ?? options.ttlMs;
  if (age > maxAge) {
    return null;
  }

  return {
    data: entry.data,
    isFresh: age <= options.ttlMs,
    fetchedAt: entry.fetchedAt,
  };
}

/**
 * Writes a value to the in-memory cache and optionally to Web Storage.
 */
export function writeClientCache<T>(
  key: string,
  data: T,
  options?: CacheWriteOptions
): void {
  const entry: CacheEntry<T> = {
    data,
    fetchedAt: Date.now(),
  };
  memoryCache.set(key, entry as CacheEntry<unknown>);

  const store = getWebStorage(options?.storage ?? 'memory');
  if (!store) return;

  try {
    store.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Storage quota exceeded or unavailable; in-memory cache still holds the entry.
  }
}

/**
 * Deduplicates concurrent fetches for the same cache key and stores the result.
 */
export async function fetchWithClientCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheReadOptions & {
    forceRefresh?: boolean;
    shouldCache?: (value: T) => boolean;
  }
): Promise<T> {
  const storage = options.storage ?? 'memory';

  if (!options.forceRefresh) {
    const existing = readClientCache<T>(key, {
      ttlMs: options.ttlMs,
      staleTtlMs: options.ttlMs,
      storage,
    });
    if (existing && existing.isFresh) {
      return existing.data;
    }
  }

  const inFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  const promise = fetcher()
    .then((result) => {
      const canCache = options.shouldCache ? options.shouldCache(result) : true;
      if (canCache) {
        writeClientCache(key, result, { storage });
      }
      return result;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, promise as Promise<unknown>);
  return promise;
}

/**
 * Invalidates a specific cache key from memory and Web Storage.
 */
export function invalidateClientCache(key: string): void {
  memoryCache.delete(key);
  inFlightRequests.delete(key);
  if (typeof window === 'undefined') return;

  const fullKey = `${STORAGE_PREFIX}${key}`;
  try {
    window.localStorage.removeItem(fullKey);
  } catch {
    // Ignore
  }
  try {
    window.sessionStorage.removeItem(fullKey);
  } catch {
    // Ignore
  }
}

/**
 * Invalidates all cache entries matching a prefix (e.g. `lol:group:`).
 */
export function invalidateClientCachePrefix(prefix: string): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
  for (const key of Array.from(inFlightRequests.keys())) {
    if (key.startsWith(prefix)) {
      inFlightRequests.delete(key);
    }
  }

  if (typeof window === 'undefined') return;
  const storagePrefix = `${STORAGE_PREFIX}${prefix}`;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (k && k.startsWith(storagePrefix)) {
          store.removeItem(k);
        }
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Clears in-memory cache maps (useful in unit tests).
 */
export function clearMemoryClientCache(): void {
  memoryCache.clear();
  inFlightRequests.clear();
}
