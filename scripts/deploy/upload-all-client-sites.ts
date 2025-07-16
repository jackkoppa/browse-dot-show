#!/usr/bin/env tsx

/**
 * Upload All Client Sites Script - Automated Client File Upload
 * 
 * This script builds and uploads client files for all sites using automation credentials.
 * It focuses only on building client files and uploading them to S3 buckets.
 * 
 * Usage: tsx scripts/deploy/upload-all-client-sites.ts [OPTIONS]
 */

import { discoverSites, Site } from '../utils/site-selector.js';
import { loadAutomationCredentials } from '../utils/automation-credentials.js';
import { execCommand } from '../utils/shell-exec.js';
import { logInfo, logSuccess, logError, logWarning, logProgress, logHeader } from '../utils/logging.js';
import { 
  buildClientForSite, 
  validateBuildOutput, 
  uploadClientToS3WithCredentials
} from '../utils/client-deployment.js';

// Site account mappings - these match the terraform configurations
// TODO: Move this to a shared utils file to avoid duplication with run-ingestion-pipeline.ts
const SITE_ACCOUNT_MAPPINGS: { [siteId: string]: { accountId: string; bucketName: string } } = {
  'hardfork': {
    accountId: '927984855345',
    bucketName: 'hardfork-browse-dot-show'
  },
  'claretandblue': {
    accountId: '152849157974',
    bucketName: 'claretandblue-browse-dot-show'
  },
  'listenfairplay': {
    accountId: '927984855345',
    bucketName: 'listenfairplay-browse-dot-show'
  },
  'naddpod': {
    accountId: '152849157974',
    bucketName: 'naddpod-browse-dot-show'
  },
  'myfavoritemurder': {
    accountId: '152849157974',
    bucketName: 'myfavoritemurder-browse-dot-show'
  },
  'searchengine': {
    accountId: '927984855345',
    bucketName: 'searchengine-browse-dot-show'
  },
  'lordsoflimited': {
    accountId: '152849157974',
    bucketName: 'lordsoflimited-browse-dot-show'
  }
};

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
  credentials: any,
  bucketName: string
): Promise<{ success: boolean; duration: number; error?: string }> {
  const siteConfig = SITE_ACCOUNT_MAPPINGS[siteId];
  if (!siteConfig) {
    throw new Error(`No account mapping found for site: ${siteId}`);
  }

  const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
  
  // Assume the role to get temporary credentials
  const assumeRoleResult = await execCommand('aws', [
    'sts', 'assume-role',
    '--role-arn', roleArn,
    '--role-session-name', `automation-upload-${siteId}-${Date.now()}`
  ], {
    silent: true,
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: credentials.AWS_REGION
    }
  });
  
  if (assumeRoleResult.exitCode !== 0) {
    throw new Error(`Failed to assume role: ${assumeRoleResult.stderr}`);
  }
  
  const assumeRoleOutput = JSON.parse(assumeRoleResult.stdout);
  const tempCredentials = assumeRoleOutput.Credentials;
  
  // Transform credentials to match the expected format
  const transformedCredentials = {
    AWS_ACCESS_KEY_ID: tempCredentials.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: tempCredentials.SecretAccessKey,
    AWS_SESSION_TOKEN: tempCredentials.SessionToken,
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
  const startTime = Date.now();
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
    const siteConfig = SITE_ACCOUNT_MAPPINGS[site.id];
    if (!siteConfig) {
      throw new Error(`No account mapping found for site: ${site.id}`);
    }

    // Build the client
    logProgress(`  📦 Building client files...`);
    const buildStartTime = Date.now();
    
    // For now, we'll use a placeholder search API URL since we're not getting it from Terraform
    // TODO: Consider if we need the actual search API URL for the build
    const searchApiUrl = `https://${site.id}-search.browse.show`;
    
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

  throw new Error('TODO: This script is not deploying with the correct search URLs - those likely need to be retrieved from Terraform output. Need to fix.')
  
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
    const sitesWithMappings = sitesToUpload.filter((site: Site) => SITE_ACCOUNT_MAPPINGS[site.id]);
    const sitesWithoutMappings = sitesToUpload.filter((site: Site) => !SITE_ACCOUNT_MAPPINGS[site.id]);

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
      const status = result.errors.length === 0 ? '✅' : '❌';
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