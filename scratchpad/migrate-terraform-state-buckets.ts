#!/usr/bin/env tsx

/**
 * One-time migration script to rename Terraform state buckets
 * From: {siteId}-terraform-state
 * To: {siteId}-browse-dot-show-tf-state
 * 
 * This script is only needed for repositories that created Terraform state buckets before 2025-01-08.
 * If you're working with a fresh clone or fork, you likely don't need this script.
 * 
 * This script:
 * 1. Creates new buckets with the new naming pattern
 * 2. Copies all state files and versions from old buckets to new buckets
 * 3. Updates backend configuration files
 * 4. Validates the migration
 * 5. Optionally cleans up old buckets (with confirmation)
 * 
 * IMPORTANT: Run this script after ensuring you have active AWS SSO sessions for both accounts:
 * - aws sso login --profile browse.show-2_admin-permissions-927984855345
 * - aws sso login --profile browse.show-1_admin-permissions-152849157974
 */

// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { execCommand, execCommandOrThrow } from '../scripts/utils/shell-exec.js';
import { printInfo, printError, printSuccess, printWarning, logHeader } from '../scripts/utils/logging.js';

interface SiteInfo {
  siteId: string;
  accountId: string;
  oldBucketName: string;
  newBucketName: string;
  awsProfile: string;
  backendConfigPath: string;
}

interface MigrationResult {
  siteId: string;
  success: boolean;
  error?: string;
  oldBucketExists: boolean;
  newBucketCreated: boolean;
  stateFilesCopied: boolean;
  backendConfigUpdated: boolean;
}

const AWS_PROFILES = {
  '927984855345': 'browse.show-2_admin-permissions-927984855345',
  '152849157974': 'browse.show-1_admin-permissions-152849157974'
};

/**
 * Load site account mappings to determine which sites exist and their AWS accounts
 */
function loadSiteAccountMappings(): Record<string, { accountId: string }> {
  const mappingsPath = resolve(process.cwd(), '.site-account-mappings.json');
  if (!existsSync(mappingsPath)) {
    throw new Error(`Site account mappings file not found: ${mappingsPath}`);
  }
  
  const mappingsContent = readFileSync(mappingsPath, 'utf8');
  return JSON.parse(mappingsContent);
}

/**
 * Check if migration is needed by looking for old bucket naming pattern in backend configs
 */
