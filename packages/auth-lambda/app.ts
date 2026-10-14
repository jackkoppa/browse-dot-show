import { createPublicKey, randomUUID } from 'node:crypto';
import {
  PROVIDER_IDS,
  ProviderUnavailableError,
  getBearerToken,
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
 *   returns a new `{ token, expiresAt }`, or 401
 *
 * Sessions are stateless: the session token is the only record of a login. The store only holds
 * rate-limit counters and used login links, all expiring.
 */

/** Sessions last 30 days, and the client refreshes them daily at most: a listener who visits monthly stays logged in */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** How long an emailed login link works (once) */
export const LOGIN_LINK_TTL_SECONDS = 60 * 60;

/** Per-IP and per-email limits (429 past them), on top of the API's overall throttling and providers' own limits */
export const RATE_LIMITS = {
  loginsPerIpPerHour: 10,
  loginsPerEmailPerDay: 3,
  completionsPerIpPerHour: 20,
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
  /** Seconds since the epoch */
  now?(): number;
}

export interface AuthRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  /** The caller's IP (API Gateway's `requestContext.http.sourceIp`), for rate limits */
  sourceIp?: string;
}

export interface AuthResponse {
  status: number;
  body: Record<string, unknown>;
}

function error(status: number, code: string): AuthResponse {
  return { status, body: { error: code } };
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length <= 4096));
}

export async function handleAuthRequest(request: AuthRequest, deps: AuthDependencies): Promise<AuthResponse> {
  const now = deps.now?.() ?? Math.floor(Date.now() / 1000);

  if (request.method === 'GET' && request.path === '/health') return { status: 200, body: { status: 'ok' } };
  if (request.method !== 'POST') return error(405, 'method-not-allowed');

  const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
  const siteId = typeof body.siteId === 'string' ? body.siteId : '';
  const site = Object.hasOwn(deps.sites, siteId) ? deps.sites[siteId] : undefined;
  if (!site) return error(400, 'unknown-site');

  const { day, hour, dayEndsAt, hourEndsAt } = timeBuckets(now);
  const ip = request.sourceIp ?? 'unknown';
  /** Counts this request against a limit; true if it's over */
  const overLimit = async (key: string, limit: number, expiresAt: number) => (await deps.store.increment(key, expiresAt)) > limit;

  async function issueToken(providerId: ProviderId, providerUserId: string): Promise<AuthResponse> {
    const { token, claims } = signSessionToken(
      { siteId, subject: `${providerId}:${providerUserId}`, ttlSeconds: SESSION_TTL_SECONDS, now },
      await deps.getSigningPrivateKey(),
    );
    return { status: 200, body: { token, expiresAt: claims.exp } };
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
        const result = await provider.startLogin({
          email,
          callbackUrl,
          async loginLinkFor(providerUserId) {
            const { token } = signSessionToken(
              { siteId, subject: `${providerId}:${providerUserId}`, scope: 'login-link', jti: randomUUID(), ttlSeconds: LOGIN_LINK_TTL_SECONDS, now },
              await deps.getSigningPrivateKey(),
            );
            return `${callbackUrl}&link=${token}`;
          },
        });
        log.info(`login started: site=${siteId} provider=${body.provider} result=${result.kind}`);
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
          subscriber = await provider.refresh(link.claims.sub.slice(body.provider.length + 1));
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

        const separator = verified.claims.sub.indexOf(':');
        const providerId = verified.claims.sub.slice(0, separator);
        const providerUserId = verified.claims.sub.slice(separator + 1);
        if (!isProviderId(providerId) || !site.providers.includes(providerId)) return error(401, 'provider-disabled');

        const subscriber = await (await deps.getProvider(siteId, providerId)).refresh(providerUserId);
        log.info(`session refreshed: site=${siteId} provider=${providerId} granted=${!!subscriber}`);
        if (!subscriber) return error(401, 'not-a-subscriber');
        return issueToken(providerId, subscriber.providerUserId);
      }

      default:
        return error(404, 'not-found');
    }
  } catch (caught) {
    if (caught instanceof ProviderUnavailableError) {
      log.warn(`provider unavailable: site=${siteId} path=${request.path} status=${caught.status ?? 'n/a'}`);
      return error(503, 'provider-unavailable');
    }
    log.error(`auth request failed: site=${siteId} path=${request.path}`, caught);
    return error(500, 'internal-error');
  }
}
