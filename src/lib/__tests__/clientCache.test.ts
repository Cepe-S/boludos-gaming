import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMemoryClientCache,
  fetchWithClientCache,
  invalidateClientCache,
  invalidateClientCachePrefix,
  readClientCache,
  writeClientCache,
} from '../clientCache';

describe('clientCache', () => {
  afterEach(() => {
    clearMemoryClientCache();
    vi.useRealTimers();
  });

  it('returns fresh and stale hits according to TTL and staleTtlMs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T20:00:00Z'));

    writeClientCache('k1', { count: 42 });

    const fresh = readClientCache<{ count: number }>('k1', {
      ttlMs: 1000,
      staleTtlMs: 5000,
    });
    expect(fresh).not.toBeNull();
    expect(fresh?.data.count).toBe(42);
    expect(fresh?.isFresh).toBe(true);

    vi.advanceTimersByTime(2000);
    const stale = readClientCache<{ count: number }>('k1', {
      ttlMs: 1000,
      staleTtlMs: 5000,
    });
    expect(stale).not.toBeNull();
    expect(stale?.data.count).toBe(42);
    expect(stale?.isFresh).toBe(false);

    vi.advanceTimersByTime(4000);
    const expired = readClientCache<{ count: number }>('k1', {
      ttlMs: 1000,
      staleTtlMs: 5000,
    });
    expect(expired).toBeNull();
  });

  it('deduplicates concurrent in-flight fetches and caches the resolved value', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, n: calls };
    });

    const [a, b] = await Promise.all([
      fetchWithClientCache('dedup', fetcher, { ttlMs: 60_000 }),
      fetchWithClientCache('dedup', fetcher, { ttlMs: 60_000 }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true, n: 1 });
    expect(b).toEqual({ ok: true, n: 1 });

    // Subsequent call reads directly from cache without calling fetcher
    const c = await fetchWithClientCache('dedup', fetcher, { ttlMs: 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(c).toEqual({ ok: true, n: 1 });

    // forceRefresh bypasses cache
    const d = await fetchWithClientCache('dedup', fetcher, {
      ttlMs: 60_000,
      forceRefresh: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(d).toEqual({ ok: true, n: 2 });
  });

  it('supports shouldCache predicate and single/prefix invalidation', async () => {
    const emptyFetcher = vi.fn(async () => [] as string[]);
    const res = await fetchWithClientCache('list', emptyFetcher, {
      ttlMs: 60_000,
      shouldCache: (v) => v.length > 0,
    });
    expect(res).toEqual([]);
    expect(readClientCache('list', { ttlMs: 60_000 })).toBeNull();

    writeClientCache('lol:group:a', 1);
    writeClientCache('lol:group:b', 2);
    writeClientCache('steam:discovery', 3);

    invalidateClientCachePrefix('lol:group:');
    expect(readClientCache('lol:group:a', { ttlMs: 60_000 })).toBeNull();
    expect(readClientCache('lol:group:b', { ttlMs: 60_000 })).toBeNull();
    expect(readClientCache('steam:discovery', { ttlMs: 60_000 })?.data).toBe(3);

    invalidateClientCache('steam:discovery');
    expect(readClientCache('steam:discovery', { ttlMs: 60_000 })).toBeNull();
  });
});
