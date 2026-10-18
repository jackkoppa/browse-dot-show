import { timingSafeEqual } from 'node:crypto';
import type { SubscriptionProvider } from './types.js';

/**
 * For testing subscriber access on prod before a real provider is set up: entering the secret
 * code (kept in SSM) logs in as `dev-code:<label>`. Only offered behind the client's feature flag.
 */
export function createDevCodeProvider(options: { code: string }): SubscriptionProvider {
  if (options.code.length < 16) {
    throw new Error('The dev login code must be at least 16 characters');
  }
  const expected = Buffer.from(options.code);

  return {
    id: 'dev-code',
    async startLogin() {
      return { kind: 'enter-code' };
    },
    async completeLogin(params) {
      const given = Buffer.from(params.code ?? '');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      const label = (params.label ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'dev';
      return { providerUserId: label };
    },
    async refresh(providerUserId) {
      // Valid while the provider is configured; rotating the code doesn't end existing sessions
      // before they expire
      return { providerUserId };
    },
  };
}
