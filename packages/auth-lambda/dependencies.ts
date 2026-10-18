import { createHmac } from 'node:crypto';
import {
  ProviderNotConfiguredError,
  createDevCodeProvider,
  createMemoryAuthStore,
  createPatreonProvider,
  createMemorySupportingCastMirror,
  createSupportingCastProvider,
  normalizeEmail,
  syncSupportingCast,
  type AuthStore,
  type PatreonClientSettings,
  type PatreonSiteSettings,
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
 * - `patreon-client`: JSON PatreonClientSettings (browse.show's Patreon OAuth client, for every site)
 * - `sites/<siteId>/patreon`: JSON PatreonSiteSettings (campaign and tiers)
 */
export type SecretReader = (name: string) => Promise<string>;

/** What a SecretReader throws for a secret that isn't set (e.g. SSM's ParameterNotFound) */
export class SecretNotFoundError extends Error {
  constructor(name: string) {
    super(`Secret ${name} isn't set`);
    this.name = 'SecretNotFoundError';
  }
}

export const SECRET_NAMES = {
  signingPrivateKey: 'signing-private-key',
  emailHashKey: 'email-hash-key',
  devCode: 'dev-code',
  supportingCast: (siteId: string) => `sites/${siteId}/supporting-cast`,
  patreonClient: 'patreon-client',
  patreon: (siteId: string) => `sites/${siteId}/patreon`,
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
export interface DependencyOptions {
  storage?: Storage;
  /** The auth API's own URL, for OAuth redirect URIs */
  publicUrl?: string;
  /** Patreon's site and API (a local fake in development) */
  patreonBaseUrl?: string;
  /** Supporting Cast's API (a local fake in development) */
  supportingCastApi?: { fetch?: typeof fetch; baseUrl?: string };
  /** Milliseconds since the epoch (tests) */
  clock?: () => number;
}

export function createDependencies(sites: AuthSitesConfig, readSecret: SecretReader, options: DependencyOptions = {}): Dependencies {
  const { storage = createMemoryStorage(), clock = Date.now } = options;
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

  /** A provider's settings; a missing secret means the provider isn't set up yet (logins get 503 provider-not-configured) */
  async function providerSecret(name: string): Promise<string> {
    try {
      return await cachedSecret(name);
    } catch (error) {
      if (error instanceof SecretNotFoundError) throw new ProviderNotConfiguredError(error.message);
      throw error;
    }
  }

  async function supportingCastSettings(siteId: string): Promise<SupportingCastSettings> {
    return JSON.parse(await providerSecret(SECRET_NAMES.supportingCast(siteId))) as SupportingCastSettings;
  }

  // Providers are cheap to build: build them per request, so they always have current settings
  async function getProvider(siteId: string, providerId: ProviderId): Promise<SubscriptionProvider> {
    switch (providerId) {
      case 'dev-code':
        return createDevCodeProvider({ code: await providerSecret(SECRET_NAMES.devCode) });
      case 'supporting-cast':
        return createSupportingCastProvider(await supportingCastSettings(siteId), {
          siteId,
          mirror: storage.supportingCastMirror(siteId),
          store: storage.store,
          hashEmail: await emailHasher(),
          api: options.supportingCastApi,
        });
      case 'patreon': {
        const site = JSON.parse(await providerSecret(SECRET_NAMES.patreon(siteId))) as PatreonSiteSettings;
        const client = site.client ?? (JSON.parse(await providerSecret(SECRET_NAMES.patreonClient)) as PatreonClientSettings);
        return createPatreonProvider(site, client, { baseUrl: options.patreonBaseUrl });
      }
    }
  }

  return {
    sites,
    store: storage.store,
    publicUrl: options.publicUrl,
    getSigningPrivateKey: () => cachedSecret(SECRET_NAMES.signingPrivateKey),
    getProvider,
    hashEmail: async email => (await emailHasher())(email),

    async syncSupportingCast(syncOptions = {}) {
      const results: Record<string, SyncResult | { skipped: string }> = {};
      for (const [siteId, site] of Object.entries(sites)) {
        if (!site.providers.includes('supporting-cast')) continue;
        let settings: SupportingCastSettings;
        try {
          settings = await supportingCastSettings(siteId);
        } catch (error) {
          results[siteId] = { skipped: error instanceof ProviderNotConfiguredError ? 'no settings in SSM yet' : `failed: ${(error as Error).message}` };
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
            shouldStop: syncOptions.shouldStop,
            api: options.supportingCastApi,
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
