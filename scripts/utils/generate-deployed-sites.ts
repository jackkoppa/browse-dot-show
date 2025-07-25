#!/usr/bin/env tsx

/**
 * Generate Deployed Sites List
 * 
 * This script generates the .deployed-sites.json file based on:
 * 1. Sites discovered in the repository
 * 2. Sites that have account mappings (indicating they're deployed)
 * 
 * This ensures terraform automation has access to the correct sites
 * without hardcoding the list.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { discoverSites } from './site-selector.js';
import { loadSiteAccountMappings } from './site-account-mappings.js';
import { logInfo, logSuccess, logWarning } from './logging.js';

/**
 * Generate the deployed sites list and write to .deployed-sites.json
 */
function generateDeployedSitesList(): void {
  try {
    logInfo('🔍 Discovering sites...');
    const allSites = discoverSites();
    
    logInfo('📋 Loading site account mappings...');
    const accountMappings = loadSiteAccountMappings();
    
    // Filter sites to only include those with account mappings (deployed sites)
    const deployedSites = allSites
      .filter(site => accountMappings[site.id])
      .map(site => site.id)
      .sort(); // Sort for consistent output
    
    logInfo(`📍 Found ${deployedSites.length} deployed sites: ${deployedSites.join(', ')}`);
    
    // TODO: Add pickleballstudio when it gets deployed and added to account mappings
    
    // Write to .deployed-sites.json
    const deployedSitesPath = resolve(process.cwd(), '.deployed-sites.json');
    writeFileSync(deployedSitesPath, JSON.stringify(deployedSites, null, 2));
    
    logSuccess(`✅ Generated deployed sites list: ${deployedSitesPath}`);
    logInfo(`📄 Contents: ${JSON.stringify(deployedSites, null, 2)}`);
    
  } catch (error) {
    console.error('❌ Failed to generate deployed sites list:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateDeployedSitesList();
}

export { generateDeployedSitesList }; 