function isMigrationNeeded(): boolean {
  const mappings = loadSiteAccountMappings();
  
  for (const siteId of Object.keys(mappings)) {
    // Import site discovery to get the correct site directory
    const { getSiteDirectory } = require('../sites/index.js');
    const siteDir = getSiteDirectory(siteId);
    
    if (!siteDir) {
      console.warn(`Site directory not found for ${siteId}, skipping migration check...`);
      continue;
    }
    
    const backendConfigPath = join(siteDir, 'terraform/backend.tfbackend');
    
    if (existsSync(backendConfigPath)) {
      const content = readFileSync(backendConfigPath, 'utf8');
      // Check if using old naming pattern
      if (content.includes(`${siteId}-terraform-state`)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Generate site information for migration
 */
function generateSiteInfo(): SiteInfo[] {
  const mappings = loadSiteAccountMappings();
  const sites: SiteInfo[] = [];
  
  for (const [siteId, siteData] of Object.entries(mappings)) {
    const accountId = siteData.accountId;
    const awsProfile = AWS_PROFILES[accountId as keyof typeof AWS_PROFILES];
    
    if (!awsProfile) {
      printWarning(`⚠️  No AWS profile mapping found for account ${accountId} (site: ${siteId}). Skipping.`);
      continue;
    }
    
    const oldBucketName = `${siteId}-terraform-state`;
    const newBucketName = `${siteId}-browse-dot-show-tf-state`;
    
    // Import site discovery to get the correct site directory
    const { getSiteDirectory } = require('../sites/index.js');
    const siteDir = getSiteDirectory(siteId);
    
    if (!siteDir) {
      printWarning(`⚠️  Site directory not found for ${siteId}. Skipping.`);
      continue;
    }
    
    const backendConfigPath = join(siteDir, 'terraform/backend.tfbackend');
    
    sites.push({
      siteId,
      accountId,
      oldBucketName,
      newBucketName,
      awsProfile,
      backendConfigPath
    });
  }
  
  return sites;
}

/**
 * Check if an S3 bucket exists
 */
async function bucketExists(bucketName: string, awsProfile: string): Promise<boolean> {
  try {
    const result = await execCommand('aws', [
      's3api', 'head-bucket',
      '--bucket', bucketName,
      '--profile', awsProfile
    ]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Create a new S3 bucket with proper configuration
 */
async function createBucket(bucketName: string, awsProfile: string): Promise<void> {
  printInfo(`Creating bucket: ${bucketName}`);
  
  // Create bucket
  await execCommandOrThrow('aws', [
    's3api', 'create-bucket',
    '--bucket', bucketName,
    '--region', 'us-east-1',
    '--profile', awsProfile
  ]);
  
  // Enable versioning
  await execCommandOrThrow('aws', [
    's3api', 'put-bucket-versioning',
    '--bucket', bucketName,
    '--versioning-configuration', 'Status=Enabled',
    '--profile', awsProfile
  ]);
  
  // Enable encryption
  await execCommandOrThrow('aws', [
    's3api', 'put-bucket-encryption',
    '--bucket', bucketName,
    '--server-side-encryption-configuration',
    'Rules=[{ApplyServerSideEncryptionByDefault={SSEAlgorithm=AES256}}]',
    '--profile', awsProfile
  ]);
  
  // Block public access
  await execCommandOrThrow('aws', [
    's3api', 'put-public-access-block',
    '--bucket', bucketName,
    '--public-access-block-configuration',
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true',
    '--profile', awsProfile
  ]);
  
  printSuccess(`✅ Bucket ${bucketName} created successfully`);
}

/**
 * Copy all objects from old bucket to new bucket
 */
async function copyBucketContents(oldBucket: string, newBucket: string, awsProfile: string): Promise<void> {
  printInfo(`Copying contents from ${oldBucket} to ${newBucket}`);
  
  // First check if old bucket has any objects
  const listResult = await execCommand('aws', [
    's3api', 'list-objects-v2',
    '--bucket', oldBucket,
    '--profile', awsProfile
  ]);
  
  if (listResult.exitCode !== 0) {
    printWarning(`Could not list objects in ${oldBucket}. It might be empty or inaccessible.`);
    return;
  }
  
  const listOutput = JSON.parse(listResult.stdout || '{}');
  if (!listOutput.Contents || listOutput.Contents.length === 0) {
    printInfo(`Bucket ${oldBucket} is empty. Nothing to copy.`);
    return;
  }
  
  // Use AWS S3 sync to copy all objects including versions
  await execCommandOrThrow('aws', [
    's3', 'sync',
    `s3://${oldBucket}`,
    `s3://${newBucket}`,
    '--profile', awsProfile
  ]);
  
  printSuccess(`✅ Copied all contents from ${oldBucket} to ${newBucket}`);
}

/**
 * Update backend configuration file to use new bucket name
 */
async function updateBackendConfig(siteInfo: SiteInfo): Promise<void> {
  const { backendConfigPath, newBucketName } = siteInfo;
  
  if (!existsSync(backendConfigPath)) {
    throw new Error(`Backend config file not found: ${backendConfigPath}`);
  }
  
  const currentContent = readFileSync(backendConfigPath, 'utf8');
  const updatedContent = currentContent.replace(
    /bucket = "[^"]*"/,
    `bucket = "${newBucketName}"`
  );
  
  if (currentContent === updatedContent) {
    printWarning(`No changes needed for ${backendConfigPath} - already using correct bucket name`);
    return;
  }
  
  writeFileSync(backendConfigPath, updatedContent);
  printSuccess(`✅ Updated backend config: ${backendConfigPath}`);
}

/**
 * Migrate a single site's Terraform state bucket
 */
async function migrateSite(siteInfo: SiteInfo): Promise<MigrationResult> {
  const { siteId, oldBucketName, newBucketName, awsProfile } = siteInfo;
  
  printInfo(`\n🚀 Migrating site: ${siteId}`);
  printInfo(`   Old bucket: ${oldBucketName}`);
  printInfo(`   New bucket: ${newBucketName}`);
  printInfo(`   AWS Profile: ${awsProfile}`);
  
  const result: MigrationResult = {
    siteId,
    success: false,
    oldBucketExists: false,
    newBucketCreated: false,
    stateFilesCopied: false,
    backendConfigUpdated: false
  };
  
  try {
    // Check if old bucket exists
    result.oldBucketExists = await bucketExists(oldBucketName, awsProfile);
    if (!result.oldBucketExists) {
      printWarning(`⚠️  Old bucket ${oldBucketName} does not exist. This site may not have been deployed yet.`);
      // Still update backend config for consistency
      await updateBackendConfig(siteInfo);
      result.backendConfigUpdated = true;
      result.success = true;
      return result;
    }
    
    // Check if new bucket already exists
    const newBucketExists = await bucketExists(newBucketName, awsProfile);
    if (newBucketExists) {
      printWarning(`⚠️  New bucket ${newBucketName} already exists. Skipping bucket creation.`);
    } else {
      // Create new bucket
      await createBucket(newBucketName, awsProfile);
      result.newBucketCreated = true;
    }
    
    // Copy contents
    await copyBucketContents(oldBucketName, newBucketName, awsProfile);
    result.stateFilesCopied = true;
    
    // Update backend config
    await updateBackendConfig(siteInfo);
    result.backendConfigUpdated = true;
    
    result.success = true;
    printSuccess(`✅ Successfully migrated ${siteId}`);
    
  } catch (error: any) {
    result.error = error.message;
    printError(`❌ Failed to migrate ${siteId}: ${error.message}`);
  }
  
  return result;
}

/**
 * Validate migration by checking Terraform state in new buckets
 */
async function validateMigration(siteInfo: SiteInfo): Promise<boolean> {
  const { siteId, newBucketName, awsProfile } = siteInfo;
  
  try {
    // Check if terraform.tfstate exists in new bucket
    const result = await execCommand('aws', [
      's3api', 'head-object',
      '--bucket', newBucketName,
      '--key', 'terraform.tfstate',
      '--profile', awsProfile
    ]);
    
    if (result.exitCode === 0) {
      printSuccess(`✅ Terraform state found in new bucket for ${siteId}`);
      return true;
    } else {
      printWarning(`⚠️  No terraform state found in new bucket for ${siteId} (this might be expected if site wasn't deployed yet)`);
      return true; // This is actually OK for sites that haven't been deployed
    }
  } catch (error: any) {
    printError(`❌ Validation failed for ${siteId}: ${error.message}`);
    return false;
  }
}

/**
 * Clean up old buckets (with confirmation)
 */
async function cleanupOldBuckets(results: MigrationResult[], skipPrompts: boolean = false): Promise<void> {
  const sitesToCleanup = results.filter(r => r.success && r.oldBucketExists);
  
  if (sitesToCleanup.length === 0) {
    printInfo('No old buckets to clean up.');
    return;
  }
  
  console.log('\n📋 Old buckets that can be cleaned up:');
  sitesToCleanup.forEach(result => {
    const siteInfo = generateSiteInfo().find(s => s.siteId === result.siteId)!;
    console.log(`   - ${siteInfo.oldBucketName} (${result.siteId})`);
  });
  
  if (!skipPrompts) {
    console.log('\n⚠️  WARNING: This will permanently delete the old Terraform state buckets!');
    console.log('   Make sure the migration was successful and you have tested the new setup.');
    
    const response = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Do you want to delete the old buckets?',
      initial: false
    });
    
    if (!response.confirmed) {
      printInfo('Cleanup cancelled. Old buckets will remain for now.');
      return;
    }
  }
  
  for (const result of sitesToCleanup) {
    const siteInfo = generateSiteInfo().find(s => s.siteId === result.siteId)!;
    try {
      printInfo(`Deleting old bucket: ${siteInfo.oldBucketName}`);
      
      // Step 1: Check what's in the bucket
      printInfo(`  Checking bucket contents...`);
      const listResult = await execCommand('aws', [
        's3api', 'list-object-versions',
        '--bucket', siteInfo.oldBucketName,
        '--profile', siteInfo.awsProfile
      ]);
      
      if (listResult.exitCode === 0) {
        const versionData = JSON.parse(listResult.stdout || '{}');
        const versions = versionData.Versions || [];
        const deleteMarkers = versionData.DeleteMarkers || [];
        printInfo(`  Found ${versions.length} object versions and ${deleteMarkers.length} delete markers`);
        
        if (versions.length > 0 || deleteMarkers.length > 0) {
          // Step 2: Delete all object versions
          if (versions.length > 0) {
            printInfo(`  Deleting ${versions.length} object versions...`);
            const deleteObjects = versions.map((v: any) => ({ Key: v.Key, VersionId: v.VersionId }));
            const deletePayload = JSON.stringify({ Objects: deleteObjects });
            
            const { writeFile, mkdtemp } = await import('fs/promises');
            const { join } = await import('path');
            const { tmpdir } = await import('os');
            
            const tempDir = await mkdtemp(join(tmpdir(), 'aws-delete-'));
            const deleteFile = join(tempDir, 'delete.json');
            await writeFile(deleteFile, deletePayload);
            
            await execCommandOrThrow('aws', [
              's3api', 'delete-objects',
              '--bucket', siteInfo.oldBucketName,
              '--delete', `file://${deleteFile}`,
              '--profile', siteInfo.awsProfile
            ]);
          }
          
          // Step 3: Delete all delete markers
          if (deleteMarkers.length > 0) {
            printInfo(`  Deleting ${deleteMarkers.length} delete markers...`);
            const deleteMarkerObjects = deleteMarkers.map((dm: any) => ({ Key: dm.Key, VersionId: dm.VersionId }));
            const deleteMarkerPayload = JSON.stringify({ Objects: deleteMarkerObjects });
            
            const { writeFile, mkdtemp } = await import('fs/promises');
            const { join } = await import('path');
            const { tmpdir } = await import('os');
            
            const tempDir = await mkdtemp(join(tmpdir(), 'aws-delete-markers-'));
            const deleteMarkersFile = join(tempDir, 'delete-markers.json');
            await writeFile(deleteMarkersFile, deleteMarkerPayload);
            
            await execCommandOrThrow('aws', [
              's3api', 'delete-objects',
              '--bucket', siteInfo.oldBucketName,
              '--delete', `file://${deleteMarkersFile}`,
              '--profile', siteInfo.awsProfile
            ]);
          }
        }
      } else {
        printWarning(`  Could not list bucket contents, trying direct deletion...`);
      }
      
      // Step 4: Delete any remaining current objects
      printInfo(`  Deleting any remaining current objects...`);
      await execCommand('aws', [
        's3', 'rm',
        `s3://${siteInfo.oldBucketName}`,
        '--recursive',
        '--profile', siteInfo.awsProfile
      ]);
      
      // Step 5: Finally delete the bucket
      printInfo(`  Deleting empty bucket...`);
      await execCommandOrThrow('aws', [
        's3api', 'delete-bucket',
        '--bucket', siteInfo.oldBucketName,
        '--profile', siteInfo.awsProfile
      ]);
      
      printSuccess(`✅ Deleted old bucket: ${siteInfo.oldBucketName}`);
    } catch (error: any) {
      printError(`❌ Failed to delete ${siteInfo.oldBucketName}: ${error.message}`);
    }
  }
}

/**
 * Display migration summary
 */
function displaySummary(results: MigrationResult[]): void {
  console.log('\n' + '='.repeat(80));
  logHeader('Migration Summary');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful migrations: ${successful.length}`);
  console.log(`❌ Failed migrations: ${failed.length}`);
  console.log(`📊 Total sites processed: ${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n✅ Successfully migrated sites:');
    successful.forEach(result => {
      console.log(`   - ${result.siteId}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed migrations:');
    failed.forEach(result => {
      console.log(`   - ${result.siteId}: ${result.error}`);
    });
  }
  
  console.log('\n📋 Next steps:');
  console.log('1. Test deployment of 1-2 existing sites to ensure they work');
  console.log('2. Deploy the eggplant site (the new one that couldn\'t deploy before)');
  console.log('3. If everything works, run this script again with --cleanup to delete old buckets');
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isCleanupMode = args.includes('--cleanup');
  const skipPrompts = args.includes('--yes');
  
  try {
    if (isCleanupMode) {
      logHeader('Terraform State Bucket Cleanup');
      const siteInfos = generateSiteInfo();
      const results: MigrationResult[] = siteInfos.map(site => ({
        siteId: site.siteId,
        success: true, // Assume all were successful for cleanup
        oldBucketExists: true,
        newBucketCreated: true,
        stateFilesCopied: true,
        backendConfigUpdated: true
      }));
      await cleanupOldBuckets(results, skipPrompts);
      return;
    }
    
    logHeader('Terraform State Bucket Migration');
    printInfo('Migrating from: {siteId}-terraform-state');
    printInfo('Migrating to:   {siteId}-browse-dot-show-tf-state');
    
    // Check if migration is needed
    if (!isMigrationNeeded()) {
      printSuccess('✅ No migration needed!');
      printInfo('All backend configurations are already using the new bucket naming pattern.');
      printInfo('This migration script is only needed for repositories that created');
      printInfo('Terraform state buckets before 2025-01-08.');
      return;
    }
    
    // Generate site information
    const siteInfos = generateSiteInfo();
    printInfo(`\n📊 Found ${siteInfos.length} sites to migrate`);
    
    // Show site list
    console.log('\n📋 Sites to migrate:');
    siteInfos.forEach(site => {
      console.log(`   - ${site.siteId} (Account: ${site.accountId})`);
    });
    
    if (!skipPrompts) {
      console.log('\n⚠️  IMPORTANT: Make sure you have active AWS SSO sessions for both accounts:');
      console.log('   - aws sso login --profile browse.show-2_admin-permissions-927984855345');
      console.log('   - aws sso login --profile browse.show-1_admin-permissions-152849157974');
      
      const response = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: 'Do you want to proceed with the migration?',
        initial: false
      });
      
      if (!response.confirmed) {
        printInfo('Migration cancelled.');
        return;
      }
    }
    
    // Migrate each site
    const results: MigrationResult[] = [];
    for (const siteInfo of siteInfos) {
      const result = await migrateSite(siteInfo);
      results.push(result);
      
      // Add a small delay between migrations to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Validate migrations
    console.log('\n🔍 Validating migrations...');
    for (const siteInfo of siteInfos) {
      await validateMigration(siteInfo);
    }
    
    // Display summary
    displaySummary(results);
    
  } catch (error: any) {
    printError(`Migration failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nMigration cancelled...');
  process.exit(0);
});

main();