import { describe, expect, it } from 'vitest';
import { createDevCodeProvider } from './dev-code.js';
import { createSupportingCastProvider } from './supporting-cast.js';
import { ProviderUnavailableError } from './types.js';

interface Call {
  method: string;
  url: string;
  body?: unknown;
  authorization?: string;
}

/** A fake Supporting Cast API: routes are `"<METHOD> <path after /v2/<network>>"` */
function fakeSupportingCast(routes: Record<string, (body: any) => { status?: number; json?: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.supportingcast.fm/v2/net-1', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init.method!, url: path, body, authorization: (init.headers as Record<string, string>).Authorization });
    const route = routes[`${init.method} ${path}`];
    if (!route) return new Response('', { status: 404 });
    const { status = 200, json } = route(body);
    return new Response(json === undefined ? '' : JSON.stringify(json), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const callbackUrl = 'https://listenfairplay.com/auth/callback';

describe('Supporting Cast provider', () => {
  it('sends a login email to a subscriber with access to a configured feed', async () => {
    const { calls, fetchImpl } = fakeSupportingCast({
      'POST /users/search': body => ({ json: { users: body.email === 'fan@example.com' ? [{ id: 41 }] : [] } }),
      'GET /users/41/feeds': () => ({ json: { feeds: [{ id: 7 }, { id: 9 }] } }),
      'POST /users/41/send_login_email': () => ({ status: 202 }),
    });
    const provider = createSupportingCastProvider({ apiToken: 'secret', networkId: 'net-1', feedIds: [9] }, { fetch: fetchImpl });

    expect(await provider.startLogin({ email: ' Fan@Example.com ', callbackUrl })).toEqual({ kind: 'email-sent' });
    expect(calls.map(call => `${call.method} ${call.url}`)).toEqual(['POST /users/search', 'GET /users/41/feeds', 'POST /users/41/send_login_email']);
    expect(calls[0].body).toEqual({ email: 'fan@example.com' });
    expect(calls[2].body).toEqual({ redirect_url: callbackUrl });
    expect(calls.every(call => call.authorization === 'Bearer secret')).toBe(true);
  });

  it('sends nothing (but says the same) for unknown emails and users without access', async () => {
    const { calls, fetchImpl } = fakeSupportingCast({
      'POST /users/search': body => ({ json: { users: body.email === 'lapsed@example.com' ? [{ id: 5 }] : [] } }),
      'GET /users/5/feeds': () => ({ json: { feeds: [{ id: 7 }] } }),
    });
    const provider = createSupportingCastProvider({ apiToken: 'secret', networkId: 'net-1', feedIds: [9] }, { fetch: fetchImpl });

    expect(await provider.startLogin({ email: 'nobody@example.com', callbackUrl })).toEqual({ kind: 'email-sent' });
    expect(await provider.startLogin({ email: 'lapsed@example.com', callbackUrl })).toEqual({ kind: 'email-sent' });
    expect(await provider.startLogin({ email: 'not-an-email', callbackUrl })).toEqual({ kind: 'email-sent' });
    expect(calls.some(call => call.url.endsWith('send_login_email'))).toBe(false);
  });

  it('completes a login from the callback token', async () => {
    const { calls, fetchImpl } = fakeSupportingCast({
      'POST /users/search': body => ({ json: { users: body.login_token === 'tok' ? [{ id: 41 }] : [] } }),
      'GET /users/41/feeds': () => ({ json: { feeds: [{ id: 9 }] } }),
    });
    const provider = createSupportingCastProvider({ apiToken: 'secret', networkId: 'net-1', feedIds: [9] }, { fetch: fetchImpl });

    expect(await provider.completeLogin({ login_token: 'tok' })).toEqual({ providerUserId: '41' });
    expect(await provider.completeLogin({ login_token: 'wrong' })).toBeNull();
    expect(await provider.completeLogin({})).toBeNull();
    expect(calls[0].body).toEqual({ login_token: 'tok' });
  });

  it('without configured feeds, accepts active (or paid-up cancelled) subscriptions', async () => {
    const subscriptions: Record<string, unknown[]> = {
      '1': [{ status: 'Active' }],
      '2': [{ status: 'Alert' }],
      '3': [{ status: 'Cancelled', ends_at: '2030-01-01T00:00:00Z' }],
      '4': [{ status: 'Cancelled', ends_at: '2020-01-01T00:00:00Z' }],
      '5': [{ status: 'Suspended' }],
      '6': [],
    };
    const { fetchImpl } = fakeSupportingCast(
      Object.fromEntries(Object.entries(subscriptions).map(([id, list]) => [`GET /users/${id}/subscriptions`, () => ({ json: { subscriptions: list } })])),
    );
    const provider = createSupportingCastProvider({ apiToken: 'secret', networkId: 'net-1' }, { fetch: fetchImpl, now: () => new Date('2026-10-09T00:00:00Z') });

    const results = await Promise.all(Object.keys(subscriptions).map(id => provider.refresh(id)));
    expect(results.map(result => result !== null)).toEqual([true, true, true, false, false, false]);
    expect(await provider.refresh('not-a-number')).toBeNull();
  });

  it('reports rate limits, outages and a rejected API token as unavailable', async () => {
    for (const status of [401, 429, 503]) {
      const { fetchImpl } = fakeSupportingCast({ 'POST /users/search': () => ({ status }) });
      const provider = createSupportingCastProvider({ apiToken: 'secret', networkId: 'net-1' }, { fetch: fetchImpl });
      await expect(provider.startLogin({ email: 'fan@example.com', callbackUrl })).rejects.toBeInstanceOf(ProviderUnavailableError);
    }
  });
});

describe('dev-code provider', () => {
  const provider = createDevCodeProvider({ code: 'correct-horse-battery-staple' });

  it('accepts the code, with a cleaned-up label', async () => {
    expect(await provider.startLogin({ callbackUrl })).toEqual({ kind: 'enter-code' });
    expect(await provider.completeLogin({ code: 'correct-horse-battery-staple', label: 'jack <laptop>' })).toEqual({ providerUserId: 'jacklaptop' });
    expect(await provider.completeLogin({ code: 'correct-horse-battery-staple' })).toEqual({ providerUserId: 'dev' });
  });

  it('rejects other codes', async () => {
    expect(await provider.completeLogin({ code: 'wrong' })).toBeNull();
    expect(await provider.completeLogin({})).toBeNull();
  });

  it('requires a long code', () => {
    expect(() => createDevCodeProvider({ code: 'short' })).toThrow();
  });
});
