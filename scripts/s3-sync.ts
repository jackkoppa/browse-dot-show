#!/usr/bin/env tsx

const prompts = require('prompts');
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Types for our operations
type SyncDirection = 'local-to-s3' | 's3-to-local';
type ConflictResolution = 'overwrite-always' | 'overwrite-if-newer' | 'skip-existing';

interface SyncStats {
  audio: { synced: number; skipped: number; overwritten: number };
  transcripts: { synced: number; skipped: number; overwritten: number };
  'episode-manifest': { synced: number; skipped: number; overwritten: number };
  rss: { synced: number; skipped: number; overwritten: number };
  'search-entries': { synced: number; skipped: number; overwritten: number };
  'search-index': { synced: number; skipped: number; overwritten: number };
}

interface SyncOptions {
  siteId: string;
  direction: SyncDirection;
  conflictResolution: ConflictResolution;
  localBasePath: string;
  s3BucketName: string;
  awsProfile?: string;
}

// AWS CLI authentication check
async function checkAWSAuth(profile?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ['sts', 'get-caller-identity'];
    if (profile) {
      args.push('--profile', profile);
    }
    
    const stsCmd = spawn('aws', args, { stdio: 'pipe' });
    stsCmd.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

// Get file count for a directory (including subdirectories)
async function getFileCount(dirPath: string): Promise<number> {
  return new Promise((resolve) => {
    if (!fs.existsSync(dirPath)) {
      resolve(0);
      return;
    }

    const findCmd = spawn('find', [dirPath, '-type', 'f'], { stdio: 'pipe' });
    let count = 0;
    
    findCmd.stdout.on('data', (data) => {
      count += data.toString().split('\n').filter((line: string) => line.trim()).length;
    });
    
    findCmd.on('close', () => {
      resolve(count);
    });
  });
}

// Execute AWS S3 sync command
async function executeS3Sync(
  source: string,
  destination: string,
  options: SyncOptions,
  folder: string
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const args = ['s3', 'sync', source, destination];
    
    // Add conflict resolution flags
    if (options.conflictResolution === 'overwrite-always') {
      args.push('--delete');
    } else if (options.conflictResolution === 'skip-existing') {
      args.push('--size-only');
    }
    // For 'overwrite-if-newer', AWS CLI default behavior handles this
    
    // Add AWS profile if specified
    if (options.awsProfile) {
      args.push('--profile', options.awsProfile);
    }
    
    // Exclude system files
    args.push('--exclude', '.DS_Store');
    
    // Add verbosity for better tracking
    args.push('--cli-read-timeout', '0', '--cli-connect-timeout', '60');
    
    console.log(`📁 Syncing ${folder}: ${source} → ${destination}`);
    console.log(`   Command: aws ${args.join(' ')}`);
    
    const syncCmd = spawn('aws', args, { stdio: 'pipe' });
    let output = '';
    let errorOutput = '';
    
    syncCmd.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Show progress for large files
      if (text.includes('upload:') || text.includes('download:')) {
        console.log(`   ${text.trim()}`);
      }
    });
    
    syncCmd.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    syncCmd.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${folder} sync completed`);
        resolve({ success: true, output });
      } else {
        console.log(`❌ ${folder} sync failed:`);
        console.log(errorOutput);
        resolve({ success: false, output: errorOutput });
      }
    });
  });
}

// Parse sync output to extract statistics
function parseSyncOutput(output: string): { synced: number; skipped: number; overwritten: number } {
  const lines: string[] = output.split('\n');
  let synced = 0;
  let skipped = 0;
  let overwritten = 0;
  
  for (const line of lines) {
    if (line.includes('upload:') || line.includes('download:')) {
      synced++;
    }
    // AWS CLI doesn't explicitly report skipped files, so we'll estimate
    // based on the absence of upload/download messages for expected files
  }
  
  return { synced, skipped, overwritten };
}

// Sync a specific folder
async function syncFolder(
  folder: string,
  options: SyncOptions
): Promise<{ synced: number; skipped: number; overwritten: number }> {
  const localPath = path.join(options.localBasePath, folder);
  const s3Path = `s3://${options.s3BucketName}/${folder}`;
  
  // Determine source and destination based on sync direction
  const { source, destination } = options.direction === 'local-to-s3' 
    ? { source: localPath + '/', destination: s3Path + '/' }
    : { source: s3Path + '/', destination: localPath + '/' };
  
  // Ensure local directory exists for s3-to-local sync
  if (options.direction === 's3-to-local' && !fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }
  
  const result = await executeS3Sync(source, destination, options, folder);
  
  if (!result.success) {
    console.log(`⚠️  Failed to sync ${folder}, continuing with other folders...`);
    return { synced: 0, skipped: 0, overwritten: 0 };
  }
  
  return parseSyncOutput(result.output);
}

