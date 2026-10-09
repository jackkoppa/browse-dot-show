import { createPublicKey } from 'node:crypto';
import {
  PROVIDER_IDS,
  ProviderUnavailableError,
  getBearerToken,
  signSessionToken,
  verifySessionToken,
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
 *   the dev code). Returns `{ token, expiresAt }`, or 401
 * - `/refresh {siteId}` with `Authorization: Bearer <token>`: re-checks the subscription and
 *   returns a new `{ token, expiresAt }`, or 401
 *
 * Stateless: the session token is the only record of a login.
 */

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Per-site settings that aren't secret (from the sites' `subscriberAccess` config, via Terraform) */
export interface AuthSiteConfig {
  /** Origins the site is served at, e.g. `https://listenfairplay.com`. The first is used when a request's origin isn't listed */
  origins: string[];
  providers: ProviderId[];
}

export type AuthSitesConfig = Record<string, AuthSiteConfig>;

export interface AuthDependencies {
  sites: AuthSitesConfig;
  getSigningPrivateKey(): Promise<string>;
  getProvider(siteId: string, providerId: ProviderId): Promise<SubscriptionProvider>;
  /** Seconds since the epoch */
  now?(): number;
}

export interface AuthRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: unknown;
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
        // Only ever send listeners back to the site itself
        const origin = typeof body.origin === 'string' && site.origins.includes(body.origin) ? body.origin : site.origins[0];
        const provider = await deps.getProvider(siteId, body.provider);
        const result = await provider.startLogin({
          email: typeof body.email === 'string' ? body.email.slice(0, 320) : undefined,
          callbackUrl: `${origin}/auth/callback?provider=${body.provider}`,
        });
        log.info(`login started: site=${siteId} provider=${body.provider} result=${result.kind}`);
        return { status: 200, body: { result } };
      }

      case '/complete': {
        if (!isProviderId(body.provider) || !site.providers.includes(body.provider)) return error(400, 'unknown-provider');
        const provider = await deps.getProvider(siteId, body.provider);
        const subscriber = await provider.completeLogin(stringRecord(body.params));
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
