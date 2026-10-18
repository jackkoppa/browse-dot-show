import { describe, expect, it } from 'vitest';
import { ProviderUnavailableError } from '../types.js';
import { createPatreonProvider, patreonHasAccess, type PatreonIdentity } from './provider.js';

const client = { clientId: 'client-1', clientSecret: 'shh' };
const site = { campaignId: '1631945', tierIds: ['2479339', '2479345'] };
const oauth = { redirectUri: 'https://auth.example.com/oauth/callback', state: 'signed-state' };
const unusedLinks = { callbackUrl: '', loginLinkFor: async () => '' };

/** An identity with memberships: [campaign, patron status, tier IDs] */
function identity(userId: string, memberships: [string, string | null, string[]][]): PatreonIdentity {
  return {
    data: { id: userId, type: 'user' },
    included: memberships.flatMap(([campaignId, status, tiers], index) => [
      {
        id: `member-${index}`,
        type: 'member',
        attributes: { patron_status: status },
        relationships: {
          campaign: { data: { id: campaignId, type: 'campaign' } },
          currently_entitled_tiers: { data: tiers.map(id => ({ id, type: 'tier' })) },
        },
      },
      { id: campaignId, type: 'campaign', attributes: { vanity: 'x' } },
    ]),
  };
}

function fakePatreon(identities: Record<string, PatreonIdentity>, status = 200) {
  const calls: { path: string; body?: URLSearchParams; authorization?: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const { pathname, search } = new URL(url);
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ path: pathname + search, body: init.body as URLSearchParams | undefined, authorization: headers.Authorization });
    if (status !== 200) return new Response('{}', { status });
    if (pathname === '/api/oauth2/token') {
      const code = (init.body as URLSearchParams).get('code')!;
      return identities[code] ? Response.json({ access_token: `token-for-${code}` }) : new Response('{"error":"invalid_grant"}', { status: 400 });
    }
    if (pathname === '/api/oauth2/v2/identity') return Response.json(identities[headers.Authorization.replace('Bearer token-for-', '')]);
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('Patreon provider', () => {
  it('sends listeners to Patreon to authorize, with our state and redirect URI', async () => {
    const provider = createPatreonProvider(site, client);
    const result = await provider.startLogin({ ...unusedLinks, oauth });
    if (result.kind !== 'redirect') throw new Error('expected a redirect');
    const url = new URL(result.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://www.patreon.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code', client_id: 'client-1', redirect_uri: oauth.redirectUri, scope: 'identity identity.memberships', state: 'signed-state',
    });
  });

  it("grants access to the campaign's active patrons on the tiers: 2 calls", async () => {
    const { calls, fetchImpl } = fakePatreon({
      member: identity('u1', [['999', 'active_patron', ['1']], ['1631945', 'active_patron', ['2479345']]]),
    });
    const provider = createPatreonProvider(site, client, { fetch: fetchImpl });
    expect(await provider.completeOAuth!({ code: 'member', redirectUri: oauth.redirectUri })).toEqual({ providerUserId: 'u1' });
    expect(calls.map(call => call.path.split('?')[0])).toEqual(['/api/oauth2/token', '/api/oauth2/v2/identity']);
    expect(Object.fromEntries(calls[0].body!)).toEqual({
      code: 'member', grant_type: 'authorization_code', client_id: 'client-1', client_secret: 'shh', redirect_uri: oauth.redirectUri,
    });
    expect(calls[1].authorization).toBe('Bearer token-for-member');
  });

  it("tells a patron on another tier that their tier isn't included", async () => {
    const { fetchImpl } = fakePatreon({ helper: identity('u3', [['1631945', 'active_patron', ['2469028']]]) });
    const provider = createPatreonProvider(site, client, { fetch: fetchImpl });
    expect(await provider.completeOAuth!({ code: 'helper', redirectUri: oauth.redirectUri })).toEqual({ denied: 'tier-not-included' });
  });

  it('turns away former patrons, other campaigns and bad codes', async () => {
    const { fetchImpl } = fakePatreon({
      former: identity('u2', [['1631945', 'former_patron', ['2479339']]]),
      elsewhere: identity('u4', [['2925941', 'active_patron', ['2479339']]]),
      free: identity('u5', [['1631945', null, []]]),
    });
    const provider = createPatreonProvider(site, client, { fetch: fetchImpl });
    for (const code of ['former', 'elsewhere', 'free', 'expired-code']) {
      expect(await provider.completeOAuth!({ code, redirectUri: oauth.redirectUri })).toBeNull();
    }
  });

  it('without tiers, any active patron counts', () => {
    expect(patreonHasAccess(identity('u', [['1631945', 'active_patron', ['2469028']]]), { campaignId: '1631945' })).toBe(true);
    expect(patreonHasAccess(identity('u', [['1631945', 'declined_patron', ['2469028']]]), { campaignId: '1631945' })).toBe(false);
    expect(patreonHasAccess({ data: { id: 'u', type: 'user' } }, { campaignId: '1631945' })).toBe(false);
  });

  it('counts free members only when a (test) campaign allows them', () => {
    const free = identity('u', [['42', null, ['7']]]);
    expect(patreonHasAccess(free, { campaignId: '42' })).toBe(false);
    expect(patreonHasAccess(free, { campaignId: '42', allowFreeMembers: true })).toBe(true);
    expect(patreonHasAccess(identity('u', [['42', 'former_patron', []]]), { campaignId: '42', allowFreeMembers: true })).toBe(false);
  });

  it("uses a site's own client when it has one, and pauses when disabled", async () => {
    const own = createPatreonProvider({ ...site, client: { clientId: 'creator-client', clientSecret: 'x' } }, client);
    const result = await own.startLogin({ ...unusedLinks, oauth });
    expect(result.kind === 'redirect' && new URL(result.url).searchParams.get('client_id')).toBe('creator-client');
    await expect(createPatreonProvider({ ...site, enabled: false }, client).startLogin({ ...unusedLinks, oauth })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('reports rate limits and outages as unavailable', async () => {
    for (const status of [429, 503]) {
      const { fetchImpl } = fakePatreon({}, status);
      await expect(createPatreonProvider(site, client, { fetch: fetchImpl }).completeOAuth!({ code: 'x', redirectUri: '' })).rejects.toBeInstanceOf(ProviderUnavailableError);
    }
  });

  it("has no refresh: it keeps no Patreon tokens", () => {
    expect(createPatreonProvider(site, client).refresh).toBeUndefined();
  });
});
