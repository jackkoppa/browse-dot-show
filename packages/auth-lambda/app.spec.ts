import { describe, expect, it, vi } from 'vitest';
import { generateSigningKeyPair, ProviderUnavailableError, signSessionToken, verifySessionToken, type SubscriptionProvider } from '@browse-dot-show/auth';
import { handleAuthRequest, SESSION_TTL_SECONDS, type AuthDependencies } from './app.js';
import { createDependencies, parseSitesConfig } from './dependencies.js';

const keys = generateSigningKeyPair();
const NOW = 1_800_000_000;

function fakeProvider(overrides: Partial<SubscriptionProvider> = {}): SubscriptionProvider {
  return {
    id: 'supporting-cast',
    startLogin: vi.fn(async () => ({ kind: 'email-sent' as const })),
    completeLogin: vi.fn(async params => (params.login_token === 'good' ? { providerUserId: '41' } : null)),
    refresh: vi.fn(async id => (id === '41' ? { providerUserId: id } : null)),
    ...overrides,
  };
}

function deps(provider = fakeProvider()): AuthDependencies {
  return {
    sites: {
      listenfairplay: { origins: ['https://listenfairplay.com', 'https://www.listenfairplay.com'], providers: ['supporting-cast'] },
      libero: { origins: ['https://libero.browse.show'], providers: ['dev-code'] },
    },
    getSigningPrivateKey: async () => keys.privateKeyPem,
    getProvider: async () => provider,
    now: () => NOW,
  };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST', path, headers, body });

describe('POST /login', () => {
  it("starts the provider's login, returning to the requesting origin when it's the site's", async () => {
    const provider = fakeProvider();
    const response = await handleAuthRequest(
      post('/login', { siteId: 'listenfairplay', provider: 'supporting-cast', email: 'fan@example.com', origin: 'https://www.listenfairplay.com' }),
      deps(provider),
    );
    expect(response).toEqual({ status: 200, body: { result: { kind: 'email-sent' } } });
    expect(provider.startLogin).toHaveBeenCalledWith({ email: 'fan@example.com', callbackUrl: 'https://www.listenfairplay.com/auth/callback?provider=supporting-cast' });
  });

  it("never returns to an origin that isn't the site's", async () => {
    const provider = fakeProvider();
    await handleAuthRequest(post('/login', { siteId: 'listenfairplay', provider: 'supporting-cast', email: 'a@b.c', origin: 'https://evil.example' }), deps(provider));
    expect(provider.startLogin).toHaveBeenCalledWith(expect.objectContaining({ callbackUrl: 'https://listenfairplay.com/auth/callback?provider=supporting-cast' }));
  });

  it('rejects unknown sites and providers the site has not enabled', async () => {
    expect((await handleAuthRequest(post('/login', { siteId: 'nope', provider: 'supporting-cast' }), deps())).status).toBe(400);
    expect((await handleAuthRequest(post('/login', { siteId: 'toString', provider: 'supporting-cast' }), deps())).status).toBe(400);
    expect(await handleAuthRequest(post('/login', { siteId: 'listenfairplay', provider: 'dev-code' }), deps())).toEqual({ status: 400, body: { error: 'unknown-provider' } });
  });

  it('reports a provider outage as 503', async () => {
    const provider = fakeProvider({ startLogin: async () => { throw new ProviderUnavailableError('rate limited', 429); } });
    expect(await handleAuthRequest(post('/login', { siteId: 'listenfairplay', provider: 'supporting-cast', email: 'a@b.c' }), deps(provider))).toEqual({ status: 503, body: { error: 'provider-unavailable' } });
  });
});

describe('POST /complete', () => {
  it('issues a 7-day session token for a verified subscriber', async () => {
    const response = await handleAuthRequest(post('/complete', { siteId: 'listenfairplay', provider: 'supporting-cast', params: { login_token: 'good' } }), deps());
    expect(response.status).toBe(200);
    expect(response.body.expiresAt).toBe(NOW + SESSION_TTL_SECONDS);
    const verified = verifySessionToken(response.body.token as string, keys.publicKeyPem, { siteId: 'listenfairplay', now: NOW });
    expect(verified.valid && verified.claims.sub).toBe('supporting-cast:41');
  });

  it('returns 401 when the provider does not grant access', async () => {
    expect(await handleAuthRequest(post('/complete', { siteId: 'listenfairplay', provider: 'supporting-cast', params: { login_token: 'bad' } }), deps())).toEqual({ status: 401, body: { error: 'not-a-subscriber' } });
  });

  it('passes only string params to the provider', async () => {
    const provider = fakeProvider();
    await handleAuthRequest(post('/complete', { siteId: 'listenfairplay', provider: 'supporting-cast', params: { login_token: 'good', nested: { a: 1 }, n: 5 } }), deps(provider));
    expect(provider.completeLogin).toHaveBeenCalledWith({ login_token: 'good' });
  });
});

describe('POST /refresh', () => {
  const tokenFor = (siteId: string, subject: string, now = NOW - 100) =>
    signSessionToken({ siteId, subject, ttlSeconds: SESSION_TTL_SECONDS, now }, keys.privateKeyPem).token;

  it('re-checks the subscriber and issues a new token', async () => {
    const provider = fakeProvider();
    const response = await handleAuthRequest(post('/refresh', { siteId: 'listenfairplay' }, { Authorization: `Bearer ${tokenFor('listenfairplay', 'supporting-cast:41')}` }), deps(provider));
    expect(response.status).toBe(200);
    expect(response.body.expiresAt).toBe(NOW + SESSION_TTL_SECONDS);
    expect(provider.refresh).toHaveBeenCalledWith('41');
  });

  it('returns 401 when the subscription has lapsed', async () => {
    const response = await handleAuthRequest(post('/refresh', { siteId: 'listenfairplay' }, { Authorization: `Bearer ${tokenFor('listenfairplay', 'supporting-cast:99')}` }), deps());
    expect(response).toEqual({ status: 401, body: { error: 'not-a-subscriber' } });
  });

  it("rejects missing, expired and other sites' tokens", async () => {
    expect((await handleAuthRequest(post('/refresh', { siteId: 'listenfairplay' }), deps())).status).toBe(401);
    const expired = tokenFor('listenfairplay', 'supporting-cast:41', NOW - SESSION_TTL_SECONDS - 3600);
    expect((await handleAuthRequest(post('/refresh', { siteId: 'listenfairplay' }, { authorization: `Bearer ${expired}` }), deps())).body).toEqual({ error: 'invalid-token:expired' });
    const otherSite = tokenFor('libero', 'dev-code:jack');
    expect((await handleAuthRequest(post('/refresh', { siteId: 'listenfairplay' }, { authorization: `Bearer ${otherSite}` }), deps())).body).toEqual({ error: 'invalid-token:wrong-audience' });
  });

  it("rejects a token from a provider the site no longer has", async () => {
    const devToken = tokenFor('listenfairplay', 'dev-code:jack');
    expect(await handleAuthRequest(post('/refresh', { siteId: 'listenfairplay' }, { authorization: `Bearer ${devToken}` }), deps())).toEqual({ status: 401, body: { error: 'provider-disabled' } });
  });
});

describe('dependencies', () => {
  it('validates AUTH_SITES', () => {
    expect(() => parseSitesConfig(undefined)).toThrow();
    expect(() => parseSitesConfig(JSON.stringify({ a: { origins: ['https://a.com/path'], providers: ['dev-code'] } }))).toThrow();
    expect(() => parseSitesConfig(JSON.stringify({ a: { origins: ['https://a.com'], providers: [] } }))).toThrow();
    expect(parseSitesConfig(JSON.stringify({ a: { origins: ['https://a.com'], providers: ['dev-code'] } }))).toEqual({ a: { origins: ['https://a.com'], providers: ['dev-code'] } });
  });

  it('reads each secret once, and retries after a failure', async () => {
    let calls = 0;
    const readSecret = vi.fn(async (name: string) => {
      calls++;
      if (name === 'signing-private-key' && calls === 1) throw new Error('not set yet');
      return keys.privateKeyPem;
    });
    const dependencies = createDependencies({}, readSecret);
    await expect(dependencies.getSigningPrivateKey()).rejects.toThrow('not set yet');
    await dependencies.getSigningPrivateKey();
    await dependencies.getSigningPrivateKey();
    expect(readSecret).toHaveBeenCalledTimes(2);
  });

  it('builds the dev-code provider from its secret', async () => {
    const dependencies = createDependencies({}, async () => 'a-long-enough-dev-code');
    const provider = await dependencies.getProvider('libero', 'dev-code');
    expect(await provider.completeLogin({ code: 'a-long-enough-dev-code' })).toEqual({ providerUserId: 'dev' });
  });
});
