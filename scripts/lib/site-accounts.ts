import { readFileSync } from 'fs';
import { repoPath } from './paths.js';
import { execCommand } from './shell-exec.js';
import type { AutomationCredentials } from './env.js';

/**
 * Per-site AWS account details, from `.site-account-mappings.json`
 * (repo root), plus assuming the automation role in a site's account.
 */

export interface SiteAccount {
  accountId: string;
  bucketName: string;
  cloudfrontId?: string;
  cloudfrontDomain?: string;
  searchApiUrl?: string;
}

export type SiteAccountMapping = Record<string, SiteAccount>;

export const SITE_ACCOUNT_MAPPINGS_PATH = repoPath('.site-account-mappings.json');

export function loadSiteAccountMappings(): SiteAccountMapping {
  try {
    return JSON.parse(readFileSync(SITE_ACCOUNT_MAPPINGS_PATH, 'utf8'));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Site account mappings file not found: ${SITE_ACCOUNT_MAPPINGS_PATH}. ` +
          'It maps each site ID to { accountId, bucketName, cloudfrontId, cloudfrontDomain, searchApiUrl }.'
      );
    }
    throw new Error(`Failed to load site account mappings: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getSiteAccountMapping(siteId: string): SiteAccount {
  const mappings = loadSiteAccountMappings();
  const mapping = mappings[siteId];
  if (!mapping) {
    throw new Error(`No account mapping found for site: ${siteId}. Available sites: ${Object.keys(mappings).join(', ')}`);
  }
  return mapping;
}

function requireMappingField(siteId: string, field: 'cloudfrontId' | 'cloudfrontDomain' | 'searchApiUrl', label: string): string {
  const value = getSiteAccountMapping(siteId)[field];
  if (!value) {
    throw new Error(`${label} not found for site: ${siteId}. Please deploy the site first to populate this value.`);
  }
  return value;
}

export const getSiteCloudFrontId = (siteId: string) => requireMappingField(siteId, 'cloudfrontId', 'CloudFront distribution ID');
export const getSiteCloudFrontDomain = (siteId: string) => requireMappingField(siteId, 'cloudfrontDomain', 'CloudFront domain');
export const getSiteSearchApiUrl = (siteId: string) => requireMappingField(siteId, 'searchApiUrl', 'Search API URL');

/** The cross-account role (defined in terraform/automation/) that the automation user assumes. */
export function getAutomationRoleArn(accountId: string): string {
  return `arn:aws:iam::${accountId}:role/browse-dot-show-automation-role`;
}

/** Temporary credentials as returned by `aws sts assume-role` (`.Credentials`). */
export interface TempCredentials {
  AccessKeyId: string;
  SecretAccessKey: string;
  SessionToken: string;
  Expiration?: string;
}

/**
 * Assume the automation role in a site's account, using the automation user's keys.
 * `sessionName` should be unique per call, e.g. `auto-pre-sync-<site>-<timestamp>`.
 */
export async function assumeSiteRole(
  siteId: string,
  credentials: AutomationCredentials,
  sessionName: string
): Promise<{ siteAccount: SiteAccount; tempCredentials: TempCredentials }> {
  const siteAccount = getSiteAccountMapping(siteId);

  const result = await execCommand('aws', [
    'sts', 'assume-role',
    '--role-arn', getAutomationRoleArn(siteAccount.accountId),
    '--role-session-name', sessionName,
  ], {
    silent: true,
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: credentials.AWS_REGION,
    },
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to assume role: ${result.stderr}`);
  }

  return { siteAccount, tempCredentials: JSON.parse(result.stdout).Credentials };
}

/** Env vars that make the AWS CLI use the given temporary credentials. */
export interface TempCredentialsEnv {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN: string;
  AWS_REGION?: string;
}

export function tempCredentialsEnv(tempCredentials: TempCredentials, region?: string): TempCredentialsEnv {
  return {
    AWS_ACCESS_KEY_ID: tempCredentials.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: tempCredentials.SecretAccessKey,
    AWS_SESSION_TOKEN: tempCredentials.SessionToken,
    ...(region ? { AWS_REGION: region } : {}),
  };
}
