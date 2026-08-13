// Simple localStorage cache with a TTL so we don't re-fetch the entire
// league history from Sleeper on every page load.

const DEFAULT_TTL_MS = 45 * 60 * 1000; // 45 minutes
const PREFIX = "sleeper-site-cache:v1:";

interface CacheEnvelope<T> {
  storedAt: number;
  ttlMs: number;
  data: T;
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const envelope: CacheEnvelope<T> = JSON.parse(raw);
    if (Date.now() - envelope.storedAt > envelope.ttlMs) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return envelope.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  try {
    const envelope: CacheEnvelope<T> = { storedAt: Date.now(), ttlMs, data };
    localStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // localStorage full or unavailable (e.g. private browsing) - fail silently,
    // the site still works, it just refetches every time.
  }
}

export function cacheClear(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
