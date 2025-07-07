#!/usr/bin/env tsx

/**
 * Scheduled Automation Script - Phase 3.1-3.6 + Phase 4 Improvements
 * 
 * This script is designed to run automatically and:
 * 0. Pre-sync all S3 content to local storage (NEW - Phase 4.1)
 * 1. Load automation credentials from .env.automation
 * 2. Run local ingestion for all 6 sites (RSS retrieval + audio processing)
 * 3. Detect which sites have new SRT files and sync comprehensive changes to S3 (ENHANCED - Phase 4.3)
 * 4. Trigger cloud indexing lambdas for sites with S3 uploads using automation role (ENHANCED - Phase 4.4)
 * 
 * Usage: tsx scripts/scheduled-run-ingestion-and-trigger-indexing.ts [--sites=site1,site2]
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { discoverSites, loadSiteEnvVars, Site } from './utils/site-selector.js';
import { execCommand } from './utils/shell-exec.js';
import { logInfo, logSuccess, logError, logWarning, logProgress, logHeader, logDebug } from './utils/logging.js';
import { generateSyncConsistencyReport, displaySyncConsistencyReport } from './utils/sync-consistency-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse command line arguments
 */
function parseArguments(): { selectedSites?: string[] } {
  const args = process.argv.slice(2);
  const result: { selectedSites?: string[] } = {};
  
  for (const arg of args) {
    if (arg.startsWith('--sites=')) {
      const sitesArg = arg.split('=')[1];
      if (sitesArg) {
        result.selectedSites = sitesArg.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    }
  }
  
  return result;
}

interface SiteProcessingResult {
  siteId: string;
  siteTitle: string;
  s3PreSyncSuccess?: boolean;
  s3PreSyncDuration?: number;
  s3PreSyncFilesDownloaded?: number;
  syncConsistencyCheckSuccess?: boolean;
  syncConsistencyCheckDuration?: number;
  filesToUpload?: number;
  filesMissingLocally?: number;
  filesInSync?: number;
  rssRetrievalSuccess: boolean;
  rssRetrievalDuration: number;
  audioProcessingSuccess: boolean;
  audioProcessingDuration: number;
  newAudioFilesDownloaded: number;
  newEpisodesTranscribed: number;
  hasNewSrtFiles: boolean;
  s3SyncSuccess?: boolean;
  s3SyncDuration?: number;
  s3SyncTotalFilesUploaded?: number;
  indexingTriggerSuccess?: boolean;
  indexingTriggerDuration?: number;
  errors: string[];
}

interface AutomationCredentials {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SCHEDULED_RUN_MAIN_AWS_PROFILE: string;
}

interface SiteAccountMapping {
  [siteId: string]: {
    accountId: string;
    bucketName: string;
  };
}

// S3 Sync Types and Interfaces (extracted from s3-sync.ts)
type SyncDirection = 'local-to-s3' | 's3-to-local';
type ConflictResolution = 'overwrite-always' | 'overwrite-if-newer' | 'skip-existing';

interface SyncOptions {
  siteId: string;
  direction: SyncDirection;
  conflictResolution: ConflictResolution;
  localBasePath: string;
  s3BucketName: string;
  awsProfile?: string;
  roleArn?: string;
  tempCredentials?: any;
}

interface SyncResult {
  success: boolean;
  duration: number;
  totalFilesTransferred: number;
  error?: string;
}

// All folders that need to be synced
const ALL_SYNC_FOLDERS = [
  'audio',
  'transcripts', 
  'episode-manifest',
  'rss',
  'search-entries',
  'search-index'
];

// Site account mappings - these match the terraform configurations
const SITE_ACCOUNT_MAPPINGS: SiteAccountMapping = {
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
  }
};

/**
 * Load automation credentials from .env.automation file
 */
function loadAutomationCredentials(): AutomationCredentials {
  console.log('🔐 Loading automation credentials from .env.automation...');
  
  try {
    const envContent = readFileSync('.env.automation', 'utf-8');
    const credentials: Partial<AutomationCredentials> = {};
    
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          if (['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'SCHEDULED_RUN_MAIN_AWS_PROFILE'].includes(key)) {
            (credentials as any)[key] = value;
          }
        }
      }
    }
    
    // Validate all required credentials are present
    const required: (keyof AutomationCredentials)[] = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'SCHEDULED_RUN_MAIN_AWS_PROFILE'];
    for (const key of required) {
      if (!credentials[key]) {
        throw new Error(`Missing required credential: ${key}`);
      }
    }
    
    console.log('✅ Automation credentials loaded successfully');
    return credentials as AutomationCredentials;
    
  } catch (error: any) {
    console.error('❌ Failed to load automation credentials:', error.message);
    console.error('Please ensure .env.automation exists and contains all required credentials');
    process.exit(1);
  }
}

