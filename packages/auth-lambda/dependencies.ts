import { createDevCodeProvider, createSupportingCastProvider, type ProviderId, type SubscriptionProvider, type SupportingCastSettings } from '@browse-dot-show/auth';
import type { AuthDependencies, AuthSitesConfig } from './app.js';

/**
 * Secrets, by name (relative to the parameter prefix, e.g. `/browse-dot-show/auth`):
 *
 * - `signing-private-key`: Ed25519 private key (PEM) for session tokens
 * - `dev-code`: the `dev-code` provider's code
 * - `sites/<siteId>/supporting-cast`: JSON SupportingCastSettings (API token, network ID, feed IDs)
 */
export type SecretReader = (name: string) => Promise<string>;

export const SECRET_NAMES = {
  signingPrivateKey: 'signing-private-key',
  devCode: 'dev-code',
  supportingCast: (siteId: string) => `sites/${siteId}/supporting-cast`,
};

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

/** Dependencies built on a secret reader, caching secrets and providers for the life of the lambda instance */
export function createDependencies(sites: AuthSitesConfig, readSecret: SecretReader): AuthDependencies {
  const secretCache = new Map<string, Promise<string>>();
  const cachedSecret = (name: string) => {
    if (!secretCache.has(name)) {
      const pending = readSecret(name);
      // Don't cache failures (e.g. a parameter set after the lambda started)
      pending.catch(() => secretCache.delete(name));
      secretCache.set(name, pending);
    }
    return secretCache.get(name)!;
  };

  const providerCache = new Map<string, Promise<SubscriptionProvider>>();
  async function buildProvider(siteId: string, providerId: ProviderId): Promise<SubscriptionProvider> {
    switch (providerId) {
      case 'dev-code':
        return createDevCodeProvider({ code: await cachedSecret(SECRET_NAMES.devCode) });
      case 'supporting-cast':
        return createSupportingCastProvider(JSON.parse(await cachedSecret(SECRET_NAMES.supportingCast(siteId))) as SupportingCastSettings);
    }
  }

  return {
    sites,
    getSigningPrivateKey: () => cachedSecret(SECRET_NAMES.signingPrivateKey),
    getProvider(siteId, providerId) {
      const key = `${siteId}/${providerId}`;
      if (!providerCache.has(key)) {
        const pending = buildProvider(siteId, providerId);
        pending.catch(() => providerCache.delete(key));
        providerCache.set(key, pending);
      }
      return providerCache.get(key)!;
    },
  };
}
