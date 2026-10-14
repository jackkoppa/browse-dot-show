import { createSupportingCastApi, type SupportingCastApiOptions } from './api.js';
import type { SupportingCastMirror, SyncState, SyncStreamState } from './mirror.js';
import { SUPPORTING_CAST_DEFAULTS, type SupportingCastSettings } from './settings.js';

/**
 * Keeps a site's mirror (mirror.ts) current, on a schedule (the auth lambda, every few hours).
 *
 * Each run asks for subscriptions, then users, updated since the last run: usually one call each.
 * The first run has to page through everything (100 per page), so runs stop after
 * `syncPagesPerRun` pages and carry on from there next time.
 */

/** Overlap between passes, so a record updated while a pass ran isn't missed */
const OVERLAP_MS = 10 * 60 * 1000;

export interface SyncDependencies {
  mirror: SupportingCastMirror;
  /** HMAC of a normalized email (see normalizeEmail) */
  hashEmail(email: string): string;
  now?: () => Date;
  /** Stop early (e.g. the lambda is running out of time) */
  shouldStop?: () => boolean;
  api?: Pick<SupportingCastApiOptions, 'fetch' | 'baseUrl'>;
}

export interface SyncResult {
  pages: number;
  users: number;
  subscriptions: number;
  /** Both streams are caught up (false: the next run continues) */
  caughtUp: boolean;
}

/** Lowercased and trimmed: how we hash emails, both from Supporting Cast and typed in the login form */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Supporting Cast's `updated_since` format: UTC, no milliseconds or zone */
function formatSince(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19);
}

export async function syncSupportingCast(settings: SupportingCastSettings, deps: SyncDependencies): Promise<SyncResult> {
  const api = createSupportingCastApi({ apiToken: settings.apiToken, networkId: settings.networkId, ...deps.api });
  const now = deps.now ?? (() => new Date());
  const maxPages = settings.syncPagesPerRun ?? SUPPORTING_CAST_DEFAULTS.syncPagesPerRun;
  const state: SyncState = await deps.mirror.getSyncState();
  const result: SyncResult = { pages: 0, users: 0, subscriptions: 0, caughtUp: false };

  /** Pages through one stream until it's caught up or the run's out of pages; true if caught up */
  async function syncStream(name: keyof SyncState, fetchPage: (stream: SyncStreamState) => Promise<string | null>): Promise<boolean> {
    const stream: SyncStreamState = state[name] ?? {};
    if (!stream.cursor) stream.passStartedAt = now().toISOString();
    while (result.pages < maxPages && !deps.shouldStop?.()) {
      const nextCursor = await fetchPage(stream);
      result.pages++;
      if (nextCursor) {
        stream.cursor = nextCursor;
      } else {
        stream.since = new Date(Date.parse(stream.passStartedAt!) - OVERLAP_MS).toISOString();
        delete stream.cursor;
        delete stream.passStartedAt;
      }
      state[name] = stream;
      await deps.mirror.putSyncState(state);
      if (!nextCursor) return true;
    }
    return false;
  }

  // Subscriptions first: they decide access. A new subscriber's user record comes with them
  const subscriptionsCaughtUp = await syncStream('subscriptions', async stream => {
    const page = await api.listSubscriptions({
      updatedSince: stream.since && formatSince(stream.since),
      cursor: stream.cursor,
      planIds: settings.planIds,
    });
    await Promise.all(page.items.map(subscription =>
      deps.mirror.putSubscription(String(subscription.user_id), {
        id: String(subscription.id),
        planId: subscription.subscription_plan_id ?? null,
        status: subscription.status,
        endsAt: subscription.ends_at ?? null,
      }),
    ));
    result.subscriptions += page.items.length;
    return page.nextCursor;
  });

  const usersCaughtUp = await syncStream('users', async stream => {
    const page = await api.listUsers({ updatedSince: stream.since && formatSince(stream.since), cursor: stream.cursor });
    await Promise.all(page.items.map(user =>
      deps.mirror.putUser(String(user.id), user.email ? deps.hashEmail(normalizeEmail(user.email)) : null),
    ));
    result.users += page.items.length;
    return page.nextCursor;
  });

  result.caughtUp = subscriptionsCaughtUp && usersCaughtUp;
  return result;
}