/**
 * Get lambda function name from site terraform outputs
 */
async function getSiteIndexingLambdaName(siteId: string): Promise<string | null> {
  try {
    console.log(`🔍 Getting indexing lambda name for site: ${siteId}`);
    
    // Change to site terraform directory
    const originalCwd = process.cwd();
    process.chdir('terraform/sites');
    
    try {
      // Get terraform output for indexing lambda
      const result = await execCommand('terraform', [
        'output', 
        '-raw', 
        'indexing_lambda_function_name'
      ], { 
        silent: true,
        env: {
          ...process.env,
          TF_VAR_site_id: siteId
        }
      });
      
      if (result.exitCode === 0 && result.stdout.trim()) {
        const lambdaName = result.stdout.trim();
        console.log(`✅ Found indexing lambda for ${siteId}: ${lambdaName}`);
        return lambdaName;
      } else {
        console.warn(`⚠️  Could not get indexing lambda name for ${siteId}: ${result.stderr}`);
        return null;
      }
    } finally {
      process.chdir(originalCwd);
    }
  } catch (error: any) {
    console.error(`❌ Error getting indexing lambda name for ${siteId}:`, error.message);
    return null;
  }
}

/**
 * Trigger cloud indexing lambda for a site using automation role
 */
async function triggerIndexingLambda(
  siteId: string, 
  lambdaName: string, 
  credentials: AutomationCredentials
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  console.log(`⚡ Triggering indexing lambda for ${siteId}: ${lambdaName}`);
  
  try {
    const siteConfig = SITE_ACCOUNT_MAPPINGS[siteId];
    if (!siteConfig) {
      throw new Error(`No account mapping found for site: ${siteId}`);
    }
    
    const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
    
    // First assume the role to get temporary credentials
    const assumeRoleResult = await execCommand('aws', [
      'sts', 'assume-role',
      '--role-arn', roleArn,
      '--role-session-name', `automation-indexing-${siteId}-${Date.now()}`
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
    
    // Invoke the lambda function using the assumed role credentials
    const invokeResult = await execCommand('aws', [
      'lambda', 'invoke',
      '--function-name', lambdaName,
      '--invocation-type', 'Event', // Async invocation
      '--payload', '{}',
      '/tmp/lambda-invoke-output.json'
    ], {
      silent: true,
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: tempCredentials.AccessKeyId,
        AWS_SECRET_ACCESS_KEY: tempCredentials.SecretAccessKey,
        AWS_SESSION_TOKEN: tempCredentials.SessionToken,
        AWS_REGION: credentials.AWS_REGION
      }
    });
    
    const duration = Date.now() - startTime;
    
    if (invokeResult.exitCode === 0) {
      console.log(`✅ Successfully triggered indexing lambda for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
      return { success: true, duration };
    } else {
      const error = `Lambda invoke failed: ${invokeResult.stderr}`;
      console.error(`❌ Failed to trigger indexing lambda for ${siteId}: ${error}`);
      return { success: false, duration, error };
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ Error triggering indexing lambda for ${siteId}:`, error.message);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Execute AWS S3 sync command (extracted from s3-sync.ts)
 */
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
    
    // Exclude system files
    args.push('--exclude', '.DS_Store');
    
    // Add verbosity for better tracking
    args.push('--cli-read-timeout', '0', '--cli-connect-timeout', '60');
    
    logProgress(`Syncing ${folder}: ${source} → ${destination}`);
    
    const syncCmd = spawn('aws', args, { 
      stdio: 'pipe',
      env: {
        ...process.env,
        ...(options.tempCredentials ? {
          AWS_ACCESS_KEY_ID: options.tempCredentials.AccessKeyId,
          AWS_SECRET_ACCESS_KEY: options.tempCredentials.SecretAccessKey,
          AWS_SESSION_TOKEN: options.tempCredentials.SessionToken
        } : {})
      }
    });
    
    let output = '';
    let errorOutput = '';
    
    syncCmd.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Show progress for uploads
      if (text.includes('upload:')) {
        logInfo(`   ${text.trim()}`);
      }
    });
    
    syncCmd.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    syncCmd.on('close', (code) => {
      if (code === 0) {
        logSuccess(`${folder} sync completed`);
        resolve({ success: true, output });
      } else {
        logError(`${folder} sync failed: ${errorOutput}`);
        resolve({ success: false, output: errorOutput });
      }
    });
  });
}

