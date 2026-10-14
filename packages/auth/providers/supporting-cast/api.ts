import { ProviderUnavailableError } from '../types.js';

/**
 * The few Supporting Cast API calls we make (https://developers.supportingcast.fm/api/docs-v2).
 * The API is admin-only: a per-network bearer token, shared with the network's other uses of it,
 * and rate-limited. So we call it as little as possible (see provider.ts).
 */

export const SUPPORTING_CAST_API_BASE_URL = 'https://api.supportingcast.fm/v2';

export interface SupportingCastUser {
  id: number;
  email?: string | null;
}

export type SupportingCastSubscriptionStatus = 'Active' | 'Alert' | 'Suspended' | 'Cancelled';

export interface SupportingCastSubscription {
  id: number;
  user_id: number;
  subscription_plan_id?: number | null;
  status: SupportingCastSubscriptionStatus;
  ends_at?: string | null;
}

export interface SupportingCastPage<T> {
  items: T[];
  /** For the next page; null on the last */
  nextCursor: string | null;
}

export interface SupportingCastApiOptions {
  apiToken: string;
  networkId: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export function createSupportingCastApi(options: SupportingCastApiOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = `${options.baseUrl ?? SUPPORTING_CAST_API_BASE_URL}/${encodeURIComponent(options.networkId)}`;

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T | null> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.apiToken}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new ProviderUnavailableError(`Supporting Cast request failed: ${(error as Error).message}`);
    }
    // Only the path's first segment in errors: never user IDs or query strings in logs
    const endpoint = `${method} /${path.split(/[/?]/)[1]}`;
    if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403) {
      // 401/403 mean our API token is wrong or revoked: not the listener's fault
      throw new ProviderUnavailableError(`Supporting Cast ${endpoint} returned ${response.status}`, response.status);
    }
    if (!response.ok) throw new ProviderUnavailableError(`Supporting Cast ${endpoint} returned ${response.status}`, response.status);
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : null;
  }

  async function list<T>(path: string, key: string, query: Record<string, string | undefined>): Promise<SupportingCastPage<T>> {
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const data = await request<Record<string, unknown> & { meta?: { next_cursor?: string | null } }>('GET', `${path}?${params}`);
    return { items: (data?.[key] as T[] | undefined) ?? [], nextCursor: data?.meta?.next_cursor || null };
  }

  return {
    /** `GET /users`: users updated since a time (all, without one), 100 per page */
    listUsers: (query: { updatedSince?: string; cursor?: string }) =>
      list<SupportingCastUser>('/users', 'users', { per_page: '100', updated_since: query.updatedSince, cursor: query.cursor }),

    /** `GET /subscriptions`: subscriptions updated since a time, optionally for some plans only, 100 per page */
    listSubscriptions: (query: { updatedSince?: string; cursor?: string; planIds?: number[] }) =>
      list<SupportingCastSubscription>('/subscriptions', 'subscriptions', {
        per_page: '100',
        updated_since: query.updatedSince,
        cursor: query.cursor,
        subscription_plan_ids: query.planIds?.length ? query.planIds.join(',') : undefined,
      }),

    /** `POST /users/{id}/send_login_email`: Supporting Cast emails the user (at the address it has) a link that ends at `redirectUrl` */
    sendLoginEmail: async (userId: string, redirectUrl: string) => {
      await request('POST', `/users/${encodeURIComponent(userId)}/send_login_email`, { redirect_url: redirectUrl });
    },
  };
}

export type SupportingCastApi = ReturnType<typeof createSupportingCastApi>;
