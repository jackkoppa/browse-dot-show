import { describe, expect, it, vi } from 'vitest';
import { createMemoryAuthStore, generateSigningKeyPair, ProviderUnavailableError, signSessionToken, verifySessionToken, type SubscriptionProvider } from '@browse-dot-show/auth';
import { handleAuthRequest, LOGIN_LINK_TTL_SECONDS, RATE_LIMITS, SESSION_TTL_SECONDS, type AuthDependencies } from './app.js';
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
    store: createMemoryAuthStore(() => NOW),
    getSigningPrivateKey: async () => keys.privateKeyPem,
    getProvider: async () => provider,
    hashEmail: async email => `hash(${email.trim().toLowerCase()})`,
    now: () => NOW,
  };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}, sourceIp = '203.0.113.1') => ({ method: 'POST', path, headers, body, sourceIp });

describe('POST /login', () => {
  it("starts the provider's login, returning to the requesting origin when it's the site's", async () => {
    const provider = fakeProvider();
    const response = await handleAuthRequest(
      post('/login', { siteId: 'listenfairplay', provider: 'supporting-cast', email: 'fan@example.com', origin: 'https://www.listenfairplay.com' }),
      deps(provider),
    );
    expect(response).toEqual({ status: 200, body: { result: { kind: 'email-sent' } } });
    expect(provider.startLogin).toHaveBeenCalledWith(expect.objectContaining({ email: 'fan@example.com', callbackUrl: 'https://www.listenfairplay.com/auth/callback?provider=supporting-cast' }));
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

describe('rate limits', () => {
  const login = (email: string, sourceIp = '203.0.113.1') => post('/login', { siteId: 'listenfairplay', provider: 'supporting-cast', email }, {}, sourceIp);

  it('limits logins per IP per hour', async () => {
    const dependencies = deps();
    for (let i = 0; i < RATE_LIMITS.loginsPerIpPerHour; i++) {
      expect((await handleAuthRequest(login(`fan${i}@example.com`), dependencies)).status).toBe(200);
    }
    expect(await handleAuthRequest(login('another@example.com'), dependencies)).toEqual({ status: 429, body: { error: 'too-many-requests' } });
    expect((await handleAuthRequest(login('another@example.com', '198.51.100.7'), dependencies)).status).toBe(200);
  });

  it('limits logins per email per day, from any IP and however the email is typed', async () => {
    const provider = fakeProvider();
    const dependencies = deps(provider);
    for (let i = 0; i < RATE_LIMITS.loginsPerEmailPerDay; i++) {
      expect((await handleAuthRequest(login('fan@example.com', `198.51.100.${i}`), dependencies)).status).toBe(200);
    }
    expect((await handleAuthRequest(login(' FAN@example.com ', '192.0.2.1'), dependencies)).status).toBe(429);
    expect(provider.startLogin).toHaveBeenCalledTimes(RATE_LIMITS.loginsPerEmailPerDay);
  });
});

describe('login links', () => {
  /** The link the provider would have emailed, from the loginLinkFor it was given */
  async function emailedLink(dependencies: AuthDependencies, provider: SubscriptionProvider, userId = '41') {
    await handleAuthRequest(post('/login', { siteId: 'listenfairplay', provider: 'supporting-cast', email: 'fan@example.com' }), dependencies);
    const input = vi.mocked(provider.startLogin).mock.calls[0][0];
    return new URL(await input.loginLinkFor(userId));
  }
  const complete = (params: Record<string, string>) => post('/complete', { siteId: 'listenfairplay', provider: 'supporting-cast', params });

  it('go back to the site, and log in once without asking the provider to verify them', async () => {
    const provider = fakeProvider();
    const dependencies = deps(provider);
    const link = await emailedLink(dependencies, provider);
    expect(`${link.origin}${link.pathname}`).toBe('https://listenfairplay.com/auth/callback');
    const params = Object.fromEntries(link.searchParams);
    expect(params.provider).toBe('supporting-cast');

    const response = await handleAuthRequest(complete({ link: params.link }), dependencies);
    expect(response.status).toBe(200);
    expect(provider.completeLogin).not.toHaveBeenCalled();
    expect(provider.refresh).toHaveBeenCalledWith('41');

    expect(await handleAuthRequest(complete({ link: params.link }), dependencies)).toEqual({ status: 401, body: { error: 'link-already-used' } });
  });

  it('turn away a subscriber who lapsed since the email', async () => {
    const provider = fakeProvider();
    const dependencies = deps(provider);
    const link = await emailedLink(dependencies, provider, '99');
    expect(await handleAuthRequest(complete({ link: link.searchParams.get('link')! }), dependencies)).toEqual({ status: 401, body: { error: 'not-a-subscriber' } });
  });

  it('reject expired, forged and session tokens', async () => {
    const sign = (scope: 'login-link' | 'subscriber', now = NOW, key = keys.privateKeyPem) =>
      signSessionToken({ siteId: 'listenfairplay', subject: 'supporting-cast:41', scope, jti: 'x', ttlSeconds: LOGIN_LINK_TTL_SECONDS, now }, key).token;
    const invalid = { status: 401, body: { error: 'invalid-link' } };
    expect(await handleAuthRequest(complete({ link: sign('login-link', NOW - LOGIN_LINK_TTL_SECONDS - 120) }), deps())).toEqual(invalid);
    expect(await handleAuthRequest(complete({ link: sign('login-link', NOW, generateSigningKeyPair().privateKeyPem) }), deps())).toEqual(invalid);
    expect(await handleAuthRequest(complete({ link: sign('subscriber') }), deps())).toEqual(invalid);
  });
});

describe('POST /complete', () => {
  it('issues a 30-day session token for a verified subscriber', async () => {
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

describe('secret cache', () => {
  it('re-reads secrets after a few minutes, so a changed setting applies', async () => {
    let clock = 0;
    const readSecret = vi.fn(async () => keys.privateKeyPem);
    const dependencies = createDependencies({}, readSecret, undefined, () => clock);
    await dependencies.getSigningPrivateKey();
    clock += 60_000;
    await dependencies.getSigningPrivateKey();
    expect(readSecret).toHaveBeenCalledTimes(1);
    clock += 5 * 60_000;
    await dependencies.getSigningPrivateKey();
    expect(readSecret).toHaveBeenCalledTimes(2);
  });
});

describe('Supporting Cast end to end (in memory)', () => {
  it('syncs the mirror, then logs a subscriber in with one call to Supporting Cast', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const { pathname } = new URL(url);
      calls.push(`${init.method} ${pathname.replace('/v2/net-1', '')}`);
      if (pathname.endsWith('/subscriptions')) return Response.json({ subscriptions: [{ id: 1, user_id: 41, subscription_plan_id: 7, status: 'Active' }], meta: {} });
      if (pathname.endsWith('/users')) return Response.json({ users: [{ id: 41, email: 'fan@example.com' }], meta: {} });
      return new Response(null, { status: 204 });
    });
    try {
      const secrets: Record<string, string> = {
        'signing-private-key': keys.privateKeyPem,
        'email-hash-key': 'k',
        'sites/listenfairplay/supporting-cast': JSON.stringify({ apiToken: 't', networkId: 'net-1', planIds: [7] }),
      };
      const dependencies = createDependencies(
        { listenfairplay: { origins: ['https://listenfairplay.com'], providers: ['supporting-cast'] } },
        async name => secrets[name],
      );
      expect(await dependencies.syncSupportingCast()).toEqual({ listenfairplay: { pages: 2, users: 1, subscriptions: 1, caughtUp: true } });

      const login = (email: string) => handleAuthRequest(post('/login', { siteId: 'listenfairplay', provider: 'supporting-cast', email }), dependencies);
      expect((await login('nobody@example.com')).status).toBe(200);
      expect((await login('Fan@Example.com')).status).toBe(200);
      expect(calls).toEqual(['GET /subscriptions', 'GET /users', 'POST /users/41/send_login_email']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
