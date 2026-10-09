/**
 * A subscription platform a listener can log in with (Supporting Cast; later Patreon), or the
 * `dev-code` provider for testing. The auth lambda only talks to providers through this.
 */

export type ProviderId = 'supporting-cast' | 'dev-code';

export const PROVIDER_IDS: readonly ProviderId[] = ['supporting-cast', 'dev-code'];

/** A listener the provider confirmed has subscriber access */
export interface VerifiedSubscriber {
  /** The provider's ID for the user. Goes in the session token's `sub` as `<provider>:<id>` */
  providerUserId: string;
}

export type StartLoginResult =
  /** The provider emails the listener a link back to the site (Supporting Cast). Also returned when there's no such subscriber, so the response never reveals who subscribes */
  | { kind: 'email-sent' }
  /** Send the browser here to log in (OAuth providers, e.g. Patreon) */
  | { kind: 'redirect'; url: string }
  /** No login step: the listener enters a code in the site (`dev-code`) */
  | { kind: 'enter-code' };

export interface StartLoginInput {
  email?: string;
  /** Where the provider sends the listener after logging in: `https://<site domain>/auth/callback` */
  callbackUrl: string;
}

export interface SubscriptionProvider {
  id: ProviderId;
  startLogin(input: StartLoginInput): Promise<StartLoginResult>;
  /** Checks what the site's `/auth/callback` (or code form) received; null if it doesn't grant access */
  completeLogin(params: Record<string, string>): Promise<VerifiedSubscriber | null>;
  /** Re-checks a subscriber when their session is refreshed; null if they no longer have access */
  refresh(providerUserId: string): Promise<VerifiedSubscriber | null>;
}

/** The provider's API failed or rate-limited us: the listener should try again later */
export class ProviderUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}