/**
 * Parse sync output to extract the number of files transferred
 */
function parseSyncOutputForFileCount(output: string): number {
  const lines = output.split('\n');
  let fileCount = 0;
  
  for (const line of lines) {
    if (line.includes('upload:') || line.includes('download:')) {
      fileCount++;
    }
  }
  
  return fileCount;
}

/**
 * Sync a single folder between local and S3
 */
async function syncSingleFolder(
  folder: string,
  options: SyncOptions
): Promise<{ success: boolean; filesTransferred: number; error?: string }> {
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
    logWarning(`Failed to sync ${folder}, continuing with other folders...`);
    return { success: false, filesTransferred: 0, error: result.output };
  }
  
  const filesTransferred = parseSyncOutputForFileCount(result.output);
  return { success: true, filesTransferred };
}

/**
 * Comprehensive S3-to-Local Pre-Sync - Phase 0
 * Downloads all existing S3 files to local storage before processing begins
 */
async function performS3ToLocalPreSync(
  siteId: string,
  credentials: AutomationCredentials
): Promise<SyncResult> {
  const startTime = Date.now();
  
  logProgress(`Phase 0: Pre-syncing all S3 content to local for ${siteId}`);
  
  try {
    const siteConfig = SITE_ACCOUNT_MAPPINGS[siteId];
    if (!siteConfig) {
      throw new Error(`No account mapping found for site: ${siteId}`);
    }

    const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
    
    // Assume the role to get temporary credentials
    const assumeRoleResult = await execCommand('aws', [
      'sts', 'assume-role',
      '--role-arn', roleArn,
      '--role-session-name', `automation-pre-sync-${siteId}-${Date.now()}`
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
    
    // Set up sync options for S3-to-local direction
    const localBasePath = path.resolve(__dirname, '..', 'aws-local-dev', 's3', 'sites', siteId);
    
    // Ensure base local directory exists
    if (!fs.existsSync(localBasePath)) {
      fs.mkdirSync(localBasePath, { recursive: true });
    }
    
    const syncOptions: SyncOptions = {
      siteId,
      direction: 's3-to-local',
      conflictResolution: 'overwrite-if-newer', // S3 wins for pre-sync conflicts
      localBasePath,
      s3BucketName: siteConfig.bucketName,
      tempCredentials
    };
    
    let totalFilesTransferred = 0;
    const errors: string[] = [];
    
    // Sync all folders from S3 to local
    for (const folder of ALL_SYNC_FOLDERS) {
      try {
        const folderResult = await syncSingleFolder(folder, syncOptions);
        totalFilesTransferred += folderResult.filesTransferred;
        
        if (!folderResult.success && folderResult.error) {
          errors.push(`${folder}: ${folderResult.error}`);
        }
        
        logDebug(`Pre-sync ${folder}: ${folderResult.filesTransferred} files downloaded`);
      } catch (error: any) {
        logError(`Error pre-syncing ${folder}: ${error.message}`);
        errors.push(`${folder}: ${error.message}`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    if (errors.length > 0) {
      logWarning(`Pre-sync completed with errors for ${siteId}: ${errors.join(', ')}`);
    } else {
      logSuccess(`Pre-sync completed for ${siteId}: ${totalFilesTransferred} files downloaded in ${duration}ms`);
    }
    
    return {
      success: errors.length === 0,
      duration,
      totalFilesTransferred,
      error: errors.length > 0 ? errors.join('; ') : undefined
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Failed to pre-sync S3 content for ${siteId}: ${error.message}`);
    return {
      success: false,
      duration,
      totalFilesTransferred: 0,
      error: error.message
    };
  }
}

/**
 * Sync transcripts folder to S3 for a site with new SRT files (original function)
 */
async function syncTranscriptsToS3(
  siteId: string,
  credentials: AutomationCredentials
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  logProgress(`Syncing new transcripts to S3 for ${siteId}`);
  
  try {
    const siteConfig = SITE_ACCOUNT_MAPPINGS[siteId];
    if (!siteConfig) {
      throw new Error(`No account mapping found for site: ${siteId}`);
    }
    
    const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
    
    // First assume the role to get temporary credentials
    const assumeRoleResult = await execCommand('aws', [
      'sts', 'assume-role',
      '--role-arn', roleArn,
      '--role-session-name', `automation-s3-sync-${siteId}-${Date.now()}`
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
    
    // Set up sync options
    const localBasePath = path.resolve(__dirname, '..', 'aws-local-dev', 's3', 'sites', siteId);
    const localTranscriptsPath = path.join(localBasePath, 'transcripts');
    const s3TranscriptsPath = `s3://${siteConfig.bucketName}/transcripts`;
    
    // Ensure local directory exists
    if (!fs.existsSync(localTranscriptsPath)) {
      logWarning(`No transcripts directory found for ${siteId}: ${localTranscriptsPath}`);
      return { success: true, duration: Date.now() - startTime }; // Not an error - just no files to sync
    }
    
    const syncOptions: SyncOptions = {
      siteId,
      direction: 'local-to-s3',
      conflictResolution: 'overwrite-if-newer',
      localBasePath,
      s3BucketName: siteConfig.bucketName,
      tempCredentials
    };
    
    // Sync transcripts folder
    const result = await executeS3Sync(
      localTranscriptsPath + '/',
      s3TranscriptsPath + '/',
      syncOptions,
      'transcripts'
    );
    
    if (!result.success) {
      throw new Error(`S3 sync failed: ${result.output}`);
    }
    
    const duration = Date.now() - startTime;
    logSuccess(`Transcripts synced to S3 for ${siteId} in ${duration}ms`);
    return { success: true, duration };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Failed to sync transcripts to S3 for ${siteId}: ${error.message}`);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Comprehensive Local-to-S3 Sync - Phase 4.3
 * Uploads ALL files that exist locally but not on S3 (not just new files)
 */
async function performComprehensiveS3Sync(
  siteId: string,
  credentials: AutomationCredentials,
  filesToUploadCount: number
): Promise<SyncResult> {
  const startTime = Date.now();
  
  if (filesToUploadCount === 0) {
    logInfo(`No files to upload for ${siteId} - skipping comprehensive sync`);
    return {
      success: true,
      duration: Date.now() - startTime,
      totalFilesTransferred: 0
    };
  }
  
  logProgress(`Phase 3 (Enhanced): Comprehensive S3 sync for ${siteId} - uploading ${filesToUploadCount} files`);
  
  try {
    const siteConfig = SITE_ACCOUNT_MAPPINGS[siteId];
    if (!siteConfig) {
      throw new Error(`No account mapping found for site: ${siteId}`);
    }

    const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
    
    // Assume the role to get temporary credentials
    const assumeRoleResult = await execCommand('aws', [
      'sts', 'assume-role',
      '--role-arn', roleArn,
      '--role-session-name', `automation-comprehensive-sync-${siteId}-${Date.now()}`
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
    
    // Set up sync options for local-to-S3 direction
    const localBasePath = path.resolve(__dirname, '..', 'aws-local-dev', 's3', 'sites', siteId);
    
    const syncOptions: SyncOptions = {
      siteId,
      direction: 'local-to-s3',
      conflictResolution: 'overwrite-if-newer',
      localBasePath,
      s3BucketName: siteConfig.bucketName,
      tempCredentials
    };
    
    let totalFilesTransferred = 0;
    const errors: string[] = [];
    
    // Sync all folders from local to S3
    for (const folder of ALL_SYNC_FOLDERS) {
      try {
        const folderResult = await syncSingleFolder(folder, syncOptions);
        totalFilesTransferred += folderResult.filesTransferred;
        
        if (!folderResult.success && folderResult.error) {
          errors.push(`${folder}: ${folderResult.error}`);
        } else if (folderResult.filesTransferred > 0) {
          logInfo(`Uploaded ${folderResult.filesTransferred} files from ${folder} folder`);
        }
        
        logDebug(`Comprehensive sync ${folder}: ${folderResult.filesTransferred} files uploaded`);
      } catch (error: any) {
        logError(`Error syncing ${folder} to S3: ${error.message}`);
        errors.push(`${folder}: ${error.message}`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    if (errors.length > 0) {
      logWarning(`Comprehensive sync completed with errors for ${siteId}: ${errors.join(', ')}`);
    } else {
      logSuccess(`Comprehensive sync completed for ${siteId}: ${totalFilesTransferred} files uploaded in ${duration}ms`);
    }
    
    return {
      success: errors.length === 0,
      duration,
      totalFilesTransferred,
      error: errors.length > 0 ? errors.join('; ') : undefined
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Failed to perform comprehensive S3 sync for ${siteId}: ${error.message}`);
    return {
      success: false,
      duration,
      totalFilesTransferred: 0,
      error: error.message
    };
  }
}

/**
 * Run a command with site context and capture output to extract metrics
 */
async function runCommandWithSiteContext(
  siteId: string,
  command: string,
  args: string[],
  operation: string
): Promise<{ success: boolean; duration: number; error?: string; newAudioFiles?: number; newTranscripts?: number }> {
  const startTime = Date.now();
  
  console.log(`\n🚀 Running ${operation} for site: ${siteId}`);
  console.log(`   Command: ${command} ${args.join(' ')}`);
  
  return new Promise((resolve) => {
    try {
      // Load site-specific environment variables
      const siteEnvVars = loadSiteEnvVars(siteId, 'local');
      
      // Merge with current environment, giving priority to site-specific vars
      const envVars = {
        ...process.env,
        ...siteEnvVars,
        SELECTED_SITE_ID: siteId,
        CURRENT_SITE_ID: siteId,
        FILE_STORAGE_ENV: 'local'  // Ensure we're using local storage for all operations
      };

      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
        env: envVars,
        cwd: process.cwd()
      });

      // Capture stdout and stderr while also displaying them
      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      child.on('close', (code: number | null) => {
        const duration = Date.now() - startTime;
        const success = code === 0;
        
        // Parse metrics from output
        let newAudioFiles = 0;
        let newTranscripts = 0;

        if (success) {
          // Extract metrics from RSS retrieval output
          const audioFilesMatch = stdout.match(/🎧 New Audio Files Downloaded: (\d+)/);
          if (audioFilesMatch) {
            newAudioFiles = parseInt(audioFilesMatch[1], 10);
          }

          // Extract metrics from audio processing output
          const transcriptsMatch = stdout.match(/✅ Successfully Processed: (\d+)/);
          if (transcriptsMatch) {
            newTranscripts = parseInt(transcriptsMatch[1], 10);
          }

          console.log(`   ✅ ${operation} completed successfully for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
        } else {
          console.log(`   ❌ ${operation} failed for ${siteId} with exit code ${code} (${(duration / 1000).toFixed(1)}s)`);
        }
        
        resolve({
          success,
          duration,
          error: success ? undefined : `Exit code: ${code}`,
          newAudioFiles,
          newTranscripts
        });
      });

      child.on('error', (error: Error) => {
        const duration = Date.now() - startTime;
        console.log(`   ❌ ${operation} failed for ${siteId} with error: ${error.message} (${(duration / 1000).toFixed(1)}s)`);
        
        resolve({
          success: false,
          duration,
          error: error.message,
          newAudioFiles: 0,
          newTranscripts: 0
        });
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ ${operation} failed for ${siteId} with error: ${error.message} (${(duration / 1000).toFixed(1)}s)`);
      
      resolve({
        success: false,
        duration,
        error: error.message,
        newAudioFiles: 0,
        newTranscripts: 0
      });
    }
  });
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🤖 Scheduled Ingestion and Indexing Automation');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  
  // Parse command line arguments
  const { selectedSites } = parseArguments();
  
  // Load automation credentials
  const credentials = loadAutomationCredentials();
  
  // Ensure we're running in local mode for all file operations
  process.env.FILE_STORAGE_ENV = 'local';
  
  // Discover all available sites
  const allSites = discoverSites();
  
  if (allSites.length === 0) {
    console.error('❌ No sites found! Please create a site in /sites/my-sites/ or /sites/origin-sites/');
    process.exit(1);
  }
  
  // Filter sites based on command line argument if provided
  let sites = allSites;
  if (selectedSites && selectedSites.length > 0) {
    sites = allSites.filter(site => selectedSites.includes(site.id));
    
    if (sites.length === 0) {
      console.error(`❌ No matching sites found for: ${selectedSites.join(', ')}`);
      console.error(`Available sites: ${allSites.map(s => s.id).join(', ')}`);
      process.exit(1);
    }
    
    console.log(`\n🎯 Running for selected sites only: ${selectedSites.join(', ')}`);
  }
  
  console.log(`\n📍 Found ${sites.length} site(s) to process:`);
  sites.forEach((site: Site) => {
    console.log(`   - ${site.id} (${site.title})`);
  });
  
  const results: SiteProcessingResult[] = [];
  const overallStartTime = Date.now();
  
  // Phase 0: Pre-sync all S3 content to local storage
  console.log('\n' + '='.repeat(60));
  console.log('📡 Phase 0: Pre-sync all S3 content to local storage');
  console.log('='.repeat(60));
  
  for (const site of sites) {
    const preSyncResult = await performS3ToLocalPreSync(site.id, credentials);
    
    results.push({
      siteId: site.id,
      siteTitle: site.title,
      s3PreSyncSuccess: preSyncResult.success,
      s3PreSyncDuration: preSyncResult.duration,
      s3PreSyncFilesDownloaded: preSyncResult.totalFilesTransferred,
      syncConsistencyCheckSuccess: undefined,
      syncConsistencyCheckDuration: undefined,
      filesToUpload: undefined,
      filesMissingLocally: undefined,
      filesInSync: undefined,
      rssRetrievalSuccess: false,
      rssRetrievalDuration: 0,
      audioProcessingSuccess: false,
      audioProcessingDuration: 0,
      newAudioFilesDownloaded: 0,
      newEpisodesTranscribed: 0,
      hasNewSrtFiles: false,
      errors: preSyncResult.error ? [preSyncResult.error] : []
    });
  }
  
  // Phase 0.5: Check sync consistency to identify files that need uploading
  console.log('\n' + '='.repeat(60));
  console.log('🔍 Phase 0.5: Check sync consistency (local vs S3)');
  console.log('='.repeat(60));
  
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const startTime = Date.now();
    
    try {
      const siteConfig = SITE_ACCOUNT_MAPPINGS[site.id];
      if (!siteConfig) {
        throw new Error(`No account mapping found for site: ${site.id}`);
      }

      const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
      
      // Assume the role to get temporary credentials
      const assumeRoleResult = await execCommand('aws', [
        'sts', 'assume-role',
        '--role-arn', roleArn,
        '--role-session-name', `automation-consistency-check-${site.id}-${Date.now()}`
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
      
      // Generate sync consistency report
      const consistencyReport = await generateSyncConsistencyReport(
        site.id,
        siteConfig.bucketName,
        tempCredentials
      );
      
      // Display the report (will use logInfo/logDebug appropriately)
      displaySyncConsistencyReport(site.id, consistencyReport);
      
      const duration = Date.now() - startTime;
      
      // Update results
      results[i].syncConsistencyCheckSuccess = true;
      results[i].syncConsistencyCheckDuration = duration;
      results[i].filesToUpload = consistencyReport.summary.totalLocalOnlyFiles;
      results[i].filesMissingLocally = consistencyReport.summary.totalS3OnlyFiles;
      results[i].filesInSync = consistencyReport.summary.totalConsistentFiles;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logError(`Failed to check sync consistency for ${site.id}: ${error.message}`);
      
      results[i].syncConsistencyCheckSuccess = false;
      results[i].syncConsistencyCheckDuration = duration;
      results[i].filesToUpload = 0;
      results[i].filesMissingLocally = 0;
      results[i].filesInSync = 0;
      results[i].errors.push(`Sync consistency check error: ${error.message}`);
    }
  }
  
  // Phase 1: RSS Retrieval for all sites
  console.log('\n' + '='.repeat(60));
  console.log('📡 Phase 1: RSS Retrieval for all sites');
  console.log('='.repeat(60));
  
  for (const site of sites) {
    const rssResult = await runCommandWithSiteContext(
      site.id,
      'pnpm',
      ['--filter', '@browse-dot-show/rss-retrieval-lambda', 'run', 'run:local'],
      'RSS retrieval'
    );
    
    results[sites.indexOf(site)].rssRetrievalSuccess = rssResult.success;
    results[sites.indexOf(site)].rssRetrievalDuration = rssResult.duration;
    results[sites.indexOf(site)].newAudioFilesDownloaded = rssResult.newAudioFiles || 0;
    results[sites.indexOf(site)].newEpisodesTranscribed = 0;
    results[sites.indexOf(site)].hasNewSrtFiles = false;
    
    if (rssResult.error) {
      results[sites.indexOf(site)].errors.push(rssResult.error);
    }
  }
  
  // Phase 2: Audio Processing for all sites
  console.log('\n' + '='.repeat(60));
  console.log('🎵 Phase 2: Audio Processing for all sites');
  console.log('='.repeat(60));
  
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const audioResult = await runCommandWithSiteContext(
      site.id,
      'pnpm',
      ['--filter', '@browse-dot-show/process-audio-lambda', 'run', 'run:local'],
      'Audio processing'
    );
    
    // Update the existing result
    results[i].audioProcessingSuccess = audioResult.success;
    results[i].audioProcessingDuration = audioResult.duration;
    results[i].newEpisodesTranscribed = audioResult.newTranscripts || 0;
    results[i].hasNewSrtFiles = (audioResult.newTranscripts || 0) > 0;
    
    if (audioResult.error) {
      results[i].errors.push(audioResult.error);
    }
  }
  
  // Phase 3: Comprehensive S3 sync for ALL missing files (ENHANCED - Phase 4.3)
  console.log('\n' + '='.repeat(60));
  console.log('☁️  Phase 3 (Enhanced): Comprehensive S3 sync for ALL missing files');
  console.log('='.repeat(60));
  
  const sitesNeedingSync = results.filter(result => 
    result.syncConsistencyCheckSuccess && 
    (result.filesToUpload || 0) > 0
  );
  
  if (sitesNeedingSync.length === 0) {
    console.log('ℹ️  No sites have files to upload. All sites are in sync with S3.');
  } else {
    console.log(`📝 Found ${sitesNeedingSync.length} site(s) with files to upload:${sitesNeedingSync.map(r => ` ${r.siteId} (${r.filesToUpload} files)`).join(',')}`);
    
    for (const result of sitesNeedingSync) {
      const resultIndex = results.findIndex(r => r.siteId === result.siteId);
      
      // Perform comprehensive S3 sync
      const syncResult = await performComprehensiveS3Sync(
        result.siteId, 
        credentials, 
        result.filesToUpload || 0
      );
      
      results[resultIndex].s3SyncSuccess = syncResult.success;
      results[resultIndex].s3SyncDuration = syncResult.duration;
      results[resultIndex].s3SyncTotalFilesUploaded = syncResult.totalFilesTransferred;
      
      if (syncResult.error) {
        results[resultIndex].errors.push(`Comprehensive S3 sync error: ${syncResult.error}`);
      }
    }
  }
  
  // Phase 4: Trigger Cloud Indexing for sites with S3 uploads (ENHANCED - Phase 4.4)
  console.log('\n' + '='.repeat(60));
  console.log('⚡ Phase 4 (Enhanced): Trigger Cloud Indexing for sites with S3 uploads');
  console.log('='.repeat(60));
  
  const sitesWithSuccessfulSync = results.filter(result => 
    result.s3SyncSuccess === true && 
    (result.s3SyncTotalFilesUploaded || 0) > 0
  );
  
  if (sitesWithSuccessfulSync.length === 0) {
    console.log('ℹ️  No sites uploaded files to S3. Skipping cloud indexing phase.');
  } else {
    console.log(`📝 Found ${sitesWithSuccessfulSync.length} site(s) with successful S3 uploads:${sitesWithSuccessfulSync.map(r => ` ${r.siteId} (${r.s3SyncTotalFilesUploaded} files)`).join(',')}`);
    
    for (const result of sitesWithSuccessfulSync) {
      const resultIndex = results.findIndex(r => r.siteId === result.siteId);
      
      // Get lambda function name from terraform outputs
      const lambdaName = await getSiteIndexingLambdaName(result.siteId);
      
      if (!lambdaName) {
        console.error(`❌ Could not get indexing lambda name for ${result.siteId}, skipping cloud indexing`);
        results[resultIndex].errors.push('Could not get indexing lambda name');
        continue;
      }
      
      // Trigger the indexing lambda
      const indexingResult = await triggerIndexingLambda(result.siteId, lambdaName, credentials);
      
      results[resultIndex].indexingTriggerSuccess = indexingResult.success;
      results[resultIndex].indexingTriggerDuration = indexingResult.duration;
      
      if (indexingResult.error) {
        results[resultIndex].errors.push(indexingResult.error);
      }
    }
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
    const preSyncStatus = result.s3PreSyncSuccess ? '✅' : '❌';
    const consistencyStatus = result.syncConsistencyCheckSuccess ? '✅' : '❌';
    const rssStatus = result.rssRetrievalSuccess ? '✅' : '❌';
    const audioStatus = result.audioProcessingSuccess ? '✅' : '❌';
    const s3SyncStatus = (result.filesToUpload || 0) > 0
      ? (result.s3SyncSuccess ? '✅' : '❌')
      : '⚪'; // No sync needed
    const indexingStatus = (result.s3SyncTotalFilesUploaded || 0) > 0
      ? (result.indexingTriggerSuccess ? '✅' : '❌')
      : '⚪'; // No indexing needed
    const totalDuration = (result.s3PreSyncDuration || 0) + (result.syncConsistencyCheckDuration || 0) + 
                         result.rssRetrievalDuration + result.audioProcessingDuration + 
                         (result.s3SyncDuration || 0) + (result.indexingTriggerDuration || 0);
    
    console.log(`\n   ${result.siteId} (${result.siteTitle}):`);
    console.log(`      S3 Pre-Sync: ${preSyncStatus} (${((result.s3PreSyncDuration || 0) / 1000).toFixed(1)}s) - ${result.s3PreSyncFilesDownloaded || 0} files`);
    console.log(`      Sync Check: ${consistencyStatus} (${((result.syncConsistencyCheckDuration || 0) / 1000).toFixed(1)}s) - ${result.filesToUpload || 0} to upload, ${result.filesInSync || 0} in sync`);
    console.log(`      RSS Retrieval: ${rssStatus} (${(result.rssRetrievalDuration / 1000).toFixed(1)}s)`);
    console.log(`      Audio Processing: ${audioStatus} (${(result.audioProcessingDuration / 1000).toFixed(1)}s)`);
    console.log(`      S3 Upload: ${s3SyncStatus} ${(result.filesToUpload || 0) > 0 ? `(${((result.s3SyncDuration || 0) / 1000).toFixed(1)}s) - ${result.s3SyncTotalFilesUploaded || 0} files` : '(not needed)'}`);
    console.log(`      Cloud Indexing: ${indexingStatus} ${(result.s3SyncTotalFilesUploaded || 0) > 0 ? `(${((result.indexingTriggerDuration || 0) / 1000).toFixed(1)}s)` : '(not needed)'}`);
    console.log(`      📥 New Audio Files Downloaded: ${result.newAudioFilesDownloaded}`);
    console.log(`      🎤 Episodes Transcribed: ${result.newEpisodesTranscribed}`);
    console.log(`      Total: ${(totalDuration / 1000).toFixed(1)}s`);
    
    if (result.errors.length > 0) {
      console.log(`      Errors: ${result.errors.join(', ')}`);
    }
  });
  
  // Overall statistics
  const successfulPreSyncCount = results.filter(r => r.s3PreSyncSuccess).length;
  const successfulConsistencyCheckCount = results.filter(r => r.syncConsistencyCheckSuccess).length;
  const successfulRssCount = results.filter(r => r.rssRetrievalSuccess).length;
  const successfulAudioCount = results.filter(r => r.audioProcessingSuccess).length;
  const sitesWithFilesToUpload = results.filter(r => (r.filesToUpload || 0) > 0).length;
  const successfulS3SyncCount = results.filter(r => (r.filesToUpload || 0) > 0 && r.s3SyncSuccess).length;
  const successfulIndexingCount = results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0 && r.indexingTriggerSuccess).length;
  const sitesTriggeredIndexing = results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0).length;
  const totalPreSyncFilesDownloaded = results.reduce((sum, r) => sum + (r.s3PreSyncFilesDownloaded || 0), 0);
  const totalFilesUploaded = results.reduce((sum, r) => sum + (r.s3SyncTotalFilesUploaded || 0), 0);
  const totalAudioFilesDownloaded = results.reduce((sum, r) => sum + r.newAudioFilesDownloaded, 0);
  const totalEpisodesTranscribed = results.reduce((sum, r) => sum + r.newEpisodesTranscribed, 0);
  
  console.log('\n📊 Overall Statistics:');
  console.log(`   Sites processed: ${results.length}`);
  console.log(`   Pre-Sync success rate: ${successfulPreSyncCount}/${results.length} (${((successfulPreSyncCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Consistency Check success rate: ${successfulConsistencyCheckCount}/${results.length} (${((successfulConsistencyCheckCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   RSS Retrieval success rate: ${successfulRssCount}/${results.length} (${((successfulRssCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Audio Processing success rate: ${successfulAudioCount}/${results.length} (${((successfulAudioCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Sites with files to upload: ${sitesWithFilesToUpload}`);
  console.log(`   S3 Upload success rate: ${successfulS3SyncCount}/${sitesWithFilesToUpload} (${sitesWithFilesToUpload > 0 ? ((successfulS3SyncCount / sitesWithFilesToUpload) * 100).toFixed(1) : 0}%)`);
  console.log(`   Cloud Indexing success rate: ${successfulIndexingCount}/${sitesTriggeredIndexing} (${sitesTriggeredIndexing > 0 ? ((successfulIndexingCount / sitesTriggeredIndexing) * 100).toFixed(1) : 0}%)`);
  console.log(`   📥 Total Files Downloaded from S3: ${totalPreSyncFilesDownloaded}`);
  console.log(`   📤 Total Files Uploaded to S3: ${totalFilesUploaded}`);
  console.log(`   📥 Total Audio Files Downloaded: ${totalAudioFilesDownloaded}`);
  console.log(`   🎤 Total Episodes Transcribed: ${totalEpisodesTranscribed}`);
  
  // Exit with appropriate code
  const hasErrors = results.some(r => r.errors.length > 0);
  if (hasErrors) {
    console.log('\n⚠️  Some operations failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All operations completed successfully!');
    console.log('🔄 Automation workflow complete - sites are up to date');
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