#!/usr/bin/env tsx

/**
 * Ingestion Pipeline Script - Complete Podcast Processing Workflow
 * 
 * This script provides a comprehensive ingestion pipeline that can be run in multiple modes:
 * - Automated/scheduled execution (for production automation)
 * - Interactive mode (for manual runs with guided configuration)
 * - Targeted execution (for specific sites or phases)
 * 
 * Pipeline Phases:
 * 0. Pre-sync all S3 content to local storage
 * 1. Load automation credentials from .env.automation
 * 2. Run local ingestion for all sites (RSS retrieval + audio processing)
 * 3. Detect which sites have new content and sync comprehensive changes to S3
 * 4. Trigger cloud indexing lambdas for sites with S3 uploads using automation role
 * 
 * Usage: tsx scripts/run-ingestion-pipeline.ts [OPTIONS]
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';
import { discoverSites, loadSiteEnvVars, Site } from './utils/site-selector.js';
import { execCommand } from './utils/shell-exec.js';
import { logInfo, logSuccess, logError, logWarning, logProgress, logHeader, logDebug } from './utils/logging.js';
import { generateSyncConsistencyReport, displaySyncConsistencyReport } from './utils/sync-consistency-checker.js';
import { loadAutomationCredentials, AutomationCredentials } from './utils/automation-credentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration options for the automation workflow
 */
interface WorkflowConfig {
  selectedSites?: string[];
  interactive: boolean;
  help: boolean;
  dryRun: boolean;
  skipCloudIndexing: boolean;
  phases: {
    preSync: boolean;
    consistencyCheck: boolean;
    rssRetrieval: boolean;
    audioProcessing: boolean;
    s3Sync: boolean;
    cloudIndexing: boolean;
    localIndexing: boolean;
  };
  syncOptions: {
    foldersToSync: string[];
  };
}

/**
 * Get default configuration (function to avoid forward reference issues)
 */
