/**
 * The subscriber session: a token from the auth API, kept in localStorage per site. The client
 * only reads its expiry; the subscriber API verifies it.
 */

export interface SubscriberSession {
  token: string;
  /** Seconds since the epoch */
  expiresAt: number;
}

/** Refresh the session when it has less than this left (it lasts 7 days) */
const REFRESH_WHEN_SECONDS_LEFT = 2 * 24 * 60 * 60;

const storageKey = (siteId: string) => `bds:subscriber-session:${siteId}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

export function loadSession(siteId: string): SubscriberSession | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(siteId)) ?? 'null') as SubscriberSession | null;
    if (!stored || typeof stored.token !== 'string' || typeof stored.expiresAt !== 'number') return null;
    if (stored.expiresAt <= nowSeconds()) {
      clearSession(siteId);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function saveSession(siteId: string, session: SubscriberSession): void {
  try {
    localStorage.setItem(storageKey(siteId), JSON.stringify(session));
  } catch {
    // Storage blocked: the session lasts for this page only
  }
}

export function clearSession(siteId: string): void {
  try {
    localStorage.removeItem(storageKey(siteId));
  } catch {
    // nothing to clear
  }
}

export function shouldRefresh(session: SubscriberSession): boolean {
  return session.expiresAt - nowSeconds() < REFRESH_WHEN_SECONDS_LEFT;
}
