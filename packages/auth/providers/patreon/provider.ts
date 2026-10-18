import { ProviderUnavailableError, type SubscriptionProvider } from '../types.js';
import { PATREON_DEFAULT_SCOPES, type PatreonClientSettings, type PatreonSiteSettings } from './settings.js';

/**
 * Patreon (https://docs.patreon.com), with OAuth:
 *
 * 1. startLogin: the authorize URL (scopes `identity identity.memberships`), returning to the
 *    auth API's `/oauth/callback`
 * 2. completeOAuth: exchange the code for the listener's access token, then read their identity
 *    with memberships: 2 calls per login. Access is an `active_patron` membership to the site's
 *    campaign, on one of its tiers (if set)
 *
 * We keep none of Patreon's tokens, so there's no `refresh`: sessions end 30 days after login.
 * Patreon's limits (100 requests per 2 s per client) are far above this.
 *
 * Webhooks would need a client registered by the creator, and would only matter for re-checking
 * access between logins, which a 30-day session doesn't need.
 */

export const PATREON_BASE_URL = 'https://www.patreon.com';

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | { id: string; type: string }[] | null }>;
}

export interface PatreonIdentity {
  data: JsonApiResource;
  included?: JsonApiResource[];
}

/** The identity request: memberships with their campaign and entitled tiers, and only the fields we use */
export const PATREON_IDENTITY_PATH =
  '/api/oauth2/v2/identity?include=memberships.campaign,memberships.currently_entitled_tiers' +
  '&fields%5Bmember%5D=patron_status,is_free_trial,is_gifted&fields%5Bcampaign%5D=vanity&fields%5Btier%5D=title';

/** Memberships in an identity response: campaign, status and entitled tier IDs */
export function patreonMemberships(identity: PatreonIdentity) {
  return (identity.included ?? [])
    .filter(resource => resource.type === 'member')
    .map(member => {
      const campaign = member.relationships?.campaign?.data;
      const tiers = member.relationships?.currently_entitled_tiers?.data;
      return {
        campaignId: campaign && !Array.isArray(campaign) ? campaign.id : null,
        patronStatus: (member.attributes?.patron_status as string | null | undefined) ?? null,
        tierIds: Array.isArray(tiers) ? tiers.map(tier => tier.id) : [],
      };
    });
}

type AccessSettings = Pick<PatreonSiteSettings, 'campaignId' | 'tierIds' | 'allowFreeMembers'>;

/**
 * The identity's access: `granted` for an active patron of the campaign (or a free member, with
 * `allowFreeMembers`) on one of the tiers (any tier, if none are set); `tier-not-included` for an
 * active patron on other tiers; otherwise `none`
 */
export function patreonAccess(identity: PatreonIdentity, settings: AccessSettings): 'granted' | 'tier-not-included' | 'none' {
  const members = patreonMemberships(identity).filter(membership =>
    membership.campaignId === settings.campaignId &&
    (membership.patronStatus === 'active_patron' || (settings.allowFreeMembers === true && membership.patronStatus === null)));
  if (members.length === 0) return 'none';
  const onTier = !settings.tierIds?.length || members.some(membership => membership.tierIds.some(id => settings.tierIds!.includes(id)));
  return onTier ? 'granted' : 'tier-not-included';
}

export function patreonHasAccess(identity: PatreonIdentity, settings: AccessSettings): boolean {
  return patreonAccess(identity, settings) === 'granted';
}

export interface PatreonProviderOptions {
  fetch?: typeof fetch;
  /** Patreon's site and API (a local fake in development) */
  baseUrl?: string;
}

export function createPatreonProvider(site: PatreonSiteSettings, sharedClient: PatreonClientSettings, options: PatreonProviderOptions = {}): SubscriptionProvider {
  const client = site.client ?? sharedClient;
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? PATREON_BASE_URL).replace(/\/$/, '');

  async function call(path: string, init: RequestInit): Promise<Response | null> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch (error) {
      throw new ProviderUnavailableError(`Patreon request failed: ${(error as Error).message}`);
    }
    const endpoint = path.split('?')[0];
    if (response.status === 429 || response.status >= 500) throw new ProviderUnavailableError(`Patreon ${endpoint} returned ${response.status}`, response.status);
    // e.g. an expired or reused code: the listener should log in again
    if (!response.ok) return null;
    return response;
  }

  return {
    id: 'patreon',

    async startLogin({ oauth }) {
      if (site.enabled === false) throw new ProviderUnavailableError('Patreon logins are paused (enabled: false)');
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: client.clientId,
        redirect_uri: oauth.redirectUri,
        scope: (client.scopes ?? PATREON_DEFAULT_SCOPES).join(' '),
        state: oauth.state,
      });
      return { kind: 'redirect', url: `${baseUrl}/oauth2/authorize?${params}` };
    },

    async completeLogin() {
      return null;
    },

    async completeOAuth({ code, redirectUri }) {
      const tokenResponse = await call('/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: redirectUri }),
      });
      const accessToken = tokenResponse && ((await tokenResponse.json()) as { access_token?: string }).access_token;
      if (!accessToken) return null;

      const identityResponse = await call(PATREON_IDENTITY_PATH, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      if (!identityResponse) return null;
      const identity = (await identityResponse.json()) as PatreonIdentity;
      if (!identity?.data?.id) return null;
      const access = patreonAccess(identity, site);
      if (access === 'tier-not-included') return { denied: 'tier-not-included' };
      return access === 'granted' ? { providerUserId: identity.data.id } : null;
    },
  };
}
