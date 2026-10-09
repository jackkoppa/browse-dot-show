import * as fs from 'fs';
import * as path from 'path';
import { getSiteById } from '@browse-dot-show/sites';
import { isSearchIndexStale } from '../ingestion/index-freshness.js';
import { getSiteDirectory } from './sites.js';

/**
 * Subscriber access in `bds ingest` (see scratchpad/subscriber-access/PLAN.md). Sites with
 * subscriber feeds get a second pass with CONTENT_SCOPE=subscriber, writing to the site's
 * `subscriber/` folder. Most sites have none, and nothing here changes for them.
 */

/** The top-level folder for subscriber files (locally and in the bucket) */
export const SUBSCRIBER_FOLDER = 'subscriber';

/** Whether the site has subscriber feeds to ingest */
export function hasSubscriberFeeds(siteId: string): boolean {
  return (getSiteById(siteId)?.subscriberAccess?.subscriberFeeds.length ?? 0) > 0;
}

/** Whether `enable_subscriber_access = true` is set in tfvars content (comments ignored) */
export function tfvarsEnableSubscriberAccess(tfvars: string): boolean {
  return tfvars
    .split('\n')
    .map(line => line.replace(/#.*$/, '').trim())
    .some(line => /^enable_subscriber_access\s*=\s*true$/.test(line));
}

/**
 * Whether subscriber files may be uploaded: only once the site's Terraform has
 * `enable_subscriber_access`, which denies CloudFront access to `subscriber/`. Otherwise the
 * files would be publicly readable at https://<site>/subscriber/….
 */
export function isSubscriberUploadEnabled(siteId: string): boolean {
  const siteDir = getSiteDirectory(siteId);
  if (!siteDir) return false;
  const tfvarsPath = path.join(siteDir, 'terraform', 'prod.tfvars');
  return fs.existsSync(tfvarsPath) && tfvarsEnableSubscriberAccess(fs.readFileSync(tfvarsPath, 'utf8'));
}

/**
 * Whether the local subscriber index needs rebuilding: subscriber transcripts newer than it, or
 * a public index newer than it (it contains every public episode).
 */
export function isSubscriberIndexStale(siteRoot: string): boolean {
  const subscriberRoot = path.join(siteRoot, SUBSCRIBER_FOLDER);
  const subscriberIndex = path.join(subscriberRoot, 'search-index', 'orama_index.msp');
  const publicIndex = path.join(siteRoot, 'search-index', 'orama_index.msp');
  if (!fs.existsSync(subscriberIndex)) return fs.existsSync(publicIndex) || isSearchIndexStale(subscriberRoot);
  if (isSearchIndexStale(subscriberRoot)) return true;
  return fs.existsSync(publicIndex) && fs.statSync(publicIndex).mtimeMs > fs.statSync(subscriberIndex).mtimeMs;
}
