import { createPublicKey, randomUUID } from 'node:crypto';
import {
  PROVIDER_IDS,
  ProviderNotConfiguredError,
  ProviderUnavailableError,
  getBearerToken,
  readUnverifiedClaims,
  signSessionToken,
  timeBuckets,
  verifySessionToken,
  type AuthStore,
  type ProviderId,
  type SubscriptionProvider,
} from '@browse-dot-show/auth';
import { log } from '@browse-dot-show/logging';

/**
 * The shared auth lambda's routes (all POST, JSON bodies):
 *
 * - `/login {siteId, provider, origin, email?}`: start logging in. Returns `{ result }`, a
 *   StartLoginResult (Supporting Cast: always `email-sent`)
 * - `/complete {siteId, provider, params}`: `params` are what the site's `/auth/callback` got (or
 *   the dev code). Returns `{ token, expiresAt }`, or 401. A login link we signed (`params.link`,
 *   from an emailed link) is checked here, once, then the provider re-checks access
 * - `/refresh {siteId}` with `Authorization: Bearer <token>`: re-checks the subscription and
 *   returns a new `{ token, expiresAt }`, or 401. Providers that can't re-check (OAuth) get the
 *   same session back: it ends 30 days after login
 * - `GET /oauth/callback?code&state`: where OAuth providers (Patreon) return the browser. Checks
 *   the membership, then redirects to the site's `/auth/callback` with a login link (or `error`)
 *
 * Errors: 400 for requests no site allows, 401 when access isn't granted, 429 past rate limits,
 * 503 when a provider is down, paused or not set up yet (`provider-not-configured`: its keys aren't
 * in SSM), 500 otherwise.
 *
 * Sessions are stateless: the session token is the only record of a login. The store only holds
 * rate-limit counters and used login links, all expiring.
 */

/** Sessions last 30 days, and the client refreshes them daily at most: a listener who visits monthly stays logged in */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** How long an emailed login link works (once) */
export const LOGIN_LINK_TTL_SECONDS = 60 * 60;

/** How long a listener has to finish an OAuth login at the provider */
export const OAUTH_STATE_TTL_SECONDS = 15 * 60;

/** Per-IP and per-email limits (429 past them), on top of the API's overall throttling and providers' own limits */
export const RATE_LIMITS = {
  loginsPerIpPerHour: 10,
  loginsPerEmailPerDay: 3,
  completionsPerIpPerHour: 20,
  oauthCallbacksPerIpPerHour: 20,
};

/** Per-site settings that aren't secret (from the sites' `subscriberAccess` config, via Terraform) */
export interface AuthSiteConfig {
  /** Origins the site is served at, e.g. `https://listenfairplay.com`. The first is used when a request's origin isn't listed */
  origins: string[];
  providers: ProviderId[];
}

export type AuthSitesConfig = Record<string, AuthSiteConfig>;

export interface AuthDependencies {
  sites: AuthSitesConfig;
  store: AuthStore;
  getSigningPrivateKey(): Promise<string>;
  getProvider(siteId: string, providerId: ProviderId): Promise<SubscriptionProvider>;
  /** HMAC of a normalized email, so the store never holds emails */
  hashEmail(email: string): Promise<string>;
  /** The auth API's own URL (e.g. `https://abc.execute-api.us-east-1.amazonaws.com`), for OAuth redirect URIs */
  publicUrl?: string;
  /** Seconds since the epoch */
  now?(): number;
}

export interface AuthRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  /** Query string parameters (GET /oauth/callback) */
  query?: Record<string, string | undefined>;
  /** The caller's IP (API Gateway's `requestContext.http.sourceIp`), for rate limits */
  sourceIp?: string;
}

export interface AuthResponse {
  status: number;
  body: Record<string, unknown>;
  /** For a 302: where to send the browser */
  redirect?: string;
}

function error(status: number, code: string): AuthResponse {
  return { status, body: { error: code } };
}

function redirect(url: string): AuthResponse {
  return { status: 302, body: {}, redirect: url };
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length <= 4096));
}

/** `<provider>:<id>` → its parts, or null for a provider we don't know */
function parseSubject(subject: string): { providerId: ProviderId; providerUserId: string } | null {
  const separator = subject.indexOf(':');
  const providerId = subject.slice(0, separator);
  return separator > 0 && isProviderId(providerId) ? { providerId, providerUserId: subject.slice(separator + 1) } : null;
}

/** Errors as responses: what a provider failure means for the listener */
function providerErrorCode(caught: unknown): { status: number; code: string } | null {
  if (caught instanceof ProviderNotConfiguredError) return { status: 503, code: 'provider-not-configured' };
  if (caught instanceof ProviderUnavailableError) return { status: 503, code: 'provider-unavailable' };
  return null;
}

