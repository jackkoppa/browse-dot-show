import { ProviderUnavailableError, type SubscriptionProvider, type VerifiedSubscriber } from './types.js';

/**
 * Supporting Cast (https://developers.supportingcast.fm/api/docs-v2). Its API is admin-only (a
 * per-network bearer token), with no OAuth, so login is its magic-link email:
 *
 * 1. startLogin: find the user by email; if they have access, Supporting Cast emails them a login
 *    link that returns to the site's `/auth/callback`
 * 2. completeLogin: the callback's login token identifies the user (`POST /users/search`)
 * 3. Access means the user can get one of the configured feeds (`GET /users/{id}/feeds`), which
 *    covers subscriptions, gifts and invites alike. Without configured feeds, any active
 *    subscription counts.
 *
 * TO CONFIRM with Supporting Cast: which query parameter the login link adds to `redirect_url`
 * (assumed `login_token`; `callbackTokenParams` lists what's tried).
 */

export const SUPPORTING_CAST_API_BASE_URL = 'https://api.supportingcast.fm/v2';

export interface SupportingCastSettings {
  apiToken: string;
  networkId: string;
  /** Feed IDs that grant access (any one is enough). Empty: any active subscription */
  feedIds?: number[];
  /** Callback query parameters that may hold the login token, tried in order */
  callbackTokenParams?: string[];
}

interface SupportingCastUser {
  id: number;
  email?: string;
}

interface SupportingCastSubscription {
  status: 'Active' | 'Alert' | 'Suspended' | 'Cancelled';
  ends_at?: string | null;
}

interface SupportingCastUserFeed {
  id: number;
}

const DEFAULT_CALLBACK_TOKEN_PARAMS = ['login_token', 'token'];

export function createSupportingCastProvider(
  settings: SupportingCastSettings,
  options: { fetch?: typeof fetch; baseUrl?: string; now?: () => Date } = {},
): SubscriptionProvider {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = `${options.baseUrl ?? SUPPORTING_CAST_API_BASE_URL}/${encodeURIComponent(settings.networkId)}`;
  const now = options.now ?? (() => new Date());
  const feedIds = new Set(settings.feedIds ?? []);

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new ProviderUnavailableError(`Supporting Cast request failed: ${(error as Error).message}`);
    }
    if (response.status === 404) return { status: 404, data: null };
    if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403) {
      // 401/403 mean our API token is wrong or revoked: not the listener's fault
      throw new ProviderUnavailableError(`Supporting Cast ${method} ${path.split('/')[1]} returned ${response.status}`, response.status);
    }
    const text = await response.text();
    return { status: response.status, data: text ? (JSON.parse(text) as T) : null };
  }

  async function searchUsers(query: { email: string } | { login_token: string }): Promise<SupportingCastUser | null> {
    const { data } = await request<{ users?: SupportingCastUser[] }>('POST', '/users/search', query);
    const users = data?.users ?? [];
    return users.length === 1 ? users[0] : null;
  }

  async function hasAccess(userId: number): Promise<boolean> {
    if (feedIds.size > 0) {
      const { data } = await request<{ feeds?: SupportingCastUserFeed[] }>('GET', `/users/${userId}/feeds`);
      return (data?.feeds ?? []).some(feed => feedIds.has(feed.id));
    }
    const { data } = await request<{ subscriptions?: SupportingCastSubscription[] }>('GET', `/users/${userId}/subscriptions`);
    return (data?.subscriptions ?? []).some(subscription => {
      if (subscription.status === 'Active' || subscription.status === 'Alert') return true;
      // Cancelled, but paid up until it ends
      return subscription.status === 'Cancelled' && !!subscription.ends_at && new Date(subscription.ends_at) > now();
    });
  }

  async function verified(user: SupportingCastUser | null): Promise<VerifiedSubscriber | null> {
    if (!user || !(await hasAccess(user.id))) return null;
    return { providerUserId: String(user.id) };
  }

  return {
    id: 'supporting-cast',

    async startLogin({ email, callbackUrl }) {
      const normalizedEmail = email?.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) return { kind: 'email-sent' };
      const user = await searchUsers({ email: normalizedEmail });
      if (user && (await hasAccess(user.id))) {
        await request('POST', `/users/${user.id}/send_login_email`, { redirect_url: callbackUrl });
      }
      return { kind: 'email-sent' };
    },

    async completeLogin(params) {
      const tokenParam = (settings.callbackTokenParams ?? DEFAULT_CALLBACK_TOKEN_PARAMS).find(name => params[name]);
      if (!tokenParam) return null;
      return verified(await searchUsers({ login_token: params[tokenParam] }));
    },

    async refresh(providerUserId) {
      const userId = Number(providerUserId);
      if (!Number.isInteger(userId)) return null;
      return (await hasAccess(userId)) ? { providerUserId } : null;
    },
  };
}
