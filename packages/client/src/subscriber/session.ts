/**
 * The subscriber session: a token from the auth API, kept in localStorage per site. The client
 * only reads its expiry; the subscriber API verifies it.
 */

export interface SubscriberSession {
  token: string;
  /** Seconds since the epoch */
  expiresAt: number;
  /** When the auth API last issued or refreshed it (seconds since the epoch; set by saveSession) */
  checkedAt?: number;
}

/**
 * Refresh the session once a day: it lasts 30 days from when the provider last confirmed access.
 * Providers that re-check without the listener (Supporting Cast's mirror) restart the 30 days and
 * pick up a lapsed subscription; for the others (OAuth), the session stays as it is
 */
const REFRESH_AFTER_SECONDS = 24 * 60 * 60;

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

/** Stores the session as just checked; returns it with `checkedAt` */
export function saveSession(siteId: string, session: SubscriberSession): SubscriberSession {
  const checked = { ...session, checkedAt: nowSeconds() };
  try {
    localStorage.setItem(storageKey(siteId), JSON.stringify(checked));
  } catch {
    // Storage blocked: the session lasts for this page only
  }
  return checked;
}

export function clearSession(siteId: string): void {
  try {
    localStorage.removeItem(storageKey(siteId));
  } catch {
    // nothing to clear
  }
}

export function shouldRefresh(session: SubscriberSession): boolean {
  return !session.checkedAt || nowSeconds() - session.checkedAt > REFRESH_AFTER_SECONDS;
}
