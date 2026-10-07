#!/usr/bin/env tsx

/**
 * Upload All Client Sites Script - Automated Client File Upload
 * 
 * This script builds and uploads client files for all sites using automation credentials.
 * It focuses only on building client files and uploading them to S3 buckets.
 * 
 * Usage: tsx scripts/deploy/upload-all-client-sites.ts [OPTIONS]
 */

import { discoverSites, type Site } from '../lib/sites.js';
import { loadAutomationCredentials, type AutomationCredentials } from '../lib/env.js';
import {
  assumeSiteRole,
  getSiteAccountMapping,
  getSiteSearchApiUrl,
  loadSiteAccountMappings,
  tempCredentialsEnv,
} from '../lib/site-accounts.js';
import { logSuccess, logError, logWarning, logProgress, logHeader } from '../lib/logging.js';
import { 
  buildClientForSite, 
  validateBuildOutput, 
  uploadClientToS3WithCredentials
} from '../lib/client-deployment.js';

// Site account mappings moved to centralized location
// TODO: Add pickleballstudio mapping when it's deployed for the first time

interface SiteUploadResult {
  siteId: string;
  siteTitle: string;
  buildSuccess: boolean;
  buildDuration: number;
  uploadSuccess: boolean;
  uploadDuration: number;
  errors: string[];
}

/**
 * Parse command line arguments
 */
function parseArguments(): { help: boolean; dryRun: boolean; selectedSites?: string[] } {
  const args = process.argv.slice(2);
  const config = { help: false, dryRun: false, selectedSites: undefined as string[] | undefined };
  
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg.startsWith('--sites=')) {
      const sitesArg = arg.split('=')[1];
      if (sitesArg) {
        config.selectedSites = sitesArg.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    }
  }
  
  return config;
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
🚀 Upload All Client Sites - Automated Client File Upload

USAGE:
  tsx scripts/deploy/upload-all-client-sites.ts [OPTIONS]

OPTIONS:
  --help                    Show this help message
  --sites=site1,site2       Upload only specific sites (comma-separated)
  --dry-run                 Show what would be done without executing

EXAMPLES:
  # Upload all sites
  tsx scripts/deploy/upload-all-client-sites.ts
  
  # Upload only specific sites
  tsx scripts/deploy/upload-all-client-sites.ts --sites=hardfork,naddpod
  
  # Dry run to see what would happen
  tsx scripts/deploy/upload-all-client-sites.ts --dry-run