function getDefaultConfig(): WorkflowConfig {
  return {
    interactive: false,
    help: false,
    dryRun: false,
    skipCloudIndexing: false,
    phases: {
      preSync: true,
      consistencyCheck: true,
      rssRetrieval: true,
      audioProcessing: true,
      s3Sync: true,
      cloudIndexing: true,
      localIndexing: true
    },
    syncOptions: {
      foldersToSync: ALL_SYNC_FOLDERS
    }
  };
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
🤖 Ingestion Pipeline - Comprehensive Podcast Processing

USAGE:
  tsx scripts/run-ingestion-pipeline.ts [OPTIONS]

OPTIONS:
  --help                    Show this help message
  --interactive             Run in interactive mode to configure options
  --sites=site1,site2       Process only specific sites (comma-separated)
  --dry-run                 Show what would be done without executing
  --skip-cloud-indexing     Skip triggering cloud indexing lambdas
  --skip-pre-sync           Skip S3-to-local pre-sync phase
  --skip-consistency-check  Skip sync consistency check phase
  --skip-rss-retrieval     Skip RSS retrieval phase
  --skip-audio-processing  Skip audio processing phase
  --skip-s3-sync           Skip local-to-S3 sync phase
  --skip-local-indexing    Skip local search index update phase
  --sync-folders=a,b,c     Specific folders to sync (audio,transcripts,episode-manifest,rss)

EXAMPLES:
  # Run full workflow for all sites (default)
  tsx scripts/run-ingestion-pipeline.ts
  
  # Interactive mode for manual configuration
  tsx scripts/run-ingestion-pipeline.ts --interactive
  
  # Process only specific sites
  tsx scripts/run-ingestion-pipeline.ts --sites=hardfork,naddpod
  
  # Dry run to see what would happen
  tsx scripts/run-ingestion-pipeline.ts --dry-run --sites=hardfork
  
  # Skip cloud indexing (local processing only)
  tsx scripts/run-ingestion-pipeline.ts --skip-cloud-indexing

PHASES:
  Phase 0: S3-to-local pre-sync (downloads existing S3 files)
  Phase 0.5: Sync consistency check (compares local vs S3)
  Phase 1: RSS retrieval (downloads new episodes)
  Phase 2: Audio processing (transcribes audio files)
  Phase 3: S3 sync (uploads missing files to S3)
  Phase 4: Cloud indexing (triggers search index updates)
  Phase 5: Local indexing (updates local search index for development)

For automation/cron jobs, use without --interactive flag.
For manual runs, --interactive provides a guided configuration experience.
`);
}

/**
 * Parse command line arguments
 */
function parseArguments(): WorkflowConfig {
  const args = process.argv.slice(2);
  const config: WorkflowConfig = JSON.parse(JSON.stringify(getDefaultConfig()));
  
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else if (arg === '--interactive' || arg === '-i') {
      config.interactive = true;
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--skip-cloud-indexing') {
      config.skipCloudIndexing = true;
      config.phases.cloudIndexing = false;
    } else if (arg === '--skip-pre-sync') {
      config.phases.preSync = false;
    } else if (arg === '--skip-consistency-check') {
      config.phases.consistencyCheck = false;
    } else if (arg === '--skip-rss-retrieval') {
      config.phases.rssRetrieval = false;
    } else if (arg === '--skip-audio-processing') {
      config.phases.audioProcessing = false;
    } else if (arg === '--skip-s3-sync') {
      config.phases.s3Sync = false;
    } else if (arg === '--skip-local-indexing') {
      config.phases.localIndexing = false;
    } else if (arg.startsWith('--sites=')) {
      const sitesArg = arg.split('=')[1];
      if (sitesArg) {
        config.selectedSites = sitesArg.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    } else if (arg.startsWith('--sync-folders=')) {
      const foldersArg = arg.split('=')[1];
      if (foldersArg) {
        const folders = foldersArg.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const validFolders = folders.filter(f => ALL_SYNC_FOLDERS.includes(f));
        if (validFolders.length !== folders.length) {
          const invalidFolders = folders.filter(f => !ALL_SYNC_FOLDERS.includes(f));
          console.error(`❌ Invalid sync folders: ${invalidFolders.join(', ')}`);
          console.error(`Valid options: ${ALL_SYNC_FOLDERS.join(', ')}`);
          process.exit(1);
        }
        config.syncOptions.foldersToSync = validFolders;
      }
    }
  }
  
  return config;
}

/**
 * Configure workflow options interactively
 */
async function configureInteractively(config: WorkflowConfig, allSites: Site[]): Promise<WorkflowConfig> {
  console.log('\n🤖 Interactive Configuration');
  console.log('='.repeat(40));
  console.log('Configure your ingestion pipeline options:\n');

  // Site selection
  if (!config.selectedSites || config.selectedSites.length === 0) {
    const siteResponse = await prompts({
      type: 'select',
      name: 'siteSelection',
      message: 'Which sites would you like to process?',
      choices: [
        { title: 'All sites', value: 'all' },
        { title: 'Select specific sites', value: 'select' }
      ],
      initial: 0
    });

    if (siteResponse.siteSelection === 'select') {
      const specificSitesResponse = await prompts({
        type: 'multiselect',
        name: 'sites',
        message: 'Select sites to process:',
        choices: allSites.map(site => ({
          title: `${site.title} (${site.id})`,
          value: site.id,
          selected: false
        })),
        min: 1
      });

      if (specificSitesResponse.sites && specificSitesResponse.sites.length > 0) {
        config.selectedSites = specificSitesResponse.sites;
      }
    }
  }

  // Execution mode
  const executionResponse = await prompts({
    type: 'select',
    name: 'executionMode',
    message: 'Select execution mode:',
    choices: [
      { title: 'Full execution (default)', value: 'full' },
      { title: 'Dry run (show what would happen)', value: 'dry-run' }
    ],
    initial: 0
  });

  config.dryRun = executionResponse.executionMode === 'dry-run';

  // Phase selection
  const phaseResponse = await prompts({
    type: 'select',
    name: 'phaseSelection',
    message: 'Which phases would you like to run?',
    choices: [
      { title: 'All phases (recommended)', value: 'all' },
      { title: 'Select specific phases', value: 'select' }
    ],
    initial: 0
  });

  if (phaseResponse.phaseSelection === 'select') {
    const phaseChoices = [
      { title: 'Phase 0: S3-to-local pre-sync', value: 'preSync', selected: config.phases.preSync },
      { title: 'Phase 0.5: Sync consistency check', value: 'consistencyCheck', selected: config.phases.consistencyCheck },
      { title: 'Phase 1: RSS retrieval', value: 'rssRetrieval', selected: config.phases.rssRetrieval },
      { title: 'Phase 2: Audio processing', value: 'audioProcessing', selected: config.phases.audioProcessing },
      { title: 'Phase 3: S3 sync', value: 's3Sync', selected: config.phases.s3Sync },
      { title: 'Phase 4: Cloud indexing', value: 'cloudIndexing', selected: config.phases.cloudIndexing },
      { title: 'Phase 5: Local indexing', value: 'localIndexing', selected: config.phases.localIndexing }
    ];

    const selectedPhasesResponse = await prompts({
      type: 'multiselect',
      name: 'phases',
      message: 'Select phases to run:',
      choices: phaseChoices,
      min: 1
    });

    if (selectedPhasesResponse.phases) {
      // Reset all phases to false
      Object.keys(config.phases).forEach(phase => {
        (config.phases as any)[phase] = false;
      });
      // Enable selected phases
      selectedPhasesResponse.phases.forEach((phase: string) => {
        (config.phases as any)[phase] = true;
      });
    }
  }

  // Sync options (only if S3 sync phases are enabled)
  if (config.phases.preSync || config.phases.s3Sync) {
    const syncOptionsResponse = await prompts({
      type: 'select',
      name: 'configureSync',
      message: 'Configure S3 sync options?',
      choices: [
        { title: 'Use defaults (recommended)', value: 'defaults' },
        { title: 'Configure sync options', value: 'configure' }
      ],
      initial: 0
    });

    if (syncOptionsResponse.configureSync === 'configure') {
      // Folder selection
      const folderResponse = await prompts({
        type: 'multiselect',
        name: 'folders',
        message: 'Which folders should be synced?',
        choices: ALL_SYNC_FOLDERS.map(folder => ({
          title: folder,
          value: folder,
          selected: config.syncOptions.foldersToSync.includes(folder)
        })),
        min: 1
      });

      if (folderResponse.folders && folderResponse.folders.length > 0) {
        config.syncOptions.foldersToSync = folderResponse.folders;
      }
    }
  }

  // Cloud indexing options
  if (config.phases.cloudIndexing) {
    const indexingResponse = await prompts({
      type: 'confirm',
      name: 'enableCloudIndexing',
      message: 'Trigger cloud indexing lambdas? (recommended if files will be uploaded)',
      initial: true
    });

    config.skipCloudIndexing = !indexingResponse.enableCloudIndexing;
    config.phases.cloudIndexing = indexingResponse.enableCloudIndexing;
  }

  return config;
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
  localIndexingSuccess?: boolean;
  localIndexingDuration?: number;
  localIndexingEntriesProcessed?: number;
  errors: string[];
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
// Note: search-entries and search-index are excluded as they're managed by the indexing Lambda
const ALL_SYNC_FOLDERS = [
  'audio',
  'transcripts', 
  'episode-manifest',
  'rss'
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
 * Get lambda function name using the consistent naming pattern
 * This avoids terraform credential issues by using the known naming convention: srt-indexing-${siteId}
 */
async function getSiteIndexingLambdaName(siteId: string): Promise<string | null> {
  try {
    console.log(`🔍 Getting indexing lambda name for site: ${siteId}`);
    
    // Use the consistent naming pattern from terraform: srt-indexing-${siteId}
    const lambdaName = `srt-indexing-${siteId}`;
    
    console.log(`✅ Using indexing lambda name for ${siteId}: ${lambdaName}`);
    return lambdaName;
    
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
      conflictResolution: 'skip-existing', // Only download files that don't exist locally
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
        SITE_ID: siteId,
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
 * Run local indexing for a site (SRT indexing to update local search index)
 */
async function runLocalIndexingForSite(
  siteId: string
): Promise<{ success: boolean; duration: number; error?: string; entriesProcessed?: number }> {
  const startTime = Date.now();
  
  logProgress(`Running local indexing for ${siteId}`);
  
  return new Promise((resolve) => {
    try {
      // Load site-specific environment variables
      const siteEnvVars = loadSiteEnvVars(siteId, 'local');
      
      // Merge with current environment, giving priority to site-specific vars
      const envVars = {
        ...process.env,
        ...siteEnvVars,
        SITE_ID: siteId,
        FILE_STORAGE_ENV: 'local'  // Ensure we're using local storage for all operations
      };

             let stdout = '';
       let stderr = '';
       let lastProgressLine = '';
       let progressInterval: NodeJS.Timeout;
       
       // Set up progress indicator that updates every 5 seconds
       const showProgress = () => {
         const elapsed = Math.floor((Date.now() - startTime) / 1000);
         const baseMessage = `🔍 Processing local indexing for ${siteId}... (${elapsed}s)`;
         const progressMessage = lastProgressLine 
           ? `${baseMessage} | ${lastProgressLine}`
           : baseMessage;
         process.stdout.write(`\r${progressMessage}`.padEnd(120));
       };
       
       progressInterval = setInterval(showProgress, 5000);

       // Run the SRT indexing lambda locally using spawn 
       const child = spawn('tsx', [
         'packages/ingestion/srt-indexing-lambda/convert-srts-indexed-search.ts'
       ], {
         stdio: ['inherit', 'pipe', 'pipe'],
         env: envVars,
         cwd: process.cwd()
       });

       // Capture stdout silently and extract the most recent progress line
       child.stdout?.on('data', (data: Buffer) => {
         const output = data.toString();
         stdout += output;
         
         // Extract the most recent progress line for display
         const lines = output.split('\n').filter(line => line.trim());
         const progressLines = lines.filter(line => 
           line.includes('Progress:') && line.includes('SRT files processed')
         );
         
         if (progressLines.length > 0) {
           // Get the most recent progress line and clean it up
           const rawProgress = progressLines[progressLines.length - 1];
           // Extract just the essential info: "25% (261/1022), 105435 entries"
           const progressMatch = rawProgress.match(/(\d+)% of SRT files processed \((\d+)\/(\d+)\)/);
           const entriesMatch = rawProgress.match(/Collected (\d+) entries/);
           
           if (progressMatch) {
             const [, percent, current, total] = progressMatch;
             const entries = entriesMatch ? entriesMatch[1] : '';
             lastProgressLine = entries 
               ? `${percent}% (${current}/${total}), ${entries} entries`
               : `${percent}% (${current}/${total})`;
           }
         }
       });

       // Capture stderr silently 
       child.stderr?.on('data', (data: Buffer) => {
         const output = data.toString();
         stderr += output;
       });

      child.on('close', (code: number | null) => {
        // Clear progress indicator
        clearInterval(progressInterval);
        process.stdout.write('\r'.padEnd(100) + '\r');
        
        const duration = Date.now() - startTime;
        const success = code === 0;
        
        if (success) {
          // Try to extract entries processed count from output
          let entriesProcessed = 0;
          const entriesMatch = stdout.match(/📝 New Search Entries Added: (\d+)/);
          if (entriesMatch) {
            entriesProcessed = parseInt(entriesMatch[1], 10);
          }
          
          logSuccess(`Local indexing completed for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
          resolve({ success: true, duration, entriesProcessed });
        } else {
          const error = `Local indexing failed with exit code ${code}: ${stderr}`;
          logError(`Local indexing failed for ${siteId}: ${error}`);
          resolve({ success: false, duration, error });
        }
      });

      child.on('error', (error: Error) => {
        // Clear progress indicator on error
        clearInterval(progressInterval);
        process.stdout.write('\r'.padEnd(100) + '\r');
        
        const duration = Date.now() - startTime;
        logError(`Error running local indexing for ${siteId}: ${error.message}`);
        resolve({ success: false, duration, error: error.message });
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logError(`Error setting up local indexing for ${siteId}: ${error.message}`);
      resolve({ success: false, duration, error: error.message });
    }
  });
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🤖 Ingestion Pipeline - Comprehensive Podcast Processing');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  
  // Parse command line arguments
  let config = parseArguments();
  
  // Handle help flag
  if (config.help) {
    displayHelp();
    process.exit(0);
  }
  
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
  
  // Handle interactive configuration
  if (config.interactive) {
    config = await configureInteractively(config, allSites);
  } else if (!config.interactive && process.stdout.isTTY) {
    // Show interactive option hint for manual runs (when connected to TTY)
    console.log('💡 Tip: Add --interactive flag for guided configuration options');
    console.log('   Or use --help to see all available CLI flags\n');
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
  
  console.log(`\n📍 Found ${sites.length} site(s) to process:`);
  sites.forEach((site: Site) => {
    console.log(`   - ${site.id} (${site.title})`);
  });
  
  // Display configuration summary
  console.log('\n⚙️  Configuration Summary:');
  console.log(`   Execution mode: ${config.dryRun ? 'DRY RUN (preview only)' : 'Full execution'}`);
  console.log(`   Enabled phases:`);
  if (config.phases.preSync) console.log(`     ✅ Phase 0: S3-to-local pre-sync`);
  if (config.phases.consistencyCheck) console.log(`     ✅ Phase 0.5: Sync consistency check`);
  if (config.phases.rssRetrieval) console.log(`     ✅ Phase 1: RSS retrieval`);
  if (config.phases.audioProcessing) console.log(`     ✅ Phase 2: Audio processing`);
  if (config.phases.s3Sync) console.log(`     ✅ Phase 3: S3 sync`);
  if (config.phases.cloudIndexing) console.log(`     ✅ Phase 4: Cloud indexing`);
  if (config.phases.localIndexing) console.log(`     ✅ Phase 5: Local indexing`);
  console.log(`   Sync folders: ${config.syncOptions.foldersToSync.join(', ')}`);
  
  if (config.dryRun) {
    console.log('\n🔍 DRY RUN MODE: This is a preview of what would happen');
    console.log('   No actual changes will be made to files or S3');
    console.log('   No cloud lambdas will be triggered\n');
  }
  
  const results: SiteProcessingResult[] = [];
  const overallStartTime = Date.now();
  
  // Initialize results for all sites
  for (const site of sites) {
    results.push({
      siteId: site.id,
      siteTitle: site.title,
      s3PreSyncSuccess: undefined,
      s3PreSyncDuration: undefined,
      s3PreSyncFilesDownloaded: undefined,
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
      errors: []
    });
  }

  // Phase 0: Pre-sync all S3 content to local storage
  if (config.phases.preSync) {
    console.log('\n' + '='.repeat(60));
    console.log('📡 Phase 0: Pre-sync all S3 content to local storage');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would download existing S3 files to local storage (skip existing)');
    } else {
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const preSyncResult = await performS3ToLocalPreSync(site.id, credentials);
        
        results[i].s3PreSyncSuccess = preSyncResult.success;
        results[i].s3PreSyncDuration = preSyncResult.duration;
        results[i].s3PreSyncFilesDownloaded = preSyncResult.totalFilesTransferred;
        
        if (preSyncResult.error) {
          results[i].errors.push(preSyncResult.error);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 0: Pre-sync (disabled)');
  }
  
  // Phase 0.5: Check sync consistency to identify files that need uploading
  if (config.phases.consistencyCheck) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Phase 0.5: Check sync consistency (local vs S3)');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would compare local vs S3 file inventories');
    } else {
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
    }
  } else {
    console.log('\n⏭️  Skipping Phase 0.5: Consistency check (disabled)');
  }
  
  // Phase 1: RSS Retrieval for all sites
  if (config.phases.rssRetrieval) {
    console.log('\n' + '='.repeat(60));
    console.log('📡 Phase 1: RSS Retrieval for all sites');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would download new episodes from RSS feeds');
    } else {
      for (const site of sites) {
        const rssResult = await runCommandWithSiteContext(
          site.id,
          'pnpm',
          ['--filter', '@browse-dot-show/rss-retrieval-lambda', 'run', 'run:local'],
          'RSS retrieval'
        );
        
        const siteIndex = sites.indexOf(site);
        results[siteIndex].rssRetrievalSuccess = rssResult.success;
        results[siteIndex].rssRetrievalDuration = rssResult.duration;
        results[siteIndex].newAudioFilesDownloaded = rssResult.newAudioFiles || 0;
        
        if (rssResult.error) {
          results[siteIndex].errors.push(rssResult.error);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 1: RSS Retrieval (disabled)');
  }
  
  // Phase 2: Audio Processing for all sites
  if (config.phases.audioProcessing) {
    console.log('\n' + '='.repeat(60));
    console.log('🎵 Phase 2: Audio Processing for all sites');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would transcribe new audio files using Whisper');
    } else {
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
    }
  } else {
    console.log('\n⏭️  Skipping Phase 2: Audio Processing (disabled)');
  }
  
  // Phase 3: Comprehensive S3 sync for ALL missing files (ENHANCED - Phase 4.3)
  if (config.phases.s3Sync) {
    console.log('\n' + '='.repeat(60));
    console.log('☁️  Phase 3 (Enhanced): Comprehensive S3 sync for ALL missing files');
    console.log('='.repeat(60));
    
    const sitesNeedingSync = results.filter(result => 
      result.syncConsistencyCheckSuccess && 
      (result.filesToUpload || 0) > 0
    );
    
    if (config.dryRun) {
      console.log(`🔍 DRY RUN: Would upload ${sitesNeedingSync.length} site(s) with missing files to S3`);
      sitesNeedingSync.forEach(result => {
        console.log(`   - ${result.siteId}: ${result.filesToUpload} files`);
      });
    } else {
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
    }
  } else {
    console.log('\n⏭️  Skipping Phase 3: S3 sync (disabled)');
  }
  
  // Phase 4: Trigger Cloud Indexing for sites with S3 uploads (ENHANCED - Phase 4.4)
  if (config.phases.cloudIndexing && !config.skipCloudIndexing) {
    console.log('\n' + '='.repeat(60));
    console.log('⚡ Phase 4 (Enhanced): Trigger Cloud Indexing for sites with S3 uploads');
    console.log('='.repeat(60));
    
    const sitesWithSuccessfulSync = results.filter(result => 
      (result.s3SyncTotalFilesUploaded || 0) > 0  // Trigger indexing if ANY files were uploaded
    );
    
    if (config.dryRun) {
      console.log(`🔍 DRY RUN: Would trigger cloud indexing for ${sitesWithSuccessfulSync.length} site(s) with S3 uploads`);
      sitesWithSuccessfulSync.forEach(result => {
        console.log(`   - ${result.siteId}: ${result.s3SyncTotalFilesUploaded} files uploaded`);
      });
    } else {
      if (sitesWithSuccessfulSync.length === 0) {
        console.log('ℹ️  No sites uploaded files to S3. Skipping cloud indexing phase.');
      } else {
        console.log(`📝 Found ${sitesWithSuccessfulSync.length} site(s) with S3 uploads:${sitesWithSuccessfulSync.map(r => ` ${r.siteId} (${r.s3SyncTotalFilesUploaded} files)`).join(',')}`);
        
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
    }
  } else {
    console.log('\n⏭️  Skipping Phase 4: Cloud indexing (disabled)');
  }
  
  // Phase 5: Local Indexing for local development
  if (config.phases.localIndexing) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Phase 5: Local Indexing (update local search index)');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would update local search indexes for all sites');
    } else {
      console.log('ℹ️  Updating local search indexes for all sites (for local development)...');
      
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        
        const localIndexingResult = await runLocalIndexingForSite(site.id);
        
        results[i].localIndexingSuccess = localIndexingResult.success;
        results[i].localIndexingDuration = localIndexingResult.duration;
        results[i].localIndexingEntriesProcessed = localIndexingResult.entriesProcessed || 0;
        
        if (localIndexingResult.error) {
          results[i].errors.push(`Local indexing error: ${localIndexingResult.error}`);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 5: Local indexing (disabled)');
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
    const localIndexingStatus = result.localIndexingSuccess === true ? '✅' : 
                                result.localIndexingSuccess === false ? '❌' : 
                                '⚪'; // Not run
    const totalDuration = (result.s3PreSyncDuration || 0) + (result.syncConsistencyCheckDuration || 0) + 
                         result.rssRetrievalDuration + result.audioProcessingDuration + 
                         (result.s3SyncDuration || 0) + (result.indexingTriggerDuration || 0) + 
                         (result.localIndexingDuration || 0);
    
    console.log(`\n   ${result.siteId} (${result.siteTitle}):`);
    console.log(`      S3 Pre-Sync: ${preSyncStatus} (${((result.s3PreSyncDuration || 0) / 1000).toFixed(1)}s) - ${result.s3PreSyncFilesDownloaded || 0} files`);
    console.log(`      Sync Check: ${consistencyStatus} (${((result.syncConsistencyCheckDuration || 0) / 1000).toFixed(1)}s) - ${result.filesToUpload || 0} to upload, ${result.filesInSync || 0} in sync`);
    console.log(`      RSS Retrieval: ${rssStatus} (${(result.rssRetrievalDuration / 1000).toFixed(1)}s)`);
    console.log(`      Audio Processing: ${audioStatus} (${(result.audioProcessingDuration / 1000).toFixed(1)}s)`);
    console.log(`      S3 Upload: ${s3SyncStatus} ${(result.filesToUpload || 0) > 0 ? `(${((result.s3SyncDuration || 0) / 1000).toFixed(1)}s) - ${result.s3SyncTotalFilesUploaded || 0} files` : '(not needed)'}`);
    console.log(`      Cloud Indexing: ${indexingStatus} ${(result.s3SyncTotalFilesUploaded || 0) > 0 ? `(${((result.indexingTriggerDuration || 0) / 1000).toFixed(1)}s)` : '(not needed)'}`);
    console.log(`      Local Indexing: ${localIndexingStatus} (${((result.localIndexingDuration || 0) / 1000).toFixed(1)}s) - ${result.localIndexingEntriesProcessed || 0} entries`);
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
  const successfulLocalIndexingCount = results.filter(r => r.localIndexingSuccess === true).length;
  const totalLocalIndexingAttempts = results.filter(r => r.localIndexingSuccess !== undefined).length;
  const totalPreSyncFilesDownloaded = results.reduce((sum, r) => sum + (r.s3PreSyncFilesDownloaded || 0), 0);
  const totalFilesUploaded = results.reduce((sum, r) => sum + (r.s3SyncTotalFilesUploaded || 0), 0);
  const totalAudioFilesDownloaded = results.reduce((sum, r) => sum + r.newAudioFilesDownloaded, 0);
  const totalEpisodesTranscribed = results.reduce((sum, r) => sum + r.newEpisodesTranscribed, 0);
  const totalLocalIndexingEntriesProcessed = results.reduce((sum, r) => sum + (r.localIndexingEntriesProcessed || 0), 0);
  
  console.log('\n📊 Overall Statistics:');
  console.log(`   Sites processed: ${results.length}`);
  console.log(`   Pre-Sync success rate: ${successfulPreSyncCount}/${results.length} (${((successfulPreSyncCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Consistency Check success rate: ${successfulConsistencyCheckCount}/${results.length} (${((successfulConsistencyCheckCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   RSS Retrieval success rate: ${successfulRssCount}/${results.length} (${((successfulRssCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Audio Processing success rate: ${successfulAudioCount}/${results.length} (${((successfulAudioCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Sites with files to upload: ${sitesWithFilesToUpload}`);
  console.log(`   S3 Upload success rate: ${successfulS3SyncCount}/${sitesWithFilesToUpload} (${sitesWithFilesToUpload > 0 ? ((successfulS3SyncCount / sitesWithFilesToUpload) * 100).toFixed(1) : 0}%)`);
  console.log(`   Cloud Indexing success rate: ${successfulIndexingCount}/${sitesTriggeredIndexing} (${sitesTriggeredIndexing > 0 ? ((successfulIndexingCount / sitesTriggeredIndexing) * 100).toFixed(1) : 0}%)`);
  console.log(`   Local Indexing success rate: ${successfulLocalIndexingCount}/${results.length} (${((successfulLocalIndexingCount / totalLocalIndexingAttempts) * 100).toFixed(1)}%)`);
  console.log(`   📥 Total Files Downloaded from S3: ${totalPreSyncFilesDownloaded}`);
  console.log(`   📤 Total Files Uploaded to S3: ${totalFilesUploaded}`);
  console.log(`   📥 Total Audio Files Downloaded: ${totalAudioFilesDownloaded}`);
  console.log(`   🎤 Total Episodes Transcribed: ${totalEpisodesTranscribed}`);
  console.log(`   🔍 Total Local Index Entries Processed: ${totalLocalIndexingEntriesProcessed}`);
  
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