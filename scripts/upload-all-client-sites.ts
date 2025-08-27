#!/usr/bin/env tsx

/**
 * Deploy All Sites Script - Automated Client Deployment
 * 
 * This script deploys client files for all sites using automation credentials.
 * It follows the same authentication pattern as the ingestion pipeline.
 * 
 * Usage: tsx scripts/deploy-all-sites.ts [OPTIONS]
 */

import { discoverSites, Site } from './utils/site-selector.js';
import { loadAutomationCredentials } from './utils/automation-credentials.js';
import { getSiteAccountMapping } from './utils/site-account-mappings.js';
import { execCommand } from './utils/shell-exec.js';
import { logInfo, logSuccess, logError, } from './utils/logging.js';
import { 
  buildClientForSite, 
  uploadClientToS3WithCredentials, 
  invalidateCloudFrontWithCredentials, 
  getTerraformOutputsWithCredentials,
  TerraformOutputs 
} from './utils/client-deployment.js';

// Site account mappings moved to centralized location
// TODO: Add pickleballstudio mapping when it's deployed for the first time

interface SiteDeployResult {
  siteId: string;
  siteTitle: string;
  buildSuccess: boolean;
  buildDuration: number;
  uploadSuccess: boolean;
  uploadDuration: number;
  cloudfrontInvalidationSuccess: boolean;
  cloudfrontInvalidationDuration: number;
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
🚀 Deploy All Sites - Automated Client Deployment

USAGE:
  tsx scripts/deploy-all-sites.ts [OPTIONS]

OPTIONS:
  --help                    Show this help message
  --sites=site1,site2       Deploy only specific sites (comma-separated)
  --dry-run                 Show what would be done without executing

EXAMPLES:
  # Deploy all sites
  tsx scripts/deploy-all-sites.ts
  
  # Deploy only specific sites
  tsx scripts/deploy-all-sites.ts --sites=hardfork,naddpod
  
