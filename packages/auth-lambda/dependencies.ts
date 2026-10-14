import { createHmac } from 'node:crypto';
import {
  createDevCodeProvider,
  createMemoryAuthStore,
  createMemorySupportingCastMirror,
  createSupportingCastProvider,
  normalizeEmail,
  syncSupportingCast,
  type AuthStore,
  type ProviderId,
  type SubscriptionProvider,
  type SupportingCastMirror,
  type SupportingCastSettings,
  type SyncResult,
} from '@browse-dot-show/auth';
import type { AuthDependencies, AuthSitesConfig } from './app.js';

/**
 * Secrets, by name (relative to the parameter prefix, e.g. `/browse-dot-show/auth`):
 *
 * - `signing-private-key`: Ed25519 private key (PEM) for session tokens and login links
 * - `email-hash-key`: HMAC key for hashing emails (the mirror and rate limits never hold emails).
 *   Changing it empties the Supporting Cast mirrors in effect: reset their sync state to rebuild them
 * - `dev-code`: the `dev-code` provider's code
 * - `sites/<siteId>/supporting-cast`: JSON SupportingCastSettings (API token, network ID, plans, limits)
 */
export type SecretReader = (name: string) => Promise<string>;

export const SECRET_NAMES = {
  signingPrivateKey: 'signing-private-key',
  emailHashKey: 'email-hash-key',
  devCode: 'dev-code',
  supportingCast: (siteId: string) => `sites/${siteId}/supporting-cast`,
};

/** Secrets are re-read after this long, so a changed setting (e.g. `enabled: false`) applies within minutes */
export const SECRET_CACHE_MS = 5 * 60 * 1000;

/** Parses AUTH_SITES (JSON AuthSitesConfig, set by Terraform from the sites' configs) */
export function parseSitesConfig(json: string | undefined): AuthSitesConfig {
  if (!json) throw new Error('AUTH_SITES is required');
  const parsed = JSON.parse(json) as AuthSitesConfig;
  for (const [siteId, site] of Object.entries(parsed)) {
    if (!Array.isArray(site.origins) || site.origins.length === 0 || !site.origins.every(origin => /^https?:\/\/[^/]+$/.test(origin))) {
      throw new Error(`AUTH_SITES.${siteId}.origins must be a non-empty list of origins like https://example.com`);
    }
    if (!Array.isArray(site.providers) || site.providers.length === 0) {
      throw new Error(`AUTH_SITES.${siteId}.providers must be a non-empty list`);
    }
  }
  return parsed;
}

export interface Storage {
  store: AuthStore;
  supportingCastMirror(siteId: string): SupportingCastMirror;
}

/** In-memory storage: tests and the dev server */
export function createMemoryStorage(): Storage {
  const mirrors = new Map<string, SupportingCastMirror>();
  return {
    store: createMemoryAuthStore(),
    supportingCastMirror(siteId) {
      if (!mirrors.has(siteId)) mirrors.set(siteId, createMemorySupportingCastMirror());
      return mirrors.get(siteId)!;
    },
  };
}

export interface Dependencies extends AuthDependencies {
  /** Syncs each site's Supporting Cast mirror (the scheduled event) */
  syncSupportingCast(options?: { shouldStop?: () => boolean }): Promise<Record<string, SyncResult | { skipped: string }>>;
}

/** Dependencies built on a secret reader and storage, caching secrets (for a few minutes) */
export function createDependencies(sites: AuthSitesConfig, readSecret: SecretReader, storage: Storage = createMemoryStorage(), clock: () => number = Date.now): Dependencies {
  const secretCache = new Map<string, { value: Promise<string>; readAt: number }>();
  const cachedSecret = (name: string) => {
    const cached = secretCache.get(name);
    if (!cached || clock() - cached.readAt > SECRET_CACHE_MS) {
      const value = readSecret(name);
      // Don't cache failures (e.g. a parameter set after the lambda started)
      value.catch(() => secretCache.delete(name));
      secretCache.set(name, { value, readAt: clock() });
    }
    return secretCache.get(name)!.value;
  };

  async function emailHasher(): Promise<(email: string) => string> {
    const key = await cachedSecret(SECRET_NAMES.emailHashKey);
    return email => createHmac('sha256', key).update(normalizeEmail(email)).digest('hex');
  }

  async function supportingCastSettings(siteId: string): Promise<SupportingCastSettings> {
    return JSON.parse(await cachedSecret(SECRET_NAMES.supportingCast(siteId))) as SupportingCastSettings;
  }

  // Providers are cheap to build: build them per request, so they always have current settings
  async function getProvider(siteId: string, providerId: ProviderId): Promise<SubscriptionProvider> {
    switch (providerId) {
      case 'dev-code':
        return createDevCodeProvider({ code: await cachedSecret(SECRET_NAMES.devCode) });
      case 'supporting-cast':
        return createSupportingCastProvider(await supportingCastSettings(siteId), {
          siteId,
          mirror: storage.supportingCastMirror(siteId),
          store: storage.store,
          hashEmail: await emailHasher(),
        });
    }
  }

  return {
    sites,
    store: storage.store,
    getSigningPrivateKey: () => cachedSecret(SECRET_NAMES.signingPrivateKey),
    getProvider,
    hashEmail: async email => (await emailHasher())(email),

    async syncSupportingCast(options = {}) {
      const results: Record<string, SyncResult | { skipped: string }> = {};
      for (const [siteId, site] of Object.entries(sites)) {
        if (!site.providers.includes('supporting-cast')) continue;
        let settings: SupportingCastSettings;
        try {
          settings = await supportingCastSettings(siteId);
        } catch {
          results[siteId] = { skipped: 'no settings in SSM' };
          continue;
        }
        if (settings.enabled === false) {
          results[siteId] = { skipped: 'enabled: false' };
          continue;
        }
        try {
          results[siteId] = await syncSupportingCast(settings, {
            mirror: storage.supportingCastMirror(siteId),
            hashEmail: await emailHasher(),
            shouldStop: options.shouldStop,
          });
        } catch (error) {
          // E.g. rate-limited: the next run carries on from where this one got to
          results[siteId] = { skipped: `failed: ${(error as Error).message}` };
        }
      }
      return results;
    },
  };
}
