import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getLocalS3SitePath } from '@browse-dot-show/config';
import type { AutomationCredentials } from './env.js';
import { logInfo, logSuccess, logError, logWarning, logProgress, logDebug } from './logging.js';
import { assumeSiteRole, type SiteAccount, type TempCredentials } from './site-accounts.js';

/**
 * Sync a site's local S3 mirror (`<local-files>/s3/sites/<siteId>/…`) with its S3 bucket,
 * using the AWS CLI and temporary credentials for the automation role in the site's account.
 *
 * ⚠️ The client and search lambda read these exact S3 keys. Local folder names map 1:1 to
 * bucket prefixes; don't change the layout.
 */

export type SyncDirection = 'local-to-s3' | 's3-to-local';
export type ConflictResolution = 'overwrite-always' | 'overwrite-if-newer' | 'skip-existing';

export interface SyncOptions {
  siteId: string;
  direction: SyncDirection;
  conflictResolution: ConflictResolution;
  localBasePath: string;
  s3BucketName: string;
  tempCredentials?: TempCredentials;
}

export interface SyncResult {
  success: boolean;
  duration: number;
  totalFilesTransferred: number;
  error?: string;
}

/** Every folder (= S3 prefix) that's synced. */
export const ALL_SYNC_FOLDERS = [
  'audio',
  'transcripts',
  'episode-manifest',
  'rss',
  'search-entries',
  'search-index'
];

/**
 * Assume the automation role in a site's account. The session name is
 * `auto-<purpose>-<siteId>-<timestamp>`.
 */
export async function assumeAwsRole(
  siteId: string,
  sessionNameSuffix: string,
  credentials: AutomationCredentials
): Promise<{ siteConfig: SiteAccount; tempCredentials: TempCredentials }> {
  const { siteAccount, tempCredentials } = await assumeSiteRole(
    siteId,
    credentials,
    `auto-${sessionNameSuffix}-${siteId}-${Date.now()}`
  );
  return { siteConfig: siteAccount, tempCredentials };
}

function createSyncOptions(
  siteId: string,
  direction: SyncDirection,
  conflictResolution: ConflictResolution,
  siteConfig: { accountId: string; bucketName: string },
  tempCredentials: TempCredentials
): SyncOptions {
  return {
    siteId,
    direction,
    conflictResolution,
    localBasePath: getLocalS3SitePath(siteId),
    s3BucketName: siteConfig.bucketName,
    tempCredentials
  };
}

/**
 * Run `aws s3 sync` for one folder, with progress output.
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
      // For skip-existing (only download if file doesn't exist locally),
      // we'll use a custom approach with exclude patterns
      // First, we need to check what files already exist locally
      if (options.direction === 's3-to-local') {
        const localPath = destination.replace(/\/$/, ''); // Remove trailing slash
        try {
          if (fs.existsSync(localPath)) {
            // Get list of existing local files to exclude them from sync
            const existingFiles = getExistingLocalFiles(localPath);
            existingFiles.forEach(file => {
              args.push('--exclude', file);
            });
            logDebug(`Excluding ${existingFiles.length} existing local files from S3 sync`);
          }
        } catch (error: any) {
          logWarning(`Could not check existing local files for exclude patterns: ${error.message}`);
          // Continue without exclude patterns - will use default AWS CLI behavior
        }
      }
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
    let filesTransferred = 0;
    let lastTransferredFile = '';
    let progressInterval: NodeJS.Timeout;
    const startTime = Date.now();
    
    // Set up progress indicator that updates every 10 seconds
    const showProgress = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const currentFile = lastTransferredFile ? ` | Current: ${path.basename(lastTransferredFile)}` : '';
      process.stdout.write(`\r🔄 Syncing ${folder}... (${elapsed}s) | Files: ${filesTransferred}${currentFile}`.padEnd(100));
    };
    
    progressInterval = setInterval(showProgress, 10000);
    
    syncCmd.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // Count and track file transfers
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('upload:') || line.includes('download:')) {
          filesTransferred++;
          // Extract filename from the line (format: "upload: local/path to s3://bucket/path")
          const match = line.match(/(?:upload|download):\s+(.+?)\s+(?:to\s+)?s3:\/\//);
          if (match && match[1]) {
            lastTransferredFile = match[1].trim();
          }
          
          // Show immediate update for file transfers
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          process.stdout.write(`\r🔄 Syncing ${folder}... (${elapsed}s) | Files: ${filesTransferred} | Current: ${path.basename(lastTransferredFile || '')}`.padEnd(100));
        }
      }
    });
    
    syncCmd.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    syncCmd.on('close', (code) => {
      // Clear progress indicator
      clearInterval(progressInterval);
      process.stdout.write('\r'.padEnd(100) + '\r');
      
      if (code === 0) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        logSuccess(`${folder} sync completed (${elapsed}s) - ${filesTransferred} files transferred`);
        resolve({ success: true, output });
      } else {
        logError(`${folder} sync failed: ${errorOutput}`);
        resolve({ success: false, output: errorOutput });
      }
    });
    
    syncCmd.on('error', (error) => {
      // Clear progress indicator on error
      clearInterval(progressInterval);
      process.stdout.write('\r'.padEnd(100) + '\r');
      logError(`${folder} sync error: ${error.message}`);
      resolve({ success: false, output: error.message });
    });
  });
}

/**
 * Get list of existing local files for exclude patterns
 */
