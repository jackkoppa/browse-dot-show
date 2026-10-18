/**
 * The little state the auth lambda keeps (in DynamoDB; in memory for tests and the dev server):
 * rate-limit counters and used login links. Every entry expires.
 */
export interface AuthStore {
  /** Adds 1 to a counter that's deleted at `expiresAt` (seconds since the epoch); returns the new count */
  increment(key: string, expiresAt: number): Promise<number>;
  /** A counter's value (0 if there's none) */
  count(key: string): Promise<number>;
  /** Records a key until `expiresAt`: true the first time, false if it's already recorded (e.g. a used login link) */
  claimOnce(key: string, expiresAt: number): Promise<boolean>;
}

/** An in-memory store (tests and the dev server). `now` is seconds since the epoch */
export function createMemoryAuthStore(now: () => number = () => Math.floor(Date.now() / 1000)): AuthStore {
  const entries = new Map<string, { value: number; expiresAt: number }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= now()) entries.delete(key);
    return entries.get(key);
  };

  return {
    async increment(key, expiresAt) {
      const value = (live(key)?.value ?? 0) + 1;
      entries.set(key, { value, expiresAt });
      return value;
    },
    async count(key) {
      return live(key)?.value ?? 0;
    },
    async claimOnce(key, expiresAt) {
      if (live(key)) return false;
      entries.set(key, { value: 1, expiresAt });
      return true;
    },
  };
}

/** Day (UTC, `YYYY-MM-DD`) and hour (`YYYY-MM-DDTHH`) buckets for counters, and when they end */
export function timeBuckets(nowSeconds: number) {
  const iso = new Date(nowSeconds * 1000).toISOString();
  const day = iso.slice(0, 10);
  const hour = iso.slice(0, 13);
  return {
    day,
    hour,
    dayEndsAt: Date.parse(`${day}T00:00:00Z`) / 1000 + 24 * 60 * 60,
    hourEndsAt: Date.parse(`${hour}:00:00Z`) / 1000 + 60 * 60,
  };
}
