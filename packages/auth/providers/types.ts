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
  /** Send the browser here to log in (OAuth providers, e.g. Patreon); it comes back to the auth API's `/oauth/callback` */
  | { kind: 'redirect'; url: string }
  /** No login step: the listener enters a code in the site (`dev-code`) */
  | { kind: 'enter-code' };

export interface StartLoginInput {
  email?: string;
  /** Where the provider sends the listener after logging in: `https://<site domain>/auth/callback?provider=<id>` */
  callbackUrl: string;
  /**
   * The callback URL plus a signed, single-use login link token for this user (1 hour), for
   * providers that email the listener a link: only the inbox's owner sees it, so `/complete`
   * accepts it without asking the provider again.
   */
  loginLinkFor(providerUserId: string): Promise<string>;
  /** For OAuth providers: the redirect URI to send (the auth API's `/oauth/callback`) and the `state` to pass through */
  oauth: { redirectUri: string; state: string };
}

/** What an OAuth provider's redirect brought back to `/oauth/callback` */
export interface OAuthCallback {
  code: string;
  /** The redirect URI the login used (OAuth token requests must repeat it) */
  redirectUri: string;
}

export interface SubscriptionProvider {
  id: ProviderId;
  startLogin(input: StartLoginInput): Promise<StartLoginResult>;
  /**
   * Checks what the site's `/auth/callback` (or code form) received; null if it doesn't grant
   * access. Login links (`loginLinkFor`) are checked by the auth lambda, which then calls `refresh`
   * (if the provider has it).
   */
  completeLogin(params: Record<string, string>): Promise<VerifiedSubscriber | null>;
  /** OAuth providers: exchanges the callback's code and checks the listener's membership; null if it doesn't grant access */
  completeOAuth?(callback: OAuthCallback): Promise<VerifiedSubscriber | null>;
  /**
   * Re-checks a subscriber without them (e.g. from a mirror of subscribers); null if they no
   * longer have access. Providers without it (OAuth: we keep no provider tokens) only check at
   * login, so their sessions end 30 days after it.
   */
  refresh?(providerUserId: string): Promise<VerifiedSubscriber | null>;
}

/** The provider's settings (e.g. API keys) aren't in SSM yet: logins with it can't work until they are */
export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}

/** The provider's API failed or rate-limited us, or logins are paused: the listener should try again later */
export class ProviderUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}