function getExistingLocalFiles(localPath: string): string[] {
  const existingFiles: string[] = [];
  
  try {
    const items = fs.readdirSync(localPath);
    
    for (const item of items) {
      const fullPath = path.join(localPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile() && !item.startsWith('.') && !item.includes('.DS_Store')) {
        existingFiles.push(item);
      } else if (stat.isDirectory()) {
        // Recursively get files from subdirectories
        const subPath = fullPath;
        const relativePath = item;
        try {
          const subFiles = getExistingLocalFilesRecursive(subPath, relativePath);
          existingFiles.push(...subFiles);
        } catch (error) {
          // Skip subdirectories that can't be read
        }
      }
    }
  } catch (error) {
    // If we can't read the directory, return empty array
  }
  
  return existingFiles;
}

/**
 * Recursively get existing local files with relative paths
 */
function getExistingLocalFilesRecursive(dirPath: string, relativePath: string): string[] {
  const files: string[] = [];
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const itemRelativePath = `${relativePath}/${item}`;
      
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && !item.startsWith('.') && !item.includes('.DS_Store')) {
        files.push(itemRelativePath);
      } else if (stat.isDirectory()) {
        const subFiles = getExistingLocalFilesRecursive(fullPath, itemRelativePath);
        files.push(...subFiles);
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
  
  return files;
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
export async function syncSingleFolder(
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
export async function performS3ToLocalPreSync(
  siteId: string,
  credentials: AutomationCredentials
): Promise<SyncResult> {
  const startTime = Date.now();
  
  logProgress(`Phase 0: Pre-syncing all S3 content to local for ${siteId}`);
  
  try {
    // Assume AWS role and get temporary credentials
    const { siteConfig, tempCredentials } = await assumeAwsRole(siteId, 'pre-sync', credentials);
    
    // Set up sync options for S3-to-local direction
    const localBasePath = getLocalS3SitePath(siteId);
    
    // Ensure base local directory exists
    if (!fs.existsSync(localBasePath)) {
      fs.mkdirSync(localBasePath, { recursive: true });
    }
    
    const syncOptions = createSyncOptions(
      siteId,
      's3-to-local',
      'skip-existing', // Only download files that don't exist locally
      siteConfig,
      tempCredentials
    );
    
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
 * Sync episode-manifest folder to S3 for a site (always runs regardless of other files)
 */
export async function syncEpisodeManifestFolder(
  siteId: string,
  credentials: AutomationCredentials
): Promise<SyncResult> {
  const startTime = Date.now();
  
  logProgress(`Syncing episode-manifest folder to S3 for ${siteId} (always updated)`);
  
  try {
    // Assume AWS role and get temporary credentials
    const { siteConfig, tempCredentials } = await assumeAwsRole(siteId, 'episode-manifest-sync', credentials);
    
    // Set up sync options for local-to-S3 direction
    const syncOptions = createSyncOptions(
      siteId,
      'local-to-s3',
      'overwrite-always', // Always overwrite since timestamp updates every run
      siteConfig,
      tempCredentials
    );
    
    // Sync only the episode-manifest folder
    const folderResult = await syncSingleFolder('episode-manifest', syncOptions);
    
    const duration = Date.now() - startTime;
    
    if (!folderResult.success && folderResult.error) {
      logWarning(`Episode-manifest sync completed with error for ${siteId}: ${folderResult.error}`);
    } else {
      logSuccess(`Episode-manifest sync completed for ${siteId}: ${folderResult.filesTransferred} files uploaded in ${duration}ms`);
    }
    
    return {
      success: folderResult.success,
      duration,
      totalFilesTransferred: folderResult.filesTransferred,
      error: folderResult.error
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Failed to sync episode-manifest folder for ${siteId}: ${error.message}`);
    return {
      success: false,
      duration,
      totalFilesTransferred: 0,
      error: error.message
    };
  }
}

/**
 * Comprehensive Local-to-S3 Sync - Phase 4.3
 * Uploads ALL files that exist locally but not on S3 (not just new files)
 */
export async function performComprehensiveS3Sync(
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
    // Assume AWS role and get temporary credentials
    const { siteConfig, tempCredentials } = await assumeAwsRole(siteId, 'comprehensive-sync', credentials);
    
    // Set up sync options for local-to-S3 direction
    const syncOptions = createSyncOptions(
      siteId,
      'local-to-s3',
      'overwrite-if-newer',
      siteConfig,
      tempCredentials
    );
    
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
