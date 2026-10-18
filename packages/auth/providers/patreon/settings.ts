/**
 * Patreon settings, in SSM (secrets: the client secret):
 *
 * - `patreon-client`: the OAuth client (one for every site, registered at
 *   https://www.patreon.com/portal by browse.show's Patreon account). With the
 *   `identity.memberships` scope it sees a listener's memberships to any campaign
 * - `sites/<siteId>/patreon`: which campaign and tiers grant access on the site
 */
export interface PatreonClientSettings {
  clientId: string;
  clientSecret: string;
  /** Scopes to ask for (default: identity, identity.memberships) */
  scopes?: string[];
}

export interface PatreonSiteSettings {
  /** The creator's campaign ID (public: e.g. in the campaign page's image URLs, or `pnpm patreon-check`) */
  campaignId: string;
  /** Tiers that grant access (any one is enough). Empty: any paying membership */
  tierIds?: string[];
  /** false pauses logins (listeners already logged in stay logged in) */
  enabled?: boolean;
  /** Free members count too (for testing with a free test campaign; never on a real one) */
  allowFreeMembers?: boolean;
  /** A client of the site's own (e.g. registered by the creator), instead of the shared one */
  client?: PatreonClientSettings;
}

export const PATREON_DEFAULT_SCOPES = ['identity', 'identity.memberships'];