export async function handleAuthRequest(request: AuthRequest, deps: AuthDependencies): Promise<AuthResponse> {
  const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
  const { day, hour, dayEndsAt, hourEndsAt } = timeBuckets(now);
  const ip = request.sourceIp ?? 'unknown';
  /** Counts this request against a limit; true if it's over */
  const overLimit = async (key: string, limit: number, expiresAt: number) => (await deps.store.increment(key, expiresAt)) > limit;
  const oauthRedirectUri = deps.publicUrl ? `${deps.publicUrl.replace(/\/$/, '')}/oauth/callback` : '';

  if (request.method === 'GET' && request.path === '/health') return { status: 200, body: { status: 'ok' } };
  if (request.method === 'GET' && request.path === '/oauth/callback') return handleOAuthCallback();
  if (request.method !== 'POST') return error(405, 'method-not-allowed');

  const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
  const siteId = typeof body.siteId === 'string' ? body.siteId : '';
  const site = Object.hasOwn(deps.sites, siteId) ? deps.sites[siteId] : undefined;
  if (!site) return error(400, 'unknown-site');

  /** A session for a subscriber the provider confirmed at `authTime` (default now); it ends 30 days after that */
  async function issueToken(providerId: ProviderId, providerUserId: string, authTime = now): Promise<AuthResponse> {
    const { token, claims } = signSessionToken(
      { siteId, subject: `${providerId}:${providerUserId}`, authTime, ttlSeconds: authTime + SESSION_TTL_SECONDS - now, now },
      await deps.getSigningPrivateKey(),
    );
    return { status: 200, body: { token, expiresAt: claims.exp } };
  }

  async function loginLink(callbackUrl: string, providerId: ProviderId, providerUserId: string): Promise<string> {
    const { token } = signSessionToken(
      { siteId, subject: `${providerId}:${providerUserId}`, scope: 'login-link', jti: randomUUID(), ttlSeconds: LOGIN_LINK_TTL_SECONDS, now },
      await deps.getSigningPrivateKey(),
    );
    return `${callbackUrl}&link=${token}`;
  }

  try {
    switch (request.path) {
      case '/login': {
        if (!isProviderId(body.provider) || !site.providers.includes(body.provider)) return error(400, 'unknown-provider');
        const providerId = body.provider;
        const email = typeof body.email === 'string' ? body.email.slice(0, 320) : undefined;
        // Every request counts, subscriber or not, so the limits reveal nothing about who subscribes
        if (await overLimit(`login-ip#${ip}#${hour}`, RATE_LIMITS.loginsPerIpPerHour, hourEndsAt)) return error(429, 'too-many-requests');
        if (email?.trim() && (await overLimit(`login-email#${siteId}#${await deps.hashEmail(email)}#${day}`, RATE_LIMITS.loginsPerEmailPerDay, dayEndsAt))) {
          return error(429, 'too-many-requests');
        }

        // Only ever send listeners back to the site itself
        const origin = typeof body.origin === 'string' && site.origins.includes(body.origin) ? body.origin : site.origins[0];
        const callbackUrl = `${origin}/auth/callback?provider=${providerId}`;
        const provider = await deps.getProvider(siteId, providerId);
        const { token: state } = signSessionToken(
          { siteId, subject: `${providerId}:`, scope: 'oauth-state', jti: randomUUID(), origin, ttlSeconds: OAUTH_STATE_TTL_SECONDS, now },
          await deps.getSigningPrivateKey(),
        );
        const result = await provider.startLogin({
          email,
          callbackUrl,
          loginLinkFor: providerUserId => loginLink(callbackUrl, providerId, providerUserId),
          oauth: { redirectUri: oauthRedirectUri, state },
        });
        log.info(`login started: site=${siteId} provider=${providerId} result=${result.kind}`);
        return { status: 200, body: { result } };
      }

      case '/complete': {
        if (!isProviderId(body.provider) || !site.providers.includes(body.provider)) return error(400, 'unknown-provider');
        if (await overLimit(`complete-ip#${ip}#${hour}`, RATE_LIMITS.completionsPerIpPerHour, hourEndsAt)) return error(429, 'too-many-requests');
        const provider = await deps.getProvider(siteId, body.provider);
        const params = stringRecord(body.params);

        let subscriber;
        if (params.link) {
          const publicKey = createPublicKey(await deps.getSigningPrivateKey());
          const link = verifySessionToken(params.link, publicKey, { siteId, scope: 'login-link', now });
          if (!link.valid || !link.claims.jti || !link.claims.sub.startsWith(`${body.provider}:`)) return error(401, 'invalid-link');
          if (!(await deps.store.claimOnce(`login-link#${link.claims.jti}`, link.claims.exp + 60))) return error(401, 'link-already-used');
          const providerUserId = link.claims.sub.slice(body.provider.length + 1);
          // Re-check if the provider can; otherwise the link itself was issued just after a check (OAuth)
          subscriber = provider.refresh ? await provider.refresh(providerUserId) : { providerUserId };
        } else {
          subscriber = await provider.completeLogin(params);
        }
        log.info(`login completed: site=${siteId} provider=${body.provider} granted=${!!subscriber}`);
        if (!subscriber) return error(401, 'not-a-subscriber');
        return issueToken(body.provider, subscriber.providerUserId);
      }

      case '/refresh': {
        const token = getBearerToken(request.headers);
        if (!token) return error(401, 'missing-token');
        // Verify with the public key derived from our private key: one secret to manage
        const publicKey = createPublicKey(await deps.getSigningPrivateKey());
        const verified = verifySessionToken(token, publicKey, { siteId, now });
        if (!verified.valid) return error(401, `invalid-token:${verified.reason}`);

        const subject = parseSubject(verified.claims.sub);
        if (!subject || !site.providers.includes(subject.providerId)) return error(401, 'provider-disabled');
        const provider = await deps.getProvider(siteId, subject.providerId);
        if (!provider.refresh) {
          // Can't re-check without the listener: the session stays as it is, ending 30 days after login
          return { status: 200, body: { token, expiresAt: verified.claims.exp } };
        }
        const subscriber = await provider.refresh(subject.providerUserId);
        log.info(`session refreshed: site=${siteId} provider=${subject.providerId} granted=${!!subscriber}`);
        if (!subscriber) return error(401, 'not-a-subscriber');
        return issueToken(subject.providerId, subscriber.providerUserId);
      }

      default:
        return error(404, 'not-found');
    }
  } catch (caught) {
    const providerError = providerErrorCode(caught);
    if (providerError) {
      log.warn(`${providerError.code}: site=${siteId} path=${request.path} (${(caught as Error).message})`);
      return error(providerError.status, providerError.code);
    }
    log.error(`auth request failed: site=${siteId} path=${request.path}`, caught);
    return error(500, 'internal-error');
  }

  /** The provider sent the browser back: check the state, then the membership, then return to the site */
  async function handleOAuthCallback(): Promise<AuthResponse> {
    const query = request.query ?? {};
    // Which site the state is for decides how to verify it; nothing in it is trusted until then
    const unverified = readUnverifiedClaims(query.state ?? '');
    const stateSiteId = typeof unverified?.aud === 'string' && Object.hasOwn(deps.sites, unverified.aud) ? unverified.aud : null;
    if (!stateSiteId) return error(400, 'invalid-state');
    const state = verifySessionToken(query.state!, createPublicKey(await deps.getSigningPrivateKey()), { siteId: stateSiteId, scope: 'oauth-state', now });
    if (!state.valid || !state.claims.jti || !state.claims.origin) return error(400, 'invalid-state');
    const subject = parseSubject(state.claims.sub);
    const stateSite = deps.sites[stateSiteId];
    if (!subject || !stateSite.providers.includes(subject.providerId) || !stateSite.origins.includes(state.claims.origin)) return error(400, 'invalid-state');

    const { providerId } = subject;
    const callbackUrl = `${state.claims.origin}/auth/callback?provider=${providerId}`;
    const back = (code: string) => redirect(`${callbackUrl}&error=${code}`);
    if (await overLimit(`oauth-callback-ip#${ip}#${hour}`, RATE_LIMITS.oauthCallbacksPerIpPerHour, hourEndsAt)) return back('too-many-requests');
    if (!(await deps.store.claimOnce(`oauth-state#${state.claims.jti}`, state.claims.exp + 60))) return back('link-already-used');
    // The listener said no at the provider
    if (query.error || !query.code) return back('cancelled');

    try {
      const provider = await deps.getProvider(stateSiteId, providerId);
      if (!provider.completeOAuth) return back('unknown-provider');
      const subscriber = await provider.completeOAuth({ code: query.code, redirectUri: oauthRedirectUri });
      log.info(`oauth login: site=${stateSiteId} provider=${providerId} granted=${!!subscriber}`);
      if (!subscriber) return back('not-a-subscriber');
      const { token } = signSessionToken(
        { siteId: stateSiteId, subject: `${providerId}:${subscriber.providerUserId}`, scope: 'login-link', jti: randomUUID(), ttlSeconds: LOGIN_LINK_TTL_SECONDS, now },
        await deps.getSigningPrivateKey(),
      );
      return redirect(`${callbackUrl}&link=${token}`);
    } catch (caught) {
      const providerError = providerErrorCode(caught);
      if (providerError) {
        log.warn(`${providerError.code}: site=${stateSiteId} path=/oauth/callback (${(caught as Error).message})`);
        return back(providerError.code);
      }
      log.error(`oauth callback failed: site=${stateSiteId}`, caught);
      return back('internal-error');
    }
  }
}
