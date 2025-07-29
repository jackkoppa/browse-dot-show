import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface SiteAccountMapping {
  [siteId: string]: {
    accountId: string;
    bucketName: string;
    cloudfrontId?: string;
    cloudfrontDomain?: string;
    searchApiUrl?: string;
  };
}

/**
 * Loads site account mappings from the centralized .site-account-mappings.json file
 * This file is gitignored and contains sensitive account information
 */
export function loadSiteAccountMappings(): SiteAccountMapping {
  try {
    const mappingsPath = resolve(process.cwd(), '.site-account-mappings.json');
    const mappingsContent = readFileSync(mappingsPath, 'utf8');
    const mappings = JSON.parse(mappingsContent);
    
    // TODO: Add pickleballstudio mapping when it's deployed for the first time
    
    return mappings;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        'Site account mappings file not found. Please create .site-account-mappings.json in the repository root. ' +
        'See IMPROVING_GITIGNORE_AND_FILE_DEDUPING_FOR_SITES.md for the required structure.'
      );
    }
    throw new Error(`Failed to load site account mappings: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets account mapping for a specific site
 */
export function getSiteAccountMapping(siteId: string): { accountId: string; bucketName: string; cloudfrontId?: string; cloudfrontDomain?: string; searchApiUrl?: string } {
  const mappings = loadSiteAccountMappings();
  const mapping = mappings[siteId];
  
  if (!mapping) {
    // TODO: Add pickleballstudio mapping when it's deployed for the first time
    throw new Error(`No account mapping found for site: ${siteId}. Available sites: ${Object.keys(mappings).join(', ')}`);
  }
  
  return mapping;
}

/**
 * Gets CloudFront distribution ID for a specific site
 */
export function getSiteCloudFrontId(siteId: string): string {
  const mapping = getSiteAccountMapping(siteId);
  
  if (!mapping.cloudfrontId) {
    throw new Error(`CloudFront distribution ID not found for site: ${siteId}. Please deploy the site first to populate this value.`);
  }
  
  return mapping.cloudfrontId;
}

/**
 * Gets CloudFront domain for a specific site
 */
export function getSiteCloudFrontDomain(siteId: string): string {
  const mapping = getSiteAccountMapping(siteId);
  
  if (!mapping.cloudfrontDomain) {
    throw new Error(`CloudFront domain not found for site: ${siteId}. Please deploy the site first to populate this value.`);
  }
  
  return mapping.cloudfrontDomain;
}

/**
 * Gets search API URL for a specific site
 */
export function getSiteSearchApiUrl(siteId: string): string {
  const mapping = getSiteAccountMapping(siteId);
  
  if (!mapping.searchApiUrl) {
    throw new Error(`Search API URL not found for site: ${siteId}. Please deploy the site first to populate this value.`);
  }
  
  return mapping.searchApiUrl;
} 