/**
 * A site's Supporting Cast settings: JSON in SSM (`sites/<siteId>/supporting-cast`), since the API
 * token is secret. Changes apply within 5 minutes (the auth lambda re-reads its secrets).
 */
export interface SupportingCastSettings {
  apiToken: string;
  networkId: string;
  /** Subscription plans that grant access (any one is enough). Empty: any plan */
  planIds?: number[];
  /** Most login emails a day (UTC). Once reached, logins pause for everyone until midnight UTC */
  loginEmailsPerDay?: number;
  /** Most pages (100 records each) one sync run fetches: spreads the first full sync over several runs */
  syncPagesPerRun?: number;
  /** false pauses logins and syncs (listeners already logged in stay logged in) */
  enabled?: boolean;
}

export const SUPPORTING_CAST_DEFAULTS = {
  loginEmailsPerDay: 100,
  syncPagesPerRun: 20,
};