  # Dry run to see what would happen
  tsx scripts/deploy-all-sites.ts --dry-run

This script uses automation credentials from .env.automation to deploy client files
for all sites to their respective S3 buckets and invalidate CloudFront caches.
`);
}



/**
 * Get terraform outputs for a site using automation credentials
 */
async function getTerraformOutputsForSite(
  siteId: string, 
  credentials: any
): Promise<TerraformOutputs> {
  const siteConfig = getSiteAccountMapping(siteId);

  const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
  
  // Assume the role to get temporary credentials
  const assumeRoleResult = await execCommand('aws', [
    'sts', 'assume-role',
    '--role-arn', roleArn,
    '--role-session-name', `automation-deploy-${siteId}-${Date.now()}`
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
  
  return await getTerraformOutputsWithCredentials(tempCredentials, { silent: true });
}

/**
 * Upload client files to S3 for a site using automation credentials
 */
async function uploadClientToS3(
  siteId: string,
  credentials: any,
  terraformOutputs: TerraformOutputs
): Promise<{ success: boolean; duration: number; error?: string }> {
  const siteConfig = getSiteAccountMapping(siteId);
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
  
  return await uploadClientToS3WithCredentials(siteId, terraformOutputs.bucketName, tempCredentials, { silent: true });
}

/**
 * Invalidate CloudFront cache for a site using automation credentials
 */
async function invalidateCloudFront(
  siteId: string,
  credentials: any,
  cloudfrontId: string
): Promise<{ success: boolean; duration: number; error?: string }> {
  const siteConfig = getSiteAccountMapping(siteId);
  if (!siteConfig) {
    throw new Error(`No account mapping found for site: ${siteId}`);
  }

  const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
  
  // Assume the role to get temporary credentials
  const assumeRoleResult = await execCommand('aws', [
    'sts', 'assume-role',
    '--role-arn', roleArn,
    '--role-session-name', `automation-invalidate-${siteId}-${Date.now()}`
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
  
  return await invalidateCloudFrontWithCredentials(cloudfrontId, tempCredentials, { silent: true });
}

/**
 * Deploy a single site
 */
async function deploySite(
  site: Site,
  credentials: any
): Promise<SiteDeployResult> {
  const result: SiteDeployResult = {
    siteId: site.id,
    siteTitle: site.title,
    buildSuccess: false,
    buildDuration: 0,
    uploadSuccess: false,
    uploadDuration: 0,
    cloudfrontInvalidationSuccess: false,
    cloudfrontInvalidationDuration: 0,
    errors: []
  };

  try {
    // Step 1: Get terraform outputs
    const terraformOutputs = await getTerraformOutputsForSite(site.id, credentials);

    // Step 2: Build client
    const buildResult = await buildClientForSite(site.id, terraformOutputs.searchApiUrl, { silent: true });
    result.buildSuccess = buildResult.success;
    result.buildDuration = buildResult.duration;
    
    if (!buildResult.success) {
      result.errors.push(`Build failed: ${buildResult.error}`);
      return result;
    }

    // Step 3: Upload to S3
    const uploadResult = await uploadClientToS3(site.id, credentials, terraformOutputs);
    result.uploadSuccess = uploadResult.success;
    result.uploadDuration = uploadResult.duration;
    
    if (!uploadResult.success) {
      result.errors.push(`Upload failed: ${uploadResult.error}`);
      return result;
    }

    // Step 4: Invalidate CloudFront
    const invalidationResult = await invalidateCloudFront(site.id, credentials, terraformOutputs.cloudfrontId);
    result.cloudfrontInvalidationSuccess = invalidationResult.success;
    result.cloudfrontInvalidationDuration = invalidationResult.duration;
    
    if (!invalidationResult.success) {
      result.errors.push(`CloudFront invalidation failed: ${invalidationResult.error}`);
    }

    logSuccess(`✅ Deployment completed for ${site.id} (${site.title})`);
    logInfo(`   Site URL: https://${terraformOutputs.cloudfrontDomain}`);

  } catch (error: any) {
    result.errors.push(`Unexpected error: ${error.message}`);
    logError(`❌ Deployment failed for ${site.id}: ${error.message}`);
  }

  return result;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🚀 Deploy All Sites - Automated Client Deployment');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  
  // Parse command line arguments
  const config = parseArguments();
  
  // Handle help flag
  if (config.help) {
    displayHelp();
    process.exit(0);
  }
  
  // Load automation credentials
  const credentials = loadAutomationCredentials();
  
  // Discover all available sites
  const allSites = discoverSites();
  
  if (allSites.length === 0) {
    console.error('❌ No sites found! Please create a site in /sites/my-sites/');
    process.exit(1);
  }
  
  // Filter sites based on configuration
  let sites = allSites;
  if (config.selectedSites && config.selectedSites.length > 0) {
    sites = allSites.filter(site => config.selectedSites!.includes(site.id));
    
    if (sites.length === 0) {
      console.error(`❌ No matching sites found for: ${config.selectedSites.join(', ')}`);
      console.error(`Available sites: ${allSites.map(s => s.id).join(', ')}`);
      process.exit(1);
    }
    
    console.log(`\n🎯 Running for selected sites only: ${config.selectedSites.join(', ')}`);
  }
  
  console.log(`\n📍 Found ${sites.length} site(s) to deploy:`);
  sites.forEach((site: Site) => {
    console.log(`   - ${site.id} (${site.title})`);
  });
  
  if (config.dryRun) {
    console.log('\n🔍 DRY RUN MODE: This is a preview of what would happen');
    console.log('   No actual deployments will be performed\n');
    process.exit(0);
  }
  
  const results: SiteDeployResult[] = [];
  const overallStartTime = Date.now();
  
  // Deploy each site
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Deploying ${site.id} (${site.title}) - ${i + 1}/${sites.length}`);
    console.log(`${'='.repeat(60)}`);
    
    const result = await deploySite(site, credentials);
    results.push(result);
  }
  
  // Generate final summary
  const overallDuration = Date.now() - overallStartTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Final Summary');
  console.log('='.repeat(60));
  
  console.log(`\n⏱️  Overall Duration: ${(overallDuration / 1000).toFixed(1)}s (${(overallDuration / 1000 / 60).toFixed(1)} minutes)`);
  console.log(`🕐 Completed at: ${new Date().toISOString()}`);
  
  console.log('\n📈 Per-Site Results:');
  results.forEach(result => {
    const buildStatus = result.buildSuccess ? '✅' : '❌';
    const uploadStatus = result.uploadSuccess ? '✅' : '❌';
    const invalidationStatus = result.cloudfrontInvalidationSuccess ? '✅' : '❌';
    const totalDuration = result.buildDuration + result.uploadDuration + result.cloudfrontInvalidationDuration;
    
    console.log(`\n   ${result.siteId} (${result.siteTitle}):`);
    console.log(`      Build: ${buildStatus} (${(result.buildDuration / 1000).toFixed(1)}s)`);
    console.log(`      Upload: ${uploadStatus} (${(result.uploadDuration / 1000).toFixed(1)}s)`);
    console.log(`      CloudFront Invalidation: ${invalidationStatus} (${(result.cloudfrontInvalidationDuration / 1000).toFixed(1)}s)`);
    console.log(`      Total: ${(totalDuration / 1000).toFixed(1)}s`);
    
    if (result.errors.length > 0) {
      console.log(`      Errors: ${result.errors.join(', ')}`);
    }
  });
  
  // Overall statistics
  const successfulBuilds = results.filter(r => r.buildSuccess).length;
  const successfulUploads = results.filter(r => r.uploadSuccess).length;
  const successfulInvalidations = results.filter(r => r.cloudfrontInvalidationSuccess).length;
  const sitesWithErrors = results.filter(r => r.errors.length > 0).length;
  
  console.log('\n📊 Overall Statistics:');
  console.log(`   Sites processed: ${results.length}`);
  console.log(`   Build success rate: ${successfulBuilds}/${results.length} (${((successfulBuilds / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Upload success rate: ${successfulUploads}/${results.length} (${((successfulUploads / results.length) * 100).toFixed(1)}%)`);
  console.log(`   CloudFront invalidation success rate: ${successfulInvalidations}/${results.length} (${((successfulInvalidations / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Sites with errors: ${sitesWithErrors}`);
  
  // Exit with appropriate code
  if (sitesWithErrors > 0) {
    console.log('\n⚠️  Some deployments failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All deployments completed successfully!');
    console.log('🔄 All sites are now deployed and updated');
    process.exit(0);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Operation cancelled by user');
  process.exit(130);
});

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
}); 