// Main sync function
async function performSync(options: SyncOptions, foldersToSync: string[]): Promise<SyncStats> {
  
  const stats: SyncStats = {
    audio: { synced: 0, skipped: 0, overwritten: 0 },
    transcripts: { synced: 0, skipped: 0, overwritten: 0 },
    'episode-manifest': { synced: 0, skipped: 0, overwritten: 0 },
    rss: { synced: 0, skipped: 0, overwritten: 0 },
    'search-entries': { synced: 0, skipped: 0, overwritten: 0 },
    'search-index': { synced: 0, skipped: 0, overwritten: 0 }
  };
  
  console.log('🔄 Starting sync operation...');
  console.log(`   Site: ${options.siteId}`);
  console.log(`   Direction: ${options.direction}`);
  console.log(`   Conflict resolution: ${options.conflictResolution}`);
  console.log('');
  
  for (const folder of foldersToSync) {
    try {
      const folderStats = await syncFolder(folder, options);
      stats[folder as keyof SyncStats] = folderStats;
    } catch (error) {
      console.log(`❌ Error syncing ${folder}:`, error);
      // Continue with other folders
    }
  }
  
  return stats;
}

// Display final statistics
function displaySyncStats(stats: SyncStats, direction: SyncDirection) {
  console.log('\n📊 Sync Summary:');
  console.log('================');
  
  let totalSynced = 0;
  let totalSkipped = 0;
  let totalOverwritten = 0;
  
  Object.entries(stats).forEach(([folder, folderStats]) => {
    if (folderStats.synced > 0 || folderStats.skipped > 0 || folderStats.overwritten > 0) {
      console.log(`\n📁 ${folder}:`);
      console.log(`   ✅ Synced: ${folderStats.synced}`);
      if (folderStats.skipped > 0) {
        console.log(`   ⏭️  Skipped: ${folderStats.skipped}`);
      }
      if (folderStats.overwritten > 0) {
        console.log(`   🔄 Overwritten: ${folderStats.overwritten}`);
      }
    }
    
    totalSynced += folderStats.synced;
    totalSkipped += folderStats.skipped;
    totalOverwritten += folderStats.overwritten;
  });
  
  console.log('\n🎯 Total Results:');
  console.log(`   ✅ Files synced: ${totalSynced}`);
  if (totalSkipped > 0) {
    console.log(`   ⏭️  Files skipped: ${totalSkipped}`);
  }
  if (totalOverwritten > 0) {
    console.log(`   🔄 Files overwritten: ${totalOverwritten}`);
  }
  
  const directionText = direction === 'local-to-s3' ? 'local → S3' : 'S3 → local';
  console.log(`\n🚀 Sync operation (${directionText}) completed!`);
}

