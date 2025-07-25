import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface SiteAccountMapping {
  [siteId: string]: {
    accountId: string;
    bucketName: string;
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
export function getSiteAccountMapping(siteId: string): { accountId: string; bucketName: string } {
  const mappings = loadSiteAccountMappings();
  const mapping = mappings[siteId];
  
  if (!mapping) {
    // TODO: Add pickleballstudio mapping when it's deployed for the first time
    throw new Error(`No account mapping found for site: ${siteId}. Available sites: ${Object.keys(mappings).join(', ')}`);
  }
  
  return mapping;
} 