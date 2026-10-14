import type { SupportingCastSubscriptionStatus } from './api.js';

/**
 * Our copy of who subscribes, per site, kept current by sync.ts. It lets logins and session
 * refreshes skip Supporting Cast's API entirely, except for the login email itself.
 *
 * It holds Supporting Cast user IDs, keyed hashes of their emails (HMAC-SHA256, with a key in
 * SSM), and their subscriptions' plan, status and end date. Never emails, names or anything else.
 */

export interface MirroredSubscription {
  id: string;
  planId: number | null;
  status: SupportingCastSubscriptionStatus;
  /** ISO date; for cancelled subscriptions, access lasts until then */
  endsAt: string | null;
}

/** Where each sync stream is up to: `since` for the next pass, or a pass in progress (`cursor`) */
export interface SyncStreamState {
  /** ISO time: the next pass fetches records updated since then (none: everything) */
  since?: string;
  /** The pass in progress: its next page, and when it started (the next pass's `since`) */
  cursor?: string;
  passStartedAt?: string;
}

export interface SyncState {
  users?: SyncStreamState;
  subscriptions?: SyncStreamState;
}

export interface SupportingCastMirror {
  getUserIdByEmailHash(emailHash: string): Promise<string | null>;
  getSubscriptions(userId: string): Promise<MirroredSubscription[]>;
  /** Records a user's email hash (null: no email), replacing any previous one */
  putUser(userId: string, emailHash: string | null): Promise<void>;
  putSubscription(userId: string, subscription: MirroredSubscription): Promise<void>;
  getSyncState(): Promise<SyncState>;
  putSyncState(state: SyncState): Promise<void>;
}

/**
 * Whether subscriptions grant access: an active one (`Alert` is a failing payment, still active)
 * or a cancelled one that's paid up until it ends, on one of `planIds` (any plan, without them).
 */
export function hasAccess(subscriptions: MirroredSubscription[], now: Date, planIds?: number[]): boolean {
  return subscriptions.some(subscription => {
    if (planIds?.length && (subscription.planId === null || !planIds.includes(subscription.planId))) return false;
    if (subscription.status === 'Active' || subscription.status === 'Alert') return true;
    return subscription.status === 'Cancelled' && !!subscription.endsAt && new Date(subscription.endsAt) > now;
  });
}

/** An in-memory mirror (tests and the dev server) */
export function createMemorySupportingCastMirror(): SupportingCastMirror & { users: Map<string, string | null> } {
  const users = new Map<string, string | null>();
  const userIdsByEmailHash = new Map<string, string>();
  const subscriptions = new Map<string, Map<string, MirroredSubscription>>();
  let syncState: SyncState = {};

  return {
    users,
    async getUserIdByEmailHash(emailHash) {
      return userIdsByEmailHash.get(emailHash) ?? null;
    },
    async getSubscriptions(userId) {
      return [...(subscriptions.get(userId)?.values() ?? [])];
    },
    async putUser(userId, emailHash) {
      const previous = users.get(userId);
      if (previous && previous !== emailHash) userIdsByEmailHash.delete(previous);
      users.set(userId, emailHash);
      if (emailHash) userIdsByEmailHash.set(emailHash, userId);
    },
    async putSubscription(userId, subscription) {
      if (!subscriptions.has(userId)) subscriptions.set(userId, new Map());
      subscriptions.get(userId)!.set(subscription.id, subscription);
    },
    async getSyncState() {
      return structuredClone(syncState);
    },
    async putSyncState(state) {
      syncState = structuredClone(state);
    },
  };
}
