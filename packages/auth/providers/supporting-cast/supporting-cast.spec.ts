import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createMemoryAuthStore } from '../../store.js';
import { ProviderUnavailableError } from '../types.js';
import { createMemorySupportingCastMirror, hasAccess, type MirroredSubscription } from './mirror.js';
import { createSupportingCastProvider } from './provider.js';
import { syncSupportingCast } from './sync.js';

const NOW = new Date('2026-10-14T12:00:00Z');
const hashEmail = (email: string) => createHmac('sha256', 'test-key').update(email).digest('hex');
const settings = { apiToken: 'secret', networkId: 'net-1' };

/** A fake Supporting Cast API: routes are `"<METHOD> <path after /v2/<network>, without the query>"` */
function fakeSupportingCast(routes: Record<string, (query: URLSearchParams, body: any) => { status?: number; json?: unknown }>) {
  const calls: { method: string; path: string; query: URLSearchParams; body?: any; authorization?: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/v2/net-1', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init.method!, path, query: parsed.searchParams, body, authorization: (init.headers as Record<string, string>).Authorization });
    const route = routes[`${init.method} ${path}`];
    if (!route) return new Response('', { status: 404 });
    const { status = 200, json } = route(parsed.searchParams, body);
    return new Response(json === undefined ? null : JSON.stringify(json), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const active: MirroredSubscription = { id: '1', planId: 7, status: 'Active', endsAt: null };

async function setup(options: { loginEmailsPerDay?: number; enabled?: boolean } = {}) {
  const mirror = createMemorySupportingCastMirror();
  await mirror.putUser('41', hashEmail('fan@example.com'));
  await mirror.putSubscription('41', active);
  await mirror.putUser('5', hashEmail('lapsed@example.com'));
  await mirror.putSubscription('5', { id: '2', planId: 7, status: 'Cancelled', endsAt: '2026-01-01T00:00:00Z' });
  const store = createMemoryAuthStore(() => Math.floor(NOW.getTime() / 1000));
  const { calls, fetchImpl } = fakeSupportingCast({ 'POST /users/41/send_login_email': () => ({ status: 204 }) });
  const provider = createSupportingCastProvider({ ...settings, planIds: [7], ...options }, { siteId: 'listenfairplay', mirror, store, hashEmail, now: () => NOW, api: { fetch: fetchImpl } });
  const login = (email: string) => provider.startLogin({ email, callbackUrl: 'unused', loginLinkFor: async id => `https://listenfairplay.com/auth/callback?provider=supporting-cast&link=for-${id}`, oauth: { redirectUri: '', state: '' } });
  return { provider, calls, login, store };
}

describe('Supporting Cast provider', () => {
  it('asks Supporting Cast to email a subscriber our login link: one call', async () => {
    const { calls, login } = await setup();
    expect(await login(' Fan@Example.com ')).toEqual({ kind: 'email-sent' });
    expect(calls.map(call => `${call.method} ${call.path}`)).toEqual(['POST /users/41/send_login_email']);
    expect(calls[0].body).toEqual({ redirect_url: 'https://listenfairplay.com/auth/callback?provider=supporting-cast&link=for-41' });
    expect(calls[0].authorization).toBe('Bearer secret');
  });

  it('makes no calls (but says the same) for unknown emails and lapsed subscribers', async () => {
    const { calls, login } = await setup();
    for (const email of ['nobody@example.com', 'lapsed@example.com', 'not-an-email', '']) {
      expect(await login(email)).toEqual({ kind: 'email-sent' });
    }
    expect(calls).toEqual([]);
  });

  it("stops sending at the day's limit, then turns everyone away so the limit reveals nothing", async () => {
    const { calls, login } = await setup({ loginEmailsPerDay: 2 });
    await login('fan@example.com');
    await login('fan@example.com');
    await expect(login('fan@example.com')).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(login('nobody@example.com')).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(calls).toHaveLength(2);
  });

  it('pauses logins when disabled', async () => {
    const { calls, login } = await setup({ enabled: false });
    await expect(login('fan@example.com')).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(calls).toEqual([]);
  });

  it('refreshes sessions from the mirror, with no calls', async () => {
    const { calls, provider } = await setup();
    expect(await provider.refresh!('41')).toEqual({ providerUserId: '41' });
    expect(await provider.refresh!('5')).toBeNull();
    expect(await provider.refresh!('999')).toBeNull();
    expect(await provider.refresh!('not-a-number')).toBeNull();
    expect(await provider.completeLogin({ login_token: 'anything' })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('reports rate limits, outages and a rejected API token as unavailable', async () => {
    for (const status of [401, 429, 503]) {
      const mirror = createMemorySupportingCastMirror();
      await mirror.putUser('41', hashEmail('fan@example.com'));
      await mirror.putSubscription('41', active);
      const { fetchImpl } = fakeSupportingCast({ 'POST /users/41/send_login_email': () => ({ status }) });
      const provider = createSupportingCastProvider(settings, { siteId: 'x', mirror, store: createMemoryAuthStore(), hashEmail, api: { fetch: fetchImpl } });
      await expect(provider.startLogin({ email: 'fan@example.com', callbackUrl: '', loginLinkFor: async () => '', oauth: { redirectUri: '', state: '' } })).rejects.toBeInstanceOf(ProviderUnavailableError);
    }
  });
});

describe('hasAccess', () => {
  const at = (status: MirroredSubscription['status'], endsAt: string | null = null, planId: number | null = 7) => [{ id: '1', planId, status, endsAt }];

  it('accepts active and paid-up cancelled subscriptions on the configured plans', () => {
    expect(hasAccess(at('Active'), NOW, [7])).toBe(true);
    expect(hasAccess(at('Alert'), NOW, [7])).toBe(true);
    expect(hasAccess(at('Cancelled', '2030-01-01T00:00:00Z'), NOW, [7])).toBe(true);
    expect(hasAccess(at('Cancelled', '2020-01-01T00:00:00Z'), NOW, [7])).toBe(false);
    expect(hasAccess(at('Cancelled'), NOW, [7])).toBe(false);
    expect(hasAccess(at('Suspended'), NOW, [7])).toBe(false);
    expect(hasAccess(at('Active', null, 8), NOW, [7])).toBe(false);
    expect(hasAccess(at('Active', null, 8), NOW)).toBe(true);
    expect(hasAccess([], NOW)).toBe(false);
  });
});

describe('syncSupportingCast', () => {
  function pagedApi(subscriptionPages: unknown[][], userPages: unknown[][]) {
    const page = (pages: unknown[][], key: string) => (query: URLSearchParams) => {
      const index = Number(query.get('cursor') ?? 0);
      return { json: { [key]: pages[index] ?? [], meta: { next_cursor: index + 1 < pages.length ? String(index + 1) : null } } };
    };
    return fakeSupportingCast({ 'GET /subscriptions': page(subscriptionPages, 'subscriptions'), 'GET /users': page(userPages, 'users') });
  }

  it('mirrors subscriptions and hashed emails, then fetches only updates', async () => {
    const mirror = createMemorySupportingCastMirror();
    const { calls, fetchImpl } = pagedApi(
      [[{ id: 1, user_id: 41, subscription_plan_id: 7, status: 'Active' }]],
      [[{ id: 41, email: 'Fan@Example.com' }, { id: 42, email: null }]],
    );
    const first = await syncSupportingCast({ ...settings, planIds: [7] }, { mirror, hashEmail, now: () => NOW, api: { fetch: fetchImpl } });
    expect(first).toEqual({ pages: 2, users: 2, subscriptions: 1, caughtUp: true });
    expect(await mirror.getUserIdByEmailHash(hashEmail('fan@example.com'))).toBe('41');
    expect(await mirror.getSubscriptions('41')).toEqual([{ id: '1', planId: 7, status: 'Active', endsAt: null }]);
    expect([...mirror.users.values()].join()).not.toContain('example.com');
    expect(calls[0].query.get('subscription_plan_ids')).toBe('7');
    expect(calls[0].query.get('updated_since')).toBeNull();

    await syncSupportingCast(settings, { mirror, hashEmail, now: () => new Date('2026-10-14T14:00:00Z'), api: { fetch: fetchImpl } });
    // Since the previous run's start, less a 10-minute overlap
    expect(calls.slice(2).map(call => call.query.get('updated_since'))).toEqual(['2026-10-14T11:50:00', '2026-10-14T11:50:00']);
  });

  it('spreads a long first sync over runs, resuming where it stopped', async () => {
    const mirror = createMemorySupportingCastMirror();
    const subscriptions = [1, 2, 3].map(n => [{ id: n, user_id: n, status: 'Active' }]);
    const { calls, fetchImpl } = pagedApi(subscriptions, [[{ id: 1, email: 'a@example.com' }]]);
    const run = () => syncSupportingCast({ ...settings, syncPagesPerRun: 2 }, { mirror, hashEmail, now: () => NOW, api: { fetch: fetchImpl } });

    expect(await run()).toEqual({ pages: 2, users: 0, subscriptions: 2, caughtUp: false });
    expect(await run()).toEqual({ pages: 2, users: 1, subscriptions: 1, caughtUp: true });
    expect(calls.map(call => `${call.path}@${call.query.get('cursor') ?? 0}`)).toEqual(['/subscriptions@0', '/subscriptions@1', '/subscriptions@2', '/users@0']);
    expect(await mirror.getSubscriptions('3')).toHaveLength(1);
  });

  it("replaces a user's old email hash when their email changes", async () => {
    const mirror = createMemorySupportingCastMirror();
    await mirror.putUser('41', hashEmail('old@example.com'));
    await mirror.putUser('41', hashEmail('new@example.com'));
    expect(await mirror.getUserIdByEmailHash(hashEmail('old@example.com'))).toBeNull();
    expect(await mirror.getUserIdByEmailHash(hashEmail('new@example.com'))).toBe('41');
  });
});