This script uses automation credentials from .env.automation to build and upload
client files for all sites to their respective S3 buckets.
`);
}

/**
 * Upload client files to S3 for a site using automation credentials
 */
async function uploadClientToS3(
  siteId: string,
  credentials: AutomationCredentials,
  bucketName: string
): Promise<{ success: boolean; duration: number; error?: string }> {
  const { tempCredentials } = await assumeSiteRole(
    siteId,
    credentials,
    `automation-upload-${siteId}-${Date.now()}`
  );
  const transformedCredentials = {
    ...tempCredentialsEnv(tempCredentials),
    AWS_REGION: credentials.AWS_REGION
  };
  
  return await uploadClientToS3WithCredentials(siteId, bucketName, transformedCredentials, { silent: true });
}

/**
 * Upload client files for a single site
 */
async function uploadSite(
  site: Site,
  credentials: any
): Promise<SiteUploadResult> {
  
  const result: SiteUploadResult = {
    siteId: site.id,
    siteTitle: site.title,
    buildSuccess: false,
    buildDuration: 0,
    uploadSuccess: false,
    uploadDuration: 0,
    errors: []
  };

  try {
    logProgress(`🚀 Uploading ${site.title} (${site.id})`);

    // Check if site has account mapping
    const siteConfig = getSiteAccountMapping(site.id);

    // Build the client
    logProgress(`  📦 Building client files...`);
    const buildStartTime = Date.now();
    
    // Get the correct search API URL from site account mappings
    const searchApiUrl = getSiteSearchApiUrl(site.id);
    
    const buildResult = await buildClientForSite(site.id, searchApiUrl);
    result.buildDuration = Date.now() - buildStartTime;
    
    if (!buildResult.success) {
      throw new Error(`Build failed: ${buildResult.error}`);
    }
    result.buildSuccess = true;

    // Validate build output
    logProgress(`  ✅ Validating build output...`);
    const validationResult = await validateBuildOutput(site.id);
    if (!validationResult.valid) {
      throw new Error(`Build validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Upload to S3
    logProgress(`  ☁️  Uploading to S3...`);
    const uploadStartTime = Date.now();
    const uploadResult = await uploadClientToS3(site.id, credentials, siteConfig.bucketName);
    result.uploadDuration = Date.now() - uploadStartTime;
    
    if (!uploadResult.success) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }
    result.uploadSuccess = true;

    logSuccess(`  ✅ Upload complete for ${site.title}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    logError(`  ❌ Upload failed for ${site.title}: ${errorMessage}`);
  }

  return result;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const config = parseArguments();

  if (config.help) {
    displayHelp();
    return;
  }

  logHeader('Upload All Client Sites - Automated Client File Upload');
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    // Load automation credentials
    const credentials = loadAutomationCredentials();

    // Discover sites
    const sites = discoverSites();

    // Filter sites if specific sites are requested
    let sitesToUpload = sites;
    if (config.selectedSites) {
      sitesToUpload = sites.filter((site: Site) => config.selectedSites!.includes(site.id));
      if (sitesToUpload.length === 0) {
        logError('No valid sites found matching the provided site IDs');
        process.exit(1);
      }
    }

    // Filter out sites that don't have account mappings
    const mappings = loadSiteAccountMappings();
    const sitesWithMappings = sitesToUpload.filter((site: Site) => mappings[site.id]);
    const sitesWithoutMappings = sitesToUpload.filter((site: Site) => !mappings[site.id]);

    if (sitesWithoutMappings.length > 0) {
      logWarning('Skipping sites without account mappings:');
      sitesWithoutMappings.forEach((site: Site) => logWarning(`  - ${site.id} (${site.title})`));
    }

    if (sitesWithMappings.length === 0) {
      logError('No sites found with account mappings');
      process.exit(1);
    }

    console.log(`\n📍 Found ${sitesWithMappings.length} site(s) to upload:`);
    sitesWithMappings.forEach((site: Site) => {
      console.log(`   - ${site.id} (${site.title})`);
    });

    if (config.dryRun) {
      console.log('\n🔍 DRY RUN - No actual uploads will be performed');
      return;
    }

    console.log('\n============================================================');

    // Upload each site
    const results: SiteUploadResult[] = [];
    for (let i = 0; i < sitesWithMappings.length; i++) {
      const site = sitesWithMappings[i];
      console.log(`\n🚀 Uploading ${site.id} (${site.title}) - ${i + 1}/${sitesWithMappings.length}`);
      console.log('============================================================');
      
      const result = await uploadSite(site, credentials);
      results.push(result);
    }

    // Summary
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    console.log('\n============================================================');
    console.log('📊 Final Summary');
    console.log('============================================================');
    console.log(`\n⏱️  Overall Duration: ${(totalDuration / 1000).toFixed(1)}s (${(totalDuration / 60000).toFixed(1)} minutes)`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);

    console.log('\n📈 Per-Site Results:\n');
    
    let successCount = 0;
    let failureCount = 0;
    
    results.forEach(result => {
      
      const totalTime = result.buildDuration + result.uploadDuration;
      
      console.log(`   ${result.siteId} (${result.siteTitle}):`);
      console.log(`      Build: ${result.buildSuccess ? '✅' : '❌'} (${(result.buildDuration / 1000).toFixed(1)}s)`);
      console.log(`      Upload: ${result.uploadSuccess ? '✅' : '❌'} (${(result.uploadDuration / 1000).toFixed(1)}s)`);
      console.log(`      Total: ${(totalTime / 1000).toFixed(1)}s`);
      
      if (result.errors.length > 0) {
        console.log(`      Errors: ${result.errors.join(', ')}`);
        failureCount++;
      } else {
        successCount++;
      }
      console.log('');
    });

    console.log(`\n🎯 Summary: ${successCount} successful, ${failureCount} failed`);
    
    if (failureCount > 0) {
      process.exit(1);
    }

  } catch (error) {
    logError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nUpload cancelled...');
  process.exit(0);
});

main(); 