async function main() {
  try {
    console.log('🌐 S3 Sync Utility');
    console.log('==================\n');
    
    // Get the site ID from environment (set by run-with-site-selection.js)
    const siteId = process.env.CURRENT_SITE_ID || process.env.SELECTED_SITE_ID;
    
    if (!siteId) {
      console.error('❌ No site ID found. This script should be run via package.json script.');
      console.error('   Try: pnpm s3:sync');
      process.exit(1);
    }
    
    console.log(`📍 Selected site: ${siteId}`);
    
    // Check AWS CLI authentication
    const awsProfile = process.env.AWS_PROFILE;
    console.log('\n🔐 Checking AWS authentication...');
    
    const isAuthenticated = await checkAWSAuth(awsProfile);
    // CURSOR-TODO: Move all checks like this to a shared function somewhere
    if (!isAuthenticated) {
      console.error('❌ AWS authentication failed.');
      console.error('   Please ensure you are logged in with AWS SSO:');
      if (awsProfile) {
        console.error(`   aws sso login --profile ${awsProfile}`);
      } else {
        console.error('   aws sso login');
      }
      process.exit(1);
    }
    
    console.log('✅ AWS authentication verified');
    
    // Prompt for sync direction
    const directionResponse = await prompts({
      type: 'select',
      name: 'direction',
      message: 'Select sync direction:',
      choices: [
        { title: 'Local assets → S3 bucket', value: 'local-to-s3' },
        { title: 'S3 bucket → Local assets', value: 's3-to-local' }
      ],
      initial: 0
    });
    
    if (!directionResponse.direction) {
      console.log('Sync cancelled.');
      process.exit(0);
    }
    
    // Prompt for conflict resolution strategy
    const conflictResponse = await prompts({
      type: 'select',
      name: 'conflictResolution',
      message: 'How should conflicts be handled when the same file exists in both places?',
      choices: [
        { title: 'Do nothing - leave destination file as-is (default)', value: 'skip-existing' },
        { title: 'Overwrite destination if source is newer', value: 'overwrite-if-newer' },
        { title: 'Always overwrite destination with source', value: 'overwrite-always' }
      ],
      initial: 0
    });
    
    if (conflictResponse.conflictResolution === undefined) {
      console.log('Sync cancelled.');
      process.exit(0);
    }
    
    // Prompt for sync scope (entire bucket vs specific directories)
    const scopeResponse = await prompts({
      type: 'select',
      name: 'scope',
      message: 'What would you like to sync?',
      choices: [
        { title: 'Entire bucket (all directories)', value: 'entire-bucket' },
        { title: 'Select specific directories only', value: 'specific-directories' }
      ],
      initial: 0
    });
    
    if (scopeResponse.scope === undefined) {
      console.log('Sync cancelled.');
      process.exit(0);
    }
    
    // Determine which folders to sync
    const allFolders = [
      'audio',
      'transcripts', 
      'episode-manifest',
      'rss',
      'search-entries',
      'search-index'
    ];
    
    let foldersToSync = allFolders;
    
    if (scopeResponse.scope === 'specific-directories') {
      const directoryResponse = await prompts({
        type: 'multiselect',
        name: 'directories',
        message: 'Select directories to sync:',
        choices: allFolders.map(folder => ({
          title: folder,
          value: folder,
          selected: false
        })),
        min: 1
      });
      
      if (!directoryResponse.directories || directoryResponse.directories.length === 0) {
        console.log('No directories selected. Sync cancelled.');
        process.exit(0);
      }
      
      foldersToSync = directoryResponse.directories;
      console.log(`\n📁 Selected directories: ${foldersToSync.join(', ')}`);
    }
    
    // Set up paths and options
    const localBasePath = path.resolve(__dirname, '..', 'aws-local-dev', 's3', 'sites', siteId);
    const s3BucketName = `${siteId}-browse-dot-show`;
    
    const syncOptions: SyncOptions = {
      siteId,
      direction: directionResponse.direction,
      conflictResolution: conflictResponse.conflictResolution,
      localBasePath,
      s3BucketName,
      awsProfile
    };
    
    // Verify local directory exists
    if (!fs.existsSync(localBasePath)) {
      console.log(`\n📁 Creating local directory: ${localBasePath}`);
      fs.mkdirSync(localBasePath, { recursive: true });
    }
    
    console.log(`\n📂 Local path: ${localBasePath}`);
    console.log(`🪣 S3 bucket: s3://${s3BucketName}`);
    
    // Perform the sync
    const stats = await performSync(syncOptions, foldersToSync);
    
    // Display results
    displaySyncStats(stats, directionResponse.direction);
    
  } catch (error) {
    console.error('\n❌ Error during sync operation:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Sync operation cancelled by user');
  process.exit(0);
});

main().catch(console.error); 