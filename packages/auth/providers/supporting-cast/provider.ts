import type { AuthStore } from '../../store.js';
import { timeBuckets } from '../../store.js';
import { ProviderUnavailableError, type SubscriptionProvider } from '../types.js';
import { createSupportingCastApi, type SupportingCastApiOptions } from './api.js';
import { hasAccess, type SupportingCastMirror } from './mirror.js';
import { SUPPORTING_CAST_DEFAULTS, type SupportingCastSettings } from './settings.js';
import { normalizeEmail } from './sync.js';

/**
 * Supporting Cast (https://developers.supportingcast.fm/api/docs-v2). Its API is admin-only, with
 * no OAuth, so login is its magic-link email. Its rate limit is shared with the network's other
 * uses of the API, so a login makes one call at most:
 *
 * 1. startLogin: look the email up in our mirror of subscribers (mirror.ts, synced every few
 *    hours). Only for a subscriber, ask Supporting Cast to email a login link (1 call), whose
 *    redirect is our own signed, single-use login link. Unknown emails make no calls at all
 * 2. The listener opens the email; the site's `/auth/callback` sends our login link to the auth
 *    lambda, which checks it itself and calls refresh: no call
 * 3. refresh (sessions, daily at most): the mirror again, no call
 *
 * Login emails are capped per day (`loginEmailsPerDay`); past it, every login (subscriber or not)
 * gets "try again later", so the cap never reveals who subscribes.
 */

export interface SupportingCastProviderDependencies {
  siteId: string;
  mirror: SupportingCastMirror;
  store: AuthStore;
  /** HMAC of a normalized email: must match the sync's */
  hashEmail(email: string): string;
  now?: () => Date;
  api?: Pick<SupportingCastApiOptions, 'fetch' | 'baseUrl'>;
}

export function createSupportingCastProvider(settings: SupportingCastSettings, deps: SupportingCastProviderDependencies): SubscriptionProvider {
  const api = createSupportingCastApi({ apiToken: settings.apiToken, networkId: settings.networkId, ...deps.api });
  const now = deps.now ?? (() => new Date());
  const loginEmailsPerDay = settings.loginEmailsPerDay ?? SUPPORTING_CAST_DEFAULTS.loginEmailsPerDay;

  async function subscriberHasAccess(userId: string): Promise<boolean> {
    return hasAccess(await deps.mirror.getSubscriptions(userId), now(), settings.planIds);
  }

  return {
    id: 'supporting-cast',

    async startLogin({ email, loginLinkFor }) {
      if (settings.enabled === false) throw new ProviderUnavailableError('Supporting Cast logins are paused (enabled: false)');
      const { day, dayEndsAt } = timeBuckets(Math.floor(now().getTime() / 1000));
      const budgetKey = `supporting-cast-login-emails#${deps.siteId}#${day}`;
      if ((await deps.store.count(budgetKey)) >= loginEmailsPerDay) {
        throw new ProviderUnavailableError(`Supporting Cast login emails for ${deps.siteId} reached today's limit (${loginEmailsPerDay})`, 429);
      }

      const normalized = email ? normalizeEmail(email) : '';
      if (!normalized.includes('@')) return { kind: 'email-sent' };
      const userId = await deps.mirror.getUserIdByEmailHash(deps.hashEmail(normalized));
      if (!userId || !(await subscriberHasAccess(userId))) return { kind: 'email-sent' };

      if ((await deps.store.increment(budgetKey, dayEndsAt)) > loginEmailsPerDay) {
        throw new ProviderUnavailableError(`Supporting Cast login emails for ${deps.siteId} reached today's limit (${loginEmailsPerDay})`, 429);
      }
      await api.sendLoginEmail(userId, await loginLinkFor(userId));
      return { kind: 'email-sent' };
    },

    // Supporting Cast's own login token isn't needed: the auth lambda checks our login link
    async completeLogin() {
      return null;
    },

    async refresh(providerUserId) {
      if (!/^\d+$/.test(providerUserId)) return null;
      return (await subscriberHasAccess(providerUserId)) ? { providerUserId } : null;
    },
  };
}
